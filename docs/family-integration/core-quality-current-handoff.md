# Q28 — current quality measurements and retained GL map extraction

Completed locally 16 November 2026. The retained GL map now meets the unchanged file limit; global repository quality remains blocked. This is a source-only continuation of G2 after the [Q26e available-native browser milestone](core-packing-https-edges-handoff.md). Do not repeat those completed browser packets or create a database fixture for this repair.

## Source and scope

Incoming clean integration/publication HEAD: `0d4497dbd365c8713669c3df5ec357c51e7f4976`. Application/test implementation: `4dec8c6242dae922c5a55fcf3a9812f589c39eee`. Clean committed build/qualification metadata: `a96f096d26e9b6a6a38fab05cb75d35575c2debe`. Branch: `codex/trek-v5.1.4-family-reconcile`. Only four client files and four source-metadata/handoff paths are admitted by the frozen eight-path scope.

`MapViewGL.tsx` keeps map construction, all other React statements, dependency arrays and JSX. `familyGlMapLifecycle.ts` owns the existing load/layer/event/teardown logic, with separate route, recorded-track/footprint and clustering concerns. `familyGlMarkerElements.ts` owns existing marker DOM generation. Mapbox/MapLibre engines remain injected; lazy engine selection is unchanged. No dormant helper is activated, no retained entry is deleted and no UI option or photo URL policy is changed. `ZoomTracker` and the deferred [retained-source cleanup checkpoint](pre-production-retained-source-cleanup-packet.md) are untouched.

## Measured verification

- All 242 named pre-extraction cases pass before and after. The final affected suite passes260 cases across three files, including mounted lifecycle, existing marker/icon contracts and mounted Leaflet observers. New cases exercise load/source/layer order and idempotence, flat/terrain mode, current click/viewport callbacks, marker/cluster click routing, context/middle-click/right-drag handling, touch delay/cancellation/deduplication, teardown and rebuild. Fixtures use synthetic data; no Supabase service is contacted.
- Typecheck and `npm run build:web` pass. All four native-presentation/qualified-source/Git-structure/backend-carryover guards pass. Twelve native presentation files and every other unadmitted tracked byte remain exact.
- After type erasure and inlining only the three extracted layer helpers, lifecycle statement tokens and all three marker bodies exactly match the original. Parent JSX and every other parent statement are exact; the installer effect keeps its original dependencies. The two added type assertions have no runtime output. This is stronger than comparing two screenshots, but does not claim a new live browser walk.
- Actual installed `npm run lint:size`, without update flags:33 failure lines before,32 after. Every remaining failure line is unchanged. The retained GL parent falls from1458 to933 wrapped lines; both helpers are under1000 and the test is under2000. No baseline, limit, ignore, suppression, minification or line packing changes.
- Explicit ESLint with ignores disabled also checks the retained files, even though the existing global config ignores that subtree. Scoped warnings fall33→32, errors stay0 and suppressed messages stay15. No rule count grows. The new test has no warnings.
- The final actual `npm run lint:warnings` runs after the build, with client hashes checked before/after and no artifact writer running. It still fails with source3560/3455, tests3055/2881 and suppressed84/83; errors0. These match this packet's fresh pre-repair totals. A separate postcheck verifies128 declaration artifacts have change times preceding the measurement; the gate's narrower `d.ts` glob matched0, so no before/after declaration SHA proof is claimed. Historical Q22a recorded3557/3047/84. Comparing per-file/rule counts in78 changed source/test texts under today's imported types shows no count growth there; that is **not** a historical whole-program comparison and does not establish the cause of the eleven-count discrepancy. Preserve it as open work, not an allowance increase.
- The compiled artifact passes its exact source-bound scan and rejects wrong/missing source identities. Local publication is check-only/unbound; it is not an actual Worker deployment.

## Preservation and limits

The370 canonical schema/test inputs,151 migration sources, C's mixed index,186 prior seals/12237 members,11 auxiliary manifests, three other checkouts, carryover inventory and all unadmitted website bytes remain unchanged. No database fixture, migration, hosted query, setting, billing, main update, remote push, production/preview deployment, backup/media/ignored-ETL or transformation change occurs. No old service or retained fixture is restarted or removed.

This packet supplies no new real-browser, hosted-schema, engine/tzdata or independent DB-plus-Storage restore proof. Q26e's earlier native browser receipts stay historical and immutable; the current compiled candidate is not presented as freshly browser-qualified. Advanced qualification flags and the isolated local planner/base-packing configuration remain unchanged.

## Exact continuation

G2 remains open. Preserve full diagnostics and distinguish the fresh3560/3055/84 counts from historical3557/3047/84. The whole warning gate is both over budget and stale in different rules; do not run a blanket baseline update, suppress findings, or infer which old source statement caused a typed warning from counts alone.

The next bounded quality packet should obtain structured current warning locations and investigate the historical count discrepancy against a reproducible matching type/declaration graph. Then repair a demonstrated active concern and its callers with tests. Fresh literal import witnesses still reach AdminPluginsPanel and FamilyFrontendController (the two remaining ordinary-entry size failures), plus the now-compliant GL map and both extracted modules. These witnesses preserve conditional/lazy paths and authorize no deletion or global-unused claim. The30 retained size failures are not automatically a refactor/deletion queue.

Keep [release prerequisites](core-release-prerequisites.md) as the release order. Hosted API/schema facts, engine parity, current/incremental protection plus independent restoration, the deferred cleanup decision and actual integration-preview/source binding remain separate gates. No new functionality or deployment is enabled by this quality repair.

Private reproducible drivers, before/final command logs, failed fixture/typing attempts, original source and build bytes remain at `/private/tmp/trek-core-quality-current-source-20261116`. The canonical handoff and sealed evidence index record the final local documentation commit and hashes. Do not overwrite prior receipts or the verified backup.
