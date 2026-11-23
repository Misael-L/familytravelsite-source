# Native TREK restoration receipt

31 October 2026, America/New_York. This receipt covers native planner/map presentation restoration and the execution plan. It does not mark the remaining data/detail/gallery connectors complete.

## Source and publication

- Checkout: `/Users/Misael/Downloads/FamilyTravelSite`.
- Branch: `codex/trek-v5-family-integration`.
- Restoration and plan: `ef89af59918a3c7376ea48eac49fe80d82def24f`.
- Preceding carryover-audit repair: `440e53756`.
- Both were pushed successfully. A fresh `git ls-remote` independently reported integration at `ef89af59918a3c7376ea48eac49fe80d82def24f` and main still at `247b76ea94942e511a663f3f840c81821c556fc5`.
- This documentation receipt is a subsequent documentation-only commit. It does not change the deployed runtime.
- No main merge, workflow dispatch, public corresponding-source publication or production deployment occurred. All integration workflows were confirmed manual-only before the push. The push includes the previously local integration ancestors, including the stored-image port and global-navigation repair; no mixed Desktop worktree or untracked Cursor plan was staged.

## What entered and what was undone

Git records the unwanted presentation carryover in `bdb7a674b9e60120d75dfd1214593afa31cfae7e`, 30 October at 13:55:32 EDT. That backend connection commit mounted old Family governance/Explore UI and substituted Family map/timeline code. Reusing those frontend components exceeded the backend-only requirement.

Twelve presentation files now match the originally imported TREK 5.0.1 commit `a0943f8226269bc192c1cda992fbac33333337a1` byte for byte. The exact list is in `native-presentation.json`; `node scripts/family/check-native-presentation.mjs` verifies it. The native desktop planner, day sidebar, map renderer/chrome, phone map/timeline/More sheets, Journey map, map settings and shared map are restored. Atlas uses the native renderer with existing unsupported-write guards retained. Trip tabs use native add-on conditions. Unsupported Family Tours/Roadtrip/Collab capabilities remain off; restoring native markup does not enable those backends.

Family authentication, typed identities, permission enforcement, persistence, original media, stored-variant readers and invisible backend/controller context remain. Partial-read errors/retry stay in the boundary's error-only alert lane, outside native rail markup. The native map's optional plugin marker/layer endpoints now return an authenticated empty-provider result after checking trip access; unsupported writes still fail. They are not catalog or destination records.

The stale backend carryover manifest was also repaired: all original digests remain checked against old main; eight approved image-port revisions are additionally pinned to their exact blobs in `925cbb0976faf9a128d5714a16d80d453d244369`. The other 112 files are unchanged originals. The guard rejects unrecorded edits to both an approved image adapter and an unchanged source. No `family-backend/src` content changed in this restoration.

## Actual local validation

Node 24.22.2, existing locked dependencies:

- Focused Vitest: **260 passed in seven files**. Real native inspector/gallery/wiring tests and Family handler, transport, navigation and permission tests. Added plugin-contribution cases check trip-access denial and reject unsupported writes.
- Final local Playwright Family suite: **19 passed in 1.6 minutes**. Real app and Family adapter with fake HTTP/data providers. Covers native desktop/phone presentation, absence of legacy mounts, disabled capabilities, day-card geometry, UUID day assignment, transport editing, Costs refresh, failed-read retry, exports, recovery, source offer, global pages, Atlas map and LTR/RTL placement.
- New instrumented desktop/phone cases observed zero `/render/image/` attempts and zero table writes. They reject unexpected HTTP/adapter errors. Production Supabase is denied by the fixture.
- Client `tsc --noEmit`: exit 0 with `NODE_OPTIONS=--max-old-space-size=8192`.
- `npm run build:web`: exit 0. Existing large-chunk warning remains; PWA precaches 662 entries.
- Mapbox/MapLibre split check: exit 0.
- Native source guard: 12 exact upstream files, exit 0.
- Family carryover guard: 120 files, eight approved revisions and 112 originals, exit 0. Deliberate temporary content mutations were rejected, then both files were restored.
- Dist artifact secret scan: 577 text files, clean.
- Source check of exact product commit: 12,978 text files, clean. Check-only snapshot tag name `source-20261101-ef89af5` uses UTC; it was not published. The clean-extract `npm ci`/rebuild option was not repeated in this pass.
- Explicit-preview Wrangler dry-run: 4,002 assets, no bindings, exit 0.
- `git diff --check`: exit 0.

Earlier attempts are not counted as passing: the new test request initially missed the required body property; that type error was fixed. An interrupted browser run overlapped a shared-library build and was discarded, then all browser checks were run serially. A prior run passed 17 cases and failed two stale/startup assertions; the legacy Atlas-wrapper selector was replaced with the actual native container and day-card tests now wait for native startup. The final 19-case run passed. The fixture now returns valid OpenFreeMap style JSON instead of PNG bytes for JSON style requests.

Existing test-harness persisted-store migration and Dexie database-close messages still occur. The new native cases only filter those known baseline messages, not arbitrary console errors. This is not a claim of a warning-free full application suite. Full monorepo tests, hosted CI, live phone-device testing, all lint/ratchet gates and SQL authorization suites were not run for this presentation-only restoration. No database migration was changed.

## Actual deployment and live smoke

Only `familytravelsite-integration-preview` was deployed with explicit `--name`, `--env-file /dev/null`, `--keep-vars`, message `Native TREK presentation ef89af599`.

- URL: https://familytravelsite-integration-preview.lmisael0721.workers.dev
- Preview version: `c3813597-c665-4aba-a409-c519b8107c00`, at 100%.
- Deployment: `a1b933d8-6b3f-4fc3-a02b-293d24a447f3`, created `2026-11-01T02:37:32.551671Z` (31 October locally).
- Built/live entry independently matched: `/assets/index-B8t0kO7G.js`.
- Previous preview/rollback companion: `d08eb5ec-1fe1-4fff-a61a-d4fe1c647e3b`, deployment `f10725cd-e40a-45ae-be30-406f8c86f740`.
- Production before/after: unchanged version `a5814c29-fe0c-446c-bd89-146e549a4be4`, deployment `5026f14c-4323-4405-aa8e-a20c30ad7cb3`.

Signed-in Chrome on the deployed preview loaded the dashboard and Mexico. Native OpenFreeMap/Leaflet basemap and destination pins rendered, the native left day rail showed 15 days, the right panel showed all eight destinations with covers, and native Plan/Transports/Bookings/Lists/Costs/Files tabs were visible. Published/My draft and the old Family catalog action UI were absent. No live create/edit/delete action was performed. The live smoke was visual/AX plus deployment-asset comparison; zero transformation attempts were measured in the instrumented fake-browser cases, not claimed as a full live traffic capture.

## Remaining work and next agent

Execute `native-trek-repair-plan.md` in order. The remaining phases cover DTO completeness and timeline semantics, Description/Notes separation, entity-specific header details, correctly conditional/read-only participants and separately approved attendance persistence, ready hero selection and explicit original links, and the remaining native/frontend connector audit. Additional native new-trip/calendar/admin wrappers are called out for that audit; this receipt does not claim every frontend difference is removed or all TREK features work.

No full sync, catalog inventory, variant verification, backfill, production schema/data mutation, billing change or transformation-setting change was performed. Tours remains disabled. The image recipe and existing originals/media IDs/order are unchanged.

Temporary validation logs and before/after Worker JSON are under `/private/tmp/trek-native-*`; these are local temporary evidence, not a durable or off-device backup. The plan, native-source manifest, guard, tests and receipt are preserved in integration Git history.
