vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock('@family/backend/supabase/env', () => ({ getSupabaseUrl: () => 'https://fixture.invalid' }));
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cid, commandActor } from '../../../tests/helpers/collectionCommandFixture';
import { registerCollectionRecoveryLive } from '../../../tests/qualification/collectionRecovery.live';
import type { CollectionCommandSession } from './collectionCommandSession';
import { FamilyApiError } from './errors';
import { FamilyCollectionRecovery } from './FamilyCollectionRecovery';
const at = '2026-11-15T00:00:00.123456Z';
const item = (n: number) => ({
  id: cid(100 + n),
  collection_id: commandActor.collection_id,
  kind: 'manual',
  source: { kind: 'manual', id: null },
  revision: 2,
  status: 'idea',
  sort_order: n,
  deleted_at: at,
});
const root = (n = 10) => ({
  id: cid(n),
  family_id: commandActor.family_id,
  owner_person_id: commandActor.person_id,
  visibility: 'private',
  revision: 2,
  lifecycle_revision: 1,
  archived_at: null,
  deleted_at: at,
});
const version = (revision: number) => ({
  revision,
  schema_version: 1,
  recorded_at: at,
  snapshot: { id: commandActor.collection_id, revision, name: 'Name ' + revision, notes: 'Note ' + revision },
  location_snapshot: null,
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void, reject!: (v: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function fixture() {
  const f = {
    scope: commandActor,
    pending: vi.fn().mockResolvedValue([]),
    trash: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    history: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    retainLifecycle: vi.fn().mockResolvedValue(cid(900)),
    run: vi.fn().mockResolvedValue({ status: 'committed' }),
    retire: vi.fn(),
  };
  return { f, session: f as unknown as CollectionCommandSession };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const click = async (name: string) => {
  await waitFor(() => expect(screen.getByRole('button', { name })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name }));
};
describe('mounted Collection recovery paging and lifetimes', () => {
  it('traverses three deleted-item pages and ends without duplicate or missing records', async () => {
    const { f, session } = fixture(),
      pages = [
        Array.from({ length: 25 }, (_, i) => item(i)),
        Array.from({ length: 25 }, (_, i) => item(i + 25)),
        Array.from({ length: 5 }, (_, i) => item(i + 50)),
      ];
    let n = 0;
    f.trash.mockImplementation(async () => ({
      items: pages[n],
      next_cursor: ++n < 3 ? { before_deleted_at: at, before_id: cid(100 + n * 25 - 1) } : null,
    }));
    render(<FamilyCollectionRecovery session={session} />);
    await click('Load deleted items');
    await screen.findAllByRole('button', { name: 'Restore item' });
    await click('More deleted records');
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Restore item' })).toHaveLength(50));
    await click('More deleted records');
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Restore item' })).toHaveLength(55));
    expect(screen.queryByRole('button', { name: 'More deleted records' })).toBeNull();
    expect(f.trash.mock.calls[1]).toEqual(['item', 25, { before_deleted_at: at, before_id: cid(124) }]);
  });
  it('does not expose another Collection restore while traversing root pages', async () => {
    const { f, session } = fixture();
    f.trash
      .mockResolvedValueOnce({ items: [root(20)], next_cursor: { before_deleted_at: at, before_id: cid(20) } })
      .mockResolvedValueOnce({ items: [root()], next_cursor: null });
    render(<FamilyCollectionRecovery session={session} />);
    await click('Load deleted Collections');
    await click('More deleted records');
    await screen.findByRole('button', { name: 'Restore Collection' });
    expect(screen.getAllByRole('button', { name: 'Restore Collection' })).toHaveLength(1);
  });
  it('shows root history, pages by revision, and preserves notes', async () => {
    const { f, session } = fixture();
    f.history
      .mockResolvedValueOnce({
        items: Array.from({ length: 25 }, (_, i) => version(55 - i)),
        next_cursor: { before_revision: 31 },
      })
      .mockResolvedValueOnce({ items: [version(30)], next_cursor: null });
    render(<FamilyCollectionRecovery session={session} />);
    await click('Collection history');
    await screen.findByText('Note 55');
    await click('More history');
    await screen.findByText('Note 30');
    expect(f.history.mock.calls[1]).toEqual([null, 25, 31]);
    expect(screen.queryByRole('button', { name: 'More history' })).toBeNull();
  });
  it('resets history paging when a different item is selected', async () => {
    const { f, session } = fixture();
    f.trash.mockResolvedValue({ items: [item(1), item(2)], next_cursor: null });
    f.history.mockResolvedValue({ items: [version(4)], next_cursor: { before_revision: 4 } });
    render(<FamilyCollectionRecovery session={session} />);
    await click('Load deleted items');
    const buttons = await screen.findAllByRole('button', { name: 'Item history' });
    fireEvent.click(buttons[0]);
    await screen.findByRole('button', { name: 'More history' });
    await waitFor(() => expect(buttons[1]).not.toBeDisabled());
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(f.history).toHaveBeenCalledTimes(2));
    expect(f.history.mock.calls[1]).toEqual([item(2).id, 25, null]);
  });
  it('retains the selected deletion metadata during Restore and removes it after a fresh reload', async () => {
    const { f, session } = fixture(),
      row = item(1);
    f.trash
      .mockResolvedValueOnce({ items: [row], next_cursor: null })
      .mockResolvedValue({ items: [], next_cursor: null });
    render(<FamilyCollectionRecovery session={session} />);
    await click('Load deleted items');
    await click('Restore item');
    await screen.findByText('Original save confirmed.');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Restore item' })).toBeNull());
    expect(f.retainLifecycle).toHaveBeenCalledWith('restore', row.id, 'active', row);
  });
  it('keeps a stale selected deletion visible with a conflict and sends no execution', async () => {
    const { f, session } = fixture();
    f.trash.mockResolvedValue({ items: [item(1)], next_cursor: null });
    f.retainLifecycle.mockRejectedValue(new FamilyApiError(409, 'changed', 'Reload deleted records'));
    render(<FamilyCollectionRecovery session={session} />);
    await click('Load deleted items');
    await click('Restore item');
    await screen.findByText('Reload deleted records');
    expect(f.run).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Restore item' })).toBeDefined();
  });
  it.each([401, 403])(
    'clears protected pages and reports refused paging (%s), never successful empty state',
    async (status) => {
      const { f, session } = fixture();
      f.trash
        .mockResolvedValueOnce({ items: [item(1)], next_cursor: { before_deleted_at: at, before_id: item(1).id } })
        .mockRejectedValue(new FamilyApiError(status, 'denied', 'Recovery access refused'));
      render(<FamilyCollectionRecovery session={session} />);
      await click('Load deleted items');
      await click('More deleted records');
      await screen.findByText('Recovery access refused');
      expect(screen.queryByRole('button', { name: 'Restore item' })).toBeNull();
    }
  );
  it('does not replace a visible page with empty data after a transport failure', async () => {
    const { f, session } = fixture();
    f.trash
      .mockResolvedValueOnce({ items: [item(1)], next_cursor: { before_deleted_at: at, before_id: item(1).id } })
      .mockRejectedValue(Error('Page unavailable'));
    render(<FamilyCollectionRecovery session={session} />);
    await click('Load deleted items');
    await click('More deleted records');
    await screen.findByText('Page unavailable');
    expect(screen.getAllByRole('button', { name: 'Restore item' })).toHaveLength(1);
  });
  it('refuses duplicates across pages rather than silently deduplicating or replacing a selected row', async () => {
    const { f, session } = fixture(),
      page = { items: [item(1)], next_cursor: { before_deleted_at: at, before_id: item(1).id } };
    f.trash.mockResolvedValue(page);
    render(<FamilyCollectionRecovery session={session} />);
    await click('Load deleted items');
    await click('More deleted records');
    await screen.findByRole('status');
    expect(screen.getAllByRole('button', { name: 'Restore item' })).toHaveLength(1);
  });
  it.each(['resolve', 'reject'] as const)(
    'ignores an old pending read that later %s after a successful action',
    async (mode) => {
      const { f, session } = fixture(),
        slow = deferred<[]>();
      f.pending.mockReturnValueOnce(slow.promise).mockResolvedValue([]);
      render(<FamilyCollectionRecovery session={session} />);
      await click('Load deleted items');
      await waitFor(() => expect(f.pending).toHaveBeenCalledTimes(2));
      await act(async () => {
        if (mode === 'resolve') slow.resolve([]);
        else slow.reject(Error('Stale original read'));
      });
      expect(screen.queryByText('Original work is unavailable in this context.')).toBeNull();
    }
  );
  it.each(['resolve', 'reject'] as const)('a new Collection hides old pages and ignores old page %s', async (mode) => {
    const a = fixture(),
      b = fixture(),
      slow = deferred<{ items: ReturnType<typeof item>[]; next_cursor: null }>();
    a.f.trash.mockReturnValue(slow.promise);
    const ui = render(<FamilyCollectionRecovery session={a.session} />);
    await click('Load deleted items');
    ui.rerender(<FamilyCollectionRecovery session={b.session} />);
    await act(async () => {
      if (mode === 'resolve') slow.resolve({ items: [item(1)], next_cursor: null });
      else slow.reject(Error('Old page failed'));
    });
    expect(screen.queryByRole('button', { name: 'Restore item' })).toBeNull();
    expect(screen.queryByText('Old page failed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Load deleted items' })).not.toBeDisabled();
  });
  it('does not dispatch execution if its owner unmounts while Restore is retaining the original', async () => {
    const { f, session } = fixture(),
      slow = deferred<string>();
    f.trash.mockResolvedValue({ items: [item(1)], next_cursor: null });
    f.retainLifecycle.mockReturnValue(slow.promise);
    const ui = render(<FamilyCollectionRecovery session={session} />);
    await click('Load deleted items');
    await click('Restore item');
    ui.unmount();
    await act(async () => slow.resolve(cid(900)));
    expect(f.run).not.toHaveBeenCalled();
  });
  it('keeps the existing page when a response would exceed the recovery view bound', async () => {
    const { f, session } = fixture();
    f.trash
      .mockResolvedValueOnce({ items: [item(1)], next_cursor: { before_deleted_at: at, before_id: item(1).id } })
      .mockResolvedValueOnce({ items: Array.from({ length: 1000 }, (_, i) => item(i + 10)), next_cursor: null });
    render(<FamilyCollectionRecovery session={session} />);
    await click('Load deleted items');
    await click('More deleted records');
    await screen.findByText('The recovery view reached its record limit. Reload before continuing.');
    expect(screen.getAllByRole('button', { name: 'Restore item' })).toHaveLength(1);
  });
  it('a duplicate click starts only one Restore while the original is being retained', async () => {
    const { f, session } = fixture(),
      slow = deferred<string>();
    f.trash.mockResolvedValue({ items: [item(1)], next_cursor: null });
    f.retainLifecycle.mockReturnValue(slow.promise);
    render(<FamilyCollectionRecovery session={session} />);
    await click('Load deleted items');
    await click('Restore item');
    fireEvent.click(screen.getByRole('button', { name: 'Restore item' }));
    expect(f.retainLifecycle).toHaveBeenCalledTimes(1);
    await act(async () => slow.resolve(cid(900)));
  });
});
registerCollectionRecoveryLive();
