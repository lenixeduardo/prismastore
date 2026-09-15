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
    name: 'prismastore-welcome.jpg',
    sha: '1389c95080338a68455880fea7f8084f874d6c157b03a8e0f161796ec1186466',
    width: 1536,
    height: 864,
    minBytes: 120_000,
  },
  {
    name: 'prismastore-catalog.jpg',
    sha: 'f364d07479ab87d7c9868411c613e887ef47e459fcfd969610dd8655a26f5522',
    width: 1122,
    height: 1402,
    minBytes: 125_000,
  },
  {
    name: 'prismastore-order-finished.jpg',
    sha: '13b5a601668e5f38cc799f90a5b5dff1c21872073a93476095b7391dd28dfdbc',
    width: 1122,
    height: 1402,
    minBytes: 120_000,
  },
];

test('versioned chatbot assets are exactly the three reviewed artworks', () => {
  for (const asset of approved) {
    const path = assetPath(asset.name);
    assert.equal(existsSync(path), true, `${asset.name} must exist`);
    const buffer = readFileSync(path);
    assert.equal(sha256(buffer), asset.sha, `${asset.name} hash changed`);
    assert.deepEqual(jpegSize(buffer), { width: asset.width, height: asset.height }, `${asset.name} dimensions changed`);
    assert.ok(buffer.length >= asset.minBytes, `${asset.name} looks like a placeholder or truncated file`);
  }
});

test('runtime sends approved artwork files directly and never references legacy placeholders', () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(source, /prismastore-welcome\.jpg/);
  assert.match(source, /prismastore-catalog\.jpg/);
  assert.match(source, /prismastore-order-finished\.jpg/);
  assert.doesNotMatch(source, /prismastore-welcome\.png|prismastore-catalog\.png|prismastore-order-finished\.b64/);
  assert.doesNotMatch(source, /ensureBase64Asset/);
});

test('legacy placeholder assets are removed from the repository', () => {
  assert.equal(existsSync(assetPath('prismastore-welcome.png')), false);
  assert.equal(existsSync(assetPath('prismastore-catalog.png')), false);
  assert.equal(existsSync(assetPath('prismastore-order-finished.b64')), false);
});
