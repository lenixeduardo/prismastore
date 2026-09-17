# PrismaStore Mobile Auth, Pairing and Drive Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the PrismaStore admin, add same-phone WhatsApp pairing by code, and sync local backups automatically to Google Drive.

**Architecture:** Add a focused in-memory auth service and enforce it centrally in `app-server.js`; extend the Baileys manager with pairing-code support while keeping QR; add a Google Drive REST provider plus scheduler layered on the existing local backup service. Frontend additions are isolated to an auth gate, WhatsApp onboarding, and backup status UI.

**Tech Stack:** Node.js 22 ESM, native `node:crypto`, native `fetch`, Baileys 6, browser ES modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-mobile-auth-pairing-drive-design.md`

## Global Constraints

- No new paid service or recurring dependency.
- No password, Google OAuth secret/token, session token, or WhatsApp auth data may be committed.
- Existing QR pairing remains functional.
- Existing Pix, chatbot, orders, reports, SQLite and local restore behavior remain functional.
- Admin API protection must be enforced server-side.
- Google Drive failure must never invalidate a successfully created local backup.

---

### Task 1: Admin authentication service and API enforcement

**Files:**
- Create: `server/auth-service.js`
- Modify: `server/app-server.js`
- Modify: `server/index.js`
- Create: `tests/auth-service.test.mjs`
- Create: `tests/auth-api.test.mjs`

**Interfaces:**
- Produces `createAuthService({ username, password, sessionHours, now, randomToken, maxAttempts, lockoutMs })`.
- Auth service exposes `enabled`, `login({ username, password, clientKey })`, `authenticate(cookieHeader)`, `logout(cookieHeader)`, `session()`, `cookieFor(token, { secure })`, and `clearCookie({ secure })`.
- `createAppServer` accepts optional `authService`.

- [ ] **Step 1: Write failing auth-service tests** for valid login, invalid login, 5-attempt lockout, expiry, cookie parsing and logout revocation.
- [ ] **Step 2: Run CI on the feature branch and verify RED** because `server/auth-service.js` does not exist.
- [ ] **Step 3: Implement `server/auth-service.js`** using `scryptSync`, `randomBytes`, `timingSafeEqual`, opaque in-memory sessions and lockout map.
- [ ] **Step 4: Write failing API auth tests** proving `/api/state` returns 401 without a session, login returns `Set-Cookie`, authenticated access succeeds, and logout revokes the session.
- [ ] **Step 5: Enforce authentication centrally in `server/app-server.js`** before protected API routes while keeping auth endpoints public.
- [ ] **Step 6: Wire environment configuration in `server/index.js`** and fail fast when `NODE_ENV=production` has no admin password.
- [ ] **Step 7: Run the full test suite and commit the green task.**

### Task 2: Mobile login gate

**Files:**
- Create: `src/auth-gate.js`
- Create: `src/auth-gate.css`
- Modify: `index.html`
- Modify: `src/hero.js`
- Modify: `src/app.js`
- Modify: `service-worker.js`
- Create: `tests/auth-ui.test.mjs`

**Interfaces:**
- Browser module exports `ensureAdminSession()`, `showLogin()`, `logoutAdmin()`.
- Emits `prismastore:authenticated` after login and `prismastore:logged-out` after logout.
- `hero.js` calls the gate before revealing `#app`.
- `app.js` treats 401 as signed-out rather than a generic local-server failure.

- [ ] **Step 1: Write failing UI contract tests** for login form, `credentials: 'same-origin'`, authenticated event, logout button and index inclusion.
- [ ] **Step 2: Verify RED in CI.**
- [ ] **Step 3: Implement the mobile-first login gate and CSS.**
- [ ] **Step 4: Integrate hero/dashboard entry and logout in Configurações.**
- [ ] **Step 5: Bump PWA cache version and include new static files.**
- [ ] **Step 6: Run full suite and commit green.**

### Task 3: WhatsApp phone-number pairing code

**Files:**
- Modify: `server/whatsapp-manager.js`
- Modify: `server/app-server.js`
- Modify: `server/index.js`
- Modify: `src/whatsapp-onboarding.js`
- Modify: `src/admin-shell-fixes.css`
- Modify: `tests/whatsapp-manager-baileys.test.mjs`
- Modify: `tests/app-server.test.mjs`
- Modify: `tests/frontend-whatsapp.test.mjs`
- Modify: `tests/runtime-baileys-contract.test.mjs`

**Interfaces:**
- WhatsApp manager adds `requestPairingCode(phone)`.
- Status shape adds nullable `pairingCode`.
- `POST /api/whatsapp/pairing-code` body `{ phone }` returns updated status.

- [ ] **Step 1: Add failing manager test** asserting digit normalization and `socket.requestPairingCode` invocation.
- [ ] **Step 2: Add failing API test** for the authenticated pairing-code endpoint.
- [ ] **Step 3: Verify RED in CI.**
- [ ] **Step 4: Implement pairing-code support in manager and API.**
- [ ] **Step 5: Extend onboarding UI** with number field, generate/copy code action and QR fallback.
- [ ] **Step 6: Update frontend/runtime contract tests and run full suite.**
- [ ] **Step 7: Commit green.**

### Task 4: Google Drive provider and external sync state

**Files:**
- Create: `server/google-drive-backup-provider.js`
- Modify: `server/backup-service.js`
- Create: `tests/google-drive-backup-provider.test.mjs`
- Modify: `tests/backup-service.test.mjs`
- Modify: `tests/backup-api.test.mjs`

**Interfaces:**
- `createGoogleDriveBackupProvider({ clientId, clientSecret, refreshToken, parentFolderId, fetchImpl })` exposes `configured`, `uploadBackupDirectory({ id, path })`, `getStatus()`.
- `createBackupService` accepts optional `externalBackupProvider` and persists external sync metadata in `backups/.external-sync.json`.
- Backup summaries add `external: { provider, status, syncedAt, remoteFolderId, error }`.

- [ ] **Step 1: Write failing provider tests** for OAuth token refresh, folder creation and recursive multipart upload using a fake fetch.
- [ ] **Step 2: Write failing backup-service tests** proving local success survives external failure and external metadata is persisted.
- [ ] **Step 3: Verify RED in CI.**
- [ ] **Step 4: Implement Google Drive REST provider without a new npm dependency.**
- [ ] **Step 5: Integrate external sync into manual/local backup creation and list summaries.**
- [ ] **Step 6: Run full suite and commit green.**

### Task 5: Automatic backup scheduler and admin status

**Files:**
- Create: `server/backup-scheduler.js`
- Modify: `server/index.js`
- Modify: `.env.example`
- Modify: `src/backup-ui.js`
- Modify: `src/backup.css`
- Modify: `service-worker.js`
- Create: `tests/backup-scheduler.test.mjs`
- Modify: `tests/backup-runtime.test.mjs`
- Modify: `tests/backup-ui.test.mjs`

**Interfaces:**
- `startBackupScheduler({ backupService, intervalHours, now, schedule, clearSchedule })` exposes `stop()` and `runIfDue()`.
- Runtime starts scheduler only when Google Drive provider is configured.

- [ ] **Step 1: Write failing scheduler tests** for due/not-due behavior and stop semantics.
- [ ] **Step 2: Verify RED in CI.**
- [ ] **Step 3: Implement scheduler and runtime wiring.**
- [ ] **Step 4: Document all auth/Drive env keys in `.env.example`.**
- [ ] **Step 5: Extend backup UI** to show local state, Drive state, last external sync and sync error.
- [ ] **Step 6: Bump service-worker cache and run full suite.**
- [ ] **Step 7: Commit green.**

### Task 6: Final verification and integration

**Files:**
- Review all changed files
- Update: `README.md` only if operational setup steps are missing

- [ ] **Step 1: Run full CI on the final branch head.**
- [ ] **Step 2: Review branch diff for secrets and accidental credential material.**
- [ ] **Step 3: Verify server-side protection, pairing endpoint, Drive fallback behavior and scheduler tests are all green.**
- [ ] **Step 4: Open PR to `main`, review diff, and merge only after CI succeeds.**
