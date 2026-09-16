import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/admin-icons.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('admin navigation uses semantic inline SVG icons instead of placeholder glyphs', () => {
  assert.match(source, /function icon\(name\)/);
  assert.match(source, /<svg[^>]+viewBox="0 0 24 24"/);
  for (const name of ['layout-dashboard', 'shopping-bag', 'users', 'package', 'bar-chart-3', 'message-circle', 'settings']) {
    assert.match(source, new RegExp(`['"]${name}['"]`));
  }
  assert.match(source, /MutationObserver/);
  assert.match(html, /src\/admin-icons\.js/);
});
