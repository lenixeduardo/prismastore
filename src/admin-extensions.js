import { normalizeProductInput } from './product-editor.js';
import { CHATBOT_MESSAGE_DEFAULTS, CHATBOT_MESSAGE_FIELDS, messageValue } from './chatbot-settings.js';

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
          <label>Categoria<input name="category" required value="${escapeHtml(product?.category ?? '')}" placeholder="Ex.: Sedas" /></label>
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
    category: data.get('category'),
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

  const state = await fetchState();
  document.querySelectorAll('.main tbody tr').forEach((row) => {
    if (row.querySelector('[data-real-product-edit]')) return;
    const idText = [...row.querySelectorAll('.category')].map((node) => node.textContent).find((text) => /^ID\s+/.test(text.trim()));
    const productId = idText?.trim().replace(/^ID\s+/, '');
    if (!productId) return;
    const product = state.products.find((item) => item.id === productId);
    const target = row.lastElementChild;
    if (!target || !product) return;
    target.insertAdjacentHTML('beforeend', `<div class="real-product-row-actions"><button class="btn sm" data-real-product-edit="${escapeHtml(productId)}">Editar</button><button class="btn sm ghost" data-real-product-toggle="${escapeHtml(productId)}">${product.active === false ? 'Ativar' : 'Desativar'}</button></div>`);
  });
}

function messagesMarkup(settings) {
  return `
    <section class="card padded chatbot-message-settings" data-chatbot-message-settings>
      <div class="section-head"><div><div class="section-title">Mensagens do atendimento</div><div class="category">Edite o texto de cada etapa do fluxo. O catálogo continua sendo gerado pelos produtos reais cadastrados.</div></div><span class="badge green">PADRÃO</span></div>
      <div class="message-settings-grid">
        ${CHATBOT_MESSAGE_FIELDS.map((field) => `
          <label class="message-setting-field">
            <span class="message-setting-title">${escapeHtml(field.label)}</span>
            <textarea rows="4" data-message-key="${field.key}">${escapeHtml(messageValue(settings, field.key))}</textarea>
            <span class="message-setting-help">${field.placeholders.length ? `Variáveis: ${field.placeholders.map(escapeHtml).join(' · ')}` : 'Sem variáveis nesta etapa.'}</span>
            <button type="button" class="btn sm ghost" data-reset-message="${field.key}">Restaurar padrão</button>
          </label>`).join('')}
      </div>
      <div class="message-settings-footer"><span class="category" data-message-save-status></span><button type="button" class="btn primary" data-save-chatbot-messages>Salvar mensagens</button></div>
    </section>`;
}

async function enhanceSettings() {
  const title = document.querySelector('.main h1')?.textContent?.trim();
  if (title !== 'Configurações' || document.querySelector('[data-chatbot-message-settings]')) return;
  const state = await fetchState();
  const notice = document.querySelector('.main .section.notice');
  if (notice) notice.insertAdjacentHTML('beforebegin', messagesMarkup(state.settings ?? { chatbotMessages: {} }));
  else document.querySelector('.main')?.insertAdjacentHTML('beforeend', messagesMarkup(state.settings ?? { chatbotMessages: {} }));
}

async function saveMessageSettings() {
  const state = await fetchState();
  state.settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
  state.settings.chatbotMessages = state.settings.chatbotMessages && typeof state.settings.chatbotMessages === 'object' ? state.settings.chatbotMessages : {};
  document.querySelectorAll('[data-message-key]').forEach((field) => {
    state.settings.chatbotMessages[field.dataset.messageKey] = field.value;
  });
  await saveState(state);
  const status = document.querySelector('[data-message-save-status]');
  if (status) status.textContent = 'Mensagens salvas. O próximo atendimento já usará estes textos.';
}

function restoreMessageDefault(key) {
  const field = document.querySelector(`[data-message-key="${CSS.escape(key)}"]`);
  if (field) field.value = CHATBOT_MESSAGE_DEFAULTS[key] ?? '';
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
    await enhanceSettings();
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
    if (target.matches('[data-real-product-edit]')) { event.preventDefault(); await openProductEditor(target.dataset.realProductEdit); }
    if (target.matches('[data-real-product-toggle]')) { event.preventDefault(); await toggleProduct(target.dataset.realProductToggle); }
    if (target.matches('[data-real-product-close]')) { event.preventDefault(); closeProductEditor(); }
    if (target.matches('[data-save-chatbot-messages]')) { event.preventDefault(); await saveMessageSettings(); }
    if (target.matches('[data-reset-message]')) { event.preventDefault(); restoreMessageDefault(target.dataset.resetMessage); }
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
