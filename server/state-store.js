import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const STATE_KEY = 'main';

function sanitizeState(state = {}) {
  return {
    products: Array.isArray(state.products) ? state.products : [],
    customers: Array.isArray(state.customers) ? state.customers : [],
    orders: Array.isArray(state.orders) ? state.orders : [],
  };
}

function assertValidSqlite(path) {
  const candidate = new DatabaseSync(path, { readOnly: true });
  try {
    const result = candidate.prepare('PRAGMA quick_check').get();
    const value = result ? Object.values(result)[0] : null;
    if (value !== 'ok') throw new Error('Backup SQLite inválido ou corrompido.');
    const appState = candidate.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_state'").get();
    const chatSessions = candidate.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions'").get();
    if (!appState || !chatSessions) throw new Error('Backup SQLite não pertence ao PrismaStore.');
  } finally {
    candidate.close();
  }
}

export function createStateStore({ dbPath, seedState }) {
  mkdirSync(dirname(dbPath), { recursive: true });

  let db = null;
  let getStatement;
  let upsertStatement;
  let getChatStatement;
  let upsertChatStatement;
  let deleteChatStatement;
  let closed = false;

  function openDatabase() {
    db = new DatabaseSync(dbPath);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS app_state (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_sessions (
        phone TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    getStatement = db.prepare('SELECT payload FROM app_state WHERE id = ?');
    upsertStatement = db.prepare(`
      INSERT INTO app_state (id, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `);
    getChatStatement = db.prepare('SELECT payload FROM chat_sessions WHERE phone = ?');
    upsertChatStatement = db.prepare(`
      INSERT INTO chat_sessions (phone, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `);
    deleteChatStatement = db.prepare('DELETE FROM chat_sessions WHERE phone = ?');
    closed = false;
  }

  function ensureOpen() {
    if (!db || closed) throw new Error('Banco PrismaStore está fechado.');
  }

  openDatabase();

  function load() {
    ensureOpen();
    const row = getStatement.get(STATE_KEY);
    if (row?.payload) return sanitizeState(JSON.parse(row.payload));
    const initial = sanitizeState(structuredClone(seedState ?? {}));
    save(initial);
    return initial;
  }

  function save(state) {
    ensureOpen();
    const clean = sanitizeState(state);
    upsertStatement.run(STATE_KEY, JSON.stringify(clean), new Date().toISOString());
    return clean;
  }

  function updateState(mutator) {
    ensureOpen();
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = structuredClone(load());
      const result = mutator(current);
      const saved = save(result ?? current);
      db.exec('COMMIT');
      return saved;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function getChatSession(phone) {
    ensureOpen();
    const row = getChatStatement.get(String(phone));
    return row?.payload ? JSON.parse(row.payload) : null;
  }

  function saveChatSession(phone, session) {
    ensureOpen();
    const clean = structuredClone(session ?? {});
    upsertChatStatement.run(String(phone), JSON.stringify(clean), new Date().toISOString());
    return clean;
  }

  function deleteChatSession(phone) {
    ensureOpen();
    deleteChatStatement.run(String(phone));
  }

  async function backupTo(targetPath) {
    ensureOpen();
    mkdirSync(dirname(targetPath), { recursive: true });
    rmSync(targetPath, { force: true });
    await sqliteBackup(db, targetPath);
    assertValidSqlite(targetPath);
    return targetPath;
  }

  function restoreFrom(sourcePath) {
    ensureOpen();
    assertValidSqlite(sourcePath);
    db.close();
    db = null;
    closed = true;
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    copyFileSync(sourcePath, dbPath);
    try {
      openDatabase();
      load();
    } catch (error) {
      closed = true;
      throw error;
    }
    return load();
  }

  function close() {
    if (!db || closed) return;
    db.close();
    db = null;
    closed = true;
  }

  return {
    load,
    save,
    updateState,
    getChatSession,
    saveChatSession,
    deleteChatSession,
    backupTo,
    restoreFrom,
    close,
    dbPath,
  };
}
