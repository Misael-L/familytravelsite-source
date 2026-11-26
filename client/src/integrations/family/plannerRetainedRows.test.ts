import { beforeEach, describe, expect, it } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { MUTATION_SCHEMA_VERSION, offlineDb, type QueuedMutation } from '../../db/offlineDb';
import { captureWriteSession } from '../../sync/writeSession';
import { parkArrangementRefusal, retainArrangementIntent } from './arrangementIntentQueue';
import { parkCreationRefusal, retainCreationIntent, type CreationOwner } from './creationIntentQueue';
import { parkEditorRefusal, retainEditorIntent } from './editorIntentQueue';
import { FamilyApiError } from './errors';
import { arrangementPacket } from './plannerArrangementContract';
import { creationPacket } from './plannerCreationContract';
import { editorPacket } from './plannerEditorContract';

const id = (number: number) => `d0400000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const nativeTrip = 7;
const scope = {
  version: 1,
  trip_id: id(1),
  user_id: id(2),
  person_id: id(3),
  family_id: id(4),
  layer: 'published',
};
const packetFields = { version: 1, operation_id: id(5), source_url: 'https://fixture.example.invalid' };
const locationId = id(6);
const creation = creationPacket.parse({
  ...packetFields,
  scope,
  form: {
    location: { id: locationId, revision: 1 },
    day: null,
    clocks: { start: null, end: null },
    visit_notes: 'Keep the original note',
  },
});
const arrangement = arrangementPacket.parse({
  ...packetFields,
  scope,
  plan: {
    version: 1,
    action: 'reorder',
    visit: null,
    days: [{ id: id(7), civil_day: '2027-04-01', observed: [{ id: id(8), revision: 1 }], order: [id(8)] }],
  },
});
const values = {
  name: 'Fixture',
  description: null,
  notes: null,
  address: null,
  website: null,
  phone: null,
  latitude: 19.05,
  longitude: -98.2,
  family_place_category_id: null,
};
const editor = editorPacket.parse({
  ...packetFields,
  kind: 'location',
  target_id: locationId,
  request: {
    operation_id: packetFields.operation_id,
    observation: { ...scope, location_id: locationId, revision: 1, draft: null, published: values, shown: values },
    form: { ...values, notes: 'Keep the original edit' },
  },
});

function queueCase<Packet>(
  name: string,
  route: string,
  refusalMessage: string,
  packet: Packet,
  retain: (owner: CreationOwner, packet: Packet, native: number) => Promise<QueuedMutation>,
  park: (owner: CreationOwner, packet: Packet, native: number, row: QueuedMutation, error: unknown) => Promise<void>
) {
  return {
    name,
    route,
    refusalMessage,
    packet,
    retain: (owner: CreationOwner) => retain(owner, packet, nativeTrip),
    park: (owner: CreationOwner, row: QueuedMutation, error: unknown) => park(owner, packet, nativeTrip, row, error),
  };
}

const queues = [
  queueCase(
    'creation',
    'planner-create-command',
    'Original place save refused; retained intact.',
    creation,
    retainCreationIntent,
    parkCreationRefusal
  ),
  queueCase(
    'arrangement',
    'planner-arrange-command',
    'Original arrangement refused; retained intact.',
    arrangement,
    retainArrangementIntent,
    parkArrangementRefusal
  ),
  queueCase(
    'edit',
    'planner-editor-command',
    'Original edit refused; retained intact.',
    editor,
    retainEditorIntent,
    parkEditorRefusal
  ),
];

function otherTripRow(createdAt: number): QueuedMutation {
  return {
    id: id(9),
    tripId: 8,
    method: 'PATCH',
    url: '/trips/8/places/1',
    body: { notes: 'Another trip' },
    createdAt,
    status: 'pending',
    attempts: 0,
    lastError: null,
    schemaVersion: MUTATION_SCHEMA_VERSION,
  };
}

beforeEach(resetOfflineTestDatabase);

describe.each(queues)('$name retained planner row', ({ name, route, refusalMessage, packet, retain, park }) => {
  it('clones the exact packet and queues it after an unrelated future row', async () => {
    const older = otherTripRow(Date.now() + 60_000);
    await offlineDb.mutationQueue.add(older);
    const owner = captureWriteSession();
    const saved = await retain(owner);
    expect(saved).toEqual({
      id: packetFields.operation_id,
      tripId: nativeTrip,
      method: 'POST',
      url: `/trips/${scope.trip_id}/family/${route}`,
      body: packet,
      retentionPolicy: 'family-original-v1',
      status: 'pending',
      attempts: 0,
      lastError: null,
      schemaVersion: MUTATION_SCHEMA_VERSION,
      buildVersion: typeof __TREK_UI_VERSION__ === 'string' ? __TREK_UI_VERSION__ : '',
      createdAt: older.createdAt + 1,
    });
    expect(saved.body).not.toBe(packet);
    expect(await offlineDb.mutationQueue.get(saved.id)).toEqual(saved);
    expect(await offlineDb.mutationQueue.get(older.id)).toEqual(older);
  });

  it('retains the full original across a refusal and another attempt to retain it', async () => {
    const before = Date.now();
    const owner = captureWriteSession();
    const saved = await retain(owner);
    expect(saved.createdAt).toBeGreaterThanOrEqual(before);
    expect(saved.createdAt).toBeLessThanOrEqual(Date.now());
    await park(owner, saved, new FamilyApiError(409, 'fixture_conflict', 'Fixture conflict'));
    const parked = { ...saved, status: 'conflict', lastError: refusalMessage };
    const retained = await retain(owner);
    expect(retained).toEqual(parked);
    expect(await offlineDb.mutationQueue.toArray()).toEqual([parked]);
  });

  it('preserves the domain policy for an unrelated finite fractional timestamp', async () => {
    const older = otherTripRow(Date.now() + 60_000 + 0.5);
    await offlineDb.mutationQueue.add(older);
    const owner = captureWriteSession();
    if (name === 'creation') {
      const saved = await retain(owner);
      expect(saved.createdAt).toBe(older.createdAt + 1);
    } else {
      await expect(retain(owner)).rejects.toMatchObject({
        code: name === 'edit' ? 'editor_original_changed' : 'arrangement_original_changed',
      });
      expect(await offlineDb.mutationQueue.toArray()).toEqual([older]);
    }
    expect(await offlineDb.mutationQueue.get(older.id)).toEqual(older);
  });
});
