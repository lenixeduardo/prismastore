import { isIP } from 'node:net';

export function securityRuntimeConfig(env = process.env) {
  const publicUrl = String(env.PRISMASTORE_PUBLIC_URL || '').trim();
  let remotePublicUrl = false;
  if (publicUrl) {
    const parsed = new URL(publicUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL pública deve usar HTTP ou HTTPS.');
    remotePublicUrl = !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  }
  const trustedProxyAddresses = String(env.PRISMASTORE_TRUSTED_PROXIES || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (trustedProxyAddresses.some(value => !isIP(value))) throw new Error('Cada proxy confiável deve ser um IP explícito.');
  const requireHttps = remotePublicUrl || env.PRISMASTORE_REQUIRE_HTTPS === 'true' || publicUrl.startsWith('https:');
  return { requireHttps, secureCookies: requireHttps, trustedProxyAddresses };
}
