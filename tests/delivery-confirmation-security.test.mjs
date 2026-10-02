import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeliveryConfirmationService } from '../server/delivery-confirmation-service.js';

function fixture() {
  let instant = new Date('2026-10-02T00:00:00Z');
  let state = { products: [], orders: [{ id: 'private-order', status: 'DELIVERED', customerName: 'Private name', phone: 'private phone', address: { street: 'Private address' }, items: [{ productId: 'catalog-eduardo-teste', quantity: 1 }] }] };
  const store = { load: () => structuredClone(state), updateState: (fn) => { state = fn(structuredClone(state)); } };
  const service = createDeliveryConfirmationService({ stateStore: store, secret: 'security-test-secret-123456', now: () => instant });
  return { service, store, setTime: (value) => { instant = new Date(value); } };
}

test('public confirmation exposes only item quantities and confirmation status', () => {
  const { service } = fixture();
  const { token } = service.issueLink('private-order');
  assert.deepEqual(service.getPublicConfirmation(token), { items: [{ id: '#1', quantity: 1 }], status: 'pending' });
});

test('reissuing a link revokes the old token even within the same millisecond', () => {
  const { service } = fixture();
  const first = service.issueLink('private-order');
  const second = service.issueLink('private-order');
  assert.notEqual(first.token, second.token);
  assert.throws(() => service.getPublicConfirmation(first.token), /expirado/i);
  assert.equal(service.getPublicConfirmation(second.token).status, 'pending');
});

test('links expire after seven days for both reads and submissions', () => {
  const { service, setTime } = fixture();
  const { token } = service.issueLink('private-order');
  setTime('2026-10-08T23:59:59Z');
  assert.equal(service.getPublicConfirmation(token).status, 'pending');
  setTime('2026-10-09T00:00:00Z');
  assert.throws(() => service.getPublicConfirmation(token), /expirado/i);
  assert.throws(() => service.confirmDelivery({ token, accepted: true, recipientName: 'Recipient', signatureDataUrl: 'data:image/png;base64,aGVsbG8=' }), /expirado/i);
});

test('confirmation stays idempotent and reissuing preserves private evidence', () => {
  const { service, store } = fixture();
  const { token } = service.issueLink('private-order');
  const submission = { token, accepted: true, recipientName: 'Recipient', signatureDataUrl: 'data:image/png;base64,aGVsbG8=' };
  assert.equal(service.confirmDelivery(submission).alreadyConfirmed, false);
  const evidence = store.load().orders[0].deliveryConfirmation.evidenceHash;
  assert.equal(service.confirmDelivery(submission).alreadyConfirmed, true);
  const replacement = service.issueLink('private-order');
  assert.equal(service.getPublicConfirmation(replacement.token).status, 'confirmed');
  assert.equal(store.load().orders[0].deliveryConfirmation.evidenceHash, evidence);
  assert.deepEqual(Object.keys(service.getPublicConfirmation(replacement.token)).sort(), ['items', 'status']);
});
