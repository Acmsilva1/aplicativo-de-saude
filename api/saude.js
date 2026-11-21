import { getUser, isMockAuthEnabled } from '../features/auth/service/authService.js';
import { saudeStore as store } from '../features/saude/data/saudeStore.js';
import { validWaterAmount, validWaterGoal } from '../features/saude/service/waterIntakeService.js';
import { hasSupabaseConfig } from '../lib/env.js';

export default async function handler(req, res) {
  try {
    if (!isMockAuthEnabled() && !hasSupabaseConfig()) {
      return res.status(503).json({ error: 'Supabase não configurado neste ambiente.' });
    }

    const user = await getUser(req, res);
    if (!user) return res.status(401).json({ error: 'Entre para acessar.' });
    if (user.must_change_password) {
      return res.status(403).json({ error: 'Troque a senha inicial antes de continuar.', code: 'password_change_required' });
    }
    if (user.role === 'admin') {
      return res.status(403).json({ error: 'A administração não consulta registros de saúde.' });
    }

    const resource = String(req.query.resource || '');
    const professor = user.role === 'professor';
    if (!professor && !(await store.canUserAccess(user.id))) {
      return res.status(403).json({ error: 'Seu acesso está pausado pelo administrador.' });
    }

    const id = professor ? String(req.body?.user_id || req.query.user_id || '') : user.id;

    if (resource === 'professor-users' && professor && req.method === 'GET') {
      return res.json({ users: await store.getProfessorUsers(user.id) });
    }
    if (resource === 'professor-dieta' && professor && req.method === 'GET' && req.query.summary === 'true') {
      const diets = await store.getProfessorDietSummaries(user.id, id);
      return diets
        ? res.json({ diets })
        : res.status(404).json({ error: 'Aluno não encontrado ou não vinculado ao seu perfil de professor.' });
    }
    if (resource === 'professor-agua' && professor && req.method === 'GET') {
      const result = await store.getProfessorWater(user.id, id);
      return result
        ? res.json(result)
        : res.status(404).json({ error: 'Aluno não encontrado ou não vinculado ao seu perfil de professor.' });
    }
    if (resource === 'professor-alimentos' && professor && req.method === 'GET') {
      return res.json({ foods: await store.listAlimentos() });
    }
    if (resource === 'professor-portfolio' && professor) {
      if (req.method === 'GET') return res.json({ templates: await store.getTemplates(user.id) });
      const templateId = String(req.body?.id || '');
      if (req.method === 'DELETE') {
        return (await store.deleteTemplate(user.id, templateId))
          ? res.json({ ok: true })
          : res.status(404).json({ error: 'Modelo não encontrado.' });
      }
      if (['POST', 'PATCH'].includes(req.method)) {
        if (!String(req.body?.titulo || '').trim()) {
          return res.status(400).json({ error: 'Informe o nome do modelo.' });
        }
        if (req.method === 'PATCH' && !templateId) {
          return res.status(400).json({ error: 'Selecione o modelo.' });
        }
        const template = await store.saveTemplate(user.id, req.body, req.method === 'PATCH' ? templateId : null);
        return template
          ? res.status(req.method === 'POST' ? 201 : 200).json({ template })
          : res.status(404).json({ error: 'Modelo não encontrado.' });
      }
    }

    if (professor && !(await store.hasStudent(id, user.id))) {
      return res.status(404).json({ error: 'Aluno não encontrado ou não vinculado ao seu perfil de professor.' });
    }

    if (resource === 'dietas' && req.method === 'GET') {
      const diets = await store.getDiets(id);
      return req.query.nutrition === 'true'
        ? res.json({ diets, foods: await store.listAlimentos() })
        : res.json({ diets });
    }
    if (resource === 'professor-dieta' && professor) {
      if (req.method === 'GET') return res.json({ diets: await store.getProfessorDiets(id) });
      const dietId = String(req.body?.id || req.query.id || '');
      if (req.method === 'PATCH' && req.body.action === 'visibility') {
        if (!dietId || typeof req.body.visible_to_student !== 'boolean') {
          return res.status(400).json({ error: 'Informe a dieta e o status de publicação.' });
        }
        const result = await store.setDietVisibility(id, dietId, req.body.visible_to_student);
        return result
          ? res.json(result)
          : res.status(404).json({ error: 'Dieta não encontrada para este aluno.' });
      }
      if (req.method === 'DELETE') {
        return (await store.deleteDiet(id, dietId))
          ? res.json({ ok: true })
          : res.status(404).json({ error: 'Dieta não encontrada.' });
      }
      if (['POST', 'PATCH'].includes(req.method)) {
        if (!String(req.body.titulo || req.body.title || '').trim()) {
          return res.status(400).json({ error: 'Informe o nome da dieta.' });
        }
        if (req.method === 'PATCH' && !dietId) {
          return res.status(400).json({ error: 'Selecione a dieta.' });
        }
        const result = await store.saveDiet(id, req.body, req.method === 'PATCH' ? dietId : null);
        return result
          ? res.status(req.method === 'POST' ? 201 : 200).json(result)
          : res.status(404).json({ error: 'Dieta não encontrada.' });
      }
    }
    if (resource === 'professor-agua-meta' && professor) {
      if (req.method === 'DELETE' || (req.method === 'PATCH' && req.body.action === 'delete')) {
        return res.json(await store.deleteWaterGoal(id));
      }
      if (['POST', 'PATCH'].includes(req.method)) {
        const goal = Number(req.body.goal_ml);
        if (!validWaterGoal(goal)) {
          return res.status(400).json({ error: 'Meta deve ficar entre 100 e 10.000 ml.' });
        }
        return res.json(await store.setWaterGoal(id, goal, req.body.nome));
      }
    }
    if (resource === 'agua' && !professor && req.method === 'GET') {
      return res.json(await store.getWater(id));
    }
    if (resource === 'agua-checkin' && !professor && req.method === 'POST') {
      const water = await store.getWater(id);
      if (!water.goal_ml) {
        return res.status(400).json({ error: 'Peça ao professor para criar sua meta de água.' });
      }
      if (!validWaterAmount(req.body.amount_ml)) {
        return res.status(400).json({ error: 'Volume inválido.' });
      }
      return res.status(201).json(await store.addWater(id, Number(req.body.amount_ml)));
    }
    return res.status(403).json({ error: 'Ação não permitida para seu perfil.' });
  } catch (error) {
    console.error('[saude]', error);
    return res.status(500).json({ error: 'Falha interna do módulo de saúde.' });
  }
}
