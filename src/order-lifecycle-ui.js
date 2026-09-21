async function advanceOrder(orderId, expectedStatus = null) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/advance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedStatus }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Falha ao atualizar pedido.');
  return result;
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest?.('[data-advance-order]');
  if (!button) return;
  // Botões atuais trazem o status e são tratados pelo app.js, que atualiza a UI sem recarregar a página.
  if (button.dataset.orderStatus) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Atualizando…';

  try {
    const result = await advanceOrder(button.dataset.advanceOrder, button.dataset.orderStatus || null);
    window.dispatchEvent(new CustomEvent('prismastore:orders-updated', {
      detail: {
        orderId: button.dataset.advanceOrder,
        status: result.order?.status || null,
        changed: Boolean(result.changed),
        stale: Boolean(result.stale),
      },
    }));
    window.location.reload();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = originalLabel;
    button.title = error instanceof Error ? error.message : 'Falha ao atualizar pedido.';
  }
}, true);
