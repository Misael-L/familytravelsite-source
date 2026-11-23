# Q100 — Four-file legacy entry retirement

Completed 18 November 2026 on the private integration branch. Incoming `9e84f90cfa8c6fdefd7cea45db32c2ef6f2edde0`; implementation `7cc398ec65581bb9383a43841ea962a0ad43dd72`; source-bound fixture build `a04fa405cbac4b4ac8ac9143652daa71ec6d527e`. [Evidence and replay](evidence/legacy-entry-retirement-20261118/README.md).

Retired only legacy main.tsx, App.tsx, pages/TripPlannerPage.tsx and pages/FamilyTripWorkspaceShell.tsx after complete runtime/type/test/tool/configuration closure. The three incoming edges are all internal; historical scanner fixtures remain. The current graph retains5,981 nodes/edges, all other source bytes and all12 protected native files. The old Costs panels and the four Q7 tested/three type-program findings remain intact. This reviewed retirement supersedes Q7's temporary hold only for the four listed files; it does not classify their shared dependency union as dead.

713 identical consumer cases pass before/after;146 guard controls pass. Fresh build/compiler/source/artifact checks pass. All3,793 build paths are exact; only public sourceCommit differs. All421 JavaScript/CSS files are byte-exact. Fresh compiler/gates pin the current128 declarations; two rebuilt declaration digests differ from the older build, without tracked shared-source changes. Ordinary warning ratchets pass unchanged. Size30→28, with exactly two failure lines removed. No policy/baseline/exclusion/suppression growth, feature/schema/API/backend/media/transform/settings/billing/backup/ETL or hosted action.

The full formatting gate is blocked by11 existing violations, freshly reproduced identically before and after removal. G2 and other release gates remain open. No fresh authenticated browser/hosted writer/Storage admission follows from this cleanup.

## Exact next packet — Q101 repair the real client formatting gate

Work from `client/` using the installed Prettier configuration and actual `npm run lint:format` command. Reconcile the actual formatter output and the listed source formatting without a new ignore/allowance. Diagnose earlier file-level false positives without assuming a cause: the same-path probe fails with or without the retired files, and both current working-directory probes fail. Earlier root-directory prototype formatting checks do not prove the ordinary client gate passes. Review all eleven exact locations:

- client/src/integrations/family/creationIntentQueue.ts
- client/src/integrations/family/creationTerminalSettlement.ts
- client/src/integrations/family/legacy/components/Admin/plugins/PluginBadges.tsx
- client/src/integrations/family/legacy/components/Admin/plugins/PluginInstalledList.tsx
- client/src/integrations/family/legacy/components/Admin/plugins/PluginRegistry.tsx
- client/src/integrations/family/legacy/components/Admin/plugins/PluginTrustDialogs.tsx
- client/src/integrations/family/plannerReadGuard.ts
- client/src/integrations/family/plannerTaskRecovery.ts
- client/src/sync/originalWorkExport.ts
- client/src/sync/queueStatus.ts
- client/src/sync/retainedRecovery.ts

Keep source/API behavior and all12 native presentation files unchanged. Prototype exact formatter output for only these files. Compare typed/runtime ASTs and emitted runtime import order; any className changes must preserve token multisets/conditions/spacing semantics and DOM structure. Keep callbacks, initialization order, getters, queues/operation identities, retirement and error behavior exact. Do not let import organization silently remove effectful initialization. Do not change format configuration, baselines, exclusions, suppressions or warnings to turn the gate green. All files/helpers remain within their installed caps.

Use meaningful unchanged regression suites for affected creation, task/queue/read-guard/recovery/export and retained admin consumers. Any actual semantic defect comes first with red/green proof. Apply only the reviewed formatting with bounded source qualification, then run the real format gate, fresh build/compiler/source/artifact/warning/size checks and preservation/private source checkpoint. Capture current compiler generation inputs rather than assuming ignored generated declarations equal older builds. Keep28 unchanged size findings explicit; after the formatting gate closes, resume bounded old Costs UI retirement review with full raw type/test/export closure.

Use `/private/tmp/trek-core-legacy-entry-retirement-20261118/next-baseline-private.json` after its verified private push. Preserve canonical151 migrations/370 sources/index/README, all earlier sealed evidence, original blobs/source histories and unrelated checkouts. Shared backend remains8cc0fe3f; website only, iOS deferred. No main, preview/production, Supabase, public-mirror, schema, settings/billing, media, transformations or backup/ETL operation.
