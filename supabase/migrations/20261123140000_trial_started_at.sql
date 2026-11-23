-- Trial de 30 dias: contagem inicia no primeiro acesso autenticado com senha definida
-- (complete-invite / login), não na criação da conta pelo admin.
alter table public.health_user_profiles
  add column if not exists trial_started_at timestamptz;

comment on column public.health_user_profiles.trial_started_at is
  'Início do período de teste (30 dias civis America/Sao_Paulo). Null até o primeiro acesso com senha. Admin isento via API.';
