/**
 * Testes da Fase 3 — migration RPCs + wiring no store + mock intacto.
 * node scripts/check-phase3.mjs
 */
process.env.FORCE_MOCK = 'true';
process.env.NODE_ENV = 'development';

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const migrationName = '20261123200000_health_hotpath_rpcs.sql';
const sql = await readFile(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');

assert.ok(/^\s*begin;/im.test(sql));
assert.ok(/^\s*commit;/im.test(sql));
for (const fn of [
  'health_water_snapshot',
  'health_water_checkin',
  'health_professor_student_stats',
  'health_replace_diet_structure',
]) {
  assert.ok(sql.includes(`function public.${fn}`), fn);
  assert.ok(sql.includes(`grant execute on function public.${fn}`), `grant ${fn}`);
}
assert.ok(sql.includes('on conflict (user_id, request_id) do nothing'));
assert.ok(sql.includes('service_role'));
assert.equal(/\bgrant execute\b[\s\S]*\bto authenticated\b/i.test(sql), false, 'RPCs não devem ir para authenticated');
assert.equal(/\bdrop\s+table\b/i.test(sql), false);

const files = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
  .filter((f) => f.endsWith('.sql'))
  .sort();
assert.ok(files.indexOf('20261123190000_perf_indexes_auth_uid_cache.sql') < files.indexOf(migrationName));

const storeSrc = await readFile(new URL('../features/saude/data/supabaseSaudeStore.js', import.meta.url), 'utf8');
assert.ok(storeSrc.includes("rpc('health_water_checkin'"));
assert.ok(storeSrc.includes("rpc('health_water_snapshot'"));
assert.ok(storeSrc.includes("rpc('health_professor_student_stats'"));
assert.ok(storeSrc.includes("rpc('health_replace_diet_structure'"));
assert.ok(storeSrc.includes('isMissingRpc'));
assert.ok(storeSrc.includes('replaceDietStructureLegacy'));

// Mock continua funcionando (sem RPC).
const { saudeStore } = await import('../features/saude/data/saudeStore.js');
const id = `phase3-${randomUUID()}`;
await saudeStore.setWaterGoal(id, 2000, 'RPC mock');
const rid = randomUUID();
const a = await saudeStore.addWater(id, 200, rid);
const b = await saudeStore.addWater(id, 200, rid);
assert.equal(a.total_ml, 200);
assert.equal(b.total_ml, 200);

console.log('PASS phase3: RPC migration, store wiring, mock fallback path intact');
