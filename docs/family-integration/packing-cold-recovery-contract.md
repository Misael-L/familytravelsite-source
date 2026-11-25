# Packing recovery before planner startup

U04-B's first prerequisite, on the existing TREK 5.1.2 reconciliation line. The overall native packing authoring cutover remains pending. The existing migration119 observed-command APIs suffice; no schema change or dependency update is required.

A retained packing save deliberately prevents a complete planner read. Recovery must therefore work before there is a native Trip or a published packing observation. `plannerCommandRecovery.ts` routes the existing owned read-problem surface to packing or task recovery without publishing substitute data. Existing task wording and behavior are retained; supported packing originals receive packing-specific check/retry labels.

## Admission and original ownership

Capture the original private write/read epoch, repository/identity registry, actor, source endpoint, UUID/native Trip binding, itinerary-layer epoch and current read-problem owner. Inspection is local and performs no command/receipt RPC. Only one affecting, current-schema, original-policy POST with a strict envelope, matching operation/URL/native Trip and current actor/source/layer is retryable. Pending, failed and conflict originals are supported; syncing, unknown fields, future schemas, recovery holds, conflicting/multiple originals and malformed context stay preserved/exportable. No newest revision, replacement operation or guessed source attribution is introduced.

The original complete queued row is pinned. Every asynchronous boundary rechecks its owner and current actor, and rereads the affecting queue before proceeding. A changed source/layer/actor/private epoch/identity registry/read problem/surface retires its callbacks. Unknown work cannot be cleared by optimistic state or an empty fallback.

## Check, retry and acknowledgement

Use the existing exclusive cross-tab queue lease. The pure receipt RPC checks current database membership, MFA, direct packing authority and visibility before reporting commitment. Unknown means unresolved: Check does not execute or acknowledge it. Explicit Retry may submit only the original envelope, UUID, target, expected revisions, scope and idempotency header through the existing actual packing handler.

Validate visible historical acknowledgements against the original command. A validated committed **redacted** receipt confirms the operation without replaying it or disclosing its hidden item. Response loss preserves the same row and operation. Known command refusal parks it with the original body intact; a future retry requires a fresh inspection of that parked observation. No conflict is automatically rebased.

Acknowledgement and known-refusal parking compare the complete expected queued row inside the same database transaction as their effect. Unknown metadata/recovery holds cannot be removed by the warm path either. A missing or changed row during cold recovery refuses acknowledgement. Other Trip work is left intact.

After confirmation, acknowledge only that original; the existing owned recovery UI then requests a fresh, guarded full canonical Trip read. Neither the receipt nor the command response becomes native packing state. A failed fresh read remains a normal owned read problem. No snapshot is fabricated to bypass retained work.

## Acceptance and limits

The new tests exercise actual IndexedDB persistence/reopen, the actual command handler/queue, and the real planner read-problem screen. Separate real SDK/Auth/password/TOTP/PostgREST/PostgreSQL tests cover unknown/explicit retry, committed response loss and cold reopen, real RLS-redacted commitment, actual AAL1 refusal and stale-edit conflict. Real desktop/phone browser builds deliberately lose a response after an actual SQL commit, reload and confirm a single operation through the receipt before fresh canonical publication. Private peer items remain absent and all `/render/image/` requests are blocked/absent.

These browser creates use deliberately inserted retained originals in fresh synthetic local fixtures. They qualify recovery, **not native packing form authoring**. No physical iOS/Safari, hosted activation, production migration/deploy, disaster recovery or independent backup is claimed.

Continue U04-B steps2–7 in `native-packing-controls-cutover-packet.md`: original-observation slice/forms/create/checkbox/count/reorder/Trash connections, publication/subscription ordering, ancillary totals, separate unsupported-group safeguards and direct permissions. Keep `packing_edit` unavailable until their actual desktop/phone consumers and retry/queue behavior are qualified together. Preserve all twelve native presentation files, current image variants and prior database/source/evidence protections.
