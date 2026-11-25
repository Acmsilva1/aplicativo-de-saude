import {
  clearSession,
  createSession,
  getUser,
  isMockAuthEnabled,
  listUsers,
  createAccount,
  sendPasswordSetupEmail,
  setAccountAccess,
  updateAccount,
  deleteAccount,
  changePassword,
  completeInvite,
  getWebAuthnRegisterOptions,
  verifyWebAuthnRegistration,
  getWebAuthnLoginOptions,
  verifyWebAuthnLogin,
  listWebAuthnCredentials,
  revokeWebAuthnCredential,
} from '../features/auth/service/authService.js';
import { appMetrics } from '../lib/observability.js';
import { saudeStore } from '../features/saude/data/saudeStore.js';
import { checkLoginRateLimit, recordLoginFailure, clearLoginAttempts } from '../lib/loginRateLimit.js';
import { hasSupabaseConfig } from '../lib/env.js';
import { STRONG_PASSWORD_ERROR } from '../lib/passwordPolicy.js';
import { isTrialBlocked, TRIAL_EXPIRED_CODE, TRIAL_EXPIRED_MESSAGE } from '../lib/trial.js';

function rejectIfTrialExpired(res, user) {
  if (!isTrialBlocked(user)) return false;
  res.status(403).json({ error: TRIAL_EXPIRED_MESSAGE, code: TRIAL_EXPIRED_CODE });
  return true;
}

export default async function handler(req, res) {
  try {
    if (!isMockAuthEnabled() && !hasSupabaseConfig()) {
      return res.status(503).json({ error: 'Supabase não configurado neste ambiente.' });
    }

    const resource = String(req.query.resource || '');
    if (resource === 'login' && req.method === 'POST') {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const limit = checkLoginRateLimit(req, email);
      if (!limit.allowed) {
        return res.status(429).json({
          error: `Muitas tentativas de login. Aguarde ${limit.retryAfterSec} segundos e tente novamente.`,
        });
      }
      const user = await createSession(req, res);
      if (!user) {
        recordLoginFailure(limit.key);
        return res.status(401).json({ error: 'Confira seu acesso ou consulte o administrador.' });
      }
      clearLoginAttempts(limit.key);
      return res.json({ user });
    }

    if (resource === 'logout' && req.method === 'POST') {
      await clearSession(req, res);
      return res.json({ ok: true });
    }

    if (resource === 'complete-invite' && req.method === 'POST') {
      const result = await completeInvite(req, res, req.body || {});
      return result.account
        ? res.json({ user: result.account })
        : res.status(400).json({ error: result.error || STRONG_PASSWORD_ERROR });
    }

    if (resource === 'webauthn-login-options' && req.method === 'POST') {
      const result = await getWebAuthnLoginOptions(req, req.body || {});
      return result.options
        ? res.json(result)
        : res.status(400).json({ error: result.error || 'Biometria indisponível.' });
    }

    if (resource === 'webauthn-login' && req.method === 'POST') {
      const limit = checkLoginRateLimit(req, `webauthn:${String(req.body?.response?.id || req.body?.credentialId || '')}`);
      if (!limit.allowed) {
        return res.status(429).json({
          error: `Muitas tentativas. Aguarde ${limit.retryAfterSec} segundos e tente novamente.`,
        });
      }
      const result = await verifyWebAuthnLogin(req, res, req.body || {});
      if (!result.user) {
        recordLoginFailure(limit.key);
        return res.status(401).json({ error: result.error || 'Não foi possível entrar com biometria.' });
      }
      clearLoginAttempts(limit.key);
      return res.json({ user: result.user });
    }

    const user = await getUser(req, res);
    if (!user) return res.status(401).json({ error: 'Sessão encerrada. Entre novamente.' });
    // session: sempre retorna o usuário (incl. trial expirado) para a UI bloquear.
    if (resource === 'session' && req.method === 'GET') return res.json({ user });
    if (resource === 'change-password' && req.method === 'POST') {
      const updated = await changePassword(req, res, req.body?.password);
      return updated
        ? res.json({ user: updated })
        : res.status(400).json({ error: STRONG_PASSWORD_ERROR });
    }

    if (resource === 'webauthn-register-options' && req.method === 'POST') {
      if (user.must_change_password) {
        return res.status(403).json({ error: 'Troque a senha inicial antes de continuar.', code: 'password_change_required' });
      }
      if (rejectIfTrialExpired(res, user)) return;
      const result = await getWebAuthnRegisterOptions(req, user);
      return result.options
        ? res.json(result)
        : res.status(400).json({ error: result.error || 'Biometria indisponível.' });
    }
    if (resource === 'webauthn-register' && req.method === 'POST') {
      if (user.must_change_password) {
        return res.status(403).json({ error: 'Troque a senha inicial antes de continuar.', code: 'password_change_required' });
      }
      if (rejectIfTrialExpired(res, user)) return;
      const result = await verifyWebAuthnRegistration(req, user, req.body || {});
      return result.ok
        ? res.json(result)
        : res.status(400).json({ error: result.error || 'Não foi possível ativar a biometria.' });
    }
    if (resource === 'webauthn-credentials' && req.method === 'GET') {
      if (user.must_change_password) {
        return res.status(403).json({ error: 'Troque a senha inicial antes de continuar.', code: 'password_change_required' });
      }
      if (rejectIfTrialExpired(res, user)) return;
      const result = await listWebAuthnCredentials(user);
      return result.credentials
        ? res.json(result)
        : res.status(400).json({ error: result.error || 'Biometria indisponível.' });
    }
    if (resource === 'webauthn-revoke' && req.method === 'POST') {
      if (rejectIfTrialExpired(res, user)) return;
      const result = await revokeWebAuthnCredential(user, req.body || {});
      return result.ok
        ? res.json(result)
        : res.status(400).json({ error: result.error || 'Não foi possível desativar a biometria.' });
    }

    if (user.must_change_password) {
      return res.status(403).json({ error: 'Troque a senha inicial antes de continuar.', code: 'password_change_required' });
    }
    if (rejectIfTrialExpired(res, user)) return;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Somente o administrador gerencia contas.' });
    if (resource === 'observability' && req.method === 'GET') return res.json(appMetrics());
    if ((resource === 'account-temporary-password' || resource === 'account-password-link') && req.method === 'POST') {
      const result = await sendPasswordSetupEmail(String(req.body?.id || ''), req);
      return result.account
        ? res.json({
          account: result.account,
          inviteSent: result.inviteSent !== false,
          ...(result.inviteLink ? { inviteLink: result.inviteLink } : {}),
          ...(result.warning ? { warning: result.warning } : {}),
          ...(result.setupToken ? { setupToken: result.setupToken } : {}),
        })
        : res.status(400).json({ error: result.error || 'Conta indisponível para reenvio do link de senha.' });
    }
    if (resource === 'accounts' && req.method === 'GET') return res.json({ accounts: await listUsers() });
    if (resource === 'accounts' && req.method === 'POST') {
      const result = await createAccount(req.body || {}, req);
      return result.account
        ? res.status(201).json({
          account: result.account,
          inviteSent: result.inviteSent !== false,
          ...(result.inviteLink ? { inviteLink: result.inviteLink } : {}),
          ...(result.warning ? { warning: result.warning } : {}),
          ...(result.setupToken ? { setupToken: result.setupToken } : {}),
        })
        : res.status(400).json({ error: result.error || 'Informe nome, e-mail único, telefone e perfil Professor ou Aluno.' });
    }
    if (resource === 'accounts' && req.method === 'PATCH') {
      const result = await updateAccount(String(req.body?.id || ''), req.body || {});
      return result.account
        ? res.json({ account: result.account })
        : res.status(400).json({ error: result.error || 'Confira nome, e-mail, telefone e perfil. O perfil da Administração é protegido.' });
    }
    if (resource === 'accounts' && req.method === 'DELETE') {
      const id = String(req.body?.id || '');
      if (id && id === String(user.id || '')) {
        return res.status(400).json({ error: 'Você não pode excluir a própria conta.' });
      }
      const deleted = await deleteAccount(id);
      if (!deleted?.ok) {
        return res.status(400).json({
          error: deleted?.error || 'Conta indisponível ou protegida.',
        });
      }
      await saudeStore.deleteUserData(id);
      return res.json({ ok: true, unlinkedStudents: deleted.unlinkedStudents || 0 });
    }
    if (resource === 'account-access' && req.method === 'PATCH') {
      if (typeof req.body?.access !== 'boolean') return res.status(400).json({ error: 'Permissão inválida.' });
      const targetId = String(req.body.id || req.body.user_id || '');
      if (targetId && targetId === String(user.id || '')) {
        return res.status(400).json({ error: 'Você não pode pausar ou liberar o próprio acesso.' });
      }
      const account = await setAccountAccess(targetId, req.body.access);
      return account ? res.json({ account }) : res.status(400).json({ error: 'Conta indisponível ou protegida.' });
    }
    return res.status(405).json({ error: 'Ação não disponível.' });
  } catch (error) {
    console.error('[auth]', error);
    return res.status(500).json({ error: 'Falha interna de autenticação.' });
  }
}
