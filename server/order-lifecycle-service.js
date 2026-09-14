import { nextOrderStatus } from '../src/domain.js';


function trackerStage(order) {
  if (order.status === 'DELIVERED') return 3;
  if (['SHIPPED', 'OUT_FOR_DELIVERY'].includes(order.status)) return 2;
  if (order.status === 'PACKING') return 1;
  return 0;
}

function marker(done) {
  return done ? '✅' : '○';
}

export function buildOrderTracker(order) {
  const stage = trackerStage(order);
  const transportLabel = order.deliveryType === 'local_delivery' ? 'Saiu para entrega' : 'Pedido enviado';
  return [
    `📍 *ACOMPANHAMENTO · ${order.id}*`,
    '',
    `${marker(stage >= 0)} Pagamento confirmado`,
    `${marker(stage >= 1)} Em preparação`,
    `${marker(stage >= 2)} ${transportLabel}`,
    `${marker(stage >= 3)} Finalizado`,
  ].join('\n');
}

function statusIntro(order) {
  if (order.status === 'PACKING') return `📦 Seu pedido *${order.id}* está *Em preparação*.`;
  if (order.status === 'OUT_FOR_DELIVERY') return `🛵 Seu pedido *${order.id}* *Saiu para entrega* no seu endereço.`;
  if (order.status === 'SHIPPED') return `🚚 Seu *Pedido enviado* (${order.id}) já está em transporte.`;
  if (order.status === 'DELIVERED') return `✅ *Seu pedido foi finalizado!*\nPedido: *${order.id}*\nObrigado por comprar com a Prisma Store.`;
  if (order.status === 'PAID') return `✅ Pagamento confirmado para o pedido *${order.id}*.`;
  return `Pedido *${order.id}* atualizado.`;
}

export function createOrderLifecycleService({ stateStore, messenger = null, finalArtworkPath = null, now = () => new Date() }) {
  async function notifyOrderStatus(order) {
    if (!messenger) return { notified: false, reason: 'messenger-unavailable' };
    if (order.status === 'DELIVERED' && finalArtworkPath && messenger.sendMedia) {
      await messenger.sendMedia(order.phone, finalArtworkPath);
    }
    if (messenger.sendText) {
      await messenger.sendText(order.phone, `${statusIntro(order)}\n\n${buildOrderTracker(order)}`);
    }
    return { notified: true };
  }

  async function advanceOrder({ orderId, expectedStatus }) {
    let changed = false;
    let stale = false;
    let updatedOrder = null;

    stateStore.updateState((state) => {
      const order = state.orders.find((candidate) => candidate.id === orderId);
      if (!order) throw new Error(`Pedido ${orderId} não encontrado.`);
      if (expectedStatus && order.status !== expectedStatus) {
        stale = true;
        updatedOrder = structuredClone(order);
        return state;
      }
      const next = nextOrderStatus(order);
      if (next === order.status || order.status === 'PAYMENT_PENDING') {
        updatedOrder = structuredClone(order);
        return state;
      }
      order.status = next;
      order.updatedAt = now().toISOString();
      order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
      order.statusHistory.push({ status: next, at: order.updatedAt });
      changed = true;
      updatedOrder = structuredClone(order);
      return state;
    });

    if (changed) {
      try {
        await notifyOrderStatus(updatedOrder);
      } catch (error) {
        return {
          changed: true,
          stale: false,
          order: updatedOrder,
          notificationError: error instanceof Error ? error.message : 'Falha ao notificar WhatsApp',
        };
      }
    }

    return { changed, stale, order: updatedOrder };
  }

  return { advanceOrder, notifyOrderStatus };
}
