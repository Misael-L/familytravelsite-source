import { describe, expect, it } from 'vitest';
import { commandActor } from '../../../tests/helpers/collectionCommandFixture';
import { CollectionCohort } from './collectionCohort';
import { FamilyIdentityRegistry } from './identity';

function fixture() {
  const { collection_id: _collection, ...scope } = commandActor;
  let active = true;
  let settle: (value: unknown) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const pending = new Promise<unknown>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  const cohort = new CollectionCohort(
    {
      scope,
      source_url: 'https://fixture.invalid',
      ids: new FamilyIdentityRegistry(scope.user_id),
      assertCurrent: () => {
        if (!active) throw new Error('Owner retired');
      },
    },
    async () => pending
  );
  const empty = {
    version: 1,
    scope,
    state: 'active',
    library_digest: 'a'.repeat(64),
    total_count: 0,
    offset: 0,
    collections: [],
    next_cursor: null,
  };
  return {
    cohort,
    succeed: () => settle(empty),
    fail: () => fail(new Error('Read failed')),
    retireOwner: () => {
      active = false;
    },
  };
}
describe('Collection complete-library readiness belongs to one live owner', () => {
  it('distinguishes pending from an authoritative empty library', async () => {
    const f = fixture();
    expect(f.cohort.isLibraryReady()).toBe(false);
    const read = f.cohort.library();
    expect(f.cohort.isLibraryReady()).toBe(false);
    f.succeed();
    await read;
    expect(f.cohort.getSnapshot().roots).toEqual([]);
    expect(f.cohort.isLibraryReady()).toBe(true);
    f.cohort.retire();
  });
  it('a failed first read is not an authoritative empty index', async () => {
    const f = fixture(),
      read = f.cohort.library();
    f.fail();
    await expect(read).rejects.toThrow('Read failed');
    expect(f.cohort.isLibraryReady()).toBe(false);
    f.cohort.retire();
  });
  it('a late successful reply cannot qualify a retired cohort', async () => {
    const f = fixture(),
      read = f.cohort.library();
    f.cohort.retire();
    f.succeed();
    await expect(read).rejects.toThrow();
    expect(f.cohort.isLibraryReady()).toBe(false);
  });
  it('a completed index cannot be borrowed after its source/account owner changes', async () => {
    const f = fixture(),
      read = f.cohort.library();
    f.succeed();
    await read;
    expect(f.cohort.isLibraryReady()).toBe(true);
    f.retireOwner();
    expect(f.cohort.isLibraryReady()).toBe(false);
    f.cohort.retire();
  });
});
