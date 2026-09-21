import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

for (const relativePath of ['../src/hero.js', '../src/admin-icons.js']) {
  test(`browser module ${relativePath} has valid JavaScript syntax`, () => {
    const path = fileURLToPath(new URL(relativePath, import.meta.url));
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}

test('PWA shell includes the new admin enhancement assets', () => {
  const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.match(serviceWorker, /\/src\/admin-shell-fixes\.css/);
  assert.match(serviceWorker, /\/src\/admin-icons\.js/);
  assert.doesNotMatch(serviceWorker, /\/src\/whatsapp-onboarding\.js/);
});
