/**
 * Testes da Fase 2 — store mock (água/request_id) + asserts estáticos no store real.
 * node scripts/check-phase2.mjs
 */
process.env.FORCE_MOCK = 'true';
process.env.NODE_ENV = 'development';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const { mockSaudeStore: store } = await import('../features/saude/data/mockSaudeStore.js');
const { saudeStore } = await import('../features/saude/data/saudeStore.js');

const userId = `phase2-${randomUUID()}`;

// 1) peekWaterGoal sem meta
assert.equal(await saudeStore.peekWaterGoal(userId), null);

// 2) meta + check-in com request_id idempotente
await saudeStore.setWaterGoal(userId, 2000, 'Teste');
assert.equal(await saudeStore.peekWaterGoal(userId), 2000);

const rid = randomUUID();
const first = await saudeStore.addWater(userId, 200, rid);
assert.equal(first.total_ml, 200);
assert.equal(first.checkins.length, 1);

const second = await saudeStore.addWater(userId, 200, rid);
assert.equal(second.total_ml, 200, 'mesmo request_id não deve duplicar');
assert.equal(second.checkins.length, 1);

const third = await saudeStore.addWater(userId, 300, randomUUID());
assert.equal(third.total_ml, 500);
assert.equal(third.checkins.length, 2);

// 3) Store supabase: selects e filtros presentes no código
const src = await readFile(new URL('../features/saude/data/supabaseSaudeStore.js', import.meta.url), 'utf8');
assert.ok(src.includes("select('goal_ml, nome')") || src.includes('select(\'goal_ml, nome\')'));
assert.ok(src.includes('WATER_HISTORY_DAYS'));
assert.ok(src.includes('saoPauloDayStartIso'));
assert.ok(src.includes("select('*')") === false || true);
// Preferência: não usar select('*') nos hot paths
assert.equal(/\.(select\(\s*'\*'\s*\))/.test(src), false, 'supabaseSaudeStore não deve usar select(*)');
assert.ok(src.includes('normalizeRequestId'));
assert.ok(/code !== '23505'/.test(src), 'idempotência 23505 no fallback de insert');
assert.ok(src.includes('peekWaterGoal'));
assert.ok(src.includes('porcao_equivalente'));

// 4) API e front enviam request_id
const apiSrc = await readFile(new URL('../api/saude.js', import.meta.url), 'utf8');
assert.ok(apiSrc.includes('peekWaterGoal'));
assert.ok(apiSrc.includes('request_id'));

const appSrc = await readFile(new URL('../features/app.js', import.meta.url), 'utf8');
assert.ok(
  /request_id:\s*(requestId|part\.requestId)/.test(appSrc),
  'front deve enviar request_id no check-in de água',
);

// 5) Contrato getWater
const water = await store.getWater(userId);
assert.ok(Array.isArray(water.history));
assert.ok(water.history.length <= 30);
assert.equal(typeof water.total_ml, 'number');

console.log('PASS phase2: peekWaterGoal, request_id idempotent, selects, day filter wiring');
