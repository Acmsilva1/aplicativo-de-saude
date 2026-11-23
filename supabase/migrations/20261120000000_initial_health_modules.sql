-- Ritmo Saúde — schema inicial + RLS no padrão Super App.
-- Projeto Supabase dedicado (não misturar com o Super App financeiro).
-- Ainda NÃO aplicada: revisar e rodar no SQL Editor / supabase db push.

begin;

create or replace function public.health_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contas / papéis / vínculo aluno → professor
-- ---------------------------------------------------------------------------
create table if not exists public.health_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'professor', 'student')),
  professor_id uuid references auth.users(id) on delete set null,
  access_enabled boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_user_roles_professor_link_check check (
    (role = 'student')
    or (role in ('admin', 'professor') and professor_id is null)
  )
);

create index if not exists health_user_roles_professor_idx
  on public.health_user_roles (professor_id)
  where role = 'student';

create table if not exists public.health_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  email text not null check (char_length(btrim(email)) between 3 and 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists health_user_profiles_email_key
  on public.health_user_profiles (lower(btrim(email)));

-- ---------------------------------------------------------------------------
-- Helpers (security definer), padrão is_app_admin / can_access_app
-- ---------------------------------------------------------------------------
create or replace function public.health_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.health_user_roles r
    where r.user_id = auth.uid()
      and r.role = 'admin'
      and r.access_enabled
  );
$$;

create or replace function public.health_has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.health_user_roles r
    where r.user_id = auth.uid()
      and r.access_enabled
      and not r.must_change_password
  );
$$;

create or replace function public.health_is_professor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.health_user_roles r
    where r.user_id = auth.uid()
      and r.role = 'professor'
      and r.access_enabled
      and not r.must_change_password
  );
$$;

create or replace function public.health_is_professor_of(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.health_is_professor()
    and exists (
      select 1
      from public.health_user_roles s
      where s.user_id = target_user_id
        and s.role = 'student'
        and s.access_enabled
        and s.professor_id = auth.uid()
    );
$$;

create or replace function public.health_can_read_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.health_is_admin()
    or auth.uid() = target_user_id
    or public.health_is_professor_of(target_user_id);
$$;

create or replace function public.health_can_manage_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.health_is_admin()
    or public.health_is_professor_of(target_user_id);
$$;

revoke all on function public.health_touch_updated_at() from public;
revoke all on function public.health_is_admin() from public;
revoke all on function public.health_has_access() from public;
revoke all on function public.health_is_professor() from public;
revoke all on function public.health_is_professor_of(uuid) from public;
revoke all on function public.health_can_read_user(uuid) from public;
revoke all on function public.health_can_manage_user(uuid) from public;

grant execute on function public.health_is_admin() to authenticated, service_role;
grant execute on function public.health_has_access() to authenticated, service_role;
grant execute on function public.health_is_professor() to authenticated, service_role;
grant execute on function public.health_is_professor_of(uuid) to authenticated, service_role;
grant execute on function public.health_can_read_user(uuid) to authenticated, service_role;
grant execute on function public.health_can_manage_user(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Dietas do aluno
-- ---------------------------------------------------------------------------
create table if not exists public.health_diet_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  objective text not null default '' check (char_length(objective) <= 240),
  notes text not null default '' check (char_length(notes) <= 4000),
  meta_calorias integer check (meta_calorias is null or meta_calorias between 500 and 10000),
  semanal boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_diet_plans_id_user_key unique (id, user_id)
);

create index if not exists health_diet_plans_owner_status_idx
  on public.health_diet_plans (user_id, status, updated_at desc);

-- weekday: 0 = plano diário; 1..7 = segunda..domingo (semanal)
create table if not exists public.health_diet_meals (
  id uuid primary key default gen_random_uuid(),
  diet_plan_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null default 0 check (weekday between 0 and 7),
  meal_type text not null check (meal_type in (
    'cafe_da_manha', 'lanche_da_manha', 'almoco',
    'lanche_da_tarde', 'jantar', 'ceia'
  )),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  scheduled_at time,
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_diet_meals_plan_owner_fkey
    foreign key (diet_plan_id, user_id)
    references public.health_diet_plans(id, user_id) on delete cascade,
  constraint health_diet_meals_id_user_key unique (id, user_id),
  constraint health_diet_meals_plan_day_type_key
    unique (diet_plan_id, user_id, weekday, meal_type)
);

create index if not exists health_diet_meals_owner_plan_day_idx
  on public.health_diet_meals (user_id, diet_plan_id, weekday, position);

create table if not exists public.health_diet_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  quantity text not null default '' check (char_length(quantity) <= 80),
  notes text not null default '' check (char_length(notes) <= 500),
  alimento_id bigint,
  quantidade_valor numeric(10, 2) check (quantidade_valor is null or quantidade_valor > 0),
  quantidade_unidade text check (
    quantidade_unidade is null
    or quantidade_unidade in ('g', 'ml', 'un', 'porcao')
  ),
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  constraint health_diet_items_meal_owner_fkey
    foreign key (meal_id, user_id)
    references public.health_diet_meals(id, user_id) on delete cascade
);

create index if not exists health_diet_items_owner_meal_idx
  on public.health_diet_items (user_id, meal_id, position);

-- ---------------------------------------------------------------------------
-- Água
-- ---------------------------------------------------------------------------
create table if not exists public.health_water_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal_ml integer not null default 2000 check (goal_ml between 100 and 10000),
  nome text not null default 'Hidratação diária' check (char_length(btrim(nome)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_water_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_ml integer not null check (amount_ml in (100, 200, 300, 400, 500, 1000, 2000)),
  recorded_at timestamptz not null default now(),
  request_id uuid,
  constraint health_water_entries_owner_request_key unique (user_id, request_id)
);

create index if not exists health_water_entries_owner_time_idx
  on public.health_water_entries (user_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists health_user_roles_touch_updated_at on public.health_user_roles;
create trigger health_user_roles_touch_updated_at
  before update on public.health_user_roles
  for each row execute function public.health_touch_updated_at();

drop trigger if exists health_user_profiles_touch_updated_at on public.health_user_profiles;
create trigger health_user_profiles_touch_updated_at
  before update on public.health_user_profiles
  for each row execute function public.health_touch_updated_at();

drop trigger if exists health_diet_plans_touch_updated_at on public.health_diet_plans;
create trigger health_diet_plans_touch_updated_at
  before update on public.health_diet_plans
  for each row execute function public.health_touch_updated_at();

drop trigger if exists health_diet_meals_touch_updated_at on public.health_diet_meals;
create trigger health_diet_meals_touch_updated_at
  before update on public.health_diet_meals
  for each row execute function public.health_touch_updated_at();

drop trigger if exists health_water_goals_touch_updated_at on public.health_water_goals;
create trigger health_water_goals_touch_updated_at
  before update on public.health_water_goals
  for each row execute function public.health_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: enable + force + revoke anon + policies por operação
-- ---------------------------------------------------------------------------
alter table public.health_user_roles enable row level security;
alter table public.health_user_roles force row level security;
alter table public.health_user_profiles enable row level security;
alter table public.health_user_profiles force row level security;
alter table public.health_diet_plans enable row level security;
alter table public.health_diet_plans force row level security;
alter table public.health_diet_meals enable row level security;
alter table public.health_diet_meals force row level security;
alter table public.health_diet_items enable row level security;
alter table public.health_diet_items force row level security;
alter table public.health_water_goals enable row level security;
alter table public.health_water_goals force row level security;
alter table public.health_water_entries enable row level security;
alter table public.health_water_entries force row level security;

revoke all on public.health_user_roles from anon, authenticated;
revoke all on public.health_user_profiles from anon, authenticated;
revoke all on public.health_diet_plans from anon, authenticated;
revoke all on public.health_diet_meals from anon, authenticated;
revoke all on public.health_diet_items from anon, authenticated;
revoke all on public.health_water_goals from anon, authenticated;
revoke all on public.health_water_entries from anon, authenticated;

grant select on public.health_user_roles to authenticated;
grant select, insert, update, delete on public.health_user_roles to service_role;

grant select on public.health_user_profiles to authenticated;
grant select, insert, update, delete on public.health_user_profiles to service_role;

grant select, insert, update, delete on
  public.health_diet_plans,
  public.health_diet_meals,
  public.health_diet_items,
  public.health_water_goals,
  public.health_water_entries
to authenticated;

grant all on
  public.health_diet_plans,
  public.health_diet_meals,
  public.health_diet_items,
  public.health_water_goals,
  public.health_water_entries
to service_role;

drop policy if exists health_user_roles_select on public.health_user_roles;
create policy health_user_roles_select on public.health_user_roles
  for select to authenticated
  using (
    public.health_is_admin()
    or user_id = auth.uid()
    or (role = 'student' and access_enabled and public.health_is_professor_of(user_id))
  );

drop policy if exists health_user_profiles_select on public.health_user_profiles;
create policy health_user_profiles_select on public.health_user_profiles
  for select to authenticated
  using (public.health_can_read_user(user_id));

drop policy if exists health_diet_plans_select on public.health_diet_plans;
create policy health_diet_plans_select on public.health_diet_plans
  for select to authenticated
  using (public.health_can_read_user(user_id) and public.health_has_access());

drop policy if exists health_diet_plans_insert on public.health_diet_plans;
create policy health_diet_plans_insert on public.health_diet_plans
  for insert to authenticated
  with check (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_diet_plans_update on public.health_diet_plans;
create policy health_diet_plans_update on public.health_diet_plans
  for update to authenticated
  using (public.health_can_manage_user(user_id) and public.health_has_access())
  with check (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_diet_plans_delete on public.health_diet_plans;
create policy health_diet_plans_delete on public.health_diet_plans
  for delete to authenticated
  using (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_diet_meals_select on public.health_diet_meals;
create policy health_diet_meals_select on public.health_diet_meals
  for select to authenticated
  using (public.health_can_read_user(user_id) and public.health_has_access());

drop policy if exists health_diet_meals_insert on public.health_diet_meals;
create policy health_diet_meals_insert on public.health_diet_meals
  for insert to authenticated
  with check (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_diet_meals_update on public.health_diet_meals;
create policy health_diet_meals_update on public.health_diet_meals
  for update to authenticated
  using (public.health_can_manage_user(user_id) and public.health_has_access())
  with check (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_diet_meals_delete on public.health_diet_meals;
create policy health_diet_meals_delete on public.health_diet_meals
  for delete to authenticated
  using (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_diet_items_select on public.health_diet_items;
create policy health_diet_items_select on public.health_diet_items
  for select to authenticated
  using (public.health_can_read_user(user_id) and public.health_has_access());

drop policy if exists health_diet_items_insert on public.health_diet_items;
create policy health_diet_items_insert on public.health_diet_items
  for insert to authenticated
  with check (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_diet_items_update on public.health_diet_items;
create policy health_diet_items_update on public.health_diet_items
  for update to authenticated
  using (public.health_can_manage_user(user_id) and public.health_has_access())
  with check (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_diet_items_delete on public.health_diet_items;
create policy health_diet_items_delete on public.health_diet_items
  for delete to authenticated
  using (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_water_goals_select on public.health_water_goals;
create policy health_water_goals_select on public.health_water_goals
  for select to authenticated
  using (public.health_can_read_user(user_id) and public.health_has_access());

drop policy if exists health_water_goals_insert on public.health_water_goals;
create policy health_water_goals_insert on public.health_water_goals
  for insert to authenticated
  with check (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_water_goals_update on public.health_water_goals;
create policy health_water_goals_update on public.health_water_goals
  for update to authenticated
  using (public.health_can_manage_user(user_id) and public.health_has_access())
  with check (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_water_goals_delete on public.health_water_goals;
create policy health_water_goals_delete on public.health_water_goals
  for delete to authenticated
  using (public.health_can_manage_user(user_id) and public.health_has_access());

drop policy if exists health_water_entries_select on public.health_water_entries;
create policy health_water_entries_select on public.health_water_entries
  for select to authenticated
  using (public.health_can_read_user(user_id) and public.health_has_access());

drop policy if exists health_water_entries_insert on public.health_water_entries;
create policy health_water_entries_insert on public.health_water_entries
  for insert to authenticated
  with check (user_id = auth.uid() and public.health_has_access());

drop policy if exists health_water_entries_update on public.health_water_entries;
create policy health_water_entries_update on public.health_water_entries
  for update to authenticated
  using (user_id = auth.uid() and public.health_has_access())
  with check (user_id = auth.uid() and public.health_has_access());

drop policy if exists health_water_entries_delete on public.health_water_entries;
create policy health_water_entries_delete on public.health_water_entries
  for delete to authenticated
  using (user_id = auth.uid() and public.health_has_access());

commit;
