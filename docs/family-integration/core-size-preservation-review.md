# Q5 size and source-preservation review

Reviewed 15 November 2026 on `codex/trek-v5.1.4-family-reconcile`, input HEAD `908712874ba7e5c68540caf6859ed05c825b66a2`. Qualified application/test source remains `9db9f48a898f24963b931dee5610478c23801257`; TREK 5.1.4 remains `2bcfc1bfcbbff0affd097c0f789c835396389572`. This review changes documentation only. [Acceptance and continuation](core-quality-preservation-handoff.md); [next executable packet](core-release-costs-tests-packet.md).

## Decision

The actual size check still fails on the same 44 paths as Q4. Three are tests, eleven are JavaScript modules emitted by the ordinary application build, and thirty are retained legacy files outside that build. None of the 44 directly overlaps the twelve exact native-presentation pins or the complete backend carryover inventory. All 44 current Git blobs and modes equal their qualified source. Nine exist upstream but are already reviewed Family exceptions, not byte-exact upstream files; the other 35 are qualified Family additions.

There is no direct exact-file preservation conflict preventing a compatible repair. There are still important behavior/provenance constraints: extraction must preserve native rendering, queue/session/permission semantics, complete retained source and exact per-file qualification. Do not replace the current files wholesale with upstream code and lose Family behavior. Do not exempt a file because its directory says `legacy`.

**Proceed with T1, a test-only Costs suite decomposition.** Its 116 existing cases pass freshly. T2 and T3 also have fresh passing baselines (126 and 187 respectively). Review the retained-entry closure R before deciding to modularize thirty unshipped legacy files. N and L are bounded follow-up workstreams, not authorization for one large application rewrite. No source, baseline, qualification or retention policy is changed by Q5.

## Evidence and its limits

The installed Vite resolver traced static and lazy imports from `client/index.html` using the ordinary HTTPS profile, all qualification markers empty, the unchanged configuration and pinned Node 24.22.2. The non-emitting analysis recorded 3,254 project modules and 395 chunks; 410 generated JavaScript/CSS/HTML outputs match the accepted Q4 artifact bytes exactly. `build.write=false` prevented output writes; exactly the PWA build plugin's post-bundle `closeBundle` writer was suppressed to avoid creating a service worker. Transforms and bundle-generation hooks were retained. This is an import/output analysis, not a fresh complete PWA build or browser/deployment qualification.

A separate index scanned 10,287 tracked source/test/helper files for literal relative imports, re-exports, dynamic imports, require calls, type imports and CSS imports. Its incoming-reference examples below are supplementary: aliases and package exports are resolved by the actual build graph, while the raw relative index alone proves no global absence. Every R file has retained incoming references. For example, legacy `App.tsx` lazily imports legacy `TripPlannerPage.tsx`, legacy `main.tsx` imports `index.css`, and `collectionsPage.css` imports `styles/collections.css`.

Thirty files being absent from this ordinary build does not establish they are unused in every entry, device/native profile, test, harness or reference-source contract. In particular, `client/vite.native.config.js`, conditional `client/device-work-recovery.html`, legacy `main.tsx`/`App.tsx`, dynamic retry imports in both `utils/lazyWithRetry.ts` files and test harness entry builders need closure review before retirement. An emitted module does not mean every feature/control in it is enabled or qualified.

The unchanged three oversized suites passed 429 tests, with zero failures or pending cases. No application/test source was edited and no new services, SQL, browser sessions, hosted checks, backup or media process ran. Q4's browser/DB results retain their original scope; this review does not convert them into hosted writer or independent restoration acceptance.

## Ordered workstreams and bounded follow-ups

1. **T1 — Costs tests, next.** Only the existing Costs test, co-located split suites and typed test helpers; exact stale baseline reductions and reviewed source-row metadata follow completion. Preserve all 116 cases. The executable packet fixes the detailed allowlist, commands and acceptance rules.
2. **R — entry/retention closure review.** Analysis and a concrete proposal only until closure is proved. Review all thirty listed R files plus their complete dependency/importer closure across ordinary/native/device/test/harness/build entries. Keep hashes, modes, licenses, historical source and runtime capabilities. Do not implement removal or source relocation as part of T1.
3. **T2/T3 — remaining test decompositions.** Separate coherent test-only slices for `DayDetailPanel.test.tsx` and `useTripPlanner.test.tsx`, with co-located suites and typed helpers; preserve the fresh 126/187 case inventories and the original 292 planner-cohort cases. Each suite must meet the actual 2,000 wrapped-line rule, each helper the 1,000 rule. Only that slice's stale size/format entries may shrink; all other baselines stay exact. Run the actual three-file baseline command below, replacing only the split path with the explicit new suite list.
4. **N — six emitted native-derived exceptions.** Split by domain: Costs/PlaceInspector, phone packing, Login, assistant and mutation queue. Permitted runtime edits for each future packet are only its listed target plus necessary co-located pure models/helpers, directly affected tests and exact qualification metadata; prohibit layout/CSS/permission/feature/schema changes. Prefer non-rendering typed computations or protocol helpers; keep JSX, DOM order, styling, accessibility, state ownership and original operation/lease/revision/serialization behavior intact. Three targets have ratchet allowances; satisfy their current allowance or remove it by meeting the base rule. The other three must meet 1,000. Prepare a specific target allowlist and before/after lint/test baseline before each slice; do not treat this grouped recommendation as an implementation packet.
5. **L — five emitted legacy additions.** Preserve the installed Auth/API, Admin and map/fallback chains. Separate API methods into coherent domains using the existing Axios instance, headers and error contract; do not introduce alternate auth clients. MapView and MapViewGL may share pure geography helpers while retaining each renderer and separate GL chunks. Extract controller backend operations without moving permission/state ownership or bypassing `FamilyTripBoundary`. Admin extraction must not enable plugins or change admission. Limit a future slice to its listed module(s), necessary typed helpers, focused tests and exact qualification metadata. Never delete these five because another legacy file is outside the build.

Representative installed commands (from `client/`, using pinned Node on PATH; choose the affected domain, not every command for every slice):

```sh
../node_modules/.bin/vitest run src/components/Budget/CostsPanel.test.tsx src/components/Planner/DayDetailPanel.test.tsx src/pages/tripPlanner/useTripPlanner.test.tsx --maxWorkers=3 --reporter=json
../node_modules/.bin/vitest run src/components/Budget/CostsPanel.helpers.test.ts src/components/Budget/useCostsLedger.test.ts tests/unit/sync/mutationQueue.budget.test.ts tests/unit/mobile/trip/MCostsTab.test.tsx --maxWorkers=3
npm run typecheck
npm run lint:format
npm run lint:size
```

For future queue/Auth/map/controller/packing slices, derive the exact installed test paths from real direct consumers before editing, include original-operation/session/retirement refusal cases and qualify changed emitted behavior with the actual ordinary build and appropriate desktop/phone flows. A fresh source pin alone is not functional acceptance. All four source/native/Git/carryover guards and local publication/archive retention remain required.

## Retained-source options

**Preserve in place and modularize:** retains all entry/reference contracts with the least policy change, but may spend substantial work on code absent from the ordinary app. It requires normal per-file qualification and tests; this is the fallback if closure is unproved.

**Separately reviewed reference-source separation/retirement:** potentially avoids needless refactoring, but needs complete entry/test/profile closure and a concrete original-path → retained-path/mode/hash manifest, preserved notices/history and full matching-source archive. Any design must fail closed on missing/tampered retained files and new runtime imports into reference-only source, prove all affected tests/harnesses still resolve, and demonstrate identical emitted runtime before changing gate scope. An archive existing somewhere is insufficient. A retention/gate change is a separate reviewed implementation, not an implied size waiver. Any unresolved consumer keeps its files in the active repair set.

Neither option authorizes deleting backend carryover, changing native presentation, blanket exclusions, compressed/minified source or larger baselines. The review recommends closure analysis before choosing; it does not claim all thirty can be retired.

## Complete 44-path inventory

Counts are the actual 120-column wrapped-line measure, not physical lines. `baseline` means the current per-file ratchet allowance; absent entries use the default source/style limit 1,000 or test limit 2,000. The current and qualified OID are identical for every record. Modes/byte sizes and supplementary complete importer evidence are sealed with this review. Every record has `native exact pin: no; backend carryover inventory entry: no`.

### T1: Costs test decomposition (1)

1. [client/src/components/Budget/CostsPanel.test.tsx](../../client/src/components/Budget/CostsPanel.test.tsx) — **2739**, default 2000; baseline 2730; 9 over allowed.

   Current = qualified `b4cb82bd68bd3e9823b35a045a78882ec7fa3b24`, mode `100644`, 137910 bytes; qualified exception. Upstream: `155d23528bb5843cf29ff71f65dc85d3b2ca3f32` (differs). Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **test-only; absent from ordinary app graph**. No incoming literal relative reference in the supplementary index; this is not a global unused-code proof.

### T2: DayDetail test decomposition (1)

1. [client/src/components/Planner/DayDetailPanel.test.tsx](../../client/src/components/Planner/DayDetailPanel.test.tsx) — **2339**, default 2000; baseline 2333; 6 over allowed.

   Current = qualified `9df29c29a32877c1b9d4396e4796c9e3497c511f`, mode `100644`, 107273 bytes; qualified exception. Upstream: `17b4b852e8338955da42d90314cde833a656d27f` (differs). Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **test-only; absent from ordinary app graph**. No incoming literal relative reference in the supplementary index; this is not a global unused-code proof.

### T3: planner hook test decomposition (1)

1. [client/src/pages/tripPlanner/useTripPlanner.test.tsx](../../client/src/pages/tripPlanner/useTripPlanner.test.tsx) — **3271**, default 2000; baseline 3270; 1 over allowed.

   Current = qualified `47620c5b53f576be427ebd78d6002eb0e3421295`, mode `100644`, 137560 bytes; qualified exception. Upstream: `b305e8c5d4942fdd8cb6f322483e14ce3b8fed19` (differs). Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **test-only; absent from ordinary app graph**. No incoming literal relative reference in the supplementary index; this is not a global unused-code proof.

### N: emitted native-derived exceptions (6)

1. [client/src/components/Budget/CostsPanel.tsx](../../client/src/components/Budget/CostsPanel.tsx) — **1801**, default 1000; baseline 1798; 3 over allowed.

   Current = qualified `79c8a532cefbfe3f362557bb1ff329b7685f5fd5`, mode `100644`, 97009 bytes; qualified exception. Upstream: `5eb46e5545fe079078bf9a261e8e1bb028771814` (differs). Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/pages/TripPlannerPage.tsx` (dynamic) → `client/src/pages/tripPlanner/plannerLazy.ts` (static) → `client/src/components/Budget/CostsPanel.tsx` (dynamic). Supplementary relative incoming references: 18; example `client/src/components/Budget/CostsPanel.delete.test.tsx:11` (import).

2. [client/src/components/Planner/PlaceInspector.tsx](../../client/src/components/Planner/PlaceInspector.tsx) — **1299**, default 1000; baseline 1287; 12 over allowed.

   Current = qualified `82d5bd70f8b391e7e0bd9f9179c4b0f3199864e0`, mode `100644`, 63732 bytes; qualified exception. Upstream: `dc1e87eb5fad1f20999b9e939607ed4a8fa170fa` (differs). Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/pages/TripPlannerPage.tsx` (dynamic) → `client/src/components/Planner/PlaceInspector.tsx` (static). Supplementary relative incoming references: 3; example `client/src/components/Planner/PlaceInspector.test.tsx:56` (import).

3. [client/src/mobile/screens/trip/tabs/MPackingListTab.tsx](../../client/src/mobile/screens/trip/tabs/MPackingListTab.tsx) — **1054**, default 1000; baseline none; 54 over allowed.

   Current = qualified `1fcbf1d7e18955324b4e840cd632510e1c845c4e`, mode `100644`, 50538 bytes; qualified exception. Upstream: `925569fe4e41afa1ed0a02c01248020e9b433398` (differs). Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/mobile/screens/trip/MTripShell.tsx` (dynamic) → `client/src/mobile/screens/trip/tabs/MTripTabPanel.tsx` (static) → `client/src/mobile/screens/trip/tabs/MListsTab.tsx` (static) → `client/src/mobile/screens/trip/tabs/MPackingListTab.tsx` (static). Supplementary relative incoming references: 10; example `client/src/integrations/family/nativePackingAggregates.test.tsx:12` (import).

4. [client/src/pages/LoginPage.tsx](../../client/src/pages/LoginPage.tsx) — **1300**, default 1000; baseline 1294; 6 over allowed.

   Current = qualified `77ddf0dac70ade5b38cb349ca6ecb98301dd9868`, mode `100644`, 53964 bytes; qualified exception. Upstream: `2945ae510b07f26d8139eae1b965e9ceba1e73bf` (differs). Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/pages/LoginPage.tsx` (static). Supplementary relative incoming references: 4; example `client/src/App.tsx:21` (import).

5. [client/src/store/assistantStore.ts](../../client/src/store/assistantStore.ts) — **1053**, default 1000; baseline none; 53 over allowed.

   Current = qualified `4a3dc7c522fd8bb9c0471724ec643eb39df54fac`, mode `100644`, 44452 bytes; qualified exception. Upstream: `3c0156f9230f3385127b41245ffc452460b9ae2b` (differs). Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/components/Assistant/AssistantHost.tsx` (dynamic) → `client/src/store/assistantStore.ts` (static). Supplementary relative incoming references: 116; example `client/src/components/Admin/addons/AiAdminConfig.test.tsx:8` (import).

6. [client/src/sync/mutationQueue.ts](../../client/src/sync/mutationQueue.ts) — **1103**, default 1000; baseline none; 103 over allowed.

   Current = qualified `d4e0d3696ea2e810b5429fbbdb7bac2e7e414cb8`, mode `100644`, 54300 bytes; qualified exception. Upstream: `05ba4a3dc0e4cfaff14f4414e91560231fe9ba81` (differs). Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/store/authStore.ts` (static) → `client/src/sync/mutationQueue.ts` (static). Supplementary relative incoming references: 118; example `client/src/components/Layout/OfflineBanner.test.tsx:14` (import).

### L: emitted legacy additions (5)

1. [client/src/integrations/family/legacy/api/client.ts](../../client/src/integrations/family/legacy/api/client.ts) — **1510**, default 1000; baseline none; 510 over allowed.

   Current = qualified `19bd0b4e11833206230a04beff9884dd2a2cc48c`, mode `100644`, 76827 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/integrations/family/legacy/store/authStore.ts` (static) → `client/src/integrations/family/legacy/api/client.ts` (static). Supplementary relative incoming references: 134; example `client/src/integrations/family/legacy/api/collections.ts:24` (import).

2. [client/src/integrations/family/legacy/components/Admin/AdminPluginsPanel.tsx](../../client/src/integrations/family/legacy/components/Admin/AdminPluginsPanel.tsx) — **2669**, default 1000; baseline none; 1669 over allowed.

   Current = qualified `29e5222d827d3ce4e8cf78fb71701a0508578aaa`, mode `100644`, 109428 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/integrations/family/FamilyAdminPage.tsx` (dynamic) → `client/src/integrations/family/legacy/pages/AdminPage.tsx` (static) → `client/src/integrations/family/legacy/components/Admin/AdminPluginsPanel.tsx` (static). Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/AdminPage.tsx:25` (import).

3. [client/src/integrations/family/legacy/components/Map/MapView.tsx](../../client/src/integrations/family/legacy/components/Map/MapView.tsx) — **1048**, default 1000; baseline none; 48 over allowed.

   Current = qualified `4b9250065e79efcbe58844dbbe6eae4bade0962c`, mode `100644`, 38437 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/integrations/family/FamilyTripBoundary.tsx` (static) → `client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx` (static) → `client/src/integrations/family/legacy/components/Map/MapViewAuto.tsx` (static) → `client/src/integrations/family/legacy/components/Map/MapView.tsx` (static). Supplementary relative incoming references: 5; example `client/src/integrations/family/legacy/components/Admin/DefaultUserSettingsTab.tsx:16` (import).

4. [client/src/integrations/family/legacy/components/Map/MapViewGL.tsx](../../client/src/integrations/family/legacy/components/Map/MapViewGL.tsx) — **1455**, default 1000; baseline none; 455 over allowed.

   Current = qualified `3cb97ccb3bc1b46d97390c55863d2ab484c34cc9`, mode `100644`, 62017 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/integrations/family/FamilyTripBoundary.tsx` (static) → `client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx` (static) → `client/src/integrations/family/legacy/components/Map/MapViewAuto.tsx` (static) → `client/src/integrations/family/legacy/components/Map/familyGlLazy.tsx` (static) → `client/src/integrations/family/legacy/components/Map/MapViewGL.tsx` (dynamic). Supplementary relative incoming references: 2; example `client/src/integrations/family/legacy/components/Map/familyGlLazy.tsx:19` (dynamic-import).

5. [client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx](../../client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx) — **1322**, default 1000; baseline none; 322 over allowed.

   Current = qualified `66145581ce328493d177ac22ce6aebe8f431877b`, mode `100644`, 47676 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **emitted JavaScript**. Resolved witness: `client/index.html` (entry) → `client/src/main.tsx` (static) → `client/src/App.tsx` (static) → `client/src/integrations/family/FamilyTripBoundary.tsx` (static) → `client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx` (static). Supplementary relative incoming references: 1; example `client/src/integrations/family/FamilyTripBoundary.tsx:7` (import).

### R: retained legacy outside this ordinary build (30)

1. [client/src/integrations/family/legacy/components/Budget/CostsPanel.tsx](../../client/src/integrations/family/legacy/components/Budget/CostsPanel.tsx) — **3470**, default 1000; baseline none; 2470 over allowed.

   Current = qualified `4c270a0f9ef81b47da1c4ea08ebe593fe9dccf73`, mode `100644`, 128795 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:23` (import).

2. [client/src/integrations/family/legacy/components/Budget/CostsPanelFamily.tsx](../../client/src/integrations/family/legacy/components/Budget/CostsPanelFamily.tsx) — **3190**, default 1000; baseline none; 2190 over allowed.

   Current = qualified `707a7f4c937d36cfdcb2f1cc2a86a7b0b00b5370`, mode `100644`, 116905 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx:19` (import).

3. [client/src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.tsx](../../client/src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.tsx) — **1003**, default 1000; baseline none; 3 over allowed.

   Current = qualified `f180883c8b1afcefa82aee0d9ad1624f09c7334b`, mode `100644`, 34742 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 2; example `client/src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.test.tsx:9` (import).

4. [client/src/integrations/family/legacy/components/Packing/PackingListPanelItemRow.tsx](../../client/src/integrations/family/legacy/components/Packing/PackingListPanelItemRow.tsx) — **1115**, default 1000; baseline none; 115 over allowed.

   Current = qualified `fd3f20dbb92c0717d51a26c96f743d00e6d40eaf`, mode `100644`, 41644 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/components/Packing/PackingListPanelCategoryGroup.tsx:23` (import).

5. [client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.tsx](../../client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.tsx) — **1034**, default 1000; baseline none; 34 over allowed.

   Current = qualified `e968d1be1dcbd2fff98597547c5d044fff525872`, mode `100644`, 35084 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 2; example `client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.test.tsx:13` (import).

6. [client/src/integrations/family/legacy/components/Planner/DayDetailPanel.tsx](../../client/src/integrations/family/legacy/components/Planner/DayDetailPanel.tsx) — **1848**, default 1000; baseline none; 848 over allowed.

   Current = qualified `9839d6c456aa3ecd9d96963897f9e8090ea50ea1`, mode `100644`, 69636 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:7` (import).

7. [client/src/integrations/family/legacy/components/Planner/DayPlanSidebar.tsx](../../client/src/integrations/family/legacy/components/Planner/DayPlanSidebar.tsx) — **3914**, default 1000; baseline none; 2914 over allowed.

   Current = qualified `324359bfbdd226205dd20a5812cfdde5751f24ee`, mode `100644`, 187295 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:8` (import).

8. [client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.tsx) — **1557**, default 1000; baseline none; 557 over allowed.

   Current = qualified `bf65ca8a00682fba6bace5ed0cf6a01dbe07f51a`, mode `100644`, 52475 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 3; example `client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.tsx:45` (import).

9. [client/src/integrations/family/legacy/components/Planner/PlaceInspector.tsx](../../client/src/integrations/family/legacy/components/Planner/PlaceInspector.tsx) — **1842**, default 1000; baseline none; 842 over allowed.

   Current = qualified `b10f1d6ee0ad062b521fcb4f31d3fb22187ad1bf`, mode `100644`, 68249 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 2; example `client/src/integrations/family/legacy/components/Planner/family/FamilyPlaceInspector.tsx:7` (import).

10. [client/src/integrations/family/legacy/components/Planner/ReservationModal.tsx](../../client/src/integrations/family/legacy/components/Planner/ReservationModal.tsx) — **1085**, default 1000; baseline none; 85 over allowed.

   Current = qualified `4ef4878dd39092c4d8b4d567ee33fb11d5c1c5a5`, mode `100644`, 45436 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:12` (import).

11. [client/src/integrations/family/legacy/components/Planner/ReservationsPanel.tsx](../../client/src/integrations/family/legacy/components/Planner/ReservationsPanel.tsx) — **1556**, default 1000; baseline none; 556 over allowed.

   Current = qualified `23111a24fdc130701777f6b192e14672b8ef0e42`, mode `100644`, 58480 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:30` (import).

12. [client/src/integrations/family/legacy/components/Planner/TransitSearchPanel.tsx](../../client/src/integrations/family/legacy/components/Planner/TransitSearchPanel.tsx) — **1132**, default 1000; baseline none; 132 over allowed.

   Current = qualified `88eb4aedeab06f2691d8245230acdde7b6d186f6`, mode `100644`, 40522 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/components/Planner/TransportModal.tsx:49` (import).

13. [client/src/integrations/family/legacy/components/Planner/TransportModal.tsx](../../client/src/integrations/family/legacy/components/Planner/TransportModal.tsx) — **1703**, default 1000; baseline none; 703 over allowed.

   Current = qualified `1d2d2028d70bd04f72a3dfc4d43afabca84c0bbd`, mode `100644`, 74115 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:14` (import).

14. [client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.tsx](../../client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.tsx) — **1127**, default 1000; baseline none; 127 over allowed.

   Current = qualified `9ec77c4613c5f2dc05512e5bfa0c82dd60777723`, mode `100644`, 38812 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 3; example `client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.test.tsx:19` (import).

15. [client/src/integrations/family/legacy/components/Settings/AccountTab.tsx](../../client/src/integrations/family/legacy/components/Settings/AccountTab.tsx) — **1030**, default 1000; baseline none; 30 over allowed.

   Current = qualified `6b2f310d1d924749e65614fba2d9ea6ac5e624cf`, mode `100644`, 40885 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/SettingsPage.tsx:6` (import).

16. [client/src/integrations/family/legacy/components/Settings/IntegrationsTab.tsx](../../client/src/integrations/family/legacy/components/Settings/IntegrationsTab.tsx) — **1406**, default 1000; baseline none; 406 over allowed.

   Current = qualified `3583f2cc32b4321d31f4fff98c5d8ff7e020239b`, mode `100644`, 52379 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/SettingsPage.tsx:9` (import).

17. [client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeModal.tsx](../../client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeModal.tsx) — **1100**, default 1000; baseline none; 100 over allowed.

   Current = qualified `84b17ab89586017764b1ed58a32d4df33f312daa`, mode `100644`, 43499 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeHost.tsx:4` (import).

18. [client/src/integrations/family/legacy/components/Todo/TodoListPanel.tsx](../../client/src/integrations/family/legacy/components/Todo/TodoListPanel.tsx) — **1454**, default 1000; baseline none; 454 over allowed.

   Current = qualified `3eb675f068c5afcb8faf4844730d5db07c60ac4b`, mode `100644`, 49968 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/components/Todo/ListsContainer.tsx:9` (import).

19. [client/src/integrations/family/legacy/components/Trips/TripMembersModal.tsx](../../client/src/integrations/family/legacy/components/Trips/TripMembersModal.tsx) — **1109**, default 1000; baseline none; 109 over allowed.

   Current = qualified `123d944a8ac70e28e85c53b851456de5fad58243`, mode `100644`, 39556 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:17` (import).

20. [client/src/integrations/family/legacy/index.css](../../client/src/integrations/family/legacy/index.css) — **1740**, default 1000; baseline none; 740 over allowed.

   Current = qualified `16f54abfb18be1684aac39804df156a5823b3b3b`, mode `100644`, 47220 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/main.tsx:22` (import).

21. [client/src/integrations/family/legacy/pages/AtlasPage.tsx](../../client/src/integrations/family/legacy/pages/AtlasPage.tsx) — **1582**, default 1000; baseline none; 582 over allowed.

   Current = qualified `84cda34c2922cd757c2779569304ca2d958268e7`, mode `100644`, 61486 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/App.tsx:58` (dynamic-import).

22. [client/src/integrations/family/legacy/pages/DashboardPage.tsx](../../client/src/integrations/family/legacy/pages/DashboardPage.tsx) — **1387**, default 1000; baseline none; 387 over allowed.

   Current = qualified `432308d94f9a8c0511e712f4451cd337df06d6bd`, mode `100644`, 52580 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/App.tsx:19` (import).

23. [client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx](../../client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx) — **2122**, default 1000; baseline none; 1122 over allowed.

   Current = qualified `98c348eda49aecb57e44c34eb902e3d0149253b3`, mode `100644`, 76141 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:39` (import).

24. [client/src/integrations/family/legacy/pages/LoginPage.tsx](../../client/src/integrations/family/legacy/pages/LoginPage.tsx) — **1455**, default 1000; baseline none; 455 over allowed.

   Current = qualified `21c7dcbb8947d21b213225c63a3ccfd5785f9e44`, mode `100644`, 58771 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/App.tsx:26` (import).

25. [client/src/integrations/family/legacy/pages/SharedTripPage.tsx](../../client/src/integrations/family/legacy/pages/SharedTripPage.tsx) — **1148**, default 1000; baseline none; 148 over allowed.

   Current = qualified `a434e71181b670b5bf0bfe4cd3857faa243e79e0`, mode `100644`, 47802 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/App.tsx:31` (import).

26. [client/src/integrations/family/legacy/pages/TripPlannerPage.tsx](../../client/src/integrations/family/legacy/pages/TripPlannerPage.tsx) — **1471**, default 1000; baseline none; 471 over allowed.

   Current = qualified `f1663d541c4de602c074b99a579f0653dd88a9fc`, mode `100644`, 58469 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/App.tsx:54` (dynamic-import).

27. [client/src/integrations/family/legacy/pages/atlas/useAtlas.ts](../../client/src/integrations/family/legacy/pages/atlas/useAtlas.ts) — **1002**, default 1000; baseline none; 2 over allowed.

   Current = qualified `ae205f7d909f8e31a74174e074d0bc1b199d4c04`, mode `100644`, 39851 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/AtlasPage.tsx:21` (import).

28. [client/src/integrations/family/legacy/pages/tripPlanner/useTripPlanner.ts](../../client/src/integrations/family/legacy/pages/tripPlanner/useTripPlanner.ts) — **1351**, default 1000; baseline none; 351 over allowed.

   Current = qualified `84b942a847290945bf3559a96fd93a4b05d06860`, mode `100644`, 52675 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:40` (import).

29. [client/src/integrations/family/legacy/styles/collections.css](../../client/src/integrations/family/legacy/styles/collections.css) — **1750**, default 1000; baseline none; 750 over allowed.

   Current = qualified `16a46b26d308f651f2b82854bd50886ef2772ff3`, mode `100644`, 40320 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 1; example `client/src/integrations/family/legacy/styles/collectionsPage.css:3` (css-import).

30. [client/src/integrations/family/legacy/styles/dashboard.css](../../client/src/integrations/family/legacy/styles/dashboard.css) — **2023**, default 1000; baseline none; 1023 over allowed.

   Current = qualified `3430d2317e40de6d440c736989f22573bfde2d78`, mode `100644`, 48530 bytes; qualified addition. Upstream: no file at this path in upstream 5.1.4. Native exact pin: no; backend carryover entry: no.

   Ordinary profile: **not loaded by ordinary build**. Supplementary relative incoming references: 2; example `client/src/integrations/family/legacy/pages/DashboardPage.tsx:49` (import).

## Release boundary

This review resolves the inventory/ordering question, not the 44 failures themselves. Source qualification stays Q4: 376 exceptions/2,697 additions; all twelve exact native files and backend inventory stay unchanged. Quality, current hosted ledger/API/engine/timezone/protection checks, independent database-plus-files restoration, original HTTPS writer/retry/retirement acceptance and actual Worker/matching-source binding remain separate release prerequisites. No preview update or merge to main is approved by this document.
