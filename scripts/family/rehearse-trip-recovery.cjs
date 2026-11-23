/** Bounded local native desktop/phone proof. Fixture contains a real local MFA session; never commit it. */
const { readFileSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium, expect } = createRequire(resolve('package.json'))('@playwright/test');
const fixture = JSON.parse(readFileSync(process.env.FAMILY_TRIP_FIXTURE || '/private/tmp/p01b2-browser-fixture.json', 'utf8'));
if (fixture.api !== 'http://127.0.0.1:55331' || !/^[a-f0-9-]{36}$/.test(fixture.trip) || !fixture.anon || !fixture.session?.access_token)
  throw new Error('Refusing an unrecognized local fixture');
const phone = process.env.FAMILY_RECOVERY_PHONE === '1';
const output = process.env.FAMILY_RECOVERY_OUTPUT || `/private/tmp/p01b2-browser-${phone ? 'phone' : 'desktop'}`;
(async () => {
  const browser = await chromium.launch(process.env.FAMILY_RECOVERY_CHROMIUM ? { executablePath: process.env.FAMILY_RECOVERY_CHROMIUM } : {});
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  let transforms = 0, passed = false, graphVerified = false;
  const blocked = new Set(), errors = [], lifecycle = [], requests = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/render/image/')) { transforms++; return route.abort(); }
    if (['http:', 'https:'].includes(url.protocol) && !(url.hostname === '127.0.0.1' && ['5812', '55331'].includes(url.port))) {
      blocked.add(url.hostname); return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript((session) => { localStorage.setItem('sb-127-auth-token', JSON.stringify(session)); }, fixture.session);
  const page = await context.newPage();
  async function graph() {
    const result = {};
    const tables = ['trip_days', 'trip_countries', 'trip_places', 'trip_travelers', 'schedule_items', 'trip_reservations', 'trip_expenses', 'trip_files', 'trip_file_links'];
    const headers = { apikey: fixture.anon, Authorization: 'Bearer ' + fixture.session.access_token };
    const rows = async (table, filter) => {
      const response = await context.request.get(fixture.api + '/rest/v1/' + table + '?select=*&' + filter, { headers });
      if (!response.ok()) throw new Error('Cannot read fixture graph ' + table + ': ' + response.status());
      return response.json();
    };
    for (const table of tables) result[table] = await rows(table, 'trip_id=eq.' + fixture.trip);
    const expenses = result.trip_expenses.map((row) => row.id);
    for (const table of ['trip_expense_payers', 'trip_expense_shares'])
      result[table] = expenses.length ? await rows(table, 'expense_id=in.(' + expenses.join(',') + ')') : [];
    const canonical = (value) => Array.isArray(value) ? value.map(canonical).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) :
      value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
    return canonical(result);
  }
  page.on('request', (request) => { const path = new URL(request.url()).pathname; if (path.startsWith('/rest/v1/rpc/')) requests.push({ path, event: 'request' }); });
  page.on('requestfailed', (request) => { const path = new URL(request.url()).pathname; if (path.startsWith('/rest/v1/rpc/')) requests.push({ path, event: 'failed', reason: request.failure()?.errorText }); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (/\/rpc\/(trash_family_trip|restore_family_trip)$/.test(new URL(response.url()).pathname))
      lifecycle.push({ operation: new URL(response.url()).pathname.split('/').pop(), status: response.status() });
  });
  try {
    await page.goto('http://127.0.0.1:5812/dashboard');
    await expect(page.getByText(fixture.title, { exact: true }).first()).toBeVisible({ timeout: 30000 });
    const before = await graph();
    expect(before.trip_days).toHaveLength(3);
    console.log('Native dashboard loaded the synthetic Trip with real local AAL2 session');
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    const confirmation = phone ? page.getByRole('dialog', { name: 'Delete', exact: true }) :
      page.locator('[role="presentation"]').filter({ has: page.getByRole('heading', { name: 'Delete', exact: true }) }).last();
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(fixture.title, { exact: true })).toHaveCount(0);
    console.log('Native Delete completed');
    await page.reload();
    await expect(page.getByRole('button', { name: 'My Trips · Trash', exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(fixture.title, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'My Trips · Trash', exact: true }).click();
    await expect(page.getByText(fixture.title, { exact: true })).toBeVisible();
    const restored = page.waitForResponse((response) => new URL(response.url()).pathname === '/rest/v1/rpc/restore_family_trip' && response.status() === 200);
    const reloaded = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() && new URL(frame.url()).pathname === '/dashboard' });
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await Promise.all([restored, reloaded]);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(fixture.title, { exact: true }).first()).toBeVisible({ timeout: 20000 });
    console.log('Saved Restore and native dashboard reload completed');
    expect(await graph()).toEqual(before);
    graphVerified = true;
    await page.reload();
    await expect(page.getByText(fixture.title, { exact: true }).first()).toBeVisible({ timeout: 20000 });
    await page.getByText(fixture.title, { exact: true }).first().click();
    await page.waitForURL(/\/trips\/[^/?]+$/, { timeout: 20000 });
    await expect(page.getByText(fixture.title, { exact: true }).first()).toBeVisible({ timeout: 20000 });
    expect(lifecycle).toEqual([{ operation: 'trash_family_trip', status: 200 }, { operation: 'restore_family_trip', status: 200 }]);
    expect(transforms).toBe(0);
    expect(errors).toEqual([]);
    passed = true;
    console.log('Native Delete -> reload -> Trash -> Restore -> reload -> Trip workspace passed');
  } finally {
    writeFileSync(output + '.json', JSON.stringify({ passed, retained_graph_verified_before_workspace: graphVerified, viewport: phone ? 'phone' : 'desktop', auth: 'real disposable Auth/TOTP-issued AAL2 session injected before app startup', transforms, lifecycle, requests, blocked_external_hosts: [...blocked], page_errors: errors, final_path: new URL(page.url()).pathname }, null, 2));
    await page.screenshot({ path: output + '.png' });
    if (!passed) writeFileSync(output + '-failure.txt', await page.locator('body').innerText());
    await browser.close();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
