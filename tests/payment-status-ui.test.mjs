import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('painel consulta status do Pix local sem depender de credenciais Asaas', () => {
  const source = fs.readFileSync(new URL('../src/payment-status.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/payments\/status/);
  assert.match(source, /Pix local/);
  assert.match(source, /CONFIGURAR PIX/);
  assert.match(source, /CONFIGURADO/);
  assert.doesNotMatch(source, /API KEY|WEBHOOK TOKEN|Asaas/);
});

test('index não carrega um segundo adaptador de status de pagamento', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /src\/payment-status\.js/);
  assert.match(app, /\/api\/payments\/status/);
  assert.match(app, /Pix Oscar/);
});
