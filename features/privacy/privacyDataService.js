import { saudeStore } from '../saude/data/saudeStore.js';

/** Exportação LGPD do titular (sem senhas / sem chaves privadas). */
export async function exportPrivacyBundle(user) {
  if (!user?.id) return { error: 'Sessão encerrada.' };
  const base = {
    exported_at: new Date().toISOString(),
    retention_note: 'Documento gerado a seu pedido. Contém dados pessoais e de saúde — guarde com cuidado e compartilhe só se necessário.',
    profile: {
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      sexo: user.sexo || null,
      data_nascimento: user.data_nascimento || null,
      altura_cm: user.altura_cm ?? null,
      professor_id: user.professor_id || null,
    },
  };

  if (user.role === 'admin') {
    return { ...base, health: null, note: 'Administração não possui registros de saúde neste módulo.' };
  }

  const health = {};
  try {
    if (user.role === 'student') {
      health.diets = await saudeStore.getDiets(user.id);
      health.water = await saudeStore.getWater(user.id);
      health.assessments = await saudeStore.getAssessments(user.id);
    } else if (user.role === 'professor') {
      health.templates = await saudeStore.getTemplates(user.id);
      health.students = await saudeStore.getProfessorUsers(user.id);
    }
  } catch (error) {
    return { error: error?.message || 'Não foi possível montar a exportação.' };
  }

  return { ...base, health };
}
