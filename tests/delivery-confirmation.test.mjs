import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import {
  createDeliveryConfirmationService,
  DELIVERY_CONFIRMATION_PILOT_PRODUCT_ID,
} from '../server/delivery-confirmation-service.js';

function fixture() {
  return {
    products: [],
    customers: [],
    orders: [{
      id: 'PS-TEST-1',
      customerName: 'Eduardo',
      status: 'DELIVERED',
      deliveryType: 'local_delivery',
      items: [{ productId: DELIVERY_CONFIRMATION_PILOT_PRODUCT_ID, name: 'Eduardo teste', quantity: 1 }],
      deliveryJourney: { requestedAt: '2026-09-25T02:00:00.000Z' },
    }, {
      id: 'PS-OTHER-1',
      customerName: 'Outro',
      status: 'DELIVERED',
      deliveryType: 'local_delivery',
      items: [{ productId: 'other', name: 'Outro item', quantity: 1 }],
    }],
    settings: { chatbotMessages: {} },
  };
}

function withService(run) {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-delivery-'));
  const store = createStateStore({ dbPath: join(dir, 'state.db'), seedState: fixture() });
  const service = createDeliveryConfirmationService({
    stateStore: store,
    secret: 'delivery-test-secret-123456789',
    publicUrl: 'https://prisma.test',
    now: () => new Date('2026-09-25T03:00:00.000Z'),
  });
  try {
    return run({ store, service });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('pilot order gets a signed public link and confirmation dossier', () => {
  withService(({ store, service }) => {
    const issued = service.issueLink('PS-TEST-1');
    assert.match(issued.link, /^https:\/\/prisma\.test\/delivery-confirmation\.html\?token=/);

    const opened = service.getPublicConfirmation(issued.token, { ip: '10.0.0.1', userAgent: 'test-agent' });
    assert.equal(opened.customerName, 'Eduardo');
    assert.equal(opened.status, 'pending');

    const signatureDataUrl = 'data:image/png;base64,aGVsbG8=';
    const result = service.confirmDelivery({
      token: issued.token,
      recipientName: 'Eduardo',
      accepted: true,
      signatureDataUrl,
      requestMeta: { ip: '10.0.0.1', userAgent: 'test-agent' },
    });
    assert.equal(result.alreadyConfirmed, false);

    const order = store.load().orders.find((item) => item.id === 'PS-TEST-1');
    assert.equal(order.deliveryConfirmation.recipientName, 'Eduardo');
    assert.equal(order.deliveryConfirmation.confirmationIp, '10.0.0.1');
    assert.equal(order.deliveryJourney.deliveredAt, '2026-09-25T03:00:00.000Z');
  });
});

test('non-pilot product cannot receive confirmation link', () => {
  withService(({ service }) => {
    assert.throws(() => service.issueLink('PS-OTHER-1'), /somente para Eduardo teste/i);
  });
});

test('tampered token is rejected', () => {
  withService(({ service }) => {
    const issued = service.issueLink('PS-TEST-1');
    assert.throws(() => service.getPublicConfirmation(`${issued.token}x`), /inválido/i);
  });
});
