import test from 'node:test';
import assert from 'node:assert/strict';
import { securityRuntimeConfig } from '../server/security-runtime-config.js';

test('public deployments require encrypted transport and explicit proxy trust', () => {
 const config=securityRuntimeConfig({PRISMASTORE_PUBLIC_URL:'http://163.176.60.192/'});
 assert.equal(config.requireHttps,true);
 assert.deepEqual(config.trustedProxyAddresses,[]);
 assert.equal(config.secureCookies,true);
});
test('local use remains possible and invalid proxy settings are rejected', () => {
 assert.equal(securityRuntimeConfig({}).requireHttps,false);
 assert.equal(securityRuntimeConfig({PRISMASTORE_PUBLIC_URL:'http://localhost:4173'}).requireHttps,false);
 assert.throws(()=>securityRuntimeConfig({PRISMASTORE_TRUSTED_PROXIES:'*'}),/proxy/i);
 assert.deepEqual(securityRuntimeConfig({PRISMASTORE_TRUSTED_PROXIES:'127.0.0.1,::1'}).trustedProxyAddresses,['127.0.0.1','::1']);
});
