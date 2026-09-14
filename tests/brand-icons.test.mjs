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

test('manifest installs the PNG brand icons instead of the old SVG wrapper icons', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual(manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })), [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  ]);
});

test('service worker cache is bumped and includes the corrected PNG icon endpoints', () => {
  const source = readFileSync(resolve(root, 'service-worker.js'), 'utf8');
  assert.match(source, /prismastore-shell-v0\.9\.2/);
  assert.match(source, /\/icons\/icon-192\.png/);
  assert.match(source, /\/icons\/icon-512\.png/);
});
