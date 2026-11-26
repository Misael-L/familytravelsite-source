import type { FamilyTripFile, FamilyTripFileLink } from '@family/backend/supabase/tripFiles';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlace, buildReservation } from '../../../tests/helpers/factories';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import api from '../../api/client';
import { AssignModal } from '../../components/Files/FileManagerAssignModal';
import { toggleFileLink, updateFileFields } from '../../components/Files/fileActions';
import type { FileManagerState } from '../../components/Files/useFileManager';
import { offlineDb } from '../../db/offlineDb';
import MFileLinkSheet from '../../mobile/screens/trip/tabs/MFileLinkSheet';
import { fileRepo } from '../../repo/fileRepo';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyFrontendRepository, familyReaders, type FamilySession } from './repository';
import * as familyRuntime from './runtime';
import { createFamilyAxiosAdapter } from './transport';

const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = id(4),
  fileId = id(5);
const originalAdapter = api.defaults.adapter;
const session: FamilySession = {
  userId: id(1),
  personId: id(2),
  familyId: id(3),
  user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: '2026-01-01' },
};

async function fixture(outcome: 'direct' | 'deny' = 'direct') {
  let nextLink = 10;
  let links: FamilyTripFileLink[] = [];
  const file: FamilyTripFile = {
    id: fileId,
    tripId: trip,
    storagePath: 'fixture/letter.pdf',
    originalName: 'letter.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12,
    uploadedBy: session.personId,
    starred: false,
    description: 'Retained note',
    deletedAt: null,
    createdAt: '2026-01-01',
    links: [],
  };
  const places = [
    { id: id(6), name: 'Museum' },
    { id: id(7), name: 'Garden' },
  ];
  const readers = {
    ...familyReaders,
    trips: {
      ...familyReaders.trips,
      fetchTripById: vi.fn(async () => ({
        id: trip,
        family_id: session.familyId,
        title: 'Fixture trip',
        description: null,
        start_date: '2026-01-01',
        end_date: '2026-01-02',
        cover_image: null,
        is_archived: 0,
        currency: 'EUR',
        reminder_days: 7,
        status: 'planned',
      })),
    },
    days: { ...familyReaders.days, listTripDays: vi.fn(async () => []) },
    notes: { ...familyReaders.notes, listDayNotes: vi.fn(async () => []) },
    schedule: { ...familyReaders.schedule, listScheduleItems: vi.fn(async () => []) },
    places: {
      ...familyReaders.places,
      listTripPlaces: vi.fn(async () =>
        places.map((place) => ({
          ...place,
          lat: null,
          lng: null,
          notes: null,
          timeZone: null,
          countryId: null,
          placeTypeId: null,
          isPrimary: false,
          imageUrl: null,
          familyPlaceCategoryId: null,
          familyPlaceCategoryName: null,
          familyPlaceCategoryColor: null,
          familyPlaceCategoryIcon: null,
        }))
      ),
    },
    reservations: {
      ...familyReaders.reservations,
      listTripBookings: vi.fn(async () => [
        {
          id: id(8),
          tripId: trip,
          type: 'restaurant' as const,
          status: 'confirmed' as const,
          title: 'Dinner',
          startTripDayId: null,
          endTripDayId: null,
          startsAt: null,
          endsAt: null,
          confirmationCode: null,
          notes: null,
          url: null,
          placeId: null,
          hotelId: null,
          scheduleItemId: null,
          metadata: {},
          sortOrder: 0,
          createdAt: '2026-01-01',
        },
      ]),
      listTripTransports: vi.fn(async () => []),
    },
    capabilities: { ...familyReaders.capabilities, canMutateTrip: vi.fn(async () => true) },
    permissions: {
      ...familyReaders.permissions,
      listTripActionOutcomes: vi.fn(async () => ({
        tripId: trip,
        familyId: session.familyId,
        outcomes: { 'trip.files.metadata': outcome },
      })),
    },
    files: {
      ...familyReaders.files,
      listTripFiles: vi.fn(async (tripId: string) => (tripId === trip ? [{ ...file, links: [...links] }] : [])),
      listTripFileLinks: vi.fn(async () => [...links]),
      addTripFileLink: vi.fn<typeof familyReaders.files.addTripFileLink>(async (fileId, target) => {
        links.push({
          id: id(nextLink++),
          fileId,
          placeId: target.placeId ?? null,
          reservationId: target.reservationId ?? null,
          tripDayId: target.tripDayId ?? null,
        });
      }),
      removeTripFileLink: vi.fn(async (linkId: string) => {
        links = links.filter((link) => link.id !== linkId);
      }),
    },
  };
  const repo = new FamilyFrontendRepository(
    async () => session,
    readers,
    () => ({ source: 'https://fixture.invalid', ...session })
  );
  const handle = vi.fn(createFamilyApplicationHandler(repo));
  api.defaults.adapter = createFamilyAxiosAdapter(handle);
  const views = await repo.views();
  const planner = buildPlanner({
    tripId: views.ids.register('trip', trip),
    places: places.map((place) => buildPlace({ id: views.ids.register('place', place.id), name: place.name })),
    reservations: [buildReservation({ id: views.ids.register('reservation', id(8)), title: 'Dinner' })],
  });
  const [nativeFile] = (await fileRepo.list(planner.tripId)).files;
  if (!nativeFile) throw new Error('missing fixture file');
  return { nativeFile, planner, handle, files: readers.files };
}

function LinkSurface({ kind, f }: { kind: 'desktop' | 'phone'; f: Awaited<ReturnType<typeof fixture>> }) {
  const [file, setFile] = useState(f.nativeFile);
  const { planner } = f;
  const refresh = async () => {
    const [fresh] = (await fileRepo.list(planner.tripId)).files;
    if (!fresh) throw new Error('missing refreshed fixture file');
    setFile(fresh);
  };
  if (kind === 'phone') {
    return (
      <MFileLinkSheet
        file={file}
        onClose={() => {}}
        planner={{
          ...planner,
          tripActions: { ...planner.tripActions, loadFiles: refresh },
        }}
      />
    );
  }
  const state = {
    ...planner,
    files: [file],
    assignFileId: file.id,
    setAssignFileId: () => {},
    assignments: {},
    handleAssign: (id: number, data: Parameters<typeof fileRepo.update>[2]) =>
      updateFileFields(planner.tripId, id, data, { t: planner.t, toast: planner.toast, refresh }),
    refreshFiles: refresh,
  } as unknown as FileManagerState;
  return <AssignModal {...state} />;
}

beforeEach(async () => {
  vi.spyOn(familyRuntime, 'isFamilyFrontendActive').mockReturnValue(true);
  await resetOfflineTestDatabase();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
});

afterEach(async () => {
  api.defaults.adapter = originalAdapter;
  setAuthed(false);
  _resetNetworkMode();
  await resetOfflineTestDatabase();
  vi.restoreAllMocks();
});

describe('Family native file links', () => {
  it.each(['desktop', 'phone'] as const)('%s assigns and removes place and reservation records', async (kind) => {
    const f = await fixture();
    render(<LinkSurface kind={kind} f={f} />);
    for (const label of ['Museum', 'Garden', 'Dinner', 'Museum', 'Dinner']) {
      const button = screen.getByRole('button', { name: label });
      const linked = button.querySelector('.lucide-check') !== null;
      fireEvent.click(button);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: label }).querySelector('.lucide-check') !== null).toBe(!linked);
        expect(screen.getByRole('button', { name: label })).toBeEnabled();
      });
    }
    expect(f.handle.mock.calls.filter(([req]) => req.method === 'PUT')).toEqual([]);
    expect(f.files.addTripFileLink.mock.calls).toEqual([
      [fileId, { placeId: id(6), reservationId: null, tripDayId: null }],
      [fileId, { placeId: id(7), reservationId: null, tripDayId: null }],
      [fileId, { placeId: null, reservationId: id(8), tripDayId: null }],
    ]);
    expect(f.files.removeTripFileLink.mock.calls).toEqual([[id(10)], [id(12)]]);
    const [file] = (await fileRepo.list(f.planner.tripId)).files;
    expect(file).toMatchObject({
      description: 'Retained note',
      place_id: null,
      reservation_id: null,
      linked_place_ids: [f.planner.places[1].id],
      linked_reservation_ids: [],
    });
  });

  it('requires current file metadata permission', async () => {
    const f = await fixture('deny');
    await expect(
      toggleFileLink(f.planner.tripId, f.nativeFile, 'place_id', f.planner.places[0].id)
    ).rejects.toMatchObject({ response: { status: 403, data: { code: 'action_denied' } } });
    expect(f.files.addTripFileLink).not.toHaveBeenCalled();
  });

  it('retains the first link record under the existing Family queue hold', async () => {
    const f = await fixture();
    const target = f.planner.places[0].id;
    const link = `/trips/${f.planner.tripId}/files/${f.nativeFile.id}/link`;
    setForcedOffline(true);
    await toggleFileLink(f.planner.tripId, f.nativeFile, 'place_id', target);

    expect(await offlineDb.mutationQueue.toArray()).toMatchObject([
      { method: 'POST', url: link, body: { place_id: target }, entityId: f.nativeFile.id },
    ]);
    const cached = await offlineDb.tripFiles.get(f.nativeFile.id);
    expect(cached).toMatchObject({ place_id: null, linked_place_ids: [target] });
    if (!cached) throw new Error('missing locally linked file');
    await expect(toggleFileLink(f.planner.tripId, cached, 'place_id', target)).rejects.toThrow(
      'files.linkNeedsConnection'
    );
    expect(f.files.addTripFileLink).not.toHaveBeenCalled();

    setForcedOffline(false);
    await mutationQueue.flush();
    expect(f.files.addTripFileLink).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.toArray()).toMatchObject([
      {
        method: 'POST',
        url: link,
        body: { place_id: target },
        entityId: f.nativeFile.id,
        status: 'conflict',
        recoveryHold: { reason: 'unscoped-native', originalStatus: 'pending', released: false },
      },
    ]);
  });
});
