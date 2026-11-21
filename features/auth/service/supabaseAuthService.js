import { createHash, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin, getSupabaseAnon } from '../../../lib/supabase.js';
import { readCookie, sessionCookieOptions } from '../../../lib/cookies.js';

const SESSION_COOKIE = 'ritmo_saude_session';
const ROLE_LABEL = { admin: 'Administrador', professor: 'Professor', student: 'Aluno' };
const INITIAL_PASSWORD = '123456';
const temporaryPasswordDigest = (password) => createHash('sha256').update(password).digest('hex');
const matchesDigest = (password, digest) => {
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/i.test(digest)) return false;
  return timingSafeEqual(Buffer.from(temporaryPasswordDigest(password), 'hex'), Buffer.from(digest, 'hex'));
};

function publicAccount(row, professorName = '') {
  if (!row) return null;
  const out = {
    id: row.user_id,
    name: row.nome || '',
    email: row.email || '',
    role: row.role,
    role_label: ROLE_LABEL[row.role] || row.role,
    access: row.access_enabled !== false,
    must_change_password: row.must_change_password === true,
    professor_id: row.professor_id || null,
  };
  if (out.role === 'student' && out.professor_id && professorName) {
    out.professor_name = professorName;
  }
  return out;
}

async function loadAccount(userId) {
  const db = getSupabaseAdmin();
  const { data: role, error: roleErr } = await db
    .from('health_user_roles')
    .select('user_id, role, professor_id, access_enabled, must_change_password')
    .eq('user_id', userId)
    .maybeSingle();
  if (roleErr) throw roleErr;
  if (!role || !role.access_enabled) return null;

  const { data: profile, error: profileErr } = await db
    .from('health_user_profiles')
    .select('user_id, nome, email')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileErr) throw profileErr;

  let professorName = '';
  if (role.role === 'student' && role.professor_id) {
    const { data: professor } = await db
      .from('health_user_profiles')
      .select('nome')
      .eq('user_id', role.professor_id)
      .maybeSingle();
    professorName = professor?.nome || '';
  }

  return publicAccount({
    ...role,
    nome: profile?.nome || '',
    email: profile?.email || '',
  }, professorName);
}

function encodeSession(session) {
  return Buffer.from(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || null,
  }), 'utf8').toString('base64url');
}

function decodeSession(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!parsed?.access_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setSessionCookie(req, res, session) {
  const maxAge = session.expires_at
    ? Math.max(60_000, (session.expires_at * 1000) - Date.now())
    : 8 * 60 * 60 * 1000;
  res.cookie(SESSION_COOKIE, encodeSession(session), sessionCookieOptions(req, maxAge));
}

export function clearSession(req, res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: sessionCookieOptions(req).secure,
    path: '/',
  });
}

async function refreshIfNeeded(req, res, session) {
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
  if (expiresAtMs && expiresAtMs > Date.now() + 60_000) return session;
  if (!session.refresh_token) return session;
  const { data, error } = await getSupabaseAnon().auth.refreshSession({
    refresh_token: session.refresh_token,
  });
  if (error || !data?.session) return session;
  setSessionCookie(req, res, data.session);
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  };
}

export async function getUser(req, res) {
  const raw = readCookie(req, SESSION_COOKIE);
  let session = decodeSession(raw);
  if (!session) return null;
  session = await refreshIfNeeded(req, res, session);
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(session.access_token);
  if (error || !data?.user) return null;
  return loadAccount(data.user.id);
}

export async function createSession(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const { data, error } = await getSupabaseAnon().auth.signInWithPassword({ email, password });
  if (error || !data?.session?.user) return null;
  const account = await loadAccount(data.session.user.id);
  if (!account) {
    await getSupabaseAnon().auth.signOut();
    return null;
  }
  setSessionCookie(req, res, data.session);
  return account;
}

export async function changePassword(req, res, password) {
  const user = await getUser(req, res);
  if (!user) return null;
  const next = String(password || '');
  if (next.length < 8 || next.length > 80) return null;

  const raw = decodeSession(readCookie(req, SESSION_COOKIE));
  if (!raw?.access_token) return null;

  const admin = getSupabaseAdmin();
  const { data: authData, error: authLookupError } = await admin.auth.admin.getUserById(user.id);
  if (authLookupError || !authData?.user) return null;
  const appMetadata = authData.user.app_metadata || {};
  if (matchesDigest(next, appMetadata.initial_password_digest)) return null;
  const nextAppMetadata = { ...appMetadata };
  delete nextAppMetadata.initial_password_digest;
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: next,
    app_metadata: nextAppMetadata,
  });
  if (error) return null;

  const { error: roleErr } = await admin
    .from('health_user_roles')
    .update({ must_change_password: false })
    .eq('user_id', user.id);
  if (roleErr) return null;

  const { data, error: signErr } = await getSupabaseAnon().auth.signInWithPassword({
    email: user.email,
    password: next,
  });
  if (signErr || !data?.session) return null;
  setSessionCookie(req, res, data.session);
  return loadAccount(user.id);
}

async function isActiveProfessor(id) {
  const { data } = await getSupabaseAdmin()
    .from('health_user_roles')
    .select('user_id')
    .eq('user_id', id)
    .eq('role', 'professor')
    .eq('access_enabled', true)
    .maybeSingle();
  return Boolean(data);
}

async function resolveProfessorId(role, professor_id) {
  if (role !== 'student') return null;
  const id = String(professor_id || '').trim();
  if (!id || !(await isActiveProfessor(id))) return undefined;
  return id;
}

async function listProfessorNames(ids) {
  if (!ids.length) return new Map();
  const { data } = await getSupabaseAdmin()
    .from('health_user_profiles')
    .select('user_id, nome')
    .in('user_id', ids);
  return new Map((data || []).map((row) => [row.user_id, row.nome]));
}

export async function listUsers() {
  const db = getSupabaseAdmin();
  const { data: roles, error } = await db
    .from('health_user_roles')
    .select('user_id, role, professor_id, access_enabled, must_change_password')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const ids = (roles || []).map((r) => r.user_id);
  const { data: profiles } = await db
    .from('health_user_profiles')
    .select('user_id, nome, email')
    .in('user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
  const professorIds = [...new Set((roles || []).map((r) => r.professor_id).filter(Boolean))];
  const professorNames = await listProfessorNames(professorIds);
  return (roles || []).map((role) => {
    const profile = profileMap.get(role.user_id) || {};
    return publicAccount({
      ...role,
      nome: profile.nome || '',
      email: profile.email || '',
    }, professorNames.get(role.professor_id) || '');
  });
}

export async function listActiveProfessors() {
  const users = await listUsers();
  return users.filter((u) => u.role === 'professor' && u.access);
}

export async function listAvailableStudents(professorId = '') {
  const users = await listUsers();
  let list = users.filter((u) => u.role === 'student' && u.access);
  if (professorId) list = list.filter((u) => u.professor_id === professorId);
  return list;
}

export async function createAccount({ name, email, role, professor_id }) {
  const n = String(name || '').trim().slice(0, 80);
  const e = String(email || '').trim().toLowerCase();
  if (!n || !['professor', 'student'].includes(role) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { error: 'Informe nome, e-mail único e perfil Professor ou Aluno.' };
  }
  const linkId = await resolveProfessorId(role, professor_id);
  if (role === 'student' && linkId === undefined) {
    return { error: 'Selecione um professor ativo para vincular o aluno.' };
  }

  const admin = getSupabaseAdmin();
  const initialPassword = INITIAL_PASSWORD;
  const { data: existing } = await admin
    .from('health_user_profiles')
    .select('user_id')
    .eq('email', e)
    .maybeSingle();
  if (existing) return { error: 'Informe nome, e-mail único e perfil Professor ou Aluno.' };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: e,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { name: n, role },
  });
  if (createErr || !created?.user) {
    return { error: createErr?.message || 'Não foi possível criar a conta.' };
  }

  const userId = created.user.id;
  const appMetadata = {
    ...(created.user.app_metadata || {}),
    initial_password_digest: temporaryPasswordDigest(initialPassword),
  };
  const { error: metadataErr } = await admin.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
  if (metadataErr) {
    await admin.auth.admin.deleteUser(userId);
    return { error: metadataErr.message || 'Falha ao preparar a senha inicial.' };
  }

  const { error: profileErr } = await admin.from('health_user_profiles').insert({
    user_id: userId,
    nome: n,
    email: e,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    return { error: profileErr.message || 'Falha ao salvar o perfil.' };
  }

  const { error: roleErr } = await admin.from('health_user_roles').insert({
    user_id: userId,
    role,
    professor_id: linkId,
    access_enabled: true,
    must_change_password: true,
  });
  if (roleErr) {
    await admin.from('health_user_profiles').delete().eq('user_id', userId);
    await admin.auth.admin.deleteUser(userId);
    return { error: roleErr.message || 'Falha ao salvar o papel.' };
  }

  const account = await loadAccount(userId);
  return { account, initialPassword };
}

export async function updateAccount(id, { name, email, role, professor_id }) {
  const admin = getSupabaseAdmin();
  const current = await loadAccount(id);
  if (!current) return { error: 'Conta não encontrada.' };

  const n = String(name || '').trim().slice(0, 80);
  const e = String(email || '').trim().toLowerCase();
  if (!n || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { error: 'Confira nome e e-mail único.' };
  }
  if (current.role === 'admin' && role !== 'admin') {
    return { error: 'O perfil da Administração é protegido.' };
  }
  const nextRole = current.role === 'admin' ? 'admin' : role;
  if (current.role !== 'admin' && !['professor', 'student'].includes(nextRole)) {
    return { error: 'Perfil inválido.' };
  }

  let linkId = null;
  if (nextRole === 'student') {
    linkId = await resolveProfessorId(nextRole, professor_id ?? current.professor_id);
    if (linkId === undefined) return { error: 'Selecione um professor ativo para vincular o aluno.' };
  }

  const { data: clash } = await admin
    .from('health_user_profiles')
    .select('user_id')
    .eq('email', e)
    .neq('user_id', id)
    .maybeSingle();
  if (clash) return { error: 'Confira nome e e-mail único.' };

  const { error: profileErr } = await admin
    .from('health_user_profiles')
    .update({ nome: n, email: e })
    .eq('user_id', id);
  if (profileErr) return { error: profileErr.message };

  const { error: roleErr } = await admin
    .from('health_user_roles')
    .update({ role: nextRole, professor_id: linkId })
    .eq('user_id', id);
  if (roleErr) return { error: roleErr.message };

  if (e !== current.email) {
    await admin.auth.admin.updateUserById(id, { email: e, email_confirm: true });
  }
  await admin.auth.admin.updateUserById(id, {
    user_metadata: { name: n, role: nextRole },
  });

  return { account: await loadAccount(id) };
}

export async function setAccountAccess(id, access) {
  const current = await loadAccount(id);
  if (!current || current.role === 'admin') return null;
  const { error } = await getSupabaseAdmin()
    .from('health_user_roles')
    .update({ access_enabled: access })
    .eq('user_id', id);
  if (error) return null;
  return loadAccount(id);
}

export async function deleteAccount(id) {
  const current = await loadAccount(id);
  if (!current || current.role === 'admin') return false;
  const admin = getSupabaseAdmin();
  await admin.from('health_diet_templates').delete().eq('professor_id', id);
  await admin.from('health_water_entries').delete().eq('user_id', id);
  await admin.from('health_water_goals').delete().eq('user_id', id);
  await admin.from('health_diet_items').delete().eq('user_id', id);
  await admin.from('health_diet_meals').delete().eq('user_id', id);
  await admin.from('health_diet_plans').delete().eq('user_id', id);
  await admin.from('health_user_roles').delete().eq('user_id', id);
  await admin.from('health_user_profiles').delete().eq('user_id', id);
  const { error } = await admin.auth.admin.deleteUser(id);
  return !error;
}
