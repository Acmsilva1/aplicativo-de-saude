import { getSupabaseAdmin, createUserClient, getSupabaseAnon } from '../../../lib/supabase.js';
import { readCookie, sessionCookieOptions } from '../../../lib/cookies.js';
import { normalizeBrazilPhone } from '../../../lib/phone.js';
import { normalizeProfileBodyFields } from '../../../lib/profileBody.js';
import { isStrongPassword } from '../../../lib/passwordPolicy.js';
import { sendAuthLinkEmail } from '../../../lib/mailer.js';
import { buildTrialFields } from '../../../lib/trial.js';

const PROFILE_BODY_SELECT = 'user_id, nome, email, telefone, trial_started_at, sexo, data_nascimento, altura_cm';

const SESSION_COOKIE = 'ritmo_saude_session';
const ROLE_LABEL = { admin: 'Administrador', professor: 'Professor', student: 'Aluno' };

function appPublicUrl(req) {
  const fromEnv = String(process.env.APP_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0]?.trim()
    || (req?.secure ? 'https' : 'http');
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0]?.trim();
  if (host) return `${proto}://${host}`;
  return 'https://controle-de-saude.duckdns.org';
}

function isAuthEmailDeliveryError(err) {
  const msg = String(err?.message || '');
  return /error sending invite email|error sending.*email|smtp|email rate|error sending confirmation/i.test(msg)
    || Number(err?.status) === 500;
}

function mapAuthEmailError(err, fallback = 'Não foi possível enviar o e-mail.') {
  if (isAuthEmailDeliveryError(err)) {
    return 'Falha no envio de e-mail (SMTP/Resend). Confirme remetente e domínio verificados no Supabase/Resend. O remetente onboarding@resend.dev só entrega para o e-mail da conta Resend.';
  }
  return String(err?.message || '').trim() || fallback;
}

function publicAccount(row, professorName = '') {
  if (!row) return null;
  const out = {
    id: row.user_id,
    name: row.nome || '',
    email: row.email || '',
    phone: row.telefone || '',
    role: row.role,
    role_label: ROLE_LABEL[row.role] || row.role,
    access: row.access_enabled !== false,
    must_change_password: row.must_change_password === true,
    professor_id: row.professor_id || null,
    sexo: row.sexo || null,
    data_nascimento: row.data_nascimento || null,
    altura_cm: row.altura_cm == null || row.altura_cm === '' ? null : Number(row.altura_cm),
    ...buildTrialFields({ role: row.role, trial_started_at: row.trial_started_at }),
  };
  if (out.role === 'student' && out.professor_id && professorName) {
    out.professor_name = professorName;
  }
  return out;
}

/** Grava trial_started_at = now() se ainda null (não admin). Idempotente. */
async function ensureTrialStarted(userId, role) {
  if (!userId || role === 'admin') return null;
  const admin = getSupabaseAdmin();
  const { data: profile, error: readErr } = await admin
    .from('health_user_profiles')
    .select('trial_started_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (profile?.trial_started_at) return profile.trial_started_at;

  const now = new Date().toISOString();
  const { data: updated, error: writeErr } = await admin
    .from('health_user_profiles')
    .update({ trial_started_at: now })
    .eq('user_id', userId)
    .is('trial_started_at', null)
    .select('trial_started_at')
    .maybeSingle();
  if (writeErr) throw writeErr;
  return updated?.trial_started_at || now;
}

async function loadAccount(userId, { includeDisabled = false } = {}) {
  const db = getSupabaseAdmin();
  const { data: role, error: roleErr } = await db
    .from('health_user_roles')
    .select('user_id, role, professor_id, access_enabled, must_change_password')
    .eq('user_id', userId)
    .maybeSingle();
  if (roleErr) throw roleErr;
  if (!role || (!includeDisabled && !role.access_enabled)) return null;

  const { data: profile, error: profileErr } = await db
    .from('health_user_profiles')
    .select(PROFILE_BODY_SELECT)
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
    telefone: profile?.telefone || '',
    trial_started_at: profile?.trial_started_at || null,
    sexo: profile?.sexo || null,
    data_nascimento: profile?.data_nascimento || null,
    altura_cm: profile?.altura_cm ?? null,
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

export async function clearSession(req, res) {
  const session = decodeSession(readCookie(req, SESSION_COOKIE));
  if (session?.access_token) {
    const { error } = await getSupabaseAdmin().auth.admin.signOut(session.access_token, 'local');
    if (error && error.status !== 401 && error.status !== 403) throw error;
  }
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
  const { data, error } = await createUserClient().auth.refreshSession({
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
  let account = await loadAccount(data.user.id);
  if (account && !account.must_change_password && !account.trial_exempt && !account.trial_started_at) {
    await ensureTrialStarted(account.id, account.role);
    account = await loadAccount(account.id);
  }
  return account;
}

export async function createSession(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const { data, error } = await createUserClient().auth.signInWithPassword({ email, password });
  if (error || !data?.session?.user) return null;
  let account = await loadAccount(data.session.user.id);
  if (!account) {
    await getSupabaseAdmin().auth.admin.signOut(data.session.access_token, 'local');
    return null;
  }
  if (!account.must_change_password && !account.trial_exempt && !account.trial_started_at) {
    await ensureTrialStarted(account.id, account.role);
    account = await loadAccount(account.id);
  }
  setSessionCookie(req, res, data.session);
  return account;
}

/** Create an app session cookie for an already-verified user (e.g. WebAuthn). */
export async function createSessionForUserId(req, res, userId) {
  let account = await loadAccount(userId);
  if (!account) return null;
  const admin = getSupabaseAdmin();
  const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !authUser?.user?.email) return null;
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.user.email,
  });
  if (linkErr || !link?.properties?.hashed_token) return null;
  const { data, error } = await createUserClient().auth.verifyOtp({
    type: 'email',
    token_hash: link.properties.hashed_token,
  });
  if (error || !data?.session) return null;
  // Não emitir cookie se ainda falta definir senha (ex.: login biométrico prematuro).
  if (account.must_change_password) return account;
  if (!account.trial_exempt && !account.trial_started_at) {
    await ensureTrialStarted(account.id, account.role);
    account = await loadAccount(account.id);
  }
  setSessionCookie(req, res, data.session);
  return account;
}

export async function changePassword(req, res, password) {
  const user = await getUser(req, res);
  if (!user) return null;
  const next = String(password || '');
  if (!isStrongPassword(next)) return null;

  const raw = decodeSession(readCookie(req, SESSION_COOKIE));
  if (!raw?.access_token) return null;

  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: next });
  if (error) return null;

  const { error: roleErr } = await admin
    .from('health_user_roles')
    .update({ must_change_password: false })
    .eq('user_id', user.id);
  if (roleErr) return null;

  const { data, error: signErr } = await createUserClient().auth.signInWithPassword({
    email: user.email,
    password: next,
  });
  if (signErr || !data?.session) return null;
  setSessionCookie(req, res, data.session);
  await ensureTrialStarted(user.id, user.role);
  return loadAccount(user.id);
}

/** Complete invite/recovery from email link tokens and set a strong password. */
export async function completeInvite(req, res, { access_token, refresh_token, password } = {}) {
  const access = String(access_token || '').trim();
  const refresh = String(refresh_token || '').trim();
  const next = String(password || '');
  if (!access || !isStrongPassword(next)) return { error: 'Escolha uma senha forte e use o link do e-mail.' };

  // Valida o JWT do link (invite/recovery) sem depender de cookie de sessão do browser.
  const { data: userData, error: userErr } = await createUserClient().auth.getUser(access);
  if (userErr || !userData?.user?.id) {
    return { error: 'Link inválido ou expirado. Peça um novo convite ao administrador.' };
  }

  // Validar conta ativa antes de mutar senha ou emitir cookie.
  let account = await loadAccount(userData.user.id, { includeDisabled: true });
  if (!account) return { error: 'Conta indisponível. Consulte o administrador.' };
  if (!account.access) return { error: 'Conta pausada. Consulte o administrador.' };

  const admin = getSupabaseAdmin();
  // updateUser do client exige sessão interna; no servidor usamos a Admin API com o user_id do JWT.
  const { error: updateErr } = await admin.auth.admin.updateUserById(userData.user.id, {
    password: next,
    email_confirm: true,
  });
  if (updateErr) return { error: updateErr.message || 'Não foi possível salvar a senha.' };

  await admin.from('health_user_roles').update({ must_change_password: false }).eq('user_id', userData.user.id);

  const email = String(userData.user.email || '').trim();
  let session = null;
  if (email) {
    const { data: signedIn, error: signErr } = await createUserClient().auth.signInWithPassword({
      email,
      password: next,
    });
    if (!signErr && signedIn?.session) session = signedIn.session;
  }
  if (!session && refresh) {
    const { data: refreshed } = await createUserClient().auth.refreshSession({ refresh_token: refresh });
    if (refreshed?.session) session = refreshed.session;
  }
  if (!session) {
    session = {
      access_token: access,
      refresh_token: refresh || undefined,
      expires_at: null,
    };
  }
  setSessionCookie(req, res, session);

  await ensureTrialStarted(account.id, account.role);
  account = await loadAccount(account.id);
  if (!account) return { error: 'Conta indisponível. Consulte o administrador.' };
  return { account };
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
  const professorIds = [...new Set((roles || []).map((r) => r.professor_id).filter(Boolean))];
  const [{ data: profiles, error: profileErr }, professorNames] = await Promise.all([
    db
      .from('health_user_profiles')
      .select(PROFILE_BODY_SELECT)
      .in('user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    listProfessorNames(professorIds),
  ]);
  if (profileErr) throw profileErr;
  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
  return (roles || []).map((role) => {
    const profile = profileMap.get(role.user_id) || {};
    return publicAccount({
      ...role,
      nome: profile.nome || '',
      email: profile.email || '',
      telefone: profile.telefone || '',
      trial_started_at: profile.trial_started_at || null,
      sexo: profile.sexo || null,
      data_nascimento: profile.data_nascimento || null,
      altura_cm: profile.altura_cm ?? null,
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

export async function createAccount(payload = {}, req = null) {
  const n = String(payload.name || '').trim().slice(0, 80);
  const e = String(payload.email || '').trim().toLowerCase();
  const role = payload.role;
  const phoneResult = normalizeBrazilPhone(payload.phone || payload.telefone);
  if (!n || !['professor', 'student'].includes(role) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { error: 'Informe nome, e-mail único, telefone e perfil Professor ou Aluno.' };
  }
  if (phoneResult.error) return { error: phoneResult.error };
  const body = normalizeProfileBodyFields(payload, { required: role === 'student' });
  if (body.error) return { error: body.error };
  const linkId = await resolveProfessorId(role, payload.professor_id);
  if (role === 'student' && linkId === undefined) {
    return { error: 'Selecione um professor ativo para vincular o aluno.' };
  }

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from('health_user_profiles')
    .select('user_id')
    .eq('email', e)
    .maybeSingle();
  if (existing) return { error: 'Informe nome, e-mail único, telefone e perfil Professor ou Aluno.' };

  const redirectTo = appPublicUrl(req);
  let userId = null;
  let inviteSent = false;
  let inviteLink = null;
  let linkKind = 'invite';
  let inviteErr = null;

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(e, {
    data: { name: n, role },
    redirectTo,
  });
  inviteErr = inviteError;
  if (!inviteErr && invited?.user) {
    userId = invited.user.id;
    inviteSent = true;
  } else {
    // SMTP pode falhar depois de criar o usuário no Auth: reaproveita o id e gera link sem e-mail.
    if (invited?.user?.id) {
      userId = invited.user.id;
    }
    let linked = null;
    let linkErr = null;
    ({ data: linked, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: e,
      options: { data: { name: n, role }, redirectTo },
    }));
    if ((linkErr || !linked?.properties?.action_link) && (userId || /already|registered|exists/i.test(String(linkErr?.message || '')))) {
      ({ data: linked, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: e,
        options: { redirectTo },
      }));
      linkKind = 'recovery';
    }
    if (!userId && linked?.user?.id) userId = linked.user.id;
    inviteLink = linked?.properties?.action_link || null;
    if (!userId || !inviteLink) {
      return { error: mapAuthEmailError(inviteErr || linkErr, 'Não foi possível criar o convite.') };
    }
  }

  const { error: profileErr } = await admin.from('health_user_profiles').insert({
    user_id: userId,
    nome: n,
    email: e,
    telefone: phoneResult.phone,
    sexo: body.sexo,
    data_nascimento: body.data_nascimento,
    altura_cm: body.altura_cm,
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

  if (!inviteSent && inviteLink) {
    const mailed = await sendAuthLinkEmail({ to: e, link: inviteLink, kind: linkKind, name: n });
    if (mailed.ok) {
      inviteSent = true;
      inviteLink = null;
    }
  }

  const account = await loadAccount(userId);
  return {
    account,
    inviteSent,
    ...(inviteLink ? { inviteLink } : {}),
    ...(inviteSent ? {} : { warning: mapAuthEmailError(inviteErr) }),
  };
}

const pendingPasswordResets = new Set();
export async function sendPasswordSetupEmail(id, req = null) {
  if (!id) return { error: 'Selecione uma conta.' };
  if (pendingPasswordResets.has(id)) return { error: 'Já existe um reenvio de link em andamento para esta conta.' };
  pendingPasswordResets.add(id);
  try {
    const account = await loadAccount(id);
    if (!account || account.role === 'admin') return { error: 'Selecione uma conta ativa de professor ou aluno.' };
    const admin = getSupabaseAdmin();
    if (!account.must_change_password) {
      const { error } = await admin.from('health_user_roles').update({ must_change_password: true }).eq('user_id', id);
      if (error) return { error: 'Não foi possível exigir a troca de senha. Nenhum e-mail foi enviado.' };
    }
    // Derruba sessões ativas para forçar o fluxo do link de senha.
    await revokeAllSessionsForUser(id);
    const redirectTo = appPublicUrl(req);
    const { error } = await getSupabaseAnon().auth.resetPasswordForEmail(account.email, { redirectTo });
    if (!error) {
      return { account: { ...account, must_change_password: true }, inviteSent: true };
    }
    const { data: linked, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: account.email,
      options: { redirectTo },
    });
    let inviteLink = linked?.properties?.action_link || null;
    if (linkErr || !inviteLink) {
      return { error: mapAuthEmailError(error || linkErr, 'Não foi possível enviar o e-mail de definição de senha.') };
    }
    const mailed = await sendAuthLinkEmail({
      to: account.email,
      link: inviteLink,
      kind: 'recovery',
      name: account.name || '',
    });
    if (mailed.ok) {
      return { account: { ...account, must_change_password: true }, inviteSent: true };
    }
    return {
      account: { ...account, must_change_password: true },
      inviteSent: false,
      inviteLink,
      warning: mapAuthEmailError(error),
    };
  } finally {
    pendingPasswordResets.delete(id);
  }
}

/** @deprecated use sendPasswordSetupEmail */
export async function regenerateTemporaryPassword(id, req = null) {
  return sendPasswordSetupEmail(id, req);
}

export async function updateAccount(id, {
  name, email, role, professor_id, phone, telefone, sexo, data_nascimento, altura_cm,
}) {
  const admin = getSupabaseAdmin();
  const current = await loadAccount(id, { includeDisabled: true });
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

  let phoneValue = current.phone || '';
  let body = {
    sexo: current.sexo ?? null,
    data_nascimento: current.data_nascimento ?? null,
    altura_cm: current.altura_cm ?? null,
  };
  if (nextRole !== 'admin') {
    const phoneResult = normalizeBrazilPhone(phone || telefone || current.phone);
    if (phoneResult.error) return { error: phoneResult.error };
    phoneValue = phoneResult.phone;
    body = normalizeProfileBodyFields(
      {
        sexo: sexo ?? current.sexo,
        data_nascimento: data_nascimento ?? current.data_nascimento,
        altura_cm: altura_cm ?? current.altura_cm,
      },
      { required: nextRole === 'student' },
    );
    if (body.error) return { error: body.error };
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

  const profileUpdate = { nome: n, email: e };
  if (nextRole !== 'admin') {
    profileUpdate.telefone = phoneValue;
    profileUpdate.sexo = body.sexo;
    profileUpdate.data_nascimento = body.data_nascimento;
    profileUpdate.altura_cm = body.altura_cm;
  }

  const { error: profileErr } = await admin
    .from('health_user_profiles')
    .update(profileUpdate)
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

  return { account: await loadAccount(id, { includeDisabled: true }) };
}

/** Invalida todas as sessões Auth do usuário (defense in depth além da API). */
async function revokeAllSessionsForUser(userId) {
  if (!userId) return;
  try {
    const admin = getSupabaseAdmin();
    const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(userId);
    if (userErr || !authUser?.user?.email) return;
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.user.email,
    });
    if (linkErr || !link?.properties?.hashed_token) return;
    const { data, error } = await createUserClient().auth.verifyOtp({
      type: 'email',
      token_hash: link.properties.hashed_token,
    });
    if (error || !data?.session?.access_token) return;
    await admin.auth.admin.signOut(data.session.access_token, 'global');
  } catch (error) {
    console.warn('[auth] falha ao revogar sessões:', error?.message || error);
  }
}

export async function setAccountAccess(id, access) {
  const current = await loadAccount(id, { includeDisabled: true });
  if (!current || current.role === 'admin') return null;
  const { error } = await getSupabaseAdmin()
    .from('health_user_roles')
    .update({ access_enabled: access })
    .eq('user_id', id);
  if (error) return null;
  if (!access) await revokeAllSessionsForUser(id);
  return loadAccount(id, { includeDisabled: true });
}

function deleteFailure(error, fallback = 'Não foi possível excluir a conta.') {
  const message = String(error?.message || error || '').trim();
  return { ok: false, error: message || fallback };
}

export async function deleteAccount(id) {
  const current = await loadAccount(id, { includeDisabled: true });
  if (!current) return deleteFailure(null, 'Conta não encontrada.');
  if (current.role === 'admin') return deleteFailure(null, 'A conta de administração é protegida.');
  const admin = getSupabaseAdmin();
  let unlinkedStudents = 0;
  if (current.role === 'professor') {
    // Unlink students first so FK/professor refs do not block deletion.
    const { data: unlinked, error: unlinkErr } = await admin
      .from('health_user_roles')
      .update({ professor_id: null })
      .eq('role', 'student')
      .eq('professor_id', id)
      .select('user_id');
    if (unlinkErr) {
      return deleteFailure(
        unlinkErr,
        'Não foi possível desvincular os alunos deste professor antes da exclusão.',
      );
    }
    unlinkedStudents = unlinked?.length || 0;
  }

  const cleanupSteps = [
    ['health_webauthn_credentials', 'user_id'],
    ['health_diet_templates', 'professor_id'],
    ['health_water_entries', 'user_id'],
    ['health_water_goals', 'user_id'],
    ['health_diet_items', 'user_id'],
    ['health_diet_meals', 'user_id'],
    ['health_diet_plans', 'user_id'],
    ['health_user_roles', 'user_id'],
    ['health_user_profiles', 'user_id'],
  ];
  for (const [table, column] of cleanupSteps) {
    const { error } = await admin.from(table).delete().eq(column, id);
    if (error) return deleteFailure(error, `Falha ao limpar dados em ${table}.`);
  }

  await revokeAllSessionsForUser(id);
  const { error } = await admin.auth.admin.deleteUser(id);
  return error ? deleteFailure(error, 'Falha ao remover o usuário de autenticação.') : { ok: true, unlinkedStudents };
}
