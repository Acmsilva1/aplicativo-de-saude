import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { useMockData } from '../../../lib/env.js';
import { normalizeBrazilPhone } from '../../../lib/phone.js';
import { normalizeProfileBodyFields } from '../../../lib/profileBody.js';
import { isStrongPassword, STRONG_PASSWORD_ERROR } from '../../../lib/passwordPolicy.js';
import { buildTrialFields } from '../../../lib/trial.js';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 64;
/** Senha padrão do mock local (login direto, sem troca obrigatória). */
export const MOCK_DEMO_PASSWORD = 'Demo@1234';
const DEFAULT_PASSWORD = MOCK_DEMO_PASSWORD;
const DEMO_TRIAL_STARTED = '2026-11-01T12:00:00.000Z';

function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, KEY_LEN, SCRYPT);
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

function verifyPassword(plain, stored) {
  if (!stored?.startsWith('scrypt:')) return false;
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const salt = Buffer.from(parts[1], 'base64url');
  const expected = Buffer.from(parts[2], 'base64url');
  const actual = scryptSync(String(plain), salt, expected.length, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const seedHash = hashPassword(DEFAULT_PASSWORD);
const professorId = 'demo-professor';
const inviteTokens = new Map();

const accounts = [
  { id: 'demo-admin', email: 'master@saude.local', password_hash: seedHash, must_change_password: false, name: 'Administrador', role: 'admin', role_label: 'Administrador', access: true, professor_id: null, phone: '', trial_started_at: DEMO_TRIAL_STARTED, sexo: null, data_nascimento: null, altura_cm: null },
  { id: professorId, email: 'professor@saude.local', password_hash: seedHash, must_change_password: false, name: 'Professor Demo', role: 'professor', role_label: 'Professor', access: true, professor_id: null, phone: '+5527999990001', trial_started_at: DEMO_TRIAL_STARTED, sexo: 'male', data_nascimento: '1985-03-10', altura_cm: 175 },
  { id: 'demo-common-user', email: 'aluno@saude.local', password_hash: seedHash, must_change_password: false, name: 'André Aluno', role: 'student', role_label: 'Aluno', access: true, professor_id: professorId, phone: '+5527999990002', trial_started_at: DEMO_TRIAL_STARTED, sexo: 'male', data_nascimento: '1992-06-15', altura_cm: 178 },
];
for (const [id, name, email, sexo, data_nascimento, altura_cm] of [
  ['demo-student-ana', 'Ana', 'ana@saude.local', 'female', '1995-08-22', 165],
  ['demo-student-bruno', 'Bruno', 'bruno@saude.local', 'male', '1988-11-03', 175],
  ['demo-student-carla', 'Carla', 'carla@saude.local', 'female', '1998-01-30', 162],
  ['demo-student-diego', 'Diego', 'diego@saude.local', 'male', '1990-04-18', 180],
]) {
  accounts.push({ id, name, email, password_hash: seedHash, must_change_password: false, role: 'student', role_label: 'Aluno', access: true, professor_id: professorId, phone: '', trial_started_at: DEMO_TRIAL_STARTED, sexo, data_nascimento, altura_cm });
}

const sessions = new Map();
const webauthnCredentials = new Map();

function professorName(id) {
  if (!id) return '';
  const professor = accounts.find((x) => x.id === id && x.role === 'professor');
  return professor?.name || '';
}

function isActiveProfessor(id) {
  return accounts.some((x) => x.id === id && x.role === 'professor' && x.access);
}

export function isSecureCookie(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim().toLowerCase();
  return proto === 'https';
}

function sessionCookieOptions(req) {
  return { httpOnly: true, sameSite: 'strict', secure: isSecureCookie(req), path: '/', maxAge: 8 * 60 * 60 * 1000 };
}

function publicAccount({ password_hash, invite_pending, ...account }) {
  const out = {
    ...account,
    ...buildTrialFields({ role: account.role, trial_started_at: account.trial_started_at }),
  };
  if (account.role === 'student' && account.professor_id) {
    out.professor_name = professorName(account.professor_id);
  }
  return out;
}

function ensureDemoTrialStarted(account) {
  if (!account || account.role === 'admin' || account.trial_started_at) return account;
  if (account.must_change_password) return account;
  account.trial_started_at = new Date().toISOString();
  return account;
}

function cookie(req) {
  const entry = String(req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith('ritmo_saude_demo='));
  return entry ? entry.slice('ritmo_saude_demo='.length) : '';
}

function issueSetupToken(accountId) {
  for (const [token, id] of inviteTokens) {
    if (id === accountId) inviteTokens.delete(token);
  }
  const setupToken = randomBytes(24).toString('base64url');
  inviteTokens.set(setupToken, accountId);
  return setupToken;
}

export function isMockAuthEnabled() {
  return useMockData();
}

export function listDemoUsers() {
  return accounts.map(publicAccount);
}

export function listActiveProfessors() {
  return accounts.filter((x) => x.role === 'professor' && x.access).map(publicAccount);
}

export function listAvailableStudents(professorId = '') {
  let list = accounts.filter((x) => x.role === 'student' && x.access);
  if (professorId) list = list.filter((x) => x.professor_id === professorId);
  return list.map(publicAccount);
}

function resolveProfessorId(role, professor_id) {
  if (role !== 'student') return null;
  const id = String(professor_id || '').trim();
  if (!id || !isActiveProfessor(id)) return undefined;
  return id;
}

export function createDemoAccount({ name, email, role, professor_id, phone, telefone, sexo, data_nascimento, altura_cm }) {
  const n = String(name || '').trim().slice(0, 80);
  const e = String(email || '').trim().toLowerCase();
  const phoneResult = normalizeBrazilPhone(phone || telefone);
  if (!n || !['professor', 'student'].includes(role) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || accounts.some((x) => x.email === e)) {
    return { error: 'Informe nome, e-mail único, telefone e perfil Professor ou Aluno.' };
  }
  if (phoneResult.error) return { error: phoneResult.error };
  const body = role === 'student'
    ? normalizeProfileBodyFields({ sexo, data_nascimento, altura_cm }, { required: true })
    : { sexo: null, data_nascimento: null, altura_cm: null };
  if (body.error) return { error: body.error };
  const linkId = resolveProfessorId(role, professor_id);
  if (role === 'student' && linkId === undefined) {
    return { error: 'Selecione um professor ativo para vincular o aluno.' };
  }
  const account = {
    id: `demo-${randomUUID()}`,
    name: n,
    email: e,
    phone: phoneResult.phone,
    password_hash: null,
    must_change_password: true,
    invite_pending: true,
    role,
    role_label: role === 'professor' ? 'Professor' : 'Aluno',
    access: true,
    professor_id: linkId,
    trial_started_at: null,
    sexo: body.sexo,
    data_nascimento: body.data_nascimento,
    altura_cm: body.altura_cm,
  };
  accounts.push(account);
  const setupToken = issueSetupToken(account.id);
  return { account: publicAccount(account), inviteSent: true, setupToken };
}

export function sendPasswordSetupEmail(id) {
  const account = accounts.find((item) => item.id === id);
  if (!account || account.role === 'admin' || !account.access) {
    return { error: 'Selecione uma conta ativa de professor ou aluno.' };
  }
  account.must_change_password = true;
  account.invite_pending = true;
  for (const [key, value] of sessions) if (value === id) sessions.delete(key);
  const setupToken = issueSetupToken(id);
  return { account: publicAccount(account), inviteSent: true, setupToken };
}

/** @deprecated use sendPasswordSetupEmail */
export function regenerateTemporaryPassword(id) {
  return sendPasswordSetupEmail(id);
}

export function completeDemoInvite(req, res, { setup_token, access_token, password } = {}) {
  const token = String(setup_token || access_token || '').trim();
  const next = String(password || '');
  if (!token || !isStrongPassword(next)) {
    return { error: STRONG_PASSWORD_ERROR };
  }
  const id = inviteTokens.get(token);
  if (!id) return { error: 'Link inválido ou expirado. Peça um novo convite ao administrador.' };
  const account = accounts.find((x) => x.id === id && x.access);
  if (!account) return { error: 'Conta indisponível. Consulte o administrador.' };
  account.password_hash = hashPassword(next);
  account.must_change_password = false;
  account.invite_pending = false;
  ensureDemoTrialStarted(account);
  inviteTokens.delete(token);
  for (const [key, value] of sessions) if (value === account.id) sessions.delete(key);
  const sessionToken = randomUUID();
  sessions.set(sessionToken, account.id);
  res.cookie('ritmo_saude_demo', sessionToken, sessionCookieOptions(req));
  return { account: publicAccount(account) };
}

export function setAccountAccess(id, access) {
  const account = accounts.find((x) => x.id === id);
  if (!account || account.role === 'admin') return null;
  account.access = access;
  if (!access) for (const [key, value] of sessions) if (value === id) sessions.delete(key);
  return publicAccount(account);
}

function findLoginAccount(email, password) {
  const normalized = String(email || '').trim().toLowerCase();
  return accounts.find((x) => x.access && x.email === normalized && x.password_hash && verifyPassword(password, x.password_hash)) || null;
}

export function createDemoSession(req, res) {
  const account = findLoginAccount(req.body?.email, req.body?.password || '');
  if (!account) return null;
  ensureDemoTrialStarted(account);
  const token = randomUUID();
  sessions.set(token, account.id);
  res.cookie('ritmo_saude_demo', token, sessionCookieOptions(req));
  return publicAccount(account);
}

export function createDemoSessionForUserId(req, res, userId) {
  const account = accounts.find((x) => x.id === userId && x.access);
  if (!account) return null;
  // Não emitir cookie se ainda falta definir senha (ex.: login biométrico prematuro).
  if (account.must_change_password) return publicAccount(account);
  ensureDemoTrialStarted(account);
  const token = randomUUID();
  sessions.set(token, account.id);
  res.cookie('ritmo_saude_demo', token, sessionCookieOptions(req));
  return publicAccount(account);
}

export function listWebAuthnCredentials(userId) {
  return [...webauthnCredentials.values()].filter((row) => row.user_id === userId);
}

export function getWebAuthnCredential(credentialId) {
  return webauthnCredentials.get(credentialId) || null;
}

export function saveWebAuthnCredential(row) {
  // Uma digital ↔ um usuário (igual ao índice único no Postgres).
  for (const [id, current] of webauthnCredentials.entries()) {
    if (current.user_id === row.user_id && id !== row.credential_id) {
      webauthnCredentials.delete(id);
    }
  }
  webauthnCredentials.set(row.credential_id, { ...row });
}

export function deleteWebAuthnCredential(credentialId, userId) {
  const current = webauthnCredentials.get(credentialId);
  if (!current || current.user_id !== userId) return false;
  webauthnCredentials.delete(credentialId);
  return true;
}

export function updateWebAuthnCounter(credentialId, counter) {
  const current = webauthnCredentials.get(credentialId);
  if (!current) return;
  current.counter = counter;
  webauthnCredentials.set(credentialId, current);
}

export function getDemoUser(req) {
  const id = sessions.get(cookie(req));
  const account = accounts.find((x) => x.id === id && x.access);
  if (!account) return null;
  ensureDemoTrialStarted(account);
  return publicAccount(account);
}

export function clearDemoSession(req, res) {
  sessions.delete(cookie(req));
  res.clearCookie('ritmo_saude_demo', { httpOnly: true, sameSite: 'strict', secure: isSecureCookie(req), path: '/' });
}

export function updateDemoAccount(id, { name, email, role, professor_id, phone, telefone, sexo, data_nascimento, altura_cm }) {
  const a = accounts.find((x) => x.id === id);
  if (!a) return { error: 'Conta não encontrada.' };
  const n = String(name || '').trim().slice(0, 80);
  const e = String(email || '').trim().toLowerCase();
  if (!n || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || accounts.some((x) => x.id !== id && x.email === e)) {
    return { error: 'Confira nome e e-mail único.' };
  }
  if (a.role === 'admin' && role !== 'admin') return { error: 'O perfil da Administração é protegido.' };
  if (a.role !== 'admin' && !['professor', 'student'].includes(role)) return { error: 'Perfil inválido.' };
  let phoneValue = a.phone || '';
  let body = null;
  if (a.role !== 'admin' && role !== 'admin') {
    const phoneResult = normalizeBrazilPhone(phone || telefone || a.phone);
    if (phoneResult.error) return { error: phoneResult.error };
    phoneValue = phoneResult.phone;
  }
  if (role === 'student') {
    body = normalizeProfileBodyFields(
      {
        sexo: sexo ?? a.sexo,
        data_nascimento: data_nascimento ?? a.data_nascimento,
        altura_cm: altura_cm ?? a.altura_cm,
      },
      { required: true },
    );
    if (body.error) return { error: body.error };
    const linkId = resolveProfessorId(role, professor_id ?? a.professor_id);
    if (linkId === undefined) return { error: 'Selecione um professor ativo para vincular o aluno.' };
    a.professor_id = linkId;
  } else {
    a.professor_id = null;
  }
  const changedRole = a.role !== role;
  Object.assign(a, {
    name: n,
    email: e,
    phone: role === 'admin' ? a.phone : phoneValue,
    role,
    role_label: role === 'admin' ? 'Administrador' : role === 'professor' ? 'Professor' : 'Aluno',
    ...(role === 'student' && body
      ? { sexo: body.sexo, data_nascimento: body.data_nascimento, altura_cm: body.altura_cm }
      : role === 'professor'
        ? { sexo: null, data_nascimento: null, altura_cm: null }
        : {}),
  });
  if (changedRole) for (const [key, value] of sessions) if (value === id) sessions.delete(key);
  return { account: publicAccount(a) };
}

export function deleteDemoAccount(id) {
  const index = accounts.findIndex((x) => x.id === id);
  if (index < 0) return { ok: false, error: 'Conta não encontrada.' };
  if (accounts[index].role === 'admin') return { ok: false, error: 'A conta de administração é protegida.' };
  let unlinkedStudents = 0;
  if (accounts[index].role === 'professor') {
    for (const account of accounts) {
      if (account.role === 'student' && account.professor_id === id) {
        account.professor_id = null;
        unlinkedStudents += 1;
      }
    }
  }
  for (const [token, accountId] of inviteTokens) {
    if (accountId === id) inviteTokens.delete(token);
  }
  for (const [credentialId, row] of webauthnCredentials) {
    if (row.user_id === id) webauthnCredentials.delete(credentialId);
  }
  accounts.splice(index, 1);
  for (const [key, value] of sessions) if (value === id) sessions.delete(key);
  return { ok: true, unlinkedStudents };
}

export function changeDemoPassword(req, res, password) {
  const user = getDemoUser(req);
  if (!user) return null;
  const next = String(password || '');
  if (!isStrongPassword(next) || next === DEFAULT_PASSWORD) return null;
  const account = accounts.find((x) => x.id === user.id);
  if (!account?.password_hash) return null;
  if (verifyPassword(next, account.password_hash)) return null;
  account.password_hash = hashPassword(next);
  account.must_change_password = false;
  account.invite_pending = false;
  ensureDemoTrialStarted(account);
  for (const [key, value] of sessions) if (value === account.id) sessions.delete(key);
  const token = randomUUID();
  sessions.set(token, account.id);
  res.cookie('ritmo_saude_demo', token, sessionCookieOptions(req));
  return publicAccount(account);
}
