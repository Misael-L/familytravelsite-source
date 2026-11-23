# U05-B2b3c5 — original-command warm native cohort refresh

Status: local prerequisite checkpoint, 14 November 2026. This finishes the already-open-Trip complete refresh seam required by sections3–4 of the existing C5 client packet. **C5 native UI is not complete or enabled.** The previous queue checkpoint is the parent. No hosted schema or site changes are implied.

## Implemented behavior

Under only the existing exact `local-native-v1` / `http://127.0.0.1:57171` qualification, the actual coherent planner bundle selects the separately tagged native stay reader. The canonical core preserves explicit owned-arrival identities; ordinary v2 qualification remains unchanged. Actual Trip-header, task, packing/category-v2, traveler, expense/share/payer, file/link, category and stored-variant descriptor loaders produce the ancillary resources. There is one complete cache generation and a matching native stay/reservation publication.

`PlannerCohortReads.hydrateNativeStay(current, guard)`, exposed by the existing Family cohort, requires a visible matching Trip, current actor and native qualification. It reuses the original command's supplied read guard all the way through the bundle and ancillary loaders. It does not acquire a nested shared queue lock. It checks that the refreshed Trip revision is at least the acknowledged current read and that local native fields are unchanged before publication. Ordinary hydration cannot join this privileged flight while a command is retained. Only the original session acknowledges its exact queue row after this complete refresh resolves.

A private weak association attaches exact cache-generation withdrawal to coherent bundle results. If the final native publication refuses a local edit or stale acknowledged revision after cache capture, only that rejected generation is withdrawn. A newer head is never removed by the existing generation CAS. No callback or internal withdrawal handle is serialized into native rows, cache data or requests.

Original-command completion is intentionally restricted to an already-open Trip. This checkpoint does **not** install the refresher into cold queued recovery. The existing recovery environment pins its failed-read epoch/problem, and the cold command session pins the opening selection. Naively calling full hydration would invalidate that environment or change null selection before its final fence. Those need an explicit coordinated publication/acknowledgement handoff; do not relax the session fence, clear the queue first or claim cold native publication is done. The generic recovery path continues to retain known commits when its full refresher is unavailable.

## Acceptance and limits

- 1,090 inherited client regression cases in38files pass, including old C4/cohort/read/write behavior.
- 27 enabled installed-SDK/PostgREST/RLS/IndexedDB-adapter cases use the actual Family cohort and real ancillary reads. They cover native core selection, paired generation/owned arrival publication while the queue row still exists, first Add from an actual empty cohort, repeated stays sharing the original arrival without claiming/replacing it, genuinely lost committed replies, task/packing/expense read refusal and retry without duplicate execution, concurrent ordinary hydration refusal, local edit preservation/cache withdrawal, source/layer/logout/disposal/metadata retirement, cold selection refusal, closed/foreign guard refusal, stale revision refusal, qualification retirement and unchanged desktop/phone hook consumption.
- 11 inherited real-SDK queue cases pass again. These still qualify the separate queue/cold inspection machinery with representative ancillary fixtures, not cold native cohort publication.
- Client types, zero-added scoped lint,99 source guards,23 isolation refusals, seven unchanged quality gates and default web build/secret scan/405 JavaScript parses/descriptor match pass. Three existing source-adoption guards remain deliberately blocked at5.1.2. No pin changes or baseline expansion.
- All324,419 original restored rows /240COPY projections survive.595 prior routine bodies/owners/ACLs,17 existing narrowly owned schema135 additions,98 original NULL ownerships,135migrations/314canonical sources, canonical mixed index,12 protected5.1.4 layouts,97 prior seals/7,133members, dependencies/backend carryover and old5.1.2 remain preserved. No SQL changes.

Auth identities are synthetic signed local sessions; IndexedDB uses the test adapter. Native hooks are React tests, **not a generated App or browser acceptance**. The local build has no command qualification flag. No image bytes or catalog transformations are requested by this checkpoint. Actual desktop/phone generated flows with transformation interception remain required before UI activation. Independent full database-plus-files restore remains unproved.

## Exact next within the same C5 milestone

1. Coordinate cold recovery's original environment, complete publication and acknowledgement without weakening exact row/session/source/selection fences. Wire only that accepted callback into `createPlannerCommandRecovery`; ordinary readers must continue to block all queued work. Reuse this warm refresher rather than adding a second planner implementation.
2. Connect original cohort/row observations to native Add/edit/Trash/restore/keepStop, with hotel/manual saved-lodging eligibility and current Direct schedule/reservation permissions. Keep booking confirmation edits separate. Do not refetch mutable context as a replacement for what the user saw.
3. Add reachable bounded confirmed-Trash discovery/restore for desktop and phone using the Family boundary and existing modal patterns. Audit generic owned-arrival visit/day actions against SQL invariants. Leave unsupported off-calendar/seconds/overnight display refused until the actual consumer supports it.
4. Qualify the combined handlers, original queue, real cohort and generated desktop/phone App before enabling controls together. Intercept/block `/render/image/` and prove zero catalog attempts while stored variants render. Keep12 protected native layouts byte-exact. Do not deploy a preview in this packet.

The retained schema135 candidate and volumes were requalified and stopped after acceptance. The newest private stop receipt is `/private/tmp/trek-u05b2b3c5-cohort-20261114/owned-fixture-stop.json`; older fixture-directory receipts are historical. Use that exact receipt, images, container IDs, nonce and guarded readiness for any restart. Prior unrelated service states remain unchanged.

Evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/evidence/u05b2b3c5-native-stay-cohort-2026-11-14`. No hosted SQL/settings/billing, production/preview/main/push/publication, original backup/media/ignored ETL, backfill/sync or image-transformation operation. Website changes are a scoped local commit; canonical documents/evidence remain outside its mixed index.

Continue [the same C5 client packet](trek-5.1.4-native-stay-client-packet.md), sections3–4.
