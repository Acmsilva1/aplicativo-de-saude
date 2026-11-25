process.env.FORCE_MOCK = 'true';
process.env.NODE_ENV = 'development';

const assert = (await import('node:assert/strict')).default;
const { readFile } = await import('node:fs/promises');

const store = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
  };
};
globalThis.window = {
  localStorage: store(),
  sessionStorage: store(),
};
globalThis.document = { cookie: '' };
globalThis.location = { protocol: 'http:' };

const bio = await import('../features/auth/biometric.js');

bio.persistBiometricLogin('user-1', 'cred-1', { name: 'Ana', email: 'ana@test.com' });
const pref = bio.readBiometricPreference();
assert.equal(pref.credentialId, 'cred-1');
assert.equal(pref.userId, 'user-1');
assert.equal(pref.userEmail, undefined);
assert.equal(pref.userName, undefined);
assert.equal(bio.hasLocalBiometricForUserId('user-1'), true);
assert.equal(bio.hasLocalBiometricForEmail('ana@test.com'), false);

const appSrc = await readFile(new URL('../features/app.js', import.meta.url), 'utf8');
assert.ok(appSrc.includes('requireBiometricAfterPassword'));
assert.ok(appSrc.includes('clearAllClientHealthCaches'));
assert.equal(appSrc.includes('maybeOfferBiometric'), false);

const headers = await readFile(new URL('../lib/securityHeaders.js', import.meta.url), 'utf8');
assert.ok(headers.includes("script-src 'self'"));
assert.ok(headers.includes('upgrade-insecure-requests'));

console.log('PASS biometric+privacy hardening: sem PII local, CSP, limpeza de cache');
