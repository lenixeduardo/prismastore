import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

function ordersTableSource() {
  const match = appSource.match(/function ordersTable\([\s\S]*?\n}\n\nfunction customersView/);
  assert.ok(match, 'ordersTable deve existir em src/app.js');
  return match[0];
}

test('tabela de pedidos renderiza pedido sem address sem derrubar o painel', () => {
  const source = ordersTableSource();
  assert.doesNotMatch(source, /o\.address\.street|o\.address\.number|o\.address\.neighborhood/);
  assert.match(source, /addressText\(o\.address\)/);
});
