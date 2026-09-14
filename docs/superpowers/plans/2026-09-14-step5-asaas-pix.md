# PrismaStore Step 5 Asaas Pix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a dynamic Pix charge in Asaas Sandbox for a WhatsApp order, send QR/copy-paste to the customer, and move the order to PAID/Embalar from an authenticated webhook.

**Architecture:** Keep the existing single Node.js process and SQLite. Add a small Asaas HTTP client and payment service, inject the service into the chatbot and HTTP server, and keep all provider secrets in environment variables.

**Tech Stack:** Node.js 22+, node:http, node:sqlite, whatsapp-web.js, Asaas REST API.

**Spec:** PrismaStore MVP v0.4.0 / Step 5 described in README and conversation.

## Global Constraints

- No PostgreSQL, Redis, queues, workers, or ORM.
- Sandbox is the default Asaas environment.
- API key and webhook token must never be committed.
- Raw CPF/CNPJ must not be persisted in PrismaStore state or chat sessions.
- Payment webhooks must be idempotent and validate the Asaas payment ID and amount.

---

### Task 1: Asaas API client
- [ ] Add failing tests for auth headers, customer creation, PIX payment creation, QR retrieval, and API errors.
- [ ] Implement `server/asaas-client.js`.
- [ ] Run tests.

### Task 2: Payment service and webhook state transition
- [ ] Add failing tests for customer reuse, payment idempotency, paid transition, stock consumption, amount mismatch, and duplicate webhook.
- [ ] Implement `server/payment-service.js` plus reserved-stock consumption helper.
- [ ] Run tests.

### Task 3: WhatsApp Pix journey
- [ ] Add failing tests for CPF/CNPJ prompt, Pix QR media, copy-paste text, and awaiting-payment state.
- [ ] Extend chatbot and WhatsApp media adapter.
- [ ] Run tests.

### Task 4: HTTP webhook and runtime wiring
- [ ] Add failing tests for authenticated `/api/webhooks/asaas` and payment status endpoint.
- [ ] Wire Asaas client/payment service in `server/index.js` and `server/app-server.js`.
- [ ] Add WhatsApp payment-confirmed notification.
- [ ] Run full suite.

### Task 5: Docs/version/repository
- [ ] Update `.env.example`, `.gitignore`, README, TODO, architecture/status docs, and bump to 0.5.0.
- [ ] Verify full suite and syntax.
- [ ] Commit through GitHub and merge to `main`.
