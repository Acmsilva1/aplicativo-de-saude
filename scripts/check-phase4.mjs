/**
 * Testes da Fase 4 — trim e-mail, debounce água, cache de dieta.
 * node scripts/check-phase4.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authSrc = await readFile(new URL('../features/auth/index.js', import.meta.url), 'utf8');
assert.ok(authSrc.includes('email.value.trim()'), 'login deve enviar e-mail com trim');

const appSrc = await readFile(new URL('../features/app.js', import.meta.url), 'utf8');
assert.ok(appSrc.includes('WATER_DEBOUNCE_MS'));
assert.ok(appSrc.includes('flushWaterBuffer'));
assert.ok(appSrc.includes('waterBuffer'));
assert.ok(appSrc.includes('hydrateDietsFromCache'));
assert.ok(appSrc.includes('writeDietsCache'));
assert.ok(appSrc.includes('clearDietCacheForUser'));

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

const {
  clearDietCacheForUser,
  dietsHaveStructure,
  hydrateDietsFromCache,
  readDietCache,
  writeDietCache,
  writeDietsCache,
} = await import('../features/saude/data/dietCache.js');

const userId = 'user-phase4';
const diet = {
  id: 'diet-1',
  updated_at: '2026-11-23',
  titulo: 'Plano',
  refeicoes: [{ tipo: 'almoco', itens: [{ nome: 'Arroz' }] }],
};
writeDietCache(userId, diet);
assert.equal(readDietCache(userId, 'diet-1').updated_at, '2026-11-23');

const hydrated = hydrateDietsFromCache(userId, [{ id: 'diet-1', updated_at: '2026-11-23' }]);
assert.ok(hydrated);
assert.equal(hydrated[0].titulo, 'Plano');
assert.equal(hydrateDietsFromCache(userId, [{ id: 'diet-1', updated_at: '2026-11-22' }]), null);

assert.equal(dietsHaveStructure(hydrated), true);
assert.equal(dietsHaveStructure([{ id: 'x' }]), false);

writeDietsCache(userId, [diet, { id: 'diet-2', updated_at: '2026-11-23', refeicoes: [] }]);
clearDietCacheForUser(userId);
assert.equal(readDietCache(userId, 'diet-1'), null);

console.log('PASS phase4: email trim, water debounce wiring, diet cache');
