import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkPlanner({ page, fixture, profile, output, record, expect }) {
  const result = await page.evaluate(async (trip) => {
    const response = await globalThis.fetch('/api/trips/' + trip + '/bundle');
    return { status: response.status, body: await response.json() };
  }, fixture.trip_id);
  assert.equal(result.status, 200);
  const bundle = result.body;
  const visits = bundle.days.flatMap((day) => day.assignments ?? []);
  const repeat = visits.find((row) => row.family_visit?.id === fixture.planner.repeat);
  const midnight = visits.find((row) => row.family_visit?.id === fixture.planner.midnight);
  assert.ok(repeat && midnight);
  assert.equal(repeat.assignment_time, null);
  assert.equal(repeat.place.place_time, null);
  assert.equal(midnight.assignment_time, '00:00');
  assert.equal(midnight.place.place_time, '00:00');
  assert.equal(midnight.place_id, repeat.place_id);
  assert.notEqual(midnight.id, repeat.id);
  const restaurant = bundle.places.find((row) => row.family_location_id === fixture.planner.location);
  assert.ok(restaurant);
  assert.equal(restaurant.place_time, undefined);
  assert.equal(restaurant.description, 'Catalog restaurant description');
  assert.equal(restaurant.notes, null);
  assert.equal(restaurant.lat, 19.05);
  assert.match(restaurant.image_url ?? '', /\/object\/public\/catalog\/variants\/v1\/.*\/hero-/);
  record('canonical bundle preserves repeated venue, separate notes and untimed versus midnight clocks');
  const refused = await page.evaluate(async (trip) => {
    const response = await globalThis.fetch('/api/trips/' + trip + '/places', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Must not create a legacy place' }),
    });
    return { status: response.status, body: await response.json() };
  }, fixture.trip_id);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'planner_writer_not_cut_over');
  record('raw native writer is refused before legacy persistence');
  // Persist only synthetic safe contract details, never SDK session material.
  await writeFile(
    path.join(output, profile.name + '-planner-observation.json'),
    JSON.stringify(
      {
        visits: visits.map((row) => ({
          id: row.family_visit?.id,
          location: row.family_visit?.plan_location_id,
          clock: row.place.place_time,
          notes: row.notes,
        })),
        restaurant: {
          name: restaurant.name,
          description: restaurant.description,
          notes: restaurant.notes,
          image_url: restaurant.image_url,
        },
      },
      null,
      2
    )
  );
  {
    if (profile.phone) await page.getByRole('button', { name: 'Plan', exact: true }).first().click();
    await page.getByText('Untimed repeat visit', { exact: true }).first().click();
    const inspector = profile.phone ? page.getByRole('dialog', { name: 'Fixture restaurant', exact: true }) : page;
    await expect(inspector.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: path.join(output, profile.name + '-visit.png'), fullPage: true });
    await inspector.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.screenshot({ path: path.join(output, profile.name + '-editor.png'), fullPage: true });
    const visitNote = 'Native visit note ' + profile.name;
    const personalNote = 'Native personal note ' + profile.name;
    await page.getByPlaceholder('Notes for this place on this day only...').fill(visitNote);
    await page.getByPlaceholder('Personal notes...').fill(personalNote);
    await page.getByRole('button', { name: profile.phone ? 'Save' : 'Update', exact: true }).click();
    await expect(page.getByPlaceholder('Personal notes...')).toHaveCount(0, { timeout: 20000 });
    const saved = await readFreshBundle(page, fixture.trip_id, expect);
    const savedVisits = saved.days.flatMap((day) => day.assignments ?? []);
    assert.equal(savedVisits.find((row) => row.family_visit?.id === fixture.planner.repeat).notes, visitNote);
    assert.equal(
      savedVisits.find((row) => row.family_visit?.id === fixture.planner.midnight).notes,
      'Genuine midnight visit'
    );
    assert.equal(
      savedVisits.find((row) => row.family_visit?.id === fixture.planner.midnight).place.place_time,
      '00:00'
    );
    const savedPlace = saved.places.find((row) => row.family_location_id === fixture.planner.location);
    assert.equal(savedPlace.description, 'Catalog restaurant description');
    assert.equal(savedPlace.notes, personalNote);
    record('native selected-visit editor saves separate personal and occurrence notes without changing another visit');
    const lists = page.getByRole('button', { name: 'Lists', exact: true });
    if (await lists.count()) await lists.click();
    else {
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^Lists(?:\s|$)/ })
        .click();
    }
    await page.getByRole('button', { name: /^To-Do/ }).click();
    await expect(page.getByText('Original bootstrap task', { exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: profile.phone ? 'New task' : 'Add new task', exact: true }).click();
    const taskName = 'Native bootstrap task ' + profile.name;
    await page.getByPlaceholder('Task name').fill(taskName);
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(page.getByText(taskName, { exact: true })).toBeVisible({ timeout: 20000 });
    if (profile.phone)
      await page.getByRole('button', { name: taskName, exact: true }).and(page.locator('[aria-pressed]')).click();
    else
      await page
        .getByRole('region', { name: 'Task', exact: true })
        .getByRole('button', { name: 'Done', exact: true })
        .click();
    await expect
      .poll(async () => {
        const data = await page.evaluate(
          async (trip) => (await globalThis.fetch('/api/trips/' + trip + '/todo')).json(),
          fixture.trip_id
        );
        return Boolean(data.items.find((row) => row.name === taskName)?.checked);
      })
      .toBe(true);
    record('native task creation and completion commit through the qualified task writer');
    if (!profile.phone) {
      // Completion advanced the revision. Explicitly reopen, never rebind an older form.
      await page
        .getByRole('region', { name: 'Task', exact: true })
        .getByRole('button', { name: 'Close', exact: true })
        .click();
      await page.getByRole('button', { name: /^Done(?:\s*\d+)?$/ }).click();
      await page.getByText(taskName, { exact: true }).click();
    }

    if (profile.phone) {
      await page.getByRole('button', { name: /^Done(?:\s*\d+)?$/ }).click();
      await page.getByText(taskName, { exact: true }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
    } else
      await page
        .getByRole('region', { name: 'Task', exact: true })
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
    await page.getByRole('button', { name: 'To-Do · Trash', exact: true }).click();
    await expect(page.getByText(taskName, { exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect
      .poll(async () => {
        const data = await page.evaluate(
          async (trip) => (await globalThis.fetch('/api/trips/' + trip + '/todo')).json(),
          fixture.trip_id
        );
        return data.items.filter((row) => row.name === taskName && row.checked).length;
      })
      .toBe(1);
    record('native task Trash and restore preserve the same completed task');
    await page.screenshot({ path: path.join(output, profile.name + '-task-restored.png'), fullPage: true });
    // Dismiss the owned Trash panel before returning to the native plan.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Plan', exact: true }).first().click();
  }
}

/** Fresh reads may be retired by the actual realtime notification of the completed save.
 * Retry only the GET with a new observation; never rebase/retry a command or invent a bundle. */
async function readFreshBundle(page, trip, expect) {
  let last;
  await expect
    .poll(
      async () => {
        last = await page.evaluate(async (id) => {
          const response = await globalThis.fetch('/api/trips/' + id + '/bundle');
          return { status: response.status, body: await response.json() };
        }, trip);
        assert.ok([200, 409].includes(last.status), 'Unexpected fresh-read refusal: ' + last.status);
        return last.status;
      },
      { timeout: 15000 }
    )
    .toBe(200);
  return last.body;
}
