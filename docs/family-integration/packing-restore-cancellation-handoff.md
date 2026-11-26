# U04-D2c1b — accepted local terminal cancellation foundation

12 November2026. Qualified only on the new guarded **local127** project `family-modernization-20261112-d2c1b`, API55931/database55932, PostgreSQL17.11 image `17.11.0.003`, CLI2.109.1. No hosted SQL or release. Existing126 and earlier targets/guards remain intact. Qualified web application remains `90c22c2ec4978a668c292ab6206acfbda59ae4e9`; this packet changes database source, tests and documentation, not web runtime or native gates.

## Meaning and exact API

Cancellation reserves the original packing operation UUID permanently in its existing `(trip_id, actor_user_id, operation_id)` namespace. It changes no packing content or collection revision. A matching prior commit wins; otherwise cancellation and its coarse audit event commit atomically. A late original, including another packing executor domain reusing that UUID, cannot commit: shared receipt insertion refuses and the complete transaction rolls back. Existing committed receipt bodies and old unknown/committed-only APIs remain unchanged.

Both new public invoker RPCs accept the same four named arguments: `p_trip_id uuid`, `p_operation_id uuid`, `p_protocol text`, `p_original_args jsonb`. Use POST for both PostgREST RPCs, including the read-only lookup, because their clock-sensitive authorization requires VOLATILE declarations:

- `cancel_family_trip_packing_restore_v1`: write terminal cancellation, or return the matching existing committed/cancelled proof. It never returns unknown after a successful call.
- `get_family_trip_packing_restore_cancellation_v1`: read-only lookup; unknown is possible and remains unresolved. Its SQL volatility is VOLATILE because authorization checks real clock/session state; it performs no content write.

Supported originals only:

- `packing-item-v1` / `restore`: exact eight keys of `execute_family_trip_packing_v1`: trip, operation, scope, action, target, expected row revision, expected collection revision **JSON null**, values **{}**.
- `packing-category-aggregate-v3` / `category-restore-batch`: exact eight keys of the aggregate v3 RPC, including expected collection revision, original complete `p_observed` category/items/batch and values **{}**.
- `packing-bag-v1` / `bag-restore`: exact nine keys of bag v1, including original expected row and collection revisions, complete `p_observed` bag/member IDs and values **{}**.

Use the exact named keys in [the migration](packing-restore-cancellation/source/20261112132958_terminal_trip_packing_restore_cancellation.sql). No added checksum field, dropped null, regenerated observation or changed restore action. Scope has exactly `version`, `trip_id`, `family_id`, `user_id`, `person_id`, `layer`, `trip_lifecycle_revision`; layer is published. UUIDs are canonical lowercase text. Counters are safe integers through9007199254740991; row revision starts at1, collection/lifecycle at0. Integer-valued JSON numbers normalize appropriately for typed scalar SQL arguments. Whole original-argument objects are bounded to128KiB(item),1MiB(bag),8MiB(batch), and scope to4096bytes. Existing aggregate member bound remains2000.

Result is exactly: `version:1`, `kind:packing-restore-terminal`, `trip_id`, `operation_id`, `protocol`, `action`, `target_id`, **current** `scope`, `request_sha256`(64 lowercase hex), `status`, `cancelled_at`, `result_redacted`, `result`.

- Unknown: null timestamp/result, false redaction. It is not a terminal acknowledgment.
- Cancelled: original immutable timestamp, null result, false redaction. Exact retry returns the same proof within the same current scope.
- Committed: null cancellation timestamp; original result if currently visible, otherwise null plus true redaction. A wrapped result above8MiB also returns redacted proof. This does not grant replay or visibility.

The server derives its request digest from the exact original typed SQL argument array, with the existing protocol prefixes for batch/bag. It differs from the client retention-row checksum. Do not compare those different encodings or allow a browser checksum to become database authority. Historical lifecycle is allowed only when all other original identity fields match and original lifecycle is no greater than current lifecycle; it never authorizes a replacement write. Root Trash still refuses access. Proof scope may change after legitimate root recovery while the stored cancellation identity/timestamp/digest remain immutable.

## Integrity, authorization and history

Migration `20261112132958_terminal_trip_packing_restore_cancellation.sql` adds one private RLS-enabled immutable relation, nine functions and identity/exclusion triggers. The PK provides Trip/actor/operation lookup; actor-user and actor-Person indexes support restrictive FKs. Target IDs are historical identities, without cascading content deletion. Trip, Auth user and Person FKs use RESTRICT; Person unlink/family reassignment and Trip family reassignment preserve history. No direct public/anon/authenticated/service_role table access. Public wrappers are invokers; narrowly authorized private entries are definers with empty search_path. Existing544 function bodies, owners, grants and configurations stay exact.

Current Auth account, real session (when session_id exists), Family membership, Person mapping, active Trip, reviewer AAL and direct `trip.packing.manage` authority are required. Authorization is rechecked after the exact existing advisory Trip/root/collection locks. Another actor cannot cancel or inspect this actor's original. The same shared lock arbitrates receipt/cancellation insertion, including no-op writers. No user_metadata authorization. Audit events are coarse: protocol/action/digest, without private target IDs or names; client-settable skip-audit flags cannot suppress them.

Cancellation history has a10,000-record cap per actor per Trip. Exact terminal retries and reads work at the cap; another actor has its own cap. This changes no existing receipt or packing-content limits. Empty cancellation history permits the explicit inverse; any retained terminal cancellation blocks downgrade atomically (`0A000`) so an old operation cannot be reactivated. Routine authenticated clients cannot purge history.

Important SQLSTATEs: `22023` malformed/extraneous/unsupported inputs; `54000` request or cancellation-history limit; `PT409` conflicting original/context or cancelled operation execution; `42501` missing current authorization/assurance; restrictive integrity errors remain `23503`/`23514`. Do not turn a network failure, malformed result or unknown lookup into success.

## Actual qualification and limits

- **412 distinct real database cases pass:** the410-case regression suite (372 inherited plus38 cancellation), followed by40 final cancellation cases including two additional Person-identity races. The final40 run against the corrected identity lock and coarse-audit source. Real Supabase Auth/TOTP/PostgREST, two PostgreSQL sessions in both transaction orders for all three restore domains, lost-reply retry, all seven executor domains, no-op rollback, private-result redaction, root recovery/races, expired session, revoked membership/permissions, exact original/digest tampering, safe counters, history cap and restrictive identities are exercised.
- Full127 clean migration chain from empty application schemas; frozen populated126 upgrade with all185 original table digests and544 old function contracts exact; injected late failure; explicit empty-history inverse/replay; terminal-history downgrade refusal. Known inherited dump ACL representations/old CHECK parentheses are separately compared by effective-grant and constraint-equivalence proofs.
- The additional race witness showed an authorized Person unlink could commit while cancellation was pending; the final insertion guard retains that Person row FOR SHARE through commit. Both unlink/cancel transaction orders are now exercised.

- Ten strict127 target/source/ledger/security refusal probes pass. Pinned CLI lint/advisors exit0 with no growth:17 inherited lint groups and376 advisor groups remain. They are not a zero-warning baseline.
- Retained120/122/123/124/125/126 guards and rows,126 migration sources, previous evidence seals and canonical mixed index are unchanged. Original cloned rows remain exact after new synthetic fixtures. Streaming canonical row hashes avoid large combined JSON aggregates; an earlier development integrity query caused a local backend restart, recovered and followed by the preservation proofs.
- Web runtime remains the already qualified application pin. No new browser/build/client-suite qualification is claimed for this database-only packet. Existing image variants, native layout protection and frontend gates remain requirements.

The reproducible canonical runner is `FamilyTravelApp/supabase/tests/rehearse_packing_restore_cancellations.py`; it refuses any target except marked local127. Review copies here are versioned evidence, not an alternate schema owner. The canonical mixed index must not be staged. Private dumps, Auth tokens, fixture data and credentials are excluded from sealed evidence.

Next is [D2c1c typed SDK terminal settlement](packing-terminal-settlement-packet.md). Native desktop/phone bag controls and their App/browser qualification follow that packet. Cancellation is not yet connected to the client retention queue.
