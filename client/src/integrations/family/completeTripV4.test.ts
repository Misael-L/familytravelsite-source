import { describe, expect, it } from 'vitest';
import { completeId } from '../../../tests/helpers/familyCompleteTrip';
import { coherentTripCapture, coherentTripData } from '../../../tests/helpers/familyCompleteTripV4';
import { canonicalTripJson, hashCompleteTrip, parseCompleteTrip } from './completeTripSnapshot';
import {
  deriveCompleteTripV4,
  parseCompleteTripV4,
  serializeCompleteTripV4,
  type CompleteTripV4,
} from './completeTripV4';
import { FamilyIdentityRegistry } from './identity';
import { nativeStayReadiness } from './nativeStayReadiness';
function required<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('Missing test observation');
  return v;
}
const capture = coherentTripCapture;
const expected = (c = capture()) => ({ ...c, now: c.verifiedAt });
async function signed(e: CompleteTripV4) {
  const { digest: _d, ...body } = e;
  e.digest = (await hashCompleteTrip(body)).sha256;
  return e;
}
async function repairManifests(e: CompleteTripV4) {
  e.manifests = Object.fromEntries(
    await Promise.all(Object.entries(e.data).map(async ([k, v]) => [k, await hashCompleteTrip(v)]))
  );
  return signed(e);
}
describe('explicit coherent complete Trip v4', () => {
  it('round trips one canonical core without duplicate planner/booking copies or native activation', async () => {
    const c = capture(),
      e = await serializeCompleteTripV4(c),
      p = await parseCompleteTripV4(JSON.stringify(e), expected(c));
    expect(p.data).toEqual(c.data);
    expect(p.data).not.toHaveProperty('planner');
    expect(p.data).not.toHaveProperty('booking');
    expect(p.capabilities).toEqual({
      coldRead: true,
      writes: false,
      tags: false,
      mediaBytes: false,
      coherentStays: true,
      nativeStays: false,
    });
    expect(p.revisions).toMatchObject({
      version: 4,
      consistency: { core: 'single-MVCC-published-planner-booking-stay', ancillary: 'independent-validated-reads' },
    });
    expect(p.data.core.capabilities.native_read).toBe(false);
  });
  it('retains ancillary packing identity, tasks, bags, members, money and files', async () => {
    const e = await serializeCompleteTripV4(capture()),
      d = deriveCompleteTripV4(e.data);
    expect(d.packing_categories_v2?.packing).toEqual(d.packing);
    expect(d.tasks.tasks).toHaveLength(1);
    expect(d.companions.files).toHaveLength(1);
    expect(d.companions.expenses[0].total_amount).toBe('24.00');
    expect(d.packing.bags).toHaveLength(1);
    expect(e.bindings.some((b) => b.kind === 'packingCategory')).toBe(true);
  });
  it('binds stays independently from lodging, booking and day identities', async () => {
    const e = await serializeCompleteTripV4(capture()),
      s = e.data.core.stays[0];
    const key = (kind: string, uuid: string) => e.bindings.find((b) => b.kind === kind && b.uuid === uuid)?.key;
    const keys = [
      key('stay', s.stay.id),
      key('place', s.stay.location_id),
      key('reservation', required(s.link).reservation_id),
      key('day', required(s.arrival_day_id)),
    ];
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(4);
  });
  it('retains unknown nested catalog observations instead of stripping them', async () => {
    const c = capture(),
      d = c.data as ReturnType<typeof coherentTripData>;
    d.core.bookings[0].record.metadata.exact = { amount: '12.3400', unrelated: true };
    required(d.core.stays[0].booking).record = structuredClone(d.core.bookings[0].record);
    const e = await serializeCompleteTripV4(c);
    expect((await parseCompleteTripV4(e, expected(c))).data).toEqual(d);
  });
  it('preserves unsupported overnight and off-calendar canonical facts without pretending they are empty', async () => {
    const c = capture(),
      d = c.data as ReturnType<typeof coherentTripData>,
      s = d.core.stays[0];
    s.stay.check_in_time = '22:00:00';
    s.stay.check_in_window_end = '02:00:00';
    s.stay.check_in_window_end_day_offset = 1;
    s.stay.arrival_date = '2027-03-31';
    s.arrival_day_id = null;
    const e = await serializeCompleteTripV4(c),
      model = nativeStayReadiness(e.data.core, new FamilyIdentityRegistry(e.scope.user_id));
    expect(model.status).toBe('unsupported');
    expect(e.data.core.stays).toHaveLength(1);
    expect(e.data.core.stays[0].stay.arrival_date).toBe('2027-03-31');
  });
  it('retains an explicit removed-stay identity without private trashed content', async () => {
    const c = capture(),
      d = c.data as ReturnType<typeof coherentTripData>,
      s = required(d.core.stays.shift());
    d.core.bookings[0].stay_link = { id: s.stay.id, state: 'retained' };
    const e = await serializeCompleteTripV4(c);
    expect(e.data.core.stays).toEqual([]);
    expect(e.bindings.some((b) => b.kind === 'stay' && b.uuid === s.stay.id)).toBe(true);
    expect(JSON.stringify(e)).not.toContain('check_in_window_end');
  });
  it('refuses legacy readers and never relabels a v4 envelope as v3', async () => {
    const c = capture(),
      e = await serializeCompleteTripV4(c);
    await expect(parseCompleteTrip(e, expected(c))).rejects.toThrow();
    await expect(
      parseCompleteTripV4(
        { ...e, format: 'family.offline-trip.v3', producer: 'family-web/complete-trip-v3' },
        expected(c)
      )
    ).rejects.toThrow();
  });
  it.each(['digest', 'bindings', 'revisions', 'manifests', 'media'] as const)('refuses altered %s', async (field) => {
    const c = capture(),
      e = await serializeCompleteTripV4(c);
    if (field === 'digest') e.digest = '0'.repeat(64);
    else if (field === 'bindings') e.bindings = e.bindings.filter((b) => b.kind !== 'stay');
    else if (field === 'revisions') e.revisions = {};
    else if (field === 'manifests') e.manifests = {};
    else e.media = [];
    if (field !== 'digest') await signed(e);
    await expect(parseCompleteTripV4(e, expected(c))).rejects.toThrow();
  });
  it.each(['source', 'user_id', 'family_id', 'person_id', 'trip_id', 'ownerGeneration', 'tripGeneration', 'layer'])(
    'refuses different %s ownership',
    async (field) => {
      const c = capture(),
        e = await serializeCompleteTripV4(c),
        x = expected(c);
      if (field === 'source') x.source = 'https://other.invalid';
      else if (field === 'ownerGeneration' || field === 'tripGeneration') x.ownership[field] = completeId(999);
      else if (field === 'layer') x.scope.layer = 'myDraft';
      else x.scope[field as 'user_id'] = completeId(999);
      await expect(parseCompleteTripV4(e, x)).rejects.toThrow();
    }
  );
  it.each([-1, NaN, Infinity, 999999, 1900001])('refuses invalid/expired expected clock %s', async (now) => {
    const c = capture(),
      e = await serializeCompleteTripV4(c);
    await expect(parseCompleteTripV4(e, { ...expected(c), now })).rejects.toThrow();
  });
  it.each([
    'unknown',
    'duplicatePlanner',
    'rawLoss',
    'mixedRevision',
    'foreignStay',
    'mixedPacking',
    'missingCategory',
    'unsafeImage',
  ])('refuses %s even after recomputing hashes', async (kind) => {
    const c = capture(),
      e = await serializeCompleteTripV4(c);
    if (kind === 'unknown') Object.assign(e, { unexpected: true });
    if (kind === 'duplicatePlanner') Object.assign(e.data, { planner: e.data.core.planner });
    if (kind === 'rawLoss') Object.assign(e.data.header, { unknown: 'do not silently strip' });
    if (kind === 'mixedRevision') e.data.core.trip_revision++;
    if (kind === 'foreignStay') e.data.core.stays[0].stay.trip_id = completeId(999);
    if (kind === 'mixedPacking') e.data.packing.collection_revision++;
    if (kind === 'missingCategory') e.data.packing_categories_v2.categories = [];
    if (kind === 'unsafeImage')
      e.data.header.cover_image = 'https://x.invalid/storage/v1/render/image/public/catalog/x';
    await repairManifests(e);
    await expect(parseCompleteTripV4(e, expected(c))).rejects.toThrow();
  });
  it('refuses oversize complete data and non-JSON without truncating or normalizing', async () => {
    const c = capture(),
      d = c.data as ReturnType<typeof coherentTripData>;
    d.header.description = 'x'.repeat(16777216);
    await expect(serializeCompleteTripV4(c)).rejects.toThrow('Oversized');
    expect(() => canonicalTripJson({ lost: undefined })).toThrow();
  });
});
