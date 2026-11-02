import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { createPinia, setActivePinia } from 'pinia';

// Load application TypeScript without a browser; replace only IndexedDB persistence.
const modules = new Map();
const persistenceUrl = `data:text/javascript;base64,${Buffer.from(
  'export let saved; export async function saveProject(project) { saved = JSON.parse(JSON.stringify(project)); }',
).toString('base64')}`;
async function loadModule(path) {
  if (modules.has(path)) return modules.get(path);
  const source = await readFile(new URL(`../src/${path}.ts`, import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  for (const match of [...outputText.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const specifier = match[1];
    const url = specifier === '@/utils/persistence' ? persistenceUrl
      : specifier.startsWith('@/') ? await loadModule(specifier.slice(2)) : import.meta.resolve(specifier);
    outputText = outputText.replace(match[0], `from ${JSON.stringify(url)}`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  modules.set(path, url);
  return url;
}
const { useProjectStore } = await import(await loadModule('stores/project'));
const { createSpreadCrops, findSpreadMembers, getValidSpread } = await import(await loadModule('utils/imageSpread'));

function fixture({ pageCanvas = true } = {}) {
  setActivePinia(createPinia());
  const store = useProjectStore();
  const template = {
    id: 'test', pageCount: 4,
    ...(pageCanvas ? { pageCanvas: { width: 300, height: 400 } } : {}),
    printLayout: { pagePositions: Array.from({ length: 4 }, (_, i) => ({ pageNumber: i + 1, width: 300, height: 400 })) },
  };
  store.createNewProject('Test', template);
  const content = {
    id: 'source', type: 'image', x: 20, y: 30, width: 100, height: 80, rotation: 15, zIndex: 10,
    properties: { src: '', assetId: 7, opacity: 0.7, alt: 'Landscape', originalWidth: 1001, originalHeight: 701 },
  };
  store.currentProject.pages[1].content.push(structuredClone(content));
  store.currentProject.assetIds = [7];
  return { store, original: content };
}

test('centered cover crops split wide, tall and exact-fit images at one boundary', () => {
  for (const [w, h] of [[2400, 600], [600, 2400], [600, 400], [1001, 701]]) {
    const { left, right } = createSpreadCrops(w, h, 300, 400);
    assert.equal(left.x + left.width, right.x);
    assert.equal(left.y, right.y);
    assert.equal(left.width, right.width);
    assert.ok(Math.abs((left.width * 2 * w) / (left.height * h) - 1.5) < 1e-12);
    assert.ok(Math.abs(left.x - (1 - right.x - right.width)) < 1e-12);
    assert.ok(left.width * 2 === 1 || left.height === 1);
  }
  assert.equal(createSpreadCrops(0, 600, 300, 400), null);
});

test('previous and next page creation, removal and history are atomic', async () => {
  for (const partner of ['page-1', 'page-3']) {
    const { store, original } = fixture();
    const id = store.createImageSpread('page-2', 'source', partner);
    assert.ok(id);
    const pair = getValidSpread(store.currentProject, id);
    assert.ok(pair);
    assert.equal(pair.left.properties.assetId, 7);
    assert.equal(pair.right.properties.opacity, 0.7);
    assert.equal(pair.left.content.width, 300);
    assert.equal(pair.right.content.height, 400);
    assert.equal(pair.left.content.rotation, 0);
    store.undo();
    assert.deepEqual(JSON.parse(JSON.stringify(store.currentProject.pages[1].content)), [original]);
    assert.equal(findSpreadMembers(store.currentProject, id).length, 0);
    assert.equal(store.canUndo, false);
    store.redo();
    assert.ok(getValidSpread(store.currentProject, id));
    await store.manualSave();
    const { saved } = await import(persistenceUrl);
    store.loadProject(saved);
    assert.ok(getValidSpread(store.currentProject, id));
    assert.equal(store.removeImageSpread(id), true);
    assert.equal(findSpreadMembers(store.currentProject, id).length, 0);
    store.undo();
    assert.ok(getValidSpread(store.currentProject, id));
    store.redo();
    assert.equal(findSpreadMembers(store.currentProject, id).length, 0);
  }
});

test('invalid partners and occupied pages leave state and history unchanged', () => {
  const { store } = fixture({ pageCanvas: false });
  const before = JSON.stringify(store.currentProject);
  for (const partner of ['missing', 'page-2', 'page-4']) {
    assert.equal(store.createImageSpread('page-2', 'source', partner), null);
  }
  assert.equal(store.createImageSpread('missing', 'source', 'page-1'), null);
  assert.equal(store.createImageSpread('page-2', 'missing', 'page-1'), null);
  assert.equal(JSON.stringify(store.currentProject), before);
  assert.equal(store.canUndo, false);
  store.currentProject.template.printLayout.pagePositions[2].width = 301;
  assert.equal(store.createImageSpread('page-2', 'source', 'page-3'), null);
  const id = store.createImageSpread('page-2', 'source', 'page-1');
  assert.ok(id);
  assert.equal(store.createImageSpread('page-2', 'source', 'page-3'), null);
  store.currentProject.pages[2].content.push({
    id: 'other', type: 'image', properties: { assetId: 7, originalWidth: 1001, originalHeight: 701 },
  });
  assert.equal(store.createImageSpread('page-3', 'other', 'page-2'), null);
});

test('reordering unlinks separated or reversed pairs and undo restores them', () => {
  for (const destination of [0, 3]) {
    const { store } = fixture();
    const id = store.createImageSpread('page-2', 'source', 'page-3');
    const crop = JSON.parse(JSON.stringify(getValidSpread(store.currentProject, id).left.properties.crop));
    store.setCurrentPage(1);
    store.reorderPages(2, destination);
    assert.equal(findSpreadMembers(store.currentProject, id).length, 0);
    assert.deepEqual(store.currentPage.content[0].properties.crop, crop);
    store.undo();
    assert.ok(getValidSpread(store.currentProject, id));
    store.redo();
    assert.equal(findSpreadMembers(store.currentProject, id).length, 0);
  }
  const { store } = fixture();
  const id = store.createImageSpread('page-2', 'source', 'page-3');
  store.reorderPages(0, 3);
  assert.ok(getValidSpread(store.currentProject, id));
});

test('first and last pages accept their only adjacent partner', () => {
  for (const [sourceIndex, partner] of [[0, 'page-2'], [3, 'page-3']]) {
    const { store, original } = fixture();
    store.currentProject.pages[1].content = [];
    store.currentProject.pages[sourceIndex].content.push(original);
    // Existing ordinary content does not occupy a spread slot.
    const partnerPage = store.currentProject.pages.find(page => page.id === partner);
    partnerPage.content.push({ ...structuredClone(original), id: 'ordinary' });
    const id = store.createImageSpread(`page-${sourceIndex + 1}`, 'source', partner);
    assert.ok(getValidSpread(store.currentProject, id));
    assert.ok(partnerPage.content.some(content => content.id === 'ordinary'));
    store.removeImageSpread(id);
    assert.deepEqual(partnerPage.content.map(content => content.id), ['ordinary']);
  }
});

test('validation rejects orphaned, duplicate, mismatched and misaligned pairs', () => {
  const { store } = fixture();
  const id = store.createImageSpread('page-2', 'source', 'page-3');
  const snapshot = JSON.stringify(store.currentProject);
  const mutations = [
    pair => { pair.right.page.content = []; },
    pair => { pair.right.page.content.push(structuredClone(JSON.parse(JSON.stringify(pair.right.content)))); },
    pair => { pair.right.properties.assetId = 8; },
    pair => { pair.right.properties.spreadSide = 'left'; },
    pair => { pair.right.content.x = 1; },
    pair => { pair.right.properties.crop.x += 0.01; },
  ];
  for (const mutate of mutations) {
    store.loadProject(JSON.parse(snapshot));
    mutate(getValidSpread(store.currentProject, id));
    assert.equal(getValidSpread(store.currentProject, id), null);
  }
});

function linkedFixture(side) {
  const { store } = fixture();
  const id = store.createImageSpread('page-2', 'source', 'page-3');
  const member = getValidSpread(store.currentProject, id)[side];
  store.setCurrentPage(store.currentProject.pages.indexOf(member.page));
  return { store, id, contentId: member.content.id };
}

test('shared properties synchronize from either half in one undoable action', () => {
  for (const side of ['left', 'right']) {
    const { store, id, contentId } = linkedFixture(side);
    const before = JSON.stringify(store.currentProject.pages);
    store.updateContent(contentId, { properties: { alt: 'Shared caption', opacity: 0.3, filters: 'sepia(100%)' } });
    for (const { properties } of findSpreadMembers(store.currentProject, id)) {
      assert.equal(properties.alt, 'Shared caption');
      assert.equal(properties.opacity, 0.3);
      assert.equal(properties.filters, 'sepia(100%)');
      assert.equal(properties.assetId, 7);
    }
    store.undo();
    assert.equal(JSON.stringify(store.currentProject.pages), before);
    store.redo();
    assert.equal(getValidSpread(store.currentProject, id).left.properties.opacity, 0.3);
    store.updateContent(contentId, { properties: { filters: undefined } });
    assert.ok(findSpreadMembers(store.currentProject, id).every(member => member.properties.filters === undefined));
  }
});

test('source replacement computes compatible crops for wider and narrower images', () => {
  for (const side of ['left', 'right']) {
    for (const [width, height, src, assetId] of [[2400, 600, '', 8], [600, 2400, 'test:data', undefined]]) {
      const { store, id, contentId } = linkedFixture(side);
      const before = JSON.stringify(store.currentProject.pages);
      store.updateContent(contentId, { height: 123, properties: {
        src, assetId, originalWidth: width, originalHeight: height, alt: 'Replacement',
      } });
      const pair = getValidSpread(store.currentProject, id);
      assert.ok(pair);
      assert.equal(pair.left.properties.src, src);
      assert.equal(pair.right.properties.assetId, assetId);
      assert.equal(pair.right.properties.originalWidth, width);
      assert.equal(pair.left.properties.originalHeight, height);
      assert.equal(pair.right.content.height, 400);
      const crops = createSpreadCrops(width, height, 300, 400);
      assert.deepEqual(pair.left.properties.crop, crops.left);
      assert.deepEqual(pair.right.properties.crop, crops.right);
      store.undo();
      assert.equal(JSON.stringify(store.currentProject.pages), before);
      store.redo();
      assert.ok(getValidSpread(store.currentProject, id));
    }
  }
});

test('crop pan and zoom from either half preserve one seam and reset recenters both', () => {
  for (const side of ['left', 'right']) {
    const { store, id, contentId } = linkedFixture(side);
    // A smaller window with the same combined aspect ratio, moved within the source.
    const original = getValidSpread(store.currentProject, id).left.properties.crop;
    const left = { x: 0.1, y: 0.1, width: original.width / 2, height: original.height / 2 };
    const right = { ...left, x: left.x + left.width };
    store.updateContent(contentId, { properties: { crop: side === 'left' ? left : right, opacity: 0.2, filters: 'blur(2px)' } });
    let pair = getValidSpread(store.currentProject, id);
    assert.ok(pair);
    assert.ok(Math.abs(pair.left.properties.crop.x - left.x) < 1e-12);
    assert.equal(pair.left.properties.crop.x + pair.left.properties.crop.width, pair.right.properties.crop.x);
    const beforeReset = JSON.stringify(store.currentProject.pages);
    store.resetImage(contentId);
    pair = getValidSpread(store.currentProject, id);
    assert.deepEqual(pair.left.properties.crop, createSpreadCrops(1001, 701, 300, 400).left);
    assert.deepEqual(pair.right.properties.crop, createSpreadCrops(1001, 701, 300, 400).right);
    assert.equal(pair.left.properties.opacity, 1);
    assert.equal(pair.right.properties.filters, undefined);
    store.undo();
    assert.equal(JSON.stringify(store.currentProject.pages), beforeReset);
    store.redo();
    assert.equal(getValidSpread(store.currentProject, id).right.properties.opacity, 1);
  }
});

test('independent transforms, broken crops and dimensionless replacement are rejected', () => {
  for (const side of ['left', 'right']) {
    const { store, id, contentId } = linkedFixture(side);
    const before = JSON.stringify(store.currentProject.pages);
    for (const updates of [
      { x: 20, y: 50, width: 100, height: 100, rotation: 90, type: 'shape', id: 'changed' },
      { properties: { spreadId: 'other', spreadSide: side === 'left' ? 'right' : 'left', lockAspectRatio: true } },
      { properties: { crop: undefined } },
      { properties: { crop: { x: 0.9, y: 0, width: 0.1, height: 1 } } },
      { properties: { assetId: 99 } },
      { properties: { src: 'replacement', assetId: undefined, originalWidth: 0, originalHeight: 600 } },
    ]) {
      store.updateContent(contentId, updates);
      assert.equal(JSON.stringify(store.currentProject.pages), before);
      assert.ok(getValidSpread(store.currentProject, id));
    }
    store.undo(); // Rejected edits must not add history entries.
    assert.equal(findSpreadMembers(store.currentProject, id).length, 0);
  }
});

test('delete, unlink and duplicate have explicit behavior from either half', () => {
  for (const side of ['left', 'right']) {
    const { store, id, contentId } = linkedFixture(side);
    const before = JSON.stringify(store.currentProject.pages);
    store.selectContent(contentId);
    store.deleteContent(contentId);
    assert.equal(findSpreadMembers(store.currentProject, id).length, 0);
    assert.deepEqual(store.selectedContentIds, []);
    store.undo();
    assert.equal(JSON.stringify(store.currentProject.pages), before);
    store.redo();
    assert.equal(findSpreadMembers(store.currentProject, id).length, 0);
    store.undo();
    store.duplicateContent(contentId);
    const duplicate = store.currentPage.content.find(content => content.id !== contentId);
    assert.equal(duplicate.properties.spreadId, undefined);
    assert.equal(duplicate.properties.spreadSide, undefined);
    assert.deepEqual(duplicate.properties.crop, store.getContentById(contentId).properties.crop);
    assert.equal(duplicate.x, 20);
    assert.ok(getValidSpread(store.currentProject, id));
    store.undo();
    assert.equal(JSON.stringify(store.currentProject.pages), before);
    store.redo();
    assert.equal(store.currentPage.content.length, 2);
    store.undo();
    store.unlinkImageSpread(id);
    assert.equal(findSpreadMembers(store.currentProject, id).length, 0);
    assert.ok(store.currentPage.content[0].properties.crop);
    store.undo();
    assert.ok(getValidSpread(store.currentProject, id));
    store.redo();
    store.updateContent(contentId, { x: 40, width: 120 });
    assert.equal(store.getContentById(contentId).x, 40);
    assert.equal(store.getContentById(contentId).width, 120);
  }
});

test('ordinary image transforms, reset, duplicate and deletion retain existing behavior', () => {
  const { store, original } = fixture();
  store.setCurrentPage(1);
  store.updateContent('source', { x: 42, width: 130 });
  assert.equal(store.getContentById('source').x, 42);
  store.resetImage('source');
  assert.equal(store.getContentById('source').properties.opacity, 1);
  assert.equal(store.getContentById('source').width, 130);
  store.duplicateContent('source');
  assert.equal(store.currentPage.content.length, 2);
  store.deleteContent('source');
  assert.equal(store.currentPage.content.length, 1);
  for (let i = 0; i < 4; i++) store.undo();
  assert.deepEqual(JSON.parse(JSON.stringify(store.currentPage.content)), [original]);
});
