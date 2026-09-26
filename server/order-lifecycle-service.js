import { nextOrderStatus } from '../src/domain.js';
import { resolveChatbotMessage } from './chatbot-messages.js';

function trackerStage(order) {
  if (order.status === 'DELIVERED') return 3;
  if (order.status === 'SHIPPED') return 2;
  if (order.status === 'PACKING') return 1;
  return 0;
}

function marker(done) {
  return done ? '✅' : '○';
}

export function buildOrderTracker(order) {
  const stage = trackerStage(order);
  const steps = [
    '📍 *ACOMPANHAMENTO*',
    '',
    `${marker(stage >= 0)} Pagamento confirmado`,
    `${marker(stage >= 1)} Produto embalado`,
  ];
  if (order.deliveryType === 'shipping') {
    steps.push(`${marker(stage >= 2)} Pedido enviado`);
  }
  steps.push(`${marker(stage >= 3)} Concluído`);
  return steps.join('\n');
}

function statusIntro(state, order) {
  if (order.status === 'PACKING') return '📦 Seu pedido está *embalado*.';
  if (order.status === 'SHIPPED') return '🚚 Seu *pedido enviado* já está em transporte.';
  if (order.status === 'DELIVERED') return resolveChatbotMessage(state, 'orderFinished');
  if (order.status === 'PAID') return resolveChatbotMessage(state, 'paymentConfirmed');
  return 'Pedido atualizado.';
}

export function createOrderLifecycleService({
  stateStore,
  messenger = null,
  finalArtworkPath = null,
  deliveryConfirmationService = null,
  now = () => new Date(),
}) {
  async function notifyOrderStatus(order, { confirmationLink = null } = {}) {
    if (!messenger) return { notified: false, reason: 'messenger-unavailable' };
    if (order.status === 'DELIVERED' && finalArtworkPath && messenger.sendMedia) {
      await messenger.sendMedia(order.phone, finalArtworkPath);
    }
    if (messenger.sendText) {
      const state = stateStore.load();
      await messenger.sendText(order.phone, `${statusIntro(state, order)}\n\n${buildOrderTracker(order)}`);
      if (order.status === 'DELIVERED' && confirmationLink) {
        await messenger.sendText(
          order.phone,
          `✅ Para registrar o recebimento, abra o link e confirme somente após estar com os itens em mãos:\n${confirmationLink}`,
        );
        deliveryConfirmationService?.markLinkSent?.(order.id, 'whatsapp');
      }
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

    let confirmationLink = null;
    let confirmationError = null;

    if (changed) {
      if (updatedOrder?.status === 'DELIVERED') {
        deliveryConfirmationService?.markHandoff?.(updatedOrder.id, updatedOrder.updatedAt);
        if (deliveryConfirmationService?.isEligibleOrder?.(updatedOrder)) {
          try {
            confirmationLink = deliveryConfirmationService.issueLink(updatedOrder.id)?.link || null;
          } catch (error) {
            confirmationError = error instanceof Error ? error.message : 'Falha ao gerar link de confirmação';
          }
        }
      }
      try {
        await notifyOrderStatus(updatedOrder, { confirmationLink });
      } catch (error) {
        return {
          changed: true,
          stale: false,
          order: updatedOrder,
          confirmationLink,
          confirmationError,
          notificationError: error instanceof Error ? error.message : 'Falha ao notificar WhatsApp',
        };
      }
    }

    return { changed, stale, order: updatedOrder, confirmationLink, confirmationError };
  }

  return { advanceOrder, notifyOrderStatus };
}
