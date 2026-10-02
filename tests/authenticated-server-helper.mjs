import { createAppServer as createServer } from '../server/app-server.js';
import { createAuthService } from '../server/auth-service.js';

const password = 'security-test-admin-password';
const sessions = new Map();
const nativeFetch = globalThis.fetch;

export function createAppServer(options) {
  const server = createServer({ ...options, authService: createAuthService({ password }) });
  server.on('listening', () => sessions.delete(`http://127.0.0.1:${server.address().port}`));
  return server;
}

export async function fetch(input, options = {}) {
  const url = new URL(input);
  if (!url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/auth/')) return nativeFetch(input, options);
  if (!sessions.has(url.origin)) {
    sessions.set(url.origin, (async () => {
      const response = await nativeFetch(`${url.origin}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password }),
      });
      if (!response.ok) throw new Error(`Test login failed: ${response.status}`);
      return response.headers.get('set-cookie').split(';')[0];
    })());
  }
  const headers = new Headers(options.headers);
  if (!headers.has('cookie')) headers.set('cookie', await sessions.get(url.origin));
  return nativeFetch(input, { ...options, headers });
}
