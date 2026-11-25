# Quality Q1: formatting and current test contracts

15 November 2026. Reviewed implementation 3ec9d514669bb4ab3199480e943fff1c5eec8b2f, codex/trek-v5.1.4-family-reconcile. This packet completes the13 unlisted formatting repairs from the [release-quality packet](core-release-quality-packet.md).

## Changes and verification

Only13 formatter targets changed production/source formatting. Their original import declarations, normalized typed syntax trees and emitted JavaScript syntax trees match the pre-packet source. Seven files use the existing organize-imports-ignore/sort-imports-ignore directives to preserve module evaluation order instead of letting formatting reorganize/remove imports. Code-body formatting remains checked. There are no new eslint/prettier body suppressions, quality-baseline expansions, native-layout edits, backend carryover edits, data/schema/API permission changes or feature activation.

The broader affected regression suite exposed two existing failures. Both reproduced on an isolated copy of the exact pre-packet commit15957a74e:47 tests,45 passing and2 failing. The older planner test expected an unqualified accommodations read to succeed. It now verifies the actual503 refusal after the installed planner's Trip-membership check; all other writer/unknown-key rejection assertions are retained. The older service test mocked the retired Collections loader. It now traverses the actual request-scoped Collection owner, current-session/RPC wrapper, strict canonical library/page parsing and native identity projection, mocking only SDK I/O. It verifies explicit original bearer headers, identities and no legacy reads/transfers. These are unit fixtures, not real JWT verification, hosted Auth, SQL or RLS proofs.

All863 affected regression tests pass with zero pending tests or failed suites. Configured client typecheck passes. Scoped lint remains29 warnings before and after, with no new warning/error. Full formatting gate passes:2137 unformatted legacy files exactly match the unchanged2137-entry baseline; all13 unlisted failures are gone. No unrelated bulk formatting or new baseline exception.

Size remains an explicit hold: the same50 failure paths (47 excess-size findings and3 stale allowances) remain. Formatting changes the already-oversized applicationHandler from1239 to1250 wrapped lines and plannerCohort.test from5215 to5224; neither receives a larger allowance. No new size-failure path. These counters are recorded rather than described as unchanged sizes.

A fresh ordinary HTTPS production build preserves all3788 prior runtime artifact files byte-for-byte. Only family-public-config.json changes to bind the new source commit. The existing scanner accepts that exact expected commit and refuses missing/wrong source identity. The public-origin policy/frozen contexts and all default/HTTPS writer/recovery gates are unchanged. No fresh browser/database/service run; the prior16 reader checkpoints retain only their exact unchanged runtime scope, including the earlier proxy's54 blocked unrelated external attempts.

The exact qualified-source follow-up updates15 existing rows;375 upstream exceptions and2682 Family additions remain. All other rows and original/upstream/history/native/carryover identities stay exact. Actual source/native/Git/carryover checks and local publication companion/source archive must pass before this checkpoint is sealed. Archives remain check-only/unbound to a real Worker.

## Next

[Bounded size repair](core-release-size-packet.md), beginning with applicationHandler. Preserve the13 formatting gains. Size, hosted ledger/API/engine/timezone/protection, independent database-plus-files recovery, explicit real HTTPS writer/retry/retirement acceptance and actual Worker/source binding remain release requirements.

No production/preview/main/remote publication, hosted SQL/settings/billing/schema/dependency changes, original backup/media/ignored ETL work or image transformations.
