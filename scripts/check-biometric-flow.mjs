process.env.FORCE_MOCK = 'true';
process.env.NODE_ENV = 'development';

const assert = (await import('node:assert/strict')).default;

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
const mock = await import('../features/auth/service/mockAuthService.js');

assert.equal(bio.hasLocalBiometricForEmail('a@test.com'), false);

bio.persistBiometricLogin('user-1', 'cred-1', { name: 'Ana', email: 'Ana@Test.com' });
assert.equal(bio.hasSavedDeviceUser(), true);
assert.equal(bio.hasLocalBiometricForEmail('ana@test.com'), true);
assert.equal(bio.hasLocalBiometricForEmail('outro@test.com'), false);

const created = mock.createDemoAccount({
  name: 'Bio Flag',
  email: `bio.flag.${Date.now()}@saude.local`,
  role: 'professor',
  phone: '27988516301',
});
assert.equal(created.account.biometria_habilitada, false);

mock.saveWebAuthnCredential({
  credential_id: 'cred-flag',
  user_id: created.account.id,
  public_key: 'abc',
  counter: 0,
  device_type: 'singleDevice',
  backed_up: false,
  transports: ['internal'],
});
const listed = mock.listDemoUsers().find((u) => u.id === created.account.id);
assert.equal(listed.biometria_habilitada, true);

mock.deleteWebAuthnCredential('cred-flag', created.account.id);
const after = mock.listDemoUsers().find((u) => u.id === created.account.id);
assert.equal(after.biometria_habilitada, false);

// Decisão de oferta (espelha app.js): flag on sem local → oferece; local bound → não.
function shouldOffer({ flagOn, localBound, declined, biometricSupported }) {
  if (localBound) return false;
  if (!biometricSupported) return false;
  if (flagOn) return true;
  return !declined;
}
assert.equal(shouldOffer({ flagOn: true, localBound: true, declined: false, biometricSupported: true }), false);
assert.equal(shouldOffer({ flagOn: true, localBound: false, declined: true, biometricSupported: true }), true);
assert.equal(shouldOffer({ flagOn: false, localBound: false, declined: true, biometricSupported: true }), false);
assert.equal(shouldOffer({ flagOn: false, localBound: false, declined: false, biometricSupported: true }), true);
assert.equal(shouldOffer({ flagOn: true, localBound: false, declined: false, biometricSupported: false }), false);

console.log('PASS biometric flow: local email match, flag no mock, oferta e fallback sem autenticador');
