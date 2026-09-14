# PrismaStore Products, Messages and WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace operational mock data with real persisted products, add configurable chatbot-flow messages, and make the WhatsApp QR compact while keeping the approved hero/PWA branding.

**Architecture:** Keep the existing `app_state` SQLite JSON as the single source of truth and extend it with `settings.chatbotMessages`. The admin UI continues to read/write `/api/state`; the WhatsApp chatbot reads products and message settings from the same store on every relevant step, so panel changes apply without a separate configuration backend.

**Tech Stack:** Node.js ESM, `node:sqlite`, `node:test`, vanilla JavaScript/HTML/CSS, `whatsapp-web.js`, local HTTP API.

**Spec:** `docs/superpowers/specs/2026-09-14-prismastore-product-settings-whatsapp-design.md`

## Global Constraints

- SQLite local remains the only operational source of truth.
- Products used in historical orders are deactivated rather than physically deleted.
- Product low-stock threshold remains available stock `< 3`.
- Empty or invalid custom messages fall back to safe defaults.
- QR visual size is `180px` desktop and `160px` mobile while internal QR resolution stays unchanged.
- The existing hero remains the first screen and opens the existing dashboard without reload.
- The official PrismaStore mark remains the emerald triangular prism with gold details.
- New operational databases start with empty `products`, `customers`, and `orders`; demo seeds remain test/development fixtures only.

---

### Task 1: Persist settings and remove operational seeding

**Files:**
- Create: `server/chatbot-messages.js`
- Modify: `server/state-store.js`
- Modify: `server/index.js`
- Test: `tests/state-store.test.mjs`
- Test: `tests/runtime-seed.test.mjs`

**Interfaces:**
- Produces: `DEFAULT_CHATBOT_MESSAGES` object exported from `server/chatbot-messages.js`.
- Produces: `sanitizeState()` behavior preserving `{ products, customers, orders, settings.chatbotMessages }`.
- Runtime seed passed to `createStateStore()` becomes `{ products: [], customers: [], orders: [], settings: { chatbotMessages: DEFAULT_CHATBOT_MESSAGES } }`.

- [ ] **Step 1: Write failing state migration tests**

```js
import { DEFAULT_CHATBOT_MESSAGES } from '../server/chatbot-messages.js';

const store = createStateStore({ dbPath, seedState: { products: [], customers: [], orders: [] } });
assert.deepEqual(store.load().settings.chatbotMessages, DEFAULT_CHATBOT_MESSAGES);

store.save({ products: [{ id: 'p1' }], customers: [], orders: [], settings: { chatbotMessages: { welcome: 'Oi {cliente}' } } });
const loaded = store.load();
assert.equal(loaded.settings.chatbotMessages.welcome, 'Oi {cliente}');
assert.equal(typeof loaded.settings.chatbotMessages.catalogInstruction, 'string');
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/state-store.test.mjs tests/runtime-seed.test.mjs`
Expected: FAIL because `settings` defaults and empty runtime seed are not implemented.

- [ ] **Step 3: Add default message module and state sanitizer**

Create `server/chatbot-messages.js` with these exported keys:

```js
export const DEFAULT_CHATBOT_MESSAGES = Object.freeze({
  welcome: 'Olá, *{cliente}*! 👋\nBem-vindo à *Prisma Store*. Vou cuidar do seu pedido por aqui de forma simples.',
  catalogHeader: '🛍️ *CARDÁPIO PRISMA STORE*',
  catalogInstruction: 'Responda somente com o *número do item* que deseja.',
  invalidProduct: 'Não encontrei essa opção.',
  quantityPrompt: 'Você escolheu *{produto}*.\nQuantas unidades deseja? Restam {estoque} disponível(is) para este pedido.',
  invalidQuantity: 'Você pode adicionar de *1 até {estoque}* unidade(s).',
  cartActions: '1 — Adicionar outro item\n2 — Finalizar pedido\n0 — Cancelar',
  deliveryPrompt: 'Como deseja receber?\n\n1 — Envio\n2 — Entrega no endereço',
  savedAddressPrompt: 'Seu último endereço é:\n*{endereco}*\n\n1 — Usar este endereço\n2 — Informar outro endereço',
  addressInputPrompt: 'Envie seu *endereço completo em uma única mensagem*: rua, número, complemento (se houver), bairro, cidade/UF e CEP.',
  confirmationPrompt: '1 — Confirmar pedido\n2 — Alterar endereço\n0 — Cancelar',
  cancelled: 'Pedido cancelado. Voltamos ao cardápio.',
  paymentPending: 'Pedido *{pedido}* criado. Aguardando pagamento.',
  paymentConfirmed: '✅ Pagamento confirmado para o pedido *{pedido}*.',
  orderFinished: '✅ Pedido *{pedido}* finalizado.',
});
```

In `state-store.js`, merge custom message values over these defaults and always return a `settings` object.

- [ ] **Step 4: Remove production seed injection**

In `server/index.js`, replace seed imports/use with `DEFAULT_CHATBOT_MESSAGES` and initialize the operational database with empty arrays plus default settings. Keep `src/data.js` unchanged for tests/demo fixtures.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/state-store.test.mjs tests/runtime-seed.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/chatbot-messages.js server/state-store.js server/index.js tests/state-store.test.mjs tests/runtime-seed.test.mjs
git commit -m "feat: persist chatbot settings and start with empty operational data"
```

### Task 2: Make chatbot messages configurable with safe placeholders

**Files:**
- Modify: `server/chatbot-messages.js`
- Modify: `server/chatbot.js`
- Test: `tests/chatbot.test.mjs`
- Test: `tests/chatbot-messages.test.mjs`

**Interfaces:**
- Produces: `resolveChatbotMessage(state, key, values = {}) -> string`.
- Consumes: `state.settings.chatbotMessages` from Task 1.

- [ ] **Step 1: Write failing message resolver tests**

```js
assert.equal(
  resolveChatbotMessage({ settings: { chatbotMessages: { quantityPrompt: 'Leve {produto}; temos {estoque}.' } } }, 'quantityPrompt', { produto: 'Seda', estoque: 2 }),
  'Leve Seda; temos 2.'
);
assert.equal(resolveChatbotMessage({ settings: { chatbotMessages: { welcome: '   ' } } }, 'welcome', { cliente: 'Ana' }).includes('Ana'), true);
assert.equal(resolveChatbotMessage({ settings: { chatbotMessages: { welcome: 'Oi {desconhecido}' } } }, 'welcome', {}).includes('{desconhecido}'), true);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/chatbot-messages.test.mjs tests/chatbot.test.mjs`
Expected: FAIL because resolver does not exist and chatbot strings are hard-coded.

- [ ] **Step 3: Implement resolver**

```js
export function resolveChatbotMessage(state, key, values = {}) {
  const configured = state?.settings?.chatbotMessages?.[key];
  const template = typeof configured === 'string' && configured.trim() ? configured : DEFAULT_CHATBOT_MESSAGES[key] || '';
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token) =>
    Object.prototype.hasOwnProperty.call(values, token) ? String(values[token]) : match
  );
}
```

- [ ] **Step 4: Replace hard-coded flow text in `server/chatbot.js`**

Resolve at send time from `stateStore.load()`. Keep cart/product lists dynamic. Use configured keys for welcome, catalog header/instruction, invalid selection, quantity prompt/error, cart actions, delivery, saved/new address prompts, confirmation suffix, cancellation, and payment pending text.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/chatbot-messages.test.mjs tests/chatbot.test.mjs`
Expected: PASS with existing behavior plus custom-message cases.

- [ ] **Step 6: Commit**

```bash
git add server/chatbot-messages.js server/chatbot.js tests/chatbot-messages.test.mjs tests/chatbot.test.mjs
git commit -m "feat: configure WhatsApp flow messages from persisted settings"
```

### Task 3: Add real product create/edit/deactivate behavior to the admin

**Files:**
- Create: `src/product-editor.js`
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Test: `tests/product-editor.test.mjs`
- Test: `tests/frontend-persistence.test.mjs`

**Interfaces:**
- Produces: `normalizeProductInput(input, existing = null, now = () => new Date())`.
- Produces product shape `{ id, name, category, price, stock, reserved, active, createdAt, updatedAt }`.
- Admin persists through existing `PUT /api/state`.

- [ ] **Step 1: Write failing product normalization tests**

```js
const product = normalizeProductInput({ name: ' Seda ', category: 'Sedas', price: '7,50', stock: '12', active: true }, null, () => new Date('2026-09-14T20:00:00Z'));
assert.equal(product.name, 'Seda');
assert.equal(product.price, 7.5);
assert.equal(product.stock, 12);
assert.equal(product.reserved, 0);
assert.equal(product.active, true);
assert.match(product.id, /^p-/);
assert.throws(() => normalizeProductInput({ name: '', category: '', price: '-1', stock: '-2' }), /Nome do produto/);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/product-editor.test.mjs tests/frontend-persistence.test.mjs`
Expected: FAIL because product editor/form behavior does not exist.

- [ ] **Step 3: Implement `src/product-editor.js`**

Normalize decimal comma, validate non-negative price/integer stock, preserve `reserved` and `createdAt` on edit, update `updatedAt`, and generate stable IDs using `crypto.randomUUID()` when available with a timestamp fallback.

- [ ] **Step 4: Replace `+ Produto demo` with real product controls**

In `productsView()`:

```html
<button class="btn primary" data-product-new>+ Cadastrar produto</button>
```

Render actions per row:

```html
<button class="btn sm" data-product-edit="ID">Editar</button>
<button class="btn sm ghost" data-product-toggle="ID">Desativar</button>
```

Add a modal/drawer form with fields `name`, `category`, `price`, `stock`, `active`. Saving updates `state.products`, calls `persist()`, closes the editor, and rerenders. Remove the demo-product handler.

- [ ] **Step 5: Keep historical products non-destructive**

The deactivate action sets `active = false` and `updatedAt`. Reactivation sets `active = true`. Do not splice/delete products from `state.products`.

- [ ] **Step 6: Verify GREEN**

Run: `node --test tests/product-editor.test.mjs tests/frontend-persistence.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/product-editor.js src/app.js src/styles.css tests/product-editor.test.mjs tests/frontend-persistence.test.mjs
git commit -m "feat: manage real products in PrismaStore admin"
```

### Task 4: Add message settings UI and persist `settings`

**Files:**
- Create: `src/chatbot-settings.js`
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Test: `tests/chatbot-settings-ui.test.mjs`
- Test: `tests/frontend-persistence.test.mjs`

**Interfaces:**
- Produces: `CHATBOT_MESSAGE_FIELDS`, an ordered list of message key/label/placeholders.
- Consumes/persists `state.settings.chatbotMessages` through the existing `/api/state` endpoint.

- [ ] **Step 1: Write failing UI-source tests**

```js
assert.match(appSource, /Mensagens do atendimento/);
assert.match(appSource, /data-message-key/);
assert.match(appSource, /data-save-chatbot-messages/);
assert.match(appSource, /settings:\s*state\.settings/);
assert.doesNotMatch(appSource, /Produto demo/);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/chatbot-settings-ui.test.mjs tests/frontend-persistence.test.mjs`
Expected: FAIL because settings are not rendered or persisted.

- [ ] **Step 3: Add `src/chatbot-settings.js`**

Export field metadata for all keys in the spec and a helper that returns defaults for missing values. Include placeholder help such as `{cliente}`, `{produto}`, `{estoque}`, `{subtotal}`, `{pedido}`, `{endereco}`.

- [ ] **Step 4: Extend admin state/load/persist**

Initialize `state.settings = { chatbotMessages: {} }`; in `loadOperationalState()` read `persisted.settings`; in `persist()` send:

```js
JSON.stringify({
  products: state.products,
  customers: state.customers,
  orders: state.orders,
  settings: state.settings,
})
```

- [ ] **Step 5: Render settings groups**

Keep WhatsApp Web first, render `Mensagens do atendimento` as full-width card with textareas, per-field `Restaurar padrão`, and one `Salvar mensagens` button, then render `Sistema local` below.

- [ ] **Step 6: Wire save/reset events**

Update `state.settings.chatbotMessages` from textarea values, call `persist()`, and rerender a saved indicator. Reset only the selected field to its default.

- [ ] **Step 7: Verify GREEN**

Run: `node --test tests/chatbot-settings-ui.test.mjs tests/frontend-persistence.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/chatbot-settings.js src/app.js src/styles.css tests/chatbot-settings-ui.test.mjs tests/frontend-persistence.test.mjs
git commit -m "feat: configure chatbot flow messages from admin"
```

### Task 5: Make QR code compact by default

**Files:**
- Modify: `src/styles.css`
- Test: `tests/frontend-whatsapp.test.mjs`

**Interfaces:**
- No new JS API. Existing `.wa-qr` image remains the QR renderer.

- [ ] **Step 1: Write failing CSS assertions**

```js
assert.match(styles, /\.wa-qr\s*\{[^}]*width:\s*180px/s);
assert.match(styles, /@media\s*\(max-width:\s*520px\)[\s\S]*\.wa-qr\s*\{[^}]*width:\s*160px/s);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/frontend-whatsapp.test.mjs`
Expected: FAIL because current CSS uses `min(280px,100%)`.

- [ ] **Step 3: Implement compact QR CSS**

```css
.wa-qr { width:180px; max-width:100%; aspect-ratio:1; object-fit:contain; background:#fff; padding:8px; border-radius:5px; margin:8px auto; display:block; }
@media (max-width:520px) { .wa-qr { width:160px; } }
```

Do not lower the `QRCode.toDataURL(... width: 320 ...)` generation size in `server/index.js`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/frontend-whatsapp.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css tests/frontend-whatsapp.test.mjs
git commit -m "fix: keep WhatsApp QR compact in the admin"
```

### Task 6: Regression verification

**Files:**
- Modify only if a regression test reveals a defect.

**Interfaces:**
- Final persisted state shape remains backward-compatible with old databases and backups.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`
Expected: all tests pass, no unhandled rejection or syntax errors.

- [ ] **Step 2: Run targeted critical tests explicitly**

Run:

```bash
node --test tests/state-store.test.mjs tests/chatbot.test.mjs tests/app-server.test.mjs tests/frontend-persistence.test.mjs tests/frontend-whatsapp.test.mjs tests/product-editor.test.mjs tests/chatbot-settings-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Verify runtime behavior manually**

Run: `npm run start`
Expected: hero opens first; dashboard has no mock products on a fresh DB; Products can create/edit/deactivate; Configurações edits messages; WhatsApp QR renders compactly; scanning connects the account and hides the QR when `ready` fires.

- [ ] **Step 4: Final commit only if verification required fixes**

```bash
git add <only-files-fixed-during-verification>
git commit -m "fix: resolve PrismaStore integration regressions"
```
