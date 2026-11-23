# Q6 Costs test decomposition — local acceptance, 15 November 2026

Implementation `dc1b47e35bbbd8dd2c0f2e788f11f9f60f54f6d2` on `codex/trek-v5.1.4-family-reconcile`. Prerequisite [Q5 review](core-size-preservation-review.md); next [retained-entry closure review](core-release-legacy-entry-packet.md).

## Change and preservation

The original 2,739-wrapped-line Costs test is now three coherent suites: original filename holds expense forms, splits, precision, negative amounts and currency cases (1,434); ledger/payment suite1,024; overview/rows/mobile/remaining paths910. Existing typed fixtures live in a116-line test helper. Each suite meets2,000, helper meets the stricter1,000 packet limit. Application JSX/CSS, hooks, repositories, queues, backend and schema are byte-exact.

All16 original describe blocks,12 fixture declarations and the complete reset hook in each suite have matching normalized typed ASTs. Formatting-only parentheses/export modifiers and relocated helper import paths are normalized; test bodies, awaits, assertions, literal fixtures and nested setup/cleanup are unchanged. All original48 top-level statements are accounted for. Helper initializers are unchanged array literals and arrow/function declarations, with no eager state actions. Every original runtime module is evaluated in its original order; existing import-order preservation directives prevent formatter plugins from reorganizing those dependencies. No ESLint suppression was added.

Only the original suite's2,730 size allowance and format-list entry are removed. Format baseline2,137→2,136; full format gate passes. The actual size gate remains red with the **same other43 findings**, down from44. No quality rule/baseline expansion or blanket legacy exemption.

## Validation

- **879 selected tests pass**, zero failures/pending: all116 original Costs expanded names occur exactly once; DayDetail126/planner hook187 retain the429-candidate inventory;158 neighboring budget/receipt/queue/phone cases and all292 original planner-cohort cases pass.
- Client typecheck passes. Scoped ESLint errors0; inherited warnings65→65, including55 non-null assertions and10 legacy window-global references. Exact rule/severity/message multiplicities are preserved. The installed ratchet budgets tests by rule/category, not filename; moving existing warnings is reported rather than fabricating a new-file-zero claim. New helper warnings0; ESLint baseline bytes are unchanged.
- Fresh ordinary source-bound production build matches all3,788 runtime files from Q4; only the public source-binding receipt changes. Correct-source scanner passes; wrong/missing-source scans refuse. Qualifications stay empty. Prior16 Q4 reader/browser checkpoints are inherited at their exact unchanged runtime scope; no fresh SQL/browser/services or hosted writer qualification.

Six exact application-root rows are reviewed: existing Costs and size entries, one new format-baseline exception and three new test/helper additions. Source contract is377 exceptions/2,700 additions; every unrelated row, initial import/upstream5.1.4, twelve native pins and complete backend inventory remain exact. Actual four source guards, clean local publication companion and check-only full retained-source archive must pass before sealing; archive remains unbound to any Worker.

## Remaining work and boundaries

Next is a finite entry/test/profile closure review of the30 legacy files outside the ordinary build. It produces a concrete retention decision before spending time decomposing unshipped code; it authorizes no deletion or gate-policy change. Then proceed with remaining test and bounded active-source repairs. Do not rerun completed Q5/Q6 or claim all43 failures resolved.

Quality, current hosted ledger/API/engine/timezone/protection, independent database-plus-files restoration, real HTTPS original-writer/retry/retirement and actual Worker/matching-source binding remain separate release holds. No production/preview/main/push/hosted SQL/settings/billing/schema/dependencies, backup/ETL/media or image-transformation change. Heavy backup processes remain in the user's Terminal.
