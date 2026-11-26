# Q27d1 — native creation terminal API contract

Server prerequisite for [explicit client resolution](core-planner-terminal-resolution-packet.md). Canonical migration: `20261116114653_native_plan_terminal_cancellation.sql`, local schema149. Website application/build qualification remains `b320e88094ecef942cd736dfa6aaa0b4368f62a4`; this document does not enable a client control, alter a source/profile fence or authorize hosted activation.

## Identity and storage

Creation, receipt inspection and cancellation take the same original arguments: `p_trip_id uuid`, `p_operation_id uuid`, `p_scope jsonb` and `p_form jsonb`. Scope retains its existing version1 Trip/Family/user/person/layer fields. The complete original form and one operation UUID must remain immutable. Request-session tokens and credentials are not arguments and are never stored. Current authorization is derived from the authenticated request and current database membership, person, Trip assurance, session and shape-specific direct/stage permissions.

The digest is the existing `sha256(convert_to(jsonb_build_array('native_plan_create',p_scope,p_form)::text,'UTF8'))`. It binds domain, original scope and form; the operation UUID belongs to the composite actor/Trip namespace. Other receipt domains cannot consume the same cancelled tuple or be mistaken for this original.

`family_auth.native_plan_cancellations` stores only Trip UUID, actor-user UUID, operation UUID,32-byte digest and finite server cancellation timestamp. Its primary key is `(trip_id,actor_user_id,operation_id)`; an actor index supports its restricted user foreign key. Trip and Auth-user foreign keys use the same `ON DELETE RESTRICT` lifecycle as existing root receipts. There is no redundant Family/person/session/form/media copy and no independent expiry or purge. History is bounded at10000 facts per actor/Trip; reaching the limit refuses a new cancellation and retains the original. Existing outcomes remain readable and idempotently replayable at the bound.

The table is private, owned by postgres, with enabled/forced RLS, zero policies and no public/anon/authenticated/service-role table grants. Cancellation facts are append-only. Native creation-shaped root receipts receive a matching append-only guard; the existing native-stay-specific guard remains intact. Reciprocal receipt/cancellation exclusion triggers protect their shared tuple namespace, including ordinary location writers. The trigger namespace lock is acquired after existing writer locks and deliberately does not take an inverse Trip lock.

## Version2 read-only outcome

`public.get_family_native_plan_receipt_v2(...)` is a STABLE SECURITY INVOKER wrapper over a private checked definer. It performs no save, cancellation, row lock or acknowledgement and is valid in a READ ONLY transaction for all three states. Only authenticated has execute permission; its private implementation validates current authority before examining unknown, committed or cancelled facts.

The exact JSON object has nine fields:

- `version`: integer2.
- `trip_id`, `operation_id`: UUID strings for this original.
- `scope`, `form`: the exact logical original JSON values echoed by the authenticated server.
- `request_sha256`: lowercase64-character server digest.
- `status`: `unknown`, `committed` or `cancelled`.
- `cancelled_at`: server timestamptz string only for cancelled; otherwise null.
- `result`: original creation acknowledgement, with current private-draft status, only for committed; otherwise null.

The scope/form input retains the existing180000-byte bound. The entire response is bounded at1MiB. A known fact's stored digest must match the requested original; differing content or domain under the same tuple is PT409. Contradictory receipt/cancellation facts are an integrity error, never success.

The existing public v1 reader keeps its six-field version1 `unknown | committed` shape. For a cancelled original it returns PT409 instead of falsely reporting successful creation or returning an unfamiliar state. Its private implementation delegates to the checked outcome helper. Existing non-cancelled results and current draft projections remain compatible.

## Cancellation command

`public.cancel_family_native_plan_v1(...)` is a VOLATILE SECURITY INVOKER wrapper over a private checked definer, authenticated-only. It returns the version2 outcome above. It must be invoked as a command, never as a read-only Check or implicit cleanup.

Lock/transaction order is current-context precheck, the existing Trip-recovery advisory lock, Trip row `FOR NO KEY UPDATE`, current Auth session `FOR SHARE`, and renewed original-context/authority checks. Under that boundary, a committed receipt returns committed without modifying the saved location/visit/draft. An existing matching cancellation returns its unchanged timestamp. Otherwise a cancellation fact is inserted and returned. A transaction that cannot complete leaves neither a partial fact nor an acknowledged original.

The native creation coordinator checks cancellation under the same Trip boundary before creating any child or root receipt. Cancel-first makes a delayed original permanently refuse; create-first makes cancellation report committed. Both cannot win. Ordinary root-receipt writers also refuse the cancelled tuple and roll back any provisional child. Existing locks, current-session checks and real serialization/deadlock behavior are retained; no catch-all error rewrite or retry-setting change.

PT409 is a semantic conflict or closed original;42501 is current authority refusal. Invalid common shape/bounds remain22023; integrity and history-limit failures do not authorize local removal. Timeout, lost response, missing API, malformed output or unknown state is never proof of cancellation.

## Client verification and archival prerequisite

The future client obtains the expected original digest through a source-bound authenticated v2 read, comparing the echoed form, scope, Trip and operation with the captured original. It can freeze that authoritative digest with its durable explicit cancellation decision before dispatch. Every subsequent cancellation/read proof must match that digest and the same complete original. Do not recreate PostgreSQL jsonb hashing in JavaScript: forms contain floating-point coordinates, Unicode and nullable values; an integer-only serializer from another protocol is unsuitable.

A read is always unarmed. A deliberate cancellation decision must be durable before its write. Cold recovery of an armed decision retries cancellation, not creation; another current producer/tab must check that decision before sending the old original. On committed state, validate/acknowledge the saved result. On cancelled state, atomically archive the complete original and terminal proof in its source/account-owned local database, then remove only the exact observed queue row. Retain originals on archive failure, quota/corruption or ownership changes.

The server stores only the terminal fact, not a backup of the browser's unsent form. The local archive/export/logout integration is therefore mandatory before exposing a cancellation control or allowing a corrected replacement. A corrected form is a deliberate new operation from current canonical observations; it never mutates or rebases the old original. The current website remains without that control until the next client packet passes its native browser matrix.

## Scope and evidence

[Prerequisite handoff](core-native-plan-cancellation-handoff.md) records the accepted tests and preservation results. The architectural lock and function-security behavior follows [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html) and [CREATE FUNCTION semantics](https://www.postgresql.org/docs/17/sql-createfunction.html). No hosted/preview/production/main/push/settings/billing/backup/media/ignored ETL/transformation change is part of this prerequisite.
