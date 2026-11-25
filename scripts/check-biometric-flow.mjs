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
const mock = await import('../features/auth/service/mockAuthService.js');

bio.persistBiometricLogin('user-1', 'cred-1', { name: 'Ana', email: 'ana@test.com' });
assert.equal(bio.hasSavedDeviceUser(), true);
assert.equal(bio.hasLocalBiometricForEmail('ana@test.com'), true);

const created = mock.createDemoAccount({
  name: 'Bio Flow',
  email: `bio.flow.${Date.now()}@saude.local`,
  role: 'professor',
  phone: '27988516301',
});
mock.saveWebAuthnCredential({
  credential_id: 'cred-flow',
  user_id: created.account.id,
  public_key: 'abc',
  counter: 0,
  device_type: 'singleDevice',
  backed_up: false,
  transports: ['internal'],
});
assert.equal(mock.listWebAuthnCredentials(created.account.id).length, 1);

const appSrc = await readFile(new URL('../features/app.js', import.meta.url), 'utf8');
assert.ok(appSrc.includes('requireBiometricAfterPassword'), 'login deve exigir biometria após senha');
assert.equal(appSrc.includes('maybeOfferBiometric'), false, 'não deve oferecer biometria opcional');
assert.equal(appSrc.includes('openDeviceUserGate'), false, 'não deve pular direto para digital sem senha');
assert.equal(appSrc.includes('biometria_habilitada'), false, 'fluxo não depende de flag no banco');
assert.ok(appSrc.includes('abortLoginSession'), 'falha na biometria deve encerrar a sessão');

console.log('PASS biometric flow: senha + biometria obrigatória, cadastro local 1x');
