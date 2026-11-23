import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.UI_TEST_ORIGIN || 'http://127.0.0.1:5299';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw Error('This script only accepts a local mock server.');
process.on('uncaughtException', () => { console.error('Password invite UI test failed; sensitive diagnostics suppressed.'); process.exitCode = 1; });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const contexts = [];
const results = [];
const strongA = 'UI-personal-password-123!';
const strongB = 'UI-new-personal-password-456!';
try {
  const admin = await browser.newContext({ baseURL: origin }); contexts.push(admin);
  let login = await admin.request.post('/api/auth?resource=login', { data: { email: 'master@saude.local', password: '12345' } });
  if (login.status() === 401) login = await admin.request.post('/api/auth?resource=login', { data: { email: 'master@saude.local', password: 'Local-Pilot-123!' } });
  assert.equal(login.status(), 200);
  if ((await login.json()).user.must_change_password) assert.equal((await admin.request.post('/api/auth?resource=change-password', { data: { password: 'Local-Pilot-123!' } })).status(), 200);
  const page = await admin.newPage(); const errors = [];
  page.on('pageerror', () => errors.push('pageerror'));
  await page.goto('/');
  await page.locator('[data-module="accounts"]').click();
  assert.equal(await page.locator('[data-regenerate-password][data-id="demo-admin"]').count(), 0);
  await page.locator('[data-module="createAccount"]').click();
  const email = `ui.reset.${Date.now()}@saude.local`;
  await page.locator('[data-account-form] [name="name"]').fill('AUDITORIA UI Convite');
  await page.locator('[data-account-form] [name="email"]').fill(email);
  await page.locator('[data-account-form] [name="phone"]').fill('27988516301');
  const created = page.waitForResponse(response => response.url().includes('/api/auth?resource=accounts') && response.request().method() === 'POST');
  await page.locator('[data-account-form] button[type="submit"]').click();
  const creation = await created; assert.equal(creation.status(), 201);
  const { account, setupToken, inviteSent } = await creation.json();
  assert.equal(inviteSent, true);
  assert.ok(setupToken);
  assert.equal(await page.locator('#initial-account-password').count(), 0);
  await page.getByText(/Convite enviado/).waitFor();
  results.push({ check: 'UI create account sends invite without temporary password dialog', passed: true });

  const reset = page.locator(`[data-regenerate-password][data-id="${account.id}"]`);
  await reset.waitFor();
  assert.match(await reset.textContent(), /Reenviar convite/);

  const aluno = await browser.newContext({ baseURL: origin }); contexts.push(aluno);
  assert.equal((await aluno.request.post('/api/auth?resource=login', { data: { email, password: strongA } })).status(), 401);
  const completed = await aluno.request.post('/api/auth?resource=complete-invite', { data: { setup_token: setupToken, password: strongA } });
  assert.equal(completed.status(), 200);
  assert.equal((await completed.json()).user.must_change_password, false);
  results.push({ check: 'Invite setup token completes strong password and opens session', passed: true });

  await page.reload();
  await page.locator('[data-module="accounts"]').click();
  await page.locator(`[data-edit-account][data-id="${account.id}"]`).waitFor();
  assert.match(await reset.textContent(), /Enviar link de nova senha/);
  assert.equal((await aluno.request.post('/api/auth?resource=account-temporary-password', { data: { id: account.id } })).status(), 403);
  results.push({ check: 'After password set, admin sees resend link; student cannot trigger resend', passed: true });

  await reset.click();
  await page.getByRole('button', { name: 'Enviar link', exact: true }).click();
  await page.getByText(/Link de senha enviado/).waitFor();
  const accounts = await admin.request.get('/api/auth?resource=accounts');
  const listed = (await accounts.json()).accounts.find((entry) => entry.id === account.id);
  assert.equal(listed.must_change_password, true);

  const resend = await admin.request.post('/api/auth?resource=account-password-link', { data: { id: account.id } });
  assert.equal(resend.status(), 200);
  const { setupToken: recoveryToken } = await resend.json();
  assert.ok(recoveryToken);
  assert.equal((await aluno.request.get('/api/auth?resource=session')).status(), 401);
  assert.equal((await aluno.request.post('/api/auth?resource=login', { data: { email, password: strongA } })).status(), 200);
  assert.equal((await (await aluno.request.post('/api/auth?resource=login', { data: { email, password: strongA } })).json()).user.must_change_password, true);

  const recovered = await aluno.request.post('/api/auth?resource=complete-invite', { data: { setup_token: recoveryToken, password: strongB } });
  assert.equal(recovered.status(), 200);
  const studentPage = await aluno.newPage();
  studentPage.on('pageerror', () => errors.push('pageerror'));
  await studentPage.goto('/');
  await studentPage.locator('.saude-home-grid').waitFor();
  await studentPage.locator('.login-welcome').waitFor({ state: 'detached' });
  results.push({ check: 'Admin resend forces password change; recovery token sets new password in UI session', passed: true });
  assert.equal(errors.length, 0);
  results.push({ check: 'No uncaught browser errors', passed: true });
  await admin.request.delete('/api/auth?resource=accounts', { data: { id: account.id } });
  console.log(JSON.stringify({ environment: 'local mock only', results }, null, 2));
} finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); }
