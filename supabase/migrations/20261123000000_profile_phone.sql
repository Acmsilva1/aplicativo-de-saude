-- Telefone no perfil para uso futuro na mensageria (somente armazenamento neste incremento).
alter table public.health_user_profiles
  add column if not exists telefone text;

comment on column public.health_user_profiles.telefone is
  'Telefone em E.164 (ex.: +5527988516301). Obrigatório em novos professor/aluno via API.';
