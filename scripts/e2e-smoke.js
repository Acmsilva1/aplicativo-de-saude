import '../lib/env.js';

const base = process.env.E2E_BASE || 'http://127.0.0.1:5198';
const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || '';
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
const initialPassword = process.env.INITIAL_ACCOUNT_PASSWORD || '';
if (!adminEmail || !adminPassword || initialPassword.length < 8) {
  throw new Error('Configure BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD e INITIAL_ACCOUNT_PASSWORD seguro antes do smoke test.');
}
const jar = {};

function parseSetCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1);
  }
}

function cookieHeader() {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      Cookie: cookieHeader(),
    },
  });
  parseSetCookie(res);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}

function clearJar() {
  Object.keys(jar).forEach((k) => delete jar[k]);
}

const stamp = Date.now();
const login = await api('/api/auth?resource=login', {
  method: 'POST',
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
console.log('admin', login.user.role);

const prof = await api('/api/auth?resource=accounts', {
  method: 'POST',
  body: JSON.stringify({ name: 'Prof Teste', email: `prof.e2e.${stamp}@saude.local`, role: 'professor' }),
});
console.log('professor', prof.account.id);

const aluno = await api('/api/auth?resource=accounts', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Aluno Teste',
    email: `aluno.e2e.${stamp}@saude.local`,
    role: 'student',
    professor_id: prof.account.id,
  }),
});
console.log('aluno', aluno.account.id);

await api('/api/auth?resource=logout', { method: 'POST', body: '{}' });
clearJar();

await api('/api/auth?resource=login', {
  method: 'POST',
  body: JSON.stringify({ email: prof.account.email, password: initialPassword }),
});
await api('/api/auth?resource=change-password', {
  method: 'POST',
  body: JSON.stringify({ password: 'senhaProf9' }),
});

const foods = await api('/api/saude?resource=professor-alimentos');
console.log('foods', foods.foods.length);

const diet = await api('/api/saude?resource=professor-dieta', {
  method: 'POST',
  body: JSON.stringify({
    user_id: aluno.account.id,
    titulo: 'Dieta E2E',
    objetivo: 'teste',
    refeicoes: [{
      tipo: 'almoco',
      horario: '12:00',
      itens: [{
        nome: 'Ovo inteiro',
        quantidade: '2 un',
        alimento_id: 10,
        quantidade_valor: 2,
        quantidade_unidade: 'un',
      }],
    }],
  }),
});
console.log('diet', diet.id, diet.titulo);

const water = await api('/api/saude?resource=professor-agua-meta', {
  method: 'POST',
  body: JSON.stringify({ user_id: aluno.account.id, goal_ml: 2000, nome: 'Meta E2E' }),
});
console.log('water goal', water.goal_ml);

await api('/api/auth?resource=logout', { method: 'POST', body: '{}' });
clearJar();

await api('/api/auth?resource=login', {
  method: 'POST',
  body: JSON.stringify({ email: aluno.account.email, password: initialPassword }),
});
await api('/api/auth?resource=change-password', {
  method: 'POST',
  body: JSON.stringify({ password: 'senhaAluno9' }),
});

const diets = await api('/api/saude?resource=dietas');
console.log('aluno diets', diets.diets.length, diets.diets[0]?.titulo);

const checkin = await api('/api/saude?resource=agua-checkin', {
  method: 'POST',
  body: JSON.stringify({ amount_ml: 200 }),
});
console.log('checkin total', checkin.total_ml);
console.log('E2E_OK');
