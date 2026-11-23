# U04-F5b Atlas — truthful partial-read availability

Execution finding15November2026: [the actual native consumer contract cannot represent unavailable/unknown facts](core-atlas-availability-contract-gap.md). Eight current-behavior diagnostics and three intentionally failing desired regressions reproduce the gap. The explicit nonvisual-only stop condition below applies; **no application repair was landed**. Continue with [the coordinated availability/rendering packet](core-atlas-availability-rendering-packet.md), preserving native layout while adding the required read-state branches.

Prerequisite: [schema143 readiness decision](supported-core-schema143-readiness.md), candidate `e287b4c53d3bc7ad88177c566bd936240c95f64f` or a documentation-only descendant; accepted typed catalog/native Collection cohort and all preservation seals. This is the next bounded connector packet. Do not restart completed Collection work or implement full Atlas parity.

## Required result

Atlas keeps actual Family totals, visited-country facts and country geography visible even if an unsupported bucket/regions/layers request is unavailable. Unsupported is distinguishable from a successful empty list; unknown per-country counts do not display as measured zero. Existing native desktop/phone presentation remains intact. Family writes that lack a real implementation stay refused.

## Trace and freeze before edits

Read `applicationHandler.ts` Atlas routes, `legacy/data/supabase/travelStats.ts`, country geography and current canonical view definitions; then actual `useAtlas.ts`, `atlasModel.ts`, `useAtlasCountryActions.ts`, `AtlasPage.tsx` and phone consumers. Record each response/status/error consumer and which counts/statuses are actually derivable. Current source facts are: bucket/regions/layers use compatibility empties, per-country counts are zeros, and stats/bucket share `Promise.all`. The current canonical family_country_visited view explicitly filters visited user marks joined to active Family members. Preserve that provenance; do not assume totalTrips or those marks establish a per-country Trip/count/planned-status projection.

Choose and document the smallest existing native availability/error representation. If required numeric native types cannot express unknown, define a typed availability boundary in the nonvisual controller/adapter and suppress that unsupported metric through an existing consumer state. Do not cast null to a number, invent counts, silently coerce failure to an empty list, or hide the whole real map to avoid the mismatch. If no existing native state can truthfully represent the chosen limited scope without a presentation change, stop with that precise contract gap rather than editing protected JSX or fabricating success.

## Permitted implementation

- Family handler routes and a dedicated typed Atlas reader/availability module if needed; focused tests alongside them.
- The minimum nonvisual Atlas hook/model/controller change to isolate independent sections, cancel retired source/actor loads and carry truthful availability. Preserve native/Nest behavior for non-Family mode.
- A narrowly justified Family backend read mapper only if existing canonical reads already establish the fact, plus tests. No schema, enum, migration or invented REST endpoint contract.
- Packet/readiness/handoff documentation with exact evidence and remaining limits.

Do not change protected native layout files/CSS, task/packing/Collection originals/queues, source/adoption markers/pins, package/lock/toolchain, security policy or provider integrations. Do not widen a source gate. No hosted SQL/settings/billing, remote push/main merge, deployment, backup/ETL/media operation, image transformation, new table or independent restore claim. Do not start retained stopped fixtures. If a live local proof is necessary create an explicitly owned isolated target using the current guarded143 fixture tools, record original states and stop only that target.

## Execution order

1. Add a failing regression through the real Family request dispatcher and actual Atlas loader/consumer, proving successful stats survive unavailable bucket data. Add the inverse failure and genuine-empty controls. Use actual module boundaries; mocking a fake success handler is not proof.
2. Implement independent load/error/availability and exact source/actor-generation ownership. Stats/geo failure must not erase independent valid sections; stale successes/failures must not repaint a new account. Keep retry/reload semantics bounded; do not add polling or provider egress.
3. Replace compatibility promises only once the actual native consumer can preserve supported reads and represent unavailability. Check country-count/status provenance; omit unsupported metrics with explicit availability rather than zero. Preserve actual visited facts and native non-Family behavior. Mutation routes/controls must retain Direct/Propose/Deny/session refusal as applicable.
4. Run focused tests, both typechecks and scoped lint; build after shared compilation has finished, without overlapping tests that consume generated files. Use the existing lock/toolchain. Inspect a synthetic ordinary desktop/phone final artifact for real stats/country map, partial failure and unsupported controls, and zero catalog `/render/image/` attempts. External map/provider egress stays intercepted. This is a local website proof, not hosted Storage acceptance.
5. Revalidate protected runtime outside the permitted slice,12 native layouts, whole carryover inventory,143 migration/351 prior canonical source hashes,mixed index and all retained evidence seals, including this assessment. Commit only the scoped website changes after checks, preserve a sanitized source/evidence receipt, and stop owned processes. Update the matrix with the exact still-disabled scope.

## Mandatory regression cases

- Stats success/bucket unavailable; bucket genuine empty versus unavailable; stats failure with geometry success; geometry failure with stats success; independent region/layer errors.
- Correct nonzero totals and visited-country codes from actual Family mapping; unknown per-country counts cannot be interpreted as zero. Test absent/invalid facts and real empty data separately.
- Native desktop/phone load/retry and unmount; slow old source/account responses after logout/relogin, source replacement and a new load; old errors cannot clear current successful data.
- Unsupported Atlas writes and regions/layers remain unavailable; navigation presence is not permission. Retained auth/session checks and permissions cannot be bypassed by compatibility DTOs.
- Original Nest/native response behavior is unchanged outside Family mode. Existing catalog/Collection/nav/source gate tests still pass, source policies/default-read-only controls unchanged, ready-v1 media remains intact.

## Bounded command set

Use Node24 from the established toolchain and the existing installed lock. Run shared builds/typechecks sequentially before the tests that import generated shared outputs. From the integration root:

```sh
npm run typecheck --workspace=@family/backend
npm run typecheck --workspace=@trek/client
npm run test --workspace=@trek/client -- src/pages/atlas/useAtlas.test.tsx src/pages/atlas/atlasModel.test.ts src/pages/atlas/useAtlasCountryActions.test.ts src/pages/AtlasPage.wiring.test.tsx src/integrations/family/applicationHandler.nav.test.ts src/integrations/family/catalogMapHandler.test.tsx src/integrations/family/nativeSourceOwnership.test.ts --maxWorkers=1
```

Add the new real Family-handler/native-loader regression file to this explicit list. If a backend mapper changes, run its exact affected tests too. Run scoped ESLint on changed runtime/test paths, compare inherited advisories without suppression/baseline growth, then the existing fixture-configured `npm run build:web` after those tests finish. Use the owned fixture's explicit environment; no hosted URL/key, global source-flag activation or production deployment command belongs in this test packet. Preserve the known source-adoption guard refusal as a separate hold. Browser proof uses the actual built artifact and supported native controls, with external egress blocked.

## Completion and next

Done means one honest limited Atlas read journey with partial-load and retirement behavior proved through handler plus actual native consumer, all affected checks/desktop-phone observations recorded, no false-empty feature acknowledgement and no unrelated activation. If implementation exposes a genuine schema/contract gap, record it explicitly rather than adding speculative tables.

After this packet return to **composed supported-core default/profile acceptance on schema143**, then explicit source adoption and the separate backend/engine/recovery/release gates in the readiness report. Advanced stays,bags/recovery,private files and full upstream feature parity can remain off. This packet does not authorize a preview/production release.
