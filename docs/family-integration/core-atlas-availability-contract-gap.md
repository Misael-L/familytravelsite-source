# Atlas availability: native consumer prerequisite

Resolution: the prerequisite below is historical and is now addressed by [the coordinated implementation](core-atlas-availability-handoff.md). Its original red receipts remain unchanged; they are not current failing application tests.

15 November2026, baseline `8d6fd108fa628ebb0ff6992defee56afaea0e460`, branch codex/trek-v5.1.4-family-reconcile. **Atlas is not repaired yet.** The [nonvisual packet](core-atlas-read-availability-packet.md) reached its explicit stop condition: “If no existing native state can truthfully represent the chosen limited scope without a presentation change, stop with that precise contract gap”. No runtime or schema change was landed.

## What is demonstrated

- The real Family reader/handler returns nonzero aggregate trips/places/days and explicit visited-country codes. The canonical visited-country view derives from visited user marks joined to active Family membership, not a per-country Trip projection. Per-country trip/place counts in the adapter are compatibility zeros.
- Native useAtlas puts stats and bucket reads in one Promise.all. When only bucket is changed to an unavailable error, valid statistics disappear and its default zero totals reach consumers. Country geometry can still load independently.
- Desktop AtlasPage always renders region/city totals; missing cities use `||0`. Its bucket content always renders empty guidance for an empty array. It receives no section availability/error contract.
- Phone MAtlasStatsCard always renders five numbers, also coercing missing cities to0. MAtlasBucketSheet renders an empty bucket message, with no unavailable state. Passing only different hook data cannot fix that honestly without a fake sentinel/string cast or hiding real statistics.
- Unsupported bucket/country/region mutations already refuse through the actual handler/adapter. Their controls must not become enabled merely to make the read page look complete.

Eight real handler/hook/native-DOM diagnostics pass. Three desired contract regressions fail as expected on this unchanged baseline: bucket must refuse, independent statistics must survive, and unknown city count must not display0. [Exact source lines, hashes, receipts and reproduction tools](supported-core-readiness/atlas-contract-20261115/README.md). Repeated harness qualification is not additional unique feature coverage. No full build/browser/SQL test or hosted API call was needed to prove this source/DOM representation gap.

## Smallest appropriate correction

Complete the handler, loader and native display contract together. Keep all existing Atlas layout, containers, tabs, styles, map controls and responsive behavior. Add a typed section read state (loading,ready,unavailable,error), keep measured zero distinct from unknown, and let the existing metric/content slots render an unknown marker or the existing native empty/error component with honest copy. A toast alone does not correct a persistent empty-data claim.

This requires narrowly scoped conditional rendering in the existing Atlas consumers, not a redesign and not new database tables. Missing region/bucket/layer features remain unavailable; do not fabricate them from unrelated Family tables. Known aggregate totals/country marks and geography remain independently useful. Country tooltip/actions cannot interpret unknown counts as an explicit mark-only country. Non-Family native responses retain their existing behavior.

## Next and retained release boundaries

The [next implementation packet](core-atlas-availability-rendering-packet.md) makes those necessary native rendering changes explicit, along with the original handler/loader/retry/retirement checks. That coordinated repair is still required before composed supported-core acceptance/source adoption. The55 pending hosted migrations and engine/recovery/target release prerequisites remain the last readiness assessment's observations; this contract check did not refresh or alter hosted state.

All application/dependency/migration/source-policy and native files remain exact. Canonical mixed index/351 prior schema-test sources,143 migrations and130 earlier evidence seals stay protected. No local service started, hosted SQL/settings/billing, remote push/main merge, preview/production deployment, backup/media/ETL or image transformation occurred. Independent database-plus-Storage disaster recovery remains unproved.
