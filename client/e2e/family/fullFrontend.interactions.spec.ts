import { expect, test } from '@playwright/test';
import {
  DAYS_TRIP_ID,
  emptyTransportLog,
  installTransportDetailFixture,
  installWeatherFixture,
  tableBody,
} from './fullFrontend.fixture';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function setup(page: any, days = 15) {
  const log = emptyTransportLog();
  await installTransportDetailFixture({ page, member: 'direct', log });
  await installWeatherFixture(page);
  const state: Record<string, any[]> = {
    trips: [
      {
        ...(tableBody('trips', undefined) as any[])[0],
        end_at: `2026-12-${String(days).padStart(2, '0')}T00:00:00.000Z`,
      },
    ],
    trip_days: Array.from({ length: days }, (_, i) => ({
      id: i === 0 ? '22222222-2222-4222-8222-222222222222' : uuid(100 + i),
      trip_id: DAYS_TRIP_ID,
      civil_day: `2026-12-${String(i + 1).padStart(2, '0')}`,
      day_index: i,
      title: i === 0 ? 'A deliberately long harbor morning title to check available space' : `Day ${i + 1}`,
    })),
    schedule_items: tableBody('schedule_items', undefined) as any[],
    trip_expenses: [
      {
        id: uuid(200),
        trip_id: DAYS_TRIP_ID,
        name: 'Night fare',
        category: 'flights',
        total_amount: 20,
        currency_code: 'EUR',
        exchange_rate: 1,
        expense_date: null,
        note: null,
        ticket_lines: null,
        reservation_id: '33333333-3333-4333-8333-333333333333',
        sort_order: 0,
        created_at: '2026-08-20T00:00:00.000Z',
      },
    ],
  };
  const writes: { table: string; method: string; body: any }[] = [];
  await page.route('http://127.0.0.1:5199/rest/v1/*', async (route: any) => {
    const req = route.request(),
      url = new URL(req.url()),
      table = url.pathname.split('/').pop()!;
    if (!state[table]) return route.fallback();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    let rows = state[table],
      id = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      writes.push({ table, method: req.method(), body });
      const row = { ...body, id: body.id ?? uuid(900 + writes.length), created_at: '2026-10-27T00:00:00.000Z' };
      rows.push(row);
      return route.fulfill({ json: req.headers().accept?.includes('vnd.pgrst.object') ? row : [row] });
    }
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON();
      writes.push({ table, method: req.method(), body });
      for (const row of rows) if (!id || row.id === id) Object.assign(row, body);
      return route.fulfill({ status: 204 });
    }
    if (req.method() === 'DELETE') {
      writes.push({ table, method: req.method(), body: null });
      state[table] = rows.filter((r) => r.id !== id);
      return route.fulfill({ status: 204 });
    }
    const idFilter = id ? rows.filter((r) => r.id === id) : rows;
    return route.fulfill({
      json: req.headers().accept?.includes('vnd.pgrst.object') ? (idFilter[0] ?? null) : idFilter,
    });
  });
  return { log, state, writes };
}
test('15-day cards do not shrink, hover tools and both copied panel tab bars work', async ({ page }) => {
  const { log } = await setup(page);
  await page.goto(`/trips/${DAYS_TRIP_ID}`);
  await expect(page.getByRole('button', { name: 'Add Place/Activity', exact: true })).toBeVisible({ timeout: 20000 });
  const heads = page.locator('.dp-day-header');
  await expect(heads).toHaveCount(15);
  const geometry = await heads.evaluateAll((nodes: any[]) =>
    nodes.map((node) => ({
      head: node.getBoundingClientRect().height,
      card: node.parentElement.getBoundingClientRect().height,
      shrink: getComputedStyle(node.parentElement).flexShrink,
    }))
  );
  expect(geometry.every((row) => row.shrink === '0' && row.card >= row.head)).toBe(true);
  await page.mouse.move(750, 700);
  const plus = heads.first().locator('.dp-day-tools');
  await expect(plus).toHaveCSS('opacity', '0');
  await heads.first().hover();
  await expect(plus).toHaveCSS('opacity', '1');
  expect(log.unexpected).toEqual([]);
});
test('dragging a real right-panel place onto another day creates a UUID schedule occurrence', async ({ page }) => {
  const { state, writes, log } = await setup(page);
  await page.goto(`/trips/${DAYS_TRIP_ID}`);
  await expect(page.getByRole('button', { name: 'Add Place/Activity', exact: true })).toBeVisible({ timeout: 20000 });
  const heads = page.locator('.dp-day-header');
  await expect(heads).toHaveCount(15);
  const source = page.locator('[draggable="true"]').filter({ hasText: 'City museum' }).last();
  await expect(source).toBeVisible();
  await source.dragTo(heads.nth(1));
  await expect.poll(() => writes.filter((w) => w.table === 'schedule_items' && w.method === 'POST').length).toBe(1);
  const inserted = state.schedule_items.at(-1)!;
  expect(inserted).toMatchObject({
    trip_id: DAYS_TRIP_ID,
    place_id: '66666666-6666-4666-8666-666666666666',
    starts_at: '2026-12-02T00:00:00.000Z',
  });
  expect(writes.filter((w) => w.table === 'trip_reservations')).toEqual([]);
  expect(log.unexpected).toEqual([]);
});
test('the actual source transport editor preserves unsaved title through expense unlink and a reservation refresh', async ({
  page,
}) => {
  const { state, log } = await setup(page, 2);
  await page.goto(`/trips/${DAYS_TRIP_ID}`);
  await page
    .getByRole('button', { name: /Night flight/ })
    .first()
    .click();
  const detail = page
    .getByRole('dialog')
    .filter({ has: page.getByText('Night flight', { exact: true }) })
    .first();
  await expect(detail.getByText('Night fare', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog').last();
  const title = editor.locator('input[required]').first();
  await expect(title).toHaveValue('Night flight');
  await title.fill('Unsaved custom flight title');
  await editor.getByPlaceholder('Additional notes...').fill('Unsaved private notes');
  await editor.getByRole('button', { name: /^Unlink/i }).click();
  await expect.poll(() => state.trip_expenses[0].reservation_id).toBe(null);
  await expect(editor.getByText('Night fare', { exact: true })).toBeHidden();
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .findLast((url) => new URL(url).pathname === '/src/store/tripStore.ts');
    if (!url) throw Error('The app trip store was not loaded');
    const { useTripStore } = await import(url);
    const store = useTripStore.getState();
    await store.hydrateActiveTrip(store.trip!.id);
  });
  await expect(title).toHaveValue('Unsaved custom flight title');
  await expect(editor.getByPlaceholder('Additional notes...')).toHaveValue('Unsaved private notes');
  expect(log.unexpected).toEqual([]);
});
