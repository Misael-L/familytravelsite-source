// organize-imports-ignore
// sort-imports-ignore
import '../../../tests/helpers/familyPlannerCohort/state';
import { describe, it, expect, vi } from 'vitest';
import { NativeEditor } from '../../../tests/helpers/familyPlannerCohort/forms';
import { load, required, request, form } from '../../../tests/helpers/familyPlannerCohort/core';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, db, trip, uuid } from '../../../tests/helpers/familyPlannerCohort/state';
import { render, screen, fireEvent, waitFor } from '../../../tests/helpers/render';
import { offlineDb, currentOfflineDatabase } from '../../db/offlineDb';
import { CREATION_TERMINAL_ARCHIVE_KEY } from '../../db/creationTerminalArchive';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { useTripStore } from '../../store/tripStore';
import { createPlannerCommandRecovery } from './plannerCommandRecovery';
import type { EditorPacket } from './plannerEditorContract';
const rows = () => offlineDb.mutationQueue.toArray();
const writes = () => db.rpc.mock.calls.filter((c) => /^save_family_trip_(location|visit)_form_v1$/.test(String(c[0])));
const recovery = () =>
  createPlannerCommandRecovery(cohortState.repo, trip, { source: () => cohortState.source, current: () => true });
async function open(selected = true) {
  await load();
  const r = request(selected),
    e = await cohortState.cohort.openEditor(r),
    data = form(e, { notes: 'Original venue note', ...(selected ? { assignment_notes: 'Original visit note' } : {}) });
  return { r, data, save: () => cohortState.cohort.saveForm(r, data) };
}
describe('native editor durable original cutover', () => {
  it.each([false, true])(
    'selected=%s retains exact native original before sending and disables duplicate clicks',
    async (selected) => {
      await load();
      render(<NativeEditor selected={selected} />);
      fireEvent.click(screen.getByRole('button', { name: 'Open native editor' }));
      await screen.findByDisplayValue('Actual cafe');
      fireEvent.change(screen.getByPlaceholderText(/Personal notes/i), {
        target: { value: 'Retained native venue note' },
      });
      const raw = required(db.rpc.getMockImplementation());
      let release = () => {},
        sent = false;
      const held = new Promise<void>((r) => (release = r)),
        name = selected ? 'save_family_trip_visit_form_v1' : 'save_family_trip_location_form_v1';
      db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) => {
        if (n === name) {
          sent = true;
          const row = required((await rows())[0]),
            p = row.body as EditorPacket;
          expect(row.id).toBe(a.p_operation_id);
          expect(row.method).toBe('POST');
          expect(p.request.form).toEqual(a.p_form);
          expect(row.retentionPolicy).toBe('family-original-v1');
          await held;
        }
        return raw(n, a);
      });
      fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
      await waitFor(() => expect(sent).toBe(true));
      const saved = required((await rows())[0]);
      expect((saved.body as EditorPacket).kind).toBe(selected ? 'visit' : 'location');
      const busy = screen.getByRole('button', { name: /Saving/i });
      expect(busy).toBeDisabled();
      fireEvent.click(busy);
      expect(writes()).toHaveLength(1);
      release();
      await waitFor(async () => expect(await rows()).toEqual([]));
      await waitFor(() => expect(screen.queryByPlaceholderText(/Personal notes/i)).toBeNull());
    }
  );
  it.each([false, true])('selected=%s storage failure sends no save or outcome call', async (selected) => {
    const f = await open(selected),
      start = db.rpc.mock.calls.length;
    vi.spyOn(offlineDb.mutationQueue, 'add').mockRejectedValueOnce(
      new DOMException('Quota exhausted', 'QuotaExceededError')
    );
    await expect(f.save()).rejects.toThrow();
    expect(db.rpc.mock.calls.slice(start)).toEqual([]);
    expect(await rows()).toEqual([]);
  });
  it.each([false, true])(
    'selected=%s pre-dispatch loss discovers the exact original without a planner snapshot, then explicitly retries it',
    async (selected) => {
      const f = await open(selected),
        raw = required(db.rpc.getMockImplementation());
      let refuse = true;
      db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) =>
        /^save_family_trip_.*_form_v1$/.test(n) && refuse ? { data: null, error: { code: '08006' } } : raw(n, a)
      );
      await expect(f.save()).rejects.toThrow();
      const row = required((await rows())[0]);
      await expect(cohortState.cohort.saveForm(f.r, { ...f.data, notes: 'Different intent' })).rejects.toMatchObject({
        code: 'editor_unresolved_intent',
      });
      useTripStore.setState({ trip: null, isLoading: false });
      const task = required(await recovery().inspect());
      expect(task.action).toBe('edit');
      const count = writes().length;
      expect(await task.check()).toBe('unknown');
      expect(writes()).toHaveLength(count);
      expect(await rows()).toEqual([row]);
      refuse = false;
      expect(await task.retry()).toBe('committed');
      expect(await rows()).toEqual([]);
      expect(writes().every((c) => c[1].p_operation_id === row.id)).toBe(true);
      await load();
      expect(useTripStore.getState().places[0].notes).toBe('Original venue note');
    }
  );
  it.each([false, true])(
    'selected=%s lost committed reply reconciles through read only and keeps a later edit',
    async (selected) => {
      const f = await open(selected);
      cohortState.loseAck = true;
      await expect(f.save()).rejects.toThrow();
      const row = required((await rows())[0]);
      if (selected)
        cohortState.publishedVisit = {
          ...cohortState.publishedVisit,
          revision: cohortState.publishedVisit.revision + 1,
          explanations: 'Later visit edit',
        };
      else
        Object.assign(cohortState.published, {
          revision: cohortState.published.revision + 1,
          notes: 'Later venue edit',
        });
      const task = required(await recovery().inspect()),
        count = writes().length;
      expect(await task.check()).toBe('committed');
      expect(writes()).toHaveLength(count);
      expect(await rows()).toEqual([]);
      await load();
      expect(selected ? cohortState.publishedVisit.explanations : cohortState.published.notes).toBe(
        selected ? 'Later visit edit' : 'Later venue edit'
      );
      expect(row.id).toBe(writes()[0][1].p_operation_id);
    }
  );
  it('denied current authority preserves the original; restoration retries the same operation', async () => {
    const f = await open(),
      raw = required(db.rpc.getMockImplementation());
    let refuse = true;
    db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) =>
      n === 'save_family_trip_visit_form_v1' && refuse ? { data: null, error: { code: '08006' } } : raw(n, a)
    );
    await expect(f.save()).rejects.toThrow();
    const row = required((await rows())[0]);
    cohortState.deny = { code: '42501' };
    let task = required(await recovery().inspect());
    await expect(task.check()).rejects.toMatchObject({ status: 403 });
    expect(await rows()).toEqual([row]);
    cohortState.deny = null;
    refuse = false;
    task = required(await recovery().inspect());
    expect(await task.retry()).toBe('committed');
    expect(writes().every((c) => c[1].p_operation_id === row.id)).toBe(true);
  });
  it.each(['person', 'family', 'source', 'layer', 'trip', 'logout'])(
    '%s retirement during a held save cannot acknowledge or publish into another context',
    async (change) => {
      const f = await open(),
        originalDB = currentOfflineDatabase(),
        raw = required(db.rpc.getMockImplementation());
      let release = () => {},
        sent = false;
      const held = new Promise<void>((r) => (release = r));
      db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) => {
        if (n === 'save_family_trip_visit_form_v1') {
          sent = true;
          await held;
        }
        return raw(n, a);
      });
      const saving = f.save();
      void saving.catch((error) => {
        expect(error).toBeDefined();
      });
      await waitFor(() => expect(sent).toBe(true));
      const row = required((await originalDB.mutationQueue.toArray())[0]);
      if (change === 'person' || change === 'family') {
        cohortState.session = { ...cohortState.session, [change === 'person' ? 'personId' : 'familyId']: uuid(98) };
        cohortState.repo.acceptSession(cohortState.session);
      } else if (change === 'source') cohortState.source += 'changed';
      else if (change === 'layer') cohortState.repo.setLayer(trip, 'myDraft');
      else if (change === 'trip')
        useTripStore.setState({ trip: { ...required(useTripStore.getState().trip), id: 999 } });
      else setAuthed(false);
      release();
      await expect(saving).rejects.toThrow();
      expect(await originalDB.mutationQueue.toArray()).toEqual([row]);
    }
  );
  it('a changed observed row is never deleted by the older callback', async () => {
    const f = await open(),
      raw = required(db.rpc.getMockImplementation());
    let release = () => {},
      sent = false;
    const held = new Promise<void>((r) => (release = r));
    db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) => {
      if (n === 'save_family_trip_visit_form_v1') {
        sent = true;
        await held;
      }
      return raw(n, a);
    });
    const saving = f.save();
    void saving.catch((error) => {
      expect(error).toBeDefined();
    });
    await waitFor(() => expect(sent).toBe(true));
    const row = required((await rows())[0]);
    await offlineDb.mutationQueue.update(row.id, { createdAt: row.createdAt + 1 });
    release();
    await expect(saving).rejects.toThrow();
    expect((await rows())[0].createdAt).toBe(row.createdAt + 1);
  });
  it('an opaque creation decision with no queue row prevents a new edit', async () => {
    const f = await open();
    await offlineDb.syncMeta.put({
      tripId: CREATION_TERMINAL_ARCHIVE_KEY,
      lastSyncedAt: null,
      status: 'idle',
      tilesBbox: null,
      filesCachedCount: 0,
      familyCreationTerminalArchive: { version: 999 },
    });
    const start = db.rpc.mock.calls.length;
    await expect(f.save()).rejects.toThrow();
    expect(db.rpc.mock.calls.slice(start)).toEqual([]);
    expect(writes()).toEqual([]);
  });
  it('generic queue flushing cannot replay a retained native edit as an unchecked write', async () => {
    const f = await open(),
      raw = required(db.rpc.getMockImplementation());
    db.rpc.mockImplementation(async (n: string, a: Record<string, unknown>) =>
      n === 'save_family_trip_visit_form_v1' ? { data: null, error: { code: '08006' } } : raw(n, a)
    );
    await expect(f.save()).rejects.toThrow();
    const row = required((await rows())[0]),
      count = writes().length;
    await mutationQueue.flush();
    expect(writes()).toHaveLength(count);
    expect((await rows())[0].body).toEqual(row.body);
    expect(await recovery().inspect()).not.toBeNull();
  });
});
