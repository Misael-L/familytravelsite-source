# Q41 — remove two overwritten visit timestamp initializers

Completed locally 17 November 2026. Only two initializers in the installed Family application handler change to exact existing field-type annotations. This is a code-quality cleanup of discarded values, not a newly discovered scheduling failure or new feature connection.

## Exact change and behavioral boundary

`startsAt = before.startsAt` becomes `startsAt: typeof before.startsAt`; `endsAt = before.endsAt` becomes `endsAt: typeof before.endsAt` in the existing visit time/move dispatcher. Both branches already assign both variables before the draft is built. The `sortOrder` initializer remains intact because the time branch uses it. No timestamp calculation, validation, call, dispatch order or surrounding statement changes.

Fresh scoped ESLint confirms exactly the two initializer locations. The actual schedule reader maps `startsAt` and `endsAt` to ordinary own data properties in its `rowToItem` object literal; the removed reads are side-effect-free for these supported DTOs. This is not a claim about arbitrary injected getter/proxy objects. TypeScript-erased AST comparison is exact after removing only those two original property-read initializers. No other emitted statement changes; the complete source reconstructs from exactly the two reviewed replacements.

The existing bootstrap installs this handler, and direct compatibility-route tests exercise it. Earlier qualified native plan handlers retain precedence. The cleanup does not activate legacy time/move routes on a qualified native source, alter versioned commands, or replace the normalized location/visit/day foundation with the older timestamp representation.

## Verification and limits

- The same 104 existing cases across six handler, navigation, mocked schedule writer, request/repository context and versioned visit-command suites pass before and after. All case names/statuses and test source bytes are unchanged; no new tests or DB/browser fixture.
- Scoped handler warnings fall 14→12, with zero errors. Only the two `no-useless-assignment` findings disappear. All other messages, rule severities, source locations and suppressed messages stay exact; three autofix suggestion offsets move by the exact twelve-character annotation delta. No suggestions are applied.
- The handler passes the actual existing project formatter before and after. Every warning/size/format allowance, rule, ignore, suppression, configuration and unrelated source byte remains exact; no `--update`, new exclusion or raised budget.
- The clean committed local web build, direct installed client compiler, all four source guards and correct/wrong/missing-source artifact controls pass. Tests and scoped lint finish before building. The compiler runs after the build without npm's declaration-rebuilding pretypecheck hook; the final installed full gate runs afterward against the same 128 fixed declaration inputs. No cross-build declaration-byte identity is presumed.
- Actual full-gate source warnings fall 3554→3552 against unchanged 3424. Source `no-useless-assignment` is now 7/7 and its over-budget failure closes. Tests remain 2859/2859, suppressed warnings 84/83, zero errors and no stale entries. The other ten source rule overages and one suppressed dependency overage are unchanged. **G2 still fails overall.**
- The same 32 inherited size failure lines remain. No line packing, size refactor, native markup or feature-control change.

Incoming clean integration/publication HEAD: `fd5358edf8e8178ebe67720a9e3311003f7e747a`. Implementation: `7a4223dcc24969ea0db1274c2063d1df5b962564`. Qualified clean build source: `14c6655e7cfbc1c671abaea3ad20f43850676d2d`. Five reviewed website paths: one runtime adapter file, two provenance files and two documents. The later documentation commit does not relabel the built artifact. Publication remains local check-only/unbound; no remote push or Worker deployment.

## Exact next packet

Q28–Q41, the complete test warning area and the source unused-assignment overage are closed at their accepted scope. Do not keep cleaning compliant test warnings or the seven remaining within-budget assignment findings automatically.

Next: inspect a bounded group from the remaining actual G2 source overages, starting the current `@typescript-eslint/no-unused-vars` count of 125 against 123. Obtain current installed diagnostics and identify exact files before freezing the next edit scope. Distinguish type-only unused declarations from runtime imports, public callback signatures and intentionally retained/dormant features. Preserve module evaluation order, side effects, native presentation, permissions and every original operation/session/Trip/retry/Undo identity. Remove or rename only a coherent group proved safe, with affected existing regressions and no new diagnostics; do not mass-delete retained code or change allowances just to reach a count. If that group is unsafe, choose another demonstrated active overage. The suppressed dependency and size findings remain separate open work.

Keep the [release prerequisites](core-release-prerequisites.md) and [deferred pre-production cleanup](pre-production-retained-source-cleanup-packet.md). No ZoomTracker activation/deletion, native presentation expansion or unsupported feature activation. All 12 protected native runtime/layout files retain 11 upstream-byte-exact files plus the fixed Sidebar type-only identity.

All 370 canonical schema/test sources, 151 migrations, the mixed canonical index, 199 prior seals/12752 members, 11 auxiliary manifests and three other checkouts stay exact. No database/schema migration, hosted SQL/settings/billing, production/preview/main/push, backup/media/ignored ETL or image-transformation change. Stored variants and all original persistence contracts remain intact. Incremental protection and independent matched DB-plus-files restoration, current hosted compatibility/engine facts and actual preview/source binding remain open release gates.

Supabase skill/security guidance and the [current changelog](https://supabase.com/changelog.md) were reviewed for this adapter-only scope. No SDK, CLI, hosted query or production configuration changes are needed. The existing mocked schedule-writer test verifies an update to the same row without an insert; no hosted database test is claimed.

Private originals, exact source/erased-AST proof, scoped diagnostics, 104-case before/after receipts and fixed-input final gate: `/private/tmp/trek-core-quality-visit-assignments-source-20261116`. Canonical sealed evidence records the final local documentation commit.
