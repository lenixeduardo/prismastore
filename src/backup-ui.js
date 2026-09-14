let backups = [];
let loading = false;
let lastError = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value || '—');
  }
}

function formatSize(bytes = 0) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function isSettingsView() {
  return document.querySelector('.topbar h1')?.textContent?.trim() === 'Configurações';
}

function backupRows() {
  if (loading && !backups.length) return '<div class="backup-empty">Carregando backups…</div>';
  if (!backups.length) return '<div class="backup-empty">Nenhum backup criado ainda.</div>';
  return backups.map((backup, index) => `
    <div class="backup-row">
      <div class="backup-row-main">
        <div class="product-name">${index === 0 ? 'Último backup' : 'Backup'} · ${escapeHtml(formatDate(backup.createdAt))}</div>
        <div class="category">${backup.reason === 'pre-restore' ? 'Segurança pré-restauração' : 'Manual'} · ${formatSize(backup.totalBytes)} · ${Number(backup.fileCount || 0)} arquivo(s)</div>
        <div class="backup-meta">
          <span class="badge ${backup.hasWhatsAppSession ? 'green' : 'gray'}">${backup.hasWhatsAppSession ? 'WhatsApp incluído' : 'Sem sessão WhatsApp'}</span>
          <span class="backup-id">${escapeHtml(backup.id)}</span>
        </div>
      </div>
      <button class="btn sm" data-restore-backup="${escapeHtml(backup.id)}" ${loading ? 'disabled' : ''}>Restaurar</button>
    </div>
  `).join('');
}

function render() {
  if (!isSettingsView()) return;
  const main = document.querySelector('.main');
  if (!main) return;
  let section = main.querySelector('[data-backup-section]');
  if (!section) {
    section = document.createElement('section');
    section.className = 'card padded backup-section';
    section.dataset.backupSection = 'true';
    const notice = main.querySelector('.section.notice');
    if (notice) main.insertBefore(section, notice);
    else main.appendChild(section);
  }
  const latest = backups[0];
  section.innerHTML = `
    <div class="section-head backup-head">
      <div>
        <div class="section-title">Backup e recuperação</div>
        <div class="category">SQLite + sessão local do WhatsApp. Credenciais do .env nunca entram no backup.</div>
      </div>
      <button class="btn primary" data-create-backup ${loading ? 'disabled' : ''}>${loading ? 'Processando…' : 'Criar backup agora'}</button>
    </div>
    ${lastError ? `<div class="backup-error">${escapeHtml(lastError)}</div>` : ''}
    <div class="backup-summary">
      <div><span>Último backup</span><strong>${latest ? escapeHtml(formatDate(latest.createdAt)) : 'Ainda não criado'}</strong></div>
      <div><span>Local</span><strong>backups/</strong></div>
      <div><span>Integridade</span><strong>SHA-256</strong></div>
    </div>
    <div class="backup-list">${backupRows()}</div>
  `;
}

async function refreshBackups() {
  try {
    const response = await fetch('/api/backups', { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível consultar os backups.');
    const payload = await response.json();
    backups = Array.isArray(payload.backups) ? payload.backups : [];
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Falha ao consultar backups.';
  }
  render();
}

async function createBackup() {
  if (loading) return;
  loading = true;
  lastError = null;
  render();
  try {
    const response = await fetch('/api/backups', { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível criar o backup.');
    await refreshBackups();
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Falha ao criar backup.';
  } finally {
    loading = false;
    render();
  }
}

async function restoreBackup(id) {
  if (loading) return;
  if (!window.confirm(`Restaurar o backup ${id}?\n\nO PrismaStore criará um backup de segurança antes da restauração e poderá reconectar o WhatsApp.`)) return;
  loading = true;
  lastError = null;
  render();
  try {
    const response = await fetch(`/api/backups/${encodeURIComponent(id)}/restore`, { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível restaurar o backup.');
    window.location.reload();
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Falha ao restaurar backup.';
    loading = false;
    render();
  }
}

document.addEventListener('click', (event) => {
  const create = event.target.closest?.('[data-create-backup]');
  if (create) {
    event.preventDefault();
    createBackup();
    return;
  }
  const restore = event.target.closest?.('[data-restore-backup]');
  if (restore) {
    event.preventDefault();
    restoreBackup(restore.dataset.restoreBackup);
  }
});

const observer = new MutationObserver(() => {
  if (isSettingsView()) render();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
refreshBackups();
setInterval(refreshBackups, 10000);
