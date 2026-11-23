# U04-F3b — authentic baseline reconciliation and backend upgrade rehearsal

**Execution update,12 November2026:** historical reconciliation and all40 replays are complete on isolated authentic-data copies;208 SQL test executions pass. Final acceptance is blocked by source ACL drift. Read [real-backup-upgrade-handoff.md](real-backup-upgrade-handoff.md). The specification below records the executed packet; F3b2 ACL repair precedes U05.

Immediate next after [F3a baseline acceptance](real-backup-baseline-handoff.md). The database archive has genuinely restored and its 200 COPY projections/292,994 rows match; forty pending migrations remain unapplied. TREK source remains qualified 5.1.2. Finish this backend prerequisite before U05 controlled 5.1.4 reconciliation; final F3c application acceptance follows source/connector repairs.

## Immutable inputs and permitted scope

Read F3a, the original F3 plan, F2 hosted comparison/local 128 contract/migration hashes and F2a upstream ordering. Private live guard/state and original-row commitments are in `/private/tmp/trek-u04f3-backup-rehearsal-20261112`. Canonical evidence holds sanitized receipts/code. Original snapshot is 8 November00:40–00:41UTC, SHA256 `e5ab863101bca800b2d7b97c44ecfdaf504868afc910ab48c6e528e2c333a011`. Preserve it and its existing COMPLETE/journal/checkpoints/media bytes. Do not refresh the downloader, alter the old fixture guards or stage the canonical mixed schema/iOS index.

The accepted source 88 baseline is the new network-none PostgreSQL 17.6 container/database/volume bound in F3a. Its original rows and ledger are now a comparison reference, not a migration target. Create **another explicitly named/guarded local copy** for candidate mutations; deny every earlier target, including this baseline. Reuse the proven restore procedure with its transactional local event-owner reconciliation and exact role/owner/RLS verification. No generic localhost allowance, source/target substitution, linked project, public port, outbound service or source-user sign-in. No hosted DDL/data/ledger/settings/billing, push/main/deploy, paid environment, media transformation, external messages or ETL work.

Keep raw source data and raw SQL/error logs private. Resolve the interpreter/CLI/image versions from actual recorded inputs. Existing CLI2.109.1 was not used to manage this restore. The engine choice is explicit: restored/source 17.6 versus qualified synthetic 17.11 differ in confirmed timezone cases. Do not silently run a third/latest image or upgrade production; compare intended deployment behavior and record what was actually tested.

## 1. Resolve the historical base without rewriting it

Both restored versions 20260713595900 and 20260714000000 contain the same nine ownership statements, not the canonical invite migration assigned to the latter filename. Preserve their exact arrays privately, normalized-match method and SHA commitments. Inspected invite effects already exist, so neither replaying the old file nor renaming/repairing history is justified by the label alone.

Compare the actual baseline schema/functions/owners/ACLs/policies/indexes and relevant grants against a clean canonical 88 reference or authoritative source-bound contracts. Account for later migrations that intentionally supersede July definitions. Inspect all 88 statement records as needed; version equality is not a checksum. Verify email-first access requests and current membership/role/assurance helpers through non-sensitive metadata and fresh synthetic identities. Do not execute the pending chain until real prerequisite differences are reconciled. If a repair is needed, specify a minimal explicit canonical corrective/preparation operation with its tests, sequencing and release provenance; never silently edit qualified migration files, fabricate ledger status or reintroduce weaker old Auth/RLS logic.

## 2. Authentic-data preflight

Read the unchanged forty canonical files named by F2 and verify their 128-source hash inventory. Record all preconditions before DDL. In particular:

- Visit bridge: refuse simultaneous food/experience sources, missing same-Family creator/advocate attribution, references to deleted source locations or crossed Trip identity. Preserve geography versus typed venue identity and stable saved-location/visit links.
- Booking dates: preserve existing day associations and their explicit civil dates; do not derive unknown dates from timestamps or reinterpret genuine midnight. Existing legacy timing stays deliberately classified; preserve source facts and repeated visits.
- Packing: inventory blank/oversized labels, invalid quantities/weights, crossed bags/Trips/Families, missing private-category owners, negative ranks and aggregates over the migration's limits. Category IDs/links, retention and owner-lane rank backfills are real data changes, not cosmetic schema work. A rejected precondition requires a diagnosed, reviewable repair that preserves the source facts.
- Snapshot original identities/counts, relationships/order, data digests, media IDs/variants, audit/history, cleanup/export jobs and all relevant trigger/RLS states. Source `realtime.messages` has one already-NOT-VALID constraint; do not count it as a new upgrade defect or fix it merely to clear a blanket assertion.

Use private detailed findings and sanitized aggregate counts. Do not remove records, infer user intent from empty/midnight values or replace the dataset with a demo fixture to make a preflight pass.

## 3. Exact staged replay on the candidate copy

Apply each file unchanged with its own BEGIN/COMMIT, lock/statement timeouts and normal stop-on-error behavior. Record exact hash, actual SQLSTATE/exit, duration and resulting ledger progression. Later migrations require specific preimages and ledger counts; use a reviewed transaction-aware per-version ledger writer, not a concatenated forty-file blob or blind `migration repair`. If the file's internal COMMIT precedes separate ledger recording, document/test the failure window and resumption behavior rather than claiming those are atomic.

The visit/booking/packing migrations temporarily disable named triggers and add constraints/indexes. Confirm trigger restoration, constraint validity, ordering and intended conversions after each relevant stage. Stop on a genuine mismatch; preserve failed-step diagnostics privately and resume only from a known reference or deliberately recreated candidate. A rollback of a Worker is not a database rollback.

The pending SQL changes cleanup revalidation/holds/enqueue behavior and Storage access policies, though it adds no launch of a cleanup worker. Retain network isolation and prevent old jobs/services from running. Do not execute job queues or remove Storage bytes. Test the appropriate worker race/revalidation contract on new synthetic objects only. Raw task/packing DML and old template/default RPCs lose access; verify the intended website writers and required older-writer transition rather than assuming unchanged grants.

## 4. Qualified behavior and preservation

Prove API signatures, JSON/null/omission contracts, roles/RLS/grants, current membership, direct/propose/deny, stranger/cross-Family and AAL1/AAL2 behavior with fresh synthetic roots. Database tests using simulated JWT claims must be labelled as such. If true Auth/PostgREST/SDK proof is needed, attach only explicitly configured local services to the new candidate on an isolated network: disable real providers/email, schedulers, cleanup and any hosted fallback. Never use restored real refresh tokens, reset source users or modify their rows to create fixtures.

Cover untimed versus midnight visits, repeated restaurant visits versus retried operations, calendar/day moves, booking date/time inheritance, task/packing create/edit/complete/reorder/Trash/restore, stale revisions, exact original operation replay, audit/history and private-file retention. Reuse existing qualified regression bodies through an explicitly reviewed new-target guard, retaining their real assertions. Do not change old guards to accept production Family fingerprints or treat synthetic-only tests as authentic-data migration acceptance.

Compare every original baseline row/relationship/media/audit commitment after the upgrade, documenting each expected conversion rather than demanding byte equality for deliberately normalized columns. All unrelated original rows remain exact. Preserve stable source catalog and media identities and ready image variants. Original baseline container, source archive, earlier targets/evidence, canonical sources/index and website runtime remain untouched unless separately scoped.

Finish with the candidate's exact ledger/function/schema/row commitments, all preflight/repair/replay exits, failure/resumption proof, engine/platform limitations and test identity inventory. Seal only sanitized evidence. If all backend prerequisites qualify, advance the handoff to U05 pinned 5.1.4 reconciliation. No main merge, hosted migration or preview release is implied. Full files/off-device recovery and incremental backups remain separate; F3b cannot make the 8 November snapshot current.
