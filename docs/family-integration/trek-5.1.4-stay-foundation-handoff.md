# U05-B2b1 — local planned-stay and read foundation

13 November 2026. **The schema/read foundation is locally qualified; native stay editing and confirmed timing remain gated.** Canonical migration 130 is `20261113032434_trip_stay_read_foundation.sql`. The website branch remains `codex/trek-v5.1.4-family-reconcile`, with unchanged frontend runtime from the previous editor repair. Neither hosted Supabase nor the preview/production site was changed.

## Implemented contract

`trip_stays` separates planned lodging from provider bookings. It stores finite independent arrival/departure dates, nullable local check-in/window/check-out clocks, an optional validated named zone, private notes, saved lodging identity, revision and retained Trash state. Same-day stays, actual midnight, overnight windows, repeated visits, unbooked stays and dates outside the calendar remain explicit. A catalog city/food/experience cannot stand in for a lodging identity.

`trip_stay_booking_links` is optional 1:1, with same-Trip restrictive FKs and no hotel/date deduplication. A booking with a known catalog hotel must match the saved lodging's hotel; it cannot claim an unverifiable manual location. Link creation and updates to either end enforce that identity. A booking's geographic place_id is not confused with its hotel_id. Link changes advance the stay revision; unlinking does not delete content. Active stays retain their lodging location, and physical stay purge is refused.

The nullable booking columns `timing_kind` and `time_zone` preserve the existing starts_at/ends_at as authoritative instants. **No original booking row is updated or classified.** Existing new-column values remain NULL/unclassified; this deliberately tightens the design's optional classification rule. Only new supported nontransport rows without instants default to untimed; other new legacy cases stay unclassified. Explicit timed inserts require valid finite instants and a named zone. Old text edits retain precision; old classified-clock/zone edits are refused pending a qualified writer. No midnight/UTC inference or metadata backfill occurs.

`get_family_trip_stay_view_v1(uuid)` and `get_family_stay_editor_v1(uuid,uuid)` return bounded original user/Family/person/Trip/revision/stay/location/link/booking observations. The complete view is limited to 2000 active stays / 8 MiB and the editor to 256 KiB; excessive output is an error, never truncation. Off-calendar stays retain their dates and have null exact-day associations. Both explicitly return commands=false.

New stay APIs and RLS additionally verify a matching, current Auth session. Missing/malformed/foreign/expired/revoked claims cannot reuse a still-signed token. Existing Family membership, AAL, person and active Trip/location rules remain enforced. Authenticated gets SELECT and the two read RPCs, no direct writes. PUBLIC/anon/service_role receive no new access; private helpers are not client APIs except the policy Boolean. Fixed empty search paths and schema-qualified names are retained. Historical access helpers were not globally rewritten.

## Fresh evidence after the usage interruption

- **33 SQL/signed-HTTP cases passed, zero failures/errors/skips.** Real PostgREST signature validation and RLS were exercised over an isolated Unix socket. Users/session/factor metadata are synthetic; GoTrue enrollment, real browser behavior and Storage services were not tested here.
- **23 unsafe database/HTTP bindings refused.** Both new databases and the API remain network-none with zero published ports, exact pinned images/volumes/nonces, read-only roots and inactive cron/pg_net. Only this packet's three retained containers were restarted; no older stack was reconfigured.
- The unchanged migration replayed transactionally on the retained second source 129 derivative after reconstructing its exact baseline DDL and pinned original export definition. All 10 applied function bodies match the source on both targets. Earlier fresh-restore temporary logs were lost; this fresh replay is not mislabeled as a newly completed backup restore. Both local ledgers now contain the exact130 source; all 129 historical entries remain intact.
- **324,417 baseline rows across237 complete COPY projections remain present, with multiplicity and zero missing/changed rows.** This includes historical ledger arrays and original booking fields. The reference is the retained original empty-stay replay derivative; raw values and individual digests remain private. Additional rows belong to synthetic tests. Three deliberately invalid pre-repair synthetic associations were removed after the regression run.
- New-object catalog checks pass for RLS, exact table/function grants, search paths and 12 indexes; actual point-read EXPLAIN uses an index. This is an isolated pg_catalog audit, not a hosted Supabase advisor run. Known engine/time-zone R5 and DST-conversion writer proof remain separate.

Actual tests cover hotel/city identity, repeated/off-calendar/unbooked stays, date/midnight/window/UTF-8 byte/output bounds, microseconds, old-write refusals, missing/foreign/unauthorized reads, current sessions, one-stay concurrent claims, Trip recovery and Family export. Original native 12 layouts/runtime/source pins remain unchanged. Canonical source/index, old branch and 84 previous sealed evidence sets are checked separately; preinterruption temporary hash receipts are not invented as fresh proof. Application tests/build/browser results are inherited only from unchanged runtime bytes.

Parent Trip Trash freezes/hides the retained stay graph and actual Trip restore returns it unchanged. Individual stay Trash/restore in these tests uses privileged fixture DML, not new public commands. Family export explicitly includes stays/links under the existing active-Trip scope; trashed Trips retain its earlier exclusion. Restrictive FKs and guards refuse premature purge. No files or media are copied/deleted, and independent/off-device database-plus-files recovery and incremental backups remain separate work.

## Continuation and release boundary

Next is **B2b2 observed stay commands and retained history**; then B2b3 native/live/saved/shared cutover. Create/edit/link/Trash/restore need original observations, safe retries, concurrency and Direct permissions before controls can activate. Named-zone booking timing is separately bounded; transport endpoints keep their own contract.

Full 5.1.4 source and prior Family work remain preserved. Accepted source metadata stays 5.1.2 pending F4/F5/U05-C/F3c real service/browser/source/engine/release acceptance. No hosted SQL/settings/billing, live-site/main/push/publication, transformation/backfill, original backup/media or ETL change occurred.

Canonical sources: `/Users/Misael/Desktop/FamilyTravelApp/supabase`; exact private website review: `docs/family-integration/supported-core-readiness/backend130`. Private regenerated stage: `/private/tmp/trek-u05b2b1-resume-20261113`. Durable allowlisted evidence: canonical `evidence/u05b2b1-stay-foundation-2026-11-13`; SQL dumps, private bindings, keys and fixture inputs are excluded.

[Next command packet](trek-5.1.4-stay-command-packet.md).
