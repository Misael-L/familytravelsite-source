import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { familyRepositoryFixture } from '../../../tests/helpers/familyRepository';
import api from '../../api/client';
import { useJourneyStore } from '../../store/journeyStore';
import { FamilyJourneyTrash } from './FamilyJourneyTrash';
import { FamilyIdentityRegistry } from './identity';
import { handleFamilyJourney } from './journeyHandler';
import type { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, locale: 'en' }) }));
const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const family = uuid(1),
  journey = uuid(2),
  entry = uuid(3),
  person = uuid(4);
let ids: FamilyIdentityRegistry;
let client: ReturnType<typeof axios.create>;
let deleted: boolean;
let revision: number;
let failure: { code: string; message: string } | null;
const originalAdapter = api.defaults.adapter;
function raw() {
  return {
    id: journey,
    family_id: family,
    owner_person_id: person,
    title: 'Retained Journey',
    status: 'active',
    revision,
    my_role: 'owner',
    aggregate_recovery_version: 1,
    entry_recovery_version: 1,
    stats: { entries: 1, photos: 0, places: 0 },
    gallery: [],
    trips: [],
    contributors: [],
    entries: [
      {
        id: entry,
        journey_id: journey,
        author_person_id: person,
        kind: 'entry',
        title: 'Original memory',
        story: 'Original text',
        entry_date: '2026-11-04',
        tags: [],
        pros: [],
        cons: [],
        photos: [],
      },
    ],
  };
}
beforeEach(() => {
  deleted = false;
  revision = 5;
  failure = null;
  ids = new FamilyIdentityRegistry(family);
  const repo = familyRepositoryFixture(family, () => ids, {}) as unknown as FamilyFrontendRepository;
  boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'list_family_journeys') return { data: { journeys: deleted ? [] : [raw()] }, error: null };
    if (name === 'get_family_journey')
      return deleted
        ? { data: null, error: { code: '42501', message: 'Active detail is unavailable' } }
        : { data: raw(), error: null };
    if (name === 'delete_family_journey') {
      if (!deleted) revision += 1;
      deleted = true;
      return { data: { ok: true, id: journey, revision }, error: null };
    }
    if (failure) return { data: null, error: failure };
    if (name === 'list_family_journey_trash')
      return {
        data: {
          aggregate_recovery_version: 1,
          journeys: deleted
            ? [{ id: journey, title: 'Retained Journey', subtitle: null, revision, deleted_at: '2026-11-04T10:00:00Z' }]
            : [],
          has_more: false,
          next_cursor: null,
        },
        error: null,
      };
    if (name === 'restore_family_journey') {
      if (args.p_expected_revision !== revision)
        return { data: null, error: { code: '40001', message: 'Reload before restoring' } };
      deleted = false;
      revision += 1;
      return { data: raw(), error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const adapter = createFamilyAxiosAdapter((request) => handleFamilyJourney(repo, request));
  client = axios.create({ adapter });
  api.defaults.adapter = adapter;
  useJourneyStore.setState({ journeys: [], current: null, loading: false });
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.clearAllMocks();
});

describe('whole-Journey native store / actual handler / recovery control', () => {
  it('trashes through native Delete, retries without active prefetch, then restores through the control and reloads', async () => {
    const store = useJourneyStore.getState();
    await store.loadJourneys();
    const key = useJourneyStore.getState().journeys[0].id;
    const before = (await client.get(`/journeys/${key}`)).data;
    await store.deleteJourney(key);
    await store.deleteJourney(key);
    expect(useJourneyStore.getState().journeys).toEqual([]);
    render(<FamilyJourneyTrash />);
    fireEvent.click(await screen.findByRole('button', { name: 'journey.title · files.trash' }));
    await screen.findByText('Retained Journey');
    fireEvent.click(screen.getByRole('button', { name: 'files.restore' }));
    await waitFor(() => expect(useJourneyStore.getState().journeys).toHaveLength(1));
    expect(useJourneyStore.getState().journeys[0].id).toBe(key);
    const after = (await client.get(`/journeys/${key}`)).data;
    expect(after.entries).toEqual(before.entries);
    await screen.findByText('files.trashEmpty');
    expect(boundary.rpc).toHaveBeenCalledWith('restore_family_journey', {
      p_journey_id: journey,
      p_expected_revision: 6,
    });
  });

  it.each(['42501', '40001'])('keeps Trash visible when Restore returns %s', async (code) => {
    deleted = true;
    render(<FamilyJourneyTrash />);
    fireEvent.click(await screen.findByRole('button', { name: 'journey.title · files.trash' }));
    await screen.findByText('Retained Journey');
    failure = { code, message: 'Restore denied or changed' };
    fireEvent.click(screen.getByRole('button', { name: 'files.restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Restore denied or changed');
    expect(deleted).toBe(true);
    expect(screen.getByText('Retained Journey')).toBeInTheDocument();
  });

  it('hides the new control on the precisely identified older-backend missing RPC', async () => {
    failure = { code: 'PGRST202', message: 'Could not find public.list_family_journey_trash' };
    render(<FamilyJourneyTrash />);
    await waitFor(() => expect(boundary.rpc).toHaveBeenCalled());
    expect(await client.get('/journeys/recovery').then((r) => r.data.available)).toBe(false);
    expect(screen.queryByRole('button', { name: 'journey.title · files.trash' })).toBeNull();
  });

  it('reports access/network failure instead of presenting successful empty Trash', async () => {
    failure = { code: '42501', message: 'Current session denied' };
    render(<FamilyJourneyTrash />);
    fireEvent.click(await screen.findByRole('button', { name: 'journey.title · files.trash' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Current session denied');
    expect(screen.queryByText('files.trashEmpty')).toBeNull();
  });

  it('validates cursors/revisions and maps paginated Journey IDs at the real boundary', async () => {
    const key = ids.register('journey', journey);
    await expect(client.get('/journeys/recovery?before_id=' + key)).rejects.toMatchObject({
      response: { status: 400 },
    });
    await expect(client.post(`/journeys/${key}/restore`, { expected_revision: 0 })).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(boundary.rpc).not.toHaveBeenCalled();
    deleted = true;
    await client.get('/journeys/recovery', { params: { before_id: key, before_deleted_at: '2026-11-04T10:00:00Z' } });
    expect(boundary.rpc).toHaveBeenLastCalledWith('list_family_journey_trash', {
      p_family_id: family,
      p_before_journey_id: journey,
      p_before_deleted_at: '2026-11-04T10:00:00Z',
    });
  });
});
