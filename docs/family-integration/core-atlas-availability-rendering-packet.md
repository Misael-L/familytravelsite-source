# Atlas — coordinated availability contract and native display

15 November 2026: **the coordinated Atlas availability repair is implemented and qualified locally**. Read [the acceptance handoff](core-atlas-availability-handoff.md). Actual aggregate/visited-country facts and country geography settle independently; unknown metrics stay unknown and unsupported sections remain unavailable. The earlier red diagnostic evidence remains historical. **Next: [composed supported-core acceptance](core-composed-acceptance-packet.md)**. Preview/backend/source-adoption release holds remain separate.

Continue on the current5.1.4 integration branch after [the demonstrated consumer prerequisite](core-atlas-availability-contract-gap.md). Preserve the normalized Family schema143/catalog/Collection/recovery work. This supersedes only the earlier packet's nonvisual-only limit where the native Atlas cannot display unavailable data. It does not add advanced Atlas features or authorize deployment.

## Fixed scope and files

Keep the native structure, classes, styles, map controls, tabs and responsive layout. Permit only the small conditionals/props needed to render existing content slots honestly:

- Family `applicationHandler.ts` Atlas routes and a typed Family Atlas read module/tests if useful.
- `pages/atlas/useAtlas.ts`, `atlasModel.ts` and the existing country actions as needed for independent read states and safe ownership/actions.
- `pages/AtlasPage.tsx` numeric slots/bucket-content branch; `mobile/screens/atlas/MAtlas.tsx` availability wiring, `MAtlasStatsCard.tsx` numeric slots and `MAtlasBucketSheet.tsx` content/unsupported-control branch. `atlasController.ts` already derives the hook type; do not invent a second divergent controller.
- Actual handler-to-hook/desktop/phone tests and the existing native fixtures. Use the established native EmptyState/skeleton/button components and locale system; add only required translations with all established parity checks.

All12 separately pinned planner/map/native presentation files remain unchanged. No CSS/layout replacement, new UI framework, dependency/lock/toolchain change, new table/migration/enum, source-marker or adoption-pin expansion, provider feature or queue rewrite. No hosted SQL/settings/billing, push/main/deployment, transformations, backups/ETL/media action. Keep Tours and unsupported Atlas actions off. Use a fresh explicitly owned fixture only if later proof needs a real local backend; never restart retained targets.

## Contract decisions

1. Define section read state for stats,geography,bucket,regions,layers and selected-country details: loading,ready,unavailable,error. Ready may contain a genuine empty result or a measured zero; the other states may not be serialized/displayed as empty success. Keep transport errors distinct from deliberately unsupported responses. Use current HTTP routes; no new REST endpoint is needed.
2. Family stats retain actual aggregate totals and explicit visited-country facts. Omit unmeasured per-country trip/place counts; make their native type optional/nullable with explicit checks rather than a string/number cast or a magic numeric sentinel. Missing city/region counts display a neutral unknown marker with accessible unavailable meaning in the same slot. Stats errors render an existing native error/Retry treatment, never a zero-valued summary. Derive continent counts only from actual visited codes if used; do not reinterpret planned trips as visits. Audit missing aggregate rows separately from authoritative zero before applying defaults.
3. Family unsupported bucket/region/layer reads refuse with stable501 availability codes. Change consumers in the same cutover: bucket unavailable renders an honest notice in its existing content area; genuine ready-empty retains native empty guidance. Unsupported Add/remove/mark/detail actions remain refused and visually unavailable as appropriate. A successful empty array remains valid for a genuine supported read, including non-Family native behavior.
4. Each independent read settles its own state. Stats and geometry survive each other's failure and bucket/regions/layers unavailability. Expose bounded retries only for retryable errors. Unsupported region data must not trigger repeated pan/zoom fetches or dim the usable country layer as though a region overlay existed. Unknown country counts cannot take the native zero-count unmark path. Unsupported selected-country detail should show the existing truthful unavailable feedback, not silent failure or stale detail.
5. Capture source/actor/generation for all reads, errors, retries and delayed callbacks. Clear/retire old facts immediately on owner change; stale success/error/finally cannot repopulate or erase the new account's data. Use existing actor notifications/context guards, not new authority based on a marker or localStorage. Preserve full non-Family/Nest behavior when Family mode/availability metadata is absent; do not generalize unsupported Family data to everyone.

## Implement and prove one complete change

Start by porting the three retained red regressions into real application test roots with the desired assertions. Keep the eight diagnostic witnesses as explanatory baseline evidence, not tests requiring the bugs forever. Build the actual handler/hook/native-consumer regression suite first, then change the full cohort together; do not ship only501 responses or only Promise.allSettled while displays still claim empty/zero.

Cover stats success/bucket unavailable, inverse failure, independent geometry/regions/layers failures, genuine empty/zero versus missing facts, old source/actor/reload races and unmount. Exercise both native desktop and phone controls, not just a fabricated controller. Assert that counts are not fabricated, unsupported actions refuse and original non-Family ready-empty behavior remains unchanged. Retain catalog/nav/Collection/queue/source qualification tests.

Run backend/client typechecks, the exact affected client tests, scoped lint/no advisory growth and required locale/style gates. Build the existing fixture-configured web artifact after shared compilation/tests finish; no concurrent rebuild race. Then exercise ordinary synthetic desktop/phone Atlas with the real handler/read path: known totals and country map, unavailable bucket/regions/layers, actual partial failures/retry and old-owner retirement. Inspect the final built artifact, not only dev server or test state. Intercept external/provider egress and all catalog `/render/image/` requests; require zero attempts. Do not claim mock Storage or unit DOM coverage as hosted RLS/Storage/browser acceptance.

Revalidate unchanged143 migrations/351 canonical sources/mixed index, all earlier seals including this prerequisite,12 native layouts, whole backend carryover and all outside-scope bytes. Stop only owned services, commit only the qualified slice and preserve sanitized evidence/source archive without publishing. Update the22-domain readiness matrix with actual supported/disabled states.

## Finish

The Atlas repair is complete only when the handler, loader and actual native displays jointly preserve real facts and distinguish empty/zero from unknown/unavailable/error on desktop and phone. Keep visual layout native. Then return to composed supported-core App/profile acceptance and explicit source adoption, followed by separate backend/engine/recovery/release steps. Full advanced feature parity remains outside the first supported-core preview.
