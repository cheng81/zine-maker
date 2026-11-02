import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/imageCrop.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { isValidImageCrop, toKonvaImageCrop } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('missing and malformed crops preserve full-image rendering', () => {
  for (const crop of [undefined, null, {}, 'crop',
    { x: NaN, y: 0, width: 1, height: 1 },
    { x: 0, y: Infinity, width: 1, height: 1 },
    { x: -0.1, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 },
    { x: 0, y: 0, width: 1, height: -1 },
    { x: 0.5, y: 0, width: 0.6, height: 1 },
    { x: 0, y: 0.5, width: 1, height: 0.6 },
  ]) {
    assert.equal(isValidImageCrop(crop), false);
    assert.equal(toKonvaImageCrop(crop, 1001, 701), undefined);
  }
});

test('adjacent halves meet exactly, including odd source dimensions', () => {
  const left = { x: 0, y: 0, width: 0.5, height: 1 };
  const right = { x: 0.5, y: 0, width: 0.5, height: 1 };
  assert.deepEqual(toKonvaImageCrop(left, 1001, 701), { x: 0, y: 0, width: 500.5, height: 701 });
  const pixels = toKonvaImageCrop(right, 1001, 701);
  assert.equal(pixels.x, toKonvaImageCrop(left, 1001, 701).width);
  assert.equal(pixels.x + pixels.width, 1001);
  assert.deepEqual(toKonvaImageCrop(JSON.parse(JSON.stringify(right)), 1001, 701), pixels);
});

test('full-image and inset crops use source dimensions', () => {
  assert.deepEqual(toKonvaImageCrop({ x: 0, y: 0, width: 1, height: 1 }, 800, 600),
    { x: 0, y: 0, width: 800, height: 600 });
  const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  assert.deepEqual(toKonvaImageCrop(crop, 800, 600), { x: 200, y: 150, width: 400, height: 300 });
  for (const size of [0, -1, NaN, Infinity]) {
    assert.equal(toKonvaImageCrop(crop, size, 600), undefined);
    assert.equal(toKonvaImageCrop(crop, 800, size), undefined);
  }
});
