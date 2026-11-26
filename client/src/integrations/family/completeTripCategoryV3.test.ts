import { describe, expect, it, vi } from 'vitest';
import { completeId, completeTripCaptureFixture, completeTripData } from '../../../tests/helpers/familyCompleteTrip';
import { completeTripBindings } from './completeTripRelations';
import type { CompleteTripCapture, CompleteTripData, CompleteTripEnvelope } from './completeTripSnapshot';
import { canonicalTripJson, parseCompleteTrip, serializeCompleteTrip } from './completeTripSnapshot';
import { FamilyIdentityRegistry } from './identity';
import { packingCategoryPacket } from './packingCategoryContract';
import { packingCategorySnapshotV2 } from './packingCategoryV2Contract';

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalTripJson(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
function legacyData(categories: boolean): CompleteTripData {
  const data = completeTripData(),
    p = data.packing;
  if (categories)
    data.packing_categories = packingCategoryPacket.parse({
      version: 1,
      scope: p.scope,
      collection_revision: p.collection_revision,
      packing: structuredClone(p),
      categories: [
        {
          id: completeId(400),
          trip_id: p.scope.trip_id,
          owner_person_id: p.scope.person_id,
          name: p.items[0].category,
          revision: 1,
          created_at: p.items[0].created_at,
          updated_at: p.items[0].updated_at,
          assignments: [],
        },
      ],
      item_categories: p.items.map((r) => ({ item_id: r.id, category_id: completeId(400) })),
      people: [{ id: p.scope.person_id, display_name: 'Synthetic member', is_guest: false, eligible: true }],
    });
  return data;
}
const expected = (c: CompleteTripCapture) => ({
  source: c.source,
  scope: c.scope,
  ownership: c.ownership,
  now: c.capturedAt,
});

describe('legacy complete Trip byte compatibility', () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('retains exact old output with coldRead=%s and categories=%s', async (admitReadOnly, categories) => {
    const c = { ...completeTripCaptureFixture(), admitReadOnly, data: legacyData(categories) };
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue('a1500000-0000-4000-8000-000000000999');
    let e;
    try {
      e = await serializeCompleteTrip(c);
    } finally {
      uuid.mockRestore();
    }
    expect((await parseCompleteTrip(JSON.stringify(e), expected(c))).data).toEqual(c.data);
    const fingerprints = {
      'false:false': '9450e88d25506b70fab315c15ea38f53866f785c3f35ef011bd9cd934bed47e8',
      'false:true': 'f6d22f5c05a31608aa02baf46863b323ef4693d8c27490ad5bfbe83822f92b02',
      'true:false': '037e250e0f3b14dd2fdeb8319e642a42d395ea71a435e7f8aba808e10cf232e3',
      'true:true': '9442861bb867be0cdf96da5f0a979358dfa414dcdf4c2ca9907a9a7323e65de4',
    };
    expect(await digest(e)).toBe(fingerprints[`${admitReadOnly}:${categories}`]);
    expect(e.data).not.toHaveProperty('packing_categories_v2');
    expect(e.bindings.some((b) => b.kind === 'packingCategory')).toBe(false);
  });
});

function captureV3() {
  const capture = completeTripCaptureFixture(),
    data = completeTripData(),
    p = data.packing;
  const guest = completeId(410),
    author = completeId(411);
  p.category_assignees[''] = [guest];
  const category = (n: number, name: string, sort_order: number, owner_person_id: string | null = null) => ({
    id: completeId(n),
    trip_id: p.scope.trip_id,
    owner_person_id,
    name,
    sort_order,
    revision: 1,
    created_at: p.items[0].created_at,
    updated_at: p.items[0].updated_at,
    retained_when_empty: true,
    deleted_at: null,
    deleted_by_person_id: null,
    assignments: [],
  });
  const packet = packingCategorySnapshotV2.parse({
    version: 2,
    scope: p.scope,
    collection_revision: p.collection_revision,
    packing: structuredClone(p),
    categories: [
      {
        ...category(400, '', 0),
        assignments: [{ person_id: guest, assigned_at: p.items[0].created_at, assigned_by_person_id: author }],
      },
      category(401, 'Other', 1),
      { ...category(402, p.items[0].category, 0, p.scope.person_id), retained_when_empty: false },
      category(403, 'Other', 1, p.scope.person_id),
    ],
    item_categories: p.items.map((r) => ({ item_id: r.id, category_id: completeId(402) })),
    people: [
      { id: p.scope.person_id, display_name: 'Owner', is_guest: false, eligible: true },
      { id: guest, display_name: 'Historical guest', is_guest: true, eligible: false },
      { id: author, display_name: 'Former assigning Person', is_guest: false, eligible: false },
    ],
  });
  return {
    ...capture,
    packingFormat: 'category-identity-v2' as const,
    admitReadOnly: true as const,
    data: { ...data, packing_categories_v2: packet },
  };
}
function required<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('Missing test observation');
  return v;
}
async function envelopeV3() {
  const e = await serializeCompleteTrip(captureV3());
  if (e.format !== 'family.offline-trip.v3') throw new Error('Expected v3');
  return e;
}
async function resign(e: CompleteTripEnvelope) {
  const { digest: _digest, ...body } = e;
  e.digest = await digest(body);
  return e;
}

describe('explicit category-identity complete Trip v3', () => {
  it('round trips the complete coupled packet, empty cards, exact People and provenance read only', async () => {
    const c = captureV3(),
      e = await serializeCompleteTrip(c);
    const p = await parseCompleteTrip(JSON.stringify(e), expected(c));
    expect(p.format).toBe('family.offline-trip.v3');
    expect(p.producer).toBe('family-web/complete-trip-v3');
    expect(p.data).toEqual(c.data);
    expect(p.data).not.toHaveProperty('packing_categories');
    expect(p.capabilities).toEqual({ coldRead: true, writes: false, tags: false, mediaBytes: false });
    expect(p.manifests.packing_categories_v2).toEqual({
      bytes: new TextEncoder().encode(canonicalTripJson(c.data.packing_categories_v2)).byteLength,
      sha256: await digest(c.data.packing_categories_v2),
    });
    expect(p.manifests).not.toHaveProperty('packing_categories');
    expect(p.revisions).toMatchObject({
      version: 3,
      packingCategoriesV2: {
        collection: c.data.packing.collection_revision,
        categories: c.data.packing_categories_v2.categories.map((r) => [r.id, r.revision]),
        itemCategories: c.data.packing_categories_v2.item_categories,
      },
    });
    expect(p.expiresAt).toBe(c.capturedAt + 900000);
  });

  it('round trips a successful empty coupled observation without borrowing old category or Person facts', async () => {
    const c = captureV3(),
      s = c.data.packing_categories_v2;
    s.categories = [];
    s.item_categories = [];
    s.people = [];
    s.packing.items = [];
    s.packing.bags = [];
    s.packing.category_assignees = {};
    s.packing.unassigned_weight_grams = 0;
    s.packing.trash_count = 0;
    c.data.packing = structuredClone(s.packing);
    const e = await serializeCompleteTrip(c);
    expect((await parseCompleteTrip(e, expected(c))).data).toEqual(c.data);
    expect(e.bindings.some((b) => b.kind === 'packingCategory')).toBe(false);
    expect(e.manifests.packing_categories_v2).toBeDefined();
  });

  it.each([false, undefined, 'true'])('requires literal read-only admission, refusing %s', async (admitReadOnly) => {
    const c = captureV3();
    const { admitReadOnly: _admit, ...rest } = c;
    const bad = admitReadOnly === undefined ? rest : { ...rest, admitReadOnly };
    await expect(serializeCompleteTrip(bad as CompleteTripCapture)).rejects.toThrow('read-only admission');
  });
  it('refuses unknown capture discriminators and never infers v3 from packet presence', async () => {
    const c = captureV3();
    await expect(
      serializeCompleteTrip({ ...c, packingFormat: 'future' } as unknown as CompleteTripCapture)
    ).rejects.toThrow('Unsupported');
    const { packingFormat: _format, ...legacy } = c;
    await expect(serializeCompleteTrip(legacy)).rejects.toThrow();
  });
  it('requires the new field and refuses the old field in v3 captures', async () => {
    const c = captureV3(),
      { packing_categories_v2: _categories, ...data } = c.data;
    await expect(serializeCompleteTrip({ ...c, data })).rejects.toThrow();
    await expect(
      serializeCompleteTrip({ ...c, data: { ...c.data, packing_categories: legacyData(true).packing_categories } })
    ).rejects.toThrow();
  });

  it.each(['collection', 'row', 'bag-total', 'trash-count', 'lifecycle'])(
    'refuses separately valid embedded packing with a different %s',
    async (change) => {
      const c = captureV3(),
        s = c.data.packing_categories_v2;
      if (change === 'collection') {
        s.collection_revision++;
        s.packing.collection_revision++;
      }
      if (change === 'row') s.packing.items[0].name = 'Different complete observation';
      if (change === 'bag-total') s.packing.bags[0].total_weight_grams++;
      if (change === 'trash-count') s.packing.trash_count++;
      if (change === 'lifecycle') {
        s.scope.trip_lifecycle_revision++;
        s.packing.scope.trip_lifecycle_revision++;
      }
      expect(packingCategorySnapshotV2.safeParse(s).success).toBe(true);
      await expect(serializeCompleteTrip(c)).rejects.toThrow('Mixed packing/category v2 generation');
    }
  );

  it.each([
    'missing-link',
    'foreign-category',
    'missing-person',
    'unknown',
    'unretained-empty',
    'trashed',
    'wrong-actor',
  ])('rejects adversarial coupled metadata: %s', async (change) => {
    const c = captureV3(),
      s = c.data.packing_categories_v2;
    if (change === 'missing-link') s.item_categories = [];
    if (change === 'foreign-category') s.categories[0].trip_id = completeId(900);
    if (change === 'missing-person') s.people.pop();
    if (change === 'unknown') Object.assign(s.categories[0], { surprise: true });
    if (change === 'unretained-empty') s.categories[0].retained_when_empty = false;
    if (change === 'trashed') {
      s.categories[0].deleted_at = s.categories[0].created_at;
      s.categories[0].deleted_by_person_id = s.scope.person_id;
    }
    if (change === 'wrong-actor') s.scope.person_id = completeId(900);
    await expect(serializeCompleteTrip(c)).rejects.toThrow();
  });

  it.each(['person-name', 'eligibility', 'rank', 'retention', 'provenance'])(
    'detects changed %s even after the envelope digest is recomputed',
    async (change) => {
      const e = await envelopeV3(),
        s = required(e.data.packing_categories_v2);
      if (change === 'person-name') s.people[1].display_name = 'Changed historical display';
      if (change === 'eligibility') s.people[1].eligible = true;
      if (change === 'rank') s.categories[1].sort_order = 9;
      if (change === 'retention') s.categories[2].retained_when_empty = true;
      if (change === 'provenance') s.categories[0].assignments[0].assigned_at = '2026-11-09T12:34:56.123456+00:00';
      expect(packingCategorySnapshotV2.safeParse(s).success).toBe(true);
      await expect(parseCompleteTrip(await resign(e), expected(captureV3()))).rejects.toThrow('manifest');
    }
  );
  it('rejects embedded packing divergence on parse even with new manifests and envelope digest', async () => {
    const e = await envelopeV3(),
      s = required(e.data.packing_categories_v2);
    s.collection_revision++;
    s.packing.collection_revision++;
    e.manifests.packing_categories_v2 = {
      bytes: new TextEncoder().encode(canonicalTripJson(s)).byteLength,
      sha256: await digest(s),
    };
    await expect(parseCompleteTrip(await resign(e), expected(captureV3()))).rejects.toThrow(
      'Mixed packing/category v2 generation'
    );
  });

  it('binds every category and historical Person without changing old bindings', async () => {
    const c = captureV3(),
      e = await serializeCompleteTrip(c),
      s = c.data.packing_categories_v2;
    expect(
      e.bindings
        .filter((b) => b.kind === 'packingCategory')
        .map((b) => b.uuid)
        .sort()
    ).toEqual(s.categories.map((r) => r.id).sort());
    for (const person of s.people)
      expect(e.bindings).toContainEqual(expect.objectContaining({ kind: 'person', uuid: person.id }));
    const { packing_categories_v2: _packet, ...oldData } = c.data;
    expect(completeTripBindings(c.data)).toEqual(completeTripBindings(oldData));
    expect(completeTripBindings(c.data, 'family.offline-trip.v2')).toEqual(completeTripBindings(oldData));
    expect(() => completeTripBindings(oldData, 'family.offline-trip.v3')).toThrow();
  });
  it('keeps the same UUID distinct across packing item, packing category and generic category namespaces', async () => {
    const c = captureV3(),
      s = c.data.packing_categories_v2,
      uuid = s.packing.items[0].id;
    s.categories[2].id = uuid;
    s.item_categories[0].category_id = uuid;
    const e = await serializeCompleteTrip(c),
      ids = new FamilyIdentityRegistry(c.scope.user_id);
    const keys = (['packing', 'packingCategory', 'category'] as const).map((kind) => ids.register(kind, uuid));
    expect(new Set(keys).size).toBe(3);
    expect(e.bindings).toContainEqual({ kind: 'packing', uuid, key: keys[0] });
    expect(e.bindings).toContainEqual({ kind: 'packingCategory', uuid, key: keys[1] });
    expect(() => ids.uuid('packing', keys[1])).toThrow();
    expect(() => ids.register('packingCategory', 'virtual:Other')).toThrow();
  });
  it.each(['category', 'author', 'wrong-kind', 'wrong-key', 'invented'])(
    'rejects corrupt %s bindings after recomputing the envelope digest',
    async (change) => {
      const e = await envelopeV3();
      if (change === 'category') e.bindings = e.bindings.filter((b) => b.uuid !== completeId(400));
      if (change === 'author') e.bindings = e.bindings.filter((b) => b.uuid !== completeId(411));
      if (change === 'wrong-kind') required(e.bindings.find((b) => b.kind === 'packingCategory')).kind = 'category';
      if (change === 'wrong-key') required(e.bindings.find((b) => b.kind === 'packingCategory')).key++;
      if (change === 'invented') e.bindings.push({ kind: 'packingCategory', uuid: completeId(900), key: 1234 });
      await expect(parseCompleteTrip(await resign(e), expected(captureV3()))).rejects.toThrow('manifest');
    }
  );

  it.each(['source', 'user_id', 'family_id', 'person_id', 'trip_id', 'layer', 'ownerGeneration', 'tripGeneration'])(
    'retains the original %s fence',
    async (change) => {
      const c = captureV3(),
        e = await serializeCompleteTrip(c),
        other = structuredClone(expected(c));
      if (change === 'source') other.source = 'https://other.fixture.invalid';
      else if (change === 'ownerGeneration' || change === 'tripGeneration') other.ownership[change] = completeId(900);
      else Object.assign(other.scope, { [change]: change === 'layer' ? 'myDraft' : completeId(900) });
      await expect(parseCompleteTrip(e, other)).rejects.toThrow();
    }
  );
  it('keeps exact expiry, recent verification and read-only capabilities', async () => {
    const c = captureV3(),
      e = await envelopeV3();
    expect((await parseCompleteTrip(e, { ...expected(c), now: e.expiresAt })).expiresAt).toBe(e.expiresAt);
    await expect(parseCompleteTrip(e, { ...expected(c), now: e.expiresAt + 1 })).rejects.toThrow();
    await expect(parseCompleteTrip(e, { ...expected(c), now: e.capturedAt - 1 })).rejects.toThrow();
    e.access.checkedAt++;
    await expect(parseCompleteTrip(await resign(e), expected(c))).rejects.toThrow('recent online read');
  });
  it.each([
    ['producer', ['producer']],
    ['writes', ['capabilities', 'writes']],
    ['coldRead', ['capabilities', 'coldRead']],
    ['old-field', ['data']],
    ['future', ['format']],
    ['downgrade', ['data']],
  ] as const)('refuses malformed v3 %s at the expected schema field', async (change, issuePath) => {
    const e = await envelopeV3();
    if (change === 'producer') Object.assign(e, { producer: 'family-web/complete-trip-v2' });
    if (change === 'writes') Object.assign(e.capabilities, { writes: true });
    if (change === 'coldRead') Object.assign(e.capabilities, { coldRead: false });
    if (change === 'old-field') Object.assign(e.data, { packing_categories: legacyData(true).packing_categories });
    if (change === 'future') Object.assign(e, { format: 'family.offline-trip.v99' });
    if (change === 'downgrade')
      Object.assign(e, { format: 'family.offline-trip.v2', producer: 'family-web/complete-trip-v2' });

    await expect(parseCompleteTrip(JSON.stringify(await resign(e)), expected(captureV3()))).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ path: issuePath })]),
    });
  });
  it('rejects a downgraded v3 revision vector even with a matching digest', async () => {
    const e = await envelopeV3();
    const revisions = e.revisions;
    if (revisions === null || typeof revisions !== 'object' || !('version' in revisions) || revisions.version !== 3)
      throw new Error('Expected a v3 revision vector in the test package');

    Object.assign(revisions, { version: 2 });
    await expect(parseCompleteTrip(JSON.stringify(await resign(e)), expected(captureV3()))).rejects.toThrow(
      'Invalid complete Trip manifest'
    );
  });
  it.each([false, true])('keeps old packages strict with coldRead=%s', async (admitReadOnly) => {
    const c = { ...completeTripCaptureFixture(), admitReadOnly },
      e = await serializeCompleteTrip(c);
    Object.assign(e.data, { packing_categories_v2: captureV3().data.packing_categories_v2 });
    await expect(parseCompleteTrip(JSON.stringify(await resign(e)), expected(c))).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ['data'], code: 'unrecognized_keys', keys: ['packing_categories_v2'] }),
      ]),
    });
  });
  it('enforces the coupled snapshot byte bound before saving', async () => {
    const c = captureV3();
    c.data.packing_categories_v2.people[1].display_name = 'x'.repeat(8388608);
    await expect(serializeCompleteTrip(c)).rejects.toThrow();
  });
});
