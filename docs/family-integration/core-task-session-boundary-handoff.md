# Q23a task current-session boundary — local acceptance

16 November 2026. The local task-session prerequisite is repaired and tested on a new isolated schema144→145 copy. This is database/API acceptance, not a deployed website change or admission of the prepared HTTPS writer profile. [Release checklist](core-release-prerequisites.md); [completed repair contract](core-release-task-session-repair-packet.md); [next HTTPS writer contract](core-release-https-writer-source-packet.md).

## Change and unchanged protocol

Canonical migration `20261116053245_task_current_session_boundary.sql` lives only in `/Users/Misael/Desktop/FamilyTravelApp/supabase/migrations`; its SHA256 is `fdd74b3ca624cfd3ea93c6b97dd4e6c44080b8d6658edd444ca1483dcee3e470`. The single additive migration introduces two private task helpers, adds one restrictive authenticated todo_items SELECT policy and inserts session guards into the four existing task list/Trash/receipt/execute functions. No new business table or index is needed.

The helper validates the current request's user/session UUID against auth.sessions, rejects absent/deleted/malformed/foreign-user/expired rows, and checks not_after with wall-clock time. Its empty search_path, qualified relations, explicit postgres owner and restricted execution protect private Auth rows. Only the boolean read gate is executable by authenticated; the assertion is private. The first local draft exposed an operator-versus-function-owner mismatch; the corrected final file was rolled back/rehearsed from schema144 and tested with normal active requests. No authenticated grant was added to the private assertion to hide that failure.

Commands retain their existing Trip advisory lock and Trip row lock, then acquire a shared lock on the current Auth session before authority/receipt handling. Expiry is checked after waiting and before returning either replayed or newly saved results. A failed check rolls back all changes. Existing Family membership, assurance, direct/propose/deny rules, Trash visibility and revoked table-write grants remain enforced.

Task IDs, API arguments/return shapes, scope, revision rules, original request digest and receipt identity are unchanged. The original session ID is deliberately absent from retained commands. A currently authorized user's new sign-in can recover the exact old command after losing a reply or signing out; a retired session cannot read or replay it.

## Measured proof

Before the upgrade, ten desired denials were reproduced as missing: actual Auth logout and synthetic session-row expiry each still allowed four task APIs and direct RLS reads. Those schema144 HTTP200 results remain recorded as failures, not acceptance.

After the final upgrade, all **69 cases pass**:

- 12 new session cases use real local GoTrue password/TOTP and PostgREST/RLS for active controls, actual logout, signed-but-row-expired sessions, exact original recovery on a new sign-in, direct table visibility and actual Auth-issued JWT expiry. Missing/malformed/foreign-user claim variants are separate SQL authorization tests, not fabricated signed HTTP tokens.
- 57 unchanged canonical task case methods are reused through guarded fixture/auth/transport seams. They cover current/propose/deny permissions, another actor's private receipt, revisions, repeat intent, lost replies, pagination, date-only facts, completion, ordering, Trash/restore, parent recovery, bounds and competing transactions. One initial adapter run incorrectly ignored the requested anon/service SQL role; the final adapter selects the actual requested role, and all57 cases pass without changing the old tests or weakening assertions.
- Explicit concurrent SQL session deletion proves both command-before-logout and logout-before-command outcomes. Session expiry while waiting for a lock, expiry after a later task-row wait and a bounded lock timeout all leave no partial task/receipt/order/audit effects. These controlled SQL races are distinguished from the actual Auth logout HTTP tests.

PostgREST's documented30-second JWT clock allowance matters: the first test at exp+1 was inside that allowance; the final real-verifier test waits beyond exp+32 and receives401/PGRST303 from every task API. This fixture alone uses short-lived actual Auth tokens; no production token setting changed. [Upstream authentication contract](https://github.com/PostgREST/postgrest/blob/main/docs/references/auth.rst).

Reachability review found exactly four authenticated task entry points, no public task-reading views or authenticated wrapper of the private snapshot/service export builder. The private snapshot and service-only builder remain inaccessible to authenticated/anon callers. The new RLS session InitPlan actually executes once on a nonempty read. This does not claim unrelated historical APIs enforce live sessions.

All362464 original rows/256 COPY projections and all144 historical ledger statement arrays are preserved, with exactly one new reviewed ledger entry. Of676 existing routines,672 are byte/owner/ACL exact; the other four differ only by the reviewed guard insertions, with signatures/owners/grants intact. Existing indexes, constraints, policies, triggers, table/column grants, schema/default ACLs remain exact; one restrictive read policy and two private helpers are added.

The installed CLI advisor was attempted with an explicit local Unix-socket URI and could not connect to Docker's private socket from the Mac. No hosted fallback or new port exposure was used; no CLI-advisor pass is claimed. Actual SQL catalog/grants/definer/search-path/reachability tests plus real Auth/RLS tests provide the bounded checks above. Re-run platform advisors on the actual intended target during its separately authorized preflight.

## Apply, rollback and next

The migration was created through the installed Supabase CLI, rehearsed with a transactional DDL rollback, then applied only to the new owned fixture.355 old canonical inputs and the mixed canonical index stay exact. The two new canonical source files remain local additions; do not stage the mixed canonical repository wholesale. Website changes for this packet are documentation only: native layouts, qualified source metadata, backend carryover, public configuration and current application build remain exact.

For a future target: first verify current protection, the exact deployed ledger/definitions/permissions and the intended role; rehearse the actual delta on a new isolated copy. Apply the reviewed file once under that release's approved migration process, then repeat active, logout/expiry and original recovery smoke tests. Stop if any check fails. This packet authorizes no hosted migration.

A website rollback does not undo SQL. The private rehearsal rollback restores exact baseline four definitions before dropping the new policy/helpers and removes only this owned test ledger entry; it is a development reset, not an approved hosted downgrade. On a hosted fault, keep writer admission disabled, preserve existing task/receipt data and prefer a reviewed forward correction. Do not remove the session gate to make an old caller succeed or rewrite historical ledger records.

**Next: resume Q23 HTTPS writer-source acceptance on schema145.** Review the sealed11-file prepared proposal against current source, retain its original-command/session separation, prove configuration/admission/other-family refusals, build the exact reviewed source and test actual desktop/phone originals, retries and retirement. It remains unadopted and unqualified until those checks pass. Do not reopen completed source reconciliation or infer hosted/preview readiness from this local database proof.

Production, integration preview, main, remote pushes, hosted SQL/settings/billing, dependencies, transformations and original backup/media/ignored ETL are unchanged. Independent current backup/restore, release quality debt and target-specific preview/source binding remain separate release gates. Pre-production unused-code cleanup stays deferred; dormant ZoomTracker remains unmounted/unexported.
