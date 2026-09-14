import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const installer = readFileSync(new URL('../INSTALAR_PRISMASTORE.bat', import.meta.url), 'utf8');
const starter = readFileSync(new URL('../INICIAR_PRISMASTORE.bat', import.meta.url), 'utf8');
const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('Windows installer prepares Node, env, dependencies, data, backups and desktop shortcut', () => {
  assert.match(installer, /where node/i);
  assert.match(installer, /nodejs\.org\/en\/download/i);
  assert.match(installer, /\.env\.example/i);
  assert.match(installer, /npm install/i);
  assert.match(installer, /if not exist data mkdir data/i);
  assert.match(installer, /if not exist backups mkdir backups/i);
  assert.match(installer, /Desktop\\PrismaStore\.cmd/i);
  assert.match(installer, /INICIAR_PRISMASTORE\.bat/i);
});

test('daily starter preserves local folders and backup directory is ignored by Git', () => {
  assert.match(starter, /if not exist backups mkdir backups/i);
  assert.match(gitignore, /^backups\/$/m);
  assert.match(gitignore, /^data\/prismastore-order-finished\.png$/m);
});

test('customer installation documentation tracks the current package release', () => {
  assert.equal(pkg.version, '0.9.2');
  assert.match(readme, /Backup e recuperação/);
  assert.match(readme, /INSTALAR_PRISMASTORE\.bat/);
  assert.match(readme, /SHA-256/);
});
