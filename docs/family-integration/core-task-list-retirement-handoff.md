# Q109 — Copied task/list-container island retired

Completed 18 November 2026 on the private integration branch. Incoming `4808891b1a5d0a1f0ec40ba59deba194ae0671af`; implementation `a0b9f76fd376a3baeb0873e35d4eda9f40417e11`; source-bound fixture build `1778046e78d42072d259e6637a20d82edfa40b65`. [Export/type/source review, unchanged regressions, output comparison and replay](evidence/task-list-retirement-20261118/README.md).

Only copied TodoListPanel, ListsContainer, ListsPanelFamily and useFamilyLists are removed. Their three value imports and one type-only ListsContainerProps edge are internal, with no outside consumer or ambient augmentation. All exports/type exports are recorded. Native desktop/phone task/list/packing controls, Family readers/writers/queue/recovery/session/permission contracts and copied helpers/ops/models remain intact.

556 identical cases pass before/after. Build/compiler, four source guards and three artifact-source controls pass. All 3,792 outputs other than the public sourceCommit configuration match byte-for-byte. Format/warning gates pass unchanged. Size16→15 removes exactly the old task-panel finding; every other failure line remains exact. G2 and independent release gates stay open.

## Exact next packet — Q110 bounded copied packing UI review

Review this candidate chain before selecting any deletion:

- client/src/integrations/family/legacy/components/Packing/PackingListPanel.tsx
- client/src/integrations/family/legacy/components/Packing/PackingListPanelList.tsx
- client/src/integrations/family/legacy/components/Packing/PackingListPanelCategoryGroup.tsx
- client/src/integrations/family/legacy/components/Packing/PackingListPanelItemRow.tsx

Initial search shows Panel → List → CategoryGroup → ItemRow, and the old Panel's incoming ListsContainer was retired in Q109. This is a candidate boundary, not proof of closure. Panel also re-exports itemWeight from the retained packingListPanel.helpers module; review all default/named/type exports and outside consumers of either the re-export or its original helper. Keep any required module/export until the external runtime/type/test/tool boundary is resolved. Do not delete a row exporter while retaining an unexamined category/list consumer.

Preserve every native components/Packing module, pages/tripPlanner/plannerLazy and ListsContainer, desktop/phone packing UI, qualified Family packing reads/identities/categories/groups/bags/writers/commands/queues/receipts/recovery/session/permissions. Keep copied usePackingListPanel, PackingState/TripMember/CategoryAssignee types and their existing consumers, familyPacking, packingListOps/context, helper/model/shared/quantity/weight/export/share components, sibling header/view/bag/import components and all tested/type-program source. Do not remove a helper or widen this island merely to lower the row's size failure; first document any required boundary change. Native and copied same-name modules are distinct.

Recompute complete raw runtime/import/export/type/ImportTypeNode/JSDoc/mock/require and actual entry/configuration/tool/public/source/license/dynamic/glob/cache closure. Check module/global augmentations and implicit type dependencies; any augmentation requires actual before/after compiler-program/effective-type proof. Keep all 6,091 current graph nodes/edges/source bytes, twelve protected native files and outside tracked bytes exact. Use actual native packing runtime witnesses and positive candidate-import controls.

Prototype only proved-closed modules. Compare unchanged native packing panel/list/category/item/bag/quantity/weight/share/import/export cases and Family identity/category/aggregate/bag/control/recovery/queue/session/permission cases before/after. Compare expanded names/files/status/multiplicity with no assertion/mock/fixture/configuration/timeout/skip/coverage weakening. Any demonstrated reachable bug comes first with red/green proof. Local fixture tests do not admit a Family feature/writer. Build committed qualified source and review complete generated output; independently prove any real selector/chunk/SW/receipt changes rather than carrying forward Q109's raw identity result.

Update only actual deleted provenance rows/pins. Run fresh compiler/native/source/artifact/actual format/warning/size gates, with current generated-declaration hashes. Keep all 15 remaining size failures explicit; no rule/baseline/exclusion/suppression/scanner relaxation, helper-union retirement, new API/provider/writer/profile admission or UI replacement. Finish bounded preservation, check-only archive, normal private checkpoint push and exact continuation pointers.

Use `/private/tmp/trek-core-task-list-retirement-20261118/next-baseline-private.json` after verified push. Preserve canonical 151 migrations/370 sources/index/README, sealed evidence and complete archives, other checkouts, backups/ETL/media. Check free disk; remove only a verified disposable prototype after its proofs. Shared backend remains8cc0fe3f. Website only; no main/preview/production/Supabase/schema/settings/billing/transformation/public mirror/backup/ETL/iOS changes.
