# Q27d1 — server prerequisite for safe cancellation

Accepted locally, 16 November 2026. This completes the database/API dependency of [Q27d terminal resolution](core-planner-terminal-resolution-packet.md), following [Q27c](core-planner-assignment-handoff.md). It does not complete the client cancellation/archive workflow. The current website still has no cancellation control; refused originals stay protected.

The website application/build remains `b320e88094ecef942cd736dfa6aaa0b4368f62a4` on `codex/trek-v5.1.4-family-reconcile`. Only these website documents change. No client source, native layout, source profile, dependency or runtime artifact is changed, and no fresh client build/typecheck/browser qualification is claimed.

## Accepted database/API change

Canonical migration `20261116114653_native_plan_terminal_cancellation.sql` advances the isolated database from148 to149. SHA256: `2a850cfb4c2a6a23c4bf2429196a027b1f4d83a2b58eca8d4d280d2d139064e6`. The canonical migration and `supabase/tests/native_plan_cancellation.py` remain local uncommitted additions in the separate mixed canonical checkout; its incoming index and364 existing source inputs are preserved.

[Exact contract](core-native-plan-cancellation-contract.md) freezes the private typed cancellation fact, original actor/Trip/operation/digest identity, bounded history, owner/grants/RLS, immutable outcomes, lock order and API response. Seven new routines, one private table and four triggers are added. Two existing implementations change: native creation refuses an already cancelled original before creating children, and the v1 receipt implementation delegates to the common outcome reader while keeping its strict response shape. All680 other existing routine definitions and the properties/owners/ACL of the two modified routines remain exact. Existing catalog entries and148 historical migration arrays are preserved.

The new v2 reader is genuinely read-only for unknown, committed and cancelled states. Explicit cancellation is a separate authenticated command. Cancellation-first prevents a delayed original from ever creating its saved location/visit/draft; creation-first returns the committed result without undoing anything. Changed original content or another receipt domain is refused. Reciprocal exclusion also protects ordinary root-receipt writers and rolls back provisional child writes. The existing native-stay protocol and its filtered immutability guard remain unchanged.

Current session, MFA, membership, identity, Trip state and shape-specific direct/propose/deny authority are checked before historical outcome lookup. A terminal fact grants no access by itself. Auth-user/Trip restricted foreign keys follow existing root receipts; no independent expiry or purge is introduced. The10000-fact actor/Trip limit refuses additional cancellation while preserving exact reads/retries and originals. Server cancellation stores no raw form, media, session token or credential; client preservation is mandatory before UI activation.

## Actual validation

- Fourteen new canonical methods pass120 recorded contracts against schema149 in normal mode. These cover strict original echo and PostgreSQL digest including floating-point/Unicode values; all three read-only outcomes; idempotence; committed/private-draft handling; changed content/domain; current authority/session expiration/deletion/logout/MFA; bounds; RLS/ACL/function properties; immutability; cross-domain rollback; retention limits and concurrent duplicates.
- Two genuinely concurrent Auth/PostgREST requests are serialized in each race order. Test-only SQL holds the existing Trip advisory boundary until both real HTTP backends are waiting. Cancellation-first blocks creation and leaves no children; creation-first makes cancellation return committed. No API result is injected. A lost cancellation reply can be discovered by an ordinary read; this is server evidence, not native cold-reload/archive evidence.
- Nine unchanged canonical receipt methods pass84 records, and six unchanged semantic-conflict methods pass17. Temporary runners adapt only fixture/purpose/schema setup; their test classes remain AST-equivalent. Separate synthetic Families and sequential runs prevent permission-test interference. Total:29 methods,221 contract records, all passed.
- The final whole migration passes on two untouched schema148 copies, preserving every old ledger array/catalog entry and creating an empty cancellation table. The prototype was iterated without migration history, then its candidate was promoted only after exact catalog agreement with both full upgrades. Final contracts run against the recorded149 schema.
- Every362464 original row and302996 incoming business row survives, compared as full COPY-row hash multisets. The post-test catalog/ledger matches the accepted149 catalog. No source database is dropped and no prior accepted fixture is restarted.

The source/native/history/backend guards pass without changing their rules. All364 incoming canonical sources/index,174 prior seals/11783 members and every website byte outside the four-document allowlist are checked. Three new owned roles are stopped after validation;244 earlier service states/128 earlier volume names and11745 source-fixture files/bytes/modes remain unchanged. The new stopped149 copy is retained for a fresh clone next time.

Private stage: `/private/tmp/trek-core-plan-cancellation-source-20261116`. New stopped fixture: `/private/tmp/trek-core-plan-cancellation-fixture-20261116`, manifest `stopped-schema149-files-private.json`. Raw credentials, original forms, dumps, configs and failed attempts remain private; sanitized evidence and canonical source copies are sealed separately. Check-only corresponding-source output is unbound and is not a deployment or remote publication.

## Retained failures and limits

The first prototype test run had one incorrect test expectation: private-draft readback includes current draft metadata, so it need not equal the initial acknowledgement byte for byte. The corrected check proves the original operation, private state and graph preservation. That failed attempt is retained; the SQL did not change to accommodate it. An initial CLI invocation consumed its own non-TTY script stdin into the newly generated migration file; the guard caught it before SQL execution, the exact artifact was preserved, and only that known new content was replaced. Subsequent CLI/test calls use explicit closed stdin.

The CLI advisor could not connect through the explicitly supplied Docker-local Unix socket. No advisor pass or linked/hosted fallback is claimed. The actual database/session/API tests above passed; no server setting, dependency or retry policy was changed to obtain them.

This packet does not prove client durable cancellation decisions, competing-tab producer refusal, atomic local archival, export/logout handling, a corrected native replacement, full Q26 HTTPS composition, other writer durability, physical iOS or independent database-plus-media recovery. Existing quality and release gates remain blockers.

## Next — Q27d2 client decision and archive

Continue the [website section and acceptance matrix](core-planner-terminal-resolution-packet.md#website-packet--arm-confirm-archive-refresh) using the [frozen149 contract](core-native-plan-cancellation-contract.md), a fresh copy of the stopped fixture and a finite website allowlist. Preserve the original UUID/body/scope. Read-only Check never arms or writes. Obtain and verify the authoritative digest/echo, persist an explicit cancellation decision before dispatch, and make every producer refuse replay of an armed original. Recover armed work by cancellation/outcome inspection, never creation.

Only verified cancelled evidence permits one atomic local transaction to archive the complete original and remove its exact observed queue row. Committed evidence acknowledges the saved object. Failures, quota/corruption, changed ownership, missing APIs or unknown outcomes keep originals. Integrate archives with retained-work export/logout and prove desktop/phone cold reload, lost replies, competing tabs, permission/session changes and deliberate new corrected intent before enabling controls. Do not implement a JavaScript approximation of PostgreSQL jsonb hashing, silently rebase an original or auto-submit a replacement.

No hosted, preview, production, main, push, settings, billing, original backup/media/ignored ETL or image-transformation changes.
