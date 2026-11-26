# Demo-derived fixtures and end-to-end validation plan

Latest local implementation: **P04ab backend SDK/Storage continuation ownership and source retention** (7 November 2026). Remaining native caches, other composite adapters, real SDK/token timing, multi-tab/rollback/browser acceptance and independent restore remain gates; no default activation or deployment.

Date: 3 November 2026. Status: **demo-derived fixture specification; P00/P01a local proofs recorded separately, upstream scenario loader/browser suite pending**. Read `trek-feature-onboarding-plan.md` and canonical `FamilyTravelApp/docs/backend-modernization/README.md`.

## Why use the demo

Use upstream examples as repeatable behavior scenarios: the same places, planned order, days, notes, bookings and money cases. The Family database is a different relational model, so raw SQLite/numeric rows are not the fixture contract. A scenario passes only when its meaning survives the Family API/storage/native-consumer path.

The live demo URL requested by the owner is `https://demo.liketrek.com/trips/27`. It was inaccessible through the available web research tool. No authenticated browser inspection of that trip or screenshot parity was performed in this planning task. Do not claim that trip 27's current data was extracted.

## Owner review checkpoints — 4 November

The integration checkout is a development branch, not main. P01a used synthetic disposable-database recovery fixtures and real handler tests; it did not recreate the three TREK trips or publish a new browser preview. The full scenario loader/browser suite is still pending.

Canonical next-packet requirements: `FamilyTravelApp/docs/backend-modernization/p01b-aggregate-recovery-acceptance.md`. After whole-Journey recovery is proven, provide a small owner-readable Journey with multiple stories/photos and one independently trashed entry. The owner must be able to trash and restore the whole Journey, reload, see the same content/photo order and confirm the earlier trashed entry remains trashed. Provide the Trip exercise separately when Trip aggregate recovery is implemented. These are required future acceptance cases, not tests already run.

Expand the Tokyo/Kyoto, Barcelona and New York examples incrementally with each supported feature. Supply a short comparison checklist with expected names/counts, days/order, distinct description/notes, categories, image behavior and supported actions. Explain adaptations and unavailable features; keep Tours disabled until its backend exists. Owner inspection supplements the automated real database, authorization and preservation checks.

Use an isolated backend with synthetic accounts and fixture bytes for these write/delete exercises. Neither a dev branch nor a preview hostname proves database isolation. Start with a locally tested browser flow; a Cloudflare owner-review build needs a browser-reachable test backend and matching Auth redirects. Verify and record the endpoint/fixture/build identities before sharing the review URL. Do not connect the demo seed or destructive exercises to production, expose service credentials, or provision paid resources implicitly.

## Pinned source evidence

Reference checkout: `/Users/Misael/Downloads/TREK`, commit `dc36c21c08f681fd2806764fad8e17b270f6f175` (v5.1.0). Current website baseline remains TREK 5.0.1 commit `a0943f8226269bc192c1cda992fbac33333337a1`.

Read source, do not run the upstream reset/seed against Supabase:

- `server/src/demo/demo-seed.ts`: three example trip datasets.
- `server/src/demo/demo-addon-policy.ts`: which demo add-ons/providers are on/off.
- `server/src/demo/demo-reset.ts`: the live demo can preserve an API-built baseline instead of using the three seeded examples; numeric IDs and content are not guaranteed to match a live URL.
- `server/src/db/repositories/DemoRepository.ts`: seed tuple fields and write semantics.
- `server/src/db/seeders/CategorySeeder.ts`: category meanings; demo category IDs are positional and must not be copied as Family UUIDs.
- Native unit/e2e tests beside the feature and `shared/src` schemas: supplementary behaviors absent from the three-trip seed.

Observed fixtures in the inspected seed:

- **Tokyo & Kyoto:** 15–21 April 2026, seven days, 13 saved locations and 13 direct day assignments in the source. Hotel/transport/food/attraction notes, packing, budget and reservations are available.
- **Barcelona Long Weekend:** 21–24 May 2026, four days, eight saved locations and nine direct day assignments. Saved location index 4, Barceloneta Beach, is assigned on two days. This is a real repeated-location fixture; add a separate repeated-restaurant case for the owner's explicit requirement.
- **New York City:** 18–22 September 2026, five days, 11 saved locations and 11 direct day assignments, with city activities, notes, costs and reservations.

Counts were extracted from direct source declarations/calls, not a running database. The combined golden expectation is three trips, 16 days, 32 saved locations and 33 direct assignments for those declarations. Additional synthetic fixtures must state their own counts separately.

Keep original source/license/provenance with copied fixture data. Do not copy demo credentials, users' password hashes, API keys, provider settings or production user data. Fake actor accounts are generated for the local test project only.

## Fixture architecture

Maintain a small versioned **scenario manifest** independent of either database layout. Proposed fields include `scenario_key`, upstream commit/path, input schema version, expected output version, stable symbolic IDs, source-category meanings, geography hierarchy, saved location, visit, booking, cost, note and media expectations. These are fixture definitions, not production tables.

Provide adapters/loaders for the pinned native scenario and Family local database, with explicit mapping evidence:

- Upstream integer trip/day/place/assignment IDs map to distinct fixture UUIDs with valid source kinds. Never reuse one UUID for a city, restaurant and visit.
- Create the country/admin/locality hierarchy separately from food/hotel/experience catalog fixtures. Manual/provider-only points become trip-owned manual locations, not fake City catalog rows.
- Category IDs map by verified meaning/codes to the Family palette; do not hardcode 1=Hotel as a global database identity. A locality's City type does not become a restaurant category.
- One source location can map to multiple visit UUIDs. Repeated create operations have independent operation IDs; retries replay the same ID.
- Native day numbers/indexes map to Family's actual positive `trip_days.day_index` contract. Existing browser fixtures include zero-based `day_index:i`; do not assume those mocks are valid SQL rows. Keep adapter-internal zero-based values separate from persisted positive indices.
- Native place/default times and durations are explicit source data, not a new general default. Store the intended visit time/duration or record the source-default translation. Leave deliberately unknown durations unknown in the new cases.
- Native budget amounts and integer-cent display operations map to Family exact numeric currency values with a documented scale. A successful table insert with the wrong monetary scale is a failure.
- Source hotel reservations map to actual Family hotel bookings/stays and do not create a duplicate lodging store. Source food/experience occurrences retain their own identity alongside contextual locality.
- Optional provider identifiers remain external source metadata; they are not trusted auth, permission or canonical Family IDs.

Use fresh fixture-owned Families, users/persons and catalog rows in a disposable environment. Do not depend on production catalog UUIDs to make the normal test suite pass. A later bounded live smoke may select existing data read-only and must document its coverage limits.

## Media fixtures

Use small existing local image/file fixtures with recorded SHA-256, size, MIME and known dimensions. Provide ready thumb/hero manifest rows that resolve to local ordinary-object test responses. Keep canonical original as a distinct explicit-click target. Gallery fixture order is deliberately different from lexical URL order.

Intercept and fail every attempted Supabase `/render/image/` request before network egress, including prefetch. Deny all production Supabase hosts and external image/provider hosts in ordinary tests. Return the correct content type/schema for map/style/tile/API requests; do not fulfill every URL with one PNG or every backend request with 200/empty arrays.

Recovery tests need real fixture byte storage and object manifests in local Supabase, not only mocked metadata. Assert original bytes after restore and a history-only reference preventing purge. A bad MIME/hash/size must fail validation meaningfully.

## Local environment gates

4 November environment update: Docker engine 29.9.2 is available. A separate PostgreSQL 17.6 local stack replayed all 88 migration files and passed four existing variant/assurance/Journey SQL scripts without skips. Supabase CLI 2.109.1 and psql 18.4 were used; no CLI upgrade was performed. See canonical `FamilyTravelApp/docs/backend-modernization/p00-local-rehearsal-2026-11-04.md`. The test stack is stopped with its volumes retained. P01a subsequently implemented and tested Journey entry recovery; its contract and receipts are in canonical `FamilyTravelApp/docs/backend-modernization/p01a-journey-entry-recovery.md`. The adapted upstream scenario loader and browser feature suite remain pending. Node 24.22.2 remains the project runtime identified in the earlier checks.

First establish a disposable stack in an isolated workspace/config, with explicit local endpoints/project ID, test-only credentials and fixed non-production ports. A seed/reset/cleanup command must fail closed on any production fingerprint or unknown target. Do not run a generic reset from the linked production checkout and hope `--local` was inferred.

Inspect the installed CLI's `--help` before writing exact startup/reset/test commands; CLI versions and project configuration matter. Use the actual applicable migration chain, including live source drift/no-op migrations. If a historical-chain blocker exists, document the exact failing migration and legitimate remediation; never remove a gate or silently skip policy migrations.

No new `seed-demo`, `verify-all` or recovery CLI exists merely because it is described here. Implement/test the command, then document its tested invocation and logs. Environment setup is a prerequisite, not a claim that SQL authorization tests passed.

## Five test layers

1. **Contract/type tests:** validate actual shared schemas and response units, IDs, null/unknown semantics, enum/domain meanings and error envelopes. These are small tests of boundaries, not the whole acceptance suite.
2. **Actual handler orchestration with fakes:** call the installed Family Axios/fetch adapter and actual handler/repository/store path. Fake Supabase/provider boundaries with stateful, predicate-aware responses. Verify updates/transactions and typed errors; do not replace the handler under test or accept unmodeled writes.
3. **Real local Supabase:** apply the reviewed migration, load fixture data through intended APIs, exercise actual RLS/RPC/constraint/trigger behavior with real roles/JWT claims and read after write. Use a service/admin fixture seeder only for setup; it cannot prove authenticated authorization.
4. **Native browser consumers:** run the website against the local/fake boundary as appropriate, click the real controls, reload, inspect persisted results, test desktop/phone/RTL and both map engines. Capture request attempts, IDs, screenshots and bytes where relevant.
5. **Release smoke and restore drill:** a bounded separately authorized integration-preview walk with known entities, followed by controlled deployment evidence. Disaster restore drill runs in an isolated recovery environment and verifies DB plus object bytes. Do not delete production content for a smoke test.

All layers are needed for domains that write private content. A green mock/browser suite can coexist with an invalid DB fixture or broken permission; a green SQL suite can coexist with an unwired native button.

## Required scenarios

### S01–S06: core planning and identity

- S01: load each adapted example trip and compare expected day/location/visit counts, names and ordering after reload.
- S02: one saved restaurant visited on two different days and twice on one day; different time/duration/notes remain independent.
- S03: replay one create operation after simulated network loss; exactly one visit/result identity. Reuse of an operation key with a different payload returns a conflict.
- S04: saved without day, scheduled without time, timed appointment, genuine midnight and deliberately unknown duration remain distinguishable.
- S05: restaurant/experience/hotel/manual point retains source identity and coordinates; a city centroid is not used when a venue lacks coordinates.
- S06: move/reorder across day, booking seam and trip-date shift, including transaction rollback halfway through and stale revision conflict.

### S07–S12: permissions, maps and images

- S07: two Families and all relevant direct/propose/deny/guest roles; cross-Family IDs, same-Family wrong-trip/day, lost membership and assurance rejection.
- S08: native add-on handler -> store -> navigation; disabled features stay unavailable, supported fixtures expose real controls. Family global Atlas/Vacay/Collections/Journey metadata remains global.
- S09: Restaurants then Cafes top pills query appropriate fixture entities; select a pin, display exact details, cancel and Search this area; test true empty versus provider failure/retry.
- S10: category list empty/nonempty, matching native header chip and filter; editable palette and catalog City/Town types remain distinct.
- S11: Description once, personal Notes empty until entered, separate visit notes, unsafe content sanitized and no accidental global catalog edit.
- S12: 192-pixel thumb in list/avatar, larger ready hero on open, ordered Next/Previous and current original link, missing hero, old cached row and zero attempted transforms.

### S13–S18: preservation and history

- S13: trash/restore a Trip aggregate with visits, notes, bookings, costs, files and an independent linked Journal story; preserve IDs/order/bytes.
- S14: restore a Collection root/child, Journey root/entry and Atlas note/mark; keep a previously independently trashed child trashed.
- S15: overwrite a story/note/book design, restore an earlier version as a new revision, preserve attribution and current permissions.
- S16: one media object referenced by current/trashed/history content; denied physical deletion and safe reference removal, then an intentional locally tested purge.
- S17: restore-versus-purge lease race, worker expiry, backend failure, missing byte backup and accurate failure messaging rather than a broken successful restore.
- S18: removed content absent from active stats/search/export/public shares/realtime/offline caches; existing signed-URL lifetime is accounted for.

### S19–S25: booking, money, leave and libraries

- S19: multi-night hotel, check-in/out window, source hotel identity, selected visits and no duplicate accommodation/expense.
- S20: multi-leg flight/train/ferry with endpoint zones, genuine midnight, cross-day arrival and transport seams.
- S21: currency scale/rounding, several payers/shares, frozen exchange rate, failed atomic update, settlement reversal and retry.
- S22: import preview/review/apply/cancel with source hash; no duplicated booking/cost on retry or real outbound file processing.
- S23: Vacay whole/half day, cross-year entitlement/carry-over, sharing/denial and date-only semantics.
- S24: catalog and manual Collection item, labels/status/member rights, copy/save-to-trip distinct from assign-a-visit, undo/recovery.
- S25: packing/todo/bag/template, recipient visibility, duplicate template apply, reminders and recoverable removal.

### S26–S32: routing, Tours, Journey and services

- S26: route input settings/reset/reload, via drag/reanchor, manual boundary, repeated stop, route failure and a followed recorded track.
- S27: minimum synthetic fixture for each of hike/walk/run/bike/paddle/horse/winter; routed/manual profile, unsupported provider and invalid inputs. The simple three-trip demo seed does not cover these.
- S28: multi-day Tour stage assignment, planned/recorded stats, correction/import retry and Atlas aggregation.
- S29: Journey story/draft/contributor/trip suggestion, dismissed suggestion restore and independent source deletion semantics.
- S30: Studio book edit/reopen/revision/restore, shared immutable media and inspected PDF/export bytes.
- S31: two-session collaborative edit/conflict, offline queue replay and scoped public/invite token revocation; no real invitation sent.
- S32: external provider/AI/plugin/notification interfaces use fakes, capability/secret scopes and failure states; optional integrations stay unavailable when not configured.

These are acceptance families; each packet creates the specific test files/assertions it needs. Do not mark an entire family passed from a single helper test.

## Existing commands and proposed additions

Repository commands/configs already present include the native presentation guard, Family carryover check, `npm run build:web`, backend typecheck, client typecheck, Vitest and `client/playwright.family.full-frontend.config.ts`. Existing Family browser tests live under `client/e2e/family/`. Their current fixtures are useful orchestration examples, not a certified equivalent of real local DB rows.

During execution, inspect package scripts and installed CLI help, then record the exact commands actually used with Node 24, local project endpoints, migration IDs and output paths. Run builds and any dev/test server sharing generated artifacts sequentially where required. Do not rerun broad builds/suites after a documentation-only change or describe an unimplemented fixture command as available.

New loader/test harness should log scenario/version, target fingerprint, applied migration baseline, symbolic-to-UUID mapping, operation counts and expected/actual assertions, without passwords, tokens, private stories or original media bytes. Publish a small receipt per packet, with unrun cases and fixture provenance. A failed reset/authorization case blocks only its dependent implementation; continue independent design work.

## Release evidence

Completion report must identify scenario IDs, pinned source commits, seed adaptations, actual SQL roles/RPCs, native browser surfaces, attempted-transform count, preservation checks, commit pairs and preview/production status. Fresh smoke evidence is required after the actual candidate build; old demo screenshots do not certify a newer candidate.

Keep source publication, protected-branch checks and rollback through the existing release workflow. Do not trigger imported hosted workflows, change billing, apply production migrations, resume cleanup, deploy production or run full catalog jobs from this fixture plan.

## P01b.1 browser proof — 4 November

A small synthetic Journey was exercised against actual disposable Supabase in the built integration app on desktop and phone: native Delete, Family Journey Trash, Restore and reload; an earlier trashed entry stayed trashed. Both runs recorded zero transformation attempts. This proves this recovery flow, not full TREK demo parity, gallery decoding or provider/map availability. The Tokyo/Kyoto, Barcelona and New York scenario loader remains unimplemented. Owner-facing examples will follow supported foundations; production demo seeding is not implied. See canonical `FamilyTravelApp/docs/backend-modernization/p01b-journey-aggregate-contract.md`.

## P01b.2 Trip recovery local update — 4 November

The integration development checkout now connects native Trip Delete to retained-root Trash and exposes a shared Family Journey/Trip recovery control without modifying native pages or carried backend sources. Canonical contract, evidence and exact local commands: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p01b2-trip-recovery-handoff.md`. Fresh/upgrade, 18 Trip + 27 Journey database tests, four SQL suites, 24 website tests and real desktop/phone native recovery passed. The synthetic fixture includes three initialized days, one food occurrence, two restaurant booking links, a multi-night stay, cost shares, a previously trashed file, actual original bytes and an independent Journey. It is not the full adapted TREK demo, and repeated venue occurrences remain P03 work. No production/preview deployment or fixture write occurred. Next is P02/P03 foundation work; later owner review needs an isolated backend, not merely a development hostname.

## P02a local foundation update — 4 November

Saved-location persistence and versioned Family API are locally verified, with actual native-inspector consumer tests. Canonical handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p02a-saved-location-handoff.md`. Nineteen new SQL/Auth/HTTP/Storage tests, eighteen Trip and twenty-seven Journey regressions, four SQL suites and forty-five website tests passed, along with fresh/upgrade, typecheck/build and source guards. This bounded packet does not switch native Place/assignment routes, enable repeated visits or deploy a browser-visible feature. The existing Cloudflare preview remains unchanged. P02b/P03 must map those identities/writers together and exercise actual desktop/phone controls before presenting the adapted demo as supported.

## P02b.1 local relationship proof — 4 November

The canonical 93-chain visit/location bridge and versioned Family visit read seam now pass local migration/rollback, authorization, recovery and unchanged native inspector tests. Food/experience occurrences retain venue identity rather than using contextual city coordinates. The native `/places`/assignment cutover, explicit time intent, repeated venue writes and full adapted demo/browser control suite are still pending. No Cloudflare host or production backend changed. Current canonical handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p02b-visit-location-handoff.md`; use the 93-chain rehearsal there rather than the historical 91/92 runners.

## P03a.1 local command proof — 4 November

The canonical 94-chain untimed visit command boundary is locally verified: repeat visits, unassigned/day-only intent, safe retries/revisions, notes/duration, move/unassign and recovery. Day-sync scope/no-op failures were reproduced and repaired, with atomic date-edit protection for assigned explicit visits. 107 distinct DB/Auth/HTTP/Storage cases, four SQL suites and 66 web tests passed, including the actual native offline queue through the Family adapter after a lost acknowledgement. Native UI files and preserved backend remain unchanged. The native normal planner routes are not yet redirected, timed writes/typed new proposals/copy/export/category coverage and actual desktop/phone demo controls remain pending; no Cloudflare or production changes occurred. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03a-untimed-visit-handoff.md`; native cutover outline: `p03b-native-cutover-prerequisites.md` beside it. Use the current 94-chain rehearsal, not older packet runners.

## P03b.1 local proposal proof — 4 November

The current canonical chain is 95 migrations. Typed location/untimed-visit commands can be staged, submitted and reviewed through the existing proposal workflow without publishing drafts. Intent/decision retries, author-private typed bodies, current scope/MFA/capabilities, stale conflicts and accept-all rollback are verified. The baseline missing request-op grant and unchecked internal executor bypass were reproduced and repaired. 128 distinct real DB/Auth/HTTP/Storage cases, four SQL suites and 77 real-handler/transport/native-queue tests with Supabase fakes passed; full client typecheck, strict changed-module lint, local build/credential scan and native/backend source guards passed. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03b-typed-plan-proposals-handoff.md`; use its 95-chain guarded rehearsal.

This packet adds Family API seams only. Normal native Place/assignment routes and My Draft/Pending Changes overlays are not switched; timed classification/DST, copy/export/category boundaries and full adapted TREK desktop/phone/demo walks remain pending. No new browser or Cloudflare network proof is claimed, and neither production nor the integration preview changed. The isolated disposable stack is stopped. Independent DB/object restore and preservation of ignored ETL source remain separate requirements.

## P03c.1 local classification proof — 4 November

The canonical chain is now 96 migrations. An explicitly reviewed legacy visit can become untimed on a chosen real day or unassigned, requiring observed timing/revision and retaining the exact original row in immutable private history. No midnight is guessed; activity, notes, venue/visit identities, booking/story/media links and ordering remain intact. A checked minimal history read and strict classification route are tested through the actual Family dispatcher/transport/native queue with Supabase fakes. Lost-ack replay changes the visit once.

Only the marked disposable backend was pinned to corrected PostgreSQL image `17.11.0.003`; affected-zone/DST-instant/fractional-offset probes passed. Fresh 96 / populated 95→96, 149 distinct real DB cases, four SQL suites and 87 web tests passed, plus typecheck, strict module lint, local build/credential scan and source guards. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03c-legacy-time-classification-handoff.md`. Its 96-chain guarded runner supersedes historical reset commands.

This is not a native time-control or demo release: timed writes, timing/classification proposals, inverse conversion/Undo, native pool/occurrence/overlay/version/queue cutover and full desktop/phone adapted demos remain pending. No new live browser/network proof is claimed. The original local database, production, both Cloudflare hosts, transformations and billing remain unchanged. Independent DB/object restore and ignored ETL source preservation are still unproved.

## P03d.1 historical local named-zone timing proof — 4 November

The current canonical chain is 97 migrations. Complete timing commands support validated local offsets or exact instants, midnight, DST gaps/folds, fractional zones, explicit overnight dates, open-ended estimates, derived elapsed duration, deliberate legacy classification and retained timing revisions/restoration. Existing timed notes/source/lifecycle proposals work; clock/day/duration proposals remain next. No visit-time edit changes bookings, venue/media identity or independent stories. Legacy Trip date shifts are guarded for retained unassigned/trashed appointments too.

Fresh 97 / populated 96→97, 176 distinct real database cases, four SQL suites and 97 real Family dispatcher/transport/native-queue tests with only Supabase faked passed, alongside full client typecheck, strict module lint, local build/API/credential scan and source guards. The application handler shrank via a bounded plan-dispatch extraction. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03d-named-zone-timing-handoff.md`; its guarded 97-chain runner supersedes historical resets.

Normal native assignment/time/place/draft routes are not switched. Typed timing/classification proposals, end-only/reset/default/native queue contracts, other-writer coverage and full adapted desktop/phone demos remain incomplete. No new browser/remote transformation-network check is claimed. Production timezone qualification and independent DB/object restore remain gates. Production, both Cloudflare hosts, billing and transformations are unchanged. Ignored ETL source was untouched and remains independently unpreserved by this packet.

## P03e.1 historical local timing-proposal proof — 4 November

Current chain is 98 migrations. Existing typed drafts/requests now support complete timing/classification/clear/history-restore proposals. Stage/submit leave published visits unchanged; current Direct approval rechecks the visit revision and timing contract, then calls the checked timing command. Reject/withdraw never publish; accept-all rolls back earlier timing/history if a later operation conflicts. Existing function OIDs, data, pending work, history, venue/booking/story links, gallery ordering and original bytes survive expansion.

Fresh 98 / populated 97→98, 194 distinct real DB cases, four SQL suites and 104 actual Family dispatcher/transport/native-queue cases with Supabase faked passed. Full client typecheck, strict changed-module lint, local build/API/credential scan and 12-native/120-backend preservation guards passed. Current handoff is `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03e-timing-proposals-handoff.md`; use its guarded current runner, not historical chain resets. The local build uses the disposable API and must not be deployed.

No normal native pool/day/time/draft route or presentation was switched; native end-only/reset/default/create-and-time contracts and coordinated identity/revision/queue/draft-overlay mapping remain next. Full adapted desktop/phone demos, other-writer coverage, production timezone qualification and independent DB/object backup restore remain gates. The disposable stack is stopped with retained volumes. Production, both Cloudflare hosts, original local DB, billing, transformations and full data jobs remain unchanged. No new browser/remote network proof or independent ignored-ETL preservation is claimed. All current work remains uncommitted/unpushed.

## P03f.1 historical local independent-endpoint proof — 5 November

Current canonical chain is 99 migrations. Existing timing/proposal/history commands now support End-only timing and independent endpoint clears without inventing Start/midnight, duration or a location default. Partial intervals can carry an explicit estimate; complete intervals derive elapsed duration. Day uses Start's local date, or the known End's when Start is unknown. Existing IDs, rows, appointments, snapshots/history, pending typed/legacy/timing work, function OIDs, booking/story/media links, gallery ordering and original bytes survive expansion.

Fresh 99 / populated 98→99, 206 distinct real DB cases, four SQL suites and 112 actual Family dispatcher/transport/native-queue cases with Supabase faked passed. A targeted baseline web test and real pre-upgrade commands reproduced the former End-only refusal. Full typecheck, strict changed-file lint, local build/API/credential scan, 12-native/120-backend preservation guards, ACL and DB error gates passed. The disposable build must not be deployed. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03f-partial-visit-times-handoff.md`; earlier reset runners are historical.

No normal native route or presentation was redirected. Next is atomic create-and-time, then coherent native pool/day/selected-occurrence/form/draft/version/queue cutover. Defaults, broader writers, full adapted desktop/phone demos, hosted timezone qualification and independent DB/object/source backup proof remain pending. Only the marked disposable stack was stopped with volumes retained; production, Cloudflare, original local DB, billing, transformations and full data jobs are unchanged. Work is uncommitted/unpushed. No new browser/remote network result or independent ignored-ETL preservation is claimed.

## P03g.1 local atomic-entry proof — 5 November

Current canonical chain is100 migrations. One parent operation atomically commits saved-location/occurrence/timing or rolls back every new child, audit/history/receipt. Existing catalog-source deduplication and separate notes/venue/media identities remain intact; intentional repeated visits use new operation UUIDs. Compound proposals stay private until checked approval; current places authority also applies to inline-source submit/accepted-review replays. Native presentation/routes remain unchanged.

Fresh 100 / populated 99→100,223 distinct real DB cases, fourSQL suites and 125 actual dispatcher/transport/native-queue cases with Supabase faked passed. Baselines reproduced the absent composite command/proposal and older partial-save failure. Full typecheck, strict six-file lint, local build/14-API/credential scan,12-native/120-backend guards, ACL and DB error gates passed. Build targets the disposable API and must not be deployed. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03g-atomic-plan-entries-handoff.md`; historical resets are not current.

Next is the coordinated unchanged native pool/day/selected-occurrence/form/draft/version/queue cutover. Defaults, broader writers, transactional dates/reorder, full adapted demos, hosted timezone qualification and independent DB/object/source backup proof remain pending. The marked disposable stack is stopped with volumes retained. Work is local/uncommitted/unpushed; production, Cloudflare, original local DB, billing, transformations and full data jobs are unchanged. No new browser/remote transformation-network result or independent ignored-ETL preservation is claimed.


## P04a.1 evidence boundary — 5 November

Local synthetic planner fixtures now exercise the actual Family repository, dispatcher/Axios, native day/place repositories, Dexie caching and an older queued edit against the snapshot coordinator, with Supabase RPC/media responses faked. Database fixtures separately use real local roles/Auth/TOTP/HTTP/Storage on qualified PostgreSQL17.11: repeated venue visits, actual midnight, End-only, unknown timing, unvisited city destinations, two Trips sharing one catalog city, private drafts, Trash, bounds and concurrent transactional updates. Baseline adapter failures are reproduced rather than inferred from helper tests.234 distinct DB and148 focused web cases passed, with fresh101 and populated100→101 preservation.

These are foundation/authorization/read-orchestration proofs, not a complete adapted TREK demo or actual desktop/phone browser walkthrough. No fixtures were imported into production or either Cloudflare host. The diagnostic state explicitly retains and reports missing pool/legacy/unassigned native representation blockers; the read-only rehearsal coordinator must not replace the current runtime adapter yet. Full form/clock/draft/revision/original-scope offline tests and explicit destination bridging come before the visible adapted preview. Independent database and original object-byte/source restore remains unproved. Current canonical evidence: `docs/backend-modernization/evidence/p04a-2026-11-05/` in FamilyTravelApp.


## P04b.1 evidence boundary — 5 November

Synthetic local destinations now exercise an explicit source-safe bridge through real database roles/Auth/TOTP/HTTP and the actual Family dispatcher/Axios/native place reader/Dexie queue with Supabase faked at the web boundary. Fixtures cover unvisited and personalized city destinations, distinct destination/saved categories, archived catalog sources, same source in multiple Trips, source/Trash/version conflicts, concurrent retries, final-receipt rollback, immutable original receipts, gallery/bytes and unchanged venue occurrences. Website fixtures additionally prove native city loading, no bridge on GET, selected-Family preflight and an original-scope queued bridge parked intact after an account switch.252 distinct DB and167 focused web cases passed with fresh102 and populated101→102 preservation.

These are explicit-command/read/queue proofs, not a complete adapted TREK desktop/phone demo or live preview walkthrough. No fixtures or bridge calls touched production or either Cloudflare host. Native normal writer/read/draft/revision/offline cutover and legacy/unassigned representations remain pending; the read-only rehearsal coordinator is not the default adapter. A full account-bound migration for older queued requests is not implied by the new endpoint's origin-scope test. Independent database/original object-byte/source restore remains unproved. Current canonical evidence: `docs/backend-modernization/evidence/p04b-2026-11-05/` in FamilyTravelApp.


## P04c.1 form evidence boundary — 5 November

Local synthetic forms now cover inherited catalog data refreshed while a form is open, separate personal Notes, untouched full-form no-op, intentional overrides/clears, private replacement/reversion/approval, stale/submitted/ambiguous drafts, concurrent saves and final-receipt rollback. The real guarded SQL/Auth/TOTP/HTTP suite has272 distinct passing DB cases plus four retained SQL suites, with fresh103 and populated102→103 preservation of geography/visits/history/pending work/gallery/original bytes.

The188-case web suite includes21 new cases and three actual native PlaceFormModal Update-event scenarios. Family repository/dispatcher/Axios/native stores/IndexedDB queue are real; Supabase and ancillary read-only files/reservations are faked at their boundaries. A private Save/reload stays out of published caches. Source refresh, lost acknowledgement, original-scope/stale queued intent and unsupported-field refusal are exercised. This remains local component/orchestration evidence, not a full adapted TREK desktop/phone browser walkthrough. The editor is opt-in/online-only; default routes and all Cloudflare hosts remain unchanged. No fixtures were imported into production. Current canonical evidence: `docs/backend-modernization/evidence/p04c-2026-11-05/` in FamilyTravelApp. Independent DB/original-object/source restore and full coordinated native cutover remain pending.


## P04d.1 selected-form evidence boundary — 5 November

Synthetic local scenarios now drive the actual native modal's combined location/occurrence Notes and Start/End through one versioned command. The 22 new web cases use real Family dispatcher/Axios/native stores/IndexedDB queue with Supabase and ancillary read-only modal/connectivity lookups faked. The full210-case suite passes, including original observations/lost-ack retry, private reopen without published-cache pollution, account/person fences and whole-operation refusal of unsupported fields.

Real guarded SQL/Auth/TOTP/HTTP cases cover repeated venues, atomic private approval/replacement/reversion, current two-domain replay authority, midnight/subseconds, End-only/clear/unknown zone, DST gaps/folds, cross-midnight conflicts, private-zone refresh, exact migrated-note bytes, stale/competing intents and final-receipt rollback. Fresh104/populated103→104 preserve old pending work, other visits, geography, gallery/original media bytes and function identities.301 distinct DB cases plus four SQL suites and supplemental authority/grant probes pass.

These are local component/database/orchestration proofs, not a complete adapted TREK desktop/phone browser walkthrough. The opt-in UI callback remains online-only; default planner and both Cloudflare hosts are unchanged. No fixture import or backfill touched hosted services. Current canonical evidence: `docs/backend-modernization/evidence/p04d-2026-11-05/` in FamilyTravelApp. Coordinated default cutover, complete pending-work/offline handling and independent database/original-object/source restore remain pending.


## P04e.1 scoped private snapshot/cache prerequisite completed locally

Canonical specifications: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04e-private-planner-view-contract.md` and `p04e-private-planner-view-handoff.md`. The105-chain read-only view combines current saved/visit/day state and one author's typed pending operations without writes or partial private overlays. Legacy/stale/overlapping intent is retained as a blocker. Native list consumers have an optional read-only persistence port; checked scoped IndexedDB snapshots separate API/user/Family/person/Trip/layer and retain variant descriptors for bounded offline reads. Online requests revalidate authority; denial cancels older readers before cache publication. Generic native caches and old queued intent remain untouched by this rehearsal.

Default runtime is still unswitched: legacy bundle reads and split actual form callbacks require the next coordinated writer/read/queue packet. Do not install new reads alone. Legacy/unassigned representation, new-create/upload/import/export/category writer coverage, blocked-draft resolution, adapted desktop/phone demo and independent restore remain explicit gates. The qualified105-chain disposable rehearsal is the current local command; older chain commands are historical. No hosted or preview change is implied.


## P04f.1 first native startup/editor/queue cohort verified locally

Canonical contract/handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04f-native-planner-cohort-contract.md` and `p04f-native-planner-cohort-handoff.md`. Actual native Trip store loading, opener/Update callbacks and save/reload now use scoped snapshots and original observed atomic form commands in an explicitly installed composition. Retained cross-domain location links are bridged or refused, not guessed. Strict original-source/user/Family/person/operation packets replay through the native queue; older requests are parked intact. Generic native caches are not filled with private state.

This is not default activation. Complete native creation/day/assignment writers, legacy controller/governance handoff, retained-data/blocked-intent handling and scoped offline startup before switching bootstrap. Then prove adapted desktop/phone flows and independent recovery before preview/release. Current source chain stays105; no new migration or hosted/preview change occurred.


## P04g.1 implementation update — 5 November

Native New place (manual pool/day-only) and Add to day (committed saved locations/repeat visits) now use one original-scope atomic creation command in the explicit cohort. Private typed intents, snapshot reload and native queue replay are covered; interrupted acknowledgements retain the original operation rather than duplicating a changed form. Unsupported inputs refuse before partial writes. Default bootstrap remains legacy; this is not a deployed cutover.

Fresh106/populated105→106,350 distinct real DB cases,493 web cases (318 Family+175 native), four SQL suites,90 grants, client typecheck, strict lint, local-target build and12/120 source guards pass. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04g-native-creation-*`. Current runner: `rehearse_native_creation.py --reset-disposable`.

Next complete native assignment/day commands, controller/governance handoff, retained/blocked intent behavior and scoped offline startup before local activation/adapted desktop-phone proof. Provider/catalog creation UI, unknown-zone timed manual stops and file uploads remain explicit gaps. Independent DB/original-object/source restore and hosted qualification remain release gates. Production/previews unchanged; ignored ETL untouched and not independently backed up; work uncommitted/unpushed.


## P04h.1 native assignment arrangements — 5 November

Move/Remove/Reorder/Clear day now enter an atomic original-observation command in the explicit native cohort. Published Remove/Reorder Undo preserves identity; private arrangements use one checked typed intent and read-only projection. Timed local clocks/zone/precision, repeat visits, notes and independent bookings/media survive. Stale membership/revisions, DST ambiguity and overlapping private intent refuse the complete operation.

Fresh107/populated106→107,381 distinct DB cases,523 web cases (346 Family+177 native), four SQL suites,99 grants, typecheck/lint/local-target build and12/120 source guards pass. Current runner: `rehearse_visit_arrangements.py --reset-disposable`. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04h-native-assignment-*`.

Default runtime remains legacy. Next are day/date and remaining inline writers, controller/governance/blocked-intent and scoped offline cutover, then local desktop/phone proof. Move/bulk-Clear/private Undo, broad Trash UI, hosted qualification and independent DB/original-object/source restore remain incomplete. Production/previews unchanged; ignored ETL untouched and not independently backed up; work uncommitted/unpushed.


## P04i observed calendar foundation — 5 November

Native title, append-at-end and explicit end-date extension now use an original-observation transaction in the explicit cohort. Server-owned day revisions, whole-calendar conflict checks and retry receipts preserve existing day/visit/booking/media identities and content. Actual native hooks/store, HTTP coordinator and IndexedDB queue are covered. Middle insertion/reorder/delete/shrink/rebase, private calendar authorship and booking shifts remain guarded pending recovery-aware commands.

Fresh108/populated107→108,408 distinct DB cases,594 web cases (381 Family+213 native), four SQL suites,111 grants, typecheck/lint/local-target build and12/120 source guards pass. Current runner: `rehearse_trip_calendar.py --reset-disposable`. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04i-observed-calendar-*`.

Default runtime remains legacy. Next: calendar recovery/proposal and remaining inline writers, controller/governance and scoped offline cutover, then local desktop/phone proof. Independent DB/original-object/source restore and hosted qualification remain outstanding. Production/previews unchanged; ignored ETL untouched and not independently backed up; work uncommitted/unpushed.


## P04j recoverable whole-day order

The explicit native cohort now reorders existing days transactionally and exposes exact server-backed Undo. Day/visit identities and day notes follow the movable day; confirmed booking timestamps and civil dates stay fixed, with booking day anchors realigned. Direct reservation authority is required for day-bound bookings. Unresolved planner/booking proposals, unknown legacy timing, orphan notes and DST ambiguity block the entire operation without discarding data. Stale Undo cannot replace later work.

Fresh109/populated108→109 and the final31-case calendar-order suite qualify the amended migration.439 distinct DB cases,613 web cases (400 Family+213 native), four SQL suites,114 function/12 table privilege checks, typecheck/lint/local-target build and12/120 source guards pass. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04j-recoverable-day-order-*`. Current runner: `rehearse_trip_day_order.py --reset-disposable`.

Default bootstrap/legacy boundary remain unchanged. Insertion/deletion/shrink/rebase, private calendar authorship, remaining writers/controller/offline and independent backup/restore remain incomplete. Production/previews unchanged. Ignored ETL remains untouched and not independently backed up. Work remains uncommitted/unpushed.

## P04k recoverable dated day insertion — 6 November

The explicit native cohort now inserts a dated day at any position, preserving existing day/visit identities, day notes, named-zone clocks, media and booking dates/confirmed instants. Exact server-backed Undo archives and removes only its still-empty created row after checking every declared day reference plus date-owned notes. Later content/scope/authority changes refuse recovery. Native history retains the identical Undo after transient failures; stale post-Undo refreshes cannot report success. The selected removed day is cleared only after successful recovery. Native Add without date is explicitly refused in this dated cohort; no date is invented.

Fresh 110/populated 109→110, the final 31 insertion cases, 470 distinct real DB/Auth/TOTP AAL2/HTTP cases, 643 web cases (427 Family +216 native), four retained SQL suites, 120 function/36 table privilege checks, typecheck/strict lint/local-target build/25-RPC credential scan and 12/120 source guards pass. Repeated cases are counted once. Existing warning findings and the corrected initial test-lint warning are retained in evidence. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04k-recoverable-day-insertion-*` and `evidence/p04k-2026-11-06/`.

General existing-day Trash/deletion/restoration remains the next recovery packet. Private calendar proposals, remaining inline writers/controller/governance/blocked-intent/offline cutover, default activation, adapted desktop/phone walks, hosted qualification and independent database-plus-original-object/source restore remain incomplete. Default bootstrap/legacy boundary, production and both previews are unchanged. Ignored ETL remains untouched with zero tracked files and no independently proven source backup. Work is local, uncommitted and unpushed. Current guarded runner: `python3 supabase/tests/rehearse_trip_day_insertion.py --reset-disposable` from FamilyTravelApp, marked disposable API 55331/DB 55332 only; earlier runners are historical.

## P04l exact recovery for unreferenced existing days — 6 November

The explicit native cohort removes/restores an existing dated day only when it has no retained child references. Its UUID, title and creation metadata survive with monotonic revisions; survivors compact atomically and exact Undo restores original bounds/order/instants. Confirmed bookings stay on their dates. Visits (including Trash), notes, booking/file references, disappearing-date bookings and pending planning changes block removal without cascades. This is not populated-day aggregate Trash or general deletion.

The native question binds its original account/source/layer/observation; stale display and switched scope require reopening it. Native history retains exact transient recovery retries. Actual confirmation/history/HTTP/IndexedDB tests include cancel, duplicate clicks, lost replies, forged identities, queued replay after cohort release and foreign parking. Default/native presentation stays unchanged. Legacy direct store deletion stays guarded in the cohort.

Fresh 111/populated 110→111 and 27 core recovery cases plus a supplemental legacy-sync proof pass with the exact migration hash captured before application and rechecked at completion. 498 distinct DB/Auth/TOTP AAL2/HTTP cases, four retained SQL suites, 850 web cases (447 Family +403 native, including 187 controller cases), 123 function/60 table privilege checks, typecheck/strict lint/local-target build/25-RPC credential scan and 12/120 source guards pass. Existing DB warnings and corrected initial failures are retained. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04l-unreferenced-day-recovery-*` and `evidence/p04l-2026-11-06/`.

Next is populated-day recovery, then private calendar proposals/remaining writers/controller/governance/blocked-intent/offline activation and adapted desktop/phone proof. Default bootstrap/FamilyTripBoundary, production and both previews remain unchanged. Independent DB-plus-original-object/source restore and hosted qualification remain release gates. Ignored ETL was untouched, has zero tracked files and has no independently proven source backup. Work remains local, uncommitted and unpushed. Current guarded runner: `python3 supabase/tests/rehearse_trip_day_recovery.py --reset-disposable` from FamilyTravelApp, marked temporary API 55331/DB 55332 only. Earlier packet runners are historical.

## P04m recoverable day visits and notes — 6 November

The explicit native cohort now uses `trash_day` / `restore_day` to retain a selected day with typed visits and day notes. Visits keep their identities, clocks, time zones, notes and independent relationships; note rows keep their IDs, body, icon, order and timestamps. Exact immediate Undo restores the original day and children with monotonic revisions; prior independently trashed visits stay trashed. Shared catalog/media, saved-location notes, visit-linked bookings without day anchors and independent Journey stories stay intact. Older unreferenced-day APIs remain compatible; a reproduced child-only date restoration bypass is fenced so it cannot strand retained contents.

Selected-day files, all day-bound bookings, pending planner/booking proposals, Private and Propose-only changes remain protected and unsupported. Exact observation/scope/current authority/operation IDs, stale/lost-reply handling, native history and original-scope HTTP/IndexedDB replay remain enforced. Later work can invalidate the immediate Undo token; a durable Trash browser and conflict-aware recovery are separate gates.

Final-source fresh 112/populated 111→112 qualification passes all 42 new real DB/Auth/TOTP AAL2/HTTP cases on both paths, plus the 28 prior day-recovery cases and four retained SQL suites. The earlier-draft broad run passed 534 distinct functional cases but its final metadata check failed because the harness reused its saved baseline variable; that instrument error and the genuinely failing child-only restore reproduction are retained. A genuine HTTP timeout exposed automatic retries of a deliberate serialization error; aggregate conflicts now return non-retriable HTTP 409 and unsupported child-only recovery uses the existing unsupported-operation code. The corrected final runner records the original baseline and proves it unchanged. Across broad/final runs 540 distinct DB case IDs pass; no duplicate fresh/retry cases are counted. 866 web cases (463 Family +403 native, including 187 controller cases), client typecheck, strict lint, local-target build/25-RPC credential scan, 135 function/120 table privilege checks and 12-native/120-backend source guards pass. Applied migration hashes are captured before application and rechecked at completion; draft/final receipts are separate. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04m-day-visit-note-recovery-*` and `evidence/p04m-2026-11-06/`.

Next are file-linked-day retention/cleanup-race proof and booking date-anchor recovery. Broader history/Trash/conflict handling, private calendar proposals, remaining writers/controller/governance/offline activation and adapted desktop/phone proof remain incomplete. Default bootstrap/FamilyTripBoundary, production and both previews are unchanged. Independent DB-plus-original-object/source restore and hosted qualification remain release gates. Ignored ETL was untouched, is Git-ignored with zero tracked files and has no independently proven source backup. Work remains local, uncommitted and unpushed. Current guarded runner: `python3 supabase/tests/rehearse_trip_day_contents.py --reset-disposable` from FamilyTravelApp, marked temporary API 55331/DB 55332 only; earlier runners are historical. Journals and retained volumes are not independent backups.

## P04n day attachment and original-file recovery — 6 November

The explicit native cohort now retains selected-day attachment links without trashing shared documents or changing their original paths/bytes. Exact immediate Undo restores the same link/day/file identities; independent prior Trash and other day/booking/destination links remain intact. Typed archive FKs and immutable history retain original-file references after restore/unlink; permanent history-aware purge is not installed. Cleanup shares the Trip fence: retention first makes revalidation skip; armed deletion first makes day removal refuse. Missing Storage metadata and future incoming link references refuse the whole operation. Current attachment metadata authority is checked before execution and before cached receipt replay.

The real file handler-to-planner contract exposed missing nullable native DTO fields. The Family adapters now supply the native file-list/link-read contract using actual uploader identity and null for unavailable values, keeping explicit original opening and native presentation. Tests cover native confirmation/history, lost replies, ordinary HTTP and IndexedDB replay with boundary fakes; database tests use real authorization, Auth/TOTP and Storage bytes. 118 distinct final-source real DB/Auth/TOTP AAL2/HTTP cases (30 attachment cases on both fresh 113 and populated 112→113, 42 prior content cases, 28 prior day-recovery cases and 18 Trip aggregate cases), plus 885 web cases (472 Family cohort +10 existing adapter +403 native, including 187 native controller cases). 150 function and 132 private-table privilege checks pass. Five retained SQL suites, typecheck, strict cohort lint, unchanged/improved existing adapter lint findings, local-target build/25-RPC credential scan and 12-native/120-backend preservation guards pass. Applied final migration hashes, prior operation restoration, initial failed fixtures, actual DTO/replay failures and the pre-replay-fix draft are recorded separately. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04n-day-file-recovery-*` and `evidence/p04n-2026-11-06/`.

Overall: recovery and location/visit/timing foundations plus substantial planner orchestration are locally implemented; default rollout is still gated. Next is booking date/anchor recovery, followed by remaining private/calendar/writer/controller/governance/offline work, durable/conflict-aware recovery and adapted desktop/phone acceptance. Day-bound bookings and pending planning changes still block removal. Production, both previews and default startup are unchanged. Independent DB-plus-original-object/source restore and hosted qualification remain unproved. Ignored ETL was untouched, Git-ignored with zero tracked files and no independently proven source backup. Work remains local, uncommitted/unpushed. Current guarded runner: `python3 supabase/tests/rehearse_trip_day_files.py --reset-disposable`, marked temporary API 55331/DB 55332 only; earlier commands are historical. Retained volumes/history are not independent backups.


## P04o independent booking calendar dates — 6 November

Confirmed date-only bookings now retain dates independently of planning days, with checked saves, immutable typed history, active-Trip RLS and the service export allowlist. Fixed instants, existing booking identities and other content remain intact. Unresolved booking proposals block date edits. The explicit website API seam is tested; native booking displays/writers and booked-day recovery are still gated.

Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04o-booking-calendar-dates-*` and `evidence/p04o-2026-11-06/`.

Next: coordinated native date reading/writing and booked-day rebind/Undo, followed by the remaining release gates in the canonical handoff. Default startup, production and both previews are unchanged. The ignored ETL directory was not modified and has no proven independent source backup. Independent DB-plus-original-object/source restore remains unproved. Use only the current marked-stack rehearsal procedure in the contract; earlier packet commands are historical. Work is local, uncommitted and unpushed.


## P04p booked-day recovery and coherent booking reads — 6 November

The explicit native cohort now retains independent bookings across planning-day removal and exact Undo, without retiming confirmed reservations or inventing midnight for date-only/outside-calendar facts. Scoped coherent reads feed the native Bookings detail and planner/history/HTTP/IndexedDB paths; mismatched or invalidated snapshots refresh/refuse. Canonical source visits and endpoints remain preserved. Current reservation authority precedes cached replay, and held bookings refuse physical deletion. Pending proposals and armed-file deletion remain guarded.

Local qualification passes 249 distinct real DB/Auth/TOTP AAL2/HTTP cases: 29 booked-day cases on fresh 115 and populated 114→115, plus 220 retained booking/calendar/recovery cases. Repeated fresh/upgrade cases are counted once. Five retained SQL suites and 518 website cases pass, including 230 actual native planner orchestration cases. Client typecheck (8-GiB heap), strict module lint, local-target build/credential scan, 21 function/search-path checks, 12 private-table privilege/RLS checks, existing service-export grants and 12-native/120-backend source guards pass. Historical lint/advisor identities remain unchanged (16 / 382). The full historical DB and 403-case native suites were not rerun.

Canonical implementation/limits: [P04p handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04p-booked-day-recovery-handoff.md). These are synthetic DB/real-native-consumer cases, not signed-in browser or desktop/phone demo acceptance. Native booking form writes remain guarded; their observed writer/queue contract is next. Default startup, preview, production and image behavior stay unchanged. No feature-complete or deployment-ready claim is made. Local build targets the disposable API and must not be deployed. Independent DB/object/source restore and ignored-ETL backup remain unproved.


## P04q observed booking edit command/form/retry prerequisite — 6 November

The next safe existing-booking writer foundation is local: narrow atomic header/civil-date edits with original observations and current Direct authority; native full-form diffing preserves unchanged metadata and confirmed precision, including hotel/phone hidden fields. Unsupported companion edits refuse before any save. Actual shared form hooks, Family application/Axios and IndexedDB replay are tested. Native form callbacks are **not installed**; mandatory companion-action preflight and fresh coherent hydration are the next packet. This is not signed-in browser/phone acceptance or a deployed form change.

Final qualification passes 279 distinct real DB/Auth/TOTP AAL2/HTTP cases: 30 observed-booking cases on fresh116 and populated115→116, plus 249 retained booking/day/Trip recovery cases. The repeated new cases count once (309 total DB executions). Five retained SQL suites and 560 website tests pass, including 42 new native-form-hook/application/Axios/IndexedDB cases and 230 retained planner orchestration cases. Client typecheck with an 8-GiB heap, strict module lint, disposable-target build/credential scan, nine function/search-path checks, 12 private-table privilege/RLS checks, existing export grants and 12-native/120-backend source guards pass. The full historical DB and 403-case native suites were not rerun. Historical warning/advisor identities are compared with P04p in the evidence; their existence is not reported as zero.

Canonical scope/next steps: [P04q handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04q-observed-booking-edits-handoff.md). Existing native presentation, image variants, production/previews/default bootstrap and carried backend remain unchanged. No billing/schema deployment/transform setting/backfill/sync change. Independent DB/object/source restore and ignored-ETL source backup remain unproved. Local build targets the disposable API; do not deploy it.


## P04r supported native booking callbacks — 6 November

The existing desktop/phone forms now use observed saves for supported existing-booking detail/civil-date edits when the explicit Family cohort is installed. Full-action preflight and immediate file/cost guards prevent half-saves; durable original online intent survives lost replies and close/disposal. Current coherent reads refresh the UI. Creation/deletion, clock changes, linked lifecycles and automatic offline new-form authorship remain guarded.

Current P04r qualification: 767 website tests in 25 files, including 48 actual native booking-callback regressions, 232 planner-cohort cases and retained native booking/file/cost behavior; four additional real local HTTP/Auth/TOTP AAL2 tests through the actual desktop/phone forms; and 99 real database authorization/booking/calendar/recovery cases. Client typecheck, strict lint for the touched Family modules, local-target build/credential scan and 12-native/120-backend source guards pass. Four upstream native components retain the same 14 warning identities (line/complexity counts are recorded); database function lint retains 16 historical warning entries and advisors retain 382 identities. These are not zero-warning claims. No migration, reset or new SQL suite was run in P04r. P04q's fresh116/populated115→116 migration rehearsals, 279 distinct database cases and five SQL suites are prior evidence, not newly rerun results.

This is jsdom native-consumer and real local HTTP evidence, not signed-in hosted/browser/phone visual acceptance. No default startup or preview activation. Canonical [P04r handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04r-native-booking-callbacks-handoff.md) defines the next controller/governance/blocked-intent and release gates. Adapted TREK demo fixtures remain a local/preview acceptance task; synthetic test data is not written to production.

Production and both Cloudflare previews remain unchanged. Default `bootstrap.ts` and `FamilyTripBoundary.tsx` remain pinned; this is an explicitly installed development cohort, not default startup activation or a deployed UI change. Native layout/styles and the carried backend source guards pass. Tours remain disabled. No hosted migration/deployment, full sync/inventory/backfill, billing or transformation-setting change occurred. Work is local, uncommitted and unpushed. Ignored ETL source was untouched, remains Git-ignored with zero tracked files and has no independently proven source backup. Independent DB-plus-original-object/source backup and restore remain unproved; journals and retained local volumes are not independent backups.


## P04s retained-command conflict safety — 6 November

The original native queue's prefer-server behavior reproduced deletion of a Family command. Versioned commands and parked native cohort work now retain their original body/scope/UUID/token. Generic auto-strategies cannot overwrite/discard them; exact retry and unsupported-resolution messages are proved through actual desktop/phone settings, IndexedDB and HTTP. Blocked discard starts no full sync. The larger governance/controller seam remains incomplete; the typed reader loses v2 details and submission still needs coordinated original intent.

P04s passes 928 website tests in 37 files: the retained P04r native/Family tests, 31 new real queue/settings regressions, one new installed-cohort/application regression, the complete 10-file native mutation-queue test set and the existing desktop offline-settings suite. The new tests exercise actual IndexedDB, Axios/HTTP orchestration and unchanged desktop/phone settings controls with HTTP/sync boundaries faked. Typecheck, strict touched Family/new-module lint, local-target build/credential scan and 12-native/120-backend source guards pass. The two edited native infrastructure modules retain the same 22 normalized warning identities; raw before/after line/complexity counts are recorded. Tests run with TZ=UTC, as required by an existing settings date-format assertion. This is not full browser/phone visual acceptance. No database, migration, SQL or live AAL2 suite was rerun: P04r's 99 DB and four live native HTTP cases, and P04q's migration/SQL/ACL proofs remain historical evidence. The unchanged chain contains 116 migrations.

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04s-retained-planner-commands-handoff.md) includes the supported-action matrix and the next typed governance/controller packet. No default activation or hosted UI change. Unsupported export/discard/rebase, offline/cache-clear, demo acceptance and independent restore remain gates.

Default bootstrap/FamilyTripBoundary, production and both previews remain unchanged. Native desktop/phone settings markup was not changed; existing notices report retained-work refusals. No hosted migration/deployment, full sync/inventory/backfill, billing or transformation change occurred. The full-sync manager was faked in tests, including assertions that blocked discard never invokes it. Work remains local, uncommitted and unpushed. The disposable stack remains stopped with retained volumes. The build targets the disposable API and must not be deployed. Ignored ETL source was untouched, remains Git-ignored with zero tracked files and has no independently proven source backup. Independent DB-plus-original-object/source backup and restore remain unproved.

## P04t observed governance and controller handoff — 6 November

The explicit cohort now preserves full typed proposal JSON, captures exact native confirmation/request observations and submits/reviews one durable original command. Concurrent changes refuse; current authority precedes receipt replay; bulk failures roll back all publication. Layer changes fence native editors and stale/released legacy controllers cannot overwrite the cohort. The live native-control test also exposed and repaired an unhandled post-review read. Existing presentation remains intact.

Final local qualification: 964 focused website cases in 38 files, including 33 new actual governance-control/HTTP/IndexedDB regressions and three new installed-cohort/controller cases. Two additional tests use real local Auth/TOTP AAL2, the Supabase SDK/HTTP, native confirmation and review buttons, the full cohort reader bundle and fresh native-store hydration. They prove one real typed publication and refusal of a draft operation added after confirmation opened. No production browser or full desktop/phone visual acceptance is claimed. Typecheck (8-GiB heap), strict lint for the new/touched non-legacy adapters, disposable-target build/credential scan and 12-native/120-backend preservation guards pass. The explicitly linted carried controller/governance modules retain 108 existing findings, including one pre-existing prefer-const error; the hook rename is normalized in the comparison. This is not a clean whole-repository lint claim. DB function lint retains the same 16 historical entries and advisors the same 382 identities, with no new governance findings.

The new suite has 45 cases (24 new governance cases plus 21 inherited proposal cases). It passed on fresh117 and populated116→117. Retained booking-details30 and day/bookings29 cases also passed: 104 distinct database cases, 149 executions. Migration rehearsal proves old public/family_auth row hashes and function definitions/OIDs/grants unchanged, private payloads unchanged, a read is pure, prior day Trash restores original visit/note/file-link identities and original test-object bytes, and a genuine booked midnight retains microseconds. Explicit probes cover 12 function/search-path checks, 12 receipt-table privilege checks, RLS and three preserved export grants. These fixture proofs do not establish independent disaster recovery.

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04t-observed-governance-handoff.md) defines the completed scope and next retained-work recovery/default-offline lifecycle packet. The current local runner is `supabase/tests/rehearse_plan_governance.py --reset-disposable`; all earlier runners/chain counts are historical. No default activation or hosted UI change.

Production, both Cloudflare previews, default bootstrap and FamilyTripBoundary remain unchanged. No hosted migration/deployment, full sync/inventory/backfill, billing or transformation-setting change occurred. No media recipe, original image, media identity, gallery order or legacy API body/grant was changed. The first116 migration sources are unchanged; the local chain now has117. Work remains local, uncommitted and unpushed. The disposable stack is stopped with volumes retained; the older FamilyTravelApp local database remains running with unchanged identity/migration metadata. The local-target build must not be deployed. Ignored ETL source was untouched, remains Git-ignored with zero tracked files, and has no independently proved source backup. Independent DB-plus-original-object/source backup and restore remain unproved.

## P04u retained-work export and cache-clear protection — 6 November

A real pre-repair regression reproduced loss of original commands through Clear cache. The repaired operation refuses within its all-table transaction; existing desktop/phone settings report the refusal and offer a private local export. The export preserves full original queue rows/dependencies and never triggers sync, replay or discard. Enqueue-time retention marking survives disposal before the first flush.

P04u passes1,071 focused website cases in42 files: the964 retained planner/settings/queue cases,35 new export/cache/settings regressions and72 native IndexedDB/cache/upgrade cases. The new cases exercise actual Dexie transactions, the real mutation queue and desktop/phone settings controls, with browser-download/network/sync boundaries faked. They cover every retained status, complete original bodies/IDs/tokens/unknown JSON, dependencies, atomic refusal and rollback, export failure/bounds/credential and unsupported-data refusal, account-connection fencing and preservation after cohort disposal before a flush. No full sync ran. Client typecheck (8-GiB heap), strict new/touched adapter/database lint, local-target build/credential scan and12-native/120-backend preservation guards pass. Four edited existing settings/queue modules retain the same39 normalized warning identities; raw line/complexity values remain in evidence. No new lint suppression was added. TZ=UTC remains necessary for an existing settings date assertion.

No PostgreSQL migration, real Supabase HTTP/Auth suite, SQL authorization suite or signed-in browser/phone visual acceptance was run in this packet. P04t's fresh117/populated116→117,104 distinct DB cases and two real native HTTP tests are historical evidence, not rerun results. All117 migration sources remain byte-for-byte unchanged; the marked disposable stack stayed stopped.

The separate logout audit still reproduces loss through the unchanged database-deletion path. It is a release blocker, not a passing recovery proof. [Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04u-retained-export-cache-guard-handoff.md) prioritizes coordinated logout/account/queue/connection recovery before default activation, broader demo acceptance or preview release.

No production or Cloudflare-preview change, default cohort activation, schema migration, billing/transformation change, image generation/backfill, inventory or sync occurred. The default bootstrap, FamilyTripBoundary, Auth store, legacy server APIs, media recipe/originals/identities/gallery order and carried backend remain unchanged. The conditional export action is the only added settings presentation; existing desktop/phone styles and controls are retained, with English fallback labels. Work remains local, uncommitted and unpushed. The build targets the stopped disposable API and must not be deployed. ETL was untouched, remains Git-ignored with zero tracked files and has no independently proven source backup. Independent DB-plus-original-object/source backup and restore remain unproved.

## P04v logout recovery and queue session boundaries — 6 November

The P04u loss path is now repaired locally. Original Family commands and following queued work stay paused in their original account on logout; read caches/visible Trip data clear. Native auth and queue callbacks are fenced across teardown and re-login. Explicit supported retry keeps original identity/current authority, while unscoped native recovery stays export-only. Queue format 2 preserves recovery semantics; physical IndexedDB schema 14 and all 117 PostgreSQL migration sources are unchanged.

Final P04v qualification passes 1,179 focused website cases in 47 files: the 1,071 retained cases, 39 new real logout/auth/queue/settings regressions and 69 additional native auth/push/cache/sync-trigger cases. The new tests use actual IndexedDB, native authStore logout/login, the queue, desktop/phone retry controls and the checked Family application/Axios handler; external HTTP/RPC/download/sync boundaries are faked. They cover all retained statuses, mixed dependencies, original bytes/IDs/tokens/unknown fields, lost acknowledgements, late success/403/409/500/network replies into another or the same returning account, storage readiness/cleanup/pause failures, changed user/person/Family/source, current revoked authority, stale auth completions, repeated clicks and bounded queue waiting. Full trip sync is faked and never run against a project.

Two additional local SDK tests use Supabase SDK/Auth 2.112.2 with persistent browser storage and the actual carried Family logout route. Successful remote logout and a simulated 500 Auth response both remove the installed SDK's persisted/local session, finish native sign-out, clear read caches and retain originals only in their old account. SDK HTTP login is real; only the 500 sign-out response is faked. The synthetic accounts have no production data. These are Auth tests, not new SQL/RLS/migration proofs. A separate captured pre-packet format 1 queue probe passes one case proving it leaves pending recovered format 2 work unsent and intact. It does not prove old clear/discard UI or an entire rollback release.

Client typecheck (8-GiB heap), strict new/session/cache-module lint, local-target build/credential scan and the 12-file native/120-file backend source guards pass. The existing authStore and mutationQueue retain the same 33 normalized warning identities, with raw line/complexity values recorded and no new suppression. No full website suite or signed-in browser/phone visual acceptance was run. No PostgreSQL migration/reset or SQL authorization suite was rerun; all 117 migration sources remain unchanged. P04t's DB/RLS proofs remain historical evidence.

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04v-logout-recovery-handoff.md) advances the remaining work to broader default/offline/background-reader/full-sync/source/cross-tab/rollback qualification and adapted desktop/phone acceptance. No default or hosted rollout is implied.

Production and both Cloudflare previews remain unchanged. No default cohort activation, hosted schema/migration, billing/transformation change, backfill/inventory or real project sync occurred. Stored variants/approved recipe, originals, media identities/gallery order, the default bootstrap/FamilyTripBoundary and carried backend remain unchanged. The physical IndexedDB schema stays 14; the queue wire-format guard is now 2. Existing native markup/styles and server API contracts are unchanged. Work remains local, uncommitted and unpushed. The disposable stack is stopped with retained volumes; the other local database remains running with unchanged identity/migration metadata. The disposable-target build must not be deployed. ETL was untouched, remains Git-ignored with zero tracked files and has no independently proven source backup. Independent DB-plus-original-object/source backup and restore remain unproved.

## P04w background trip-cache session isolation — 6 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04w-background-session-handoff.md) qualifies captured connection/epoch protection through native login/logout, actual trip sync and background/optional cache paths. Final results: 1,374 focused tests/55 files, typecheck, local build/credential scan and native/backend source guards pass; no new lint findings. This packet ran with fake HTTP/download boundaries only. No migration, real project sync or deployment occurred. P04v retained originals remain preserved. Next: native startup/UI hydration and reconnect continuations, then Family scope/cross-tab/rollback and adapted browser acceptance. Independent restore and ETL source backup remain unproved.

## P04x startup/UI-read/reconnect isolation — 7 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04x-startup-read-session-handoff.md) records 1,686 focused tests/85 files, including 28 new orchestration regressions, plus typecheck, build/credential scan and source guards. Named native reads/settings/feature metadata and reconnect continuations are scoped to their origin. No new lint findings or suppression, database run, migration or deployment. Next: direct write/upload completions and Family scope transitions, then cross-tab/rollback and adapted browser acceptance. Independent restore and ignored ETL source backup remain unproved.

## P04y direct write/upload completion fencing — 7 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04y-direct-write-session-handoff.md) records 1,888 focused tests/100 files, including 18 new orchestration regressions, plus typecheck, build/credential scan and native/backend source guards. Named direct writes, uploads, queue waits and view rollbacks stay with their origin; server commits are not undone or automatically replayed. No new lint findings/suppression, database run, migration or deployment. Next: Family context cache/controller ownership, then remaining paths, cross-tab/rollback and adapted browser acceptance. Independent restore and ignored ETL source backup remain unproved.

## P04z Family context ownership — 7 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04z-family-context-handoff.md): 1,935 focused tests/105 files, 35 new context/request cases, passing typecheck, build/credential scan and native/backend guards. Canonical caches and repository continuations belong to source/user/person/Family plus itinerary layer; stale authority cannot dispatch writes. Stable numeric IDs, retained originals and separate Published/MyDraft snapshots remain intact. No new lint findings/suppressions, database run, schema change or deployment. Remaining handler follow-up dispatch, Auth-derived stores/realtime, other paths, cross-tab/rollback, adapted browser acceptance and independent restore still gate release. Ignored ETL source backup remains unproved.

## P04aa Family Auth/handler/realtime continuations — 7 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04aa-family-continuations-handoff.md) records 1,984 focused tests/109 files, including 36 new actual orchestration cases; typecheck, local build/credential scan and source guards pass. Context-owned Auth flights and stores, per-call handler facades, scoped map cache, MFA assurance/access distinctions and realtime/install cleanup are qualified locally with fakes. No new lint findings/suppressions, SQL/Auth run, schema change or deployment. Internal composite adapters, remaining native caches/jobs, cross-tab/rollback, signed-in browser acceptance and independent restore remain gates. Ignored ETL source backup remains unproved.

## P04ab backend operation continuations — 7 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04ab-backend-operations-handoff.md) records 2,037 client tests/111 files (34 new orchestration cases and 19 existing Collection cases newly included), 269 backend tests/47 files, ten actual carryover-command tests, both typechecks, source guards and local-only build/credential/variant-reader scan. Touched-client lint adds no findings. Six carried adapters and one existing test now have explicit verified local patches; the 120-file baseline is intact, with one recorded helper addition. Uploaded sources are retained after unconfirmed finalization errors. Other composite adapters and remaining native caches are not qualified by this packet. No new SQL/Auth run, schema change, real project sync or deployment. Independent restore and ignored ETL source backup remain unproved.
