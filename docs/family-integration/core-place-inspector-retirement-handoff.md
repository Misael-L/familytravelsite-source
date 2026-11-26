# Q108 — Copied old place-inspector pair retired

Completed 18 November 2026 on the private integration branch. Incoming `4760072b180e365a00f91280f56379d9c551271f`; implementation `f11acf7ea23c898838d62982abdac28ac3eb4994`; source-bound fixture build `f134e9b254f64db1f394f91cf7949f7417167934`. [Static review, before/after regressions, output comparison and replay](evidence/place-inspector-retirement-20261118/README.md).

Only the old PlaceInspector and FamilyPlaceInspector are removed. The ActionButton import is internal to this closed pair; there is no outside runtime/type/test/tool consumer or ambient augmentation. Native inspector/gallery/phone/map components, planLocations, the current Family controller, tested copied Explore readers, retained bridge files and every other tracked source remain intact. Distinguish the active native/controller runtime witnesses from the retained non-current FamilyExploreHost/FamilyGenericMapBridge files; no mounting change is made.

401 identical cases pass before/after (385 client +16 backend). Build/compiler, four source guards and three artifact-source controls pass. All 3,792 other outputs, including every script/stylesheet/SW/cache/manifest/compressed artifact, are byte-identical; only public configuration sourceCommit changes. Format/warning gates pass unchanged. Size17→16 removes only the old inspector failure; all other failure lines remain exact. G2 and independent release gates stay open.

## Exact next packet — Q109 bounded copied Todo/list-container review

Begin with these boundaries; review before selecting any deletion:

- client/src/integrations/family/legacy/components/Todo/TodoListPanel.tsx
- client/src/integrations/family/legacy/components/Todo/ListsContainer.tsx
- client/src/integrations/family/legacy/components/Todo/ListsPanelFamily.tsx
- client/src/integrations/family/legacy/components/Todo/useFamilyLists.ts

The initial search finds ListsContainer → TodoListPanel, ListsPanelFamily → ListsContainer/useFamilyLists, and a type import useFamilyLists → ListsContainerProps. These are real consumer edges, including the type-only dependency. A missing old page is insufficient proof that the exporter or its types can be removed. Keep any module/export required by an outside runtime/type/test/tool consumer. If a wider boundary is necessary, document it before changing source; do not expand into packing/task helpers or APIs simply to delete the panel. Inspect all exports and any global/module augmentations.

Keep native components/Todo, pages/tripPlanner/ListsContainer and desktop/phone task/packing controls, current qualified task/packing writer/startup/session/offline queue/recovery commands, lists and models intact. Preserve copied familyTodos/todoListOps/todoListModel/useTodoList, Packing panels/ops, tested/type-program readers and all dependency union unless separately proved closed and explicitly selected. Do not confuse a native TodoListPanel import with the same-named copied module. No new feature/writer/profile enablement.

Recompute full raw runtime/import/export/type/ImportTypeNode/JSDoc/mock/require, current roots/config/tool/public/source/license and dynamic/glob/cache closure. Record actual native list/task runtime witnesses and outside importer boundaries, including type-only imports. Inspect augmentations; any implicit type dependency requires actual compiler-program/effective-type proof. Preserve all 6,091 current graph nodes/edges/source bytes, twelve protected native files and all outside tracked bytes.

Prototype only proved-closed source; compare unchanged native Todo/list-container startup, task readers/writers/queue/recovery/session/permission and adjacent packing cases before/after, with expanded names/files/status/multiplicity exact and no assertion/fixture/mock/config/timeout/skip relaxation. Any demonstrated reachable bug takes priority with red/green evidence. Build committed qualified source, compare complete generated output, and report any real CSS/chunk changes explicitly. Do not copy Q108's byte-identity result to another packet without new proof.

Reconcile only actual deleted source rows/pins; run fresh compiler/native/source/artifact/actual format/warning/size gates with current declaration hashes. Keep all 16 remaining size findings explicit. No rules/baselines/exclusions/suppression/scanner relaxation, blind helper removal or new runtime/backend admission. Finish bounded preservation, check-only archive, normal private branch checkpoint push and next-baseline/continuation pointers.

Use `/private/tmp/trek-core-place-inspector-retirement-20261118/next-baseline-private.json` after verified push. Preserve canonical 151 migrations/370 sources/index/README, all prior sealed receipts/archives and other checkouts. Check disk first; retire only a verified disposable prototype after its proofs. Shared backend remains8cc0fe3f. No main/preview/production/Supabase/schema/settings/billing/media transformations/public mirror/backup/ETL/iOS changes.
