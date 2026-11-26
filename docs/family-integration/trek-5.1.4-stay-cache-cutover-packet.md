# U05-B2b3b2 — coordinated stay core, saved/offline and consumer admission

Prerequisites: B2b3a original-operation adapters and B2b3b1 coherent canonical read are locally qualified through133. This packet continues the existing B2b3b plan; it does not declare the broader native cutover complete. Work on `codex/trek-v5.1.4-family-reconcile`, using new explicitly guarded local fixture derivatives. Never stage the canonical mixed index. Preserve all prior migrations/ledger/tests/evidence, 12 upstream layouts, original/old branches, stored media and unchanged source-adoption gates. No hosted migration/settings/billing, deployment/main/push, source repinning, ETL/backfill/media/transformation or original backup operation.

## Decisions already settled

Use `get_family_trip_booking_view_v2` as the **single canonical published planner/booking/stay core**. Do not stitch separate stay/booking/planner calls by matching Trip revision. Ancillary packing/task/etc. modules retain their own explicit generation/version qualifications. Keep full canonical facts as one stored core with typed derived views, not duplicate editable planner/booking copies that can diverge.

`family.offline-trip.v3` / `family-web/complete-trip-v3` retain their historical meaning and cannot imply stays are complete. Introduce an explicit v4 only with paired producer, validator, identity binding, cache reader and projection changes. Older versions must remain either valid under their original limited contract or truthfully unavailable for stays; no opportunistic widening or pretend empty accommodations.

V2's canonical-only capability flags remain false for native read/write/timing. Native admission belongs to a separate complete adapter/consumer contract that also proves whole-planner readiness, permissions and owner/cohort stability. `nativeStayReadiness` alone is insufficient; off-calendar/overnight/subminute facts are unsupported by native Accommodation and must remain visible as a precise whole-action availability/refusal, without native markup changes or data erasure.

## Trace and permitted initial seam set

Before editing, read actual callers and record an exact bounded file allowlist. Initial seams (plus their directly paired tests) are:

- `client/src/integrations/family/plannerCohortBundle.ts`, `plannerCohortReads.ts`, `plannerCohortBookings.ts`, `plannerCohortRelations.ts`, `plannerCohort.ts` and `plannerCompleteCapture.ts`.
- `client/src/integrations/family/completeTripSnapshot.ts`, `completeTripRead.ts`, `completeTripRelations.ts`, `completeTripProjection.ts`, `completeTripCompanions.ts`, `plannerCompleteStorage.ts` and their actual worker/storage/schema importers discovered by `rg`.
- New versioned v4 contract/projection helpers under the same Family directory; `bookingStayContract.ts`, `bookingStayRead.ts`, `nativeStayReadiness.ts` only if demonstrated contract repairs are necessary.
- Actual adapters `client/src/repo/accommodationRepo.ts`, Family route adapters and `client/src/components/Planner/useTripStays.ts` may be traced; keep their gate in place until replacement admission is fully proved. The hook currently refreshes reservations independently, which must not overwrite the paired canonical generation.
- Existing shared/public exporter handlers must be traced to establish which ports still refuse. Any allowed public support requires an explicit sanitized DTO and matching consumer tests; never spread the private core. Keep shared stay admission unavailable if no qualified safe contract exists.

No new schema migration is expected. A proven database defect requires a new separately bounded additive migration and qualification; never edit133 or earlier sources. Do not broaden scope through formatting or native-template rewrites.

## Ordered implementation and proofs

1. Inventory every producer, live/store publication, worker/cache persistence, reopen, export/date-impact/assistant and native Accommodation consumer. Document supported versus missing states and the chosen exact paths. Do not rely on compatibility `accommodations: []` in old application handlers or change feature flags to bypass guards.
2. Define one strict v4 manifest/core: version/format, complete canonical core, source/user/Family/person/Trip ownership, exact calendar/core revision and ancillary version vector, typed identity bindings and digest/bounds. Add active/retained stay UUIDs to their own namespace; never alias stay, lodging place, hotel, geographic city, reservation or day. Retained links carry no trashed content. Do not store session credentials/scopes/history/receipts in content DTOs.
3. Pair capture and readers before selection. Validate complete raw canonical JSON without silently stripping new facts; reject corrupt digest/version, missing bindings, mixed revisions, foreign rows, oversize/partial/unknown content and source/actor/layer changes. Keep saved fixtures synthetic and restore old v1–v3 regression behavior precisely. Lock down whether older cached data can serve its former limited purpose; never infer v4 completeness from it.
4. Publish live planner/booking/stay as one owned generation. Replacement, refresh, cache write and late reply must not produce independently mismatched booking/stay stores or overwrite the new owner. Include logout, fresh login, Family/person change, Trip switch, source switch, draft/published switch, retired registry, abort, overlapping reads and uncertain network behavior. Unavailable API/current revocation refuses rather than falling back to old live queries.
5. Qualify the actual cache/storage/worker cold-open path offline with complete v4, then revocation/return-online. Cache is content, not current authorization. Keep private/public separation explicit and test current access before online publication. Public/shared DTOs must exclude private stay notes and all command/Auth/history operational metadata; no private full-core persistence in a public bucket/URL.
6. Only after complete consumer admission passes, connect native **read** adapters without altering upstream layout. Native unsupported states must refuse truthfully and retain canonical recoverability. Do not turn on native mutation/compound create/confirmed timing controls in this packet. If actual native read/browser admission cannot fit this coherent saved/core slice, leave its existing gate intact and write one finite follow-up; do not claim UI verification from pure schema tests.

## Acceptance

Use representative synthetic hotel/manual lodging, linked/unlinked booking, repeated stay and mixed planning records. Prove date-only/unknown clock versus true midnight, same-day and off-calendar dates, overnight windows, named zones and exact legacy/timed booking strings; active/retained links, Trash/restore; viewer/Direct/propose/deny/foreign roles; denied/expired/revoked/fresh sessions; stale/mismatched generations and owner switches. Prove atomic store/cache admission, actual cold reopen/offline behavior and no silent partial/empty substitution. Preserve existing original-operation queue/outcome proofs and canonical facts.

After mocked contract tests, use the installed SDK through the real dispatcher and guarded signed local APIs; exercise real worker/storage/native consumers at the layer actually changed. Actual browser/device proof is required before claiming desktop/phone UI acceptance. Block `/render/image/` during any catalog browser qualification; ready stored variant objects or placeholders only. No live production test or media inventory is authorized by this local packet.

Run affected client/backend/compiler/lint/contract/queue/snapshot/source/carryover/build-secret checks; keep 94 source adversarial cases, no baseline expansion and explicit pre-existing release gate failures. Reverify source132 preservation, all prior canonical sources/ledger/evidence and exact native layouts. Save exact review paths, reproducible target-bound proof and scoped local commit. Hand off native mutation/compound writer qualification separately. U05-C/F4/F5/F3c release acceptance and independent/incremental backup work remain separate.

## Saved-core checkpoint —13 November2026

The paired v4 serializer/producer/owned-storage/cold-reader slice is locally qualified; actual live bundle/native/public/preparation adoption remains gated. See [handoff](trek-5.1.4-coherent-stay-cache-handoff.md) and [finite native reader packet](trek-5.1.4-native-stay-reader-packet.md). No hosted release or native UI acceptance is implied.
