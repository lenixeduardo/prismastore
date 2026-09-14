import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const STATE_KEY = 'main';

function sanitizeState(state = {}) {
  return {
    products: Array.isArray(state.products) ? state.products : [],
    customers: Array.isArray(state.customers) ? state.customers : [],
    orders: Array.isArray(state.orders) ? state.orders : [],
  };
}

export function createStateStore({ dbPath, seedState }) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
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

  const getStatement = db.prepare('SELECT payload FROM app_state WHERE id = ?');
  const upsertStatement = db.prepare(`
    INSERT INTO app_state (id, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `);
  const getChatStatement = db.prepare('SELECT payload FROM chat_sessions WHERE phone = ?');
  const upsertChatStatement = db.prepare(`
    INSERT INTO chat_sessions (phone, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `);
  const deleteChatStatement = db.prepare('DELETE FROM chat_sessions WHERE phone = ?');

  function load() {
    const row = getStatement.get(STATE_KEY);
    if (row?.payload) return sanitizeState(JSON.parse(row.payload));
    const initial = sanitizeState(structuredClone(seedState ?? {}));
    save(initial);
    return initial;
  }

  function save(state) {
    const clean = sanitizeState(state);
    upsertStatement.run(STATE_KEY, JSON.stringify(clean), new Date().toISOString());
    return clean;
  }

  function updateState(mutator) {
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
    const row = getChatStatement.get(String(phone));
    return row?.payload ? JSON.parse(row.payload) : null;
  }

  function saveChatSession(phone, session) {
    const clean = structuredClone(session ?? {});
    upsertChatStatement.run(String(phone), JSON.stringify(clean), new Date().toISOString());
    return clean;
  }

  function deleteChatSession(phone) {
    deleteChatStatement.run(String(phone));
  }

  function close() {
    db.close();
  }

  return {
    load,
    save,
    updateState,
    getChatSession,
    saveChatSession,
    deleteChatSession,
    close,
    dbPath,
  };
}
