/**
 * Testes da Fase 0 (bugs bloqueantes) — mock + asserts estáticos.
 * Roda sem servidor: node scripts/check-phase0.mjs
 */
process.env.FORCE_MOCK = 'true';
process.env.NODE_ENV = 'development';
process.env.APP_PUBLIC_URL = 'http://localhost:5199';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBackgroundSaves } from '../features/backgroundSaves.js';

const mock = await import('../features/auth/service/mockAuthService.js');
const { verifyWebAuthnLogin } = await import('../features/auth/service/webauthnService.js');

const cookies = [];
const res = {
  cookie(name, value) {
    cookies.push({ name, value });
  },
  clearCookie() {},
};
const req = { headers: { host: 'localhost:5199', 'x-forwarded-proto': 'http' }, secure: false };

// 1) Sessão biométrica / must_change_password: não grava cookie.
const pending = mock.createDemoAccount({
  name: 'Fase0 Bio',
  email: `fase0.bio.${Date.now()}@saude.local`,
  role: 'professor',
  phone: '27988516301',
});
assert.ok(pending.account.must_change_password);
cookies.length = 0;
const peeked = mock.createDemoSessionForUserId(req, res, pending.account.id);
assert.equal(peeked.must_change_password, true);
assert.equal(cookies.length, 0, 'não deve emitir cookie com must_change_password');

// 2) Após complete-invite, cookie é emitido normalmente.
const done = mock.completeDemoInvite(req, res, {
  setup_token: pending.setupToken,
  password: 'Fase0-Pass-123!',
});
assert.equal(done.account.must_change_password, false);
assert.ok(cookies.some((c) => c.name === 'ritmo_saude_demo'));

// 3) Conta pausada: complete-invite não muta.
const paused = mock.createDemoAccount({
  name: 'Fase0 Pause',
  email: `fase0.pause.${Date.now()}@saude.local`,
  role: 'student',
  phone: '27988516302',
  professor_id: done.account.id,
  sexo: 'male',
  data_nascimento: '1990-01-15',
  altura_cm: 175,
});
assert.ok(paused.account, paused.error || 'conta pausada deve ser criada');
mock.setAccountAccess(paused.account.id, false);
const pausedInvite = mock.completeDemoInvite(req, res, {
  setup_token: paused.setupToken,
  password: 'Fase0-Pass-123!',
});
assert.ok(pausedInvite.error, 'convite em conta pausada deve falhar');
assert.match(pausedInvite.error, /indisponível|pausada/i);

// 4) firstAccess: sem auto-click da biometria.
const firstAccessSrc = await readFile(new URL('../features/auth/firstAccess.js', import.meta.url), 'utf8');
assert.equal(firstAccessSrc.includes('unlockBtn.click()'), false, 'não deve auto-disparar WebAuthn');
assert.ok(firstAccessSrc.includes('unlockBtn.focus'), 'deve focar o botão em vez de clicar');

// 5) saveWater sem meta: feedback + render.
const appSrc = await readFile(new URL('../features/app.js', import.meta.url), 'utf8');
assert.ok(appSrc.includes('Defina uma meta de água'), 'saveWater deve avisar sem meta');
assert.ok(appSrc.includes('data-preserve-ui') || (await readFile(new URL('../features/saude/index.js', import.meta.url), 'utf8')).includes('data-preserve-ui'), 'modal deve marcar data-preserve-ui');
assert.ok(appSrc.includes('syncBackgroundSaveStatus'), 'background save deve preservar modal');

// 6) Modal dieta com data-preserve-ui.
const saudeSrc = await readFile(new URL('../features/saude/index.js', import.meta.url), 'utf8');
assert.ok(saudeSrc.includes('data-preserve-ui="diet-start"'));

// 7) Migration trial na RLS.
const migration = await readFile(
  new URL('../supabase/migrations/20261123180000_trial_in_health_has_access.sql', import.meta.url),
  'utf8',
);
assert.ok(migration.includes('health_has_access'));
assert.ok(migration.includes('trial_started_at'));
assert.ok(migration.includes("timezone('America/Sao_Paulo'"));
assert.ok(migration.includes('(select auth.uid())'));

// 8) Preserve-ui: save em background não exige form para “não quebrar” lane.
let water = { goal_ml: 2000, total_ml: 0, checkins: [] };
const saves = createBackgroundSaves();
const network = new Promise((resolve) => setTimeout(() => resolve({ ...water, total_ml: 200 }), 5));
saves.save({
  key: 'water',
  read: () => water,
  write: (v) => { water = v; },
  project: (v) => ({ ...v, total_ml: v.total_ml + 200 }),
  persist: () => network,
});
assert.equal(water.total_ml, 200);
await saves.idle();

// 9) verifyWebAuthnLogin caminho de erro sem credential (smoke import).
const bad = await verifyWebAuthnLogin(req, res, {});
assert.ok(bad.error);

console.log('PASS phase0: cookie, invite pausado, biometria UI, água/meta, preserve-ui, trial migration');
