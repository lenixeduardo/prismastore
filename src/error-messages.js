const NETWORK_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /err_connection_refused/i,
  /econnrefused/i,
  /load failed/i,
  /socket hang up/i,
];

export function friendlyErrorMessage(error, fallback = 'Não foi possível concluir esta ação.') {
  const raw = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : String(error ?? '');

  if (!raw.trim()) return fallback;
  if (NETWORK_PATTERNS.some((pattern) => pattern.test(raw))) {
    return 'Não foi possível conectar ao PrismaStore. Verifique se o sistema está iniciado e tente novamente.';
  }
  if (/timeout|timed out/i.test(raw)) {
    return 'A operação demorou mais do que o esperado. Tente novamente em instantes.';
  }
  if (/unauthorized|forbidden|authentication required|auth_required/i.test(raw)) {
    return 'Sua sessão expirou. Entre novamente para continuar.';
  }
  if (/invalid credentials|invalid username|invalid password/i.test(raw)) {
    return 'Usuário ou senha inválidos.';
  }

  const looksTechnicalEnglish = /\b(error|failed|failure|unexpected|invalid|cannot|unable|request|response|connection|refused)\b/i.test(raw);
  return looksTechnicalEnglish ? fallback : raw;
}
