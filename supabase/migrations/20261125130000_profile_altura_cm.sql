-- Altura no cadastro (autofill nas avaliacoes corporais).
begin;

alter table public.health_user_profiles
  add column if not exists altura_cm numeric(6, 2)
    check (altura_cm is null or altura_cm between 100 and 250);

comment on column public.health_user_profiles.altura_cm is
  'Altura em cm do cadastro; usada como padrao nas avaliacoes corporais.';

commit;
