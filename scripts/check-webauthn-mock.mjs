process.env.FORCE_MOCK = 'true';
process.env.NODE_ENV = 'development';
process.env.APP_PUBLIC_URL = 'http://localhost:5199';

const assert = (await import('node:assert/strict')).default;
const mock = await import('../features/auth/service/mockAuthService.js');
const {
  getWebAuthnRegisterOptions,
  getWebAuthnLoginOptions,
  revokeWebAuthnCredential,
} = await import('../features/auth/service/webauthnService.js');

const account = mock.createDemoAccount({
  name: 'Bio Test',
  email: `bio.${Date.now()}@saude.local`,
  role: 'professor',
  phone: '27988516301',
});
assert.ok(account.setupToken);
const completed = mock.completeDemoInvite(
  { headers: {} },
  { cookie() {} },
  { setup_token: account.setupToken, password: 'Bio-Pass-123!' },
);
assert.equal(completed.account.must_change_password, false);

const user = completed.account;
const req = {
  headers: { host: 'localhost:5199', 'x-forwarded-proto': 'http' },
  secure: false,
};

const reg = await getWebAuthnRegisterOptions(req, user);
assert.ok(reg.options?.challenge);
assert.equal(reg.options.authenticatorSelection.authenticatorAttachment, 'platform');

mock.saveWebAuthnCredential({
  credential_id: 'test-credential-id',
  user_id: user.id,
  public_key: Buffer.from('not-a-real-key').toString('base64url'),
  counter: 0,
  device_type: 'singleDevice',
  backed_up: false,
  transports: ['internal'],
});

const loginOpts = await getWebAuthnLoginOptions(req, { credentialId: 'test-credential-id' });
assert.ok(loginOpts.options?.challenge);
assert.equal(loginOpts.userId, user.id);

const revoked = await revokeWebAuthnCredential(user, { credentialId: 'test-credential-id' });
assert.equal(revoked.ok, true);
assert.equal(mock.getWebAuthnCredential('test-credential-id'), null);

const session = mock.createDemoSessionForUserId(req, { cookie() {} }, user.id);
assert.equal(session.id, user.id);

console.log('PASS webauthn mock options, revoke, session-from-user');
