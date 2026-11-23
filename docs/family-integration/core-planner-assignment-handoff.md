# Q27c — native Add-to-day edges and permanent conflicts

Accepted locally, 16 November 2026. This follows [Q27b](core-planner-creation-handoff.md) on `codex/trek-v5.1.4-family-reconcile`. The existing source-bound application build remains `b320e88094ecef942cd736dfa6aaa0b4368f62a4`; no website application, layout, source profile, dependency, typecheck/build qualification or runtime artifact was changed/rebuilt. The database prerequisite is additive migration `20261116105805_native_plan_semantic_conflicts.sql` and canonical test `supabase/tests/native_plan_semantic_conflicts.py` in the separate canonical checkout. Those two files remain local uncommitted additions; the mixed canonical index was preserved.

## Demonstrated defect and exact correction

All four explicit permanent conflicts in `public.create_family_native_plan_v1(uuid,uuid,jsonb,jsonb)` reproduced as SQL40001 while actual PostgREST14.14 requests exceeded a five-second diagnostic client limit. Each was cancelled only in the newly owned target. These were stale original scope, UUID reused with different content, stale saved-location revision and changed selected-day observation. No retry configuration or dependency was changed.

The migration guards the exact schema147 routine definition, then changes only those four explicit error literals to PT409. The same real HTTP conflicts now return409 in roughly35 milliseconds, with no Trip graph change or new visit. The function body apart from those literals, signature, owner, ACL, security mode, search path, lock/session order and every other routine remain intact. No exception handler rewrites actual transaction failures. A control with two real repeatable-read SQL transactions still produces genuine40001. That control is SQL concurrency evidence, not an independent PostgREST retry qualification.

This distinction follows [PostgreSQL error-code semantics](https://www.postgresql.org/docs/17/errcodes-appendix.html) and [PostgREST custom HTTP errors](https://docs.postgrest.org/en/stable/references/errors.html). Our pinned service behavior was verified directly. The other50 legacy routines from the earlier51-routine inventory are untouched and not implied to be accepted.

## Accepted evidence

- Two isolated upgrade rehearsals: schema147 to148; all147 historical ledger arrays preserved. Exactly one of682 routines changes by four error literals; the other681 definitions and all existing owners/ACL/RLS/constraints remain exact. No new tables, columns, indexes or grants.
- Six new canonical methods pass17 recorded contracts. Nine unchanged canonical receipt methods pass84 records on the new owned schema148 target. Existing test classes are AST-equivalent; only explicit fixture/purpose/schema setup is adapted in the temporary runner. Separate synthetic Families prevent permission-test interference.
- One complete final browser run passes34 checkpoints:17 desktop and17 phone-width Chrome, using the unchanged production build and real GoTrue password/TOTP, PostgREST and RLS. Native Add-to-day persists its existing venue/day/revision before dispatch, coalesces in-flight repeat clicks, permits a deliberate second-day visit with a distinct identity, and recovers an unknown third-day visit after cold reload/lost committed reply.
- Actual owner edits make the selected saved location stale; a privileged fixture-only change to an unassigned owned day makes its observation stale. Both produce prompt conflicts, keep exact originals across reload, and refuse original retries without rebasing. The day fixture seam does not qualify a native day-editing writer.
- An actual editor's schedule permission is revoked and restored. Refusal and read-only receipt checking preserve the command; restored current authority completes that same original once. Eight accepted originals have eight root receipts/visits. Four stale originals create no receipt/visit and remain protected.
- The12 intentional conflict/permission HTTP errors are expected. Final acceptance has zero unexpected API errors, gateway refusals, page errors or transformation attempts.378 external/provider attempts were blocked, zero forwarded. Synthetic variant objects are served by the owned gateway; this is not a real Storage restore. Phone-width Chrome is not physical iOS.

All362464 original rows and301353 incoming business rows survive. Schema148 catalog state remains exact after tests. All362 original canonical schema/test inputs and the mixed index,173 prior seals/11742 members, native/backend/source/history declarations and other checkouts remain protected. Three newly owned roles are stopped;241 earlier service states/127 earlier volume names and11743 source fixture files are unchanged. No old accepted fixture was restarted.

Private stage: `/private/tmp/trek-core-assignment-edge-source-20261116`. New stopped fixture: `/private/tmp/trek-core-assignment-edge-fixture-20261116`, manifest `stopped-schema148-files-private.json`. Use a new guarded copy for the next packet. Both isolated databases contain the accepted148 migration; original failed prototypes/source databases remain preserved.

## Failures and unproved limits retained

The first migration generator attempts rolled back due to definition-hash newline and statement-delimiter defects; the accepted guarded migration was then rehearsed on both unchanged147 baselines. Earlier browser attempts had incorrect selectors, an overlapping permission fixture, and constrained background reads of older test Trips. These runs remain failed. The final accepted run uses observed native labels and a separate new browser Family, with clean background reads. Raw attempts and original envelopes remain private, with sanitized proof sealed separately.

The CLI advisor could not connect through the explicitly supplied Docker-local Unix socket from the Mac; no advisor pass or linked/TCP/hosted fallback is claimed. Native layouts/application bytes are unchanged, so no new client build/typecheck is claimed. Existing source/native/backend/history and check-only publication guards are rerun. This packet is not full Q26, all planner writers, dashboard recovery discoverability, physical iOS or independent backup acceptance.

## Next — Q27d explicit terminal resolution

[Execution packet](core-planner-terminal-resolution-packet.md). Permanently refused originals remain protected; there is still no safe deliberate corrected-new-intent path that archives the old command. Implement and prove server cancellation versus creation under the same lock, then durable client cancellation/archival and native recovery controls together. Unknown is not rejected; never delete it or generate a replacement silently. Other edit/arrange/lifecycle durability remains separate.

No hosted, preview, production, main, push, settings, billing, original backup/media/ignored ETL or image-transformation changes.
