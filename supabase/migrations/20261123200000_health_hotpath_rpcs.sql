-- Fase 3: RPCs compostas (1 round-trip) para hot paths.
-- service_role only — o app chama via getSupabaseAdmin().

begin;

-- ---------------------------------------------------------------------------
-- Snapshot de água (mesmo contrato aproximado do getWater JS)
-- ---------------------------------------------------------------------------
create or replace function public.health_water_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
  v_today_start timestamptz := (v_today::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_tomorrow_start timestamptz := v_today_start + interval '1 day';
  v_history_start timestamptz := v_today_start - interval '30 days';
  v_goal integer;
  v_nome text;
  v_checkins jsonb;
  v_total integer;
  v_history jsonb;
begin
  select g.goal_ml, g.nome into v_goal, v_nome
  from public.health_water_goals g
  where g.user_id = p_user_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'amount_ml', e.amount_ml,
      'date', to_char(v_today, 'YYYY-MM-DD'),
      'time', to_char(timezone('America/Sao_Paulo', e.recorded_at), 'HH24:MI'),
      'recorded_at', e.recorded_at
    ) order by e.recorded_at desc
  ), '[]'::jsonb),
  coalesce(sum(e.amount_ml), 0)
  into v_checkins, v_total
  from public.health_water_entries e
  where e.user_id = p_user_id
    and e.recorded_at >= v_today_start
    and e.recorded_at < v_tomorrow_start;

  select coalesce(jsonb_agg(
    jsonb_build_object('date', d.day, 'total_ml', d.total_ml)
    order by d.day desc
  ), '[]'::jsonb)
  into v_history
  from (
    select to_char(timezone('America/Sao_Paulo', e.recorded_at), 'YYYY-MM-DD') as day,
           sum(e.amount_ml)::integer as total_ml
    from public.health_water_entries e
    where e.user_id = p_user_id
      and e.recorded_at >= v_history_start
      and e.recorded_at < v_today_start
    group by 1
  ) d;

  return jsonb_build_object(
    'goal_ml', v_goal,
    'nome', coalesce(nullif(btrim(v_nome), ''), 'Hidratação diária'),
    'checkins', v_checkins,
    'total_ml', v_total,
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'history', v_history
  );
end;
$$;

create or replace function public.health_water_checkin(
  p_user_id uuid,
  p_amount_ml integer,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid uuid := coalesce(p_request_id, gen_random_uuid());
begin
  if p_amount_ml not in (100, 200, 300, 400, 500, 1000, 2000) then
    raise exception 'invalid_water_amount' using errcode = '22023';
  end if;

  insert into public.health_water_entries (id, user_id, amount_ml, recorded_at, request_id)
  values (gen_random_uuid(), p_user_id, p_amount_ml, now(), v_rid)
  on conflict (user_id, request_id) do nothing;

  return public.health_water_snapshot(p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Stats do dashboard do professor (agrega dietas + água do dia)
-- ---------------------------------------------------------------------------
create or replace function public.health_professor_student_stats(p_professor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today_start timestamptz := ((timezone('America/Sao_Paulo', now()))::date::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_tomorrow_start timestamptz := v_today_start + interval '1 day';
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', s.user_id,
      'diet_title', coalesce(d.title, 'Sem dieta'),
      'diet_count', coalesce(d.cnt, 0),
      'goal_ml', g.goal_ml,
      'nome', coalesce(nullif(btrim(g.nome), ''), 'Hidratação diária'),
      'total_ml', coalesce(w.total_ml, 0)
    ) order by s.user_id)
    from public.health_user_roles s
    left join lateral (
      select
        (array_agg(p.title order by p.updated_at desc))[1] as title,
        count(*)::integer as cnt
      from public.health_diet_plans p
      where p.user_id = s.user_id and p.status = 'active'
    ) d on true
    left join public.health_water_goals g on g.user_id = s.user_id
    left join lateral (
      select coalesce(sum(e.amount_ml), 0)::integer as total_ml
      from public.health_water_entries e
      where e.user_id = s.user_id
        and e.recorded_at >= v_today_start
        and e.recorded_at < v_tomorrow_start
    ) w on true
    where s.role = 'student'
      and s.professor_id = p_professor_id
      and s.access_enabled
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Substitui refeições/itens de uma dieta em uma transação
-- ---------------------------------------------------------------------------
create or replace function public.health_replace_diet_structure(
  p_user_id uuid,
  p_diet_plan_id uuid,
  p_meals jsonb,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.health_diet_plans
    where id = p_diet_plan_id and user_id = p_user_id
  ) then
    raise exception 'diet_not_found' using errcode = 'P0002';
  end if;

  delete from public.health_diet_items
  where user_id = p_user_id
    and meal_id in (
      select m.id from public.health_diet_meals m
      where m.user_id = p_user_id and m.diet_plan_id = p_diet_plan_id
    );

  delete from public.health_diet_meals
  where user_id = p_user_id and diet_plan_id = p_diet_plan_id;

  if p_meals is not null and jsonb_typeof(p_meals) = 'array' and jsonb_array_length(p_meals) > 0 then
    insert into public.health_diet_meals (
      id, diet_plan_id, user_id, weekday, meal_type, title, scheduled_at, position
    )
    select
      (m->>'id')::uuid,
      p_diet_plan_id,
      p_user_id,
      (m->>'weekday')::smallint,
      m->>'meal_type',
      m->>'title',
      nullif(m->>'scheduled_at', '')::time,
      coalesce((m->>'position')::smallint, 0)
    from jsonb_array_elements(p_meals) as m;
  end if;

  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    insert into public.health_diet_items (
      id, meal_id, user_id, name, quantity, notes,
      alimento_id, quantidade_valor, quantidade_unidade, position
    )
    select
      (i->>'id')::uuid,
      (i->>'meal_id')::uuid,
      p_user_id,
      i->>'name',
      coalesce(i->>'quantity', ''),
      coalesce(i->>'notes', ''),
      nullif(i->>'alimento_id', '')::bigint,
      nullif(i->>'quantidade_valor', '')::numeric,
      nullif(i->>'quantidade_unidade', ''),
      coalesce((i->>'position')::smallint, 0)
    from jsonb_array_elements(p_items) as i;
  end if;
end;
$$;

revoke all on function public.health_water_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.health_water_checkin(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.health_professor_student_stats(uuid) from public, anon, authenticated;
revoke all on function public.health_replace_diet_structure(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.health_water_snapshot(uuid) to service_role;
grant execute on function public.health_water_checkin(uuid, integer, uuid) to service_role;
grant execute on function public.health_professor_student_stats(uuid) to service_role;
grant execute on function public.health_replace_diet_structure(uuid, uuid, jsonb, jsonb) to service_role;

commit;
