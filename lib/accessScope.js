/**
 * Escopo de dados de saúde com service_role: a API decide o alvo,
 * nunca confia em user_id do cliente para aluno.
 */
export function resolveHealthTargetUserId(actor, requestedId = '', { requireTarget = true } = {}) {
  if (!actor?.id || !actor?.role) {
    return { ok: false, status: 401, error: 'Entre para acessar.' };
  }
  if (actor.role === 'admin') {
    return { ok: false, status: 403, error: 'A administração não consulta registros de saúde.' };
  }
  if (actor.must_change_password) {
    return { ok: false, status: 403, error: 'Troque a senha inicial antes de continuar.', code: 'password_change_required' };
  }
  if (actor.role === 'professor') {
    const id = String(requestedId || '').trim();
    if (!id) {
      if (!requireTarget) return { ok: true, userId: '', professor: true };
      return { ok: false, status: 400, error: 'Informe o aluno.' };
    }
    if (id === String(actor.id)) {
      return { ok: false, status: 400, error: 'Professor não consulta a si mesmo como aluno.' };
    }
    return { ok: true, userId: id, professor: true };
  }
  if (actor.role === 'student') {
    // Aluno: sempre o próprio id — ignora user_id enviado pelo cliente.
    return { ok: true, userId: String(actor.id), professor: false };
  }
  return { ok: false, status: 403, error: 'Ação não permitida para seu perfil.' };
}

export async function assertProfessorOwnsStudent(store, professorId, studentId) {
  if (!professorId || !studentId) return false;
  if (typeof store?.hasStudent !== 'function') return false;
  return Boolean(await store.hasStudent(studentId, professorId));
}

export const PROFESSOR_SELF_RESOURCES = new Set([
  'professor-users',
  'professor-alimentos',
  'professor-portfolio',
]);
