import { normalizeProductInput } from './product-editor.js';

const API_STATE = '/api/state';
let enhancing = false;

async function fetchState() {
  const response = await fetch(API_STATE, { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar os dados locais.');
  return response.json();
}

async function saveState(next) {
  const response = await fetch(API_STATE, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  });
  if (!response.ok) throw new Error('Não foi possível salvar os dados locais.');
  return response.json();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function resumePanel(view) {
  sessionStorage.setItem('prismastore:resume-panel', view);
  window.location.reload();
}

function closeProductEditor() {
  document.querySelector('[data-real-product-editor]')?.remove();
}

function closeProductDetails() {
  document.querySelector('[data-real-product-details-panel]')?.remove();
}

function productDetailsMarkup(product) {
  const active = product?.active !== false;
  return `
    <div class="real-product-backdrop" data-real-product-details-panel>
      <section class="real-product-modal real-product-details" role="dialog" aria-modal="true" aria-label="Detalhes de ${escapeHtml(product.name)}">
        <div class="real-product-modal-head">
          <div><div class="eyebrow">Produto</div><h2>${escapeHtml(product.name)}</h2></div>
          <button type="button" class="btn sm ghost" data-real-product-details-close>×</button>
        </div>
        <div class="real-product-detail-grid">
          <div><span>Preço</span><strong>R$ ${Number(product.price || 0).toFixed(2).replace('.', ',')}</strong></div>
          <div><span>Estoque</span><strong>${escapeHtml(product.stock ?? 0)}</strong></div>
          <div><span>Status</span><strong>${active ? 'Ativo' : 'Inativo'}</strong></div>
          <div><span>ID</span><strong class="mono">${escapeHtml(product.id)}</strong></div>
        </div>
        <div class="real-product-actions">
          <button type="button" class="btn" data-real-product-edit="${escapeHtml(product.id)}">Editar</button>
          <button type="button" class="btn ghost" data-real-product-toggle="${escapeHtml(product.id)}">${active ? 'Desativar' : 'Ativar'}</button>
        </div>
      </section>
    </div>`;
}

async function openProductDetails(productId) {
  closeProductDetails();
  const state = await fetchState();
  const product = state.products.find((item) => item.id === productId);
  if (!product) throw new Error('Produto não encontrado.');
  document.body.insertAdjacentHTML('beforeend', productDetailsMarkup(product));
}

function productEditorMarkup(product = null) {
  const active = product?.active !== false;
  return `
    <div class="real-product-backdrop" data-real-product-editor>
      <form class="real-product-modal" data-real-product-form data-product-id="${escapeHtml(product?.id ?? '')}">
        <div class="real-product-modal-head">
          <div><div class="eyebrow">Catálogo real</div><h2>${product ? 'Editar produto' : 'Cadastrar produto'}</h2></div>
          <button type="button" class="btn sm ghost" data-real-product-close>×</button>
        </div>
        <div class="real-product-grid">
          <label>Nome<input name="name" required value="${escapeHtml(product?.name ?? '')}" placeholder="Ex.: Seda King Size" /></label>
          <label>Preço (R$)<input name="price" required inputmode="decimal" value="${escapeHtml(product?.price ?? '')}" placeholder="0,00" /></label>
          <label>Estoque físico<input name="stock" required inputmode="numeric" value="${escapeHtml(product?.stock ?? 0)}" /></label>
        </div>
        <label class="real-product-active"><input type="checkbox" name="active" ${active ? 'checked' : ''} /> Produto ativo no catálogo</label>
        <div class="real-product-error" data-real-product-error hidden></div>
        <div class="real-product-actions"><button type="button" class="btn" data-real-product-close>Cancelar</button><button type="submit" class="btn primary">Salvar produto</button></div>
      </form>
    </div>`;
}

async function openProductEditor(productId = null) {
  closeProductDetails();
  closeProductEditor();
  const state = await fetchState();
  const product = productId ? state.products.find((item) => item.id === productId) : null;
  document.body.insertAdjacentHTML('beforeend', productEditorMarkup(product));
}

async function persistProduct(form) {
  const state = await fetchState();
  const id = form.dataset.productId || null;
  const existing = id ? state.products.find((item) => item.id === id) : null;
  const data = new FormData(form);
  const product = normalizeProductInput({
    name: data.get('name'),
    price: data.get('price'),
    stock: data.get('stock'),
    active: data.get('active') === 'on',
  }, existing);
  if (existing) state.products = state.products.map((item) => item.id === existing.id ? product : item);
  else state.products.push(product);
  await saveState(state);
  closeProductEditor();
  resumePanel('products');
}

async function toggleProduct(productId) {
  const state = await fetchState();
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  product.active = product.active === false;
  product.updatedAt = new Date().toISOString();
  await saveState(state);
  resumePanel('products');
}

async function enhanceProducts() {
  const title = document.querySelector('.main h1')?.textContent?.trim();
  if (title !== 'Produtos') return;

  const demoButton = document.querySelector('#add-demo-product');
  if (demoButton) {
    const replacement = demoButton.cloneNode(true);
    replacement.removeAttribute('id');
    replacement.dataset.realProductNew = 'true';
    replacement.textContent = '+ Cadastrar produto';
    demoButton.replaceWith(replacement);
  }
}


function resumeRequestedView() {
  const view = sessionStorage.getItem('prismastore:resume-panel');
  if (!view) return false;
  const button = document.querySelector(`[data-view="${CSS.escape(view)}"]`);
  if (!button) return false;
  sessionStorage.removeItem('prismastore:resume-panel');
  button.click();
  return true;
}

async function enhance() {
  if (enhancing) return;
  enhancing = true;
  try {
    if (resumeRequestedView()) return;
    await enhanceProducts();
  } catch (error) {
    console.error('Falha ao aplicar extensões operacionais PrismaStore:', error);
  } finally {
    enhancing = false;
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  try {
    if (target.matches('[data-real-product-new]')) { event.preventDefault(); await openProductEditor(); }
    if (target.matches('[data-real-product-details]')) { event.preventDefault(); await openProductDetails(target.dataset.realProductDetails); }
    if (target.matches('[data-real-product-edit]')) { event.preventDefault(); await openProductEditor(target.dataset.realProductEdit); }
    if (target.matches('[data-real-product-toggle]')) { event.preventDefault(); await toggleProduct(target.dataset.realProductToggle); }
    if (target.matches('[data-real-product-close]')) { event.preventDefault(); closeProductEditor(); }
    if (target.matches('[data-real-product-details-close]')) { event.preventDefault(); closeProductDetails(); }
  } catch (error) {
    const status = document.querySelector('[data-message-save-status]');
    if (status) status.textContent = error instanceof Error ? error.message : 'Falha ao salvar.';
    else alert(error instanceof Error ? error.message : 'Falha ao concluir a ação.');
  }
}, true);

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-real-product-form]');
  if (!form) return;
  event.preventDefault();
  const errorBox = form.querySelector('[data-real-product-error]');
  try {
    await persistProduct(form);
  } catch (error) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = error instanceof Error ? error.message : 'Falha ao salvar produto.';
    }
  }
});

const observer = new MutationObserver(() => queueMicrotask(enhance));
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', enhance);
queueMicrotask(enhance);
