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
