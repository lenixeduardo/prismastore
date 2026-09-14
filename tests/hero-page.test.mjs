import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const indexPath = resolve(root, 'index.html');
const heroJsPath = resolve(root, 'src/hero.js');
const heroCssPath = resolve(root, 'src/hero.css');

test('starts on a dedicated PrismaStore hero page before revealing the control panel', () => {
  const html = readFileSync(indexPath, 'utf8');
  assert.match(html, /id="hero-root"/);
  assert.match(html, /id="app"\s+hidden/);
  assert.match(html, /src="\.\/src\/hero\.js"/);
  assert.match(html, /href="\.\/src\/hero\.css"/);
});

test('hero provides the approved panel CTA and reveals the existing dashboard without reloading', () => {
  assert.equal(existsSync(heroJsPath), true, 'src/hero.js should exist');
  if (!existsSync(heroJsPath)) return;
  const source = readFileSync(heroJsPath, 'utf8');
  assert.match(source, /Acessar painel de controle/);
  assert.match(source, /app\.hidden\s*=\s*false/);
  assert.match(source, /hero\.hidden\s*=\s*true/);
});

test('hero styling uses the PrismaStore brand mark and the existing green-gold visual direction', () => {
  assert.equal(existsSync(heroCssPath), true, 'src/hero.css should exist');
  if (!existsSync(heroCssPath)) return;
  const source = readFileSync(heroCssPath, 'utf8');
  assert.match(source, /apple-touch-icon\.png/);
  assert.match(source, /--hero-green:/);
  assert.match(source, /--hero-gold:/);
});
