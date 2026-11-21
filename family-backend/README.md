# Existing Family backend connectors

This workspace carries the compatible data adapters, helpers and governance modules from Family production commit `247b76ea94942e511a663f3f840c81821c556fc5`. The manifest retains the original 120-file baseline, including existing tests. Committed revisions and local integration patches are recorded explicitly; the whole current tree is not claimed to be byte-identical to production. `docs/family-backend-carryover.json` records every source path, destination and SHA-256 digest, plus modules deferred because they depend on incompatible TREK contracts or stores.

The Supabase database is already deployed separately. These are browser connectors to that backend, not a replacement server. Import the needed module from the TREK client, for example:

```ts
import { listTripBookings } from '@family/backend/supabase/tripReservations';
import { getMyAuthBootstrap } from '@family/backend/supabase/auth';
```

The integration checkout connects selected native TREK screens through Family API transport and startup. Unsupported capabilities remain gated. That connection remains in the integration layer; it must preserve Family UUIDs, permissions, drafts and existing map behavior. The imported source uses the existing `VITE_SUPABASE_URL` and public `VITE_SUPABASE_ANON_KEY` configuration. No environment files or credentials are copied.

Validation from the repository root:

```sh
npm run check:family-carryover
npm run typecheck:family-backend
npm run test:family-backend
```

The tests use fake clients and fixtures, with network fetch disabled by default. They establish code compatibility and existing adapter behavior; they do not establish that TREK screens are integrated or that live backend contracts have changed. No SQL, RLS, backend deployment, map renderer or original Desktop working files are modified by this carryover.

## P04ab local backend continuation patches

The original `files` entries and pinned source commit remain intact. Optional `localPatches` entries name their trusted base digest, reconstructed digest, patch file/digest, packet and reason. The carryover command verifies original/approved Git blobs, applies each single-file patch in a disposable directory, checks its result against the actual source, and rejects unrecorded files, symlinks and dependency drift. `additions` records the new operation-context module. Run the tamper regressions with `node --test scripts/family/check-backend-carryover.test.mjs`.

The browser host installs actor capture for standalone backend calls. A scoped handler supplies its original request/layer owner synchronously; each repaired function captures that owner once and checks it before/after asynchronous boundaries. No mutable global is kept across an await. This covers file upload/trash, avatar operations, account settings and list-copy orchestration, including the nested trip-place upsert. The dependent legacy Collection-cover and Journey-image upload functions also retain the initiating context and source. It does not qualify every carried adapter or bind an immutable JWT inside SDK internals. Checks stop later application calls; already-issued requests may have completed. Server authorization, MFA and Direct/Propose/Deny rules still apply.

Trip-file, avatar, Collection-cover and Journey-image uploads retain their newly uploaded source after any unconfirmed finalization error. A timeout or error can occur after registration committed; browser-side compensating removal could destroy a referenced file. The error is still returned, and no automatic retry or second upload is scheduled. A definitively rejected upload may leave an orphan: do not manually delete it without checking references. Reference-aware server cleanup and its recovery/retention rules remain authoritative and require separate proof. No cleanup worker or retention policy is changed here.

These local patches are uncommitted and unreleased. Current packet results and remaining release gates are recorded in the FamilyTravelApp `docs/backend-modernization/p04ab-backend-operations-handoff.md`. No production or preview deployment, schema change, inventory or backfill accompanies them.
