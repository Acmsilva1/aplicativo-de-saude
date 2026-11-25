-- Vincula biometria ao perfil: so o dono da credencial WebAuthn entra com ela.
begin;

alter table public.health_user_profiles
  add column if not exists biometria_habilitada boolean not null default false;

comment on column public.health_user_profiles.biometria_habilitada is
  'Usuario optou por login biometrico; credenciais em health_webauthn_credentials pertencem so a este user_id.';

-- Mantem no maximo uma credencial por usuario (digital unica por conta).
delete from public.health_webauthn_credentials a
using public.health_webauthn_credentials b
where a.user_id = b.user_id
  and a.credential_id <> b.credential_id
  and a.updated_at < b.updated_at;

create unique index if not exists health_webauthn_credentials_one_per_user_idx
  on public.health_webauthn_credentials (user_id);

commit;
