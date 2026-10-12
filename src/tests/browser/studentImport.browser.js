import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import { createTestDatabase, readProjectFile, withUser } from '../helpers/database.js';

// Test-only Auth transport fixture. Production authentication is unchanged.
// Every import/context RPC below executes the real migrations in PostgreSQL.
process.env.VITE_SUPABASE_URL = 'https://campusos-test.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'public-test-placeholder';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const actor = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const db = await createTestDatabase();
let server;
let browser;
let writes = 0;
let snapshots = 0;
let databaseQueue = Promise.resolve();
const authorized = (query, parameters = []) => {
  const next = databaseQueue.then(() => withUser(db, actor, () => db.query(query, parameters)));
  databaseQueue = next.catch(() => {});
  return next;
};
try {
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [actor]);
  await db.query("INSERT INTO profiles(id,role) VALUES ($1,'placement_incharge')", [actor]);
  await db.exec(await readProjectFile('supabase/seed/seed.sql'));
  await db.exec("UPDATE students SET graduation_year=2028 WHERE student_number='005'");
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const port = server.httpServer.address().port;
  const channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const user = { id: actor, email: 'incharge@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: actor, role: 'authenticated', exp: expiry })).toString('base64url'), 'test-only-signature'].join('.');
  await page.route('https://campusos-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
    let data;
    try {
      if (url.pathname === '/auth/v1/token') {
        data = { access_token: token, refresh_token: 'test-only-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiry, user };
      } else if (url.pathname === '/auth/v1/user') data = user;
      else if (url.pathname === '/rest/v1/profiles') data = (await authorized('SELECT id,role FROM profiles WHERE id = $1', [actor])).rows;
      else if (url.pathname === '/rest/v1/rpc/get_placement_analytics_snapshot') {
        snapshots++;
        data = (await authorized('SELECT public.get_placement_analytics_snapshot() AS result')).rows[0].result;
      } else if (url.pathname === '/rest/v1/companies') data = (await authorized('SELECT * FROM companies ORDER BY name')).rows;
      else if (url.pathname === '/rest/v1/departments') data = (await authorized('SELECT * FROM departments ORDER BY code')).rows;
      else if (url.pathname === '/rest/v1/students') data = (await authorized('SELECT s.*, jsonb_build_object(\'code\',d.code) AS departments FROM students s JOIN departments d ON d.id=s.department_id')).rows;
      else if (url.pathname === '/rest/v1/clearance_items') data = (await authorized('SELECT * FROM clearance_items')).rows;
      else if (url.pathname === '/rest/v1/student_clearances') data = (await authorized('SELECT * FROM student_clearances')).rows;
      else if (url.pathname === '/rest/v1/rpc/get_student_import_context') {
        data = (await authorized('SELECT public.get_student_import_context() AS result')).rows[0].result;
      } else if (url.pathname === '/rest/v1/rpc/commit_student_import') {
        const args = request.postDataJSON();
        writes++;
        data = (await authorized('SELECT public.commit_student_import($1::jsonb,$2,$3) AS result', [JSON.stringify(args.p_rows), args.p_confirmed, args.p_mode])).rows[0].result;
      } else if (url.pathname === '/auth/v1/logout') data = {};
      else throw new Error(`Unexpected test API request: ${url.pathname}`);
      await route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(data) });
    } catch (error) {
      await route.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: JSON.stringify({ code: error.code || 'TEST_API_ERROR', message: error.message }) });
    }
  });
  await page.goto(`http://127.0.0.1:${port}/signin`);
  await page.getByLabel('Email', { exact: true }).fill('incharge@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-test-input');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/incharge/dashboard');
  const expectMetric = async (label, value) => {
    const metric = page.getByText(label, { exact: true }).locator('..').locator('p').nth(1);
    await page.waitForFunction(({ label, value }) => [...document.querySelectorAll('p')].some((p) => p.textContent === label && p.parentElement.querySelectorAll('p')[1]?.textContent === value), { label, value });
    assert.equal(await metric.innerText(), value);
  };
  await expectMetric('Placed students', '2');
  await expectMetric('Registered students', '0');
  await expectMetric('Participating students', '3');
  await expectMetric('Total offers', '3');
  await page.getByRole('group', { name: 'Company filters' }).getByLabel('Demo Systems', { exact: true }).locator('..').click();
  await expectMetric('Placed students', '1');
  await page.getByRole('group', { name: 'Department filters' }).getByLabel('ECE', { exact: true }).locator('..').click();
  await expectMetric('Placed students', '0');
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expectMetric('Placed students', '2');
  await page.getByRole('group', { name: 'Batch filters' }).getByLabel('2028', { exact: true }).locator('..').click();
  await expectMetric('Not yet placed', '1');
  await expectMetric('Placed students', '0');
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expectMetric('Placed students', '2');
  const previousSnapshots = snapshots;
  await db.exec("UPDATE students SET placement_registered=TRUE WHERE student_number='001'");
  await page.getByRole('button', { name: 'Refresh placement analytics', exact: true }).click();
  await expectMetric('Registered students', '1');
  assert.ok(snapshots > previousSnapshots);
  await db.exec("UPDATE students SET placement_registered=FALSE WHERE student_number='001'");
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectMetric('Registered students', '0');
  await page.getByRole('group', { name: 'Drive status filters' }).getByLabel('Cancelled', { exact: true }).locator('..').click();
  await expectMetric('Total offers', '0');
  await page.getByText('No salary data in scope.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expectMetric('Total offers', '3');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(tmpdir(), 'campusos-placement-analytics-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(tmpdir(), 'campusos-placement-analytics-mobile.png'), fullPage: true });
  const overflow = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().width > window.innerWidth).slice(-12).map((el) => ({ tag: el.tagName, class: el.className?.baseVal ?? el.className, width: el.getBoundingClientRect().width })) }));
  assert.ok(overflow.scroll <= overflow.width + 1, JSON.stringify(overflow));
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS: live dashboard uses stored analytics, all required filters, manual/focus refresh and mobile layout');
  await page.goto(`http://127.0.0.1:${port}/incharge/import`);
  await page.getByRole('heading', { name: 'Import Students', exact: true }).waitFor();

  for (const format of ['CSV','Excel']) {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download ${format} template`, exact: true }).click();
    const download = await event;
    const bytes = await readFile(await download.path());
    assert.ok(bytes.length > 100);
    if (format === 'Excel') {
      const sheet = XLSX.read(bytes, { type: 'buffer' }).Sheets.Students;
      assert.equal(sheet.A2.t, 's'); assert.equal(sheet.A2.v, '006');
    } else assert.ok(bytes.toString('utf8').includes('student_number'));
  }
  console.log('PASS: real CSV/Excel template downloads');

  await page.getByLabel('Choose student import file').setInputFiles(join(root, 'public/import/students-valid.csv'));
  const review = page.getByRole('button', { name: 'Review and confirm 2 students', exact: true });
  await review.waitFor();
  assert.equal(writes, 0);
  await review.click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(writes, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM students WHERE student_number = '006'")).rows[0].n, 0);
  console.log('PASS: preview and cancelled confirmation write nothing');

  await page.getByRole('checkbox', { name: /Import only valid rows/ }).check();
  await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled);
  await page.getByLabel('Choose student import file').setInputFiles(join(root, 'public/import/students-invalid.xlsx'));
  await page.getByRole('button', { name: 'Review and confirm 1 student', exact: true }).waitFor();
  await page.screenshot({ path: join(tmpdir(), 'campusos-import-preview-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Review and confirm 1 student', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click();
  await page.getByRole('heading', { name: 'Import completed', exact: true }).waitFor();
  const result = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Import completed', exact: true }) });
  for (const [label, expected] of [['Successful','1'],['Skipped','3'],['Failed','2']]) {
    assert.equal(await result.locator('dl > div').filter({ hasText: label }).locator('dd').innerText(), expected);
  }
  assert.equal(writes, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM students WHERE student_number = '006'")).rows[0].n, 1);
  assert.equal((await db.query("SELECT full_name FROM students WHERE student_number = '001'")).rows[0].full_name, 'Demo Student One');
  console.log('PASS: explicit confirmation persists one row and reports 1 successful / 3 skipped / 2 failed');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(tmpdir(), 'campusos-import-result-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  assert.deepEqual(failures, []);
  console.log('PASS: mobile layout has no horizontal page overflow; no browser runtime errors');
} finally {
  await browser?.close();
  await server?.close();
  await db.close();
}
