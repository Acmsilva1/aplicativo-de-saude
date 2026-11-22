import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.UI_TEST_ORIGIN || 'http://127.0.0.1:5299';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw Error('This script only accepts a local mock server.');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const results = [];
const contexts = [];
async function login(email) {
  const context = await browser.newContext({ baseURL: origin }); contexts.push(context);
  let response = await context.request.post('/api/auth?resource=login', { data: { email, password: '12345' } });
  if (response.status() === 401) response = await context.request.post('/api/auth?resource=login', { data: { email, password: 'Local-Pilot-123!' } });
  assert.equal(response.status(), 200);
  if ((await response.json()).user.must_change_password) {
    const changed = await context.request.post('/api/auth?resource=change-password', { data: { password: 'Local-Pilot-123!' } });
    assert.equal(changed.status(), 200);
  }
  return context;
}
async function layout(page, label) {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(viewport);
    const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(size.content <= size.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(size)}`);
  }
  results.push({ check: `${label}: mobile/desktop overflow`, passed: true });
}
try {
  const professor = await login('professor@saude.local');
  const student = await login('aluno@saude.local');
  const goal = await professor.request.patch('/api/saude?resource=professor-agua-meta', { data: { user_id: 'demo-common-user', goal_ml: 2000, nome: 'Piloto UI' } });
  assert.equal(goal.status(), 200);
  const diet = await professor.request.post('/api/saude?resource=professor-dieta', { data: { user_id: 'demo-common-user', titulo: 'Plano UI', semanal: true, visible_to_student: true, semana: Array.from({ length: 7 }, () => ({ refeicoes: [] })) } });
  assert.equal(diet.status(), 201);
  const page = await professor.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.locator('[data-module="users"]').waitFor();
  await layout(page, 'Professor home');
  await page.locator('[data-module="portfolio"]').click();
  await page.locator('[data-action="open-template"]').first().click();
  await page.locator('[data-action="edit-template"]').waitFor();
  const position = await page.evaluate(() => ({ action: document.querySelector('[data-action="edit-template"]').getBoundingClientRect().top, meals: document.querySelector('.saude-diet-list').getBoundingClientRect().top }));
  assert.ok(position.action < position.meals);
  results.push({ check: 'Professor CRUD above meal cards', passed: true });
  await layout(page, 'Professor template');
  const aluno = await student.newPage(); aluno.on('pageerror', error => errors.push(error.message));
  await aluno.goto('/'); await aluno.locator('[data-module="water"]').waitFor();
  await layout(aluno, 'Student home');
  await aluno.locator('[data-module="water"]').click();
  await aluno.locator('[data-action="add-water"]').first().waitFor();
  await layout(aluno, 'Student water');
  let writes = 0;
  await aluno.route('**/api/saude?resource=agua-checkin', async route => { writes++; await new Promise(resolve => setTimeout(resolve, 750)); await route.continue(); });
  const button = aluno.locator('[data-action="add-water"]').first();
  const amount = Number(await button.getAttribute('data-id'));
  const initialLiters = Number((await aluno.locator('.saude-water-main > strong').textContent()).replace(' L', '').replace(',', '.'));
  const optimisticMs = await button.evaluate(element => { const start = performance.now(); element.click(); return performance.now() - start; });
  await aluno.locator('.background-save-status').waitFor();
  const expected = (initialLiters + amount / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  assert.ok((await aluno.locator('.saude-water-main > strong').textContent()).includes(expected));
  assert.ok(optimisticMs < 750, `Optimistic update waited ${optimisticMs}ms`);
  await aluno.locator('.background-save-status').waitFor({ state: 'detached' });
  assert.equal(writes, 1);
  results.push({ check: 'Water UI updates before delayed network', passed: true, optimisticMs, artificialNetworkDelayMs: 750 });
  await aluno.unroute('**/api/saude?resource=agua-checkin');
  const before = await aluno.locator('.saude-water-main > strong').textContent();
  await aluno.route('**/api/saude?resource=agua-checkin', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Falha simulada de UI' }) }));
  await button.click();
  await aluno.locator('[data-app-toast]').filter({ hasText: 'Falha simulada' }).waitFor();
  assert.equal(await aluno.locator('.saude-water-main > strong').textContent(), before);
  results.push({ check: 'Failed water write rolls UI back with error notice', passed: true });
  assert.deepEqual(errors, []);
  results.push({ check: 'No uncaught browser errors', passed: true });
  console.log(JSON.stringify({ environment: 'local mock only', results }, null, 2));
} finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); }
