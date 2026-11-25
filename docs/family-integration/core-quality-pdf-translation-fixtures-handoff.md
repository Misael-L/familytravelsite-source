# Q39 — PDF fixture translation types; test warning area closed

Completed locally 16 November 2026. This closes Q38's remaining two over-budget test explicit-any findings. Only the parameter annotations for `minimalArgs.t` and `richArgs.t` change. Runtime application code, fixture behavior and every budget/configuration remain unchanged.

## Actual contract and exact behavior preservation

Fresh inspection confirms both the PDF renderer (`downloadTripPDFProps.t`) and translation context (`TranslationContextValue.t`) accept optional `Record<string, string | number>` interpolation parameters. Their declarations and source hashes are recorded before/after. The two fixture annotations now use that exact existing contract; no guessed narrower interface, cast, import or new helper.

Installed-project TypeScript proves both callbacks match the renderer's callback type and optional-parameter contract. Replacing only the two original AnyKeyword spans reconstructs the entire new test file. All callback bodies, interpolation outputs, fixtures, mocks, selectors, assertions, comments and every other byte are unchanged. The complete TypeScript-erased test JavaScript is byte-identical before/after. This is a type-only test repair, not a new runtime or backend fix.

## Validation and release-gate result

- The same90 existing PDF cases pass before/after;0 failed/pending,0 new tests. The previous Q38 four-file523-case receipt and all other test/source bytes remain preserved, not re-presented as freshly run523 cases here.
- Scoped lint goes58→56 explicit-any findings, with exactly the two verified parameter locations removed and0 errors or new findings. Remaining within-budget fixture any occurrences are retained; no wholesale fixture rewrite.
- **All test-warning categories now meet their allowances:** global test warnings2861→2859 against unchanged2859; explicit-any491→489 against unchanged489. The actual installed final gate reports no test over-budget or stale entries. Q38's non-null1910 allowance, all other warning counts/allowances, size caps and suppressions remain exact.
- Actual project formatter state/membership is unchanged: the legacy PDF test remains grandfathered; formatter config/baseline byte-exact. The size gate retains exactly the original32 failure lines. No new size finding, line packing or policy update.
- Client typecheck, clean committed local `npm run build:web`, all four actual source guards and correct-source/wrong-source/missing-source artifact controls pass. Tests/typed lint/typecheck complete before workspace building; the final gate runs afterward with changed client inputs and128 declaration outputs hash-fixed.
- G2 remains blocked overall: errors0, source3554/3455, tests2859/2859, suppressed84/83 (now/baseline), plus32 inherited size failures. Source overages, five stale source allowance entries and the excess suppressed dependency warning remain actual failing checks. No global release acceptance, fresh browser walk or hosted compatibility claim.

Incoming clean integration/publication HEAD: `a35a44d0e6ceb97c2619f08dc0152138b6e7e689`. Type-only implementation: `fc5f219c3c111ad6c940bc615cc4cae15c3d4558`. Qualified local build source: `a631467f7b7e92ca48a2af59388419706f1215cb`. Five reviewed website paths: one test, two provenance files and two documents. The later documentation commit does not relabel the build.

## Exact continuation: remaining failing source checks

Q28–Q39, the test non-null overage and the two test-any findings are closed. **Do not keep cleaning within-budget test warnings automatically.** The test warning area passes at its existing strict allowance; the complete repository gate does not.

**Next bounded G2 candidate: explicitly reconcile the five stale source allowance entries, using fresh installed gate facts and preserved qualification receipts.** These source warnings are already below their held entries, and the gate rejects stale allowances so fixed debt cannot silently return. Current measured candidates are:

- source explicit-any144→143;
- source swallowed-catch128→123;
- source hook refs553→550;
- source state-in-effect192→185;
- source floating-promises164→149.

Before changing anything, refresh the exact five values on the current immutable source/declaration inputs and trace them to the current accepted warning/source receipts. Freeze only those five numeric cells in `client/scripts/eslint-baseline.json`; preserve every rule, ignore, suppression, test budget, source byte and unrelated allowance. No blind `--update`, increases or runtime changes. This is monotonic enforcement of already measured repairs, not five new functional fixes. Source warning total remains3554 while the allowed source sum would tighten3455→3424; the larger aggregate gap reflects stricter allowances, not added warnings. Real source overages and the suppressed dependency failure still require their own subsequent bounded repairs.

Keep the [release prerequisites](core-release-prerequisites.md) and [deferred cleanup checkpoint](pre-production-retained-source-cleanup-packet.md). No dormant ZoomTracker activation/deletion, automatic retained-source refactor, native presentation expansion or unsupported feature activation.

All12 native runtime/layout files retain11 upstream-byte-exact files plus the fixed Sidebar type-only identity. Q38's checked fixture helpers, exact row-helper extraction, missing-data/receiver semantics and tightened size cap remain unchanged. Previous routing/search behavior, backend carryover/history, actor/Trip/source/session boundaries, original command/payload/revision/retry IDs, permissions, Undo and stored variants remain exact. All370 canonical schema/test sources,151 migrations, C's mixed index,197 prior seals/12665 members,11 auxiliary manifests and three other checkouts are preserved.

No DB/browser fixture, hosted SQL/settings/billing, production/preview deployment, main update, remote push, backup/media/ignored ETL or transformation changes. Current incremental protection, independent DB-plus-files restoration, hosted compatibility/engine facts and target-specific preview/source acceptance remain open gates. The unchanged isolated planner/base-packing profile is only for the local build; local publication remains check-only/unbound.

Private originals, actual consumer contracts, exact two-span reconstruction, erased-JS identity,90-case before/after proof and diagnostics: `/private/tmp/trek-core-quality-pdf-translation-fixtures-source-20261116`. Canonical evidence records the final local documentation commit and sealed hashes.
