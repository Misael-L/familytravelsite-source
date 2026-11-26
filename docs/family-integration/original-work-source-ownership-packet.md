# U03-D16c original-work source ownership

Prerequisite: the current review in `offline-trip-snapshot-contract.md`, the source-contract probe and the last qualified source/runtime hashes. The review is complete; ordinary/hosted activation is still disabled. Repair durable original ownership before proposing a broader selector. Preserve native presentation and all original data.

## Required behavior

Source A and source B may use identical Auth UUIDs, person UUIDs, Family UUIDs and numeric view identities. The current source must not select/export/replay/rebind the other source's original queue or import bytes because those IDs match. An operation started under A must remain owned by A across awaits, logout, same-account return, Person/Family changes and source replacement. Returning to an authorized original A context must leave its exact work recoverable.

New source provenance is established from an accepted online Family bootstrap and the exact configured source identity. Cached display identities, `getSession()` user data, native numeric keys, filenames/job IDs and the existence of local records cannot establish origin ownership. Source aliases remain distinct unless an explicit validated migration defines their equivalence; never infer equivalence from a hostname substring or matching UUIDs.

Legacy/unmarked work remains byte-exact and explicitly unattributed. Do not tag, copy, rename, discard, acknowledge or replay it under the current source just to make admission pass. Unknown future command/store formats remain opaque and preserved. Existing v1/v2 archives remain intact and are never interpreted as server permission or a production restore command.

## Recommended storage architecture

Prefer source-aware native database selection plus one versioned immutable owner marker per source/actor database. The complete snapshot cache already uses a source/Auth/Family/person owner key; reuse that identity vocabulary instead of inventing a separate domain model. Centralize database-name parsing and source-owner checks rather than scattering new regular expressions across consumers. Keep ordinary non-Family native TREK behavior unchanged.

Evaluate the actual startup import order before implementation: the native DB object/display cache may be chosen before the Family bootstrap validates access. A cached namespace can locate existing data but cannot stamp a new owner or grant a read/write/export. Only an accepted original actor context may initialize a new, empty source-owned database. Validate the full owner marker as well as a collision-resistant namespace; a hash/name alone is not authority. Published read caches and private originals must not share an inferred ownership assumption.

An owner record in existing metadata storage may avoid an IndexedDB store/version change; first inspect its exact schema, consumers and cleanup. If another version is necessary, specify one additive migration, reject future versions and rehearse it without resets. Do not clear the owner marker on logout while originals remain. Clear-cache/original retention and account detachment must preserve both marker and bytes atomically, without mutating the original row's operation fields.

A per-row provenance sidecar is an alternative if the actual writers intentionally share a database across actors/sources. Adopt it only with evidence that mixed ownership is required: it adds joins, cleanup and atomicity obligations to every writer/exporter. Do not bolt a current-source label onto existing opaque rows. Record the chosen design and legacy recovery behavior before changing database selection.

## Execution order and permitted surface

1. Inspect `db/offlineDb.ts`, `db/nativeAuthSnapshot.ts`, the Family bootstrap/actor/identity bindings, native read/write/queue sessions, booking import writers, original-work exporter and current complete-cache source ownership. Identify every constructor/open/reopen, implicit read, enqueue/import write, logout/cache purge, export and queue replay path. Record where trusted source/actor state is available.
2. Specify the owner format, canonical configured-source identity, namespace selection, admitted transitions, unknown/legacy refusal and source-return recovery. Specify initialization and transaction boundaries. Namespace/source ownership is not a new Trip/geography/entity identity and must not rewrite canonical UUIDs or operation IDs.
3. Implement source-owned selection and owner verification before publication/writes/export/replay. Include all native cache observers and import writers; avoid a partial reader-only switch. A rejected initialization/transaction must leave the prior account connection/original data safe. No silent fallback to another source or an unversioned future database is allowed.
4. Connect owner preservation to import-only retention and explicit recovery/export. Decide whether archive provenance needs a new format version; do not silently reinterpret already published v1/v2 contracts or treat checksums as authorization. Existing archives and all original row/blob values remain unchanged.
5. Prove the contract, then reconcile activation again. Keep the existing loopback-only gate during this repair. Do not enable hosted behavior as a side effect of namespacing or export changes.

Changes may be needed in the named storage/session/queue/import/export modules and their Family adapters/tests. Native layouts, upstream source pin, compiler/quality baselines, unrelated UI, canonical migrations and 120 backend carryover files are outside scope unless a concrete dependency is demonstrated. Stop routine implementation from expanding into a Supabase business-schema redesign: this finding is in client storage ownership.

## Regression and application proof

Use real Dexie/IndexedDB transactions to cover two sources with exactly the same Auth/person/Family/view IDs; two users in one source; two people/Families for one account; source change and A→B→A; initialization failure/abort; logout and cache cleanup with orphan imports; delayed byte reads; unknown/unmarked originals and unsupported future schemas. Verify every original command field, operation UUID, revision, status/attempt, compound key, Blob/File metadata and byte digest. Prove foreign-source work never appears as current work, is never replayed, and remains present in its original storage.

Use the actual compiled source-alias/SDK/worker mechanism for a bounded same-origin source change. Require the new source's own real session validation; do not replace auth/permission/App with test objects. Explicit aliases are a test boundary, not a claim that two hosted projects were exercised. Return to A and demonstrate original recovery. Keep transport allowlists exact, domains synthetic/local, and image transformations at zero.

Retain all earlier assertion identities/multiplicities and baseline scopes. Runtime changes require focused ownership/queue/import/export/type/lint/quality checks and a genuine full client zero-exit run. Freeze inputs and qualify the actual native entrypoint/artifacts. Repeat affected browser flows when the runtime changes; inherited hashes alone do not qualify a new owner protocol. Independently verify canonical source/schema/native contracts and marked-local domain/audit/Storage bytes without fixture resets. A failed full run must be investigated rather than replaced by an isolated green case.

## Completion

The new owner contract is implemented and tested, legacy originals remain recoverable/unattributed without mutation, source B cannot adopt A's work, and real A→B→A behavior preserves exact bytes. Produce a handoff and scanned allowlisted evidence, commit only the isolated local scope, and revisit the explicit activation selector with the owner gate in place. Source pin, multi-day download/media/privacy, packing authoring and preview/main release remain separate. Independent database-plus-files restore and incremental backups remain separate.

No push, merge/deploy, hosted SQL/schema/settings/billing/SDK/CLI change, original backup/media/ETL operation, backfill or transformation job is part of this packet. Honor later explicit user authorization over these bounds; do not invent an approval question solely from this document.

## U03-D16c local implementation and acceptance

Source `b01b039a050f826f68e97372cbe3a62e64a1f77a` implements the contract in `original-work-source-owner-v1.md`: source/actor-owned native selection and immutable metadata, guarded native transactions and results, original-preserving pause metadata, import-only retention and v3 archive provenance. V1/v2 contracts remain unchanged. Accepted Family bootstrap initializes new ownership; unknown/unmarked originals remain untouched and unattributed. A separate lifecycle identity stabilizes refused native import/stay hooks without granting action permission.

Fresh full client 28,876 passed, zero failed/unhandled, unchanged 93 pending, every earlier assertion retained plus 21 regressions; 238 focused, 151 fresh actual browser checks/13 zero exits, post-build types/lint/seven unchanged gates, three scanned/hash-verified artifacts and independent native/source/schema/carryover/domain/audit/Storage preservation pass. Two expected synthetic membership audit updates were retained; exact Person links restored. Canonical `u03d16c-source-ownership-handoff.md` records evidence and limits.

Next: reconcile the source-owned implementation with the explicit activation decision, including deliberate legacy/unattributed recovery. Keep ordinary/hosted activation off. Native download/media/privacy acceptance, remaining whole-version checks, source-pin adoption, packing authoring and preview/main release remain separate. Independent restore and incremental backups remain separate. No push/main merge/deploy, hosted SQL/schema/settings/billing/SDK, original backup/media or ignored ETL change occurred.
