// Reads temporary audit identities in memory over SSH; never writes credentials.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// Playwright call logs may include values typed into login fields on failure.
process.on('uncaughtException', () => {
  console.error('UI pilot failed; detailed browser logs suppressed to protect temporary credentials.');
  process.exitCode = 1;
});
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const sshKey = process.env.PILOT_SSH_KEY;
if (!sshKey) throw Error('Set PILOT_SSH_KEY to the authorized VM key path.');
const fixtures = JSON.parse(execFileSync('ssh', ['-i', sshKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', 'root@177.104.143.67', 'docker exec ritmo-saude cat /tmp/ritmo-pilot-fixtures.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const results = [];
const apiTimings = [];
const uncaught = [];
const baseURL = 'https://controle-de-saude.duckdns.org';
async function layout(page, name) {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(viewport);
    const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(size.content <= size.viewport + 1, `${name}: horizontal overflow`);
  }
  results.push({ name: `${name}: responsive 390/1366px`, passed: true });
}
async function actor(index, name) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  page.on('pageerror', () => uncaught.push(name));
  page.on('requestfinished', request => {
    if (!request.url().includes('/api/')) return;
    const timing = request.timing();
    apiTimings.push({ actor: name, resource: new URL(request.url()).searchParams.get('resource'), ms: Math.round(timing.responseEnd) });
  });
  await page.goto('/');
  await page.locator('#email').fill(fixtures.accounts[index].email);
  await page.locator('#password').fill(fixtures.accounts[index].password);
  const start = Date.now();
  await page.locator('.login-submit').click();
  await page.locator('.saude-home-grid').waitFor({ timeout: 30000 });
  await page.locator('.login-welcome').waitFor({ state: 'detached', timeout: 30000 });
  await page.locator('.navigation-loading').waitFor({ state: 'detached', timeout: 30000 });
  results.push({ name: `${name}: login to home`, passed: true, ms: Date.now() - start });
  await layout(page, `${name} home`);
  return { context, page };
}
try {
  const professor = await actor(0, 'professor');
  await professor.page.locator('[data-module="users"]').click();
  await professor.page.locator('[data-student-drill-toggle]').click();
  await professor.page.locator(`[data-student-choice="${fixtures.accounts[2].id}"]`).click();
  await professor.page.locator(`[data-action="open-water"][data-id="${fixtures.accounts[2].id}"]`).click();
  await professor.page.locator('.saude-goal-editor').waitFor();
  await layout(professor.page, 'professor hydration');
  const aluno = await actor(2, 'student');
  await aluno.page.locator('[data-module="diets"]').click();
  await aluno.page.locator('[data-action="open-diet"]').first().click();
  await aluno.page.locator('.saude-diet-list').waitFor();
  await layout(aluno.page, 'student diet');
  await aluno.page.locator('.home-return-button').click();
  await aluno.page.locator('[data-module="water"]').click();
  await aluno.page.locator('.saude-water-main').waitFor();
  await layout(aluno.page, 'student hydration');
  assert.equal(uncaught.length, 0);
  results.push({ name: 'Uncaught browser errors', passed: true, count: uncaught.length });
  console.log(JSON.stringify({ environment: 'production HTTPS; temporary audit users; read-only UI', results, apiTimings }, null, 2));
  await professor.context.close(); await aluno.context.close();
} finally { await browser.close(); }
