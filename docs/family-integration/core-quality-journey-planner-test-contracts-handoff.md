# Q37 — Journey/planner test callback contracts

Completed locally 16 November 2026. This closes the two-file callback lead from Q36. It corrects six test contracts without changing website runtime behavior, backend APIs or feature availability. No incoming runtime failure is claimed.

## Distinct callback contracts

Three carousel callbacks returned the chainable synchronous Vitest timer utility to React `act`. They now invoke the exact same timer advances in void block bodies. Installed-project typings prove the underlying value is `VitestUtils`, not a Promise, and the resulting `act` type changes from Promise to void.

Three planner wiring callbacks come through the existing `props` helper, whose return contract is `unknown`. They are awaited conservatively; their results are never cast or discarded into void blocks. One enclosing existing test body becomes async; the other already was. The same actions, arguments, assertions, mocks, event/control fixtures, timer values and every other test byte are preserved by deterministic reconstruction and typed before/after proofs.

The planner tests already include mocked Tours fixtures. Retaining those test cases does not activate Tours, qualify its backend or authorize changing live feature gates. Runtime Journey hooks, native planner/map components and all12 protected native runtime/layout files are unchanged.

## Validation and measured limit

- The same109 existing cases pass before and after across two files:10 Journey carousel cases and99 planner wiring cases. No failed/pending case or new test. Carousel scrolling/settling, map/card synchronization, viewport fallback, fixture controls and all existing wiring assertions remain intact. These are local hook/component tests with existing stubs, not a new browser or hosted acceptance walk.
- Scoped ESLint removes exactly6 floating-Promise findings. The same5 unrelated non-null findings remain, with0 errors. No suppression, ignore, type configuration, mock or runtime change.
- The actual project formatter accepts the Journey file. The planner test retains its existing grandfathered formatting state/membership. Formatter config and baseline hashes are exact; no whole-file legacy reformat.
- Client typecheck, clean committed local `npm run build:web`, all four actual source guards and correct-source/wrong-source/missing-source artifact controls pass. Test/typecheck/typed-lint work finishes before workspace building. The actual installed post-build warning check uses client inputs and128 declaration outputs held to exact hashes.
- Only test `@typescript-eslint/no-floating-promises` allowance tightens18→12, matching its final actual count12. All other budgets/rules/suppressions/ignores remain exact. Actual global test warnings fall3021→3015, with total test allowance2866→2860. No allowance expansion or bulk update.
- G2 remains blocked: actual final totals errors0, source3554/3455, tests3015/2860, suppressed84/83 (now/baseline), with the same32 size failures. This closes a reviewed test-quality lead; it does not claim overall release acceptance.

Incoming clean integration/publication HEAD: `ddbd0aba5aec42c3d8cbfd6dab948a6902463a64`. Test/budget implementation: `31a00a78d1441725b8653e2fa87f273eb85ceaff`. Qualified committed local build source: `144d0bff81f928a854185e596e38a67779f0ee8f`. Seven reviewed website paths: two tests, one tightened budget, two provenance files and two documents. The later documentation commit does not relabel the build.

## Exact continuation: prioritize failing release checks

The floating-Promise test count is now12 against allowance12. **Do not continue an automatic cleanup queue for the remaining twelve merely because they exist.** They are allowed inherited findings, not that rule's release blocker. Q28–Q37 and the six callbacks above are closed. Preserve the accepted receipts rather than repeating them.

**Next bounded G2 candidate: over-budget test fixture contracts**, beginning with fresh typed diagnostics and existing tests for `client/src/components/PDF/TripPDF.test.ts` and `client/src/components/Planner/DayPlanSidebar.test.tsx`. The current failing category is test non-null assertions (2064 against1911), alongside separate explicit-any, source and suppressed/stale-entry blockers. Review comparable fixture/mock-result assumptions as one coherent batch where appropriate; preserve every meaningful assertion, fixture payload, renderer interaction, missing-data failure and original runtime behavior. Do not replace assertions with casts, optional-chain no-ops, early returns, skipped tests or wider allowances. A warning alone is not proof of a live runtime bug. If these files do not provide a safe bounded group, choose another finding actually listed by the current failing gate, rather than resuming within-budget Promise cleanup.

Other blockers remain separately recorded in the [release prerequisites](core-release-prerequisites.md). Source stale allowance entries require a deliberate measured monotonic reconciliation, not an indiscriminate update. The [pre-production cleanup checkpoint](pre-production-retained-source-cleanup-packet.md) stays deferred: no dormant ZoomTracker activation/deletion, arbitrary size refactor, native presentation expansion or unsupported feature activation.

All370 canonical schema/test sources,151 migrations, C's mixed index,195 prior seals/12566 members,11 auxiliary manifests and three other checkouts are preserved. Native runtime/layout protection remains11 upstream-byte-exact files plus the fixed Sidebar type-only identity. Previous routing/search behavior, backend carryover/history, actor/Trip/source/session boundaries, original command/payload/revision/retry IDs, permissions, Undo and stored variants remain exact.

No DB/browser fixture, hosted SQL/settings/billing, production/preview deployment, main update, remote push, backup/media/ignored ETL or transformation changes. Current incremental protection, independent DB-plus-files restoration, hosted compatibility/engine facts and target-specific preview/source acceptance remain open gates. The unchanged isolated planner/base-packing profile is only for the local build; publication remains local check-only/unbound.

Private frozen sources, typed contracts, exact edit reconstruction, before/after109-case proof, actual formatter acceptance and final diagnostics: `/private/tmp/trek-core-quality-journey-planner-test-contracts-source-20261116`. Canonical evidence records the final local documentation commit and sealed hashes.
