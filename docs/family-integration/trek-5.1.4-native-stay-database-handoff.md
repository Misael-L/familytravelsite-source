# U05-B2b3c5 — locally qualified native stay database foundation

C5 phases 1–2 are complete; native client/queue/UI phases 3–4 remain pending. The website runtime is byte-for-byte the C4 runtime at parent `b35732a01a2f4b2adfbf06e4fd6ea3e6bae311b7`. Add/removal controls remain gated. This checkpoint does not claim native lodging creation is usable in the preview.

## Implemented

The additive schema-135 migration provides one explicit ownership relationship between a stay and its untimed arrival visit. One versioned atomic operation executes the original stay/new-booking bundle or observed save/Trash/restore together with arrival identity, order and lifecycle, using immutable original-operation decisions. It never turns check-in guidance into an appointment. Independent/shared arrival visits, repeated stays, original notes/duration, midnight/second/overnight guidance and independent booking facts are preserved.

Six authenticated APIs provide initial exact context, compound execution, original outcome/cancel, a separately tagged coherent ownership view and current-permission keyset Trash discovery. The original 595 function bodies, owners and ACLs are exact. One private transaction-context table is RLS-protected and empty after operations; one partial unique FK index owns the relationship. Old writers refuse desynchronizing owned visits rather than silently breaking it. No existing record is backfilled/reclassified.

Canonical sources are three unstaged files under FamilyTravelApp `supabase/`: `migrations/20261114070706_native_stay_arrival_recovery.sql`, `tests/trip_native_stays.py` and `tests/trip_native_stays_guard.py`. Exact website review copies are under `docs/family-integration/supported-core-readiness/backend135/`. The canonical mixed repository/index remains untouched by staging or commits. Local migration ledger is 135; hosted migrations have not changed.

## Actual local qualification

- Final plain migration replayed on a fresh guarded schema-134 derivative as the normal non-superuser owner.
- 44 new native-stay database cases, 98 prior command/outcome/coherent-read regressions and 38 prior bundle cases pass: 180 distinct SQL cases, no skips/failures.
- Eight installed Supabase SDK 2.112.2 cases pass through actual signed PostgREST/RLS, including a genuinely committed response deliberately lost before inspection, concurrent exact retries, fresh-session inspection/cancel and original-session write refusal. Auth rows/claims/factors are synthetic; this is not GoTrue or native browser/queue acceptance.
- Three representative canonical installed-test/guard smoke executions pass; these repeat existing cases and are not added to the distinct count. The canonical guard refuses missing or incorrect fixture selection. The underlying isolation guard passes 23 adversarial refusal cases.
- All 324,419 original rows across 240 source COPY projections survive unchanged, including ledger history; all 98 original visit ownership values remain NULL. No ownership graph inconsistency or retained context row remains.
- All 595 older routine bodies/owners/ACLs remain exact; all 17 new functions have restricted execution, normal ownership and empty search paths. Clients have no direct ownership/context rights.
- Existing source/carryover tests and seven unchanged quality gates are rerun. The three preexisting source/native/history adoption holds remain at source adoption 5.1.2; do not relabel them as passing. C4's 952 focused tests, types/lint/build and 405 JavaScript parses are inherited unchanged-runtime evidence, not new native UI qualification.

44 new cases cover fault rollback at arrival/receipt boundaries, real session/membership/policy lock waits, post-read revocation, duplicate/cancel races, private/current permissions, unavailable lodging, keyset bounds, shared arrival release, exact export, no-op revision behavior and old API preservation. Final accepted local fixture: `/private/tmp/trek-u05b2b3c5-native-20261114/rehearsal`, target `family_native_stay_rehearsal_20261114`; initial diagnostic target is not release acceptance. Fixtures are stopped after qualification, containers/volumes retained and restart order recorded in the seal. No original backup/media/ignored ETL is accessed.

## Continuation

Follow the native stay client packet next. Preserve explicit ownership in validated coherent/cold/warm reads, add an original published empty/nonempty cohort witness, retain whole outer operations through the queue, wire native Add/edit/lifecycle and provide bounded confirmed-Trash discovery/restoration across devices. Then qualify actual desktop/phone generated-App flows and complete ancillary/native/cache publication before enabling the controls. The database foundation is a prerequisite, not acceptance of these remaining flows.

No production/preview deployment, main merge, push/publication, hosted SQL/settings/billing or image-transformation change. Independent full database-plus-file recovery remains unproved; this uses an already qualified private local restore derivative, not a new independent backup rehearsal.

[Exact implemented contract](trek-5.1.4-native-stay-contract.md). [Next client packet](trek-5.1.4-native-stay-client-packet.md).
