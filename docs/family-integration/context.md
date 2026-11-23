# Cursor context: connect the existing Family functionality

## Current execution context — 11 November 2026

The active checkout is `/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2`, branch `codex/trek-v5.1.2-family-reconcile`, now source-pinned to qualified **5.1.2**. Read `source-pin-adoption-handoff.md`, `qualified-source-contract.md`, then `native-packing-controls-packet.md`. Earlier Family packet work is retained; the old integration branch was not renamed/deleted. Current authorization is local scoped work only: no push, main merge, preview/production deployment or hosted change. The initial 5.0.1 instructions and dates below are historical, not permission to switch checkout, push, enable features or overwrite current connectors. Current checkpoint/owner instructions take precedence.

## Historical initial integration context

## Scope and authority

The user's latest scope is to reuse and integrate the Family functionality already built. Additional TREK features and their database support come later. This is an implementation carryover, not a new planning or product-design exercise. Preserve TREK 5.0.1's complete frontend and assets, and preserve existing Family map functionality. Do not rebuild either UI from descriptions.

Work only in `/Users/Misael/Downloads/FamilyTravelSite`, branch `codex/trek-v5-family-integration`. Commit/push validated work to that branch; keep PR #1 draft. Do not merge, deploy, change production data, apply SQL, send invitations, run image jobs or change map providers/credentials. Cloudflare remains the site host; Supabase remains the Family backend. The copied Docker checks are packaging compatibility checks, not a request to host Family in Docker.

## Current state

- TREK baseline: `a0943f8226269bc192c1cda992fbac33333337a1` (5.0.1).
- Production/old main: `247b76ea94942e511a663f3f840c81821c556fc5`.
- Ready-module carryover: `6d1c8eb30061ce358ba0f53ae5729e1f93f92121`.
- `family-backend/src` contains 120 files copied byte for byte from old main: 74 implementation/helper files and 46 existing test files. They are available through `@family/backend` but are not activated by TREK startup or transport.
- `docs/family-backend-carryover.json` records every original/destination path and hash. Do not modify those frozen source files or weaken their integrity check. Add compatibility wrappers outside them.
- Existing validation: 258 tests in 47 files, both backend/client typechecks, shared/client production builds, Knip at its existing 387-finding baseline, 19 CI-classification tests, five packaging unit tests and GitHub Family migration guard passed. These establish the carryover; they do not establish screen integration.
- On 29 October, GitHub lint, security and migration checks were green for `6d1c8eb`; the two broad upstream Tests & SonarQube runs were still running when this handoff was prepared. Refresh their actual status before treating CI as green. PR: https://github.com/Misael-L/FamilyTravelSite/pull/1.

## Reuse source: working files, not git HEAD

Read-only integration reference:
`/Users/Misael/.codex/worktrees/trek-v5-full-frontend/FamilyTravelSite`

This worktree contains uncommitted integration written against TREK 5.0.0 (`d4da05bbc93bcfa9668e7a8f4e5384b788452418`). Its git HEAD is old Family production and does NOT represent those working files. Read the files directly. Do not copy its entire tree over the clean 5.0.1 branch. `source-inventory.json` pins important file hashes, complete reference-tree digests and native files that already have integration hooks.

Start with these files under its `client/src/integrations/family/`:
- `bootstrap.ts`, `runtime.ts`, `transport.ts`, `applicationHandler.ts`: install before boot probes; translate Axios/fetch requests; delegate existing Family actions.
- `repository.ts`, `identity.ts`, `views.ts`, `readState.ts`: canonical reads, scoped view keys, DTOs, permissions, cache generations and invalidation.
- `navigation.tsx`, `FamilyTripBoundary.tsx`, `FamilyGenericMapBridge.tsx`, `controllerContext.tsx`: navigation and the preserved map/controller connection.
- `budgetHandler.ts`, `expenseDraft.ts`, `fileHandler.ts`, `listHandler.ts`, `collectionHandler.ts`, `journeyHandler.ts`, `vacayHandler.ts`, `notificationHandler.ts`, `bookingImportJobs.ts`, `transportDraft.ts`, `timelineViews.ts`: existing domain glue, not automatically all complete.
- `useEditorInitialization.ts`: keeps an open editor's source stable across reservation/expense refreshes.
- `legacy/pages/FamilyFrontendController.tsx`: existing renderless Family controller/map extraction. Do not mount `legacy/App.tsx`, `legacy/main.tsx`, old planner rails or entire old panels.
- `family-shared/`: the existing `@family/shared-compat` workspace, needed by old Family models/maps. Keep separate from TREK's current `shared/` contracts.

The reference `bootstrap.ts` calls `installRealtimeDriver`; clean TREK's `client/src/api/websocket.ts` does not export it. Bring that hook with the bootstrap. Existing `main.tsx` and `App.tsx` wrappers are also required. Directly copying the bootstrap alone will not compile or activate the full connection.

## Dependency and singleton rules

Reuse `@family/backend/supabase/*` and its other declared subpaths for the ready modules. The old bridge imports `./legacy/data/supabase/*`; redirect those imports or use explicit re-export shims. One active Supabase client, auth bootstrap, Family realtime service and canonical repository must serve both native screens and the preserved map. Do not leave parallel legacy/new client singletons fetching and hydrating the same trip independently.

Isolate the already-used compatibility dependencies (`@family/shared-compat`, `@family/zustand-v4`, `@family/mapbox-gl-v3`, `@family/maplibre-gl-v5`) where required by the actual dependency closure. Pin versions from the reference package manifests. Never globally redirect native `@trek/shared` or native Zustand/map imports to the old versions. TREK and Family models use different identities/contracts.

Ten production modules were intentionally deferred from the byte-for-byte package, not abandoned from this integration: `catalogPois.ts`, `mapsPois.ts`, `familyAdmin.ts`, `familyLists.ts`, `journeys.ts`, `travelStats.ts`, `vacay.ts`, both `useFamily*Refresh/Realtime` hooks, and `familyPlanPdf.ts`. Exact paths and their conflicting dependencies are in the carryover manifest. Reuse their existing implementations under isolated compatibility imports or boundary wrappers; do not overwrite current TREK stores, types or schemas.

## Existing functionality to preserve

Existing Family identity/MFA/membership and household/person roles; trip hub/proposals/voting and published/draft/direct/deny governance; Days/Places and repeated visits; bookings/transports and their endpoints; expenses/unlink/settlement; private files/fresh signed URLs; packing/todos; catalog saves and named Lists/Collections; current Journey/Journal and Vacay operations; settings/admin/preferences/notifications; existing Atlas/catalog/map capabilities and recorded tracks; current import/export behavior.

Only operations already supported by Family adapters/RPCs belong here. New Road trip/Tours/hike planning, Studio/photo-book persistence, and additional TREK Collab chat/polls/ownership semantics are future work. Existing Family proposal voting and hierarchy ARE in scope. Preserve upstream views/assets for future features and use explicit existing capability/unavailable behavior where necessary; do not fabricate empty successful reads or writes.

Preserve canonical UUIDs; scope numeric frontend view keys to auth/family and entity kind. Backend action outcomes and RLS govern writes. Transport has no draft module. Keep published rows separate from staged draft ops. Keep stored schedule UTC-day anchors, booking civil clocks encoded with Z, and endpoint localDate/localTime/timeZone distinct. Reservation phases must not create persisted or drafted schedule rows. Keep repaired phase roles, clipped spans, deterministic endpoint grouping, pair-local reorder and undo, repeat tab/Costs-return refresh, stale rejection, independent expense refresh and stable open editor drafts.

Preserve existing map engines/options, credentials, routes, POI/catalog behavior, filters, selection, tracks and image behavior. The renderless map controller is reused; old left/right rails are not. Keep focus/picker ownership, confirmation restoration and Costs suppression. Failed reads remain loading/error/retry states rather than empty successes.

## Known evidence and gaps

Reference unit tests exist for identity, views, transport, repository, navigation, expense drafts, lists and editor initialization. Historical browser evidence in `/private/tmp/trek-full-frontend-copy-20261027/browser/` showed four passing planner/interaction cases: preserved map, long-trip/hover controls, real place drag/drop and unsaved transport title surviving unlink. A broader route test still failed on Atlas. Do not repeat the old pass counts as new-branch validation or downgrade Atlas to a future-only feature. Finish its existing Family connection.

Reusable browser files are `client/e2e/family/fullFrontend.fixture.ts`, `fullFrontend.spec.ts`, `fullFrontend.interactions.spec.ts`, `client/vite.family-full.config.ts` and `client/playwright.family.full-frontend.config.ts` in the reference worktree. They use fake data and installed tooling. Temporary absolute-import configs are evidence only; the checked-in harness must use the new project's packages and portable installed-browser discovery.

`/Users/Misael/Desktop/FamilyTravelSite` and its protected image work are read-only. Do not stage, clean, reset or copy its dirty files. The canonical iOS/backend migration repository `/Users/Misael/Desktop/FamilyTravelApp` is read-only for this task. Historical locks can be read with `git show 247b76e:docs/web-trek-supabase-locks.md`; release-status sentences there may be stale. Historical RequestAccessPage lint failures are NOT an automatic exemption for this clean TREK branch. Use fresh results.

Read `.github/family-release.json`, `docs/family-github-workflow.md`, this context and the Cursor plan. Follow the user's current scope over historical narrower UI-port plans. Save short checkpoints in `progress.md` so a context reset does not restart the work.
