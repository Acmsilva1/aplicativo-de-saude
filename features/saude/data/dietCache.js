/** Cache local de dietas por updated_at (payload completo só se timestamp bater). */

const PREFIX = 'ritmo_diet_cache_v1:';

function key(userId, dietId) {
  return `${PREFIX}${userId}:${dietId}`;
}

export function readDietCache(userId, dietId) {
  if (!userId || !dietId) return null;
  try {
    const raw = localStorage.getItem(key(userId, dietId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.updated_at || !parsed?.payload?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDietCache(userId, diet) {
  if (!userId || !diet?.id || diet.updated_at == null) return;
  try {
    localStorage.setItem(key(userId, diet.id), JSON.stringify({
      updated_at: String(diet.updated_at),
      payload: diet,
    }));
  } catch {
    /* quota / private mode */
  }
}

export function writeDietsCache(userId, diets = []) {
  for (const diet of diets) writeDietCache(userId, diet);
}

export function clearDietCacheForUser(userId) {
  if (!userId || typeof localStorage === 'undefined') return;
  const needle = `${PREFIX}${userId}:`;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(needle)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

/** Limpa todo cache local de dietas (todos os usuários neste aparelho). */
export function clearAllDietCaches() {
  if (typeof localStorage === 'undefined') return;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

/** Remove chaves de app que possam conter dados de saúde no aparelho. */
export function clearAllClientHealthCaches() {
  clearAllDietCaches();
  if (typeof localStorage === 'undefined') return;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith('ritmo_') && !k.startsWith('ritmo_saude_biometric')) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

/** Retorna payloads do cache se todos os summaries baterem em updated_at e tiverem refeições. */
export function hydrateDietsFromCache(userId, summaries = []) {
  if (!userId || !summaries.length) return null;
  const hydrated = [];
  for (const summary of summaries) {
    const hit = readDietCache(userId, summary.id);
    if (!hit || String(hit.updated_at) !== String(summary.updated_at)) return null;
    if (!Array.isArray(hit.payload?.refeicoes)) return null;
    hydrated.push(hit.payload);
  }
  return hydrated;
}

export function dietsHaveStructure(diets = []) {
  return diets.some((diet) => Array.isArray(diet?.refeicoes));
}
