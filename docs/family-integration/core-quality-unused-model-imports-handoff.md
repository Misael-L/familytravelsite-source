# Q42 — unused trip-store model type imports

Completed locally 17 November 2026. Exactly two unused names, `Assignment` and `DayNote`, are removed from the existing `import type` block in `client/src/store/tripStore.ts`. No model definitions, store fields, functions or runtime imports are removed. This closes the source unused-variable overage without changing application behavior.

## Exact scope and proof

A read-only discovery pass used the installed unused-variable rule with other rules and typed project services disabled solely to locate candidates. It found the same 125 source findings as the accepted full Q41 gate. That discovery is not release acceptance. Fresh full typed installed ESLint on the selected store then confirmed its three findings, including the two model type imports on the same line.

Only the exact `Assignment, DayNote, ` fragment is deleted. Each binding has exactly one identifier occurrence, its declaration, in the complete original source. All other type bindings, the unrelated `StoreApi` import, all runtime imports and their order, comments, interface definitions, calls, state fields, handlers and exports remain exact. The complete TypeScript-erased JavaScript is **byte-identical** before and after, with its hash and byte count recorded. This is not a claim that separately source-stamped production bundles have identical bytes.

The store is already part of the ordinary native planner path, with qualified Family reader/writer and ownership seams. Those seams, scheduling and notes behavior remain unchanged. No public callback signature, effect, dormant helper, feature gate or layout is edited.

## Validation and release limits

- The same 52 existing cases across four root-store, read-only action, day and day-note slice suites pass before and after. All test source bytes, case names/statuses and mocks remain unchanged; no new tests or database/browser fixture.
- Full typed scoped warnings fall 13→11 with zero errors. Only the two named unused-import findings disappear. Remaining messages and source locations are unchanged after mapping suggestion ranges by the exact 21-character source delta; suppressed messages are preserved. No automatic suggestion is applied.
- The source retains its existing grandfathered formatter status. No whole-file reformat, new exemption or policy change. All warning/size/format budgets, rules, ignores and suppressions remain byte-exact; no `--update` or raised allowance.
- Clean committed local web build, direct installed client compiler, all four actual source guards and correct/wrong/missing-source artifact controls pass. Tests and scoped lint finish before building; compiler runs after building without npm's pretypecheck rebuild, followed by the actual full final warning gate. The compiler and final scan share 128 fixed declaration inputs; cross-build declaration byte identity is not assumed.
- Actual full-gate source warnings fall 3552→3550 against unchanged 3424. Source unused-variable warnings fall **125→123 against unchanged 123**, closing that rule's over-budget failure. Tests remain 2859/2859, suppressed warnings 84/83, zero errors and no stale allowance. The other nine source rule overages and one suppressed dependency overage remain unchanged. **G2 still fails overall.**
- The same 32 inherited size failure lines remain. This packet makes no size refactor or native presentation change.

Incoming clean integration/publication HEAD: `2551937d169c15324fd32aded468680cc58cefcd`. Type-import implementation: `33cde57be2de1c7b86f123bd7c9ababaeb422002`. Qualified clean local build source: `1fc1c85d037c00d4e0afbdf6a04127ef84fd04e3`. Five reviewed website paths: one type-only source edit, two provenance files and two documents. The later documentation commit does not relabel the build. Local publication stays check-only/unbound; there is no remote push or Worker deployment.

## Exact next packet

Q28–Q42, the complete test warning area, source unused-assignment overage and source unused-variable overage are closed at their accepted scope. Stop automatic cleanup of the remaining within-budget findings, including `StoreApi`. Deferred unused-source cleanup remains a separate checkpoint.

Next: inspect one coherent active concern behind the remaining dependency warnings: source `react-hooks/exhaustive-deps` is 116/114 and suppressed dependency warnings are 46/45. Obtain fresh installed diagnostics and establish the exact active consumer before choosing files and freezing an edit scope. Prefer an existing qualified hook/lifecycle group; preserve the twelve protected native layouts and prior Q31–Q34 routing/search repairs. A diagnostic alone is not proof of a runtime bug. Reproduce any stale callback, lost ownership, duplicate work or missed refresh before a behavioral change. Verify effect ownership, cancellation and original Trip/session/command/retry identity. Do not blindly add dependencies, delete a disable comment, introduce a loop, expand allowances or activate retained/dormant features. If no safe active repair is demonstrated, choose another actual G2 overage. Do not repeat the closed packets.

Keep the [release prerequisites](core-release-prerequisites.md) and [deferred pre-production cleanup](pre-production-retained-source-cleanup-packet.md). All 12 protected native runtime/layout files retain 11 upstream-byte-exact files plus the fixed Sidebar type-only identity. No ZoomTracker activation/deletion or native overlay expansion.

All 370 canonical schema/test sources, 151 migrations, the mixed canonical index, 200 prior seals/12803 members, 11 auxiliary manifests and three other checkouts remain exact. No schema/database/API/auth/permission change, hosted SQL/settings/billing, production/preview/main/push, backup/media/ignored ETL or image transformation. Stored variants and all persistence contracts remain exact. Incremental protection and independent matched DB-plus-files restoration, current hosted compatibility/engine facts and actual preview/source binding remain open release gates.

Private originals, discovery classification, exact type-only/JavaScript proof, typed diagnostics, 52-case before/after receipts and final fixed-input gate: `/private/tmp/trek-core-quality-unused-source-20261117`. Canonical sealed evidence records the final local documentation commit.
