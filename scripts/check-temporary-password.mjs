import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as mock from '../features/auth/service/mockAuthService.js';

// Stub Supabase admin only. No secrets or production accounts are read.
const source = fs.readFileSync(new URL('../features/auth/service/supabaseAuthService.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
let role = 'student', active = true, first = true, updates = [], error = null, roleError = null;
const db = {
  from(table) { return { select() { return this; }, eq() { return this; }, update(patch) { this.patch=patch; return this; }, then(resolve) { if(!roleError && this.patch) first=this.patch.must_change_password; resolve({error:roleError}); }, async maybeSingle() {
    return { data: table === 'health_user_roles' ? { user_id: 'target', role, access_enabled: active, must_change_password: first } : { nome: 'Test', email: 'test@example.invalid' }, error: null };
  } }; },
  auth: { admin: {
    async getUserById() { return { data: { user: { app_metadata: { unrelated: 'preserved' } } }, error: null }; },
    async updateUserById(id, update) { updates.push({ id, update }); return { error }; },
  } },
};
const real = vm.createContext({ createHash, randomBytes, timingSafeEqual, Buffer, getSupabaseAdmin: () => db });
vm.runInContext(source, real);
assert.ok((await real.regenerateTemporaryPassword('')).error);
for (const invalid of ['admin', 'disabled']) {
  role = invalid === 'admin' ? 'admin' : 'student'; active = invalid !== 'disabled'; first = invalid !== 'completed';
  assert.ok((await real.regenerateTemporaryPassword('target')).error);
}
assert.equal(updates.length, 0);
role = 'student'; active = first = true;
const one = await real.regenerateTemporaryPassword('target');
const two = await real.regenerateTemporaryPassword('target');
assert.match(one.initialPassword, /^[A-Za-z0-9_-]{24}$/);
assert.notEqual(one.initialPassword, two.initialPassword);
assert.equal(two.account.must_change_password, true);
assert.equal(updates[1].update.app_metadata.unrelated, 'preserved');
assert.equal(updates[1].update.app_metadata.initial_password_digest, createHash('sha256').update(two.initialPassword).digest('hex'));
assert.equal(updates[1].update.password, two.initialPassword);
assert.ok(!JSON.stringify(updates[1].update.app_metadata).includes(two.initialPassword));
first=false;
const personalReset=await real.regenerateTemporaryPassword('target');
assert.equal(personalReset.account.must_change_password,true);
assert.equal(first,true);
first=false;roleError={message:'role update failed'};
const updatesBeforeRoleFailure=updates.length;
assert.ok((await real.regenerateTemporaryPassword('target')).error);
assert.equal(updates.length,updatesBeforeRoleFailure);
roleError=null;
error = { message: 'test failure' };
assert.ok((await real.regenerateTemporaryPassword('target')).error);
assert.equal(first,true,'ambiguous Auth failure must retain mandatory password change');
error=null;
const concurrent=await Promise.all([real.regenerateTemporaryPassword('target'),real.regenerateTemporaryPassword('target')]);
assert.equal(concurrent.filter(result=>result.initialPassword).length,1,'only one concurrent reset may replace the password');
assert.equal(concurrent.filter(result=>result.error).length,1);

// Exercise the actual mock backend: replacing the password invalidates old login
// and the preexisting demo session; the new credential still requires a change.
const created = mock.createDemoAccount({ name: 'Reset test', email: 'reset-check@example.invalid', role: 'professor' });
let cookie;
const req = password => ({ headers: {}, body: { email: created.account.email, password } });
const res = { cookie(_name, value) { cookie = value; } };
assert.ok(mock.createDemoSession(req(created.initialPassword), res));
const previousCookie = cookie;
const replaced = mock.regenerateTemporaryPassword(created.account.id);
assert.equal(mock.createDemoSession(req(created.initialPassword), res), null);
assert.equal(mock.getDemoUser({ headers: { cookie: `ritmo_saude_demo=${previousCookie}` } }), null);
assert.equal(mock.createDemoSession(req(replaced.initialPassword), res).must_change_password, true);
assert.equal(mock.changeDemoPassword({ headers: { cookie: `ritmo_saude_demo=${cookie}` } }, res, 'Personal-test-password!').must_change_password, false);
const recovered = mock.regenerateTemporaryPassword(created.account.id);
assert.equal(recovered.account.must_change_password, true);
assert.equal(mock.createDemoSession(req('Personal-test-password!'), res), null);
assert.equal(mock.createDemoSession(req(recovered.initialPassword), res).must_change_password, true);
assert.ok(mock.regenerateTemporaryPassword('demo-admin').error);

// Authorize the route before touching the target or returning a password.
const apiSource = fs.readFileSync(new URL('../api/auth.js', import.meta.url), 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export default async function handler', 'async function handler');
let actor, rotations = 0;
const api = vm.createContext({ console, isMockAuthEnabled: () => true, getUser: async () => actor, regenerateTemporaryPassword: async () => { rotations++; return replaced; } });
vm.runInContext(apiSource, api);
const call = async user => {
  actor = user;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await api.handler({ query: { resource: 'account-temporary-password' }, method: 'POST', body: { id: 'target' } }, response);
  return response;
};
assert.equal((await call(null)).statusCode, 401);
assert.equal((await call({ role: 'student' })).statusCode, 403);
assert.equal((await call({ role: 'professor' })).statusCode, 403);
assert.equal((await call({ role: 'admin', must_change_password: true })).statusCode, 403);
assert.equal(rotations, 0);
assert.equal((await call({ role: 'admin', must_change_password: false })).statusCode, 200);
assert.equal(rotations, 1);
console.log('PASS temporary password rotation: admin-only, active-only, protected admin, random secret, digest-only metadata, mandatory change after personal reset, old login/session rejected in mock, fail-closed role update and ambiguous Auth errors');
