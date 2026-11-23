-- Defense in depth: trial expirado também na RLS (além da API Express).
-- Regra alinhada a lib/trial.js: 30 dias civis America/Sao_Paulo; admin isento;
-- sem trial_started_at = ainda não iniciou (não bloqueia).

begin;

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
    left join public.health_user_profiles p on p.user_id = r.user_id
    where r.user_id = (select auth.uid())
      and r.access_enabled
      and not r.must_change_password
      and (
        r.role = 'admin'
        or p.trial_started_at is null
        or (
          (timezone('America/Sao_Paulo', now()))::date
          - (timezone('America/Sao_Paulo', p.trial_started_at))::date
        ) < 30
      )
  );
$$;

commit;
