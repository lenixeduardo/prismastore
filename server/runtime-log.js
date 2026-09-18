const DEFAULT_LIMIT = 120;

function stringifyPart(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function redact(value = '') {
  return String(value)
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[REMOVIDO]')
    .replace(/((?:api[_-]?key|token|password|senha|secret|cookie)\s*[:=]\s*)[^\s,;]+/gi, '$1[REMOVIDO]')
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[DADO_LONGO_REMOVIDO]');
}

export function createRuntimeLogBuffer({ limit = DEFAULT_LIMIT } = {}) {
  const entries = [];
  const push = (level, parts) => {
    entries.push({
      at: new Date().toISOString(),
      level,
      message: redact(parts.map(stringifyPart).join(' ')).slice(0, 8000),
    });
    if (entries.length > limit) entries.splice(0, entries.length - limit);
  };

  return {
    record(level, ...parts) {
      push(level, parts);
    },
    getRecent(max = 80) {
      return entries.slice(-Math.max(1, Math.min(Number(max) || 80, limit)));
    },
    installConsoleCapture() {
      const originalError = console.error.bind(console);
      const originalWarn = console.warn.bind(console);
      console.error = (...args) => {
        push('erro', args);
        originalError(...args);
      };
      console.warn = (...args) => {
        push('aviso', args);
        originalWarn(...args);
      };
      return () => {
        console.error = originalError;
        console.warn = originalWarn;
      };
    },
  };
}
