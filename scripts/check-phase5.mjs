/**
 * Testes da Fase 5 — revogação de sessão, WebAuthn no delete, piloto alinhado.
 * node scripts/check-phase5.mjs
 */
process.env.FORCE_MOCK = 'true';
process.env.NODE_ENV = 'development';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const mock = await import('../features/auth/service/mockAuthService.js');

const stamp = Date.now();
const created = mock.createDemoAccount({
  name: 'Fase5 Pause',
  email: `fase5.pause.${stamp}@saude.local`,
  role: 'professor',
  phone: '27988516301',
});
assert.ok(created.account?.id, created.error || 'professor criado');
mock.completeDemoInvite(
  { headers: {} },
  { cookie() {} },
  { setup_token: created.setupToken, password: 'Fase5-Pass-123!' },
);

// 1) Delete remove WebAuthn (antes de pausar o professor)
const bio = mock.createDemoAccount({
  name: 'Fase5 Bio',
  email: `fase5.bio.${stamp}@saude.local`,
  role: 'student',
  phone: '27988516302',
  professor_id: created.account.id,
});
assert.ok(bio.account?.id, bio.error || 'aluno criado');
mock.completeDemoInvite(
  { headers: {} },
  { cookie() {} },
  { setup_token: bio.setupToken, password: 'Fase5-Pass-123!' },
);
mock.saveWebAuthnCredential({
  credential_id: `cred-${randomUUID()}`,
  user_id: bio.account.id,
  public_key: 'abc',
  counter: 0,
  device_type: 'singleDevice',
  backed_up: false,
  transports: [],
});
assert.ok(mock.listWebAuthnCredentials(bio.account.id).length > 0);
assert.equal(mock.deleteDemoAccount(bio.account.id).ok, true);
assert.equal(mock.listWebAuthnCredentials(bio.account.id).length, 0);

// 2) Pausar conta invalida sessão mock
const req = { headers: { host: 'localhost:5199' }, secure: false };
const cookies = [];
const res = { cookie(name, value) { cookies.push({ name, value }); }, clearCookie() {} };
const sessionUser = mock.createDemoSessionForUserId(req, res, created.account.id);
assert.ok(sessionUser);
assert.ok(cookies.length > 0);
mock.setAccountAccess(created.account.id, false);
assert.equal(mock.getDemoUser({ headers: { cookie: `ritmo_saude_demo=${cookies[0].value}` } }), null);

// 3) Código real: revoke + webauthn no cleanup
const authSrc = await readFile(new URL('../features/auth/service/supabaseAuthService.js', import.meta.url), 'utf8');
assert.ok(authSrc.includes('revokeAllSessionsForUser'));
assert.ok(authSrc.includes("signOut(data.session.access_token, 'global')"));
assert.ok(authSrc.includes("['health_webauthn_credentials', 'user_id']"));
assert.ok(/if\s*\(\s*!access\s*\)\s*await\s*revokeAllSessionsForUser/.test(authSrc));
assert.ok(authSrc.includes('await revokeAllSessionsForUser(id);'));

const storeSrc = await readFile(new URL('../features/saude/data/supabaseSaudeStore.js', import.meta.url), 'utf8');
assert.ok(storeSrc.includes("from('health_webauthn_credentials')"));

const pilotSrc = await readFile(new URL('../scripts/pilot-crud-audit.mjs', import.meta.url), 'utf8');
assert.ok(pilotSrc.includes('professor delete unlinks students'));
assert.equal(pilotSrc.includes('cannot be deleted; profile preserved'), false);

console.log('PASS phase5: pause revokes mock session, webauthn cleaned, pilot aligned, revoke wiring');
