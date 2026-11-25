# U04-C2c1 — packing category SDK, owned commands and coherent capture

Accepted locally on 11 November 2026. Extends the accepted C2b PostgreSQL category protocol without changing its schema, RLS, privileges, operation digests or recovery behavior. Native category rename/assignment activation is the separate C2c2 packet.

## Read and command boundary

`family-backend/src/data/supabase/packingCategoryRpc.ts` permits only `get_family_trip_packing_with_categories_v1`, `execute_family_trip_packing_category_v1` and `get_family_trip_packing_category_receipt_v1`, through the existing authenticated browser SDK. Raw category/assignee tables and legacy label-based write loops remain unavailable.

`packingCategoryContract.ts` and `packingCategoryTransport.ts` validate exact protocol keys, canonical identifiers, safe revisions, precise timestamps, bounds, raw Unicode labels, ordered mappings and assignment provenance. The coupled reader supplies the complete visible v1 packing packet and category facts from one consistent collection generation. Every visible item maps to its scoped category; common/private ownership and assignment mirrors must agree. Empty raw category names and literal `Other` remain distinct identities even when native display text collides. Prototype-reserved labels remain literal data.

The returned People are referenced display facts, including historical assignees/actors who are no longer eligible. They are not the complete selectable traveler roster. The SDK supplements missing historical display names without promoting those People to eligible choices. Native activation must obtain eligible choices from the existing authorized roster and apply per-action permissions.

## Immutable submission and retained recovery

The explicit versioned handler is `/trips/:id/family/packing/category-commands`. It checks the original source, Auth user, Person, Family, Trip, view layer and idempotency header. `PackingCategoryCommandSession` and the cohort bind one observed category, item originals, collection/lifecycle scope and operation identity. Repeated submission of the same in-flight intent coalesces. A changed intent cannot silently replace a retained original.

Category work has a distinct typed envelope and owned queue path. Generic mutation replay skips it. Retained-row identity checks, exclusive queue ownership, source/logout/Trip barriers and receipt-first recovery are preserved for item/group/category work. Unknown receipt status remains unresolved. Committed/redacted history proves the original operation committed, not that its acknowledgement is current state or may be replayed against a later lifecycle. A current-state publication requires a fresh coupled reader packet. Loss after a real server commit is tested separately from a pre-send failure.

`PlannerCohortPacking.categorySnapshot`, `loadCategories` and `observeCategory` are SDK methods, not enabled native controls. Publication generation and store identity checks reject late or mixed read responses. Rename/assignment acknowledgement validation verifies the original command and allowed revisions/provenance before canonical refresh.

## Complete capture and compatibility

`createFamilyPlannerCohort` offers explicit `categoryMetadata: true` for qualification. It defaults to false. Opted-in complete/ancillary readers use one coupled packet, never an independent v1 fetch followed by an unrelated category fetch. Plain legacy packing publication clears category metadata rather than inventing identities.

Complete Trip capture may contain `data.packing_categories`. When present it must exactly match the nested packing scope, collection and items; existing per-section manifests, revision checks and full digest protect it. Projection preserves authorized historical display facts. Older complete packages remain readable without this optional section, fabricated IDs or category-write capability. Offline data alone does not grant write authority.

The cold browser offline qualification remains restricted to its previously accepted local host. This packet builds against local API 55431 but does not broaden browser admission or claim fresh native desktop/phone/generated-worker category acceptance. C2c2 must explicitly qualify that entry path before relying on it.

## Local fixture boundary

Strict target: project `family-modernization-20261111-c2a`, PostgreSQL17.11, schema 122, API 55431/DB 55432. Canonical `packing_category_command_guard.py` verifies the complete chain and function/security fingerprints before fixtures. Original project on 55331/55332 remains 120 and is not written by SDK tests.

The saved `packing-category-sdk-tests/prepare_packing_category_sdk.py` creates fresh synthetic identities, TOTP sessions, Trips, a guest and historical recovery receipts only on that target. Private fixture JSON belongs in a fresh canonical `/private/tmp` directory with 0600 permissions and is excluded from source/evidence. `FAMILY_PACKING_CATEGORY_FIXTURE` runs ten new real SDK cases. Test-only `FAMILY_PACKING_GROUP_122_FIXTURE` reruns the existing nine group assertions on explicit122 fixtures; it rejects a simultaneous old group fixture variable. Old120/121 SQL guards remain unchanged and still refuse122. Never reset, relink or downgrade the retained volume.

## Acceptance boundary

The full client suite retains every earlier assertion/status and adds100 category cases. It still has93 previously pending tests. The backend adds five RPC allowlist cases. Scoped lint has no errors/new warnings; seven existing quality gates pass with unchanged baselines. This is not a claim that the repository-wide ESLint diagnostic is clean. The12 protected layouts and15 quality/compiler configuration files remain exact. C2b's156 database cases are inherited unchanged after fresh strict schema/function/source verification; the full database suite is not counted as newly run SDK evidence.

Native category rename/assignment controls, global legacy group mutations, category create/delete/reorder/merge, personal assignments, sharing/bags/templates/imports/notifications are not enabled here. Existing qualified item/group functionality remains intact. No push, main merge, hosted SQL/settings/billing, preview/production release, dependency change, transformation/backfill, backup rewrite or ignored ETL work occurred.
