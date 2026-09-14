import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureBase64Asset } from '../server/asset-loader.js';

test('reconstrói uma imagem versionada em Base64 para uso local pelo WhatsApp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prismastore-asset-'));
  try {
    const source = path.join(dir, 'asset.b64');
    const target = path.join(dir, 'asset.png');
    fs.writeFileSync(source, Buffer.from('imagem-teste').toString('base64'));
    const result = ensureBase64Asset({ base64Path: source, outputPath: target });
    assert.equal(result, target);
    assert.equal(fs.readFileSync(target, 'utf8'), 'imagem-teste');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
