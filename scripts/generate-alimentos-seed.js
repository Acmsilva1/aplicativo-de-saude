import fs from 'fs';
import { ALIMENTOS_NUTRICIONAIS } from '../features/saude/data/alimentosNutricionais.js';

function sqlStr(v) {
  if (v == null) return 'null';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlNum(v, fallback = null) {
  if (v == null || v === '') return fallback == null ? 'null' : String(fallback);
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback == null ? 'null' : String(fallback);
  return String(n);
}

const rows = ALIMENTOS_NUTRICIONAIS.map((a) => (
  `  (${a.source_order}, ${sqlStr(a.categoria)}, ${sqlStr(a.item)}, ${sqlStr(a.porcao || '')}, ${sqlNum(a.peso_referencia_g)}, ${sqlNum(a.kcal_100g, 0)}, ${sqlNum(a.proteina_100g, 0)}, ${sqlNum(a.carboidrato_100g, 0)}, ${sqlNum(a.gordura_100g, 0)}, ${sqlStr(a.observacoes)}, ${sqlStr(a.fonte_nutricional || 'Cadastro manual')})`
)).join(',\n');

const sql = `-- Seed do catálogo health_alimentos (${ALIMENTOS_NUTRICIONAIS.length} itens do mock local).
-- Rodar DEPOIS de 20261120000002_alimentos_catalog.sql
-- Idempotente via ON CONFLICT (source_order).

begin;

insert into public.health_alimentos (
  source_order,
  categoria,
  item,
  porcao_equivalente,
  peso_referencia_g,
  kcal_100g,
  proteina_100g,
  carboidrato_100g,
  gordura_100g,
  observacoes,
  fonte_nutricional
) values
${rows}
on conflict (source_order) do update set
  categoria = excluded.categoria,
  item = excluded.item,
  porcao_equivalente = excluded.porcao_equivalente,
  peso_referencia_g = excluded.peso_referencia_g,
  kcal_100g = excluded.kcal_100g,
  proteina_100g = excluded.proteina_100g,
  carboidrato_100g = excluded.carboidrato_100g,
  gordura_100g = excluded.gordura_100g,
  observacoes = excluded.observacoes,
  fonte_nutricional = excluded.fonte_nutricional,
  updated_at = now();

select setval(
  pg_get_serial_sequence('public.health_alimentos', 'id'),
  coalesce((select max(id) from public.health_alimentos), 1),
  true
);

commit;
`;

fs.mkdirSync('supabase/seed', { recursive: true });
fs.writeFileSync('supabase/seed/health_alimentos.sql', sql, 'utf8');
console.log(`ok ${ALIMENTOS_NUTRICIONAIS.length} rows -> supabase/seed/health_alimentos.sql`);
