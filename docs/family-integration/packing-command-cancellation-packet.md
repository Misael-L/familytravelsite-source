# U04-D2c1b — terminal cancellation for retained packing restores

This is the next bounded handoff after [D2c1 local SDK acceptance](packing-bag-dependency-handoff.md). Its implementation is accepted only on guarded local127; read [the exact qualified contract](packing-restore-cancellation-handoff.md). The proposal below remains the design review record. Keep current126 and all old targets/guards intact. Native bag controls remain gated. Continue the same isolated reconcile checkout and canonical `FamilyTravelApp/supabase` sources; no hosted migration or deployment.

## Observed need and chosen approach

The real126 dependency SDK test proves: an unknown receipt can be followed by a later successful execution of the identical original. A read-then-delete/export sequence, browser AbortController, queue lock or account logout cannot revoke that server operation. Browser locks coordinate cooperative tabs only. Restoring a bag also makes an original category-batch collection observation stale. Safe replacement requires a terminal server decision for that original operation.

Use an immutable cancellation record in the existing `(trip_id, actor_user_id, operation_id)` packing namespace, and arbitrate cancellation against execution under the same transaction lock. Preserve existing committed receipts/results; do not rewrite them into a second meaning. Cancellation changes no packing row, category, bag, ACL or Trip content and does not imply that a replacement is authorized.

Prefer a private cancellation relation over adding nullable outcome variants to every existing strict committed-receipt/result contract. One extra narrow relation and new typed endpoint avoid breaking older readers. A shared receipt-insert guard can make all existing executor domains respect the reserved cancelled UUID transactionally, without duplicating a client check or reimplementing each writer. This choice must pass the actual concurrency proof below; if a real executor bypasses shared receipt insertion, add the minimum explicit entry guard for that path, with its own source/compatibility proof. Do not assume a trigger alone covers an uninspected path.

## Exact source inspection and schema proposal

Inspect the latest canonical definitions of item/group/category/category-item/category-aggregate/bag executors and `family_auth.packing_command_receipts`, including earlier replacements. Current evidence includes:

- Item request digest uses `sha256(convert_to(jsonb_build_array(p_scope,p_action,p_target,p_expected_revision,p_expected_collection_revision,p_values)::text,'UTF8'))`.
- Aggregate v3 prefixes its exact argument array with `packing-category-aggregate-v3`; bag v1 prefixes with `packing-bag-v1`. Use server-side normalization identical to each executor. D2c1's client queue hashes use a different lossless framing and are **not** server request digests.
- Executors acquire transaction advisory lock `hashtextextended('trip-recovery:'||p_trip::text,0)`, then the Trip root/packing state in the established order. Reuse that exact order; do not introduce a session lock or invert collection/root locks.
- Committed receipt keys/FKs are restrictive and history is immutable. Private tables have RLS and revoked public/anon/authenticated/service_role table grants. Public invoker wrappers delegate to narrowly authorized private entry functions. Preserve that convention.

Proposed `family_auth.packing_command_cancellations`:

- `trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE RESTRICT`.
- `actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT`.
- `actor_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT`.
- `operation_id uuid NOT NULL`; primary key `(trip_id, actor_user_id, operation_id)`.
- `protocol text NOT NULL` restricted initially to `packing-item-v1`, `packing-category-aggregate-v3`, `packing-bag-v1`.
- `action text NOT NULL` restricted by protocol respectively to `restore`, `category-restore-batch`, `bag-restore`; `target_id uuid NOT NULL`.
- `original_trip_lifecycle_revision bigint NOT NULL`,0..9007199254740991; exact scope identity must match the original/current actor and Trip. A historical lifecycle may be cancelled, never used as new write authority.
- `request_sha256 bytea NOT NULL CHECK(octet_length(request_sha256)=32)`; exact server original digest.
- `cancelled_at timestamptz NOT NULL DEFAULT clock_timestamp()`.

No full request/history blob needs to be duplicated in the cancellation row. The original remains in protected client retention/export; the digest binds the terminal decision. Add actor-user and actor-Person indexes for FK/history operations; the PK already supports Trip-local lookup. Add RLS, least-privilege revocations, append-only guards and identity-preservation hooks consistent with existing receipt history. A record must not outlive its identity relationship ambiguously or disappear through an unrelated delete/cascade. Inspect/reuse existing history quotas and define a bounded anti-spam limit before implementation; do not invent an unbounded per-operation history store.

## Proposed APIs and atomic rules

Use separate new public invoker wrappers, proposed `cancel_family_trip_packing_restore_v1(p_trip_id uuid,p_operation_id uuid,p_protocol text,p_original_args jsonb)` and `get_family_trip_packing_restore_cancellation_v1` with the same arguments, delegating to private entries. Validate exact protocol-specific original RPC argument keys/types/nulls/actions, source scope identity and body bounds. Inputs contain the original canonical SQL arguments, not a client digest or a regenerated command. Supported restore domains are the three above; other actions refuse. Observe existing item128KiB, bag1MiB and aggregate8MiB request bounds and safe counters. Final signatures/result schemas must be recorded against actual SQL tests before SDK work.

Cancellation requires current active account, Family membership, Person mapping, Trip access, reviewer assurance and direct packing authority, including current Trip lifecycle/authorization checks. Identity comes from Auth and relational membership, never user_metadata. Another actor cannot cancel/read this actor's operation. A cancelled decision does not grant item visibility or allow reading another person's private historical result.

After validation, acquire the exact Trip advisory/root/collection lock order used by execution and revalidate authorization. Under that lock:

1. If a matching committed receipt already exists, return terminal `committed` proof (redacted when required), not `cancelled`; preserve the existing receipt exactly. A changed domain/digest must conflict.
2. If the exact cancellation already exists, return its original terminal `cancelled` proof. A changed digest/domain/target must conflict.
3. Otherwise persist the immutable cancellation and its audit event atomically. No packing collection revision or content changes merely for cancellation. Return terminal `cancelled` proof, binding current authenticated scope, original actor/Trip/operation/domain/digest and cancellation timestamp.

Read-only cancellation lookup may additionally return `unknown`; unknown remains unresolved. Keep old receipt responses strictly unchanged: an old reader may still see unknown for a cancelled operation and retain it, but an old executor must never commit it. Do not retrofit a new status into old strict parsers.

Add a BEFORE INSERT guard on the shared committed-receipt relation (and an equivalent exclusion on cancellation insertion) so both terminal outcomes cannot exist for the same namespace key. Acquire/verify the shared lock discipline rather than relying on an unlocked NOT EXISTS. A cancelled UUID must cause every old/new packing executor domain using that key to fail atomically, including changed-domain reuse. Since packing changes, audits and receipt insertion occur in one database transaction, a final refusal must roll back every intermediate write. Prove that no exception handler, alternate receipt path, no-op or trigger swallows that refusal. Keep all original function/result bodies exact unless an inspected gap requires the smallest explicit change.

These locking/rollback principles follow [PostgreSQL advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS), [transaction atomicity](https://www.postgresql.org/docs/current/tutorial-transactions.html) and [Supabase function privileges](https://supabase.com/docs/guides/database/functions#function-privileges). The concrete protocol and chosen relation are this project's proposed design, not a claim that the documentation prescribes its business model.

## Bounded execution and preservation

First implement/rehearse only this database/read foundation on a **new guarded127 disposable target**: new project ID, workdir, ports and volume, unlinked marker, production-fingerprint refusal, pinned existing CLI2.109.1/PG17.11 image. Discover free ports and available migration name with the pinned CLI help. Freeze current126 source/rows/guards/evidence and the canonical mixed index. Create the additive migration through the CLI; do not alter any of the126 accepted migration files or repoint an old guard. Restore a frozen populated126 baseline into the new target and prove all old rows/receipt bytes and function contracts. No dependency/image upgrade, billing/settings, production/preview, backup or ETL work.

Meaningful acceptance must include both transaction orders of cancel versus execute; exact cancellation retry after network loss; late old executor and changed-domain reuse after cancellation; preexisting committed/redacted proof; wrong actor/Person/Family/Trip/lifecycle; lower assurance and revoked permission; forged digest/extra keys/body bounds; ordinary and no-op executor paths; root Trash/restore races; whole-table rollback snapshots, not only a returned error; restrictive identity/deletion behavior; cancellation history quota; clean install/populated126 upgrade/injected failure; advisors and prior diagnostic comparison; downgrade refusal once terminal cancellations exist. An inverse must not reactivate cancelled operations. SDK-side queue locks or mocked promises do not substitute for two real Postgres sessions contending in both orders.

Do not apply migrations to hosted Supabase. Produce the exact qualified127 SQL/API contract, strict target/source guard, sanitized sealed evidence and a scoped local source/metadata record. Canonical mixed Git index remains untouched. If the proposed shared receipt trigger is insufficient, record its failing witness and qualify the minimum server fix; never weaken retention or falsely acknowledge an unknown request.

Then prepare D2c1c SDK/cancellation/replacement: a separate explicit user decision obtains typed terminal cancellation proof; only committed/cancelled proof can settle the exact retained row under its original context/queue lock. An exported original remains losslessly available; a new command needs a fresh observation, explicit user decision and new operation UUID after terminal settlement. No silent rebase/reconstructed manifest. Pair-parent cancellation must not drop its child. Test loss/restart/logout/old tabs and actual adapters. Only afterwards issue D2c2 native desktop/phone bag cutover and App/browser qualification. Native controls remain gated until that entire recovery path works.
