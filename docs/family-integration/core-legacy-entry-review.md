# Q7 retained legacy source: entry, type and test closure

Reviewed15November2026 on `codex/trek-v5.1.4-family-reconcile`, input `1f3d9dedd036922491a1d4dcf2614cf54f48ed26`; qualified source stays `dc1b47e35bbbd8dd2c0f2e788f11f9f60f54f6d2`, upstream TREK5.1.4. [Q6 acceptance](core-quality-costs-tests-handoff.md), [Q7 handoff](core-quality-legacy-entry-handoff.md), [next executable repair](core-release-day-detail-tests-packet.md).

## Decision

**Keep all30 files in place for now. Do not classify their full dependency tree as reference-only or delete/exclude it.** Four have current test consumers and three occur in the actual web TypeScript program. Their975-node resolved source dependency union shares356 loaded modules with the accepted ordinary build;293 have positive rendered output in its actual JavaScript chunks. The transitive importer union contains69 nodes, including live entry/boundary files through type references. This is an overlapping source graph, not a sealed obsolete package.

The four directly/transitively tested findings are `ExploreEntityDetailPanel`, `BookingsPanelFamily`, `FamilyTransportEditor` and `TransportsPanelFamily`. Three of these (all except BookingsPanelFamily) occur in the actual TypeScript program. The other26 are retained legacy-entry/reference candidates in this bounded model, **not approved for retirement**: all30 remain referenced through the retained legacy main/App tree. No location move is proposed as viable without further deliberate boundary changes, so there is no invented old-path→new-path relocation manifest or gate exception in this review.

Next is the compatible **DayDetailPanel test-only split**, preserving its126 existing cases. Stop treating absent ordinary emission as permission to rewrite old UI or delete source. The remaining quality debt stays explicit. Any eventual reference-source separation must be one coherent, separately reviewed implementation with full retained identities and dependency-boundary tests; do not split this review into thirty automatic audits/refactors.

## Entry and configuration inventory

- Ordinary web: root `build:web` builds Family shared compatibility, TREK shared, then the client. `client/index.html` loads public pre-paint/build/shell scripts and `/src/main.tsx`; `client/vite.config.js` owns the ordinary app. Q6 proves3,788 runtime files byte-exact to Q4. This review reuses Q5's installed resolved Vite graph after verifying **3,192 distinct tracked module files** still match their original hashes. Virtual/query modules are not counted as distinct tracked files. No new build or browser qualification is claimed.
- Native address screen: `client/package.json` `build:native` selects `client/vite.native.config.js`. Its root is `client/native-shell`, publicDir is off and output is native-dist. It does **not** extend the full web Vite config. Its HTML loads native-shell/main.ts, Capacitor/address/auth helpers, scenery and locale strings. The native locale glob expands28 tracked files. The resolved source closure has no R finding; this is static entry analysis, not a native device acceptance run.
- Device recovery: conditional `deviceRecoveryEntry()` in `client/vite.config.js:32` adds `device-work-recovery.html` only after the existing source/profile gate. That HTML loads `src/integrations/family/deviceRecovery/main.ts`, which uses unattributed local work export and its independent consent/gate. Its source closure has no R finding. No marker was enabled, utility opened, browser work exported or existing gate changed.
- Retained legacy entry: `client/src/integrations/family/legacy/main.tsx` imports legacy App and index.css; App owns its old lazy route tree. All30 R findings have a resolved witness from this retained entry. Current ordinary/native/device HTML does not select this main file. Retained source/history and source archive still include it; it is not permission to launch that old UI against a hosted backend.
- Typecheck: `client/tsconfig.json` includes src/tests/native-shell but excludes legacy from **root discovery**. Exclusion does not block imported files. The installed TypeScript program has4,985 roots/10,153 total source files (including dependencies); exactly three R findings are pulled in. Strict config extends the same program with stricter checks. The compiler program was created read-only with no emit or new diagnostics/test run.
- Vitest: `client/vitest.config.ts` discovers tests and src co-located tests, uses the existing jsdom environment/tests/setup.ts and forks; its discovery does not exclude legacy tests. `vitest.shard.config.ts` inherits this config. The source index covers2,454 tracked test/spec files; this is consumer analysis, not fresh execution of all those tests.
- Browser harnesses:63 browser source modules and their tracked HTML/input builders are retained. `productionFixture.mjs:56` selects planner-native/planner-availability HTML; application-entry/build.mjs uses the real index plus explicit optional test drivers; family-full config merges the ordinary Vite config and adds a fake SDK/API recorder. It does not select legacy/main. Harness source/type paths through FamilyTripBoundary lead to two R findings; those paths include erased type imports, so this is not proof the components are emitted or enabled. No harness was started.

## Why the graph overlaps active contracts

`FamilyFrontendController.tsx:21` imports the `FamilyDayTimelineDetailsHandle` type, whose module imports FamilyTransportEditor. Line23 imports `TransportCreateRequest` from TransportsPanelFamily using a type-only named specifier. Those dependencies are checked even though the imports erase from ordinary JavaScript. FamilyExploreHost imports TripWorkspaceExplorePanel, which imports ExploreEntityDetailPanel; the host/test program retains that source even though this path is absent from ordinary emitted chunks.

Separately, the five oversized **emitted** legacy findings from Q5 remain active: API client, AdminPluginsPanel, MapView, MapViewGL and FamilyFrontendController. Original Auth/API, Family Admin, FamilyTripBoundary, shared stores, both map renderers and stored-image readers must remain. Neither the30-path absent-emission list nor the975-node dependency union is a retirement allowlist. Copying/removing the whole union would capture356 ordinary-build modules, including293 with positive rendered JavaScript.

## Analysis scope and conservative limits

The private reproducible source index parses10,320 tracked JS/TS/CSS/HTML files using the installed TypeScript resolver and current aliases/package types, records literal static/lazy/import-type/mock/require/CSS/asset edges, expands six literal import-meta globs, and traverses importer/dependency unions. For ordinary emitted reachability, the actual accepted Vite graph is authoritative. The general graph deliberately includes erased types and test mocks: it is a conservative source model, not an alternate runtime build graph.

There are39 nonliteral dynamic import expressions, including the two lazyWithRetry URL retry loaders. Their runtime values are not resolved to arbitrary future code. The only unresolved relative edge found is an existing `vi.mock` target in backendOperations.test.ts:30, outside both the reviewed importer and dependency unions; it is not treated as a failed executable import or changed in this packet. Literal glob matches target locale/mascot resources rather than an R path. No observed current edge licenses a global future-unused claim. Ambiguity keeps the source retained, rather than being silently converted to an exclusion.

No alternative source profile was enabled or built. Native/device results above describe their resolved source/configuration closure only. Q6 browser/build/test evidence remains inherited at its original scope. The actual size check still has the exact same43 failure lines. No source, test, schema, source policy, build/tsconfig or quality baseline changes are made in Q7.

## Per-file decisions (all30 retained)

Every file keeps its original path, blob/mode and SHA-256. Ordinary emitted: no for each. The listed importer/dependency counts describe the conservative source graph, including erased types and reference entry paths. They do not count live UI controls.

1. [client/src/integrations/family/legacy/components/Budget/CostsPanel.tsx](../../client/src/integrations/family/legacy/components/Budget/CostsPanel.tsx) — 3470 wrapped lines; blob `4c270a0f9ef81b47da1c4ea08ebe593fe9dccf73`, mode `100644`, SHA-256 `823f7eeb8490191f8f29726cc99ab7fbded35ede8697e515bc2a24664d4eaa75`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 93 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Budget/CostsPanel.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:23` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

2. [client/src/integrations/family/legacy/components/Budget/CostsPanelFamily.tsx](../../client/src/integrations/family/legacy/components/Budget/CostsPanelFamily.tsx) — 3190 wrapped lines; blob `707a7f4c937d36cfdcb2f1cc2a86a7b0b00b5370`, mode `100644`, SHA-256 `e21a93f38ccdf8d2212f30baf357c7dd48b144d6320425d924fb7b3b155ac188`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 4 transitive importer nodes and 102 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Budget/CostsPanelFamily.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx:19` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

3. [client/src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.tsx](../../client/src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.tsx) — 1003 wrapped lines; blob `f180883c8b1afcefa82aee0d9ad1624f09c7334b`, mode `100644`, SHA-256 `b97146ac3ac1658cd298ee101519387b93e55211d51a20538b0597bda6069e66`.

   TypeScript program: included; test source consumer: yes; harness source/type consumer: none in this model. 2 direct importer(s), 8 transitive importer nodes and 116 dependency nodes.

   Program source witness: `client/src/integrations/family/FamilyExploreHost.tsx` → `client/src/integrations/family/legacy/components/Explore/TripWorkspaceExplorePanel.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.tsx` (static import/export).

   Test source witness: `client/src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.test.tsx` → `client/src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.tsx` (static import/export).

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Explore/TripWorkspaceExplorePanel.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.test.tsx:9` (static import/export), `client/src/integrations/family/legacy/components/Explore/TripWorkspaceExplorePanel.tsx:18` (static import/export).

   Decision: retain in place; existing type/test consumers require deliberate connector/test preservation before any separation.

4. [client/src/integrations/family/legacy/components/Packing/PackingListPanelItemRow.tsx](../../client/src/integrations/family/legacy/components/Packing/PackingListPanelItemRow.tsx) — 1115 wrapped lines; blob `fd3f20dbb92c0717d51a26c96f743d00e6d40eaf`, mode `100644`, SHA-256 `01b036f507bc97a250298c64f4596823a0b8cf7524dde755c87d1f4d84d3c7ff`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 10 transitive importer nodes and 88 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Todo/ListsContainer.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Packing/PackingListPanel.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Packing/PackingListPanelList.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Packing/PackingListPanelCategoryGroup.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Packing/PackingListPanelItemRow.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/components/Packing/PackingListPanelCategoryGroup.tsx:23` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

5. [client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.tsx](../../client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.tsx) — 1034 wrapped lines; blob `e968d1be1dcbd2fff98597547c5d044fff525872`, mode `100644`, SHA-256 `27682ec331a59d18545df0be9da3618e51e77f29404228bc96a93d2755835673`.

   TypeScript program: not included; test source consumer: yes; harness source/type consumer: none in this model. 2 direct importer(s), 5 transitive importer nodes and 141 dependency nodes.

   Test source witness: `client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.test.tsx` → `client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.tsx` (static import/export).

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.test.tsx:13` (static import/export), `client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx:31` (static import/export).

   Decision: retain in place; existing type/test consumers require deliberate connector/test preservation before any separation.

6. [client/src/integrations/family/legacy/components/Planner/DayDetailPanel.tsx](../../client/src/integrations/family/legacy/components/Planner/DayDetailPanel.tsx) — 1848 wrapped lines; blob `9839d6c456aa3ecd9d96963897f9e8090ea50ea1`, mode `100644`, SHA-256 `3458482374248456736f32a97c7cf9d937969cadbfad755b26213b71b515f9e7`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 89 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Planner/DayDetailPanel.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:7` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

7. [client/src/integrations/family/legacy/components/Planner/DayPlanSidebar.tsx](../../client/src/integrations/family/legacy/components/Planner/DayPlanSidebar.tsx) — 3914 wrapped lines; blob `324359bfbdd226205dd20a5812cfdde5751f24ee`, mode `100644`, SHA-256 `141d3d1a969a0777fa8a9e018861c9458b58c851b81bfdb9f314af8ab087eadd`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 127 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Planner/DayPlanSidebar.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:8` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

8. [client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.tsx) — 1557 wrapped lines; blob `bf65ca8a00682fba6bace5ed0cf6a01dbe07f51a`, mode `100644`, SHA-256 `f1cdd38d8990f12262f9c141c52bf97a72ba53c43f983c2e288793232c59fc45`.

   TypeScript program: included; test source consumer: yes; harness source/type consumer: yes. 3 direct importer(s), 28 transitive importer nodes and 109 dependency nodes.

   Program source witness: `client/src/integrations/family/FamilyTripBoundary.tsx` → `client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Planner/family/FamilyDayTimelineDetails.tsx` (type import/export) → `client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.tsx` (static import/export).

   Test source witness: `client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.test.tsx` → `client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.tsx` (static import/export).

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.tsx:45` (static import/export), `client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.tsx:52` (static import/export), `client/src/integrations/family/legacy/components/Planner/family/FamilyDayTimelineDetails.tsx:23` (static import/export).

   Decision: retain in place; existing type/test consumers require deliberate connector/test preservation before any separation.

9. [client/src/integrations/family/legacy/components/Planner/PlaceInspector.tsx](../../client/src/integrations/family/legacy/components/Planner/PlaceInspector.tsx) — 1842 wrapped lines; blob `b10f1d6ee0ad062b521fcb4f31d3fb22187ad1bf`, mode `100644`, SHA-256 `9f4324e4956fe430600c512db7568ec3f67fd834d6440ddb4c5f58e2bd9cf763`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 2 direct importer(s), 5 transitive importer nodes and 107 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Planner/PlaceInspector.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/components/Planner/family/FamilyPlaceInspector.tsx:7` (static import/export), `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:10` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

10. [client/src/integrations/family/legacy/components/Planner/ReservationModal.tsx](../../client/src/integrations/family/legacy/components/Planner/ReservationModal.tsx) — 1085 wrapped lines; blob `4ef4878dd39092c4d8b4d567ee33fb11d5c1c5a5`, mode `100644`, SHA-256 `ef7a4ae6b49400f5f8b8ab651ca9ece19a0ff7e06b32ba2540658b8c07dc7741`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 91 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Planner/ReservationModal.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:12` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

11. [client/src/integrations/family/legacy/components/Planner/ReservationsPanel.tsx](../../client/src/integrations/family/legacy/components/Planner/ReservationsPanel.tsx) — 1556 wrapped lines; blob `23111a24fdc130701777f6b192e14672b8ef0e42`, mode `100644`, SHA-256 `5182b75ff5bf0a20427a67ebe30b10cfd3571d372d4b19516dea539f329a1560`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 85 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Planner/ReservationsPanel.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:30` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

12. [client/src/integrations/family/legacy/components/Planner/TransitSearchPanel.tsx](../../client/src/integrations/family/legacy/components/Planner/TransitSearchPanel.tsx) — 1132 wrapped lines; blob `88eb4aedeab06f2691d8245230acdde7b6d186f6`, mode `100644`, SHA-256 `5a298d406b25e80ae2049a1337d7c86238dd6309077d71f13d6bbc499340c47b`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 4 transitive importer nodes and 80 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Planner/TransportModal.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Planner/TransitSearchPanel.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/components/Planner/TransportModal.tsx:49` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

13. [client/src/integrations/family/legacy/components/Planner/TransportModal.tsx](../../client/src/integrations/family/legacy/components/Planner/TransportModal.tsx) — 1703 wrapped lines; blob `1d2d2028d70bd04f72a3dfc4d43afabca84c0bbd`, mode `100644`, SHA-256 `0f722d6b4c6618e033b988ec16eded87d3bac4807e5bcb241ed3acab54bca4a6`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 94 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Planner/TransportModal.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:14` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

14. [client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.tsx](../../client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.tsx) — 1127 wrapped lines; blob `9ec77c4613c5f2dc05512e5bfa0c82dd60777723`, mode `100644`, SHA-256 `911fdd2bc5cc87a74fd8166b19cd2351ce105b8c75fa29d45edfdda9de7314ff`.

   TypeScript program: included; test source consumer: yes; harness source/type consumer: yes. 3 direct importer(s), 24 transitive importer nodes and 141 dependency nodes.

   Program source witness: `client/src/integrations/family/FamilyTripBoundary.tsx` → `client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.tsx` (type import/export).

   Test source witness: `client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.test.tsx` → `client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.tsx` (static import/export).

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.test.tsx:19` (static import/export), `client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx:23` (type import/export), `client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx:46` (static import/export).

   Decision: retain in place; existing type/test consumers require deliberate connector/test preservation before any separation.

15. [client/src/integrations/family/legacy/components/Settings/AccountTab.tsx](../../client/src/integrations/family/legacy/components/Settings/AccountTab.tsx) — 1030 wrapped lines; blob `6b2f310d1d924749e65614fba2d9ea6ac5e624cf`, mode `100644`, SHA-256 `0abae3d5c4e90e85e99be03193be2dbfe151e1dc90acb3c8e1a082496030914c`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 84 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/SettingsPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Settings/AccountTab.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/SettingsPage.tsx:6` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

16. [client/src/integrations/family/legacy/components/Settings/IntegrationsTab.tsx](../../client/src/integrations/family/legacy/components/Settings/IntegrationsTab.tsx) — 1406 wrapped lines; blob `3583f2cc32b4321d31f4fff98c5d8ff7e020239b`, mode `100644`, SHA-256 `211b667e35e66bc96f75790f6e4c9f6863c025eb1034662186c25260ec0e4d0f`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 87 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/SettingsPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Settings/IntegrationsTab.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/SettingsPage.tsx:9` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

17. [client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeModal.tsx](../../client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeModal.tsx) — 1100 wrapped lines; blob `84b17ab89586017764b1ed58a32d4df33f312daa`, mode `100644`, SHA-256 `2b022c2427b66ab10c84529888bcb56f1c1b767cc5f3ae6195a7e8ac1adf804b`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 76 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeHost.tsx` (static import/export) → `client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeModal.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeHost.tsx:4` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

18. [client/src/integrations/family/legacy/components/Todo/TodoListPanel.tsx](../../client/src/integrations/family/legacy/components/Todo/TodoListPanel.tsx) — 1454 wrapped lines; blob `3eb675f068c5afcb8faf4844730d5db07c60ac4b`, mode `100644`, SHA-256 `e697611d33967a4ad218eab12fc64ee7e6453aae1271ee6cac1de1e87b94636d`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 7 transitive importer nodes and 93 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Todo/ListsContainer.tsx` (static import/export) → `client/src/integrations/family/legacy/components/Todo/TodoListPanel.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/components/Todo/ListsContainer.tsx:9` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

19. [client/src/integrations/family/legacy/components/Trips/TripMembersModal.tsx](../../client/src/integrations/family/legacy/components/Trips/TripMembersModal.tsx) — 1109 wrapped lines; blob `123d944a8ac70e28e85c53b851456de5fad58243`, mode `100644`, SHA-256 `239ca90995206d4315157ca0a53391a1cd8a866c0785257e12eb5240fc9dde64`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 82 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/components/Trips/TripMembersModal.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:17` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

20. [client/src/integrations/family/legacy/index.css](../../client/src/integrations/family/legacy/index.css) — 1740 wrapped lines; blob `16f54abfb18be1684aac39804df156a5823b3b3b`, mode `100644`, SHA-256 `0402c909d76c1d9add9915d73abad9b8299f667126f0f4dc1f0ad6676d62e9ce`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 1 transitive importer nodes and 0 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/index.css` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/main.tsx:22` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

21. [client/src/integrations/family/legacy/pages/AtlasPage.tsx](../../client/src/integrations/family/legacy/pages/AtlasPage.tsx) — 1582 wrapped lines; blob `84cda34c2922cd757c2779569304ca2d958268e7`, mode `100644`, SHA-256 `ea6113093465ac03c72c79d9ad422745619d7f62aa1757d915cc6cfd2e4cb123`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 2 transitive importer nodes and 133 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/AtlasPage.tsx` (literal lazy import). Direct boundary examples: `client/src/integrations/family/legacy/App.tsx:58` (literal lazy import).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

22. [client/src/integrations/family/legacy/pages/DashboardPage.tsx](../../client/src/integrations/family/legacy/pages/DashboardPage.tsx) — 1387 wrapped lines; blob `432308d94f9a8c0511e712f4451cd337df06d6bd`, mode `100644`, SHA-256 `74d0c88cb786686177f35490f2a0931c6c86429e54eda27a0bbd3a04717a4104`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 2 transitive importer nodes and 164 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/DashboardPage.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/App.tsx:19` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

23. [client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx](../../client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx) — 2122 wrapped lines; blob `98c348eda49aecb57e44c34eb902e3d0149253b3`, mode `100644`, SHA-256 `5760b337ceed0d142a5294355c7fc3aaef5123146c5a0b672c2ab6f6f2bf7a55`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 825 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:39` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

24. [client/src/integrations/family/legacy/pages/LoginPage.tsx](../../client/src/integrations/family/legacy/pages/LoginPage.tsx) — 1455 wrapped lines; blob `21c7dcbb8947d21b213225c63a3ccfd5785f9e44`, mode `100644`, SHA-256 `6a8f541c4c12cc46348f92f70751bcc7a3fb3a30d464bc563c19a317a5970940`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 2 transitive importer nodes and 82 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/LoginPage.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/App.tsx:26` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

25. [client/src/integrations/family/legacy/pages/SharedTripPage.tsx](../../client/src/integrations/family/legacy/pages/SharedTripPage.tsx) — 1148 wrapped lines; blob `a434e71181b670b5bf0bfe4cd3857faa243e79e0`, mode `100644`, SHA-256 `aa2ca18ca6d900e2133cb1208c7efac4bde339997647b951bfe62a2ee76e05ae`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 2 transitive importer nodes and 85 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/SharedTripPage.tsx` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/App.tsx:31` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

26. [client/src/integrations/family/legacy/pages/TripPlannerPage.tsx](../../client/src/integrations/family/legacy/pages/TripPlannerPage.tsx) — 1471 wrapped lines; blob `f1663d541c4de602c074b99a579f0653dd88a9fc`, mode `100644`, SHA-256 `994444820df6e8efddf88a2627b4628fe93fc3f082b789c2e66236e73903484c`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 2 transitive importer nodes and 919 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import). Direct boundary examples: `client/src/integrations/family/legacy/App.tsx:54` (literal lazy import).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

27. [client/src/integrations/family/legacy/pages/atlas/useAtlas.ts](../../client/src/integrations/family/legacy/pages/atlas/useAtlas.ts) — 1002 wrapped lines; blob `ae205f7d909f8e31a74174e074d0bc1b199d4c04`, mode `100644`, SHA-256 `f8cfa6e6ad321caefd352381f7be7de4c42ef6ac4320a7d462a9fd6e79ea0008`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 77 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/AtlasPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/pages/atlas/useAtlas.ts` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/AtlasPage.tsx:21` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

28. [client/src/integrations/family/legacy/pages/tripPlanner/useTripPlanner.ts](../../client/src/integrations/family/legacy/pages/tripPlanner/useTripPlanner.ts) — 1351 wrapped lines; blob `84b942a847290945bf3559a96fd93a4b05d06860`, mode `100644`, SHA-256 `fdc9f8248ec1c3b6f454b1d58e8fe8fa8c58704d0bb4a71fc44978149588f79b`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 3 transitive importer nodes and 99 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/pages/tripPlanner/useTripPlanner.ts` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/TripPlannerPage.tsx:40` (static import/export).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

29. [client/src/integrations/family/legacy/styles/collections.css](../../client/src/integrations/family/legacy/styles/collections.css) — 1750 wrapped lines; blob `16a46b26d308f651f2b82854bd50886ef2772ff3`, mode `100644`, SHA-256 `128c53912cbbfb9065ff8eec278f959adfd5c159d756ec0ad8ffde99d68378de`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 1 direct importer(s), 4 transitive importer nodes and 0 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/CollectionsPage.tsx` (literal lazy import) → `client/src/integrations/family/legacy/styles/collectionsPage.css` (static import/export) → `client/src/integrations/family/legacy/styles/collections.css` (CSS import). Direct boundary examples: `client/src/integrations/family/legacy/styles/collectionsPage.css:3` (CSS import).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

30. [client/src/integrations/family/legacy/styles/dashboard.css](../../client/src/integrations/family/legacy/styles/dashboard.css) — 2023 wrapped lines; blob `3430d2317e40de6d440c736989f22573bfde2d78`, mode `100644`, SHA-256 `24db66200334e3f2a5b5253be42901b5d540fbd08c0adac0aef812d717627c07`.

   TypeScript program: not included; test source consumer: none in this model; harness source/type consumer: none in this model. 2 direct importer(s), 5 transitive importer nodes and 0 dependency nodes.

   Retained-entry witness: `client/src/integrations/family/legacy/main.tsx` → `client/src/integrations/family/legacy/App.tsx` (static import/export) → `client/src/integrations/family/legacy/pages/DashboardPage.tsx` (static import/export) → `client/src/integrations/family/legacy/styles/dashboard.css` (static import/export). Direct boundary examples: `client/src/integrations/family/legacy/pages/DashboardPage.tsx:49` (static import/export), `client/src/integrations/family/legacy/styles/collectionsPage.css:2` (CSS import).

   Decision: retain in place; reference-entry candidate only; no closed movable subtree or global-unused proof is accepted.

## Future retention alternatives and acceptance threshold

Preservation/modularization in place has the lowest policy risk and retains current type/test entry compatibility, but work on unshipped source has limited immediate UI benefit. This review therefore schedules the remaining bounded active/test quality repairs first; it does not instruct immediate decomposition of all30 files.

A future reference-source package could be useful only after deliberately separating the type contracts and four tested surfaces, preserving or retargeting all required tests and retaining shared active modules in place. It would need an explicit complete original-path→retained-path/mode/hash inventory, legal notices, unchanged history, normal source archive retention, source qualification and guarded tsconfig/build/test changes. Missing/tampered retained bytes and new active imports into the reference package must fail closed. Prove no native/backend/runtime behavior loss and compare the full ordinary artifact, plus any actually changed alternate/harness consumer. An archive alone or a broad legacy exclusion is insufficient.

That prerequisite is larger than a mechanical size fix and is **not proposed for implementation now**. There is no approved file-move manifest or lowered quality policy. Keep43 findings visible and proceed with the DayDetail test-only packet. Remaining hosted ledger/API/engine/timezone/protection, independent database-plus-files restoration, original HTTPS writer/retry/retirement and Worker/source binding holds remain separate. No deployment, push/main, hosted settings/billing/schema, backup/ETL/media or image-transformation operation.
