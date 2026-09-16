import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const indexPath = resolve(root, 'index.html');
const heroJsPath = resolve(root, 'src/hero.js');
const heroCssPath = resolve(root, 'src/hero.css');

test('starts on the PrismaStore hero page before revealing the control panel', () => {
  const html = readFileSync(indexPath, 'utf8');
  assert.match(html, /id="hero-page"/);
  assert.match(html, /id="app"\s+hidden/);
  assert.match(html, /Acessar painel de controle/);
  assert.match(html, /src="\.\/src\/hero\.js"/);
  assert.match(html, /href="\.\/src\/hero\.css"/);
});

test('hero reveals the existing dashboard without reloading', () => {
  assert.equal(existsSync(heroJsPath), true, 'src/hero.js should exist');
  if (!existsSync(heroJsPath)) return;
  const source = readFileSync(heroJsPath, 'utf8');
  assert.match(source, /app\.hidden\s*=\s*false/);
  assert.match(source, /hero\.hidden\s*=\s*true/);
});

test('fresh page loads always return to the hero instead of remembering a prior dashboard entry', () => {
  const source = readFileSync(heroJsPath, 'utf8');
  assert.doesNotMatch(source, /prismastore:dashboard-entered/);
  assert.doesNotMatch(source, /prismastore:resume-panel/);
  assert.match(source, /loadHeroArtwork\(\)/);
});

test('dashboard brand mark uses the official PrismaStore icon endpoint', () => {
  assert.equal(existsSync(heroCssPath), true, 'src/hero.css should exist');
  if (!existsSync(heroCssPath)) return;
  const source = readFileSync(heroCssPath, 'utf8');
  assert.match(source, /apple-touch-icon\.png/);
  assert.match(source, /\.brand-mark/);
});
