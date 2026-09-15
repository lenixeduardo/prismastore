import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function assetPath(name) {
  return fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function jpegSize(buffer) {
  assert.equal(buffer[0], 0xff);
  assert.equal(buffer[1], 0xd8);
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error('JPEG dimensions not found');
}

const approved = [
  {
    source: 'prismastore-welcome.b64', output: 'prismastore-welcome.jpg',
    sha: '4642ef0ea8dc6326d22f618307a4914ecb6188dfe1d0212dba6e1e06bd3f415e',
    width: 1536, height: 864, minBytes: 90_000,
  },
  {
    source: 'prismastore-catalog.b64', output: 'prismastore-catalog.jpg',
    sha: 'f364d07479ab87d7c9868411c613e887ef47e459fcfd969610dd8655a26f5522',
    width: 1122, height: 1402, minBytes: 125_000,
  },
  {
    source: 'prismastore-order-finished.b64', output: 'prismastore-order-finished.jpg',
    sha: '035ab0c8b40a9524e06a84e9dc31a17cfe5228d31a414fb3e8b3201f62baa924',
    width: 1122, height: 1402, minBytes: 85_000,
  },
];

test('versioned chatbot media sources decode to the approved reviewed artwork', () => {
  for (const asset of approved) {
    const path = assetPath(asset.source);
    assert.equal(existsSync(path), true, `${asset.source} must exist`);
    const encoded = readFileSync(path, 'utf8').replace(/\s+/g, '');
    const buffer = Buffer.from(encoded, 'base64');
    assert.equal(sha256(buffer), asset.sha, `${asset.source} hash changed`);
    assert.deepEqual(jpegSize(buffer), { width: asset.width, height: asset.height }, `${asset.source} dimensions changed`);
    assert.ok(buffer.length >= asset.minBytes, `${asset.source} looks like a placeholder or truncated file`);
  }
});

test('runtime reconstructs and sends the three approved chatbot images', () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  for (const asset of approved) {
    assert.match(source, new RegExp(asset.source.replace('.', '\\.')));
    assert.match(source, new RegExp(asset.output.replace('.', '\\.')));
  }
  assert.doesNotMatch(source, /welcomeMediaPath:\s*join\(assetsDir/);
  assert.doesNotMatch(source, /catalogMediaPath:\s*join\(assetsDir/);
});
