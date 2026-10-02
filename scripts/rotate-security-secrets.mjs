#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

function refusePublic(path) {
  if (path.split(sep).some(part => part.toLowerCase() === 'public')) throw new Error('O arquivo de ambiente deve ficar fora do diretório público.');
}
function privateWrite(path, content) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
}
function main() {
  let envPath = resolve('.env');
  let quarantine = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) envPath = resolve(args[++i]);
    else if (args[i] === '--quarantine-integrations') quarantine = true;
    else throw new Error('Uso: node scripts/rotate-security-secrets.mjs [--env caminho] [--quarantine-integrations]');
  }
  refusePublic(envPath);
  const parent = realpathSync(dirname(envPath));
  refusePublic(parent);
  envPath = join(parent, envPath.split(sep).at(-1));
  if (existsSync(envPath) && (!lstatSync(envPath).isFile() || lstatSync(envPath).isSymbolicLink())) throw new Error('Arquivo de ambiente deve ser um arquivo regular sem link simbólico.');
  const privateDir = join(parent, 'security-private');
  if (existsSync(privateDir) && (!lstatSync(privateDir).isDirectory() || lstatSync(privateDir).isSymbolicLink())) throw new Error('Diretório privado inválido.');
  if (!existsSync(privateDir)) mkdirSync(privateDir, { mode: 0o700 });
  chmodSync(privateDir, 0o700);
  const lock = join(privateDir, 'rotation.lock');
  const lockFd = openSync(lock, 'wx', 0o600);
  let temp;
  try {
    const original = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    const password = randomBytes(32).toString('base64url');
    const secret = randomBytes(48).toString('base64url');
    const stamp = `${Date.now()}-${randomBytes(8).toString('hex')}`;
    const backup = join(privateDir, `env-backup-${stamp}`);
    const passwordFile = join(privateDir, `admin-password-${stamp}`);
    privateWrite(backup, original);
    privateWrite(passwordFile, `${password}\n`);
    const values = new Map([
      ['PRISMASTORE_ADMIN_PASSWORD', password],
      ['PRISMASTORE_DELIVERY_SECRET', secret],
    ]);
    if (quarantine) for (const key of ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN']) values.set(key, '');
    const seen = new Set();
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const lines = original.split(/\r?\n/).map(line => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (!match || !values.has(match[1])) return line;
      seen.add(match[1]);
      return `${match[1]}=${values.get(match[1])}`;
    });
    while (lines.at(-1) === '') lines.pop();
    for (const [key, value] of values) if (!seen.has(key)) lines.push(`${key}=${value}`);
    temp = join(parent, `.env-rotation-${stamp}.tmp`);
    privateWrite(temp, `${lines.join(eol)}${eol}`);
    renameSync(temp, envPath);
    temp = undefined;
    const directoryFd = openSync(parent, 'r');
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
    process.stdout.write(`Rotação local concluída. Backup e senha administrativa estão em ${privateDir} (arquivos 0600). Reinicie o PrismaStore para invalidar sessões e links antigos.\n`);
    if (quarantine) process.stdout.write('Credenciais Drive desabilitadas localmente; revogue também no provedor. Nenhum estado WhatsApp foi removido.\n');
  } finally {
    if (temp && existsSync(temp)) unlinkSync(temp);
    closeSync(lockFd);
    unlinkSync(lock);
  }
}
try { main(); } catch {
  process.stderr.write('Rotação não concluída. Verifique argumentos, caminhos privados e permissões; nenhum segredo foi exibido.\n');
  process.exitCode = 1;
}
