# Quality Q3: planner cohort tests

15 November 2026. Reviewed test-only implementation b6fc8282baffcc7e2f18c8f355d5f0879cb57327, codex/trek-v5.1.4-family-reconcile. Completes [Q3](core-release-planner-tests-packet.md).

## What changed

The5224-line plannerCohort.test.tsx is split into five behavior-focused suites: base observed editor/read/queue and startup ownership; creation/catalog identity; assignment/calendar arrangement and reorder; day insertion/deletion recovery; populated-content/file/booking recovery. All292 original expanded test titles execute exactly once, with no skipped, dropped or duplicated case. The resulting suite sizes are1047,352,846,619 and698 wrapped lines, below the2000-line test limit. Eight typed fixture files hold state, core observations, rendered forms, form hooks, planning, calendar, contents and reset/setup; their maximum size is433, below the1000-line helper limit.

The source comparison matches all116 original non-import top-level statements after only explicit normalization of module paths, export modifiers, formatter whitespace, shorthand expansion and original mutable binding references. Twenty-seven exact typed get/set pairs retain the original live variables, including pending mutations and A→B→A reads; values are not copied by destructuring. The original beforeEach/afterEach callbacks, SDK I/O mock factories, command assertions, expected identities/revisions/refusals and original runtime module evaluation order remain equivalent. These are per-file Vitest-isolated test fixtures; they introduce no product store or authorization state. New suite imports explicitly initialize original SDK mocks before consumers. Existing import-preservation directives retain that order while normal code formatting remains checked. No eslint/rule/coverage/skip/baseline waiver or new unsafe cast.

Initial fixture-layout attempts exposed Vitest's hoisted-variable export restriction and imported-value re-export behavior. The final layout uses supported local hoisting, direct dependencies, a fixture-first entry and separate component/form-hook helpers. The full clean run below is the acceptance; failed exploratory runs are not counted as passing.

## Acceptance

All912 affected regressions pass, including all292 planner cases with the exact original executed-name multiset. Configured client typecheck passes. Scoped lint is0→0 over13 changed/new test/support paths. Full formatting passes against the unchanged2137-entry baseline. All quality rules and baselines remain exact. The full size gate falls46→45: the original oversized cohort test is removed from the failure list, with no new failure path. Remaining findings remain an explicit release hold.

A fresh ordinary HTTPS production build retains all3788 previous runtime artifact files byte-for-byte. Only family-public-config.json changes to bind this test-only source commit. The actual scanner accepts that exact external expected source and refuses missing/wrong source identities. No configuration/scanner-policy or runtime source-capability change. The prior16 Q2 desktop/phone reader checkpoints retain only their byte-exact scope: real isolated Auth/password/TOTP/PostgREST/RLS, synthetic local object bytes, native thumb/hero and placeholders. No new browser, SQL, Storage, backup restore or writer/queue qualification is claimed. Earlier blocked unrelated external attempts remain part of that original proof.

No test services are started or stopped here; all177 prior container states and106 volume names remain exact. Canonical355 source/test inputs,144 migrations/index,12 native presentation files, full backend carryover, three other worktrees and144 earlier evidence seals/9916 members are preserved. Exactly13 source rows are adopted:376 upstream exceptions and2695 Family additions. All other rows and original/upstream/history identities remain exact. Four actual source guards and the clean local publication companion/check-only archive must pass before this checkpoint is sealed; no real Worker binding is claimed.

## Next

[Q4 bounded packing coordinator repair](core-release-packing-size-packet.md), starting with the1029-line non-native Family adapter. Do not alter frozen legacy/native/carryover sources to clear unrelated size findings. Current hosted ledger/API/engine/timezone/protection checks, independent database-plus-files restoration, real HTTPS writer/retry/retirement qualification and Worker/matching-source binding remain release prerequisites.

No production/preview/main/push/remote publication, hosted SQL/settings/billing/schema/dependency change, media/backup/ETL or transformations.
