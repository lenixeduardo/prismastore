import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('painel consulta status do Asaas sem alterar o app principal', () => {
  const source = fs.readFileSync(new URL('../src/payment-status.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/payments\/status/);
  assert.match(source, /FALTA API KEY/);
  assert.match(source, /FALTA WEBHOOK TOKEN/);
  assert.match(source, /CONFIGURADO/);
});

test('index carrega o adaptador de status de pagamento', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /src\/payment-status\.js/);
});
