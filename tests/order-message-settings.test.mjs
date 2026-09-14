import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderLifecycleService } from '../server/order-lifecycle-service.js';

test('order lifecycle uses configurable payment confirmed and finalization messages', async () => {
  const sent = [];
  const stateStore = {
    load: () => ({
      products: [], customers: [], orders: [],
      settings: { chatbotMessages: {
        paymentConfirmed: 'Pagamento OK: {pedido}',
        orderFinished: 'Finalizado OK: {pedido}',
      } },
    }),
    updateState: () => {},
  };
  const messenger = {
    sendText: async (phone, text) => sent.push({ phone, text }),
    sendMedia: async () => {},
  };
  const service = createOrderLifecycleService({ stateStore, messenger });

  await service.notifyOrderStatus({ id: 'PS-10', phone: '+5511', status: 'PAID', deliveryType: 'shipping' });
  await service.notifyOrderStatus({ id: 'PS-10', phone: '+5511', status: 'DELIVERED', deliveryType: 'shipping' });

  assert.match(sent[0].text, /^Pagamento OK: PS-10/);
  assert.match(sent[1].text, /^Finalizado OK: PS-10/);
  assert.match(sent[0].text, /ACOMPANHAMENTO/);
  assert.match(sent[1].text, /ACOMPANHAMENTO/);
});
