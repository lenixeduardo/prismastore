const QR_SVG = `
<svg viewBox="0 0 116 116" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR Code Pix de demonstração">
  <rect width="116" height="116" fill="#fff"/>
  <g fill="#111">
    <path d="M8 8h32v32H8zm6 6v20h20V14zm5 5h10v10H19zM76 8h32v32H76zm6 6v20h20V14zm5 5h10v10H87zM8 76h32v32H8zm6 6v20h20V82zm5 5h10v10H19z"/>
    <path d="M48 8h8v8h-8zm12 0h8v16h-8zM48 20h8v12h-8zm16 12h8v8h-8zM44 44h8v8h-8zm12 0h8v16h-8zm12 0h8v8h-8zm12 0h8v12h-8zm16 0h8v8h-8zM44 56h8v8h-8zm24 0h8v12h-8zm16 4h8v8h-8zm12-4h8v16h-8zM44 68h12v8H44zm16 0h8v8h-8zm12 4h8v8h-8zm12 0h8v8h-8zm12 4h8v8h-8zM48 84h8v8h-8zm12-4h8v12h-8zm12 4h8v8h-8zm12 0h8v16h-8zm12 4h8v8h-8zM44 96h12v8H44zm16 0h8v12h-8zm12 0h8v8h-8zm24 4h12v8H96z"/>
  </g>
</svg>`;

function qrMarkup() {
  return `<div class="simulator-pix-qr" data-simulator-pix-qr>${QR_SVG}<span>QR Code Pix · exemplo</span></div>`;
}

function replaceCardapioWithCatalogo(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (/cardápio/i.test(node.nodeValue || '')) {
      node.nodeValue = node.nodeValue
        .replace(/CARDÁPIO/g, 'CATÁLOGO')
        .replace(/Cardápio/g, 'Catálogo')
        .replace(/cardápio/g, 'catálogo');
    }
  });
}

function enhanceSimulator() {
  const main = document.querySelector('.main');
  if (!main || document.querySelector('.main h1')?.textContent?.trim() !== 'Simulador do chatbot') return;

  replaceCardapioWithCatalogo(main);

  const bubbles = [...main.querySelectorAll('.phone-frame .bubble.bot')];
  const pixBubble = bubbles.find((bubble) => bubble.textContent?.includes('Pix gerado.'));
  if (pixBubble && !pixBubble.querySelector('[data-simulator-pix-qr]')) {
    pixBubble.insertAdjacentHTML('beforeend', qrMarkup());
  }
}

const observer = new MutationObserver(() => queueMicrotask(enhanceSimulator));
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', enhanceSimulator);
queueMicrotask(enhanceSimulator);
