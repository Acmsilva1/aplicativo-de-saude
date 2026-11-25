-- Avaliações corporais (IMC / composição). NÃO aplicar em produção ainda — protótipo mock local.
-- Depende de health_user_profiles.

begin;

alter table public.health_user_profiles
  add column if not exists sexo text check (sexo is null or sexo in ('male', 'female')),
  add column if not exists data_nascimento date;

comment on column public.health_user_profiles.sexo is 'Sexo biológico para fórmulas de composição (male/female).';
comment on column public.health_user_profiles.data_nascimento is 'Usada em Jackson-Pollock e categorias por idade.';

create table if not exists public.health_body_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  avaliado_em date not null,
  peso_kg numeric(6, 2) not null check (peso_kg between 20 and 400),
  altura_cm numeric(6, 2) not null check (altura_cm between 100 and 250),
  pescoco_cm numeric(6, 2) check (pescoco_cm is null or pescoco_cm between 20 and 80),
  cintura_cm numeric(6, 2) check (cintura_cm is null or cintura_cm between 40 and 200),
  quadril_cm numeric(6, 2) check (quadril_cm is null or quadril_cm between 40 and 200),
  peito_mm numeric(6, 2) check (peito_mm is null or peito_mm between 1 and 80),
  axilar_media_mm numeric(6, 2) check (axilar_media_mm is null or axilar_media_mm between 1 and 80),
  triceps_mm numeric(6, 2) check (triceps_mm is null or triceps_mm between 1 and 80),
  subescapular_mm numeric(6, 2) check (subescapular_mm is null or subescapular_mm between 1 and 80),
  abdominal_mm numeric(6, 2) check (abdominal_mm is null or abdominal_mm between 1 and 80),
  suprailiaca_mm numeric(6, 2) check (suprailiaca_mm is null or suprailiaca_mm between 1 and 80),
  coxa_mm numeric(6, 2) check (coxa_mm is null or coxa_mm between 1 and 80),
  gordura_pct_informada numeric(5, 2) check (gordura_pct_informada is null or gordura_pct_informada between 1 and 70),
  metodo_preferido text not null default 'auto' check (metodo_preferido in ('auto', 'manual', 'jp3', 'jp7', 'navy')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists health_body_assessments_user_date_idx
  on public.health_body_assessments (user_id, avaliado_em desc);

drop trigger if exists health_body_assessments_touch_updated_at on public.health_body_assessments;
create trigger health_body_assessments_touch_updated_at
  before update on public.health_body_assessments
  for each row execute function public.health_touch_updated_at();

alter table public.health_body_assessments enable row level security;
alter table public.health_body_assessments force row level security;

revoke all on public.health_body_assessments from anon, authenticated;
grant select on public.health_body_assessments to authenticated;
grant select, insert, update, delete on public.health_body_assessments to service_role;

drop policy if exists health_body_assessments_select on public.health_body_assessments;
create policy health_body_assessments_select on public.health_body_assessments
  for select to authenticated
  using (
    public.health_is_admin()
    or user_id = auth.uid()
    or public.health_is_professor_of(user_id)
  );

drop policy if exists health_body_assessments_write on public.health_body_assessments;
create policy health_body_assessments_write on public.health_body_assessments
  for all to authenticated
  using (public.health_is_admin() or public.health_is_professor_of(user_id))
  with check (public.health_is_admin() or public.health_is_professor_of(user_id));

commit;
