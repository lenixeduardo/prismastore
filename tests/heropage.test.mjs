import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('index starts on a full-screen hero and exposes one functional dashboard entry button', async () => {
  const html = await source('index.html');
  assert.match(html, /id="hero-page"/);
  assert.match(html, /class="hero-art"/);
  assert.match(html, /data-enter-dashboard/);
  assert.match(html, /Acessar painel de controle/);
  assert.match(html, /id="app"[^>]*hidden/);
});

test('hero uses the supplied full-size PrismaStore artwork asset', async () => {
  const html = await source('index.html');
  assert.match(html, /assets\/prismastore-hero\.webp/);
  const css = await source('src/styles.css');
  assert.match(css, /\.hero-page[\s\S]*100(?:dvh|vh)/);
  assert.match(css, /\.hero-art[\s\S]*object-fit:\s*cover/);
});

test('dashboard brand uses the official PrismaStore logo instead of the Pr text placeholder', async () => {
  const app = await source('src/app.js');
  assert.match(app, /class="brand-mark"[^>]*>[\s\S]*<img[^>]+src="\/icons\/apple-touch-icon\.png"/);
  assert.doesNotMatch(app, /class="brand-mark"><\/div>/);

  const css = await source('src/styles.css');
  assert.doesNotMatch(css, /\.brand-mark::after\s*\{[^}]*content:\s*"Pr"/);
});

test('entering the dashboard hides the hero and reveals the existing app without reloading', async () => {
  const startup = await source('src/hero.js');
  assert.match(startup, /data-enter-dashboard/);
  assert.match(startup, /hero\.hidden\s*=\s*true/);
  assert.match(startup, /app\.hidden\s*=\s*false/);
});
