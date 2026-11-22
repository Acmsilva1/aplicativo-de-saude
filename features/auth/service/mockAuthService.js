import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { useMockData } from '../../../lib/env.js';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 64;
const DEFAULT_PASSWORD = '12345';

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

const accounts = [
  { id: 'demo-admin', email: 'master@saude.local', password_hash: seedHash, must_change_password: true, name: 'Administrador', role: 'admin', role_label: 'Administrador', access: true, professor_id: null },
  { id: professorId, email: 'professor@saude.local', password_hash: seedHash, must_change_password: true, name: 'Professor', role: 'professor', role_label: 'Professor', access: true, professor_id: null },
  { id: 'demo-common-user', email: 'aluno@saude.local', password_hash: seedHash, must_change_password: true, name: 'André', role: 'student', role_label: 'Aluno', access: true, professor_id: professorId },
];
for (const [id, name, email] of [['demo-student-ana', 'Ana', 'ana@saude.local'], ['demo-student-bruno', 'Bruno', 'bruno@saude.local'], ['demo-student-carla', 'Carla', 'carla@saude.local'], ['demo-student-diego', 'Diego', 'diego@saude.local']]) {
  accounts.push({ id, name, email, password_hash: seedHash, must_change_password: true, role: 'student', role_label: 'Aluno', access: true, professor_id: professorId });
}

const sessions = new Map();

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

function publicAccount({ password_hash, ...account }) {
  const out = { ...account };
  if (account.role === 'student' && account.professor_id) {
    out.professor_name = professorName(account.professor_id);
  }
  return out;
}

function cookie(req) {
  const entry = String(req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith('ritmo_saude_demo='));
  return entry ? entry.slice('ritmo_saude_demo='.length) : '';
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

export function createDemoAccount({ name, email, role, professor_id }) {
  const n = String(name || '').trim().slice(0, 80);
  const e = String(email || '').trim().toLowerCase();
  if (!n || !['professor', 'student'].includes(role) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || accounts.some((x) => x.email === e)) return { error: 'Informe nome, e-mail único e perfil Professor ou Aluno.' };
  const linkId = resolveProfessorId(role, professor_id);
  if (role === 'student' && linkId === undefined) {
    return { error: 'Selecione um professor ativo para vincular o aluno.' };
  }
  const initialPassword = randomBytes(18).toString('base64url');
  const account = {
    id: `demo-${randomUUID()}`,
    name: n,
    email: e,
    password_hash: hashPassword(initialPassword),
    must_change_password: true,
    role,
    role_label: role === 'professor' ? 'Professor' : 'Aluno',
    access: true,
    professor_id: linkId,
  };
  accounts.push(account);
  return { account: publicAccount(account), initialPassword };
}

export function regenerateTemporaryPassword(id) {
  const account = accounts.find(item => item.id === id);
  if (!account || account.role === 'admin' || !account.access || !account.must_change_password) {
    return { error: 'Gere uma nova senha apenas para uma conta ativa que ainda não concluiu o primeiro acesso.' };
  }
  const initialPassword = randomBytes(18).toString('base64url');
  account.password_hash = hashPassword(initialPassword);
  for (const [key, value] of sessions) if (value === id) sessions.delete(key);
  return { account: publicAccount(account), initialPassword };
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
  return accounts.find((x) => x.access && x.email === normalized && verifyPassword(password, x.password_hash)) || null;
}

export function createDemoSession(req, res) {
  const account = findLoginAccount(req.body?.email, req.body?.password || '');
  if (!account) return null;
  const token = randomUUID();
  sessions.set(token, account.id);
  res.cookie('ritmo_saude_demo', token, sessionCookieOptions(req));
  return publicAccount(account);
}

export function getDemoUser(req) {
  const id = sessions.get(cookie(req));
  const account = accounts.find((x) => x.id === id && x.access);
  return account ? publicAccount(account) : null;
}

export function clearDemoSession(req, res) {
  sessions.delete(cookie(req));
  res.clearCookie('ritmo_saude_demo', { httpOnly: true, sameSite: 'strict', secure: isSecureCookie(req), path: '/' });
}

export function updateDemoAccount(id, { name, email, role, professor_id }) {
  const a = accounts.find((x) => x.id === id);
  if (!a) return { error: 'Conta não encontrada.' };
  const n = String(name || '').trim().slice(0, 80);
  const e = String(email || '').trim().toLowerCase();
  if (!n || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || accounts.some((x) => x.id !== id && x.email === e)) {
    return { error: 'Confira nome e e-mail único.' };
  }
  if (a.role === 'admin' && role !== 'admin') return { error: 'O perfil da Administração é protegido.' };
  if (a.role !== 'admin' && !['professor', 'student'].includes(role)) return { error: 'Perfil inválido.' };
  if (role === 'student') {
    const linkId = resolveProfessorId(role, professor_id ?? a.professor_id);
    if (linkId === undefined) return { error: 'Selecione um professor ativo para vincular o aluno.' };
    a.professor_id = linkId;
  } else {
    a.professor_id = null;
  }
  const changedRole = a.role !== role;
  Object.assign(a, { name: n, email: e, role, role_label: role === 'admin' ? 'Administrador' : role === 'professor' ? 'Professor' : 'Aluno' });
  if (changedRole) for (const [key, value] of sessions) if (value === id) sessions.delete(key);
  return { account: publicAccount(a) };
}

export function deleteDemoAccount(id) {
  const index = accounts.findIndex((x) => x.id === id);
  if (index < 0 || accounts[index].role === 'admin') return false;
  accounts.splice(index, 1);
  for (const [key, value] of sessions) if (value === id) sessions.delete(key);
  return true;
}

export function changeDemoPassword(req, res, password) {
  const user = getDemoUser(req);
  if (!user) return null;
  const next = String(password || '');
  if (next.length < 8 || next.length > 80 || next === DEFAULT_PASSWORD) return null;
  const account = accounts.find((x) => x.id === user.id);
  if (verifyPassword(next, account.password_hash)) return null;
  account.password_hash = hashPassword(next);
  account.must_change_password = false;
  for (const [key, value] of sessions) if (value === account.id) sessions.delete(key);
  const token = randomUUID();
  sessions.set(token, account.id);
  res.cookie('ritmo_saude_demo', token, sessionCookieOptions(req));
  return publicAccount(account);
}
