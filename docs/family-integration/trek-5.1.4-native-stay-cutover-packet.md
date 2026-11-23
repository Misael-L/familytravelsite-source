# U05-B2b3c5 — native stay creation and recoverable lifecycle cutover

## Database checkpoint — 14 November 2026

Phases 1–2 below are locally qualified at schema 135. Native client/queue/UI phases 3–4 remain pending, with controls gated. [Database handoff](trek-5.1.4-native-stay-database-handoff.md) and [remaining client packet](trek-5.1.4-native-stay-client-packet.md) give the actual results and precise continuation. Do not treat the original milestone goal below as a completion claim.

Goal: finish one usable native lodging milestone, preserving the actual upstream desktop/phone interface. Prerequisites are the C4 service/queue handoff, implemented schema-134 bundle contract, C2 native lifecycle audit and existing coherent native reader/ancillary loader. C4 does not enable Add or removal. Work only in the current 5.1.4 integration branch and a newly owned local database derivative.

## 1. Resolve the remaining transaction from actual source

Pin the clean C4 website commit, canonical mixed index, all 134 migration/311 test-source hashes, old evidence and 12 protected native layouts. Read the pinned upstream `AccommodationsService.createAccommodation`, `useDayDetail`, `DayDetailPanel`, `MAccommodationSheet`, `MDaySheet`, accommodation API/repository, current native stay writer, planner commands and canonical visit/location/day tables. Record the actual native Add payload, arrival-stop creation/order/category/time behavior, `keepStop` meaning and independent booking/budget ownership.

Map a Family saved lodging to its own identity and an arrival visit to a separate occurrence. Country/state/city context must never substitute for the hotel or visit. Decide from the actual consumer whether the native arrival mirror is user-requested planning data or a derived projection; do not duplicate an independently editable visit without explicit ownership. Preserve unknown time, midnight, second precision, repeated visits/stays and independently owned booking notes. Specify the exact observation, operation namespace, lock order, retry/cancellation and original-session boundaries before SQL changes. Do not broaden the accepted bundle dialect incompatibly.

## 2. Implement only demonstrated database gaps locally

If the arrival action requires persistent data, extend through a new versioned atomic command in one reviewed additive migration, after inspecting existing normalized visit/link structures. Do not invent a new table or alter old routines simply to mimic Nest storage. Include stay, booking/dates/link and the actual requested visit/order effects in one transaction and immutable receipt. No browser-side sequence, best-effort compensation or success with a missing arrival visit.

Confirmed-Trash discovery remains absent: specify and implement a narrowly authorized bounded keyset listing using `(deleted_at,id)`, current Direct schedule authority and explicit unavailable-location/parent-Trip behavior. Evaluate the existing partial Trash index before adding another. Restore the same identity and original facts; do not cascade-delete independent reservations, expenses, locations, Journey content or catalog data. Preserve current reservation permission separation.

Use an explicit small SQL/test allowlist and a new isolated candidate. Prove full rollback at all write/audit/receipt boundaries, real lock-wait revocation, signed current-session/AAL/foreign denial, concurrent retry/cancel, intentional repeats, original history and row/function/ACL/index preservation. Rehearse final migration sources as the normal non-superuser owner. Never apply hosted SQL in this packet.

## 3. Connect native actions and reachable recovery together

Use the qualified original-operation service/queue, strict new response dialect and existing UUID registry. No numeric native identifier becomes a database UUID. After confirmation, load the fresh coherent core and authorized ancillary modules through the guarded native cohort; publish paired native/cache generations only when complete/current. Preserve source/session retirement, corrupt/unknown queue holds and read-refresh recovery. A stale receipt cannot replace newer content.

Connect actual desktop/phone Add, original retry/cancel and the recoverable removal contract as one coherent acceptance milestone. Confirmed Trash must be discoverable across devices, not only while an unresolved local queue item exists. Reuse existing Family recovery and native patterns; if a small UI extension is required, document its exact purpose and allowlist before editing it. Do not silently rewrite protected upstream layouts/styles or invent a broad custom planner. Do not enable Remove before users can find and restore the record.

## 4. Acceptance and finish

Mock native-to-command contracts first, then actual installed SDK/RLS/IndexedDB and the generated App on desktop/phone in the new local fixture. Prove actual Add/arrival order and category, unknown/midnight/overnight handling, double-click/lost response, offline reopen/retry, current permission changes, complete publication, independent repeated stays, Trash discovery/restoration, unavailable sources and original file/media identity preservation. Retain stored variant object readers with zero catalog transformation attempts.

Run affected old/new regressions, configured types, scoped lint without baseline growth, unchanged quality/source guards and appropriate default/qualification build/scan/syntax checks. Seal exact source/commit/row preservation receipts, stop only newly owned services and retain restart instructions. Commit only scoped website work locally; never stage the canonical mixed index. Keep full 5.1.4 source-adoption/F4/F5/preview readiness gates explicit.

No preview/production deployment, main merge, push/publication, hosted changes, billing, backfill/sync, original backup/media/ETL access or transformation-setting change. If a required native contract remains unproved, preserve its gate and report the precise remaining dependency; do not move on to unrelated features.

[Qualified adapter/queue handoff](trek-5.1.4-stay-bundle-adapter-handoff.md). [Implemented SQL contract](trek-5.1.4-atomic-stay-create-contract.md).
