import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as mock from '../features/auth/service/mockAuthService.js';
import { isStrongPassword } from '../lib/passwordPolicy.js';

const strong = 'Invite-Pass-123!';
assert.equal(isStrongPassword(strong), true);

const created = mock.createDemoAccount({
  name: 'Reset test',
  email: 'reset-check@example.invalid',
  role: 'professor',
  phone: '27988516301',
});
assert.equal(created.inviteSent, true);
assert.ok(created.setupToken);
assert.equal(created.account.must_change_password, true);
assert.equal(created.account.phone, '+5527988516301');
assert.equal(mock.createDemoSession({ headers: {}, body: { email: created.account.email, password: strong } }, { cookie() {} }), null);

let cookie;
const res = { cookie(_name, value) { cookie = value; } };
const completed = mock.completeDemoInvite({ headers: {} }, res, { setup_token: created.setupToken, password: strong });
assert.equal(completed.account.must_change_password, false);
assert.ok(cookie);
assert.equal(mock.createDemoSession({ headers: {}, body: { email: created.account.email, password: strong } }, res).must_change_password, false);

const resent = mock.sendPasswordSetupEmail(created.account.id);
assert.equal(resent.inviteSent, true);
assert.ok(resent.setupToken);
assert.equal(resent.account.must_change_password, true);
assert.equal(mock.getDemoUser({ headers: { cookie: `ritmo_saude_demo=${cookie}` } }), null);
assert.ok(mock.completeDemoInvite({ headers: {} }, res, { setup_token: resent.setupToken, password: 'Invite-Pass-456!' }).account);

assert.ok(mock.sendPasswordSetupEmail('demo-admin').error);
assert.ok(mock.createDemoAccount({ name: 'X', email: 'x@example.invalid', role: 'professor' }).error);

const apiSource = fs.readFileSync(new URL('../api/auth.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\r?\n/gm, '')
  .replace('export default async function handler', 'async function handler');
let actor;
let linkCalls = 0;
const api = vm.createContext({
  console,
  isMockAuthEnabled: () => true,
  hasSupabaseConfig: () => false,
  getUser: async () => actor,
  createSession: async () => null,
  clearSession: async () => {},
  changePassword: async () => null,
  completeInvite: async () => ({}),
  listUsers: async () => [],
  createAccount: async () => ({}),
  sendPasswordSetupEmail: async () => { linkCalls++; return resent; },
  updateAccount: async () => ({}),
  deleteAccount: async () => ({ ok: false }),
  setAccountAccess: async () => null,
  appMetrics: () => ({}),
  saudeStore: { deleteUserData: async () => {} },
  checkLoginRateLimitAsync: async () => ({ allowed: true }),
  recordLoginFailure() {},
  clearLoginAttempts() {},
  exportPrivacyBundle: async () => ({ error: 'n/a' }),
  verifyAccountPassword: async () => null,
  getWebAuthnRegisterOptions: async () => ({}),
  verifyWebAuthnRegistration: async () => ({}),
  getWebAuthnLoginOptions: async () => ({}),
  verifyWebAuthnLogin: async () => ({}),
  listWebAuthnCredentials: async () => ({}),
  revokeWebAuthnCredential: async () => ({}),
  isTrialBlocked: () => false,
  TRIAL_EXPIRED_CODE: 'trial_expired',
  TRIAL_EXPIRED_MESSAGE: 'Período de teste encerrado.',
  STRONG_PASSWORD_ERROR: 'senha',
});
vm.runInContext(apiSource, api);
const call = async (user) => {
  actor = user;
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await api.handler({ query: { resource: 'account-password-link' }, method: 'POST', body: { id: 'target' } }, response);
  return response;
};
assert.equal((await call(null)).statusCode, 401);
assert.equal((await call({ id: 's1', role: 'student' })).statusCode, 403);
assert.equal((await call({ id: 'p1', role: 'professor' })).statusCode, 403);
assert.equal((await call({ id: 'a1', role: 'admin', must_change_password: true })).statusCode, 403);
assert.equal(linkCalls, 0);
assert.equal((await call({ id: 'a1', role: 'admin', must_change_password: false })).statusCode, 200);
assert.equal(linkCalls, 1);

console.log('PASS invite setup token, strong password, admin-only password link resend');
