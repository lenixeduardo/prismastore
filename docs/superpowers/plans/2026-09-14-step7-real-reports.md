# PrismaStore Step 7 Real Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace demo reporting with real monthly financial reports derived from SQLite, including revenue, paid orders, average ticket, receiving-account breakdown, daily totals, and CSV export.

**Architecture:** Add a focused report service that reads the persisted operational state and treats `paidAt` as the financial source of truth even after orders progress to packing/shipping/delivered. Expose monthly JSON and CSV endpoints from the existing Node server, then make the admin Reports view consume those real results with a month selector.

**Tech Stack:** Node.js 22+, native SQLite through the existing state store, vanilla JavaScript admin UI, Node test runner.

**Spec:** `docs/MVP_STATUS.md`

## Global Constraints

- Keep one Node.js process and the existing SQLite state store.
- Do not add PostgreSQL, Redis, queues, ORM, or chart dependencies.
- Financial inclusion is based on `paidAt`, not the current operational order status.
- Receiving-account totals must come from `receivingAccountId` written by the payment provider/webhook.
- CSV and dashboard must use the same report calculation.

---

### Task 1: Correct monthly financial calculation

**Files:**
- Modify: `src/domain.js`
- Test: `tests/domain.test.mjs`

**Interfaces:**
- Produces: `buildMonthlyReport(orders, monthKey)` including all orders with `paidAt` in the month and `byDay` totals.

- [ ] Write a failing test proving DELIVERED/PACKING paid orders remain in revenue.
- [ ] Run the focused test and confirm failure.
- [ ] Update `buildMonthlyReport` minimally.
- [ ] Re-run focused tests.

### Task 2: Add report service and CSV export

**Files:**
- Create: `server/report-service.js`
- Test: `tests/report-service.test.mjs`

**Interfaces:**
- Produces: `createReportService({ stateStore, receivingAccounts })` with `getMonthlyReport(monthKey)` and `exportMonthlyCsv(monthKey)`.

- [ ] Write failing service tests for summary, account labels, daily totals, month validation, and CSV.
- [ ] Run and confirm failures.
- [ ] Implement minimal report service.
- [ ] Re-run service tests.

### Task 3: Expose report API

**Files:**
- Modify: `server/app-server.js`
- Modify: `server/index.js`
- Test: `tests/app-server.test.mjs`
- Test: `tests/runtime-wiring.test.mjs`

**Interfaces:**
- Produces: `GET /api/reports/monthly?month=YYYY-MM` and `GET /api/reports/monthly.csv?month=YYYY-MM`.

- [ ] Write failing API/runtime wiring tests.
- [ ] Run and confirm failures.
- [ ] Wire report service and endpoints.
- [ ] Re-run tests.

### Task 4: Replace demo Reports UI

**Files:**
- Modify: `src/app.js`
- Test: `tests/reports-ui.test.mjs`

**Interfaces:**
- Consumes: report API monthly JSON/CSV endpoints.

- [ ] Write a failing static behavior test for month selector, real API fetch, and CSV export.
- [ ] Run and confirm failure.
- [ ] Replace hard-coded September/demo chart with real monthly data rendering.
- [ ] Re-run tests.

### Task 5: Version, docs, verification and GitHub merge

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `PRISMASTORE_TODO.md`
- Modify: `docs/MVP_STATUS.md`
- Create: `docs/PASSO_7.md`

- [ ] Set version to `0.7.0`.
- [ ] Document report rules and CSV export.
- [ ] Run `npm test` and `node --check` on changed JS files.
- [ ] Commit to a feature branch, open PR, merge to `main`, verify remote SHA and version.
