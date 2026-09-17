# PrismaStore Mobile Security, Pairing and Drive Backup Design

## Goal

Complete the three missing mobile-operation blocks requested for PrismaStore without adding paid infrastructure: protected admin access, WhatsApp phone-number pairing, and automatic off-VM backups to Google Drive.

## 1. Admin authentication

PrismaStore has one administrator. The server reads the administrator credentials from environment variables and never persists the plaintext password in SQLite or source control.

### Configuration

- `PRISMASTORE_ADMIN_USER` defaults to `admin`.
- `PRISMASTORE_ADMIN_PASSWORD` is required for protected production use.
- `PRISMASTORE_SESSION_HOURS` defaults to `12`.
- `PRISMASTORE_AUTH_SECURE_COOKIE` may force secure cookies; otherwise HTTPS/proxy headers determine the `Secure` attribute.

### Session model

- Password verification is performed server-side with a deliberately expensive `scrypt` derivation and timing-safe comparison.
- Successful login creates a cryptographically-random opaque session token stored only in server memory.
- Browser receives only an `HttpOnly`, `SameSite=Strict`, path `/` cookie.
- Session expires after 12 hours by default.
- Logout revokes the current token and clears the cookie.
- Five failed login attempts from the same client key cause a 15-minute lockout.
- Static login assets remain reachable without authentication.
- Every `/api/*` route except `/api/auth/login`, `/api/auth/session`, and `/api/auth/logout` requires a valid session.

### Browser gate

The hero remains the public initial page. Clicking `Acessar painel de controle` checks the session. If authenticated it opens the admin. If not, a mobile-first login modal is shown. After successful login the existing dashboard flow continues unchanged. A logout action is exposed in Configurações.

## 2. WhatsApp pairing from the same phone

QR remains supported. A second option pairs by phone number using Baileys `requestPairingCode`.

### Flow

1. Admin opens the WhatsApp onboarding card.
2. Admin enters a Brazilian or international number.
3. Frontend posts the normalized digits to `POST /api/whatsapp/pairing-code`.
4. WhatsApp manager ensures a Baileys socket exists and calls `socket.requestPairingCode(phone)`.
5. API returns the pairing code only to an authenticated admin session.
6. UI displays a copyable code and instructions for WhatsApp → Aparelhos conectados → Conectar com número de telefone.
7. QR remains available as fallback.

Pairing status includes `pairingCode` only while pairing is pending and clears it on successful connection, disconnect, or error.

## 3. Google Drive external backup

Local backups stay authoritative for restore. Google Drive is a second copy outside the Oracle VM.

### Configuration

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ID` (recommended parent folder; if omitted the provider creates/finds `PrismaStore Backups` in My Drive)
- `PRISMASTORE_BACKUP_INTERVAL_HOURS` defaults to `24`.
- `PRISMASTORE_BACKUP_RETENTION` defaults to `30` local backups.

No Google secret is committed.

### Upload format

Each local backup directory becomes a Drive folder named after its backup id. The provider recursively uploads `manifest.json`, `prismastore.db`, and the WhatsApp auth files. Google OAuth refresh-token exchange and Drive REST calls use native Node `fetch`, avoiding another runtime dependency.

### Sync state

`backups/.external-sync.json` stores only non-secret synchronization metadata: provider, backup id, remote folder id, synced timestamp, and last error. Backup list responses merge this state so the admin can see local and external status.

### Automatic scheduling

At runtime, if Drive credentials are complete, PrismaStore starts a daily scheduler. It creates and syncs a backup when the newest scheduled/automatic backup is older than the configured interval. Manual backups also attempt external sync immediately. A failed Drive upload does not invalidate the local backup; its error is recorded and surfaced in Configurações.

## Security constraints

- No credentials, refresh tokens, passwords, session tokens, or WhatsApp auth material are added to Git.
- Authentication is enforced on the server, not only hidden in the frontend.
- Pairing-code endpoint is authenticated.
- Restore remains local-first; Drive download/restore is out of scope for this increment because local restore already exists and Drive is the disaster-recovery copy.
- Existing Pix, orders, reports, chatbot, QR pairing, and PWA behavior must remain functional.
