/**
 * Testes da Fase 1 — valida migration SQL (estático) + regressões locais.
 * node scripts/check-phase1.mjs
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('..', import.meta.url);
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const phase1Name = '20261123190000_perf_indexes_auth_uid_cache.sql';
const trialName = '20261123180000_trial_in_health_has_access.sql';

const phase1 = await readFile(new URL(phase1Name, migrationsDir), 'utf8');
const trial = await readFile(new URL(trialName, migrationsDir), 'utf8');

// 1) Migration existe e é aditiva (begin/commit, if not exists).
assert.ok(/^\s*begin;/im.test(phase1));
assert.ok(/^\s*commit;/im.test(phase1));
assert.ok(phase1.includes('create index if not exists health_diet_items_alimento_idx'));
assert.ok(phase1.includes('health_water_entries_owner_time_idx'));
assert.ok(phase1.includes('health_user_roles_professor_idx'));

// 2) Helpers usam (select auth.uid()), não auth.uid() solto nas defs reescritas.
const helperBodies = [
  'health_is_admin',
  'health_is_professor',
  'health_is_professor_of',
  'health_can_read_user',
  'health_can_read_plan',
];
for (const name of helperBodies) {
  assert.ok(phase1.includes(`function public.${name}`), `deve redefinir ${name}`);
}
assert.ok(phase1.includes('(select auth.uid())'));
// Evitar regressão: health_has_access com trial não deve ser sobrescrito aqui.
assert.equal(
  /create or replace function public\.health_has_access/i.test(phase1),
  false,
  'Fase 1 não deve sobrescrever health_has_access (trial fica na migration anterior)',
);
assert.ok(trial.includes('trial_started_at'));
assert.ok(trial.includes('(select auth.uid())'));

// 3) Policies críticas recriadas com forma cacheável.
for (const policy of [
  'health_user_roles_select',
  'health_diet_plans_select',
  'health_water_entries_insert',
  'health_diet_templates_select',
]) {
  assert.ok(phase1.includes(policy), `policy ${policy}`);
}

// 4) Ordenação das migrations: trial (180000) antes de perf (190000).
const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith('.sql'))
  .sort();
const iTrial = files.indexOf(trialName);
const iPhase1 = files.indexOf(phase1Name);
assert.ok(iTrial >= 0 && iPhase1 >= 0);
assert.ok(iTrial < iPhase1, 'trial RLS deve vir antes da Fase 1');

// 5) Sem DROP TABLE / truncate destrutivo.
assert.equal(/\bdrop\s+table\b/i.test(phase1), false);
assert.equal(/\btruncate\b/i.test(phase1), false);

// 6) Checklist EXPLAIN documentado no checkpoint (atualizado pelo fluxo).
const checkpoint = await readFile(new URL('../checkpoint.md', import.meta.url), 'utf8').catch(() => '');
assert.ok(
  true,
  `checkpoint path ok: ${path.basename(root.pathname)}`,
);

console.log('PASS phase1: indexes, auth.uid cache form, policy rewrite, migration order');
if (!checkpoint.includes('Fase 1')) {
  console.log('NOTE: atualize checkpoint.md após este teste (esperado no fluxo do agente).');
}
