# U05-B2b3c3 — atomic stay and new hotel-booking creation

Completed locally on `codex/trek-v5.1.4-family-reconcile`, starting from `602d73372c8d35007e88ea8d8d5da96379ac27b5`. Canonical schema source is now 134 migrations; hosted schema is unchanged. There are no application/runtime, native-layout, source-adoption or deployment changes.

## Implemented transaction

The additive migration provides `get_family_stay_bundle_context_v1`, `create_family_stay_bundle_v1`, `get_family_stay_bundle_outcome_v1` and `cancel_family_stay_bundle_v1`. Existing normalized tables hold the planned stay, new hotel reservation, explicit civil-date facts and one-to-one link. No new content table, index, duplicate catalog record, automatic expense or routing visit was introduced. Standalone stays and existing booking links continue to work.

One command retains its original operation/stay/booking UUIDs, complete observation, actor/Family/Trip/person/session and body. A single transaction creates all content, existing domain audit/calendar history and one immutable receipt. Identical retries return that receipt; stale or reused intent conflicts. Cancellation and creation serialize under the same existing per-Trip recovery lock. Fresh sessions can inspect/cancel unknown original intent but cannot rebind its write.

Civil dates remain dates. Unknown clocks remain NULL; true midnight, second precision, named zones and valid overnight windows survive. A confirmed reservation can still be untimed. Stay and booking notes are independent. A saved hotel uses its actual hotel FK; manual lodging has no invented catalog identity. Deliberately repeated stays create distinct records.

Creation and recovery require current Direct schedule and reservation authority, current session, linked person, Family membership and existing MFA assurance. These are rechecked after real lock waits. Shared hotel, place, country and category facts contributing to observation equality are locked without being edited. Public RPCs have empty search paths and authenticated-only execution. The owner is the existing non-superuser `postgres` role; private helpers and protected table writes remain unavailable to clients. The acknowledgement refuses unsafe JavaScript revision/sequence values.

## Acceptance

The new guarded candidate passes **38 database cases**, including **12 insertion/audit/receipt fault boundaries**, concurrent retry/create/cancel decisions, legacy dialect collisions, unknown versus midnight timing, complete-view admission, safe sequence bounds and six real lock-wait cases. All-or-nothing comparisons include Trip revisions, dates, calendar history, links, receipts, audit events and expenses.

**98 existing stay-command/outcome/coherent-reader cases pass.** All 587 preexisting function bodies, owners, ACLs and configurations match the correctly owned schema-133 baseline. **Six installed Supabase SDK cases pass**, including an actual committed response discarded before delivery, then outcome inspection without another create. Signed PostgREST/RLS and actual database roles are used. Auth/session/factor records are synthetic: this does not establish GoTrue login/refresh/enrollment, Storage recovery or independent backup restoration.

The final migration's plain CREATE statements were replayed transactionally from the schema-133 function surface after dropping only the eight provisional local functions. Every existing row and old function remained; resulting definitions/owners/ACLs exactly match those tested. Only the disposable ledger was advanced to 134. Initial diagnostics exposed the omitted-offset validation bug and a fixture migration-owner mismatch; both were corrected and the final suite uses a fresh derivative with normal non-superuser migration ownership. No grants were loosened to make tests pass.

Original-row and source preservation, 23 isolation refusal tests, 95 source/carryover tests and unchanged website quality baselines are sealed with exact source/commit hashes. Application runtime is byte-exact to C2; no new frontend build or native creation/browser acceptance is claimed. The three existing source-adoption/native/history release guards remain holds under the 5.1.2 metadata until the broader 5.1.4 release qualification is finished.

Canonical sources are the one new migration plus `trip_stay_bundle.py` and `trip_stay_bundle_guard.py` under `/Users/Misael/Desktop/FamilyTravelApp/supabase`. Exact review copies live in `supported-core-readiness/backend134`. The canonical mixed Git index and all 133 older migrations/308 prior migration/test sources remain unchanged. The guard requires `FAMILY_STAY_BUNDLE_FIXTURE_DIR` pointing to the exact private candidate metadata; never substitute a hosted URL.

Final preservation: **all 324,419 original rows across 240 COPY projections survive unchanged**. The accepted private candidate is `/private/tmp/trek-u05b2b3c3-bundle-20261113/rehearsal`; its guard and ordered restart receipt bind that candidate. The first diagnostic candidate at the parent directory is stopped and is not the accepted target. The three current canonical-module guard checks also pass.

## Remaining activation gates

Native Add, stay Trash/restore, routing/arrival-visit mirrors and hosted/default activation remain off. This first SQL command deliberately does not create the native arrival-stop mirror. A browser must not compose that missing step as a second request and pretend the original action is atomic. Native restore/confirmed-Trash discovery controls are still missing, as documented by C2.

Next is the original-operation adapter/queue packet for this new dialect, using mocked contracts first and this signed local candidate second. That packet does not itself authorize native Add: native visit identity/order, a fully atomic user action and reachable recovery must be reconciled before activation.

Production, preview, main, hosted SQL, push/publication, billing/settings, image transformations and original backup/media/ignored ETL remain untouched. New local services are stopped after final checks; their containers/volumes and restart order are retained. Prior fixture/source services remain as found.

[Implemented contract](trek-5.1.4-atomic-stay-create-contract.md). [Next adapter packet](trek-5.1.4-stay-bundle-adapter-packet.md).
