import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

async function section(page, name) {
  const direct = page.getByRole('button', { name, exact: true });
  if (await direct.count()) return direct.click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp('^' + name + '(?:\\s|\\d|$)') })
    .click();
}
async function bytes(page, url) {
  return page.evaluate(async (src) => {
    const response = await globalThis.fetch(src);
    const blob = await response.blob();
    const hash = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return {
      ok: response.ok,
      bytes: blob.size,
      mime: blob.type,
      sha256: [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join(''),
    };
  }, url);
}
export async function checkFilesAndBookings({ page, fixture, profile, output, record, expect, context }) {
  await section(page, 'Files');
  const image = fixture.native_files_bookings.assets.find((a) => a.mime === 'image/png');
  const pdf = fixture.native_files_bookings.assets.find((a) => a.mime === 'application/pdf');
  await expect(page.getByText(image.name, { exact: true }).first()).toBeVisible({ timeout: 20000 });
  await page.getByText(image.name, { exact: true }).first().click();
  const photo = page.getByAltText(image.name, { exact: true });
  await expect(photo).toBeVisible({ timeout: 20000 });
  await expect.poll(() => photo.evaluate((node) => node.naturalWidth)).toBe(1);
  const imageUrl = await photo.getAttribute('src');
  assert.ok(imageUrl.startsWith('blob:'));
  assert.deepEqual(await bytes(page, imageUrl), {
    ok: true,
    bytes: image.bytes,
    mime: image.mime,
    sha256: image.sha256,
  });
  await page.screenshot({ path: path.join(output, profile.name + '-private-image.png'), fullPage: true });
  record('actual native private image decodes original authorized bytes with matching SHA-256');
  await page.keyboard.press('Escape');
  await expect(photo).toHaveCount(0);
  const retired = await page.evaluate(async (url) => {
    try {
      await globalThis.fetch(url);
      return false;
    } catch {
      return true;
    }
  }, imageUrl);
  assert.ok(retired, 'Closing the actual native preview must revoke its object URL');
  record('closing the native image viewer revokes its scoped object URL');
  if (!profile.phone) {
    await page.getByRole('button', { name: pdf.name, exact: true }).first().click();
    const object = page.locator('object[title="' + pdf.name + '"]');
    await expect.poll(() => object.getAttribute('data')).toMatch(/^blob:/);
    const url = (await object.getAttribute('data')).split('#')[0];
    assert.deepEqual(await bytes(page, url), { ok: true, bytes: pdf.bytes, mime: pdf.mime, sha256: pdf.sha256 });
    await page.screenshot({ path: path.join(output, profile.name + '-private-pdf.png'), fullPage: true });
    record('actual native PDF preview receives original application/pdf bytes with matching SHA-256');
    await page.keyboard.press('Escape');
    await expect(object).toHaveCount(0);
    assert.ok(await revoked(page, url));
    record('closing the native PDF viewer revokes its scoped object URL');
  } else {
    const popupReady = context.waitForEvent('page');
    await page.getByText(pdf.name, { exact: true }).first().click();
    const popup = await popupReady;
    await expect.poll(() => popup.url()).toMatch(/^blob:/);
    assert.deepEqual(await bytes(page, popup.url().split('#')[0]), {
      ok: true,
      bytes: pdf.bytes,
      mime: pdf.mime,
      sha256: pdf.sha256,
    });
    await popup.close();
    record(
      'native phone PDF opener exports the original authorized bytes; exported bytes have no remote revocation guarantee'
    );
  }
  await section(page, 'Bookings');
  await page.getByText('Two-night stay', { exact: true }).first().click();
  const detail = page.getByRole('dialog', { name: 'Two-night stay', exact: true });
  await expect(detail.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: path.join(output, profile.name + '-booking.png'), fullPage: true });
  await detail.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.screenshot({ path: path.join(output, profile.name + '-booking-editor.png'), fullPage: true });
  const original = await readContext(page, fixture, fixture.native_files_bookings.booking_id, expect);
  const title = 'Native booking ' + profile.name;
  await page.getByPlaceholder('e.g. Lufthansa LH123, Hotel Adlon, ...').fill(title);
  await page.getByPlaceholder('Additional notes...').fill('Native booking note ' + profile.name);
  await page.getByPlaceholder('e.g. ABC12345').fill('NATIVE-' + profile.name);
  await saveNative(page, fixture, expect, output, profile, 'hotel');
  const saved = await readContext(page, fixture, fixture.native_files_bookings.booking_id, expect);
  assert.equal(saved.observation.record.title, title);
  assert.equal(saved.observation.record.notes, 'Native booking note ' + profile.name);
  assert.equal(saved.observation.record.confirmation_code, 'NATIVE-' + profile.name);
  assert.deepEqual(saved.observation.dates, original.observation.dates);
  for (const key of Object.keys(original.observation.record).filter(
    (k) => !['title', 'notes', 'confirmation_code', 'updated_at'].includes(k)
  ))
    assert.deepEqual(
      saved.observation.record[key],
      original.observation.record[key],
      'Unexpected booking change: ' + key
    );
  assert.match(saved.observation.record.starts_at, /14:00:00\.123456/);
  assert.match(saved.observation.record.ends_at, /11:00:00\.654321/);
  record('native booking save preserves exact instants, microseconds, civil dates, metadata and original identity');
  await page.screenshot({ path: path.join(output, profile.name + '-booking-saved.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByText(title, { exact: true }).first().click();
  const savedDetail = page.getByRole('dialog', { name: title, exact: true });
  if (profile.phone) {
    // The phone detail has no linked-ledger opener. Its actual form guards the companion before opening it.
    await savedDetail.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByPlaceholder('e.g. Lufthansa LH123, Hotel Adlon, ...').fill('Must not partially save');
    await page.getByRole('button', { name: 'Edit', exact: true }).filter({ hasText: 'Hotel expense' }).click();
    await expect(
      page.getByText('Booking file and cost changes are not available in this planner session yet.', { exact: true })
    ).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Dinner, souvenirs, gas…')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(
      (await readContext(page, fixture, fixture.native_files_bookings.booking_id, expect)).observation,
      saved.observation
    );
    record(
      'native phone booking companion callback refuses expense editing without partially saving typed booking fields'
    );
  } else {
    await savedDetail.getByRole('button', { name: /^Hotel expense/ }).click();
    const expenseName = page.getByPlaceholder('e.g. Dinner, souvenirs, gas…');
    await expect(expenseName).toHaveValue('Hotel expense');
    const writes = [];
    const observeWrite = (request) => {
      const u = new globalThis.URL(request.url());
      if (
        u.origin === fixture.api &&
        request.method() !== 'GET' &&
        u.pathname.startsWith('/rest/v1/') &&
        !u.pathname.startsWith('/rest/v1/rpc/get_')
      )
        writes.push({ method: request.method(), path: u.pathname });
    };
    page.on('request', observeWrite);
    await expenseName.fill('Must never overwrite the ledger');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page
        .locator('.nomad-toast')
        .filter({ hasText: /error|wrong/i })
        .first()
    ).toBeVisible();
    await expect(expenseName).toBeVisible();
    page.off('request', observeWrite);
    assert.deepEqual(writes, [], 'Unsupported expense callback must stop before persistence');
    await page.screenshot({ path: path.join(output, profile.name + '-expense-refused.png'), fullPage: true });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(
      (await readContext(page, fixture, fixture.native_files_bookings.booking_id, expect)).observation,
      saved.observation
    );
    record(
      'native booking-to-expense callback opens the existing ledger; unsupported save is refused before any persistence'
    );
  }
  // A separate date-only fixture exercises civil scheduling without inventing hotel stays or midnight instants.
  if (fixture.native_files_bookings.date_only_booking) {
    const id = fixture.native_files_bookings.date_only_booking;
    const before = await readContext(page, fixture, id, expect);
    await page.getByText('Date-only admission', { exact: true }).first().click();
    await page
      .getByRole('dialog', { name: 'Date-only admission', exact: true })
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    await page.getByRole('button', { name: 'Apr 2, 2027', exact: true }).click();
    await page.getByRole('button', { name: 'April 1, 2027', exact: true }).click();
    await page.getByPlaceholder('Additional notes...').fill('Date-only native edit ' + profile.name);
    await saveNative(page, fixture, expect, output, profile, 'civil');
    const after = await readContext(page, fixture, id, expect);
    assert.equal(after.observation.record.notes, 'Date-only native edit ' + profile.name);
    assert.equal(after.observation.record.starts_at, null);
    assert.equal(after.observation.record.ends_at, null);
    assert.equal(after.observation.dates.start_date, '2027-04-01');
    assert.equal(after.observation.dates.start_day_id, fixture.planner.days[0]);
    assert.equal(after.observation.dates.end_date, before.observation.dates.end_date);
    record('actual native calendar changes the civil day without inventing a midnight instant');
    await page.keyboard.press('Escape');
  }
  await section(page, 'Files');
  let heldUrl;
  if (profile.phone) {
    // Narrow native Files uses type-icon rows, not inline image thumbnails.
    await page.getByText(image.name, { exact: true }).first().click();
    const held = page.getByAltText(image.name, { exact: true });
    await expect.poll(() => held.evaluate((n) => n.naturalWidth)).toBe(1);
    heldUrl = await held.getAttribute('src');
    // Native modal navigation closes the viewer before exposing the Trip Back control.
    await page.keyboard.press('Escape');
    await expect(held).toBeHidden();
    await page.getByRole('button', { name: 'Back', exact: true }).first().click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByText('Other private-file scope', { exact: true }).first().click();
    await expect(page.getByText('No places planned for this day', { exact: true })).toBeVisible({ timeout: 20000 });
  } else {
    await page.getByText(image.name, { exact: true }).first().click();
    const held = page.getByAltText(image.name, { exact: true });
    await expect.poll(() => held.evaluate((n) => n.naturalWidth)).toBe(1);
    heldUrl = await held.getAttribute('src');
    await page.evaluate((id) => {
      globalThis.history.pushState(null, '', '/trips/' + id);
      globalThis.dispatchEvent(new globalThis.PopStateEvent('popstate'));
    }, fixture.native_files_bookings.other_trip);
    await expect(page.getByText('Other private-file scope', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  }
  assert.ok(await revoked(page, heldUrl));
  record(
    profile.phone
      ? 'native phone Trip departure keeps the closed private preview URL revoked'
      : 'actual SPA Trip transition retires the original native private preview URL'
  );
  if (profile.phone) {
    await page.getByRole('button', { name: 'Back', exact: true }).first().click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByText('Observed task fixture', { exact: true }).first().click();
    await section(page, 'Files');
  } else
    await page.evaluate((id) => {
      globalThis.history.pushState(null, '', '/trips/' + id);
      globalThis.dispatchEvent(new globalThis.PopStateEvent('popstate'));
    }, fixture.trip_id);
  const filesReady = page.getByText(image.name, { exact: true }).first();
  await expect(filesReady).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByText('Planner refresh is held to preserve local work. Resolve pending commands or retry after editing.', {
      exact: true,
    })
  ).toHaveCount(0);
  record('rapid native Files return reloads coherently without a competing cache writer or manual Retry');
  if (profile.phone) {
    await page.getByText(image.name, { exact: true }).first().click();
    const photo = page.getByAltText(image.name, { exact: true });
    await expect.poll(() => photo.evaluate((n) => n.naturalWidth)).toBe(1);
    const closedUrl = await photo.getAttribute('src');
    await page.keyboard.press('Escape');
    await expect(photo).toBeHidden();
    assert.ok(await revoked(page, closedUrl));
    return [closedUrl];
  }
  const inline = page.locator('img[src^="blob:"]').filter({ visible: true }).first();
  await expect.poll(() => inline.evaluate((n) => n.naturalWidth)).toBe(1);
  return await page
    .locator('img[src^="blob:"]')
    .filter({ visible: true })
    .evaluateAll((nodes) => nodes.map((n) => n.src));
}
async function revoked(page, url) {
  return page.evaluate(async (src) => {
    try {
      await globalThis.fetch(src);
      return false;
    } catch {
      return true;
    }
  }, url);
}
async function readContext(page, fixture, id, expect) {
  let last;
  await expect
    .poll(
      async () => {
        last = await page.evaluate(
          async ({ trip, id }) => {
            const r = await globalThis.fetch('/api/trips/' + trip + '/family/booking-details/' + id);
            return { status: r.status, body: await r.json() };
          },
          { trip: fixture.trip_id, id }
        );
        assert.ok([200, 409].includes(last.status), 'Unexpected booking context refusal: ' + last.status);
        return last.status;
      },
      { timeout: 15000 }
    )
    .toBe(200);
  return last.body;
}

/** A saved-but-refresh-retired toast explicitly offers Retry of the same original save.
 * Never reopen/rebase, edit fields, create a replacement operation, or retry other failures. */
async function saveNative(page, fixture, expect, output, profile, kind) {
  const attempts = [];
  const exerciseRetry = profile.phone && kind === 'hotel';
  let acknowledged = false,
    readFault = false;
  const readPattern = '**/rest/v1/rpc/get_family_trip_planner_view_v1';
  const failFreshRead = async (route) => {
    if (acknowledged && !readFault) {
      readFault = true;
      return route.abort('failed');
    }
    return route.fallback();
  };
  const noteAcknowledgement = (response) => {
    if (
      new globalThis.URL(response.url()).pathname === '/rest/v1/rpc/save_family_booking_details_v1' &&
      response.status() === 200
    )
      acknowledged = true;
  };
  if (exerciseRetry) {
    page.on('response', noteAcknowledgement);
    await page.route(readPattern, failFreshRead);
  }
  const observe = (request) => {
    const u = new globalThis.URL(request.url());
    if (u.origin !== fixture.api || u.pathname !== '/rest/v1/rpc/save_family_booking_details_v1') return;
    const body = request.postDataJSON();
    attempts.push({
      operation_id: body.p_operation_id,
      sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    });
  };
  page.on('request', observe);
  try {
    let state = 'pending';
    for (let click = 0; click < 2; click++) {
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      await expect
        .poll(
          async () => {
            if (!(await page.getByRole('button', { name: /^(?:Update|Saving)/ }).count())) return (state = 'done');
            const update = page.getByRole('button', { name: 'Update', exact: true });
            if (
              (await update.count()) &&
              (await update.isEnabled()) &&
              (await page
                .getByText(
                  'The booking was saved, but its details could not be refreshed. Retry the original save to refresh them.',
                  { exact: true }
                )
                .isVisible())
            )
              return (state = 'retry');
            return (state = 'pending');
          },
          { timeout: 20000 }
        )
        .not.toBe('pending');
      if (state === 'done') break;
      // A prior toast can outlive the next request and the sheet's close animation.
      await page
        .getByText(
          'The booking was saved, but its details could not be refreshed. Retry the original save to refresh them.',
          { exact: true }
        )
        .waitFor({ state: 'hidden', timeout: 10000 });
      // This repeats the still-open, unchanged form through its native Update button.
    }
    assert.equal(state, 'done', 'Original save did not finish its coherent refresh');
    assert.ok(attempts.length > 0);
    if (exerciseRetry) {
      assert.ok(readFault);
      assert.equal(attempts.length, 2, 'The explicit native retry must reuse exactly the original command');
    }
    assert.ok(
      attempts.every((a) => a.operation_id === attempts[0].operation_id && a.sha256 === attempts[0].sha256),
      'Retry changed original operation/body'
    );
    await writeFile(
      path.join(output, profile.name + '-' + kind + '-save-attempts.json'),
      JSON.stringify(
        {
          kind,
          attempts,
          original_identity_and_body_preserved: true,
          deliberate_post_ack_read_network_fault: readFault,
        },
        null,
        2
      )
    );
  } finally {
    page.off('request', observe);
    if (exerciseRetry) {
      page.off('response', noteAcknowledgement);
      await page.unroute(readPattern, failFreshRead);
    }
  }
}
