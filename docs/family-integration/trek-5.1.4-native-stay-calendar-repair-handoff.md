# U05-B2b3c5 — lodging arrival/calendar consistency repair

Status: local repair checkpoint, 14 November 2026, parent `24ddaf1e26486388429d0241de4faa3780598ee2`. This continues C5 sections 3–4. A demonstrated database defect took precedence over combined installation. **Normal installation and generated desktop/phone browser acceptance remain gated.** No hosted migration or deployment occurred.

## Reproduction and corrected behavior

The schema-135 audit exercised 12 actual signed PostgREST actions. Owned-arrival visit notes and ordering worked; generic move/Trash/clear refused atomically. Calendar titles, append and end extension were safe. However, insertion before an owned arrival and calendar reordering could succeed while leaving the arrival's day civil date different from its stay's arrival date. The two inconsistencies were introduced only in new synthetic audit Trips; original restored rows were not changed.

A fresh, separately owned derivative was restored from the preserved local source-131 dump, then upgraded through 132–136. It does not reuse the damaged synthetic source data. On 136, both reproduced actions fail with SQLSTATE `23514`, preserving the entire pre-command graph and receipts. Safe day title/append/extension, insertion after owned arrivals, reordering other dates, notes and visit ordering remain available. Native lodging movement and Trash/restore retain the same arrival identity. A trashed arrival does not freeze the active calendar; restoration resolves the original stay date through the coordinated command.

## Additive database change

Canonical migration: `supabase/migrations/20261114110052_native_stay_calendar_consistency.sql`. Exact review copies, including both test sources, are under the website's `docs/family-integration/supported-core-readiness/backend136/`. Canonical is now 136 migrations/317 migration-and-test sources; all original 314 source files and its mixed index remain exact.

The migration adds two private trigger functions, a BEFORE day-date/delete serialization trigger and a DEFERRABLE INITIALLY DEFERRED constraint trigger on day updates/deletes. It uses the existing Trip recovery advisory lock and parent Trip row lock. Final-state validation permits legitimate coordinated intermediate updates while refusing committed active ownership/date inconsistencies. Preflight rejects existing inconsistent data and never silently rewrites it. The normal non-superuser `postgres` owns both functions with empty search paths; PUBLIC, anon, authenticated and service_role have no EXECUTE. All 612 prior routine definitions, owners and grants remain exact. No new public RPC, table, column, client grant or index.

## Native adapter behavior

The assignment, calendar and visit-editor seams now recognize explicit `family_visit.owning_stay_id`. Cross-day move, generic removal, day clear and appointment conversion on an owned arrival refuse with an actionable lodging-editor message. Independent visits, notes and ordering remain supported. The calendar refuses changes that would shift an owned date, and rechecks retained intents before sending. Restore/order-Undo with an archived position absent from the current native view refuses conservatively; it does not guess or allocate another arrival. The database remains authoritative if another writer races or the native view is stale.

This changes integration seams only. All 12 protected upstream 5.1.4 layouts remain byte exact. No candidate installation, feature permission, transformation fallback, dependency, source-adoption pin or normal-runtime flag changed.

## Qualification and explicit limits

- 24 new real-database integrity cases pass: the demonstrated failures, safe calendar actions, final-state versus temporary changes, concurrent native save, parent-lock serialization, same-ID recovery, privilege checks and migration preflight rollback.
- 44 inherited native SQL cases and 98 existing command/outcome/coherent-read cases pass.
- 1,245 client regressions pass in 43 files, including 38 new guard/adapter cases. Prepared calendar retry is checked at the actual adapter boundary before backend access.
- Typecheck, zero-added five-file scoped lint, 99 source guards, seven existing quality gates, 23 isolation refusals and the default build/secret/syntax checks pass. The three existing 5.1.2 source-adoption release holds remain; no baseline was expanded.
- All 324,419 original rows across 240 COPY projections are preserved with multiplicity, including 98 original visits with NULL ownership. All prior 101 evidence seals/7,404 members, the old clean 5.1.2 checkout, source pins and unscoped website sources remain exact.

The SQL/API tests use synthetic signed local identities and socket-only PostgREST. The client tests exercise adapters and existing React fixtures, not a generated App browser/device. GoTrue, browser storage, combined control installation and zero catalog transformation attempts with decoded variants remain browser acceptance requirements. Independent full database-plus-files recovery remains unproved. This checkpoint does not qualify production readiness or finish C5.

## Retained local fixtures

New accepted derivative: `/private/tmp/trek-u05b2b3c5-controls-20261114/rehearsal`, schema 136, guarded by its `target.py`. The newest exact stop receipt is `/private/tmp/trek-u05b2b3c5-controls-20261114/owned-fixture-stop.json`. Requalify exact IDs/images/nonce, disabled network/cron, guarded readiness and unrelated service states before any restart.

Old schema-135 fixture `/private/tmp/trek-u05b2b3c5-native-20261114/rehearsal` is retained as a **reproduction source, not an accepted candidate**, because its two synthetic audit Trips retain the demonstrated inconsistencies. Its stop receipt is `/private/tmp/trek-u05b2b3c5-controls-20261114/audit-source-stop.json`. Do not restart it as the latest qualified target or reuse an older stop receipt. Both owned database/HTTP pairs are stopped; volumes remain intact. No relay was launched in this repair packet.

## Exact next within the same C5 milestone

1. Add combined **loopback-only** installation for the existing qualified creation/lifecycle candidates with current Direct schedule and, for creation, reservations permission, source/disposal fences and the existing owned complete refresher. Use schema 136. No hosted/default activation or pin weakening.
2. Run the generated App on desktop and phone with actual browser storage: first/repeated Add, edit/move, midnight/unknown zone, independent/shared arrivals, keep-stop, confirmation-gated Trash, another browser's confirmed discovery, same-ID restore, unavailable sources, logout/permission retirement and lost-reply/cold completion. Verify native/cache/ancillary publication. Block transformations before network and prove zero catalog attempts with decoded stored variants.
3. Keep normal controls gated until those combined flows qualify. Preview publication and hosted schema activation remain separate release steps.

Evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/evidence/u05b2b3c5-native-stay-calendar-repair-2026-11-14`. Website work is a scoped local commit; canonical sources/docs/evidence remain outside its unchanged mixed index. No hosted SQL/settings/billing, production/preview/main/push/publication, original backup/media/ignored ETL, backfill/sync or image-transformation changes.

Continue [the same C5 client packet](trek-5.1.4-native-stay-client-packet.md), remaining sections 3–4.
