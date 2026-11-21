import '../lib/env.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { hasSupabaseConfig } from '../lib/env.js';

const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
const name = String(process.env.BOOTSTRAP_ADMIN_NAME || '').trim().slice(0, 80);

if (!hasSupabaseConfig()) {
  console.error('Configure SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}
if (!email || !name) {
  console.error('BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_NAME não podem ficar vazios.');
  process.exit(1);
}

const admin = getSupabaseAdmin();
const { data: existingProfile, error: profileLookupError } = await admin
  .from('health_user_profiles')
  .select('user_id')
  .eq('email', email)
  .maybeSingle();

if (profileLookupError) {
  console.error('Falha ao consultar o perfil. Confirme se as migrations foram aplicadas:', profileLookupError.message);
  process.exit(1);
}

let userId = existingProfile?.user_id || null;
if (!userId) {
  for (let page = 1; !userId; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('Falha ao consultar usuários Auth:', error.message);
      process.exit(1);
    }
    const users = data?.users || [];
    userId = users.find((user) => String(user.email || '').toLowerCase() === email)?.id || null;
    if (users.length < 200) break;
  }
}

if (!userId) {
  if (password.length < 8) {
    console.error('Para criar um novo usuário, defina BOOTSTRAP_ADMIN_PASSWORD (mínimo de 8 caracteres) no ambiente.');
    process.exit(1);
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data?.user) {
    console.error('Falha ao criar usuário Auth:', error?.message || 'resposta sem usuário');
    process.exit(1);
  }
  userId = data.user.id;
  console.log('Usuário criado no Supabase Auth.');
} else {
  console.log('Usuário Auth já existe; a senha existente foi preservada.');
}

const { error: upsertError } = await admin.from('health_user_profiles').upsert({
  user_id: userId,
  nome: name,
  email,
});
if (upsertError) {
  console.error('Falha ao salvar perfil:', upsertError.message);
  process.exit(1);
}

const { error: roleError } = await admin.from('health_user_roles').upsert({
  user_id: userId,
  role: 'admin',
  professor_id: null,
  access_enabled: true,
  must_change_password: false,
});
if (roleError) {
  console.error('Falha ao habilitar perfil administrativo:', roleError.message);
  process.exit(1);
}

console.log(`Admin configurado: ${name} <${email}>`);
console.log('Para novos usuários, use o módulo Administração dentro do aplicativo.');
