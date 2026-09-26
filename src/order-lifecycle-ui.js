async function currentOrder(orderId) {
  const response = await fetch('/api/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível consultar o pedido.');
  const state = await response.json();
  return (state.orders ?? []).find((order) => order.id === orderId) ?? null;
}

async function advanceOrder(orderId) {
  const order = await currentOrder(orderId);
  if (!order) throw new Error('Pedido não encontrado.');
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/advance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedStatus: order.status }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Falha ao atualizar pedido.');
  return result;
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest?.('[data-advance-order]');
  if (!button) return;

  // Os botões atuais já são tratados pelo app.js e atualizam o estado em tela.
  if (button.dataset.orderStatus) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Atualizando…';

  try {
    const result = await advanceOrder(button.dataset.advanceOrder);
    window.dispatchEvent(new CustomEvent('prismastore:orders-updated', {
      detail: {
        orderId: button.dataset.advanceOrder,
        status: result.order?.status || null,
        changed: Boolean(result.changed),
        stale: Boolean(result.stale),
      },
    }));
    window.dispatchEvent(new CustomEvent('prismastore:external-state-changed', {
      detail: { source: 'order-lifecycle-ui', orderId: button.dataset.advanceOrder },
    }));
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = originalLabel;
    button.title = error instanceof Error ? error.message : 'Falha ao atualizar pedido.';
  }
}, true);
