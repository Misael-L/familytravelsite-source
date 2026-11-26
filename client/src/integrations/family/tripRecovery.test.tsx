import { fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { familyRepositoryFixture } from '../../../tests/helpers/familyRepository';
import api from '../../api/client';
import { offlineDb, upsertTrip } from '../../db/offlineDb';
import type { Trip } from '../../types';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyAggregateTrash, FamilyTripTrash } from './FamilyAggregateTrash';
import { FamilyIdentityRegistry } from './identity';
import type { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const boundary = vi.hoisted(() => ({ rpc: vi.fn(), limited: false }));
vi.mock('./runtime', () => ({ isFamilyFrontendActive: () => true }));
vi.mock('./coreHttpsPlannerPackingProfile', () => ({
  coreHttpsPlannerPackingProfileEnabled: () => boundary.limited,
  coreHttpsCombinedProfileEnabled: () => boundary.limited,
}));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, locale: 'en' }) }));
const family = '30000000-0000-4000-8000-000000000001',
  trip = '30000000-0000-4000-8000-000000000002';
let ids: FamilyIdentityRegistry, client: ReturnType<typeof axios.create>, deleted: boolean, revision: number;
let failure: { code: string; message: string } | null;
const invalidated = vi.fn(),
  originalAdapter = api.defaults.adapter;
beforeEach(async () => {
  boundary.limited = false;
  deleted = false;
  revision = 3;
  failure = null;
  ids = new FamilyIdentityRegistry(family);
  invalidated.mockClear();
  await offlineDb.trips.clear();
  await offlineDb.mutationQueue.clear();
  boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (failure) return { data: null, error: failure };
    if (name === 'trash_family_trip') {
      if (!deleted) revision++;
      deleted = true;
      return { data: { ok: true, id: trip, revision }, error: null };
    }
    if (name === 'restore_family_trip') {
      if (args.p_expected_revision !== revision)
        return { data: null, error: { code: '40001', message: 'Reload before restoring' } };
      deleted = false;
      revision++;
      return { data: { ok: true, id: trip, revision }, error: null };
    }
    if (name === 'list_family_trip_trash')
      return {
        data: {
          trip_recovery_version: 1,
          trips: deleted
            ? [{ id: trip, name: 'Preserved trip', revision, deleted_at: '2026-11-04T12:00:00Z', archived_at: null }]
            : [],
          has_more: false,
          next_cursor: null,
        },
        error: null,
      };
    throw new Error('Unexpected RPC ' + name);
  });
  const repo = familyRepositoryFixture(family, () => ids, {
    tripUuid: async (id: string | number) => ids.uuid('trip', id),
    invalidate: invalidated,
  }) as unknown as FamilyFrontendRepository;
  const adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));
  client = axios.create({ adapter });
  api.defaults.adapter = adapter;
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.clearAllMocks();
});
describe('Trip lifecycle through full Family application dispatcher, native cache and actual recovery control', () => {
  it('connects native DELETE, preserves queued edits and restores through the shared control', async () => {
    const key = ids.register('trip', trip);
    await upsertTrip({ id: key, title: 'Preserved trip' } as Trip);
    await offlineDb.mutationQueue.put({
      id: 'kept-offline-edit',
      tripId: key,
      method: 'PUT',
      url: `/trips/${key}`,
      body: { title: 'Unsynced' },
      createdAt: 1,
      status: 'pending',
      attempts: 0,
      lastError: null,
    });
    await client.delete(`/trips/${key}`);
    await client.delete(`/trips/${key}`);
    expect(deleted).toBe(true);
    expect(await offlineDb.trips.get(key)).toBeUndefined();
    expect(await offlineDb.mutationQueue.get('kept-offline-edit')).toBeDefined();
    const reloaded = vi.fn(async () => {});
    render(<FamilyTripTrash onRestored={reloaded} className="trip-list-tool" />);
    const trash = await screen.findByRole('button', { name: 'dashboard.title · files.trash' });
    expect(trash).toHaveClass('trip-list-tool');
    expect(trash).not.toHaveClass('fixed');
    fireEvent.click(trash);
    await screen.findByText('Preserved trip');
    fireEvent.click(screen.getByRole('button', { name: 'files.restore' }));
    await screen.findByText('files.trashEmpty');
    expect(deleted).toBe(false);
    expect(reloaded).toHaveBeenCalledTimes(1);
    expect(boundary.rpc).toHaveBeenCalledWith('restore_family_trip', { p_trip_id: trip, p_expected_revision: 4 });
    expect(invalidated).toHaveBeenCalledWith(trip);
  });
  it.each(['42501', '40001'])('keeps data/cache intact on denied/conflicting delete %s', async (code) => {
    const key = ids.register('trip', trip);
    await upsertTrip({ id: key, title: 'Preserved trip' } as Trip);
    failure = { code, message: 'Trip denied or changed' };
    await expect(client.delete(`/trips/${key}`)).rejects.toMatchObject({
      response: { status: code === '42501' ? 403 : 409 },
    });
    expect(await offlineDb.trips.get(key)).toBeDefined();
    expect(invalidated).not.toHaveBeenCalled();
    expect(deleted).toBe(false);
  });
  it('validates paired cursors and revisions before RPC, including stable ID mapping', async () => {
    const key = ids.register('trip', trip);
    await expect(client.get('/trips/recovery?before_id=' + key)).rejects.toMatchObject({ response: { status: 400 } });
    await expect(client.post(`/trips/${key}/restore`, { expected_revision: 0 })).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(boundary.rpc).not.toHaveBeenCalled();
    await client.get('/trips/recovery', { params: { before_id: key, before_deleted_at: '2026-11-04T12:00:00Z' } });
    expect(boundary.rpc).toHaveBeenLastCalledWith('list_family_trip_trash', {
      p_family_id: family,
      p_before_trip_id: trip,
      p_before_deleted_at: '2026-11-04T12:00:00Z',
    });
  });
  it('hides recovery only for the explicitly missing new RPC', async () => {
    failure = { code: 'PGRST202', message: 'Could not find public.list_family_trip_trash' };
    const result = await client.get('/trips/recovery');
    expect(result.data.available).toBe(false);
    failure = { code: '42501', message: 'Membership changed' };
    await expect(client.get('/trips/recovery')).rejects.toMatchObject({ response: { status: 403 } });
  });
  it('omits the shortcut in the limited profile where trip recovery is unavailable', () => {
    boundary.limited = true;
    render(<FamilyTripTrash onRestored={async () => {}} className="trip-list-tool" />);
    expect(screen.queryByRole('button', { name: 'dashboard.title · files.trash' })).not.toBeInTheDocument();
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it('retains Trash and shows the actual restore conflict', async () => {
    deleted = true;
    render(<FamilyAggregateTrash domain="trips" onRestored={async () => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'dashboard.title · files.trash' }));
    await screen.findByText('Preserved trip');
    failure = { code: '40001', message: 'Trip changed; reload' };
    fireEvent.click(screen.getByRole('button', { name: 'files.restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Trip changed; reload');
    expect(deleted).toBe(true);
  });
});
