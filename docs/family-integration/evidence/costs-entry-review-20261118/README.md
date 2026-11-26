# Q99 Costs entry review

Reviewed the integration checkout at the pinned Q98 commit. This review does not describe the currently hosted preview, which remains unchanged. No runtime, UI, backend, schema, feature, source policy or compiler/configuration file changes.

## What the candidate uses

Current desktop entry: client/index.html → src/main.tsx → src/App.tsx → src/pages/TripPlannerPage.tsx → src/pages/tripPlanner/plannerLazy.ts → src/components/Budget/CostsPanel.tsx. The native ledger uses budgetRepo and the Family transport/handler/repository ports. The Family budget handler is reached through main.tsx → Family bootstrap → applicationHandler → budgetHandler. Phone Costs uses the native phone surface and shared ledger.

The retained string-id CostsPanelFamily is reached from the separate old legacy main/App/planner/workspace chain, with no static or literal lazy-import path from the reviewed current entries. It is not the component the current candidate displays. The numeric view IDs in native TREK remain mapped to canonical Family identities by the adapters; this review does not replace them or change the schema.

## Scope and limits of the graph

review_graph.mjs parses runtime-emitted imports, re-exports, literal lazy imports, import-meta URL assets and stylesheet imports. It traverses the current ordinary entry, the separately qualified recovery entry, classic shell scripts and service-worker push script. All 7,506 reviewed code modules have input hashes. Current native Costs, Family budget handler and historical retained Costs are positive controls. A synthetic direct legacy import is added only to the in-memory graph and correctly changes reachability; it is then removed. No installed scanner or configuration is changed.

The current graph has no unresolved local module edge. Two dynamic mechanisms remain explicitly reviewed, not guessed away: mascotClips imports only clip assets through its literal mp4 glob; lazyWithRetry retries the URL named in a failed chunk error. The retry is not statically enumerable and can reference an older cached build. Vite's current HTML inputs/aliases/public-config/build-descriptor plugins do not select legacy App. This is conservative import evidence, not a proof that every retained file can be deleted. Tests, tooling, source qualification, old-version recovery, public exports and explicit alternative/manual entry support need a separate retirement decision.

All 30 remaining size failures have no path from those reviewed current entries. Their hashes and historical witnesses remain in runtime-review.json. None was removed, moved, excluded, relabeled as accepted, or given a larger allowance. The actual size gate still exits 1 with the exact same 30 failure lines.

## Runtime contracts checked

660 existing desktop/phone Costs and Family adapter/permission/session cases pass, with zero failures or skips. These cover ledger reads/filters/summary/CSV, forms and receipt/FX behavior, settlement queues, canonical trip reading, native permission presentation, canonical expense/payer mapping, and session/trip-switch isolation. Ports are controlled; no live database, Supabase permission exercise, provider, authenticated browser or new writer admission is claimed. test-files.json identifies the actual suites; costs-result.json records the command.

All four current native/source/Git/backend guards pass. Every application/test/build/configuration/policy byte remains identical to the reviewed Q98 checkpoint, as do its 128 fixed declaration files plus seven source/test inputs. Q98's build/compiler/warning acceptance is inherited at exactly those inputs; no fresh build/compiler/full warning run is claimed. New review and handoff documentation does not justify repeating or relabeling those measurements.

Replay the graph with `node review_graph.mjs /absolute/path/to/FamilyTravelSite /private/tmp/new-review.json` using the installed project TypeScript. Compare its graph digest and witnesses at the recorded commit. The test runner uses the recorded checkout path; for another checkout, copy it to a fresh temporary directory and replace only W with that checkout path, keeping the suite list/runtime/ports unchanged.

## Decision

Use the planned pre-production cleanup checkpoint next, beginning with the old bootstrap/planner island. Do not spend further UI-refactor packets on all retained findings merely to reduce counts. Retirement needs complete runtime/test/tool/config/source-contract proof, meaningful affected tests, a fresh source-bound build/compiler/gates/archive and an exact private checkpoint. Active adapters and permission/recovery/media identities remain in place. Production, preview, main, canonical backend, verified backup and ignored ETL are untouched.
