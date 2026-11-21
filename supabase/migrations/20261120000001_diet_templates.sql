-- Portfólio reutilizável do professor (modelos de dieta).
-- Dependência: 20261120000000_initial_health_modules.sql

begin;

create table if not exists public.health_diet_templates (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  objective text not null default '' check (char_length(objective) <= 240),
  notes text not null default '' check (char_length(notes) <= 4000),
  meta_calorias integer check (meta_calorias is null or meta_calorias between 500 and 10000),
  semanal boolean not null default false,
  template_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(template_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists health_diet_templates_professor_idx
  on public.health_diet_templates (professor_id, updated_at desc);

drop trigger if exists health_diet_templates_touch_updated_at on public.health_diet_templates;
create trigger health_diet_templates_touch_updated_at
  before update on public.health_diet_templates
  for each row execute function public.health_touch_updated_at();

alter table public.health_diet_templates enable row level security;
alter table public.health_diet_templates force row level security;

revoke all on public.health_diet_templates from anon, authenticated;
grant select, insert, update, delete on public.health_diet_templates to authenticated;
grant all on public.health_diet_templates to service_role;

drop policy if exists health_diet_templates_select on public.health_diet_templates;
create policy health_diet_templates_select on public.health_diet_templates
  for select to authenticated
  using (
    public.health_is_admin()
    or (professor_id = auth.uid() and public.health_is_professor())
  );

drop policy if exists health_diet_templates_insert on public.health_diet_templates;
create policy health_diet_templates_insert on public.health_diet_templates
  for insert to authenticated
  with check (
    public.health_is_admin()
    or (professor_id = auth.uid() and public.health_is_professor())
  );

drop policy if exists health_diet_templates_update on public.health_diet_templates;
create policy health_diet_templates_update on public.health_diet_templates
  for update to authenticated
  using (
    public.health_is_admin()
    or (professor_id = auth.uid() and public.health_is_professor())
  )
  with check (
    public.health_is_admin()
    or (professor_id = auth.uid() and public.health_is_professor())
  );

drop policy if exists health_diet_templates_delete on public.health_diet_templates;
create policy health_diet_templates_delete on public.health_diet_templates
  for delete to authenticated
  using (
    public.health_is_admin()
    or (professor_id = auth.uid() and public.health_is_professor())
  );

commit;
