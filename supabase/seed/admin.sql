-- Ritmo Saúde — associa um usuário já existente no Supabase Auth ao perfil admin.
-- Antes de executar: crie/confirme a conta pelo Dashboard > Authentication > Users.
-- Este SQL não cria senha nem grava diretamente em auth.users.

begin;

do $$
declare
  -- Preencha estes valores antes de executar no SQL Editor.
  target_email constant text := 'EMAIL_DO_ADMIN_AQUI';
  target_name constant text := 'NOME_DO_ADMIN_AQUI';
  target_user_id uuid;
begin
  select id
    into target_user_id
    from auth.users
   where lower(email) = lower(target_email);

  if target_user_id is null then
    raise exception 'Conta % não encontrada em Supabase Auth. Crie-a primeiro em Authentication > Users e rode este seed novamente.', target_email;
  end if;

  insert into public.health_user_profiles (user_id, nome, email)
  values (target_user_id, target_name, target_email)
  on conflict (user_id) do update
    set nome = excluded.nome,
        email = excluded.email;

  insert into public.health_user_roles (
    user_id, role, professor_id, access_enabled, must_change_password
  )
  values (target_user_id, 'admin', null, true, false)
  on conflict (user_id) do update
    set role = excluded.role,
        professor_id = null,
        access_enabled = true,
        must_change_password = false;
end;
$$;

commit;
