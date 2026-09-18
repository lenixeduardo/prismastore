import { friendlyErrorMessage } from './error-messages.js';

const clientErrors = [];
const MAX_CLIENT_ERRORS = 30;

function rememberClientError(source, value) {
  const technical = value instanceof Error
    ? value.stack || value.message
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);
  clientErrors.push({
    at: new Date().toISOString(),
    source,
    message: technical || 'Erro sem detalhes',
  });
  if (clientErrors.length > MAX_CLIENT_ERRORS) clientErrors.shift();
}

window.addEventListener('error', (event) => {
  rememberClientError('navegador', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  rememberClientError('promessa', event.reason);
});

function modal() {
  let element = document.querySelector('[data-bug-report-modal]');
  if (element) return element;
  element = document.createElement('div');
  element.className = 'bug-report-backdrop';
  element.dataset.bugReportModal = 'true';
  element.hidden = true;
  element.innerHTML = `
    <section class="bug-report-modal" role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
      <div class="bug-report-head">
        <div>
          <div class="eyebrow">SUPORTE</div>
          <h2 id="bug-report-title">Relatório de erro</h2>
        </div>
        <button class="btn sm" type="button" data-bug-report-close>Fechar</button>
      </div>
      <p class="subtitle" data-bug-report-status>Preparando informações para diagnóstico…</p>
      <textarea class="bug-report-text" data-bug-report-text readonly aria-label="Relatório técnico"></textarea>
      <div class="bug-report-actions">
        <button class="btn primary" type="button" data-bug-report-copy>Copiar relatório</button>
      </div>
    </section>`;
  document.body.appendChild(element);
  return element;
}

function formatLogs(logs = []) {
  if (!logs.length) return 'Nenhum erro recente registrado no terminal.';
  return logs.map((entry) => `[${entry.at}] [${String(entry.level || 'erro').toUpperCase()}] ${entry.message}`).join('\n');
}

async function buildReport() {
  let serverReport = null;
  let serverFailure = null;
  try {
    const response = await fetch('/api/debug-report', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível coletar o log do servidor.');
    serverReport = payload;
  } catch (error) {
    serverFailure = friendlyErrorMessage(error, 'Não foi possível coletar o log do servidor.');
    rememberClientError('relatório', error);
  }

  const browserErrors = clientErrors.length
    ? clientErrors.map((entry) => `[${entry.at}] [${entry.source}] ${entry.message}`).join('\n')
    : 'Nenhum erro recente capturado no navegador.';

  return [
    'PRISMASTORE — RELATÓRIO DE BUG',
    `Gerado em: ${new Date().toISOString()}`,
    `Tela: ${location.pathname}`,
    `Navegador: ${navigator.userAgent}`,
    '',
    '=== ERROS DO NAVEGADOR ===',
    browserErrors,
    '',
    '=== LOG DE ERRO DO TERMINAL ===',
    serverReport ? formatLogs(serverReport.logs) : serverFailure,
    '',
    '=== CONTEXTO DO SERVIDOR ===',
    serverReport
      ? `Versão: ${serverReport.appVersion || 'não informada'}\nProcesso ativo há: ${serverReport.uptimeSeconds ?? 'n/d'}s`
      : 'Servidor indisponível para coleta.',
  ].join('\n');
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

async function openBugReport() {
  const element = modal();
  const textArea = element.querySelector('[data-bug-report-text]');
  const status = element.querySelector('[data-bug-report-status]');
  element.hidden = false;
  textArea.value = '';
  status.textContent = 'Preparando informações para diagnóstico…';

  const report = await buildReport();
  textArea.value = report;

  try {
    const copied = await copyText(report);
    status.textContent = copied
      ? 'Relatório pronto e copiado. Basta colar na conversa para enviar o diagnóstico.'
      : 'Relatório pronto. Use “Copiar relatório” e cole na conversa.';
  } catch {
    status.textContent = 'Relatório pronto. Use “Copiar relatório” e cole na conversa.';
  }
}

document.addEventListener('click', async (event) => {
  if (event.target.closest?.('[data-report-bug]')) {
    await openBugReport();
    return;
  }
  if (event.target.closest?.('[data-bug-report-close]')) {
    modal().hidden = true;
    return;
  }
  if (event.target.closest?.('[data-bug-report-copy]')) {
    const element = modal();
    const text = element.querySelector('[data-bug-report-text]')?.value || '';
    const status = element.querySelector('[data-bug-report-status]');
    try {
      const copied = await copyText(text);
      status.textContent = copied
        ? 'Relatório copiado. Agora cole na conversa para enviar.'
        : 'Selecione o texto do relatório e copie manualmente.';
    } catch {
      status.textContent = 'Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.';
    }
  }
});
