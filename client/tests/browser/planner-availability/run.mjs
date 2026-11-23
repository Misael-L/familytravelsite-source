// Actual native desktop/phone screens; SDK and raster bytes are synthetic and local.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = require('playwright');
const { expect } = require('@playwright/test');
const { serveProductionFixture } = await import('../productionFixture.mjs');
const root = fileURLToPath(new URL('../../..', import.meta.url));
// Tailwind's content globs are relative to the client, even when invoked from the repo root.
process.chdir(root);
const output = process.env.P04AV_OUTPUT;
if (!output) throw new Error('Set P04AV_OUTPUT to a local evidence folder');
await mkdir(output, { recursive: true });
const server = await serveProductionFixture({ root, output });
async function openTab(page, name, phone) {
  if (phone && (await page.getByRole('button', { name, exact: true }).count()) === 0) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
  }
  const target =
    name === 'Files' && phone
      ? page.getByRole('button', { name: /^Files\b/ })
      : page.getByRole('button', { name, exact: true });
  await target.click();
}
async function inspectAncillaryScreens(page, phone, output) {
  const availability = await page.evaluate(() => globalThis.fixture.availability());
  assert.equal(availability.place_edit, true);
  for (const key of [
    'packing_edit',
    'budget_edit',
    'file_upload',
    'file_edit',
    'file_delete',
    'trip_edit',
    'trip_delete',
  ])
    assert.equal(availability[key], false, key);
  await openTab(page, 'Lists', phone);
  await expect(page.getByText('Rehearsal raincoat', { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.join(output, `${phone ? 'phone' : 'desktop'}-packing-readonly.png`),
    fullPage: true,
  });
  await page.getByRole('button', { name: /^To.do\b/i }).click();
  await expect(page.getByText('Check local museum hours', { exact: true })).toBeVisible();
  assert.equal(availability.todo_edit, true);
  await page.getByRole('button', { name: phone ? 'New task' : 'Add new task', exact: true }).click();
  const create = page.getByRole('dialog');
  await create.getByRole('textbox').first().fill('Native task created');
  await create.getByRole('button', { name: /^Create/ }).click();
  await expect(page.getByText('Native task created', { exact: true }).first()).toBeVisible();
  await page.getByText('Check local museum hours', { exact: true }).first().click();
  const input = page.locator('input[value="Check local museum hours"]');
  await expect(input).toBeEnabled();
  await input.fill('Native task edited');
  await page.getByRole('button', { name: /^Save(?: changes)?$/ }).click();
  await expect(page.getByText('Native task edited', { exact: true }).first()).toBeVisible();
  if (phone) await expect(page.getByRole('dialog')).toHaveCount(0);
  const taskResult = await page.evaluate(() => globalThis.fixture.taskExercise());
  assert.equal(taskResult.items.length, 2);
  assert.deepEqual(taskResult.queue, []);
  assert.ok(taskResult.items.some((row) => row.checked === 1));
  await page.screenshot({
    path: path.join(output, `${phone ? 'phone' : 'desktop'}-tasks-working.png`),
    fullPage: true,
  });
  await writeFile(
    path.join(output, `${phone ? 'phone' : 'desktop'}-task-writes.json`),
    JSON.stringify({ passed: true, taskResult }, null, 2)
  );
  await openTab(page, 'Costs', phone);
  await expect(page.getByText('Shared rehearsal meal', { exact: true }).first()).toBeVisible();
  const expenseLaunchers = await page
    .getByRole('button', { name: /^(Add expense|New expense|Add cost|Scan receipt)$/i })
    .count();
  // Native MTripShell has one unconditional Add expense launcher. Its raw writer remains blocked;
  // this packet does not claim that every native launcher observes permission metadata.
  assert.equal(expenseLaunchers, phone ? 1 : 0);
  await writeFile(
    path.join(output, `${phone ? 'phone' : 'desktop'}-known-launchers.json`),
    JSON.stringify({ unqualified_expense_launchers: expenseLaunchers, raw_cost_writer_enabled: false }, null, 2)
  );
  await page.screenshot({
    path: path.join(output, `${phone ? 'phone' : 'desktop'}-costs-readonly.png`),
    fullPage: true,
  });
  await openTab(page, 'Files', phone);
  await expect(page.getByText('Rehearsal guide.pdf', { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: path.join(output, `${phone ? 'phone' : 'desktop'}-files-readonly.png`),
    fullPage: true,
  });
  await writeFile(
    path.join(output, `${phone ? 'phone' : 'desktop'}-availability.json`),
    JSON.stringify(availability, null, 2)
  );
  await openTab(page, 'Plan', phone);
}
const results = [],
  outside = [],
  transforms = [],
  errors = [],
  assets = [],
  syntheticProviders = [];
let browser;
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  for (const phone of [false, true]) {
    const context = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: phone,
      hasTouch: phone,
      serviceWorkers: 'block',
    });
    const page = await context.newPage(),
      pageErrors = [],
      failed = [],
      consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('requestfailed', (r) => failed.push({ url: r.url(), reason: r.failure()?.errorText }));
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/render/image/')) {
        transforms.push(url.href);
        await route.abort();
        return;
      }
      if (url.hostname === 'routing.openstreetmap.de' && url.pathname.startsWith('/routed-car/route/v1/driving/')) {
        syntheticProviders.push(url.href);
        const points = url.pathname
          .split('/')
          .pop()
          .split(';')
          .map((p) => p.split(',').map(Number));
        await route.fulfill({
          headers: { 'access-control-allow-origin': '*' },
          json: {
            code: 'Ok',
            routes: [
              {
                distance: 1000,
                duration: 600,
                geometry: { type: 'LineString', coordinates: points },
                legs: points.slice(1).map(() => ({ distance: 500, duration: 300, steps: [] })),
              },
            ],
            waypoints: points.map((p) => ({ location: p, name: 'Local synthetic route' })),
          },
        });
        return;
      }
      if (url.origin !== origin) {
        outside.push(url.href);
        await route.abort();
        return;
      }
      if (url.pathname.startsWith('/p04as-tiles/') || url.pathname.startsWith('/storage/v1/object/public/catalog/')) {
        assets.push(url.pathname);
        // A generated solid raster is sufficient to prove decoding. Not a production photo.
        const body = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z8AAAAASUVORK5CYII=',
          'base64'
        );
        await route.fulfill({ status: 200, contentType: 'image/png', body });
        return;
      }
      await route.continue();
    });
    try {
      await page.goto(`${origin}/tests/browser/planner-availability/index.html${phone ? '?phone' : ''}`);
      await page.waitForFunction(() => globalThis.fixture?.ready, { timeout: 45000 });
      await expect
        .poll(() => page.evaluate(() => globalThis.fixture.model().places.length), { timeout: 15000 })
        .toBe(8);
      await expect(page.getByText('Barceloneta Beach', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('El Born & Tapas', { exact: true }).first()).toBeVisible();
      assert.equal(await page.getByRole('button', { name: /^Road trip$/i }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /^Tours$/i }).count(), 0);
      const model = await page.evaluate(() => globalThis.fixture.model());
      const ancillary = await page.evaluate(() => globalThis.fixture.readAncillary());
      assert.equal(ancillary.packing.items[0].name, 'Rehearsal raincoat');
      assert.equal(ancillary.packing.bags[0].name, 'Cabin bag');
      assert.equal(ancillary.packing.items[0].packed_quantity, 1);
      assert.equal(ancillary.packing.items[0].quantity, 3);
      assert.equal(ancillary.packing.items[0].family_packing.scope.layer, 'published');
      assert.equal(ancillary.packing.bags[0].total_weight_grams, 1550);
      assert.equal(ancillary.packing.unassigned_weight_grams, 100);
      assert.equal(ancillary.todo.items[0].name, 'Check local museum hours');
      assert.equal(ancillary.todo.items[0].created_at, '2026-11-08T12:00:00.123456+00:00');
      assert.equal(ancillary.todo.items[0].family_task.revision, 1);
      assert.equal(ancillary.todo.family_task_scope.layer, 'published');
      assert.equal(ancillary.budget.items[0].total_price, 40);
      assert.equal(ancillary.files.files[0].original_name, 'Rehearsal guide.pdf');
      await writeFile(
        path.join(output, `${phone ? 'phone' : 'desktop'}-ancillary.json`),
        JSON.stringify(ancillary, null, 2)
      );
      assert.equal(ancillary.members.members.length, 2);
      assert.equal(ancillary['budget/settlement'].currency, 'EUR');
      assert.equal(ancillary['budget/settlement'].balances.length, 2);
      assert.deepEqual(ancillary['tour-draft'], { draft: null });
      assert.deepEqual(ancillary.tours, { tours: [] });
      assert.deepEqual(ancillary.accommodations, { accommodations: [] });
      assert.equal(model.days.length, 4);
      assert.equal(Object.values(model.assignments).flat().length, 10);
      const repeated = Object.values(model.assignments)
        .flat()
        .filter((a) => a.place.name === 'El Born & Tapas');
      assert.equal(new Set(repeated.map((a) => a.id)).size, 2);
      assert.notEqual(repeated[0].day_id, repeated[1].day_id);
      assert.deepEqual(repeated.map((a) => a.notes).sort(), ['Dinner notes for day 1', 'Dinner notes for day 4']);
      const pictures = await page
        .locator('img')
        .evaluateAll((imgs) =>
          imgs
            .filter((i) => i.currentSrc.includes('/catalog/variants/v1/'))
            .map((i) => ({ url: i.currentSrc, decoded: i.complete && i.naturalWidth > 0 }))
        );
      assert.ok(pictures.length > 0 && pictures.every((p) => p.decoded));
      await page.screenshot({ path: path.join(output, `${phone ? 'phone' : 'desktop'}-timeline.png`), fullPage: true });
      await inspectAncillaryScreens(page, phone, output);
      if (phone) {
        await page.getByText('Fri 22', { exact: true }).click();
        await page.getByRole('button', { name: 'Places', exact: true }).click();
      }
      await page.getByText('El Born & Tapas', { exact: true }).last().click();
      if (phone) {
        await page.getByRole('button', { name: 'View details', exact: true }).click();
        await expect(page.getByText('Assigned Days', { exact: true })).toBeVisible();
      } else await expect(page.getByRole('heading', { name: 'El Born & Tapas', exact: true })).toBeVisible();
      await expect(page.getByText('Restaurant', { exact: true })).toBeVisible();
      await page.screenshot({
        path: path.join(output, `${phone ? 'phone' : 'desktop'}-inspector.png`),
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Show photos', exact: true }).click();
      const gallery = page.getByRole('dialog', { name: 'Show photos' });
      await expect(gallery).toBeVisible();
      await expect
        .poll(() =>
          gallery
            .locator('img')
            .evaluateAll((imgs) =>
              imgs.some((i) => i.complete && i.naturalWidth > 0 && i.currentSrc.includes('/hero-fixture.webp'))
            )
        )
        .toBe(true);
      await gallery.getByRole('button', { name: 'Close', exact: true }).click();
      if (phone) await page.locator('button[aria-label="Edit"]').click();
      else await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const name = phone
        ? page.getByPlaceholder('e.g. Eiffel Tower', { exact: true })
        : page.getByRole('textbox', { name: 'Name *', exact: true });
      await expect(name).toBeVisible();
      await name.fill('P04av edited location');
      await page.getByRole('button', { name: phone ? 'Save' : 'Update', exact: true }).click();
      await expect.poll(() => page.evaluate(() => globalThis.fixture.saves.length)).toBe(1);
      await expect
        .poll(() =>
          page.evaluate(() => globalThis.fixture.model().places.some((p) => p.name === 'P04av edited location'))
        )
        .toBe(true);
      const saved = await page.evaluate(() => globalThis.fixture.saves[0]);
      assert.equal(saved.p_observation.revision, 1);
      assert.equal(saved.p_observation.layer, 'published');
      assert.equal(saved.p_form.name, 'P04av edited location');
      assert.match(saved.p_location_id, /^a0450000-/);
      await expect.poll(() => page.evaluate(() => globalThis.fixture.permission().allowed)).toBe(true);
      await page.evaluate(() => globalThis.fixture.draft());
      await expect.poll(() => page.evaluate(() => globalThis.fixture.permission().layer)).toBe('myDraft');
      await expect
        .poll(() =>
          page.evaluate(() => globalThis.fixture.model().places.some((p) => p.name === 'P04av edited location'))
        )
        .toBe(true);
      await expect.poll(() => page.evaluate(() => globalThis.fixture.permission().allowed)).toBe(true);

      const report = await page.evaluate(() => ({
        requests: globalThis.fixture.requests,
        rpc: globalThis.fixture.rpc,
        queries: globalThis.fixture.queries,
        snapshots: globalThis.fixture.snapshots,
        unexpected: globalThis.fixture.unexpected,
        errors: globalThis.fixture.errors,
      }));
      assert.ok(report.rpc.some((r) => r.name === 'get_family_trip_tasks_v1'));
      assert.equal(report.queries.filter((q) => q.table === 'todo_items').length, 0);
      assert.ok(report.rpc.some((r) => r.name === 'get_family_trip_packing_v1'));
      assert.equal(
        report.queries.filter((q) =>
          [
            'packing_items',
            'packing_bags',
            'packing_item_recipients',
            'packing_item_contributors',
            'packing_bag_members',
            'packing_category_assignees',
          ].includes(q.table)
        ).length,
        0
      );
      await writeFile(
        path.join(output, `${phone ? 'phone' : 'desktop'}-model.json`),
        JSON.stringify(
          {
            initialModel: model,
            model: await page.evaluate(() => globalThis.fixture.model()),
            permission: await page.evaluate(() => globalThis.fixture.permission()),
            report,
            pageErrors,
            failed,
            consoleErrors,
          },
          null,
          2
        )
      );
      await page.screenshot({ path: path.join(output, `${phone ? 'phone' : 'desktop'}.png`), fullPage: true });
      await writeFile(
        path.join(output, `${phone ? 'phone' : 'desktop'}-text.txt`),
        await page.locator('body').innerText()
      );
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(report.unexpected, []);
      assert.deepEqual(report.errors, []);
      assert.ok(
        consoleErrors.every((msg) => msg.startsWith('Failed to load reservations: WriteSessionChanged:')),
        consoleErrors.join('\n')
      );
      assert.deepEqual(await page.evaluate(() => globalThis.fixture.queue()), []);
      results.push({
        name: phone ? 'native phone shell' : 'native desktop planner',
        passed: true,
        report,
        consoleErrors,
      });
    } catch (error) {
      const fixtureState = await page.evaluate(() => ({ ...globalThis.fixture, model: globalThis.fixture?.model?.() }));
      errors.push({ phone, error: String(error), stack: error.stack, pageErrors, failed, consoleErrors, fixtureState });
      await page.screenshot({ path: path.join(output, `${phone ? 'phone' : 'desktop'}-failure.png`), fullPage: true });
      await writeFile(
        path.join(output, `${phone ? 'phone' : 'desktop'}-failure.txt`),
        await page.locator('body').innerText()
      );
    } finally {
      await context.close();
    }
  }
  await writeFile(
    path.join(output, 'browser-checks.json'),
    JSON.stringify(
      {
        passed: !errors.length && !outside.length && !transforms.length,
        cases: results,
        errors,
        external_requests: outside,
        transformation_attempts: transforms,
        synthetic_provider_requests: syntheticProviders,
        assets,
        browser: await browser.version(),
      },
      null,
      2
    )
  );
  log(JSON.stringify({ cases: results.length, errors, outside, transforms, output }));
  if (errors.length || outside.length || transforms.length) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
