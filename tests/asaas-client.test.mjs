import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsaasClient } from '../server/asaas-client.js';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('Asaas client sends access_token and creates customer, pix payment and QR code', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/customers')) return jsonResponse(200, { id: 'cus_123' });
    if (url.endsWith('/payments')) return jsonResponse(200, { id: 'pay_123', status: 'PENDING' });
    if (url.endsWith('/payments/pay_123/pixQrCode')) return jsonResponse(200, { encodedImage: 'BASE64PNG', payload: '000201PIX', expirationDate: '2026-09-14 23:59:59' });
    throw new Error(`unexpected ${url}`);
  };
  const client = createAsaasClient({ apiKey: 'sandbox-key', fetchImpl, baseUrl: 'https://api-sandbox.asaas.com/v3' });

  const customer = await client.createCustomer({ name: 'Cliente', cpfCnpj: '12345678909', mobilePhone: '11999999999', externalReference: 'c1' });
  const payment = await client.createPixPayment({ customerId: customer.id, value: 20, dueDate: '2026-09-14', description: 'Pedido PS-1001', externalReference: 'PS-1001' });
  const qr = await client.getPixQrCode(payment.id);

  assert.equal(customer.id, 'cus_123');
  assert.equal(payment.id, 'pay_123');
  assert.equal(qr.payload, '000201PIX');
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.options.headers.access_token, 'sandbox-key');
    assert.match(call.options.headers['user-agent'], /PrismaStore/);
  }
  assert.equal(JSON.parse(calls[1].options.body).billingType, 'PIX');
});

test('Asaas client fails clearly when API key is missing or API returns an error', async () => {
  const missing = createAsaasClient({ apiKey: '', fetchImpl: async () => jsonResponse(200, {}) });
  await assert.rejects(() => missing.createCustomer({}), /ASAAS_API_KEY/);

  const failing = createAsaasClient({ apiKey: 'key', fetchImpl: async () => jsonResponse(400, { errors: [{ description: 'CPF inválido' }] }) });
  await assert.rejects(() => failing.createCustomer({ name: 'X', cpfCnpj: '1' }), /CPF inválido/);
});
