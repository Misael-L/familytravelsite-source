# Worker B finite queue — test typing only

You are the second user-started chat. Read README.md, plan.json, worker-b-status.json and the repository/client CLAUDE.md instructions. Your worktree is `/Users/Misael/.codex/worktrees/family-site-worker-b-20261118/FamilyTravelSite-trek-5.1.4` and your branch is `codex/trek-v5.1.4-test-types-worker-b-20261118`. Required shared application base: `0e265c1e92cd20048d775a161f8cf7d3c4462264`. Verify the prepared bootstrap receipt and ancestry using the runner. Never switch the coordinator's branch or use the global next-handoff pointer as your queue.

Your only editable source files are:

- client/src/components/SystemNotices/SystemNoticeModal.escape.test.tsx
- client/src/components/Planner/dayRoute.coordinates.test.ts
- client/src/integrations/family/coherentTripCapture.test.ts

You may additionally create/update only worker-b-status.json and reports under docs/family-integration/parallel/worker-b-reports/. All runtime/API/store/schema/helper/factory/dependency/config/quality-baseline/source-qualification/master-handoff files are outside your lane. Preserve any unexpected edits and ask the coordinator instead of reverting them. Do not update shared plan/queues/README/runner or global temporary state.

## PB-01 — notice Escape helper

One measured TS7031 at line35: the `type` destructuring in keydownRegistrations loses contextual typing through ReturnType<typeof vi.spyOn>. Give the spy/call helper a correct narrow structural or library type. Preserve the full listener registrations/removals and all eight desktop/phone Escape scenarios. Prefer a type-only repair whose emitted JavaScript is identical. Do not replace spies, remove assertions, add any/as-any/non-null assertions/ts-ignore or relax the notice behavior.

Test: `src/components/SystemNotices/SystemNoticeModal.escape.test.tsx`.

## PB-02 — deliberately malformed route fixtures

One measured TS2322 at line28: buildAssignment receives a place union containing null while its normal type accepts a Place or undefined. This is a negative runtime boundary test. All cases must remain: zero/negative-zero/NaN/infinite coordinates, absent/undefined/null places and null/undefined coordinates, duplicate assignment identities, timed slots and untouched metadata/inputs. Literal null coverage must not disappear.

Repair the test's typing/fixture construction locally. Keep production types and shared factories unchanged. If construction changes, prove the materialized runtime fixture values are equivalent before/after for every affected case. Do not widen production schemas, coerce the null to undefined, drop a test case, cast away the mismatch or weaken any assertion. If no honest local fix is possible within this scope, stop PB-02 and report NEEDS COORDINATOR; do not edit dayRoute.ts or factories.ts.

Test: `src/components/Planner/dayRoute.coordinates.test.ts`.

## PB-03 — cache-commit test continuation

One measured TS7006 at line288: the result parameter in the mocked Dexie put continuation is implicitly any. Use the actual captured method/result type without altering promise timing, original-session change simulation, exact-generation withdrawal or cache head/snapshot assertions. Preserve every original case and fixture. Prefer a type-only edit with identical emitted JavaScript. No runtime cache/session/DB/module changes.

Test: `src/integrations/family/coherentTripCapture.test.ts`. Its controlled fake IndexedDB and mocked requests are local; do not invoke any `.live` suite, network service or real Supabase/Docker database.

## Execution and completion

Start with PB-01 only. Use run-check.py from this worktree for preflight, focused tests, format, typed lint and strict. Reuse the prepared77-case/before-strict receipts only while their recorded inputs remain exact; after each changed packet run one current strict check. Reuse that unchanged result as the next packet's before record rather than repeating an identical full compiler run. The runner serializes heavy checks and keeps raw exit codes. The full strict gate is expected to remain failed: initial scored total636, one unallowed diagnostic in each assigned file, all three baseline allowances0. A packet is clean only when its assigned diagnostic reaches0 without new diagnostics/coverage changes; do not “fix” the global baseline or unassigned failures. Other source qualification may remain stale until the coordinator integrates your test changes; report it, don't edit shared provenance or fabricate a full gate pass.

After a successful packet, commit only its source file, write its report and your status with the implementation commit, commit those, normally push only `codex/trek-v5.1.4-test-types-worker-b-20261118` to the existing private origin and verify the remote tip. Never force-push, merge/rebase/pull other branches, deploy, alter remotes/hooks or touch main. The coordinator reviews and integrates your commits separately. If permissions/auth prevent a push, preserve the local commits and report the exact issue.

A later “Continue with the next” means the next unfinished PB item only. After all three, run the three-file test union, publish a final batch report and mark QUEUE COMPLETE. Stop. Do not scan global strict errors to create PB-04. If a packet is blocked, document the concrete blocker and stop dependent work; do not silently redesign your scope. The coordinator can assign a new versioned batch.

Raw logs/JSON belong under this worktree's ignored .cache/family-parallel directory. Reports must distinguish packet results from known global failures and inherited receipts. Preserve exact original assertions/test counts/skips; no new skips, baseline edits, UI changes, helper rewrites or blanket file formatting. Do not run full builds, npm install/ci/test/typecheck prehooks, SQL, media transformations, source publication or cleanup operations.
