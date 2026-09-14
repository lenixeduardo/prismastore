async function currentOrder(orderId) {
  const response = await fetch('/api/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível consultar o pedido.');
  const state = await response.json();
  return (state.orders ?? []).find((order) => order.id === orderId) ?? null;
}

async function advanceOrder(orderId) {
  const order = await currentOrder(orderId);
  if (!order) throw new Error(`Pedido ${orderId} não encontrado.`);
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

  // Captura o clique antes do handler legado do app.js e impede avanço local direto.
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  button.disabled = true;

  try {
    await advanceOrder(button.dataset.advanceOrder);
    window.location.reload();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.title = error instanceof Error ? error.message : 'Falha ao atualizar pedido.';
  }
}, true);
