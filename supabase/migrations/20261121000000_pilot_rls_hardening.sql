-- Defense in depth: health data remains restricted even through Supabase REST.
-- Apply after the three initial migrations. Does not change existing rows.
begin;

create or replace function public.health_can_manage_user(target_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.health_is_professor_of(target_user_id); $$;

create or replace function public.health_can_read_plan(target_plan_id uuid, target_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.health_has_access() and exists (
    select 1 from public.health_diet_plans p
    where p.id = target_plan_id and p.user_id = target_user_id
      and (public.health_is_professor_of(p.user_id)
        or (p.user_id = auth.uid() and p.status = 'active'))
  );
$$;

create or replace function public.health_can_read_meal(target_meal_id uuid, target_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.health_diet_meals m
    where m.id = target_meal_id and m.user_id = target_user_id
      and public.health_can_read_plan(m.diet_plan_id, m.user_id)
  );
$$;

revoke all on function public.health_can_read_plan(uuid, uuid) from public, anon;
revoke all on function public.health_can_read_meal(uuid, uuid) from public, anon;
grant execute on function public.health_can_read_plan(uuid, uuid) to authenticated, service_role;
grant execute on function public.health_can_read_meal(uuid, uuid) to authenticated, service_role;

drop policy if exists health_diet_plans_select on public.health_diet_plans;
create policy health_diet_plans_select on public.health_diet_plans
for select to authenticated using (
  public.health_has_access() and (
    public.health_is_professor_of(user_id)
    or (user_id = auth.uid() and status = 'active')
  )
);

drop policy if exists health_diet_meals_select on public.health_diet_meals;
create policy health_diet_meals_select on public.health_diet_meals
for select to authenticated using (public.health_can_read_plan(diet_plan_id, user_id));

drop policy if exists health_diet_items_select on public.health_diet_items;
create policy health_diet_items_select on public.health_diet_items
for select to authenticated using (public.health_can_read_meal(meal_id, user_id));

drop policy if exists health_water_goals_select on public.health_water_goals;
create policy health_water_goals_select on public.health_water_goals
for select to authenticated using (
  public.health_has_access() and (user_id = auth.uid() or public.health_is_professor_of(user_id))
);

drop policy if exists health_water_entries_select on public.health_water_entries;
create policy health_water_entries_select on public.health_water_entries
for select to authenticated using (
  public.health_has_access() and (user_id = auth.uid() or public.health_is_professor_of(user_id))
);

-- Model portfolios belong only to their professor. Admin account management
-- continues through the server-side service role, not a health-data RLS bypass.
drop policy if exists health_diet_templates_select on public.health_diet_templates;
create policy health_diet_templates_select on public.health_diet_templates
for select to authenticated using (professor_id = auth.uid() and public.health_is_professor());
drop policy if exists health_diet_templates_insert on public.health_diet_templates;
create policy health_diet_templates_insert on public.health_diet_templates
for insert to authenticated with check (professor_id = auth.uid() and public.health_is_professor());
drop policy if exists health_diet_templates_update on public.health_diet_templates;
create policy health_diet_templates_update on public.health_diet_templates
for update to authenticated using (professor_id = auth.uid() and public.health_is_professor())
with check (professor_id = auth.uid() and public.health_is_professor());
drop policy if exists health_diet_templates_delete on public.health_diet_templates;
create policy health_diet_templates_delete on public.health_diet_templates
for delete to authenticated using (professor_id = auth.uid() and public.health_is_professor());

commit;
