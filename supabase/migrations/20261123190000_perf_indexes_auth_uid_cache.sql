-- Fase 1: índices aditivos + (select auth.uid()) cacheável em helpers/policies.
-- Não altera regras de negócio; health_has_access (com trial) permanece da migration anterior.

begin;

-- ---------------------------------------------------------------------------
-- Índices (idempotentes)
-- ---------------------------------------------------------------------------
create index if not exists health_diet_items_alimento_idx
  on public.health_diet_items (alimento_id)
  where alimento_id is not null;

-- Já existe health_water_entries_owner_time_idx; reforço só se ausente.
create index if not exists health_water_entries_owner_time_idx
  on public.health_water_entries (user_id, recorded_at desc);

-- Suporte a listagens por vínculo aluno→professor (RLS / dashboard).
create index if not exists health_user_roles_professor_idx
  on public.health_user_roles (professor_id)
  where role = 'student';

-- ---------------------------------------------------------------------------
-- Helpers: auth.uid() → (select auth.uid())
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
    where r.user_id = (select auth.uid())
      and r.role = 'admin'
      and r.access_enabled
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
    where r.user_id = (select auth.uid())
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
        and s.professor_id = (select auth.uid())
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
    or (select auth.uid()) = target_user_id
    or public.health_is_professor_of(target_user_id);
$$;

create or replace function public.health_can_manage_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Mantém hardening do piloto: manage = professor do aluno (admin via service_role).
  select public.health_is_professor_of(target_user_id);
$$;

create or replace function public.health_can_read_plan(target_plan_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.health_has_access() and exists (
    select 1 from public.health_diet_plans p
    where p.id = target_plan_id and p.user_id = target_user_id
      and (public.health_is_professor_of(p.user_id)
        or (p.user_id = (select auth.uid()) and p.status = 'active'))
  );
$$;

-- ---------------------------------------------------------------------------
-- Policies: recriar apenas as que usam auth.uid() direto
-- ---------------------------------------------------------------------------
drop policy if exists health_user_roles_select on public.health_user_roles;
create policy health_user_roles_select on public.health_user_roles
  for select to authenticated
  using (
    public.health_is_admin()
    or user_id = (select auth.uid())
    or (role = 'student' and access_enabled and public.health_is_professor_of(user_id))
  );

drop policy if exists health_diet_plans_select on public.health_diet_plans;
create policy health_diet_plans_select on public.health_diet_plans
  for select to authenticated
  using (
    public.health_has_access() and (
      public.health_is_professor_of(user_id)
      or (user_id = (select auth.uid()) and status = 'active')
    )
  );

drop policy if exists health_water_goals_select on public.health_water_goals;
create policy health_water_goals_select on public.health_water_goals
  for select to authenticated
  using (
    public.health_has_access()
    and (user_id = (select auth.uid()) or public.health_is_professor_of(user_id))
  );

drop policy if exists health_water_entries_select on public.health_water_entries;
create policy health_water_entries_select on public.health_water_entries
  for select to authenticated
  using (
    public.health_has_access()
    and (user_id = (select auth.uid()) or public.health_is_professor_of(user_id))
  );

drop policy if exists health_water_entries_insert on public.health_water_entries;
create policy health_water_entries_insert on public.health_water_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.health_has_access());

drop policy if exists health_water_entries_update on public.health_water_entries;
create policy health_water_entries_update on public.health_water_entries
  for update to authenticated
  using (user_id = (select auth.uid()) and public.health_has_access())
  with check (user_id = (select auth.uid()) and public.health_has_access());

drop policy if exists health_water_entries_delete on public.health_water_entries;
create policy health_water_entries_delete on public.health_water_entries
  for delete to authenticated
  using (user_id = (select auth.uid()) and public.health_has_access());

drop policy if exists health_diet_templates_select on public.health_diet_templates;
create policy health_diet_templates_select on public.health_diet_templates
  for select to authenticated
  using (professor_id = (select auth.uid()) and public.health_is_professor());

drop policy if exists health_diet_templates_insert on public.health_diet_templates;
create policy health_diet_templates_insert on public.health_diet_templates
  for insert to authenticated
  with check (professor_id = (select auth.uid()) and public.health_is_professor());

drop policy if exists health_diet_templates_update on public.health_diet_templates;
create policy health_diet_templates_update on public.health_diet_templates
  for update to authenticated
  using (professor_id = (select auth.uid()) and public.health_is_professor())
  with check (professor_id = (select auth.uid()) and public.health_is_professor());

drop policy if exists health_diet_templates_delete on public.health_diet_templates;
create policy health_diet_templates_delete on public.health_diet_templates
  for delete to authenticated
  using (professor_id = (select auth.uid()) and public.health_is_professor());

commit;
