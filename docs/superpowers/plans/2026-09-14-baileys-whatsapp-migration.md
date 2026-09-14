# Baileys WhatsApp Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PrismaStore's `whatsapp-web.js` transport with a Baileys-based transport that isolates every reply to the originating `remoteJid`, ignores history/replay events, preserves SQLite-backed chatbot state, and keeps the current Asaas Pix/payment flow unchanged.

**Architecture:** Keep the PrismaStore domain, chatbot, payment service, HTTP API, and SQLite state as-is. Replace only the WhatsApp transport/composition layer with a focused Baileys manager plus a Baileys-to-chatbot adapter, then update backup handling so the new Baileys auth directory is versioned and restored safely.

**Tech Stack:** Node.js 22, ESM, `@whiskeysockets/baileys`, `pino`, `qrcode`, Node test runner, SQLite, Asaas HTTP integration.

**Spec:** `docs/superpowers/specs/2026-09-14-baileys-whatsapp-migration-design.md`

## Global Constraints

- Keep the existing PrismaStore chatbot states, stock rules, customer/order persistence, and Asaas flow unchanged unless a compatibility test proves an interface adjustment is required.
- Process only Baileys `messages.upsert` events with `type === "notify"`.
- Ignore messages with `key.fromMe === true`, missing `message`, groups, status/broadcast JIDs, unsupported content, and duplicate message IDs.
- Every reply generated from one inbound event must be closed over the same originating `remoteJid`; no reply callback may accept a different recipient.
- Keep `/api/whatsapp/status`, `/api/whatsapp/connect`, and `/api/whatsapp/disconnect` response contracts compatible with the existing admin UI.
- Persist Baileys auth in `data/whatsapp-auth`.
- Do not delete `.wwebjs_auth` automatically.
- Keep Asaas as the source of truth for payment confirmation; do not add manual receipt validation.
- Backups created after migration must identify `whatsappAuthProvider: "baileys"`.
- Old backups may restore SQLite but must not silently restore old `whatsapp-web.js` auth as Baileys credentials.
- All behavior changes are implemented test-first; `npm test` must be green before merge.

---

## File Structure

- `server/whatsapp-jid.js` — owns JID classification and normalization helpers shared by manager and adapter.
- `server/whatsapp-chat-adapter.js` — converts one validated Baileys message into the existing chatbot `handleIncoming` contract and binds reply functions to one `remoteJid`.
- `server/whatsapp-manager.js` — owns Baileys socket lifecycle, auth state, QR/status mapping, reconnection, deduplication, inbound event filtering, and outbound send primitives.
- `server/index.js` — composition root: Baileys dependencies, auth path, manager wiring, QR encoding, backup auth path injection.
- `server/app-server.js` — accepts injected WhatsApp auth path/provider instead of assuming `.wwebjs_auth`.
- `server/backup-service.js` — writes/validates provider metadata and safely restores Baileys auth only when compatible.
- `package.json` / lockfile — remove `whatsapp-web.js`; add Baileys and logger dependency.
- `tests/whatsapp-jid.test.mjs` — JID normalization and classification.
- `tests/whatsapp-chat-adapter.test.mjs` — isolation, parsing, group/status rejection, media adaptation.
- `tests/whatsapp-manager.test.mjs` — `messages.upsert` filtering, deduplication, QR/status, reconnect, send behavior.
- `tests/runtime-wiring.test.mjs` — verifies composition uses Baileys and `data/whatsapp-auth`.
- `tests/backup-service.test.mjs` / `tests/backup-api.test.mjs` — Baileys auth provider/version behavior and legacy backup compatibility.
- `tests/installer.test.mjs` — verifies package/runtime install assumptions after Chromium/Puppeteer removal.

---

### Task 1: Add JID normalization and classification helpers

**Files:**
- Create: `server/whatsapp-jid.js`
- Create: `tests/whatsapp-jid.test.mjs`

**Interfaces:**
- Produces: `normalizeOutboundJid(value: string): string`
- Produces: `classifyInboundJid(jid: string): { supported: boolean, reason: string | null }`
- Produces: `phoneFromJid(jid: string): string`
- Consumes: nothing outside Node standard language features.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInboundJid, normalizeOutboundJid, phoneFromJid } from '../server/whatsapp-jid.js';

test('normalizes a plain phone to a Baileys individual jid', () => {
  assert.equal(normalizeOutboundJid('+55 (11) 99999-0000'), '5511999990000@s.whatsapp.net');
});

test('preserves complete Baileys jids', () => {
  assert.equal(normalizeOutboundJid('5511999990000@s.whatsapp.net'), '5511999990000@s.whatsapp.net');
  assert.equal(normalizeOutboundJid('123456789@lid'), '123456789@lid');
});

test('classifies only supported individual chats as inbound', () => {
  assert.deepEqual(classifyInboundJid('5511999990000@s.whatsapp.net'), { supported: true, reason: null });
  assert.deepEqual(classifyInboundJid('123456789@lid'), { supported: true, reason: null });
  assert.equal(classifyInboundJid('1203630@g.us').supported, false);
  assert.equal(classifyInboundJid('status@broadcast').supported, false);
  assert.equal(classifyInboundJid('').supported, false);
});

test('extracts numeric identity from supported jids', () => {
  assert.equal(phoneFromJid('5511999990000@s.whatsapp.net'), '5511999990000');
  assert.equal(phoneFromJid('123456789@lid'), '123456789');
});
```

- [ ] **Step 2: Run the tests and verify they fail because the module does not exist**

Run: `node --test tests/whatsapp-jid.test.mjs`

Expected: FAIL with module-not-found for `server/whatsapp-jid.js`.

- [ ] **Step 3: Implement the helpers**

```js
function digits(value = '') {
  return String(value).replace(/\D/g, '');
}

export function classifyInboundJid(jid = '') {
  const value = String(jid);
  if (!value) return { supported: false, reason: 'missing-jid' };
  if (value === 'status@broadcast' || value.endsWith('@broadcast')) return { supported: false, reason: 'broadcast' };
  if (value.endsWith('@g.us')) return { supported: false, reason: 'group' };
  if (value.endsWith('@s.whatsapp.net') || value.endsWith('@lid')) return { supported: true, reason: null };
  return { supported: false, reason: 'unsupported-jid' };
}

export function normalizeOutboundJid(value = '') {
  const raw = String(value).trim();
  if (!raw) throw new Error('Destinatário do WhatsApp inválido.');
  if (raw.includes('@')) return raw;
  const phone = digits(raw);
  if (!phone) throw new Error('Destinatário do WhatsApp inválido.');
  return `${phone}@s.whatsapp.net`;
}

export function phoneFromJid(jid = '') {
  return digits(String(jid).split('@')[0]);
}
```

- [ ] **Step 4: Run the focused tests**

Run: `node --test tests/whatsapp-jid.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/whatsapp-jid.js tests/whatsapp-jid.test.mjs
git commit -m "test: define WhatsApp JID safety contract"
```

---

### Task 2: Replace the adapter contract with Baileys message isolation

**Files:**
- Modify: `server/whatsapp-chat-adapter.js`
- Modify: `tests/whatsapp-chat-adapter.test.mjs`
- Consume: `server/whatsapp-jid.js`

**Interfaces:**
- Consumes: `createWhatsAppChatAdapter({ chatbot, readFile = ..., extname = ... })`
- Produces: `handleMessage({ message, socket }): Promise<object>`
- The adapter calls `chatbot.handleIncoming({ chatId, text, contactName, sendText, sendMedia })`.
- `sendText(text)` and `sendMedia(source)` are closures bound to the inbound `remoteJid` and accept no recipient argument.

- [ ] **Step 1: Rewrite/add tests that fail against the current `whatsapp-web.js` adapter**

```js
test('binds every reply to the inbound remoteJid', async () => {
  const sent = [];
  const socket = { sendMessage: async (jid, payload) => sent.push({ jid, payload }) };
  const chatbot = {
    handleIncoming: async ({ chatId, sendText }) => {
      assert.equal(chatId, '5511999990000@s.whatsapp.net');
      await sendText('resposta');
      return { handled: true };
    },
  };
  const adapter = createWhatsAppChatAdapter({ chatbot });
  await adapter.handleMessage({
    message: {
      key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id: 'A1' },
      pushName: 'Cliente A',
      message: { conversation: 'oi' },
    },
    socket,
  });
  assert.deepEqual(sent, [{ jid: '5511999990000@s.whatsapp.net', payload: { text: 'resposta' } }]);
});

test('never lets an inbound event from A send to B', async () => {
  const sent = [];
  const socket = { sendMessage: async (jid, payload) => sent.push({ jid, payload }) };
  const chatbot = {
    handleIncoming: async ({ sendText }) => {
      assert.equal(sendText.length, 1);
      await sendText('somente A');
      return { handled: true };
    },
  };
  const adapter = createWhatsAppChatAdapter({ chatbot });
  await adapter.handleMessage({
    message: { key: { remoteJid: '5511111111111@s.whatsapp.net', fromMe: false, id: 'A2' }, message: { conversation: 'teste' } },
    socket,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].jid, '5511111111111@s.whatsapp.net');
});

test('extracts extended text and ignores unsupported inbound jids', async () => {
  let calls = 0;
  const chatbot = { handleIncoming: async () => { calls += 1; } };
  const adapter = createWhatsAppChatAdapter({ chatbot });
  const socket = { sendMessage: async () => {} };

  await adapter.handleMessage({
    message: { key: { remoteJid: '1203630@g.us', fromMe: false, id: 'G1' }, message: { conversation: 'oi' } },
    socket,
  });
  await adapter.handleMessage({
    message: { key: { remoteJid: 'status@broadcast', fromMe: false, id: 'S1' }, message: { conversation: 'oi' } },
    socket,
  });

  assert.equal(calls, 0);
});
```

Also retain/adapt media tests to cover:

```js
await sendMedia('/tmp/catalog.png');
await sendMedia({ mimeType: 'image/png', base64: 'aGVsbG8=', filename: 'pix.png' });
```

Expected Baileys payloads:

```js
{ image: { url: '/tmp/catalog.png' } }
{ image: Buffer.from('aGVsbG8=', 'base64'), mimetype: 'image/png', fileName: 'pix.png' }
```

- [ ] **Step 2: Run adapter tests and verify red**

Run: `node --test tests/whatsapp-chat-adapter.test.mjs`

Expected: FAIL because current adapter expects `whatsapp-web.js` message/client semantics.

- [ ] **Step 3: Implement the Baileys adapter**

Implementation rules:

```js
function extractText(message) {
  return message?.message?.conversation ?? message?.message?.extendedTextMessage?.text ?? '';
}
```

For inbound validation:

```js
const jid = message?.key?.remoteJid ?? '';
if (message?.key?.fromMe) return { handled: false, reason: 'from-me' };
const classification = classifyInboundJid(jid);
if (!classification.supported) return { handled: false, reason: classification.reason };
const text = extractText(message).trim();
if (!text) return { handled: false, reason: 'unsupported-content' };
```

Bound senders:

```js
const sendText = (text) => socket.sendMessage(jid, { text: String(text) });
const sendMedia = (source) => {
  if (typeof source === 'string') return socket.sendMessage(jid, { image: { url: source } });
  if (source?.base64) {
    return socket.sendMessage(jid, {
      image: Buffer.from(source.base64, 'base64'),
      mimetype: source.mimeType || 'image/png',
      fileName: source.filename || 'imagem.png',
    });
  }
  throw new Error('Mídia do WhatsApp inválida.');
};
```

Call the existing chatbot contract with `chatId: jid`, `text`, `contactName: message.pushName ?? null`.

- [ ] **Step 4: Run adapter tests**

Run: `node --test tests/whatsapp-chat-adapter.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/whatsapp-chat-adapter.js tests/whatsapp-chat-adapter.test.mjs
git commit -m "feat: isolate Baileys replies to inbound chat"
```

---

### Task 3: Build the Baileys connection manager with strict `messages.upsert` filtering

**Files:**
- Rewrite: `server/whatsapp-manager.js`
- Rewrite/extend: `tests/whatsapp-manager.test.mjs`
- Consume: `server/whatsapp-jid.js`

**Interfaces:**
- Produces: `createWhatsAppManager({ socketFactory, authStateLoader, qrEncoder, messageHandler, disconnectReasonLoggedOut, reconnectDelayMs = 3000, schedule = setTimeout, maxSeenMessageIds = 1000 })`
- Returned API remains `{ connect, disconnect, getStatus, sendText, sendMedia }`.
- `messageHandler({ message, socket })` is invoked only for eligible `notify` events after deduplication.

- [ ] **Step 1: Add failing tests for the new event contract**

Required tests:

```js
test('processes notify messages exactly once and ignores append/history', async () => {
  // emit messages.upsert type notify with id A => 1 call
  // emit same id A again => still 1 call
  // emit type append id B => still 1 call
});

test('does not route fromMe/group/status/missing-content events to the chatbot', async () => {
  // emit each variant and assert messageHandler call count remains 0
});

test('two inbound contacts are handled independently', async () => {
  // emit A and B in one notify batch, assert handler gets A once and B once
});
```

Add lifecycle tests:

```js
test('qr event updates browser status and connection open marks connected', async () => {});
test('logged out close does not auto reconnect', async () => {});
test('recoverable close schedules one reconnect only', async () => {});
test('disconnect closes current socket without deleting auth state', async () => {});
```

Add outbound tests:

```js
test('sendText normalizes plain phone and preserves full jid', async () => {});
test('sendMedia sends local file and in-memory image through active socket', async () => {});
test('send operations fail clearly while disconnected', async () => {});
```

- [ ] **Step 2: Run manager tests and verify red**

Run: `node --test tests/whatsapp-manager.test.mjs`

Expected: FAIL because current manager listens to `client.on('message')` and uses `whatsapp-web.js` semantics.

- [ ] **Step 3: Implement manager state and auth loading**

Manager state:

```js
let socket = null;
let reconnectTimer = null;
let status = { status: 'disconnected', qrDataUrl: null, account: null, error: null };
const seenIds = new Set();
const seenQueue = [];
```

Deduplication helper:

```js
function markSeen(id) {
  if (!id) return true;
  if (seenIds.has(id)) return false;
  seenIds.add(id);
  seenQueue.push(id);
  while (seenQueue.length > maxSeenMessageIds) seenIds.delete(seenQueue.shift());
  return true;
}
```

`connect()` must call `authStateLoader()` to obtain `{ state, saveCreds }`, then create a socket from `socketFactory({ auth: state })` and wire `creds.update`, `connection.update`, and `messages.upsert`.

- [ ] **Step 4: Implement strict inbound routing**

Inside `messages.upsert`:

```js
if (type !== 'notify') return;
for (const message of messages ?? []) {
  if (message?.key?.fromMe) continue;
  if (!message?.message) continue;
  const jid = message?.key?.remoteJid ?? '';
  if (!classifyInboundJid(jid).supported) continue;
  if (!markSeen(message?.key?.id)) continue;
  await messageHandler({ message, socket: activeSocket });
}
```

Do not inspect customers, sessions, or orders in the manager.

- [ ] **Step 5: Implement QR/status and reconnection behavior**

On `connection.update`:

```js
if (qr) setStatus({ status: 'qr', qrDataUrl: await qrEncoder(qr), error: null });
if (connection === 'open') setStatus({ status: 'connected', qrDataUrl: null, account: accountFromSocket(socket), error: null });
if (connection === 'close') {
  const loggedOut = statusCode === disconnectReasonLoggedOut;
  socket = null;
  setStatus({ status: 'disconnected', qrDataUrl: null, account: null, error: loggedOut ? 'Sessão do WhatsApp encerrada.' : null });
  if (!loggedOut) scheduleReconnectOnce();
}
```

`disconnect()` clears a pending reconnect timer and terminates the socket without deleting auth files.

- [ ] **Step 6: Implement outbound sends**

```js
async function sendText(phoneOrJid, text) {
  if (!socket || status.status !== 'connected') throw new Error('WhatsApp não conectado.');
  return socket.sendMessage(normalizeOutboundJid(phoneOrJid), { text: String(text) });
}
```

`sendMedia` must support file path and Base64 object using the same payload shapes as Task 2.

- [ ] **Step 7: Run manager and adapter tests**

Run: `node --test tests/whatsapp-manager.test.mjs tests/whatsapp-chat-adapter.test.mjs tests/whatsapp-jid.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/whatsapp-manager.js tests/whatsapp-manager.test.mjs
git commit -m "feat: replace WhatsApp runtime with Baileys manager"
```

---

### Task 4: Replace runtime composition and dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server/index.js`
- Modify: `tests/runtime-wiring.test.mjs`
- Modify: `tests/installer.test.mjs`

**Interfaces:**
- Consumes: `createWhatsAppManager`, `createWhatsAppChatAdapter`, `useMultiFileAuthState`, `fetchLatestBaileysVersion`, default Baileys socket factory, `DisconnectReason.loggedOut`.
- Produces: the same HTTP server/runtime behavior from `server/index.js`.

- [ ] **Step 1: Add failing runtime/source-contract tests**

Assertions should verify:

```js
assert.match(indexSource, /@whiskeysockets\/baileys/);
assert.doesNotMatch(indexSource, /whatsapp-web\.js/);
assert.match(indexSource, /dataDir, 'whatsapp-auth'/);
assert.match(indexSource, /useMultiFileAuthState/);
assert.match(indexSource, /fetchLatestBaileysVersion/);
assert.match(packageJson.dependencies['@whiskeysockets/baileys'], /^\^/);
assert.ok(packageJson.dependencies.pino);
assert.equal(packageJson.dependencies['whatsapp-web.js'], undefined);
```

Installer/package tests must no longer require Chromium/Puppeteer-specific runtime setup.

- [ ] **Step 2: Run runtime and installer tests and verify red**

Run: `node --test tests/runtime-wiring.test.mjs tests/installer.test.mjs`

Expected: FAIL on current `whatsapp-web.js` imports/dependency/auth path.

- [ ] **Step 3: Update dependencies**

Change runtime dependencies to include:

```json
{
  "@whiskeysockets/baileys": "^6.7.16",
  "pino": "^9.6.0",
  "qrcode": "1.5.4"
}
```

Remove `whatsapp-web.js`. Regenerate lockfile using:

```bash
npm install
```

- [ ] **Step 4: Recompose `server/index.js` around Baileys**

Use:

```js
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
```

Define:

```js
const authPath = join(dataDir, 'whatsapp-auth');
const logger = pino({ level: 'silent' });
```

`authStateLoader`:

```js
const authStateLoader = () => useMultiFileAuthState(authPath);
```

`socketFactory`:

```js
const socketFactory = async ({ auth }) => {
  const { version } = await fetchLatestBaileysVersion();
  return makeWASocket({
    version,
    auth,
    logger,
    printQRInTerminal: false,
    browser: ['PrismaStore', 'Chrome', '1.0.0'],
  });
};
```

Pass `DisconnectReason.loggedOut` to the manager.

Keep `createTerminalQrEncoder({ QRCode })` for browser QR data URL/terminal representation if the helper already supports both; otherwise adapt the composition without changing the API contract.

- [ ] **Step 5: Run focused runtime tests**

Run: `node --test tests/runtime-wiring.test.mjs tests/installer.test.mjs tests/whatsapp-manager.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/index.js tests/runtime-wiring.test.mjs tests/installer.test.mjs
git commit -m "build: wire PrismaStore runtime to Baileys"
```

---

### Task 5: Make backup/restore provider-aware and migrate auth path safely

**Files:**
- Modify: `server/backup-service.js`
- Modify: `server/app-server.js`
- Modify: `server/index.js`
- Modify: `tests/backup-service.test.mjs`
- Modify: `tests/backup-api.test.mjs`
- Modify: `tests/app-server.test.mjs`

**Interfaces:**
- `createBackupService({ stateStore, whatsappManager, authPath, backupsDir, appVersion, whatsappAuthProvider = 'baileys', now, suffix })`
- Backup manifest adds `whatsappAuthProvider`.
- `createAppServer` receives `whatsappAuthPath` and `whatsappAuthProvider` or a fully created `backupService`.

- [ ] **Step 1: Add failing provider-aware backup tests**

New backup test:

```js
const backup = await service.createBackup({ reason: 'manual' });
const manifest = JSON.parse(readFileSync(join(backupsDir, backup.id, 'manifest.json'), 'utf8'));
assert.equal(manifest.whatsappAuthProvider, 'baileys');
assert.equal(manifest.hasWhatsAppSession, true);
```

Legacy restore test:

```js
// build a valid old-format backup with hasWhatsAppSession=true but no whatsappAuthProvider
// restore it
// assert SQLite state is restored
// assert Baileys authPath is left empty/not populated from legacy auth bytes
```

Compatible restore test:

```js
// manifest whatsappAuthProvider='baileys'
// restore
// assert auth files are restored and manager reconnects if it was active
```

- [ ] **Step 2: Run backup tests and verify red**

Run: `node --test tests/backup-service.test.mjs tests/backup-api.test.mjs tests/app-server.test.mjs`

Expected: FAIL because provider metadata and injected Baileys auth path are not implemented.

- [ ] **Step 3: Add provider metadata to new snapshots**

Manifest must include:

```js
whatsappAuthProvider,
```

Keep current checksum/integrity behavior unchanged.

- [ ] **Step 4: Make restore auth conditional on provider compatibility**

Replace unconditional auth restoration with logic equivalent to:

```js
function shouldRestoreAuth(manifest) {
  return manifest.hasWhatsAppSession && manifest.whatsappAuthProvider === whatsappAuthProvider;
}
```

If the manifest lacks the provider or contains a different provider:

```js
rmSync(authPath, { recursive: true, force: true });
```

Then restore SQLite normally, but do not copy incompatible auth bytes into the Baileys auth directory.

- [ ] **Step 5: Inject auth path/provider from `server/index.js` through `createAppServer`**

`createAppServer` must not hardcode `.wwebjs_auth` anymore. If it creates the backup service internally, pass the injected values:

```js
createBackupService({
  stateStore,
  whatsappManager,
  authPath: whatsappAuthPath,
  whatsappAuthProvider,
  backupsDir: join(staticDir, 'backups'),
  appVersion: '0.9.2',
});
```

From `server/index.js`:

```js
whatsappAuthPath: authPath,
whatsappAuthProvider: 'baileys',
```

- [ ] **Step 6: Run backup/API tests**

Run: `node --test tests/backup-service.test.mjs tests/backup-api.test.mjs tests/app-server.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/backup-service.js server/app-server.js server/index.js tests/backup-service.test.mjs tests/backup-api.test.mjs tests/app-server.test.mjs
git commit -m "feat: version WhatsApp auth backups for Baileys"
```

---

### Task 6: Verify payment and order lifecycle regressions against the new transport

**Files:**
- Modify only if tests require interface adaptation: `server/payment-chatbot.js`, `server/order-lifecycle-service.js`, `server/payment-service.js`
- Extend: `tests/payment-chatbot.test.mjs`
- Extend: `tests/order-message-settings.test.mjs`
- Extend: `tests/app-server.test.mjs`
- Extend: `tests/chatbot-configured-flow.test.mjs`

**Interfaces:**
- Existing payment and order-domain interfaces remain unchanged.
- WhatsApp manager still exposes `sendText(phoneOrJid, text)` and `sendMedia(phoneOrJid, source)` for out-of-band lifecycle/webhook notifications.

- [ ] **Step 1: Add transport-regression tests without changing payment logic**

Add tests proving:

```js
// confirmed checkout -> PAYMENT_PENDING
// payment chatbot requests CPF/CNPJ only when needed
// generated Pix calls sendMedia({ mimeType, base64, filename }) and sendText(...)
// awaiting_payment message still says no receipt is required
// duplicate Asaas event does not notify twice
// PAID lifecycle notification calls manager.sendText(order.phone, ...)
```

Add an explicit recipient regression:

```js
assert.equal(sent[0].phone, order.phone);
```

- [ ] **Step 2: Run payment/lifecycle tests**

Run: `node --test tests/payment-chatbot.test.mjs tests/order-message-settings.test.mjs tests/app-server.test.mjs tests/chatbot-configured-flow.test.mjs`

Expected: ideally PASS immediately. If they fail only because of media/manager interface shape, make the smallest compatibility change necessary; do not redesign payment behavior.

- [ ] **Step 3: If required, adapt only the boundary shape**

Allowed compatibility changes:

```js
await messenger.sendMedia(order.phone, finalArtworkPath);
await messenger.sendText(order.phone, text);
```

or Base64 source field naming alignment to `{ mimeType, base64, filename }`.

Do not change order status transitions, Pix generation, webhook idempotency, or stock consumption rules.

- [ ] **Step 4: Re-run payment/lifecycle tests**

Run the same command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit if any source/test changes were needed**

```bash
git add server/payment-chatbot.js server/order-lifecycle-service.js server/payment-service.js tests/payment-chatbot.test.mjs tests/order-message-settings.test.mjs tests/app-server.test.mjs tests/chatbot-configured-flow.test.mjs
git commit -m "test: preserve Asaas flow across Baileys migration"
```

If no source changes are required, commit only the regression tests.

---

### Task 7: Add end-to-end routing isolation tests at the manager + adapter boundary

**Files:**
- Create: `tests/whatsapp-routing-isolation.test.mjs`

**Interfaces:**
- Composes the real `createWhatsAppManager` and `createWhatsAppChatAdapter` with fake Baileys socket/events and a fake chatbot.

- [ ] **Step 1: Write the failing/guard tests**

Primary safety scenario:

```js
test('a message from A can never emit a reply to B', async () => {
  // create fake socket/event emitter
  // manager receives notify event from A
  // fake chatbot calls bound sendText('ok')
  // assert socket.sendMessage called exactly once with A remoteJid
  // assert never called with B
});
```

Parallel isolation scenario:

```js
test('parallel notify events from A and B keep their own recipients', async () => {
  // handler for A awaits a small deferred promise
  // B is processed while A is pending
  // both reply
  // assert reply texts and jids remain correctly paired
});
```

Replay/history scenario:

```js
test('append and duplicate notify events do not restart conversations', async () => {
  // append id X -> 0 chatbot calls
  // notify id Y -> 1 call
  // notify id Y again -> still 1
});
```

- [ ] **Step 2: Run the new isolation test file**

Run: `node --test tests/whatsapp-routing-isolation.test.mjs`

Expected: PASS if Tasks 2–3 are correct. A failure here blocks migration even if unit tests pass.

- [ ] **Step 3: Make only boundary fixes if the integrated test reveals a gap**

Allowed fixes are limited to manager/adapter isolation, filtering, or deduplication. Do not alter chatbot/payment domain code to satisfy routing tests.

- [ ] **Step 4: Re-run isolation and focused WhatsApp tests**

Run:

```bash
node --test tests/whatsapp-routing-isolation.test.mjs tests/whatsapp-manager.test.mjs tests/whatsapp-chat-adapter.test.mjs tests/whatsapp-jid.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/whatsapp-routing-isolation.test.mjs server/whatsapp-manager.js server/whatsapp-chat-adapter.js
git commit -m "test: lock WhatsApp recipient isolation"
```

---

### Task 8: Run full verification and update operational documentation

**Files:**
- Modify: `README.md` or existing customer install/run documentation that references WhatsApp auth/QR/runtime
- Modify if needed: `.gitignore`
- Modify: `docs/superpowers/specs/2026-09-14-baileys-whatsapp-migration-design.md` only if implementation reveals a factual mismatch that must be reconciled

**Interfaces:**
- No new runtime interfaces.

- [ ] **Step 1: Ensure runtime auth directories are ignored correctly**

`.gitignore` must ignore:

```gitignore
data/whatsapp-auth/
.wwebjs_auth/
```

The old directory remains ignored/preserved but unused.

- [ ] **Step 2: Update run/migration docs**

Document exactly:

```text
1. pull/install the new version
2. run npm install
3. start PrismaStore
4. scan the new Baileys QR once
5. test with one controlled WhatsApp number
6. verify catalog -> order -> Pix -> webhook confirmation
7. only then enable normal customer operation
```

State that `.wwebjs_auth` is not reused and can remain as rollback material.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
npm test
```

Expected: all tests PASS, zero failures.

- [ ] **Step 4: Run dependency/install verification**

Run:

```bash
npm install --ignore-scripts
npm test
```

Expected: install completes and full test suite remains green. Record any existing audit warnings separately; do not treat pre-existing dependency audit warnings as test success.

- [ ] **Step 5: Check source for forbidden legacy runtime references**

Run:

```bash
git grep -n "whatsapp-web.js\|MessageMedia\|LocalAuth\|\.wwebjs_auth" -- ':!docs/**' ':!README.md'
```

Expected: no active runtime references to `whatsapp-web.js`, `MessageMedia`, or `LocalAuth`. `.wwebjs_auth` may remain only in explicit migration/legacy-backup handling or ignored-path documentation.

- [ ] **Step 6: Commit documentation/cleanup**

```bash
git add README.md .gitignore docs/superpowers/specs/2026-09-14-baileys-whatsapp-migration-design.md
git commit -m "docs: document Baileys WhatsApp migration"
```

- [ ] **Step 7: Verify branch diff against the approved spec**

Run:

```bash
git diff main...HEAD --stat
git diff main...HEAD -- package.json server tests README.md .gitignore
```

Expected: changes are limited to WhatsApp transport, backup compatibility, dependency/runtime wiring, tests, and migration docs; no unrelated UI/domain refactor.

---

## Self-Review

### Spec coverage

- Transport replacement with Baileys: Tasks 3–4.
- `messages.upsert` notify-only filtering: Task 3.
- strict recipient isolation: Tasks 2 and 7.
- mandatory bounded deduplication: Task 3.
- support for `@s.whatsapp.net` and `@lid`: Task 1.
- ignore group/status/fromMe/history/unsupported content: Tasks 2–3.
- QR/status/reconnection contract: Task 3.
- preserved admin HTTP endpoints: Tasks 4–5 regression coverage through app-server tests.
- media sending for welcome/catalog/Pix/final art: Tasks 2–3 and 6.
- Baileys auth in `data/whatsapp-auth`: Task 4.
- preserve old `.wwebjs_auth` without using it: Tasks 4, 5, 8.
- backup provider versioning and safe legacy restore: Task 5.
- preserve SQLite chatbot state machine: Task 6 regression suite.
- preserve Asaas automatic confirmation: Task 6.
- no manual receipt validation: enforced by unchanged payment-domain behavior and regression tests in Task 6.
- operational migration validation: Task 8.

### Placeholder scan

No `TBD`, `TODO`, “implement later”, or undefined placeholder steps remain. Every task contains a concrete failing test target, implementation boundary, verification command, and commit action.

### Type/interface consistency

- Adapter consistently consumes `{ message, socket }` and exposes only bound `sendText(text)` / `sendMedia(source)` to the chatbot.
- Manager consistently exposes public `{ connect, disconnect, getStatus, sendText(phoneOrJid, text), sendMedia(phoneOrJid, source) }` for app-server/lifecycle usage.
- JID normalization lives only in `server/whatsapp-jid.js` and is shared by manager/adapter.
- Auth path is consistently `data/whatsapp-auth` and backup provider is consistently `"baileys"`.
- Existing chatbot/payment contracts remain unchanged except for transport-boundary adaptation.
