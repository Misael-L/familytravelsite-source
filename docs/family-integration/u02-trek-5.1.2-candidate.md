# TREK 5.1.2 reconciliation candidate — U02

9 November 2026. This is the isolated full-version candidate, not a released or fully accepted application. Further packing UI work remains deferred.

## Working copies and preservation

- Continue upgrade work in `/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2`, branch `codex/trek-v5.1.2-family-reconcile`.
- The original mixed checkout `/Users/Misael/Downloads/FamilyTravelSite` remains unchanged on `codex/trek-v5-family-integration`, HEAD `cede145a2e1963c59b667498e99e5056eaf65266`. Do not reset, clean or overwrite it.
- Private source checkpoint: `/Users/Misael/FamilyTravelApp-backups/trek-source-20261109-u02`. Its archive and independent Git history bundle restore all 15,129 captured source files with matching SHA-256 hashes and executable modes. The candidate's preservation commit is `0de451a4ec60c86af806999a04e67afa11ac8db5`.
- This source checkpoint excludes Git-ignored credentials, dependencies and generated builds. It does not replace the existing verified database/Storage backup, which was not changed. No off-device copy or complete database-plus-files restore is proved here.

## Complete upstream import

The candidate integrates the pinned official target `5cfc7a602a21598039668387f749f5a419e69bc9` (TREK 5.1.2) from the verified local reference, with common base `a0943f8226269bc192c1cda992fbac33333337a1` (5.0.1). This is the entire version gap, including server/native reference code and assets; it is not a selection of packing fixes. Upstream Nest/SQLite migrations are source reference only and must never be run against Supabase.

All 2,731 upstream-changed paths are accounted for: 2,662 are byte/mode-identical to the target, and 69 have intentional Family integrations, build/workflow changes or retained regressions. `candidate-inventory.json` in canonical U02 evidence lists every reconciled upstream path and the complete connector patch/addition index against the target. The 12 native presentation files are exactly the target; the six unchanged upstream auth/offline/packing seams are exactly the saved qualified Family checkpoint. The declared presentation baseline remains 5.0.1 until U03 acceptance, so the old-pin presentation guard must not be used to imply target qualification.

## Explicit conflict resolutions

All 25 conflicted files were resolved individually. The complete list is `conflict-resolutions.json` in canonical U02 evidence. Additional text-clean seams were tested; text-clean never meant runtime-compatible.

- Bootstrap, routing and login keep Family authentication/actor boundaries while incorporating upstream browser/native navigation imports. Native app address/browser sign-in code is retained as upstream source, not substituted for website Supabase authentication.
- Booking dialogs adopt staged uploads and the upstream saved-booking retry protocol. A failed upload retries the saved booking instead of creating another booking or cost. Family observed booking writes and unsupported companion gates remain. The new follow-up hook checks the original trip/session before each companion write and after each await, and cannot start the next upload after its view ends.
- PDF export adopts route progress, skip/cancel and the extracted upstream preview. Existing export-lane ownership, account/trip lifetime, obsolete-callback guards and private preview teardown remain. Family PDF/ICS behavior and unsupported export gates remain.
- Phone tasks adopt native card-grid/swipe behavior while checking `todo_edit`, independently of packing permissions. Read-only actions and swipes remain disabled. Trash binds the observed task to the qualified command port.
- Map prefetch adopts fallback basemaps and provider/native-iOS restrictions while retaining captured account cancellation and the original database handle. The actual native renderer receives route geometry; the old custom Family map is not remounted.
- The native place form's new `fieldOrigins` metadata is validated with the upstream strict schema and excluded from Family form persistence. It does not grant client claims authority over shared catalog provenance. Other unsupported non-neutral fields still refuse the entire save. This fixes real native saves for saved locations, selected visits and creation without changing the Supabase schema.
- TypeScript gains the target's roadtrip/stickers/sanitize entry-point mappings and native-shell inclusion while retaining legacy-root exclusion. Existing Family export test callers supply the new explicit `open` contract. No type suppressions or lower test gates were introduced.
- Family workspaces, compatibility package and dependency aliases remain. The lock is reconciled from the full upstream and existing Family lock, using the local npm cache; `npm ci --ignore-scripts` passes. Necessary Rolldown/oxc bindings satisfy the imported Vite requirements. No arbitrary application library upgrade was requested. Native platform builds/signing/store scripts were not run.
- Hosted workflows retain the existing manual-only policy; new native workflows do not automatically trigger on PRs/tags. No CI job, status, branch protection, billing or deployment setting was changed remotely. The imported reusable registration-dialect workflow is callable only, not an automatic event trigger.

## Validation performed

- Preserved Family backend: 277 tests in 49 files and typecheck pass; source carryover verifies 120 files, eight audited revisions, seven recorded local patches and five additions.
- Upstream/Family overlap consumers: 375 tests in 15 files pass for booking files/retries, exports/PDF, file repositories, mobile tasks, login and tile prefetch.
- Final Family compatibility cohort plus new boundary regressions: 2,316 tests in 98 files pass. This includes original queue/observation/recovery/session tests and new interrupted-upload/permission/field-origin cases. The initial failed checks were repaired, not skipped.
- Final client typecheck passes with Node 24.22.2 and an 8 GiB heap.
- The final `npm run build:web` passes with explicit non-production fixture URL/key. This artifact is not a configured deployment release. Build scanning found no private-key or Supabase secret-key signatures; it is not a comprehensive security audit.
- All 15,129 original source hashes, original Git HEAD/index and all 119 canonical migration hashes remain unchanged. No database connections, migrations or reset were used in U02. The ignored ETL directory and existing database/media backup were not modified.
- Full native/Family web suite results are recorded in the canonical evidence receipt. Passing the listed cohorts alone does not qualify every new upstream feature.

## Next U03 — qualify remaining version contracts

1. Resolve any full web-suite failures with the actual native consumers; distinguish obsolete mocks from real regressions. Retain original assertions for privacy, retry and repeated-visit identity.
2. Audit text-clean bootstrap/settings/API/repository overlaps and new provider/service calls. Verify truthful Family responses for new optional place/routing/settings fields and disabled capabilities. New community/provider requests, sharing consent, Tours, native-app auth and file garbage collection must not silently activate against the website backend.
3. Qualify new file-preview authentication and booking retry through the actual Family handlers, including interrupted views. Verify opaque revisions, original operation identities, permission changes and cache publication across logout/account/Trip changes.
4. Reuse the marked disposable Supabase stack for required real Auth/MFA/RLS/command cases; never point fixtures at hosted Supabase. No schema migration is justified merely by importing the upstream version.
5. Run the production-built local browser fixture with all external hosts denied and catalog `/render/image/` attempts intercepted before network dispatch. Exercise desktop/phone/tablet, native map/list/gallery, repeated visits, unsupported features, private files and recovery. This browser acceptance has not been performed for the upgraded candidate.
6. Only after those gates pass, update the native presentation pin and relevant source-contract baselines to the verified target, rerun guards, and record acceptance. Then resume the P04bd-to-native packing controls cutover (U04).

Preview release/source publication require their own authorized step. Production/main, hosted settings/billing, transformations/backfill and backup contents remain outside this packet. No push or deployment occurred.
