import { describe, expect, it } from 'vitest';
import {
  completeId,
  completeScope,
  completeSource,
  completeTripCaptureFixture,
  completeTripData,
} from '../../../tests/helpers/familyCompleteTrip';
import {
  canonicalTripJson,
  parseCompleteTrip,
  serializeCompleteTrip,
  type CompleteTripData,
} from './completeTripSnapshot';
const expected = (capture = completeTripCaptureFixture()) => ({
  source: capture.source,
  scope: capture.scope,
  ownership: capture.ownership,
  now: capture.capturedAt,
});
describe('complete canonical Trip envelope', () => {
  it('round trips repeated visits, an undecided time, genuine midnight, microseconds, personal notes and private packing', async () => {
    const capture = completeTripCaptureFixture(),
      envelope = await serializeCompleteTrip(capture);
    const result = await parseCompleteTrip(JSON.stringify(envelope), expected(capture));
    expect(result.data).toEqual(capture.data);
    expect(result.data.planner.view.state.visits.map((v) => v.start_local)).toEqual([
      null,
      '2027-04-02T00:00:00.123456',
    ]);
    expect(result.data.planner.view.state.locations[0].source).toEqual({ kind: 'food', id: completeId(6) });
    expect(result.media.every((m) => !m.bytesAvailable)).toBe(true);
    expect(result.capabilities).toEqual({ coldRead: false, writes: false, tags: false, mediaBytes: false });
    expect(result.bindings.some((b) => b.kind === 'packingBag')).toBe(true);
  });
  it('accepts complete successful empty resources independently from an absent required component', async () => {
    const capture = completeTripCaptureFixture(),
      data = completeTripData();
    data.companions = {
      expenses: [],
      shares: [],
      payers: [],
      files: [],
      links: [],
      members: [],
      categories: [],
      tags: [],
    };
    await expect(serializeCompleteTrip({ ...capture, data })).resolves.toBeDefined();
    await expect(serializeCompleteTrip({ ...capture, data: { ...data, companions: undefined } })).rejects.toThrow();
  });
  it.each(['format', 'digest', 'bindings', 'manifests', 'media', 'revisions', 'capturedAt', 'expiresAt'])(
    'rejects corrupted %s without relabeling it complete',
    async (field) => {
      const envelope = await serializeCompleteTrip(completeTripCaptureFixture());
      const changed = { ...envelope, [field]: field === 'digest' ? '0'.repeat(64) : null };
      await expect(parseCompleteTrip(changed, expected())).rejects.toThrow();
    }
  );
  it.each(['source', 'user_id', 'family_id', 'person_id', 'trip_id', 'layer', 'ownerGeneration', 'tripGeneration'])(
    'rejects the wrong original %s',
    async (field) => {
      const envelope = await serializeCompleteTrip(completeTripCaptureFixture()),
        e = expected();
      if (field === 'source') e.source = 'https://other.fixture.invalid';
      else if (field === 'ownerGeneration' || field === 'tripGeneration') e.ownership[field] = completeId(99);
      else e.scope = { ...e.scope, [field]: field === 'layer' ? 'myDraft' : completeId(99) };
      await expect(parseCompleteTrip(envelope, e)).rejects.toThrow();
    }
  );
  it('rejects unknown reversible identities even with a newly computed envelope digest', async () => {
    const envelope = await serializeCompleteTrip(completeTripCaptureFixture());
    envelope.bindings.push({ kind: 'place', uuid: completeId(99), key: 1234 });
    const { digest: _digest, ...body } = envelope;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalTripJson(body)));
    envelope.digest = Array.from(new Uint8Array(hash))
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
    await expect(parseCompleteTrip(envelope, expected())).rejects.toThrow('manifest');
  });
  it('never extends expiry on parse and refuses expired or future captures', async () => {
    const envelope = await serializeCompleteTrip(completeTripCaptureFixture());
    expect((await parseCompleteTrip(envelope, { ...expected(), now: 1000001 })).expiresAt).toBe(1900000);
    await expect(parseCompleteTrip(envelope, { ...expected(), now: 1900001 })).rejects.toThrow();
    await expect(parseCompleteTrip(envelope, { ...expected(), now: 999999 })).rejects.toThrow();
  });
  const mutations: [string, (d: CompleteTripData) => void][] = [
    [
      'impossible civil date',
      (d) => {
        d.planner.view.state.days[0].civil_day = '2027-02-30';
      },
    ],
    [
      'invalid named zone',
      (d) => {
        d.planner.view.state.locations[0].time_zone = 'Unknown/Zone';
      },
    ],
    [
      'invalid midnight clock',
      (d) => {
        d.planner.view.state.visits[1].start_local = '2027-04-02T24:99:00';
      },
    ],
    [
      'calendar revision',
      (d) => {
        d.booking.trip_revision++;
      },
    ],
    [
      'lifecycle revision',
      (d) => {
        d.tasks.scope.trip_lifecycle_revision++;
      },
    ],
    [
      'foreign task',
      (d) => {
        d.tasks.tasks[0].trip_id = completeId(99);
      },
    ],
    [
      'duplicate visit',
      (d) => {
        d.planner.view.state.visits.push(d.planner.view.state.visits[0]);
      },
    ],
    [
      'foreign file',
      (d) => {
        d.companions.files[0].trip_id = completeId(99);
      },
    ],
    [
      'missing linked day',
      (d) => {
        d.companions.links[0].trip_day_id = completeId(99);
      },
    ],
    [
      'missing expense',
      (d) => {
        d.companions.shares[0].expense_id = completeId(99);
      },
    ],
    [
      'duplicate payer',
      (d) => {
        d.companions.payers.push(d.companions.payers[0]);
      },
    ],
    [
      'foreign category',
      (d) => {
        d.companions.categories.push({
          id: completeId(98),
          family_id: completeId(99),
          name: 'Foreign',
          color_hex: '#000000',
          icon_key: 'pin',
          sort_order: 0,
        });
      },
    ],
    [
      'signed media',
      (d) => {
        d.planner.variants[0].thumbUrl += '?token=private';
      },
    ],
    [
      'transformed media',
      (d) => {
        d.planner.variants[0].heroUrl = completeSource + '/storage/v1/render/image/public/catalog/a.jpg';
      },
    ],
    [
      'file traversal',
      (d) => {
        d.companions.files[0].storage_path = '../private/file';
      },
    ],
    [
      'unknown member',
      (d) => {
        d.companions.members[0].person_id = 'not-a-uuid';
      },
    ],
  ];
  it.each(mutations)('refuses %s', async (_name, mutate) => {
    const capture = completeTripCaptureFixture(),
      data = completeTripData();
    mutate(data);
    await expect(serializeCompleteTrip({ ...capture, data })).rejects.toThrow();
  });
  it('refuses private draft composition and an oversized whole capture', async () => {
    await expect(
      serializeCompleteTrip(completeTripCaptureFixture({ ...completeScope, layer: 'myDraft' }))
    ).rejects.toThrow();
    const capture = completeTripCaptureFixture(),
      data = completeTripData();
    data.header.description = 'x'.repeat(16777216);
    await expect(serializeCompleteTrip({ ...capture, data })).rejects.toThrow('Oversized');
  });
  it('does not silently discard invalid JSON fields', () => {
    expect(() => canonicalTripJson({ lost: undefined })).toThrow();
    expect(() => canonicalTripJson({ changed: NaN })).toThrow();
  });
});
