import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('manifest has installable identity and 192/512 icons', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'PrismaStore Operations');
  assert.equal(manifest.short_name, 'PrismaStore');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
});

test('service worker caches only static shell and bypasses API', () => {
  const sw = read('service-worker.js');
  assert.match(sw, /prismastore-shell-v0\.9\.2-prism-icon/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  const shell = sw.match(/const APP_SHELL = \[[\s\S]*?\n\];/)?.[0] || '';
  assert.doesNotMatch(shell, /['"]\/api\//);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /APP_SHELL\.includes\(url\.pathname\)/);
  assert.match(sw, /SKIP_WAITING/);
});

test('PWA module registers only in secure contexts and supports install/update/iOS', () => {
  const js = read('src/pwa.js');
  assert.match(js, /window\.isSecureContext/);
  assert.match(js, /serviceWorker\.register\('\/service-worker\.js',\s*\{\s*updateViaCache:\s*'none'\s*\}\)/);
  assert.match(js, /beforeinstallprompt/);
  assert.match(js, /navigator\.standalone/);
  assert.match(js, /Adicionar à Tela de Início/);
  assert.match(js, /data-pwa-more/);
  assert.match(js, /setAttribute\('data-label'/);
});

test('mobile CSS hides sidebar, pins bottom nav and turns tables into cards', () => {
  const css = read('src/pwa.css');
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /\.sidebar \{ display:none !important; \}/);
  assert.match(css, /\.mobile-bottom \{[^}]*position:fixed/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /table td::before \{ content:attr\(data-label\)/);
  assert.match(css, /\.drawer \{ width:100vw/);
});

test('index references manifest and PWA progressive enhancement assets', () => {
  const html = read('index.html');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest(?:\?[^"]*)?"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /src\/pwa\.css/);
  assert.match(html, /src\/pwa\.js/);
  assert.match(html, /viewport-fit=cover/);
});

test('server serves webmanifest with manifest MIME and package version matches shell', () => {
  const server = read('server/app-server.js');
  const pkg = JSON.parse(read('package.json'));
  assert.match(server, /'\.webmanifest': 'application\/manifest\+json; charset=utf-8'/);
  assert.match(server, /appVersion: '0\.9\.2'/);
  assert.equal(pkg.version, '0.9.2');
});
