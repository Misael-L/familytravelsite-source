# C5b2b2 — exact retained Collection preparation cancellation

This additive protocol repairs the request-retained/never-prepared gap. Baseline: local schema142 and website5e6e00bb03a5f740051b104e958008e4dd4d6ede. It changes no native layouts and does not activate ordinary Collection handlers. Rehearse only against a fresh owned offline fixture. Hosted schema, billing, preview, production, backups, media bytes and transformation settings are outside this packet.

## Durable facts and identity

A preparation request is exactly `{scope, operation_id, intent:{action,body}, observation}`. Scope and observation have their existing exact V1 field sets and bounds. Validate structure, safe revisions, canonical UUIDs/digests, nullable notes, normalized location details and supported action bodies before accepting cancellation. Recovery does not fetch a new source, observation, item identity or UUID. A missing/deleted/changed source must not prevent cancelling an old request. An explicit nullable reference-name clear is valid.

Private `family_auth.collection_request_cancellations` stores actor/op primary key; Collection/Family composite FK; historical session and nullable person; exact original scope; SHA256 request digest; action; timestamp. Actor, parent and person references use DELETE RESTRICT. Index parent/Family and nonnull person/Family foreign keys. No auth.sessions FK: terminal receipts must survive logout/session cleanup. The request hash uses the identical PostgreSQL JSONB text representation of `{action,body,observation}` used by C4 preparation. Scope and operation are bound separately and compared exactly; JSON text key order is immaterial. Uncommitted notes/content are not persisted in this table.

The table is append-only, cannot be truncated, has RLS enabled, no client/service direct grants and no permissive policy. Retention follows existing immutable operation receipts; no ad hoc purge is added. The migration adds two private helpers and two public SECURITY INVOKER wrappers, with empty search paths and explicit execution grants. The validator is immutable and inaccessible to application roles. The checked entry is SECURITY DEFINER, executable by authenticated only; wrappers are authenticated only. No service-role/browser authority is added.

## Transaction and permission rules

Every new operation uses the SAME transaction advisory lock `collection-operation:<auth.uid>:<operation_id>` as existing preparation, content execution/cancellation and lifecycle operations. Acquire that lock before the parent lock; pin/recheck current database session, Family/person membership, MFA/assurance and existing recovery-item permission after waiting. A historical session ID identifies intent; it grants no current authority. The current source/account/Family/person/Collection must match the original scope, excluding only session and lifecycle revision. Do not authorize from user_metadata. Archived/deleted parents retain the existing stricter administrator/owner recovery rules.

If an existing authoring command has this actor/op, require the same request digest and full original scope/parent. Discovery returns its actual prepared or terminal result. Cancellation invokes the existing exact-original cancellation under the same lock. If execution committed first, return committed. Never replace its target item or fabricate an original.

If no command exists, discovery returns unknown. Cancellation inserts the immutable exact-request fence and returns cancelled/unprepared. An exact retry returns that receipt. Changed request, historical scope, parent or actor-context reuse conflicts. Old preparation/execute/cancel writers reject the fenced UUID before registration or content mutation, including delayed requests. Lifecycle commands also reject that namespace collision. The old V1 content outcome remains honestly unknown for a same-parent never-prepared fence; it does not gain a fake V1 item receipt. All historical C4/C1 APIs keep their response shape and strict decoders.

## Exact V2 API

`get_family_collection_preparation_outcome_v2(p_preparation jsonb)` discovers. `cancel_family_collection_preparation_v2(p_preparation jsonb)` cancels or reports the actual winning commit. Neither accepts a replacement current scope or ignores request-body differences.

Every response has exactly `version:2, operation_id, collection_id, action, status, resolution, result`.

- Unknown: `status:unknown, resolution:none, result:null`.
- Cancelled before preparation: `status:cancelled, resolution:unprepared, result:null`.
- Prepared command: `resolution:prepared`, status prepared/committed/cancelled and its corresponding exact existing V1 receipt in result. Nested operation/status must agree. Only discovery returns prepared; cancellation must be terminal.

A never-prepared response contains no target item ID, original or invented revision. Database validation is authoritative; transport additionally binds response op/parent/action and known originals. SQL22023 denotes malformed input,42501 current authorization refusal,PT409 immutable identity/namespace conflict. Network/deadline failures remain unknown locally, never successful cancellation.

## Device settlement

The retained format3 envelope is unchanged. Cancel persists its one-way decision BEFORE the request. Both discovery and cancellation use the exact retained preparation through the new V2 APIs. New sessions may cancel/discover, never execute an old-session original. Prepared and committed results preserve existing V1 checks. Only after a terminal database result, a fresh canonical read and successful synchronous publication may its exact CAS queue row be acknowledged. Read/device/publication failure or account/source/generation change leaves it retained. Lost cancellation replies recover from the database fence after restart without preparing or downloading media.

## Qualification and next boundary

Prove never-sent preparation after fresh login, both prepare/cancel and execute/cancel lock winners, revoked/expired/MFA/private/other-Family denial, exact retries, changed body/observation/scope/parent conflicts, lifecycle collisions, archived/deleted parent recovery and session-row cleanup. Preserve original142 ledger arrays,362,462 source rows,670 unchanged routine definitions and all672 original owner/ACL pairs; review only the two fenced definitions plus four new routines/table. Logical restore does not preserve original internal OIDs; in-place replacements must preserve their restored IDs/owners/ACLs.

Run retained Collection authorization/content/read suites before fresh SDK synthetic accounts. Do not overlap revocation tests and SDK test accounts. Test strict V2 response refusal, local quota/ownership/CAS/lifetime behavior, lost cancellation response and fresh-read/publication failure. Complete current typechecks, ordinary build and source/presentation/publication guards. Record scoped local catalog/grant checks; do not claim hosted advisor or production deployment validation.

After this repair: finish C5b2b recovery paging/history/lifetime qualification, then C5b2c coordinated native reads, both membership consumers, forms/status/order/removal/Restore and final desktop/phone/PWA acceptance. Ordinary activation and inherited qualified-source/native-pin/history-pin release holds remain closed. Independent database-plus-Storage disaster recovery remains unproved.
