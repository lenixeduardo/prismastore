import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = new URL('../scripts/rotate-security-secrets.mjs', import.meta.url);
function runFixture(run) {
 const dir = mkdtempSync(join(tmpdir(), 'ps-rotate-'));
 try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('rotation preserves Pix, protects backups and never prints secrets', () => runFixture(dir => {
 const env = join(dir, '.env');
 const original = 'PIX_KEY=keep-this\n# keep comment\nOTHER=value\nPRISMASTORE_ADMIN_PASSWORD=old\nPRISMASTORE_DELIVERY_SECRET=old\n';
 writeFileSync(env, original);
 const result = spawnSync(process.execPath, [script.pathname, '--env', env], { encoding: 'utf8' });
 assert.equal(result.status, 0, result.stderr);
 const content = readFileSync(env, 'utf8');
 assert.match(content, /PIX_KEY=keep-this\n# keep comment\nOTHER=value/);
 const password = content.match(/^PRISMASTORE_ADMIN_PASSWORD=(.+)$/m)[1];
 const secret = content.match(/^PRISMASTORE_DELIVERY_SECRET=(.+)$/m)[1];
 assert.ok(password.length >= 43 && secret.length >= 43 && password !== secret);
 assert.ok(!result.stdout.includes(password) && !result.stderr.includes(secret));
 assert.equal(statSync(env).mode & 0o777, 0o600);
 const privateDir = join(dir, 'security-private');
 assert.equal(statSync(privateDir).mode & 0o777, 0o700);
 const { readdirSync } = awaitImportFs;
 const files = readdirSync(privateDir);
 assert.ok(files.some(file => file.startsWith('env-backup-')));
 for (const file of files) assert.equal(statSync(join(privateDir, file)).mode & 0o777, 0o600);
 assert.equal(readFileSync(join(privateDir, files.find(f => f.startsWith('env-backup-'))), 'utf8'), original);
 assert.equal(readFileSync(join(privateDir, files.find(f => f.startsWith('admin-password-'))), 'utf8').trim(), password);
 const again = spawnSync(process.execPath, [script.pathname, '--env', env], { encoding: 'utf8' });
 assert.equal(again.status, 0, again.stderr);
 assert.ok(!readFileSync(env, 'utf8').includes(password));
}));
import * as awaitImportFs from 'node:fs';
test('optional quarantine disables Drive only, without deleting WhatsApp state', () => runFixture(dir => {
 const env = join(dir, '.env');
 writeFileSync(env, 'PIX_KEY=keep\nGOOGLE_DRIVE_CLIENT_ID=id\nGOOGLE_DRIVE_CLIENT_SECRET=secret\nGOOGLE_DRIVE_REFRESH_TOKEN=token\n');
 writeFileSync(join(dir, 'whatsapp-state'), 'preserved');
 const result = spawnSync(process.execPath, [script.pathname, '--env', env, '--quarantine-integrations'], { encoding: 'utf8' });
 assert.equal(result.status, 0, result.stderr);
 assert.match(readFileSync(env, 'utf8'), /GOOGLE_DRIVE_CLIENT_ID=\n/);
 assert.match(readFileSync(env, 'utf8'), /GOOGLE_DRIVE_CLIENT_SECRET=\n/);
 assert.match(readFileSync(env, 'utf8'), /GOOGLE_DRIVE_REFRESH_TOKEN=\n/);
 assert.ok(existsSync(join(dir, 'whatsapp-state')));
}));
test('refuses env within public document root', () => runFixture(dir => {
 const { mkdirSync } = awaitImportFs;
 mkdirSync(join(dir, 'public'));
 const env = join(dir, 'public', '.env'); writeFileSync(env, 'PIX_KEY=keep\n');
 const result = spawnSync(process.execPath, [script.pathname, '--env', env], { encoding: 'utf8' });
 assert.notEqual(result.status, 0);
 assert.equal(readFileSync(env, 'utf8'), 'PIX_KEY=keep\n');
}));

test('refuses symlink environments without changing the target', () => runFixture(dir => {
 const { symlinkSync } = awaitImportFs;
 const target = join(dir, 'target'); writeFileSync(target, 'PIX_KEY=keep\n');
 const env = join(dir, '.env'); symlinkSync(target, env);
 const result = spawnSync(process.execPath, [script.pathname, '--env', env], { encoding: 'utf8' });
 assert.notEqual(result.status, 0);
 assert.equal(readFileSync(target, 'utf8'), 'PIX_KEY=keep\n');
}));

test('replaces duplicate and exported old secrets consistently', () => runFixture(dir => {
 const env = join(dir, '.env');
 writeFileSync(env, 'export PRISMASTORE_ADMIN_PASSWORD="old"\r\nPRISMASTORE_ADMIN_PASSWORD=other\r\nPIX_KEY="same"\r\n');
 const result = spawnSync(process.execPath, [script.pathname, '--env', env], { encoding: 'utf8' });
 assert.equal(result.status, 0, result.stderr);
 const content = readFileSync(env, 'utf8');
 const passwords = [...content.matchAll(/^PRISMASTORE_ADMIN_PASSWORD=([^\r\n]+)$/gm)].map(match => match[1]);
 assert.equal(passwords.length, 2);
 assert.equal(passwords[0], passwords[1]);
 assert.match(content, /PIX_KEY="same"\r\n/);
}));
