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

function pngSize(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
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
    name: 'prismastore-welcome.jpg',
    sha: 'fb7d9207d6b874952bfec91dfee76b39933a647daed0f7f03b095052664e98c3',
    width: 1536,
    height: 864,
    size: jpegSize,
  },
  {
    name: 'prismastore-catalog.png',
    sha: '01a987292fde50dabd60f39caa8776ed0912e8e5f3d71cd80ea1721328a99dca',
    width: 1122,
    height: 1402,
    size: pngSize,
  },
  {
    name: 'prismastore-order-finished.jpg',
    sha: '6c6f1836a86e5abdd61af8738ade3b1af29f80e07012ea614a55eada2584ad43',
    width: 1122,
    height: 1402,
    size: jpegSize,
  },
];

test('approved chatbot media assets are exact reviewed files', () => {
  for (const asset of approved) {
    const path = assetPath(asset.name);
    assert.equal(existsSync(path), true, `${asset.name} must exist`);
    const buffer = readFileSync(path);
    assert.equal(sha256(buffer), asset.sha, `${asset.name} hash changed`);
    assert.deepEqual(asset.size(buffer), { width: asset.width, height: asset.height }, `${asset.name} dimensions changed`);
    assert.ok(buffer.length > 250_000, `${asset.name} looks like a placeholder or truncated file`);
  }
});

test('runtime uses approved welcome catalog and finalization files directly', () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(source, /prismastore-welcome\.jpg/);
  assert.match(source, /prismastore-catalog\.png/);
  assert.match(source, /prismastore-order-finished\.jpg/);
  assert.doesNotMatch(source, /prismastore-order-finished\.b64/);
});
