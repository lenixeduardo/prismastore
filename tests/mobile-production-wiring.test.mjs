import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const env = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

test('runtime locks the admin username and reads only the admin password from environment', () => {
  assert.match(source, /createAuthService/);
  assert.match(source, /const adminUser = 'admin'/);
  assert.doesNotMatch(source, /PRISMASTORE_ADMIN_USER/);
  assert.match(source, /PRISMASTORE_ADMIN_PASSWORD/);
  assert.match(source, /authService/);
});

test('runtime wires Google Drive external backups and automatic scheduler', () => {
  assert.match(source, /createGoogleDriveBackupStore/);
  assert.match(source, /createGoogleDriveAccessTokenProvider/);
  assert.match(source, /createBackupScheduler/);
  assert.match(source, /GOOGLE_DRIVE_CLIENT_ID/);
  assert.match(source, /GOOGLE_DRIVE_CLIENT_SECRET/);
  assert.match(source, /GOOGLE_DRIVE_REFRESH_TOKEN/);
  assert.match(source, /PRISMASTORE_BACKUP_INTERVAL_HOURS/);
});

test('example environment documents the admin password and Drive settings without real secrets', () => {
  assert.doesNotMatch(env, /PRISMASTORE_ADMIN_USER=/);
  assert.match(env, /PRISMASTORE_ADMIN_PASSWORD=/);
  assert.match(env, /GOOGLE_DRIVE_CLIENT_ID=/);
  assert.match(env, /GOOGLE_DRIVE_CLIENT_SECRET=/);
  assert.match(env, /GOOGLE_DRIVE_REFRESH_TOKEN=/);
});
