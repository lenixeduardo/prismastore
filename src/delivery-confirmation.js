const token = new URLSearchParams(window.location.search).get('token') || '';
const loading = document.querySelector('#delivery-loading');
const content = document.querySelector('#delivery-content');
const success = document.querySelector('#delivery-success');
const form = document.querySelector('#delivery-form');
const errorBox = document.querySelector('#delivery-error');
const summary = document.querySelector('#delivery-summary');
const recipientInput = document.querySelector('#recipient-name');
const canvas = document.querySelector('#signature-canvas');
const clearButton = document.querySelector('#clear-signature');
const photoInput = document.querySelector('#delivery-photo');
const submitButton = document.querySelector('#confirm-delivery');

let drawing = false;
let signed = false;
let lastPoint = null;

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function addressText(address) {
  if (!address) return '';
  const first = [address.street, address.number].filter(Boolean).join(', ');
  return [first, address.complement, address.neighborhood, [address.city, address.state].filter(Boolean).join('/'), address.zip]
    .filter(Boolean)
    .join(' · ');
}

function resizeCanvasForDisplay() {
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const current = signed ? canvas.toDataURL('image/png') : null;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(180 * ratio));
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#102018';
  if (current) {
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, rect.width, 180);
    image.src = current;
  }
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] || event;
  return { x: source.clientX - rect.left, y: source.clientY - rect.top };
}

function startDrawing(event) {
  event.preventDefault();
  drawing = true;
  lastPoint = pointFromEvent(event);
}

function draw(event) {
  if (!drawing) return;
  event.preventDefault();
  const point = pointFromEvent(event);
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(lastPoint.x, lastPoint.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  lastPoint = point;
  signed = true;
}

function stopDrawing() {
  drawing = false;
  lastPoint = null;
}

canvas.addEventListener('pointerdown', startDrawing);
canvas.addEventListener('pointermove', draw);
window.addEventListener('pointerup', stopDrawing);

clearButton.addEventListener('click', () => {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  signed = false;
});

function fileToCompressedDataUrl(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a foto.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('A foto selecionada é inválida.'));
      image.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(image.width * scale));
        out.height = Math.max(1, Math.round(image.height * scale));
        out.getContext('2d').drawImage(image, 0, 0, out.width, out.height);
        resolve(out.toDataURL('image/jpeg', .72));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function load() {
  if (!token) throw new Error('Link de confirmação inválido.');
  const response = await fetch(`/api/delivery-confirmations/${encodeURIComponent(token)}`, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Não foi possível abrir a confirmação.');

  if (payload.status === 'confirmed') {
    loading.hidden = true;
    success.hidden = false;
    return;
  }

  recipientInput.value = payload.customerName || '';
  const items = Array.isArray(payload.items) ? payload.items : [];
  const address = addressText(payload.address);
  summary.innerHTML = `
    <strong>Itens recebidos</strong>
    <ul>${items.map((item) => `<li>${Number(item.quantity || 0)}× ${esc(item.name)}</li>`).join('')}</ul>
    ${address ? `<p>${esc(address)}</p>` : ''}
  `;
  loading.hidden = true;
  content.hidden = false;
  resizeCanvasForDisplay();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  if (!signed) {
    errorBox.textContent = 'Assine no campo acima antes de confirmar.';
    return;
  }
  submitButton.disabled = true;
  try {
    const photoDataUrl = await fileToCompressedDataUrl(photoInput.files?.[0] || null);
    const response = await fetch(`/api/delivery-confirmations/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipientName: recipientInput.value,
        accepted: document.querySelector('#delivery-accepted').checked,
        signatureDataUrl: canvas.toDataURL('image/png'),
        photoDataUrl,
        notes: document.querySelector('#delivery-notes').value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível registrar o recebimento.');
    content.hidden = true;
    success.hidden = false;
  } catch (error) {
    errorBox.textContent = error instanceof Error ? error.message : 'Não foi possível registrar o recebimento.';
  } finally {
    submitButton.disabled = false;
  }
});

window.addEventListener('resize', () => {
  if (!content.hidden) resizeCanvasForDisplay();
});

load().catch((error) => {
  loading.innerHTML = `<p class="delivery-error">${esc(error instanceof Error ? error.message : 'Não foi possível abrir esta confirmação.')}</p>`;
});
