# U04-F5c1 — recoverable Collection foundation implementation

**Completed locally: see [the acceptance handoff](collection-recovery-foundation-handoff.md).** Prerequisite: the accepted contract/audit in `collection-normalization-v1-contract.md` and `collection-contract-audit-handoff.md`. This packet ran on disposable local copies; hosted activation and native recovery controls remain gated. Scope is database recovery/context/original lifecycle outcomes, not manual/location snapshots or transfers. Do not redo the completed format/carryover work or the nine baseline-gap demonstrations as implementation success.

## A. Inputs and scope

Start with the current clean website integration branch and canonical136 migrations/317 SQL-test sources. Preserve the mixed canonical index exactly; do not reset, sweep-stage or commit it. Create only a new migration through the installed CLI's discovered `migration new` command, new dedicated Collection SQL tests, bounded source-review/evidence copies following prior packet conventions, and precise handoff updates. Do not edit historical migrations or the schema136 ledger arrays. Name no schema/table/column with `road`.

No change to website runtime, native layouts, dependency versions, source-adoption pins, current transfer and item-removal refusals, original backup/media/ETL, hosted SQL/settings/billing, production/preview/main/push/publication. No enum/manual kind or location-content child in this packet. A passing local migration is not authority to deploy it while old readers/writers are still active.

The current baseline source is a stopped, private owned contract-audit fixture with two retained volumes. Its exact ID/nonce/image/stop receipt is in the private audit stage. Create a **new** cold copy with source volume mounted read-only. Validate source is still cold and every prior container's Running/StartedAt/FinishedAt is unchanged. Pinned existing Postgres17.11, network none, no published ports, read-only root, non-root user, dropped capabilities, owned nonce, cron/pg_net disabled. No reuse/mutation/start of prior accepted databases. All fixture mutations target new synthetic rows/accounts.

Supabase CLI's ordinary sandbox version probe attempted its local telemetry cache and failed before returning a version. This was not a failed migration or Docker problem. Discover help/version privately through an approved invocation; do not upgrade the CLI, rewrite global HOME/config, guess flags or invent a timestamp. No CLI migration application command may select a hosted linked project. Apply candidate SQL only through the explicit owned-target guard, recording only its real new ledger entry atomically; never repair/mark historical versions as applied.

## B. Deliver the contracted storage

Implement section2.1 of the contract: root/item revision/tombstone/recovery_xid fields; root lifecycle revision; unique scoped identity keys; parent content-state table; append-only root/item versions and two concrete media-reference junctions; private immutable operation receipts. Add named checks/indexes, new-object RLS/default privilege revocation and narrowly checked public entries. No existing note, identity, catalog FK, status, sort, owner, archive or media value may be changed merely to fit the design. New default revision1/tombstoneNULL fields classify legacy state without inventing events. Baseline capture occurs only on first real change; no full-table history backfill.

Keep root Archive independent from Trash. Root Trash retains all child rows, independently trashed children, media and content. Root Restore retains the original archive state and original child tombstones. Existing eight catalog CASCADE definitions are not rewritten until the content packet; the new item DELETE/TRUNCATE guard must already make their destructive cascades roll back. Neither trusted service nor browser requests may permanently erase protected content/history. Purge is unavailable.

Reconcile these exact existing triggers, not guessed ones: `list_items_touch_list` AFTER I/U/D, `lists_set_updated_at` BEFORE UPDATE, `lists_refuse_armed_cover` BEFORE I/UPDATE cover_media_id. Root metadata revision and aggregate content revision must not double-count an item touch. New guard/version/aggregate triggers need a documented order, parent-first locking and transaction-coalesced final snapshots. A genuine no-op command issues no update; derived list activity time is not a separate root-content history event. No unchecked client-set GUC or spoofable request flag may authorize a lifecycle/history mutation.

Extend existing media-reference/armed-cleanup fencing for retained root-cover versions before claiming recoverable media. FK metadata retention alone is insufficient for object bytes. Retain the original worker protocol and safety rules. No new byte download/upload/transformation or cleanup dispatch is performed; use only synthetic metadata/owned byte fixtures if a race probe requires them.

## C. Session, RLS and compatibility contract

Implement the checked session helper and authority modes from section3. Require current Auth session/not_after, existing Family-sensitive MFA, current membership/person or explicit super-admin rule, original list visibility/owner/reviewer permissions and current lifecycle. A suspended private-list owner must not retain access just because the people row still exists. Preserve reviewer-only Family publication and do not couple list access to Trip action permissions.

Replace the three public predicates **in place**, preserving OIDs/signatures/grants. Replacing them by renamed unchecked versions can strand policy/Storage dependencies on old OIDs and is forbidden. Harden `create_family_list` directly because a new root cannot use an existing-list predicate. Preserve current service grants unless a separately enumerated change is necessary and reviewed; inventory all table/column/routine/default ACLs before/after. New history/receipts/helpers receive no blanket grants.

Retire physical `remove_list_item(uuid)` with explicit unsupported refusal, unchanged signature/return type and no DELETE. This database candidate must not go live until the native removal control has a qualified observed Trash writer **and reachable Restore**. Other legacy add/status/reorder/root metadata/cover paths are not newly qualified: current-session and parent/lifecycle/revision/history guards must cover them, and the later observed cohort must retire/restrict competing versionless writers before activation. Document that compatibility boundary rather than silently enabling or breaking it on a hosted project.

Raw SELECT RLS hides trashed root/item data and enforces current session/assurance. Checked recovery/history entries separately authorize retained data, including archived-parent rules. Old helper execution, direct table DML, private entry calls and source-parent cascade paths must not bypass these rules. No unknown private list or item becomes an empty success response.

## D. Implement exactly the nine planned public entries

Use the names, types/defaults, strict scope keys, result acknowledgements, errors and bounds in section4.1. Root/item commands support only Trash/Restore. No price/media override, create-from-Trip or copy-to-Trip command is installed here. General observed root creation/content authoring is a later contract; do not accidentally mint its identity from an operation UUID.

Original operation lock precedes authority/parent/child locks. Recheck after waits; test real role/session revocation races. Same original/context returns its historical acknowledgement; changed payload or different actor/context refuses. Current canonical state is read separately. A lookup without a receipt is unknown. A cancellation tombstone serializes against execution and cannot undo a committed command. New sessions may resolve an owned authorized outcome through lookup, not execute under an old session scope. Never expose session IDs, digests or unchecked original bodies in reads.

All final version/media/receipt writes share the mutation transaction. Inject a late failure to prove full rollback. Permanent DELETE/TRUNCATE, receipt mutation and forged server revisions refuse. Hashing must cover exact validated immutable source/context/action/target/observations; no secret values enter logs or public evidence.

## E. Mandatory regression matrix

Use actual PostgreSQL roles/functions/RLS and actual GoTrue/PostgREST sessions before claiming those layers; distinguish logical claims tests from real token authentication. These cases must be individually named and their expected result recorded:

1. Preserve a real legacy item/name/notes/status/source/order on upgrade; no artificial baseline versions before mutation.
2. Current private owner reads; another member cannot read/edit that private root or its item/history.
3. Family-visible active member item authority remains; root metadata/archive still needs owner/reviewer.
4. AAL1 member versus role-required AAL2 follows existing policy; expired/not_after/missing/deleted sessions refuse reads and writes.
5. Suspended membership/archived person refuses even for a private-list owner; explicit global-admin behavior is audited without inventing a person ID.
6. Root Trash/Restore preserves children and previous Archive state; an independently trashed child remains trashed.
7. Item Trash hides its active projection but keeps source/name/notes/status/order; authorized Restore preserves identity and content.
8. Child mutation while root trashed/archived refuses; recovery lookup works only under its explicit current authority.
9. Same-original lost reply/retry mutates once; fresh deliberate no-op has no revision/history bump; stale observation still refuses.
10. Another operation with old root/item/content revision refuses; replacing original action/target/Family/session/person/value scope refuses.
11. Operation UUID reuse across another list/Family/actor cannot alias an existing receipt or row.
12. Fresh-session owned outcome lookup resolves without leaking original session/digest; executing old-session context refuses.
13. Unknown operation remains unknown; cancel-before-execute blocks later application; cancel-after-commit returns committed outcome and does not undo it.
14. Parallel identical original has one effect/receipt; parallel conflicting new operations have one winner; cancellation/execution race has one serialized outcome.
15. Membership/policy/session revoked while a command waits on parent or child lock is refused before a write; no stable-snapshot loophole.
16. Root and child revision/history coalesce within a transaction, retain full baseline text and exclude intermediate half-states; derived activity touch does not double-bump root metadata.
17. Late version/media/receipt failure rolls back every change, including content revision; no ghost acknowledgement.
18. Direct DELETE/TRUNCATE on root/item/history refuses, including service paths; deleting any referenced catalog type cannot cascade away kept notes.
19. Existing scoped target/kind and eight uniqueness checks remain valid; non-location country/airport/airline/guide records remain intact.
20. Old `remove_list_item` refuses; legacy status/add/reorder cannot mutate a trashed/archived parent or bypass current-session/revision/history guards.
21. No PUBLIC/anon execution/direct writes/private ledger reads; original documented service grants preserved; policy/Storage function OIDs still call the hardened predicates.
22. Trash/history pages reject NULL/out-of-range limits, partial/nonfinite cursors, foreign IDs and unknown scope keys; deterministic complete pages, genuine authorized empty state and explicit overflow behavior.
23. Historical root covers and metadata IDs stay referenced; already armed byte deletion prevents a new hold/reference; cleanup cannot erase bytes retained by a committed version.
24. Full-row multiset preservation and exact original136 ledger arrays; every pre-existing routine/policy/grant outside the explicit allowlist is unchanged.

This matrix is a minimum of behavioral groups, not a fixed test-count target or permission to mark missing cases passed. Add concrete boundary variants where the implementation exposes them. Retain every existing protection regression. No mocked canEdit return or fake passing status substitutes for actual authorization/concurrency proof.

## F. Finish criteria and following packet

Before declaring C1 complete: exact CLI-created migration and test sources saved for review; new isolated upgrade passes; all matrix cases pass in their stated layer; no original row is missing/changed, all original migrations and mixed index exact, media/history holds preserved; ACL/source lints and defined API allowlist pass; only owned services stopped with retained volumes and every prior state exact; sanitized evidence sealed; canonical schema/review copies agree; local scoped commit and check-only source/archive hygiene completed. No hosted activation or frontend availability flag changes.

Then proceed to committed `manual` enum plus location-content storage/commands and media integration, then single-item native membership/save/read-back and copy-back, then bulk. Keep the existing four transfer refusals until each replacement slice is fully qualified. Atlas availability, general source adoption and operational release remain separate. Independent backup/restore and incremental capture are not silently claimed by a local cold fixture or rolled-back test.
