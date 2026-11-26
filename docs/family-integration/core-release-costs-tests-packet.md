# Q6 / T1: split the Costs test suite without changing application behavior

**Completed locally15November2026.** [Acceptance](core-quality-costs-tests-handoff.md): all116 original Costs cases retained;879 selected tests/typecheck pass, size44→43, exact baseline contractions and unchanged runtime. Next [retained-entry closure review](core-release-legacy-entry-packet.md); do not repeat this completed test split.

Prerequisite: [Q5 review](core-size-preservation-review.md) and [local handoff](core-quality-preservation-handoff.md). Work only in the clean `codex/trek-v5.1.4-family-reconcile` checkout; retain TREK 5.1.4 and every completed Family packet. Qualified runtime remains `9db9f48a898f24963b931dee5610478c23801257`. Do not redo Q5 or start the R source-retirement proposal as part of this packet.

## Target and permitted files

The existing `client/src/components/Budget/CostsPanel.test.tsx` has 2,739 wrapped lines against its 2,730 allowance (test base limit 2,000); current/qualified blob `b4cb82bd68bd3e9823b35a045a78882ec7fa3b24`, mode 100644. Fresh Q5 execution: **116 passed, zero failed/pending**. Preserve this baseline as the authoritative original-case inventory.

Runtime code remains byte-exact. The only implementation paths allowed are:

- `client/src/components/Budget/CostsPanel.test.tsx`, retained for one coherent suite.
- Newly added co-located `CostsPanel.ledger.test.tsx`, `CostsPanel.expenses.test.tsx` and/or `CostsPanel.overview.test.tsx` only as needed for coherent groups. Check for collisions first; do not overwrite existing neighboring suites. No additional naming pattern without recording the exact allowlist before editing.
- New typed shared fixtures under `client/tests/helpers/costsPanel/`, each at most 1,000 wrapped lines. Helpers import/render the existing component and use the installed MSW/store/reset helpers; no replacement component or API.
- `client/scripts/size-baseline.json`: remove only this original suite's 2,730 entry after it meets the default 2,000 limit. No other entry change or increase.
- `client/scripts/format-baseline.json`: remove only this original suite's entry after it is formatted. It is currently listed; expected 2,137→2,136 entries. New files must be formatted and never enter this list.
- Exact reviewed per-file source adoption/qualification metadata after implementation acceptance; continuation/handoff/evidence Markdown. Preserve every unrelated qualification row, initial import, twelve native pins, complete backend inventory and all other baseline/rule bytes.

Do not edit `CostsPanel.tsx` (its separate 1,801/1,798 finding belongs to N), any production hook/store/repository/queue/backend/shared contract, existing neighboring test, JSX/CSS, permissions, feature/source admission, schema or dependencies. The temporary analysis and evidence directory is private; do not add generated test reports or an unrelated current machine path to application source.

## Implementation

1. Verify current HEAD/clean local publication companion, prior seals/canonical index/355 inputs/144 migrations and the target blob. Export every original expanded test full name, status and normalized statement/assertion body before editing. Q5's fresh 116-case inventory is reusable if this source/toolchain is unchanged. Record any change before proceeding.
2. Move whole coherent describe blocks: ledger/settlements; expense forms/splits; overview/payment/localization as appropriate. Keep all original full names, parameterized rows, assertions, async awaits, MSW request bodies/response shapes, store seeds and nested setup/cleanup semantics. No `.only`, skip/todo, assertion weakening, simplified fixtures, coverage change or duplicated test execution.
3. Preserve original import side effects/order and reset scope. The original top-level beforeEach executes `invalidateTripReads()`, `invalidateOfflineSession()`, `await resetOfflineTestDatabase()`, `resetAllStores()`, then authenticated `buildUser()` and EUR trip-1 seeds in that order. Keep any nested Alice seed under its original describe. Shared setup may be a typed function called by each suite's beforeEach, with equivalent module initialization. Do not hoist per-suite mock/server state or share mutable fixture objects across workers. The existing bounded wire-fixture cast for expense members is not permission to add `any` or new unsafe casts.
4. Format only the changed/new test/helper files. Keep each suite ≤2,000 and each helper ≤1,000 wrapped lines, with readable formatting; do not target mere physical line count. Remove the two precise obsolete baseline entries only after the actual gates prove eligibility. Do not use global baseline update commands that rewrite unrelated entries.
5. Verify the original 116 expanded names execute **exactly once** across the new suite set and every normalized original statement/assertion remains represented. If helper extraction changes call syntax, compare after inlining that small helper and review the difference explicitly; counts alone are insufficient. Preserve the original 292-case planner cohort suite inventory. Do not add mirror tests solely for moving code.

## Installed checks and acceptance

Use `/Users/Misael/.nvm/versions/node/v24.22.2/bin` first on PATH and existing dependencies; no install/update. Run from `client/`. Replace `<explicit split suite files>` with the exact final paths, never a wildcard that hides a missing suite:

```sh
../node_modules/.bin/vitest run <explicit split suite files> src/components/Planner/DayDetailPanel.test.tsx src/pages/tripPlanner/useTripPlanner.test.tsx --maxWorkers=3 --reporter=json
../node_modules/.bin/vitest run src/components/Budget/CostsPanel.helpers.test.ts src/components/Budget/useCostsLedger.test.ts src/components/Budget/CostsPanel.filtering.test.tsx src/components/Budget/CostsPanel.summary.test.tsx src/components/Budget/CostsPanel.delete.test.tsx src/components/Budget/CostsPanel.formerParticipants.test.tsx src/components/Budget/ExpenseModal.receipts.test.tsx tests/unit/sync/mutationQueue.budget.test.ts tests/unit/mobile/trip/MCostsTab.test.tsx --maxWorkers=3
npm run typecheck
npm run lint:format
npm run lint:size
```

First command must retain 116 +126 +187 =429 original cases, with zero failed/pending; record any genuinely additional cases separately. The neighboring command must pass without edits to those tests. Compare typed ESLint results on the exact changed/new paths to their pre-change source; no new error/warning/rule-disable or unsafe type escape. Check that the two baseline changes are exact contractions and no quality rule changed. Expected size findings **44→43**, the original Costs test disappears, all other 43 findings stay exact; newly formatted files introduce no formatting failure.

Use the actual native/qualified-source/Git/backend-carryover guards from repository root. Commit implementation, then qualify only exact changed/new source rows and the two justified baseline contractions with the existing metadata workflow; never blind-repin all differences. Build the ordinary source-bound production profile with all unsupported qualifications empty and compare its complete runtime bytes to Q4, excluding only the source-binding receipt when appropriate. Since this is test-only, executable output should remain exact; unexpected differences require investigation. Reuse prior reader/browser evidence only within this unchanged scope; no new database/services/browser walk is required if runtime bytes are exact.

Finish with clean local integration/publication commits, full retained-source check-only archive, guarded local publication fast-forward and sanitized sealed evidence/continuation. The archive stays unbound to any Worker. Record remaining size findings and release holds honestly. Subsequent R closure review and T2/T3 repairs need their own concrete scope; they are not automatic additions to this packet.

## Boundaries

No source-retirement/gate-policy change, native layout/CSS edit, feature enablement, production/preview/main/push/hosted SQL/settings/billing, schema/dependency change, backup/ETL/media process or image transformation. Heavy backup work stays in the user's Terminal. Independent database-plus-files recovery and hosted original-writer/Worker binding acceptance remain unproved until separately demonstrated.
