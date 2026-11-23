import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { checkLoginRateLimit as check, clearLoginAttempts as clear } from '../lib/loginRateLimit.js';
const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

// Requests reserve a slot before awaiting authentication, ignoring untrusted XFF.
const req = { ip: 'security-test-ip', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
for (let i = 0; i < 10; i++) assert.equal(check({ ...req, headers: { 'x-forwarded-for': `forged-${i}` } }, 'a@test.invalid').allowed, true);
assert.equal(check({ ...req, headers: { 'x-forwarded-for': 'brand-new' } }, 'a@test.invalid').allowed, false);
const aggregate = { ...req, ip: 'security-aggregate-ip' };
for (let i = 0; i < 60; i++) {
  const entry = check(aggregate, `account-${i}@test.invalid`);
  assert.equal(entry.allowed, true);
  clear(entry.key);
}
assert.equal(check(aggregate, 'another@test.invalid').allowed, false);
assert.equal(check({ ...req, ip: 'security-separate-ip' }, 'a@test.invalid').allowed, true);
console.log('PASS rate limit: forged XFF, concurrent reservations, aggregate cap and separate IP');

// Exercise the actual API handler with deterministic auth/store doubles. These
// cases validate application authorization; they do not claim to test live RLS.
const apiSource = read('api/saude.js').replace(/^import .*;\r?\n/gm, '').replace('export default async function handler', 'async function handler');
let actor = null, calls = [];
const store = new Proxy({}, { get: (_target, key) => async (...args) => {
  calls.push([key, ...args]);
  if (key === 'canUserAccess') return true;
  if (key === 'hasStudent') return args[0] === 'student-a' && args[1] === 'professor-a';
  if (key === 'getProfessorDietSummaries' || key === 'getProfessorWater') return null;
  return [];
} });
const api = vm.createContext({
  console,
  getUser: async () => actor,
  isMockAuthEnabled: () => false,
  hasSupabaseConfig: () => true,
  store,
  validWaterAmount: () => true,
  validWaterGoal: () => true,
  isTrialBlocked: () => false,
  TRIAL_EXPIRED_CODE: 'trial_expired',
  TRIAL_EXPIRED_MESSAGE: 'Período de teste encerrado.',
});
vm.runInContext(apiSource, api, { filename: fileURLToPath(new URL('api/saude.js', root)) });
const run = async (user, resource, method = 'GET', query = {}, body = {}) => {
  actor = user; calls = [];
  const res = { code: 200, status(n) { this.code = n; return this; }, json(value) { this.body = value; return this; } };
  await api.handler({ method, query: { resource, ...query }, body }, res);
  return res;
};
const student = { id: 'student-a', role: 'student' }, professor = { id: 'professor-a', role: 'professor' };
assert.equal((await run(null, 'dietas')).code, 401);
assert.equal((await run({ id: 'admin', role: 'admin' }, 'dietas')).code, 403);
assert.equal((await run({ ...student, must_change_password: true }, 'dietas')).code, 403);
assert.equal((await run(student, 'dietas', 'GET', { user_id: 'student-b' }, { user_id: 'student-b' })).code, 200);
assert.deepEqual(calls.find(call => call[0] === 'getDiets'), ['getDiets', 'student-a']);
assert.equal((await run(student, 'professor-dieta', 'PATCH', {}, { user_id: 'student-b', id: 'foreign', titulo: 'Attack' })).code, 403);
assert.ok(!calls.some(call => call[0] === 'saveDiet'));
assert.equal((await run(professor, 'professor-dieta', 'DELETE', {}, { user_id: 'student-b', id: 'foreign' })).code, 404);
assert.ok(!calls.some(call => call[0] === 'deleteDiet'));
assert.equal((await run(professor, 'professor-agua-meta', 'PATCH', {}, { user_id: 'student-b', goal_ml: 2000 })).code, 404);
assert.ok(!calls.some(call => call[0] === 'setWaterGoal'));
assert.equal((await run(professor, 'professor-dieta', 'GET', { user_id: 'student-b', summary: 'true' })).code, 404);
assert.equal((await run(professor, 'professor-agua', 'GET', { user_id: 'student-b' })).code, 404);
await run(professor, 'professor-portfolio', 'GET', { user_id: 'professor-b' });
assert.deepEqual(calls.find(call => call[0] === 'getTemplates'), ['getTemplates', 'professor-a']);
console.log('PASS 10 API authorization cases: no auth, admin, first access, own scope, student CRUD denied, professor foreign scope denied');

const authSource = read('features/auth/service/supabaseAuthService.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
let access = true, signouts = [];
const db = {
  from(table) {
    let patch;
    return { select() { return this; }, eq() { return this; }, update(payload) { patch = payload; return this; },
      then(resolve) { if (patch) access = patch.access_enabled; resolve({ error: null }); },
      async maybeSingle() { return { data: table === 'health_user_roles' ? { user_id: 'student-a', role: 'student', professor_id: 'prof-a', access_enabled: access, must_change_password: false } : { nome: 'Student', email: 'student@example.invalid' }, error: null }; },
    };
  },
  auth: { getUser: async () => ({ data: { user: { id: 'student-a' } } }), admin: { signOut: async (token, scope) => { signouts.push([token, scope]); return { error: null }; } } },
};
const auth = vm.createContext({
  Buffer,
  getSupabaseAdmin: () => db,
  createUserClient: () => ({}),
  readCookie: () => Buffer.from(JSON.stringify({ access_token: 'test-jwt', expires_at: Date.now() / 1000 + 3600 })).toString('base64url'),
  sessionCookieOptions: () => ({ secure: true }),
  buildTrialFields: () => ({}),
});
vm.runInContext(authSource, auth);
assert.equal((await auth.setAccountAccess('student-a', false)).access, false);
assert.equal(await auth.getUser({}, {}), null);
assert.equal((await auth.setAccountAccess('student-a', true)).access, true);
let cleared = false;
await auth.clearSession({}, { clearCookie() { cleared = true; } });
assert.equal(cleared, true);
assert.deepEqual(signouts, [['test-jwt', 'local']]);
console.log('PASS account block/unblock, disabled authentication denied, scoped logout invocation');

// A professor with linked students must unlink them before any destructive delete.
let destructiveCalls = 0;
let unlinked = false;
const linkedDb = {
  from(table) {
    const api = {
      select() { return api; },
      eq() { return api; },
      update(payload) {
        if (Object.prototype.hasOwnProperty.call(payload || {}, 'professor_id') && payload.professor_id === null) {
          unlinked = true;
        }
        return api;
      },
      async maybeSingle() {
        return {
          data: table === 'health_user_roles'
            ? { user_id: 'prof-a', role: 'professor', access_enabled: true, must_change_password: false }
            : { nome: 'Professor', email: 'professor@example.invalid' },
          error: null,
        };
      },
      then(resolve) {
        resolve({ data: unlinked ? [{ user_id: 'student-1' }] : [], error: null });
      },
      delete() {
        if (!unlinked) {
          destructiveCalls += 1;
          throw Error('Destructive operation must not run before unlink');
        }
        destructiveCalls += 1;
        return api;
      },
    };
    return api;
  },
  auth: {
    admin: {
      async deleteUser() {
        if (!unlinked) {
          destructiveCalls += 1;
          throw Error('Auth delete must not run before unlink');
        }
        return { error: null };
      },
    },
  },
};
const deletionAuth = vm.createContext({ Buffer, getSupabaseAdmin: () => linkedDb, buildTrialFields: () => ({}) });
vm.runInContext(authSource, deletionAuth);
const deletion = await deletionAuth.deleteAccount('prof-a');
assert.equal(deletion.ok, true);
assert.equal(deletion.unlinkedStudents, 1);
assert.equal(unlinked, true);
assert.ok(destructiveCalls > 0);
console.log('PASS deleting professor unlinks students then removes health/profile/auth data');
console.log('All local security regressions passed. Run pilot database fixtures separately to validate effective RLS.');
// A failed goal DELETE must reach the API error handler, never report success.
const storeSource = fs.readFileSync(new URL('../features/saude/data/supabaseSaudeStore.js', import.meta.url), 'utf8');
const deleteGoalMethod = storeSource.match(/async deleteWaterGoal\(id\) \{[\s\S]*?\n  \},/)[0];
let goalReloads = 0;
const goalContext = vm.createContext({ db: () => ({ from: () => ({ delete: () => ({ eq: async () => ({ error: Error('database unavailable') }) }) }) }) });
const goalStore = vm.runInContext(`({${deleteGoalMethod} getWater(){return null;}})`, goalContext);
goalStore.getWater = () => { goalReloads++; };
await assert.rejects(goalStore.deleteWaterGoal('synthetic-id'), /database unavailable/);
assert.equal(goalReloads, 0);
console.log('PASS failed water goal deletion propagates error instead of false success');

