# U04-C1a — atomic visible packing groups: database contract

11 November 2026. This is the database prerequisite of U04-C1. The accepted TREK5.1.2 application remains at `4700baace306159598b4d390c93a3abce12e6fb3`, pinned by `ce687d1865701ef18a50b016a2e93966b5bc9f15`. No native group controls, generic replay or hosted release are enabled here.

## Audit decision

Native categories are display groups over item text labels. An empty stored label uses the translated default; an explicitly named category can have that same display label. Category assignees are currently keyed by the Trip and text label, while private/common items with that label can belong to different visible sets. Native Check all/Uncheck all/Delete category operate on the current view and status-filtered category; Clear completed operates on the entire selected view, ignoring that status filter.

It is unsafe to translate these commands into independent item RPC calls, or to rename a global label/assignee record while claiming to change only the visible category. This packet implements **group packed-state, group Trash, and clear-completed** with explicit selectors and complete observations. Category rename, category-assignee changes, bag management, sharing/contributors/clone and import/templates remain separate. Do not enable their shared legacy group gate after adding these three commands.

No new business table, duplicated category model, item column, permission capability, RLS policy or index is needed for these operations. Reuse existing packing facts, state/lifecycle versions and append-only command receipts. The existing receipt action/target constraints gain three explicit group actions. Original item actions keep their original constraints and signatures. New and old operations share the existing `(trip_id, actor_user_id, operation_id)` uniqueness domain, preventing cross-endpoint reuse from creating another mutation.

## Execute API

`execute_family_trip_packing_group_v1(p_trip_id uuid, p_operation_id uuid, p_scope jsonb, p_action text, p_expected_collection_revision bigint, p_selector jsonb, p_observed_items jsonb, p_values jsonb) → jsonb`.

All arguments are explicit. `p_scope` is the unchanged packing v1 scope: version, canonical Trip/Family/Auth-user/Person UUIDs, `layer=published`, and parent Trip lifecycle revision. A planner using myDraft still sends the published packing scope. Scope must exactly match the current database scope; unknown fields, other actors and old parent lifecycles are conflicts.

`p_selector` contains exactly:

- `view`: `common` or `personal`. Common means nonprivate items. Personal means private items currently visible to this actor, including legitimate recipients/contributors. A packing grant does not reveal a peer-private item.
- `status`: `all`, `open` or `done`, matching the native status filter.
- `categories`: an array of one or two distinct exact stored labels for category operations. Empty string is valid. Two labels accommodate the default-label/display-label collision; they are not translated display text. Build this observation from the original canonical items. Do not assume that a literal English `Other` is the empty stored label.

For `clear-completed`, categories must instead be JSON null and status must be `all`: the command names the full selected view. Other group actions require explicit category labels. Labels retain whitespace and Unicode exactly, with at most200 PostgreSQL characters each. Selector bound:4096 bytes.

`p_observed_items` is the complete original selected set, including items that may be no-ops. It contains exactly `{id, revision, checked}` per item. IDs are canonical lowercase UUID strings, unique and ascending in UUID order. Revisions are positive safe integers; checked is boolean. Maximum2000 items and262144 JSONB bytes. Missing, invented, foreign, stale or no-longer-visible members conflict without revealing hidden item identities. Expected collection revision is a nonnegative safe integer. A change to a hidden item may invalidate this existing opaque global revision; no hidden row information is returned.

Actions:

- `group-packed-state`: values are exactly `{checked: boolean}`. Set the explicit state and clear partial counts. Update only rows whose `(checked, packed_quantity)` actually differs. Already matching rows retain their revision, timestamp and audit history.
- `group-trash`: values are `{}`. Retain every selected row, relationships and identity, marking it with the same server timestamp and current Person. No placeholder-maintenance loop or physical deletion occurs.
- `clear-completed`: values are `{}`. Trash only checked rows from the complete observed view. Unchecked and partially packed rows remain untouched. The acknowledgement still accounts for all originally selected rows.

All other facts, bag/Person relationships, ranks and private rows outside the selection remain intact. Empty and unchanged groups are real no-ops: no item/revision/collection/audit rewrite, but one immutable operation receipt. Revisions remain opaque; row triggers can advance collection revision more than once for a group. A resulting row/collection version outside the safe integer protocol range aborts atomically with54000 rather than committing an acknowledgement the typed client cannot read.

## Transactions, authorization and recovery

Public RPCs are security-invoker wrappers. The fully validating implementation remains in nonexposed `family_auth`, with an empty search path. Only authenticated execution of the required entry points is granted; raw table writes, internal selection/validation helpers, anon and service-role RPC access stay unavailable. Reuse current Family membership, active Person, role-dependent assurance and **direct** `trip.packing.manage`. Proposed or unrelated task authority is insufficient. Privileged-role AAL1 is refused, including through real Auth/PostgREST; this does not invent a universal MFA requirement for roles whose existing policy permits AAL1.

Lock order matches item commands and parent recovery: Trip recovery advisory lock, Trip row, packing state, then deterministic selected item row locks. Recheck permission and parent state after waiting. Re-read selected rows after locking and compare the whole original observation before mutation. Commands use one database transaction and a set-based UPDATE. Rows, partial state, revisions, coarse private-safe audits and receipt succeed or roll back together; a later member failure cannot leave earlier members saved. Two different originals conflict; two concurrent exact retries return one result.

The SHA-256 receipt intent includes a group-specific namespace, original scope/action/collection/selector/observed set/values. Changing any retained intent conflicts. Matching retries return their original acknowledgement after current access checks, without overwriting later edits. Old-lifecycle replay is refused after parent recovery; receipt inspection can still prove a historical commit. Collection changes never cause an automatic rebase or replacement operation.

Groups share the original private append-only receipt table and its restrictive foreign keys. History bound:16MiB before+after. Snapshot and acknowledgement bounds:8MiB. Late service-limit failures roll the command back. No history purge, permanent item purge or destructive downgrade is provided. After group receipts exist, preserve them and use a reviewed forward repair rather than restoring the old receipt CHECK constraint.

## Acknowledgement and receipt APIs

Acknowledgement keys are exactly `version=1`, `kind=packing-group`, `trip_id`, `operation_id`, `scope`, `action`, `selector`, `values`, resulting `collection_revision`, `items`, and `changed_ids`. Items are every selected row after the operation, ordered by canonical UUID, using the existing complete packing-row JSON shape. Clear-completed therefore includes unchanged unchecked rows. Changed IDs are the sorted subset actually updated. Empty subsets remain empty arrays.

`get_family_trip_packing_group_receipt_v1(p_trip_id uuid,p_operation_id uuid) → jsonb` returns version/kind/Trip/operation/current scope, `status=unknown|committed`, `result_redacted`, and historical result or null. Unknown is never proof of failure. Loss of visibility of **any** original result row redacts the whole result while preserving proof of commitment. Only the original current Auth/Person binding can inspect it. Revoked permission/membership or required assurance is rechecked even for replay/receipts.

The item receipt API refuses a group operation with22023; the group receipt API similarly refuses an item operation. Each retains its original response shape. Cross-kind operation reuse conflicts in the shared receipt namespace. Acknowledgements/receipts are historical proof only; the later application writer must load canonical current state before publication.

## Implementation, proof and next work

Canonical source: `supabase/migrations/20261111201637_observed_trip_packing_groups.sql` in FamilyTravelApp. This is local migration120. All119 prior source files remain byte-exact. The upgrade changes no business rows, adds six functions, and intentionally replaces only the result-visibility and item-receipt dispatcher helpers. The later byte-for-byte source/evidence hashes are recorded in the handoff.

The rehearsal first forces a late DDL failure and proves atomic rollback; its successful upgrade compares all181 public/family_auth business-table row digests. Tests use only fresh synthetic Families/Trips on the marked API55331/DB55332, never a reset or hosted link. They retain every original item-command test and exercise actual Auth/password/TOTP/PostgREST, permission/membership/assurance refusal, privacy, exact retry, conflicts, second-row failure, complete2000-item groups, raw bypass refusal and demonstrated lock waits. The reusable runner verifies migration count/source/function identities and refuses a newer chain instead of resetting it.

Next is U04-C1b strict SDK/handler/retained queue integration. Native controls remain gated until U04-C1c qualifies the actual desktop/phone consumers. Preserve original rendered selectors/sets, source/actor/Trip/view/layer identity, immutable retries and current direct permission. Do not add optimistic item loops or publish historical acknowledgements. See the separate writer packet.

No production/preview deployment, hosted schema/settings/billing change, dependency upgrade, image transformation/backfill, original backup/media or ignored ETL operation belongs to this packet. Independent full/off-device recovery and incremental backup remain separate.

Database engineering references: [PostgreSQL explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html), [Supabase database functions and grants](https://supabase.com/docs/guides/database/functions), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). The design above is the specific Family/TREK application contract; it is not an upstream recommendation to copy TREK's storage model.
