import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('public build copies only UI and replaces internal seed data', async () => {
  const { preparePublicDirectory } = await import('../server/public-directory.js');
  const root = mkdtempSync(join(tmpdir(), 'ps-public-'));
  try {
    for (const dir of ['src', 'assets', 'icons', 'server', 'data']) mkdirSync(join(root, dir));
    writeFileSync(join(root, 'index.html'), '<html>login</html>');
    writeFileSync(join(root, 'src', 'app.js'), 'export const ui = true;');
    writeFileSync(join(root, 'src', 'data.js'), 'PRIVATE CUSTOMER PHONE');
    writeFileSync(join(root, '.env'), 'SECRET');
    writeFileSync(join(root, 'data', 'prismastore.db'), 'PRIVATE DATABASE');
    symlinkSync(join(root, '.env'), join(root, 'assets', 'secret.svg'));
    const publicDir = preparePublicDirectory(root);
    assert.equal(readFileSync(join(publicDir, 'index.html'), 'utf8'), '<html>login</html>');
    assert.ok(existsSync(join(publicDir, 'src', 'app.js')));
    assert.doesNotMatch(readFileSync(join(publicDir, 'src', 'data.js'), 'utf8'), /PRIVATE/);
    for (const path of ['.env', 'data', 'server', 'assets/secret.svg']) assert.equal(existsSync(join(publicDir, path)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
