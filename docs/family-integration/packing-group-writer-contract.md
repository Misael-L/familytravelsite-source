# U04-C1b — strict packing group SDK and retained recovery

This packet qualifies the adapter/queue boundary for three already-implemented database commands: category packed-state, category Trash and whole-view clear-completed. It changes no database schema and does not enable the native group-control gate. The local database remains at migration120; read `packing-group-database-contract.md` for its independently qualified transaction/authorization rules.

## Original intent and response validation

`packingGroupContract.ts` defines strict, separate command/acknowledgement/receipt schemas with `kind=packing-group`. The complete request is a version1 envelope with source URL, opening planner layer, command and `original_items`. The command retains the original published packing scope, parent lifecycle, operation UUID, expected collection revision, raw category/view/status selector and ascending unique `{id,revision,checked}` observations. The original full rows are retained to validate no-ops and preserve unrelated item facts; they are **not** extra database RPC arguments.

Native display names must never replace raw category labels. An empty label and a real label that collides with the translated default may be selected together. Clear-completed observes every item in its chosen common/personal view with status all, including unchecked items. Bounds use PostgreSQL-style UTF-8 JSONB separator sizing and Unicode code-point counts. Unknown fields, null bytes in labels, unsafe versions, duplicate/unsorted IDs, foreign Trips, status/view/label mismatches and incomplete observations refuse before execution.

`packingGroupTransport.ts` sends one dedicated RPC through the current authenticated SDK adapter in `family-backend/.../packingGroupRpc.ts`. It sends the exact original operation/scope/selector/collection/observation/value arguments. The existing six item command types, item RPC allowlist and item receipt shapes remain intact.

Before accepting an acknowledgement, compare its kind, action, operation, Trip, entire scope, raw selector, values, complete original ordered item set, exact changed-ID subset, advancing opaque changed versions, unchanged versions and collection behavior. Every unchanged row must be identical. Changed rows may change only the commanded packed state or Trash attribution/timestamp, revision and update timestamp. All other item fields and relationships must match the original. One common server Trash timestamp and current Person attribution are required. A false/missing/extra/cross-kind result never removes retained work.

Group receipt inspection checks current Auth/Person/Family/Trip and parent lifecycle. Unknown remains unresolved. Visible historical results must pass the original acknowledgement matcher. A currently authorized, correctly scoped redacted commitment can acknowledge only its original operation without fetching/replaying hidden rows. The current lifecycle may be newer than the historical original: receipt proof after parent recovery is valid, while replaying that old lifecycle remains a database refusal. Receipts/acknowledgements are historical proof, never current UI state.

## Queue ownership and recovery

Groups use `/trips/{uuid}/family/packing/group-commands`, separate from item commands. `packingIntentQueue.ts` admits exactly either checked protocol, retains the original full envelope and blocks competing work for the Trip. No temporary native identity, optimistic item cache, reconstructed current set or replacement operation is allocated. Full original queue metadata is pinned across network waits before acknowledgement/removal. Changed rows, future metadata, recovery holds and unsupported protocol versions remain intact/exportable.

`PackingGroupCommandSession` clones its original at creation, owns the original source/actor/Trip/layer session, coalesces concurrent submits and uses the existing exclusive queue lease. Transport errors preserve the original; current refusals park it without rewriting intent. Explicit retries reuse the same operation and set. The generic background mutation queue deliberately **does not replay group commands**; it leaves them intact and blocks later Trip work. This prevents a generic retry policy from deciding a group recovery action after context changes.

The existing cold `createPlannerPackingRecovery` now recognizes either supported packing envelope. It does not need or publish a planner snapshot. It inspects receipts first; unknown sends nothing until an explicit owned retry. Current authority is rechecked by the actual receipt/execute APIs. Redacted/visible commitment never replays; stale or revoked contexts cannot consume the original. UI visibility/source/layer/identity and exact retained row are checked again after every wait. Unsupported held work retains the established export-only behavior; this packet does not grant generic metadata cleanup or logout-replay authority.

## Canonical publication and native boundary

`PlannerCohortPacking.bindGroup` captures the complete canonical/rendered selection when the action opens, including one operation/intent. It rejects missing, duplicated or borrowed native rows before retaining anything. Each origin is one logical action, with coalesced submission and no permission for a second operation after completion. It shares the existing guarded item publication path and exclusive lease.

After checked proof removes exactly its retained row, obtain a fresh canonical full packing snapshot and required roster; publish item and ancillary projections together into the packing port and native Trip store. Never publish acknowledgement rows or persist an optimistic packing database. Release the exclusive lease **before** guarded planner revalidation. An ancillary refresh failure cannot turn an already acknowledged/canonically read save back into an unresolved mutation or restore permissions.

The group binding is an integration-class API in this packet. Native desktop/phone consumers still use their existing group gate; it remains closed for the Family cohort. U04-C1c must expose the supported binding on the port per action, then replace supported native loops with one command while preserving native markup. Global category rename/assignee operations, bags, sharing/contributors/clone, imports/templates and whole-group Restore remain unqualified.

## Evidence and operating limits

Validation includes protocol/handler/queue/cold-recovery/publication regressions, actual local SDK/password/TOTP/PostgREST with genuine post-commit response loss and persisted reopen, real redaction and parent lifecycle proofs, current MFA refusal and parallel exact retries. The independent76-case database suite remains the server contract. The full client regression retains all previously passing and pending assertions, with exact frozen runtime/unit inputs. Source/native/history/carryover and existing quality gates must pass without expanding baselines. The handoff records actual process exits/counts and build/source identities.

There is no fresh browser/UI group acceptance in C1b. That belongs to C1c with actual App/generated-worker desktop/phone consumers, hosted destinations and `/render/image/` blocked. The current build/SDK tests are not a claim that native group controls are enabled or deployed.

All work is local. No main merge/push, production/preview deployment, hosted SQL/settings/billing/dependency changes, media transformations/backfill, original backup/media or ignored ETL operation. Independent off-device restoration and incremental backup remain separate.

SDK reference checked for this packet: [Supabase JavaScript RPC](https://supabase.com/docs/reference/javascript/rpc). Installed dependency pins are unchanged; no CLI/SDK upgrade was attempted.
