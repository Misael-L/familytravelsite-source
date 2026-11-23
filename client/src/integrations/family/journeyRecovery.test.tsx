import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { familyRepositoryFixture } from '../../../tests/helpers/familyRepository';
import api from '../../api/client';
import { useJourneyStore } from '../../store/journeyStore';
import { FamilyJourneyRecovery } from './FamilyJourneyRecovery';
import { FamilyIdentityRegistry } from './identity';
import { handleFamilyJourney } from './journeyHandler';
import type { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, locale: 'en' }) }));

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const family = uuid(1),
  journey = uuid(2),
  entryId = uuid(3),
  person = uuid(4);
let ids: FamilyIdentityRegistry;
let client: ReturnType<typeof axios.create>;
let deleted: boolean;
let revision: number;
let story: string;
let denied: boolean;
const originalAdapter = api.defaults.adapter;
function raw() {
  return {
    id: journey,
    family_id: family,
    owner_person_id: person,
    title: 'Journal',
    status: 'active',
    my_role: 'owner',
    entry_recovery_version: 1,
    stats: { entries: deleted ? 0 : 1, photos: 0, places: 0 },
    gallery: [],
    trips: [],
    contributors: [],
    entries: deleted
      ? []
      : [
          {
            id: entryId,
            journey_id: journey,
            author_person_id: person,
            kind: 'entry',
            title: 'Memory',
            story,
            entry_date: '2026-11-04',
            revision,
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
  revision = 1;
  story = 'Original story';
  denied = false;
  ids = new FamilyIdentityRegistry(family);
  const repo = familyRepositoryFixture(family, () => ids, {}) as unknown as FamilyFrontendRepository;
  boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (denied) return { data: null, error: { code: '42501', message: 'Recovery denied' } };
    if (name === 'get_family_journey') return { data: raw(), error: null };
    if (name === 'delete_family_journey_entry') {
      deleted = true;
      revision += 1;
      return { data: raw(), error: null };
    }
    if (name === 'list_family_journey_entry_trash')
      return {
        data: {
          entries: deleted
            ? [{ id: entryId, title: 'Memory', entry_date: '2026-11-04', revision, deleted_at: '2026-11-04T10:00:00Z' }]
            : [],
        },
        error: null,
      };
    if (name === 'list_family_journey_entry_versions')
      return {
        data: {
          entry_id: entryId,
          current_revision: revision,
          versions: [
            { revision: 1, title: 'Memory', story: 'Original story', recorded_at: '2026-11-04', deleted_at: null },
          ],
        },
        error: null,
      };
    if (name === 'restore_family_journey_entry' || name === 'restore_family_journey_entry_version') {
      if (args.p_expected_revision !== revision)
        return { data: null, error: { code: '40001', message: 'Reload before restoring' } };
      deleted = false;
      revision += 1;
      if (name.endsWith('_version')) story = 'Original story';
      return { data: raw(), error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  const adapter = createFamilyAxiosAdapter((request) => handleFamilyJourney(repo, request));
  client = axios.create({ adapter });
  api.defaults.adapter = adapter;
  useJourneyStore.setState({ current: null, loading: false });
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.clearAllMocks();
});

describe('Family Journey recovery through real HTTP handler and RPC adapter', () => {
  it('deletes, lists Trash, restores and reloads with the same media/entry identity mapping', async () => {
    const key = ids.register('journey', journey);
    const initial = (await client.get(`/journeys/${key}`)).data;
    const entryKey = initial.entries[0].id;
    await client.delete(`/journeys/entries/${entryKey}`);
    expect((await client.get(`/journeys/${key}`)).data.entries).toEqual([]);
    const trash = (await client.get(`/journeys/${key}/recovery`)).data.entries[0];
    expect(trash.id).toBe(entryKey);
    await client.post(`/journeys/entries/${trash.id}/restore`, { expected_revision: trash.revision });
    expect((await client.get(`/journeys/${key}`)).data.entries[0].id).toBe(entryKey);
    expect(boundary.rpc).toHaveBeenCalledWith('restore_family_journey_entry', {
      p_entry_id: entryId,
      p_expected_revision: 2,
    });
  });
  it('returns real conflicts/denials and rejects malformed revisions before a save', async () => {
    const key = ids.register('journeyEntry', entryId);
    await expect(client.post(`/journeys/entries/${key}/restore`, { expected_revision: 0 })).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(boundary.rpc).not.toHaveBeenCalled();
    const journeyKey = ids.register('journey', journey);
    await expect(client.get(`/journeys/${journeyKey}/recovery`, { params: { before_id: key } })).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(boundary.rpc).not.toHaveBeenCalled();
    await expect(client.post(`/journeys/entries/${key}/restore`, { expected_revision: 10 })).rejects.toMatchObject({
      response: { status: 409 },
    });
    denied = true;
    await expect(client.get(`/journeys/entries/${key}/history`)).rejects.toMatchObject({ response: { status: 403 } });
  });
  it('restores history with canonical UUID and expected revision, not a fabricated successful response', async () => {
    const key = ids.register('journeyEntry', entryId);
    revision = 3;
    story = 'Accidental overwrite';
    const history = (await client.get(`/journeys/entries/${key}/history`)).data;
    expect(history.entry_id).toBe(key);
    await client.post(`/journeys/entries/${key}/restore-version`, {
      revision: 1,
      expected_revision: history.current_revision,
    });
    expect(story).toBe('Original story');
    expect(boundary.rpc).toHaveBeenCalledWith('restore_family_journey_entry_version', {
      p_entry_id: entryId,
      p_revision: 1,
      p_expected_revision: 3,
    });
  });
  it('runs the actual recovery dialog restore control and native store reload', async () => {
    const key = ids.register('journey', journey);
    const entryKey = ids.register('journeyEntry', entryId);
    await client.delete(`/journeys/entries/${entryKey}`);
    await useJourneyStore.getState().loadJourney(key);
    render(
      <MemoryRouter initialEntries={[`/journey/${key}`]}>
        <Routes>
          <Route path="/journey/:id" element={<FamilyJourneyRecovery />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Journal recovery' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore entry' }));
    await waitFor(() => expect(useJourneyStore.getState().current?.entries[0].id).toBe(entryKey));
    await screen.findByText('No deleted entries.');
  });
  it('preserves cursor identities through the real HTTP/RPC boundary', async () => {
    const key = ids.register('journey', journey),
      entryKey = ids.register('journeyEntry', entryId);
    await client.get(`/journeys/${key}/recovery`, {
      params: { before_id: entryKey, before_deleted_at: '2026-11-04T10:00:00Z' },
    });
    expect(boundary.rpc).toHaveBeenCalledWith('list_family_journey_entry_trash', {
      p_journey_id: journey,
      p_before_entry_id: entryId,
      p_before_deleted_at: '2026-11-04T10:00:00Z',
    });
    await client.get(`/journeys/entries/${entryKey}/history`, { params: { before_revision: 3 } });
    expect(boundary.rpc).toHaveBeenCalledWith('list_family_journey_entry_versions', {
      p_entry_id: entryId,
      p_before_revision: 3,
    });
  });
  it('hides recovery until the database advertises the migration capability', async () => {
    const key = ids.register('journey', journey);
    await useJourneyStore.getState().loadJourney(key);
    useJourneyStore.setState((s) => ({
      current: s.current ? Object.assign({}, s.current, { entry_recovery_version: 0 }) : null,
    }));
    render(
      <MemoryRouter initialEntries={[`/journey/${key}`]}>
        <Routes>
          <Route path="/journey/:id" element={<FamilyJourneyRecovery />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Journal recovery' })).toBeNull();
  });
  it('does not offer recovery controls to a viewer', async () => {
    const key = ids.register('journey', journey);
    await useJourneyStore.getState().loadJourney(key);
    useJourneyStore.setState((s) => ({ current: s.current ? { ...s.current, my_role: 'viewer' } : null }));
    render(
      <MemoryRouter initialEntries={[`/journey/${key}`]}>
        <Routes>
          <Route path="/journey/:id" element={<FamilyJourneyRecovery />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Journal recovery' })).toBeNull();
  });
});
