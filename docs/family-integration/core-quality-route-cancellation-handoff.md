# Q31 — cancel retired native day routes

Completed locally 16 November 2026. This repairs a demonstrated routing race from the active inherited-warning review. G2 remains open; this is not release acceptance.

## Reproduction and behavior

A selected day starts a pending route. Clearing the day previously cleared the map without aborting that request, so its late reply restored the removed route. Leaving the mounted planner also failed to abort the request. Disabling routes did abort it, but a provider that settled afterwards could still cause the old calculation to request subsequent transport-mode legs.

The new eight-case regression file runs the **real native `useRouteCalculation` hook and real retry adapter**, with only the external routing transport deferred. Seven cases failed on incoming source; the current-failure fallback control passed. The repaired source passes all eight. The existing native planner controller tests also exercise the actual handler-to-hook entry boundary, with their established routing mock; they do not substitute for the deferred real-hook proof.

The route effect now always uses the existing update command, including deselection, and aborts its request on cleanup. That command owns route clearing. An explicit abort check after transport settlement and in its error path stops retired calculations before another leg is requested. Current failures retain TREK's straight-line fallback; legitimate current routes, walking segments, hotel bookends, vias, retries and explicit manual refresh keep their prior rules. No screen, tab, style, JSX, permission or feature activation changes.

## Source and verification

Incoming clean integration/publication HEAD: `32a4cbc63b20cf2a35fe0a6371f0b557af66a463`. Local implementation: `1fe0ed5716780c3b53c2b9eb76511ea343d8ad96`. Committed build/qualification source: `1b966ed78b526ddab1f14b113e77f267e0ba35d3`. Six frozen website paths: one native routing hook, one new regression test, two source-qualification files and two handoff/checklist documents.

- **276 tests pass across seven files**: the deferred lifecycle cases, existing integration routing cases, Tour topology and via cases, retry adapter cases, and native planner/controller cases. No failures or pending cases.
- Client typecheck passes with the established8GB Node heap; the first attempt exhausted the default heap. Committed local `npm run build:web`, all four actual source guards, and source-bound artifact positive/negative controls pass. No new browser acceptance or database fixture is claimed.
- Fresh scoped lint: hook6→5 inherited findings, errors0; the new test has0 findings. The effect no longer leaves its intended background Promise as an unmarked floating call. This is not a claim that every optional planner warning is a proven unhandled rejection. Existing suppression count and the other five hook rule occurrences remain unchanged.
- Final actual installed warning gate, after the completed build with declaration/source inputs hash-fixed: errors0; source3556/3455, tests3047/2881, suppressed84/83 (now/baseline). The gate still fails inherited over-budget/stale rules. Size retains the exact same32 failure lines. No rule, baseline, suppression, ignore, size limit or formatting policy expansion.

All twelve protected native runtime/layout files retain Q30's accepted identity: eleven upstream-byte-exact files plus the one fixed type-only Sidebar derivation. The route hook is separately source-qualified; the Sidebar, all other layout files and planner history are untouched. Original operation IDs, payloads, retries, single native Undo, actor/Trip/source/session protections and stored variants remain intact.

## Exact continuation

Q28–Q31 and the eleven earlier warning-delta locations are closed; do not repeat their provenance work or redo these route tests as another packet. Continue G2 with a bounded group of **demonstrated active** async/dependency defects from current diagnostics, refreshing scoped lint where hashes changed. The remaining route callback/effect dependency warning and optional tab loads require investigation, not automatic behavior changes. Normal Costs/Files loader failures are already owned by their slices/cohort; do not invent missing error paths from warning text alone.

Preserve the [release prerequisites](core-release-prerequisites.md) and deferred [pre-production cleanup checkpoint](pre-production-retained-source-cleanup-packet.md). Do not automatically refactor/delete the thirty retained size findings, activate dormant ZoomTracker, expand type-only overlays or enable gated features. No new database fixture is needed just to review client warnings.

All370 canonical schema/test sources,151 migrations, C's mixed index,189 prior seals/12349 members,11 auxiliary manifests and three other checkouts remain exact. Hosted compatibility/current protection and independent DB-plus-Storage restoration remain unproved release gates. No production/preview/Supabase settings or billing, hosted SQL, main update, remote push, backup/media/ignored ETL or transformation change. The unchanged isolated planner/base-packing profile is used only for the local build. Publication is local check-only/unbound.

Private drivers, original source, red/green test logs and final gate diagnostics: `/private/tmp/trek-core-quality-route-cancellation-source-20261116`. Canonical evidence records the final local documentation commit and sealed hashes.
