# U04-F5c — Collection contract and local baseline audit

14 November2026. Website parent7b54d19a2 on `codex/trek-v5.1.4-family-reconcile`. **This completes the design/audit prerequisite and a narrow native-removal safety gate, not the database recovery implementation or transfer feature.** Canonical schema is still136 migrations/317 SQL-test sources. No pending migration or new database routine was installed. Native item removal is now held at the Family adapter boundary.

## Audited facts and proof

A new network-isolated cold copy of the previously accepted schema136 fixture was created with its source volume read-only and all earlier services kept cold/unchanged. One owned Postgres17.11 process, no published ports, read-only root/non-root/cap-drop configuration, cron/pg_net disabled. No Auth/REST/browser server or hosted API/SQL call. Local frozen-copy counts are three lists/one item, **not a current production inventory**.

The audit captured37 list/item columns,17 indexes, all constraints, four RLS policies,12 list predicates/RPC signatures/grants and existing table privileges. Existing exact-one-target and kind/target checks are present and preserved. The eight typed target FKs cascade deletion. `remove_list_item` physically deletes. There is no manual kind, normalized location child or observed operation/version/history lifecycle for these items. The native query/envelope mismatch remains a future consumer task.

Nine actual rollback-only PostgreSQL demonstrations confirm: missing session is refused by the existing current-session checker but accepted by the older list edit predicate; an authenticated-role legacy Add/remove can proceed in that simulated claims context; removal erases the row/note; catalog/root deletion cascades into items; a repeat add gives unique_violation rather than an original-operation outcome; manual kind is unrepresentable; existing kind/target and exactly-one-target checks correctly reject invalid sources. These are **demonstrated gaps plus positive existing constraints**, not nine passing cases of future APIs. Claim simulation is not new signed-token/GoTrue qualification.

Every one of the **362,455** baseline rows survives by complete COPY-row SHA256 multiset/multiplicity over242 projections; no additional synthetic row remains. Audited Collection schema metadata/counts are exact after rollback. The owned process is stopped, its two new volumes retained and all113 prior service Running/StartedAt/FinishedAt states remain exact. This cold-copy rehearsal is not independent backup/Storage recovery proof.

## Immediate containment

Rollback proved that the old native item DELETE still called physical `remove_list_item`. The Family adapter now refuses single-item DELETE and bulk delete-many with422 `collection_recovery_unavailable` before item lookup or a writer call. The physical-remove branch is removed. The four earlier transfer POST refusals remain. Root DELETE still uses Archive, which retains its data; ordinary reads/status retain their existing paths. This is **native adapter containment, not a database authorization fix**: direct legacy RPCs remain unchanged until C1.

The new native regressions first reproduce nine failures, then verify clear Axios/fetch errors, no provider/writer fallback, retry/role refusal, native optimistic single/bulk store row/selection restoration and the retained Archive path. They replace the old boundary test that had explicitly expected physical item removal. No native layout/style is edited and no new Restore control is claimed. Fresh affected unit/type/lint/build results accompany the final receipt; these are not new browser/Auth/Storage proof.

## Decided contract

[Versioned normalization/recovery contract](collection-normalization-v1-contract.md): preserve `lists`/`list_items`; add recoverable root/item lifecycle, private committed-state history/media holds and owned original-operation outcomes first. Preserve Archive separately. Harden session/MFA/membership/owner/reviewer rules and predicate OIDs. Represent materialized location content in one scoped child, with parent-owned name/notes/status/order and existing typed source FKs. Add a genuine manual enum in a committed boundary before its child migration. Snapshots preserve content independently from catalog/Trip changes; no raw request JSON live model, name/coordinate identity guessing, note/description duplication or implicit city fallback.

Copy-back only saves a normalized pool location, creating zero visits. Repeated visits remain independent. Identical existing destinations have an explicit outcome; conflicting content, trashed sources or unrepresentable price/media fields refuse before writing. Existing source/media identities and ready variants remain. Trip and list authority are separate; current actor/session/lifecycle/original operations bind every command. Native membership/availability/error/queue handling and a reachable Restore flow must pass before controls are enabled. No advanced sharing/Tours or source-adoption pin is enabled.

## Immediate next

Execute [U04-F5c1 recoverable Collection foundation](collection-recovery-foundation-packet.md), using a **new** disposable target. It specifies permitted sources, exact lifecycle/context/outcome APIs, unchanged identities/notes, parent/history/media/receipt storage, current-session/RLS/ACL/OID constraints, legacy compatibility boundaries and24 mandatory regression groups. Do not repeat the finished format/inventory packet or count gap demonstrations as implementation tests. Then implement manual/location content, observed membership/save/copy and native acceptance in that order.

Website changes are documentation plus the Family handler removal gate and its existing regression file. All other application/runtime/native files, source-adoption pins, dependencies, canonical SQL sources/mixed index, old checkouts and115 prior seals/8,257 members must remain exact. Fresh artifacts are the local audit, rollback demonstrations, row preservation and source/archive checks; earlier unit/browser proof is inherited. No production/preview/main/push/publication, hosted schema/settings/billing, original backup/media/ETL or transformation changes. The existing three qualified-source/native/history adoption holds remain.

Sanitized evidence: canonical modernization `evidence/u04f5c-collection-contract-2026-11-14`. Raw dumps/rows/credentials/private probe SQL are excluded. Final local commit and check-only archive identity are in the sealed acceptance receipt.
