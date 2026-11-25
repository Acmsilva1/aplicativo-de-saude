import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../../lib/supabase.js';
import { listAvailableStudents } from '../../auth/service/supabaseAuthService.js';
import { createEmptyDietMeals, todayDietDate, DIET_MEALS } from '../service/dietasService.js';

const MEAL_TITLE = Object.fromEntries(DIET_MEALS.map((m) => [m.tipo, m.titulo]));

function db() {
  return getSupabaseAdmin();
}

function normalizedMeals(source) {
  return createEmptyDietMeals().map((m) => {
    const entry = Array.isArray(source) ? source.find((x) => x?.tipo === m.tipo) : null;
    return {
      ...m,
      horario: /^([01]\d|2[0-3]):[0-5]\d$/.test(entry?.horario) ? entry.horario : '',
      itens: (Array.isArray(entry?.itens) ? entry.itens : [])
        .slice(0, 80)
        .filter(Boolean)
        .map((x) => ({
          nome: String(x.nome || '').slice(0, 160),
          quantidade: String(x.quantidade || '').slice(0, 80),
          observacao: String(x.observacao || '').slice(0, 500),
          alimento_id: Number.isSafeInteger(Number(x.alimento_id || x.food_id))
            ? Number(x.alimento_id || x.food_id)
            : null,
          ...(Number.isFinite(Number(x.quantidade_valor)) && Number(x.quantidade_valor) > 0
            ? {
              quantidade_valor: Number(x.quantidade_valor),
              quantidade_unidade: ['g', 'ml', 'un', 'porcao'].includes(x.quantidade_unidade)
                ? x.quantidade_unidade
                : 'g',
            }
            : {}),
        }))
        .filter((x) => x.nome),
    };
  });
}

function buildDietPayload(input, id) {
  const diet = {
    id: id || randomUUID(),
    titulo: String(input.titulo || input.title || '').trim().slice(0, 160),
    objetivo: String(input.objetivo || input.objective || '').slice(0, 240),
    observacoes: String(input.observacoes || '').slice(0, 4000),
    meta_calorias: input.meta_calorias ? Number(input.meta_calorias) : null,
    semanal: input.semanal === true,
    refeicoes: normalizedMeals(input.refeicoes),
    updated_at: todayDietDate(),
  };
  if (diet.semanal) {
    diet.semana = Array.from({ length: 7 }, (_, i) => ({
      refeicoes: normalizedMeals(input.semana?.[i]?.refeicoes || []),
    }));
  }
  return diet;
}

function timeOrNull(horario) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(horario || '') ? `${horario}:00` : null;
}

function formatTime(value) {
  if (!value) return '';
  const text = String(value);
  return text.length >= 5 ? text.slice(0, 5) : text;
}

const PLAN_COLS = 'id, title, objective, notes, meta_calorias, semanal, status, updated_at';
const MEAL_COLS = 'id, diet_plan_id, weekday, meal_type, scheduled_at, position';
const ITEM_COLS = 'meal_id, name, quantity, notes, alimento_id, quantidade_valor, quantidade_unidade, position';
const WATER_HISTORY_DAYS = 30;

function shiftDietDate(dateStr, deltaDays) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Início do dia civil America/Sao_Paulo como timestamptz ISO (UTC-3 fixo). */
function saoPauloDayStartIso(dateStr) {
  return `${dateStr}T00:00:00.000-03:00`;
}

function normalizeRequestId(value) {
  const raw = String(value || '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    return raw.toLowerCase();
  }
  return randomUUID();
}

async function loadDietRows(userId, { includeHidden = false } = {}) {
  let query = db()
    .from('health_diet_plans')
    .select(PLAN_COLS)
    .eq('user_id', userId);
  if (!includeHidden) query = query.eq('status', 'active');
  const { data: plans, error } = await query.order('updated_at', { ascending: false });
  if (error) throw error;
  if (!plans?.length) return [];

  const planIds = plans.map((p) => p.id);
  const { data: meals, error: mealsErr } = await db()
    .from('health_diet_meals')
    .select(MEAL_COLS)
    .eq('user_id', userId)
    .in('diet_plan_id', planIds)
    .order('position', { ascending: true });
  if (mealsErr) throw mealsErr;

  const mealIds = (meals || []).map((m) => m.id);
  const { data: items, error: itemsErr } = mealIds.length
    ? await db()
      .from('health_diet_items')
      .select(ITEM_COLS)
      .eq('user_id', userId)
      .in('meal_id', mealIds)
      .order('position', { ascending: true })
    : { data: [], error: null };
  if (itemsErr) throw itemsErr;

  const itemsByMeal = new Map();
  for (const item of items || []) {
    const list = itemsByMeal.get(item.meal_id) || [];
    list.push({
      nome: item.name,
      quantidade: item.quantity || '',
      observacao: item.notes || '',
      alimento_id: item.alimento_id,
      ...(item.quantidade_valor != null
        ? {
          quantidade_valor: Number(item.quantidade_valor),
          quantidade_unidade: item.quantidade_unidade || 'g',
        }
        : {}),
    });
    itemsByMeal.set(item.meal_id, list);
  }

  return plans.map((plan) => {
    const planMeals = (meals || []).filter((m) => m.diet_plan_id === plan.id);
    const diet = {
      id: plan.id,
      titulo: plan.title,
      objetivo: plan.objective || '',
      observacoes: plan.notes || '',
      meta_calorias: plan.meta_calorias,
      semanal: plan.semanal === true,
      visible_to_student: plan.status === 'active',
      updated_at: String(plan.updated_at || '').slice(0, 10),
      refeicoes: createEmptyDietMeals(),
    };

    if (plan.semanal) {
      diet.semana = Array.from({ length: 7 }, () => ({ refeicoes: createEmptyDietMeals() }));
      for (const meal of planMeals) {
        if (meal.weekday < 1 || meal.weekday > 7) continue;
        const day = diet.semana[meal.weekday - 1];
        const slot = day.refeicoes.find((m) => m.tipo === meal.meal_type);
        if (!slot) continue;
        slot.horario = formatTime(meal.scheduled_at);
        slot.itens = itemsByMeal.get(meal.id) || [];
      }
      diet.refeicoes = diet.semana[0]?.refeicoes || createEmptyDietMeals();
    } else {
      for (const meal of planMeals.filter((m) => m.weekday === 0)) {
        const slot = diet.refeicoes.find((m) => m.tipo === meal.meal_type);
        if (!slot) continue;
        slot.horario = formatTime(meal.scheduled_at);
        slot.itens = itemsByMeal.get(meal.id) || [];
      }
    }
    return diet;
  });
}

function isMissingRpc(error) {
  const msg = String(error?.message || '');
  return error?.code === 'PGRST202' || /Could not find the function|schema cache/i.test(msg);
}

function buildDietStructureRows(userId, diet) {
  const mealRows = [];
  const itemRows = [];

  function pushDay(weekday, refeicoes) {
    (refeicoes || []).forEach((meal, position) => {
      const mealId = randomUUID();
      mealRows.push({
        id: mealId,
        diet_plan_id: diet.id,
        user_id: userId,
        weekday,
        meal_type: meal.tipo,
        title: MEAL_TITLE[meal.tipo] || meal.tipo,
        scheduled_at: timeOrNull(meal.horario),
        position,
      });
      (meal.itens || []).forEach((item, itemPos) => {
        itemRows.push({
          id: randomUUID(),
          meal_id: mealId,
          user_id: userId,
          name: item.nome,
          quantity: item.quantidade || '',
          notes: item.observacao || '',
          alimento_id: item.alimento_id || null,
          quantidade_valor: item.quantidade_valor ?? null,
          quantidade_unidade: item.quantidade_unidade || null,
          position: itemPos,
        });
      });
    });
  }

  if (diet.semanal) {
    (diet.semana || []).forEach((day, index) => pushDay(index + 1, day.refeicoes));
  } else {
    pushDay(0, diet.refeicoes);
  }
  return { mealRows, itemRows };
}

async function replaceDietStructureLegacy(userId, diet, mealRows, itemRows) {
  const admin = db();
  await admin.from('health_diet_items').delete().eq('user_id', userId).in(
    'meal_id',
    (
      await admin.from('health_diet_meals').select('id').eq('user_id', userId).eq('diet_plan_id', diet.id)
    ).data?.map((m) => m.id) || ['00000000-0000-0000-0000-000000000000']
  );
  await admin.from('health_diet_meals').delete().eq('user_id', userId).eq('diet_plan_id', diet.id);
  if (mealRows.length) {
    const { error } = await admin.from('health_diet_meals').insert(mealRows);
    if (error) throw error;
  }
  if (itemRows.length) {
    const { error } = await admin.from('health_diet_items').insert(itemRows);
    if (error) throw error;
  }
}

async function replaceDietStructure(userId, diet) {
  const { mealRows, itemRows } = buildDietStructureRows(userId, diet);
  const mealsJson = mealRows.map((m) => ({
    id: m.id,
    weekday: m.weekday,
    meal_type: m.meal_type,
    title: m.title,
    scheduled_at: m.scheduled_at || '',
    position: m.position,
  }));
  const itemsJson = itemRows.map((i) => ({
    id: i.id,
    meal_id: i.meal_id,
    name: i.name,
    quantity: i.quantity || '',
    notes: i.notes || '',
    alimento_id: i.alimento_id == null ? '' : String(i.alimento_id),
    quantidade_valor: i.quantidade_valor == null ? '' : String(i.quantidade_valor),
    quantidade_unidade: i.quantidade_unidade || '',
    position: i.position,
  }));

  const { error } = await db().rpc('health_replace_diet_structure', {
    p_user_id: userId,
    p_diet_plan_id: diet.id,
    p_meals: mealsJson,
    p_items: itemsJson,
  });
  if (!error) return;
  if (!isMissingRpc(error)) throw error;
  await replaceDietStructureLegacy(userId, diet, mealRows, itemRows);
}

function localDateFromTs(iso) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function localTimeFromTs(iso) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export const supabaseSaudeStore = {
  async deleteUserData(id) {
    const admin = db();
    await admin.from('health_webauthn_credentials').delete().eq('user_id', id);
    await admin.from('health_diet_templates').delete().eq('professor_id', id);
    await admin.from('health_water_entries').delete().eq('user_id', id);
    await admin.from('health_water_goals').delete().eq('user_id', id);
    await admin.from('health_diet_items').delete().eq('user_id', id);
    await admin.from('health_diet_meals').delete().eq('user_id', id);
    await admin.from('health_diet_plans').delete().eq('user_id', id);
  },

  async getTemplates(ownerId) {
    const { data, error } = await db()
      .from('health_diet_templates')
      .select('id, title, objective, notes, meta_calorias, semanal, template_data, updated_at')
      .eq('professor_id', ownerId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      titulo: row.title,
      objetivo: row.objective || '',
      observacoes: row.notes || '',
      meta_calorias: row.meta_calorias,
      semanal: row.semanal === true,
      ...(row.template_data || {}),
      updated_at: String(row.updated_at || '').slice(0, 10),
    }));
  },

  async saveTemplate(ownerId, input, id) {
    const diet = buildDietPayload(input, id || randomUUID());
    const payload = {
      id: diet.id,
      professor_id: ownerId,
      title: diet.titulo,
      objective: diet.objetivo,
      notes: diet.observacoes,
      meta_calorias: diet.meta_calorias,
      semanal: diet.semanal,
      template_data: {
        refeicoes: diet.refeicoes,
        ...(diet.semanal ? { semana: diet.semana } : {}),
      },
      updated_at: new Date().toISOString(),
    };
    if (id) {
      const { data, error } = await db()
        .from('health_diet_templates')
        .update(payload)
        .eq('id', id)
        .eq('professor_id', ownerId)
        .select('id, title, objective, notes, meta_calorias, semanal, template_data, updated_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
    } else {
      const { error } = await db().from('health_diet_templates').insert(payload);
      if (error) throw error;
    }
    const list = await this.getTemplates(ownerId);
    return list.find((t) => t.id === diet.id) || null;
  },

  async deleteTemplate(ownerId, id) {
    const { error, count } = await db()
      .from('health_diet_templates')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('professor_id', ownerId);
    if (error) throw error;
    return (count || 0) > 0;
  },

  async getProfessorUsers(professorId) {
    const students = await listAvailableStudents(professorId);
    if (!students.length) return [];

    const { data: rpcData, error: rpcErr } = await db().rpc('health_professor_student_stats', {
      p_professor_id: professorId,
    });
    if (!rpcErr) {
      const byId = new Map((rpcData || []).map((row) => [row.user_id, row]));
      return students.map((student) => {
        const stats = byId.get(student.id);
        return {
          ...student,
          diet_title: stats?.diet_title || 'Sem dieta',
          diet_count: Number(stats?.diet_count || 0),
          water: {
            goal_ml: stats?.goal_ml ?? null,
            nome: stats?.nome || 'Hidratação diária',
            total_ml: Number(stats?.total_ml || 0),
          },
        };
      });
    }
    if (!isMissingRpc(rpcErr)) throw rpcErr;

    // Fallback multi-query (antes da migration de RPCs).
    const ids = students.map((student) => student.id);
    const today = todayDietDate();
    const todayStart = saoPauloDayStartIso(today);
    const tomorrowStart = saoPauloDayStartIso(shiftDietDate(today, 1));
    const [plansResult, goalsResult, entriesResult] = await Promise.all([
      db().from('health_diet_plans')
        .select('user_id, title, updated_at')
        .in('user_id', ids)
        .eq('status', 'active')
        .order('updated_at', { ascending: false }),
      db().from('health_water_goals')
        .select('user_id, goal_ml, nome')
        .in('user_id', ids),
      db().from('health_water_entries')
        .select('user_id, amount_ml')
        .in('user_id', ids)
        .gte('recorded_at', todayStart)
        .lt('recorded_at', tomorrowStart),
    ]);
    if (plansResult.error) throw plansResult.error;
    if (goalsResult.error) throw goalsResult.error;
    if (entriesResult.error) throw entriesResult.error;

    const dietStats = new Map();
    for (const plan of plansResult.data || []) {
      const stats = dietStats.get(plan.user_id) || { title: 'Sem dieta', count: 0 };
      stats.count += 1;
      if (stats.count === 1) stats.title = plan.title || 'Sem dieta';
      dietStats.set(plan.user_id, stats);
    }
    const goalByStudent = new Map((goalsResult.data || []).map((goal) => [goal.user_id, goal]));
    const waterToday = new Map();
    for (const entry of entriesResult.data || []) {
      waterToday.set(entry.user_id, (waterToday.get(entry.user_id) || 0) + Number(entry.amount_ml || 0));
    }

    return students.map((student) => {
      const diets = dietStats.get(student.id) || { title: 'Sem dieta', count: 0 };
      const goal = goalByStudent.get(student.id);
      return {
        ...student,
        diet_title: diets.title,
        diet_count: diets.count,
        water: {
          goal_ml: goal?.goal_ml ?? null,
          nome: goal?.nome || 'Hidratação diária',
          total_ml: waterToday.get(student.id) || 0,
        },
      };
    });
  },

  async getProfessorDietSummaries(professorId, studentId) {
    const [roleResult, plansResult] = await Promise.all([
      db().from('health_user_roles')
        .select('user_id')
        .eq('user_id', studentId)
        .eq('role', 'student')
        .eq('professor_id', professorId)
        .eq('access_enabled', true)
        .maybeSingle(),
      db().from('health_diet_plans')
        .select('id, title, objective, notes, meta_calorias, semanal, status, updated_at')
        .eq('user_id', studentId)
        .order('updated_at', { ascending: false }),
    ]);
    if (roleResult.error) throw roleResult.error;
    if (plansResult.error) throw plansResult.error;
    if (!roleResult.data) return null;
    return (plansResult.data || []).map((plan) => ({
      id: plan.id,
      titulo: plan.title,
      objetivo: plan.objective || '',
      observacoes: plan.notes || '',
      meta_calorias: plan.meta_calorias,
      semanal: plan.semanal === true,
      visible_to_student: plan.status === 'active',
      updated_at: String(plan.updated_at || '').slice(0, 10),
    }));
  },

  async getProfessorWater(professorId, studentId) {
    const { data: role, error: roleErr } = await db().from('health_user_roles')
      .select('user_id')
      .eq('user_id', studentId)
      .eq('role', 'student')
      .eq('professor_id', professorId)
      .eq('access_enabled', true)
      .maybeSingle();
    if (roleErr) throw roleErr;
    if (!role) return null;
    const [{ data: profile, error: profileErr }, water] = await Promise.all([
      db().from('health_user_profiles').select('nome, email').eq('user_id', studentId).maybeSingle(),
      this.getWater(studentId),
    ]);
    if (profileErr) throw profileErr;
    if (!profile) return null;
    return {
      user: {
        id: studentId,
        role: 'student',
        professor_id: professorId,
        role_label: 'Aluno',
        access: true,
        name: profile.nome || '',
        email: profile.email,
      },
      water,
    };
  },

  async canUserAccess(id) {
    const students = await listAvailableStudents();
    return students.some((p) => p.id === id && p.access);
  },

  async hasStudent(id, professorId) {
    if (!id || !professorId) return false;
    const { data, error } = await db().from('health_user_roles')
      .select('user_id')
      .eq('user_id', id)
      .eq('role', 'student')
      .eq('professor_id', professorId)
      .eq('access_enabled', true)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },

  async getDiets(id) {
    return loadDietRows(id);
  },

  async getProfessorDiets(id) {
    return loadDietRows(id, { includeHidden: true });
  },

  async setDietVisibility(userId, dietId, visible) {
    const { data, error } = await db().from('health_diet_plans')
      .update({ status: visible ? 'active' : 'archived', updated_at: new Date().toISOString() })
      .eq('id', dietId)
      .eq('user_id', userId)
      .select('id, status')
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, visible_to_student: data.status === 'active' } : null;
  },

  async getDiet(id, dietId) {
    const diets = await loadDietRows(id, { includeHidden: true });
    return diets.find((x) => x.id === dietId) || diets[0] || null;
  },

  async saveDiet(id, input, dietId) {
    const diet = buildDietPayload(input, dietId || randomUUID());
    if (!diet.titulo) return null;
    const admin = db();

    if (dietId) {
      const { data: existing, error: existingErr } = await admin
        .from('health_diet_plans')
        .select('id, status')
        .eq('id', dietId)
        .eq('user_id', id)
        .maybeSingle();
      if (existingErr) throw existingErr;
      if (!existing) return null;
      const status = typeof input.visible_to_student === 'boolean'
        ? (input.visible_to_student ? 'active' : 'archived')
        : existing.status;
      const { error } = await admin
        .from('health_diet_plans')
        .update({
          title: diet.titulo,
          objective: diet.objetivo,
          notes: diet.observacoes,
          meta_calorias: diet.meta_calorias,
          semanal: diet.semanal,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dietId)
        .eq('user_id', id);
      if (error) throw error;
    } else {
      const { error } = await admin.from('health_diet_plans').insert({
        id: diet.id,
        user_id: id,
        title: diet.titulo,
        objective: diet.objetivo,
        notes: diet.observacoes,
        meta_calorias: diet.meta_calorias,
        semanal: diet.semanal,
        status: input.visible_to_student === true ? 'active' : 'archived',
      });
      if (error) throw error;
    }

    await replaceDietStructure(id, diet);
    return this.getDiet(id, diet.id);
  },

  async deleteDiet(id, dietId) {
    const { error, count } = await db()
      .from('health_diet_plans')
      .delete({ count: 'exact' })
      .eq('id', dietId)
      .eq('user_id', id);
    if (error) throw error;
    return (count || 0) > 0;
  },

  async peekWaterGoal(id) {
    const { data, error } = await db()
      .from('health_water_goals')
      .select('goal_ml')
      .eq('user_id', id)
      .maybeSingle();
    if (error) throw error;
    return data?.goal_ml ?? null;
  },

  async getWater(id) {
    const { data, error } = await db().rpc('health_water_snapshot', { p_user_id: id });
    if (!error && data) {
      return {
        goal_ml: data.goal_ml ?? null,
        nome: data.nome || 'Hidratação diária',
        checkins: Array.isArray(data.checkins) ? data.checkins : [],
        total_ml: Number(data.total_ml || 0),
        date: data.date || todayDietDate(),
        history: Array.isArray(data.history) ? data.history : [],
      };
    }
    if (error && !isMissingRpc(error)) throw error;

    const date = todayDietDate();
    const todayStart = saoPauloDayStartIso(date);
    const tomorrowStart = saoPauloDayStartIso(shiftDietDate(date, 1));
    const historyStart = saoPauloDayStartIso(shiftDietDate(date, -WATER_HISTORY_DAYS));
    const [goalResult, todayResult, historyResult] = await Promise.all([
      db().from('health_water_goals')
        .select('goal_ml, nome')
        .eq('user_id', id)
        .maybeSingle(),
      db().from('health_water_entries')
        .select('id, amount_ml, recorded_at')
        .eq('user_id', id)
        .gte('recorded_at', todayStart)
        .lt('recorded_at', tomorrowStart)
        .order('recorded_at', { ascending: false }),
      db().from('health_water_entries')
        .select('amount_ml, recorded_at')
        .eq('user_id', id)
        .gte('recorded_at', historyStart)
        .lt('recorded_at', todayStart)
        .order('recorded_at', { ascending: false })
        .limit(400),
    ]);
    if (goalResult.error) throw goalResult.error;
    if (todayResult.error) throw todayResult.error;
    if (historyResult.error) throw historyResult.error;
    const goalRow = goalResult.data;

    const checkins = (todayResult.data || []).map((entry) => ({
      id: entry.id,
      amount_ml: entry.amount_ml,
      date,
      time: localTimeFromTs(entry.recorded_at),
      recorded_at: entry.recorded_at,
    }));
    const byDay = new Map();
    for (const entry of historyResult.data || []) {
      const day = localDateFromTs(entry.recorded_at);
      byDay.set(day, (byDay.get(day) || 0) + Number(entry.amount_ml || 0));
    }
    const history = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, total_ml]) => ({ date: day, total_ml }));
    return {
      goal_ml: goalRow?.goal_ml ?? null,
      nome: goalRow?.nome || 'Hidratação diária',
      checkins,
      total_ml: checkins.reduce((s, x) => s + x.amount_ml, 0),
      date,
      history,
    };
  },

  async setWaterGoal(id, goal, name) {
    const payload = {
      user_id: id,
      goal_ml: goal,
      nome: String(name || 'Hidratação diária').slice(0, 80),
      updated_at: new Date().toISOString(),
    };
    const { error } = await db().from('health_water_goals').upsert(payload);
    if (error) throw error;
    return this.getWater(id);
  },

  async deleteWaterGoal(id) {
    const { error } = await db().from('health_water_goals').delete().eq('user_id', id);
    if (error) throw error;
    return this.getWater(id);
  },

  async addWater(id, amount, requestId) {
    const rid = normalizeRequestId(requestId);
    const { data, error } = await db().rpc('health_water_checkin', {
      p_user_id: id,
      p_amount_ml: amount,
      p_request_id: rid,
    });
    if (!error && data) {
      return {
        goal_ml: data.goal_ml ?? null,
        nome: data.nome || 'Hidratação diária',
        checkins: Array.isArray(data.checkins) ? data.checkins : [],
        total_ml: Number(data.total_ml || 0),
        date: data.date || todayDietDate(),
        history: Array.isArray(data.history) ? data.history : [],
      };
    }
    if (error && !isMissingRpc(error)) throw error;

    const { error: insertErr } = await db().from('health_water_entries').insert({
      id: randomUUID(),
      user_id: id,
      amount_ml: amount,
      recorded_at: new Date().toISOString(),
      request_id: rid,
    });
    // Idempotência: mesmo request_id do cliente → sucesso sem duplicar.
    if (insertErr && insertErr.code !== '23505') throw insertErr;
    return this.getWater(id);
  },

  async listAlimentos() {
    const { data, error } = await db()
      .from('health_alimentos')
      .select('id, source_order, categoria, item, porcao_equivalente, peso_referencia_g, kcal_100g, proteina_100g, carboidrato_100g, gordura_100g, observacoes, fonte_nutricional')
      .order('source_order', { ascending: true });
    if (error) throw error;
    return (data || []).map((food) => ({
      id: food.id,
      source_order: food.source_order,
      categoria: food.categoria,
      item: food.item,
      porcao: food.porcao_equivalente,
      peso_referencia_g: food.peso_referencia_g == null ? null : Number(food.peso_referencia_g),
      kcal_100g: Number(food.kcal_100g),
      proteina_100g: Number(food.proteina_100g),
      carboidrato_100g: Number(food.carboidrato_100g),
      gordura_100g: Number(food.gordura_100g),
      observacoes: food.observacoes,
      fonte_nutricional: food.fonte_nutricional,
    }));
  },

  // Avaliações corporais: protótipo só no mock local (FORCE_MOCK=true).
  async getAssessments() { return []; },
  async getProfessorAssessments(_professorId, studentId) {
    return { user: { id: studentId }, assessments: [] };
  },
  async getAssessment() { return null; },
  async saveAssessment() {
    return { error: 'Avaliações corporais ainda não estão disponíveis neste ambiente. Use o modo mock local.' };
  },
  async deleteAssessment() { return false; },
};
