import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintReceipt, validatePixReceipt } from '../server/pix-receipt.js';

const order = {
  id: 'PS-1001',
  total: 20,
  createdAt: '2026-09-16T20:00:00.000Z', // 17:00 em America/Sao_Paulo
};

function receipt({ amount = '20,00', date = '16/09/2026', time = '17:05:00', recipient = 'PRISMA STORE', transactionId = 'E1234567890123456789012345678901' } = {}) {
  return [
    'Comprovante de Pix',
    `Valor R$ ${amount}`,
    `Data e hora ${date} às ${time}`,
    `Destinatário ${recipient}`,
    `ID da transação ${transactionId}`,
  ].join('\n');
}

test('aprova somente comprovante que bate valor, destinatário e horário posterior ao pedido', () => {
  const result = validatePixReceipt({
    text: receipt(),
    order,
    recipientName: 'Prisma Store',
    fingerprint: 'receipt-a',
    existingOrders: [],
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.extracted.amount, 20);
  assert.equal(result.extracted.recipient, 'PRISMA STORE');
  assert.equal(result.extracted.date, '16/09/2026');
  assert.equal(result.extracted.time, '17:05:00');
});

test('recusa horário igual ou anterior ao horário de solicitação do pedido', () => {
  const equal = validatePixReceipt({ text: receipt({ time: '17:00:00' }), order, recipientName: 'Prisma Store', fingerprint: 'a', existingOrders: [] });
  const before = validatePixReceipt({ text: receipt({ time: '16:59:59' }), order, recipientName: 'Prisma Store', fingerprint: 'b', existingOrders: [] });
  assert.equal(equal.valid, false);
  assert.ok(equal.reasons.includes('payment-not-after-order'));
  assert.equal(before.valid, false);
  assert.ok(before.reasons.includes('payment-not-after-order'));
});

test('divergência de valor ou destinatário vai para revisão manual', () => {
  const amount = validatePixReceipt({ text: receipt({ amount: '19,99' }), order, recipientName: 'Prisma Store', fingerprint: 'a', existingOrders: [] });
  const recipient = validatePixReceipt({ text: receipt({ recipient: 'OUTRA LOJA' }), order, recipientName: 'Prisma Store', fingerprint: 'b', existingOrders: [] });
  assert.equal(amount.manualReview, true);
  assert.ok(amount.reasons.includes('amount-mismatch'));
  assert.equal(recipient.manualReview, true);
  assert.ok(recipient.reasons.includes('recipient-mismatch'));
});

test('não aceita nome configurado fora do campo de destinatário', () => {
  const text = `${receipt({ recipient: 'OUTRA LOJA' })}\nPagador PRISMA STORE`;
  const result = validatePixReceipt({ text, order, recipientName: 'Prisma Store', fingerprint: 'recipient-field', existingOrders: [] });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('recipient-mismatch'));
  assert.equal(result.extracted.recipient, 'OUTRA LOJA');
});

test('bloqueia comprovante ou identificador Pix reutilizado', () => {
  const previous = [{
    id: 'PS-0001',
    paymentReceiptFingerprint: 'same-fingerprint',
    paymentTransactionId: 'E1234567890123456789012345678901',
  }];
  const result = validatePixReceipt({
    text: receipt(),
    order,
    recipientName: 'Prisma Store',
    fingerprint: 'same-fingerprint',
    existingOrders: previous,
  });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('duplicate-receipt'));
});

test('fingerprint do comprovante é determinístico e não exige persistir a imagem', () => {
  const first = fingerprintReceipt(Buffer.from('imagem-do-comprovante'));
  const second = fingerprintReceipt(Buffer.from('imagem-do-comprovante'));
  assert.equal(first, second);
  assert.equal(first.length, 64);
});
