# Q29 — warning provenance and phone optimization completion

Completed locally 16 November 2026. The eleven-count Q22a→Q28 warning increase is explained; nine affected locations are repaired. Global G2 still fails. Continue from this checkpoint, not the completed [Q28 measurement/extraction](core-quality-current-handoff.md) or Q26e browser packets.

## Identities and finite scope

Incoming clean integration/publication HEAD: `77e433020e666ed0bd29e6de8ae5fac929048eb8`. Repair/test commit: `3348209802d59ffd8cc5890b6755d2a491ab6ca2`. Clean committed build and qualification metadata: `f09792455d971b607b99b9aa9b1fd05d9579b748`. Branch: `codex/trek-v5.1.4-family-reconcile`. Frozen scope: four client files, two exact qualification files and two handoff/checklist documents. No database fixture or hosted operation.

## Reproduced cause

The installed gate's own `lintClient` and `tally` capture5056 current files with errors0 and source3560/tests3055/suppressed84. Tracked source and128 generated `d.ts`/`d.cts`/`d.mts` artifacts remain hash-exact throughout capture. Structured raw diagnostics stay private.

Four caller files are byte-identical at Q22a `3875984f582efe6743c40100088553a6e845d9dd` and the incoming HEAD: TripPlannerPage, MDaySheet, useDayPlanEdits.test and useTripPlanner.calendar.test. An isolated historical source copy uses the same installed dependencies, lockfile, ESLint/config and unchanged shared workspace sources. A second counterfactual copy changes **only** `useDayPlanEdits.ts` to the current implementation. The two copies pass25050 file/blob identity checks in total, allowing precisely that one counterfactual hook replacement. The counterfactual reproduces the exact same11 additional diagnostic locations, with no removed locations. No historical full global gate rerun is claimed.

The cause is intentional repair `1e4ca8379`: the Family reorder branch now returns its actual save Promise so native Sidebar awaits commitment and records only one Undo. Existing callers retained synchronous assumptions. Eight test statements ignored that Promise; phone Optimize ignored it and immediately announced success; two desktop/compact Sidebar prop checks expected a `void` callback. This explains why Q28's changed-text comparison under current imported types found no per-file/rule growth. **Never revert this Promise, erase it with a fake `void` cast, swallow rejection, or restore duplicate/premature Undo merely to hide warnings.**

## Repair and verification

- Phone Optimize waits for a Promise-returning writer before its success message, reports a refusal without claiming success, and ignores repeat taps while the same save is pending. It preserves the native synchronous writer path. No automatic retry, request rewriting, backend/queue operation or manual history entry is added.
- Feedback belongs to a mounted Trip/day/sheet/permission generation and the captured existing read-session lifecycle. Closing/reopening, switching away/back, permission retirement, logout or unmount retires the old notification owner. These checks grant no write permission and do not undo a possible server commit. Original-command ownership remains in the existing adapters.
- The pending-save regression fails before repair while all33 pre-existing phone cases pass. Final125 cases across five files pass: all existing phone cases, fifteen new pending/refusal/retired-reply cases, eight corrected existing test calls, calendar/day edits, native awaited reorder and original-state-bound Undo. Both committed and refused held replies are tested across six lifecycle changes. All existing assertions in the eight edited test statements are otherwise exact.
- Phone JSX is byte-exact, including its existing `onClick` reference. Every unrelated component statement is exact. All12 native presentation pins, native history and unadmitted source bytes remain unchanged. Typecheck, installed web build, four source guards and source-bound artifact positive/negative controls pass. No fresh real browser walk is claimed.
- Final actual installed warning gate, after the build with client and all128 declaration hashes fixed: errors0; source3559/3455, tests3047/2881, suppressed84/83. Nine unhandled-Promise warning locations clear; scoped rule counts never grow and no suppression is added. Size still fails on the same32 exact lines. No limits, baselines, ignores or rules change.

## Exact next packet

Two identified warnings remain at the two native `TripPlannerPage` uses of `DayPlanSidebar.onReorder` (incoming lines350 and610). The Sidebar already awaits that callback at its actual save sites, but `DayPlanSidebarProps.onReorder` declares `void`. This is type-contract drift, not evidence that desktop saves are discarded. The required return contract is `void | Promise<void>` so both existing native synchronous writers and Family's awaited writer remain truthful.

Prepare a **separate reviewed type-only source-contract packet**. The Sidebar is one of the12 exact presentation files, so do not edit it silently, remove it from protection, or add a broad exception. Admit only the fixed one-field return-type overlay derived from the pinned TREK5.1.4 file, with a guard that rejects every other byte/runtime/JSX change and tests for unauthorized modifications. Explicitly distinguish upstream-byte-exact files from that reviewed type-only overlay; do not falsely claim12 unchanged raw files afterward. Qualify the exact resulting source and retain the current permissions, real Promise, single native Undo and pending/refusal tests. This needs no schema or UI redesign. Do not update any warning baseline to make those two locations disappear.

After that bounded contract repair, address the remaining measured G2 debt with active-source evidence. Q28's32 size failures and other warning counts remain genuine inherited debt, not a new deletion queue. Keep the deferred [retained-source cleanup checkpoint](pre-production-retained-source-cleanup-packet.md); dormant ZoomTracker stays untouched. Do not repeat the now-closed provenance investigation or start database/browser fixtures for source-only typing work.

## Preservation and release limits

All370 canonical schema/test inputs,151 migrations, C's mixed index,187 prior seals/12277 members,11 auxiliary manifests, three other checkouts and original history/carryover inventory remain exact. No production/preview, main, remote push, hosted settings/billing, backup/media/ignored ETL or transformation change. Local source publication is check-only/unbound. Historical Q26e browser receipts remain historical; this candidate is not freshly browser-qualified. Hosted compatibility, engine parity, current incremental protection, independent DB-plus-Storage restore and actual preview/source binding remain separate [release gates](core-release-prerequisites.md).

Reproducible drivers, historical/counterfactual source copies, full private diagnostics, original files, failed pending-save case and local compiled artifacts are retained at `/private/tmp/trek-core-quality-warning-provenance-source-20261116`. The canonical handoff/evidence index records the final documentation commit and sealed manifest.
