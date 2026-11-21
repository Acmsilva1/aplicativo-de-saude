import {
  clearSession,
  createSession,
  getUser,
  isMockAuthEnabled,
  listUsers,
  createAccount,
  setAccountAccess,
  updateAccount,
  deleteAccount,
  changePassword,
} from '../features/auth/service/authService.js';
import { appMetrics } from '../lib/observability.js';
import { saudeStore } from '../features/saude/data/saudeStore.js';
import { checkLoginRateLimit, recordLoginFailure, clearLoginAttempts } from '../lib/loginRateLimit.js';
import { hasSupabaseConfig } from '../lib/env.js';

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

    const user = await getUser(req, res);
    if (!user) return res.status(401).json({ error: 'Sessão encerrada. Entre novamente.' });
    if (resource === 'session' && req.method === 'GET') return res.json({ user });
    if (resource === 'change-password' && req.method === 'POST') {
      const updated = await changePassword(req, res, req.body?.password);
      return updated
        ? res.json({ user: updated })
        : res.status(400).json({ error: 'Escolha uma nova senha com 8 a 80 caracteres, diferente da senha atual.' });
    }
    if (user.must_change_password) {
      return res.status(403).json({ error: 'Troque a senha inicial antes de continuar.', code: 'password_change_required' });
    }
    if (user.role !== 'admin') return res.status(403).json({ error: 'Somente o administrador gerencia contas.' });
    if (resource === 'observability' && req.method === 'GET') return res.json(appMetrics());
    if (resource === 'accounts' && req.method === 'GET') return res.json({ accounts: await listUsers() });
    if (resource === 'accounts' && req.method === 'POST') {
      const result = await createAccount(req.body || {});
      return result.account
        ? res.status(201).json({ account: result.account })
        : res.status(400).json({ error: result.error || 'Informe nome, e-mail único e perfil Professor ou Aluno.' });
    }
    if (resource === 'accounts' && req.method === 'PATCH') {
      const result = await updateAccount(String(req.body?.id || ''), req.body || {});
      return result.account
        ? res.json({ account: result.account })
        : res.status(400).json({ error: result.error || 'Confira nome, e-mail único e perfil. O perfil da Administração é protegido.' });
    }
    if (resource === 'accounts' && req.method === 'DELETE') {
      const id = String(req.body?.id || '');
      if (!(await deleteAccount(id))) return res.status(400).json({ error: 'Conta indisponível ou protegida.' });
      await saudeStore.deleteUserData(id);
      return res.json({ ok: true });
    }
    if (resource === 'account-access' && req.method === 'PATCH') {
      if (typeof req.body?.access !== 'boolean') return res.status(400).json({ error: 'Permissão inválida.' });
      const account = await setAccountAccess(String(req.body.id || req.body.user_id || ''), req.body.access);
      return account ? res.json({ account }) : res.status(400).json({ error: 'Conta indisponível ou protegida.' });
    }
    return res.status(405).json({ error: 'Ação não disponível.' });
  } catch (error) {
    console.error('[auth]', error);
    return res.status(500).json({ error: 'Falha interna de autenticação.' });
  }
}
