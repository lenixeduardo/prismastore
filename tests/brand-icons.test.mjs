import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const iconSpecs = [
  ['favicon-16.b64', 16],
  ['favicon-32.b64', 32],
  ['apple-touch-icon.b64', 180],
  ['icon-192.b64', 192],
  ['icon-512.b64', 512],
];

function decodePng(path) {
  const encoded = readFileSync(path, 'utf8').trim();
  return Buffer.from(encoded, 'base64');
}

function pngSize(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('approved PrismaStore logo has exact generated PNG variants for browser and PWA install', () => {
  for (const [file, size] of iconSpecs) {
    const path = resolve(root, 'icons/generated', file);
    assert.equal(existsSync(path), true, `${file} should exist`);
    if (!existsSync(path)) continue;
    assert.deepEqual(pngSize(decodePng(path)), { width: size, height: size });
  }
});

test('manifest installs the approved prism artwork as scalable PWA icons', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(manifest.icons.map(({ src, sizes, type, purpose }) => ({ src, sizes, type, purpose })), [
    { src: '/icons/icon-192.svg?v=20260918-prism-icon-1', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
    { src: '/icons/icon-512.svg?v=20260918-prism-icon-1', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
  ]);

  for (const file of ['icon-192.svg', 'icon-512.svg']) {
    const source = readFileSync(resolve(root, 'icons', file), 'utf8');
    assert.match(source, /viewBox="0 0 512 512"/);
    assert.match(source, /facetA/);
    assert.match(source, /#00ec8c/);
  }
});

test('service worker cache is bumped and includes both raster fallbacks and prism SVG icons', () => {
  const source = readFileSync(resolve(root, 'service-worker.js'), 'utf8');
  assert.match(source, /prismastore-shell-v0\.9\.2/);
  assert.match(source, /\/icons\/icon-192\.png/);
  assert.match(source, /\/icons\/icon-512\.png/);
  assert.match(source, /\/icons\/icon-192\.svg/);
  assert.match(source, /\/icons\/icon-512\.svg/);
});
