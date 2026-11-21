# Q27e2 — native editor originals and recovery

Accepted locally on 16 November 2026 after the [schema150 outcome prerequisite](core-planner-editor-receipt-handoff.md). Native saved-place and selected-visit edits now persist their complete original in the existing source/account/Family/person-owned IndexedDB before sending. Existing TREK desktop/phone markup, layouts, CSS and twelve presentation pins remain exact. There is no new schema, API, permission, hosted/preview/production/main/push/settings/billing/backup/media/ignored-ETL/transformation change.

## Behavior and boundary

The existing Family editor port captures observed target, full form/revisions, source, actor/Family/person/Trip/layer and one operation UUID. A storage failure sends nothing. Unresolved work prevents a different form or original from replacing it. First send and explicit retry share the same original under the existing exclusive queue lock; persistence, RPC awaits and exact acknowledgement all check current owner/context. Pending creation decisions also hold editors even when the queue copy is missing.

Startup recovery discovers typed editor originals without requiring an already loaded native snapshot. **Check** calls only the two schema150 read-only outcome APIs. It validates the exact scope, kind/target, operation, entire observation/form echo, authoritative server digest and kind-specific result. Unknown, denial, malformed proof, missing API or changed ownership retains the original. **Retry** sends that original and verifies matching committed proof after an apparent save success; only the exact observed row can be removed. Current canonical reads follow acknowledgement; historical committed results cannot replace later edits or private drafts. No edit cancellation or automatic replacement operation is implemented.

Only `get_family_trip_location_form_receipt_v1` and `get_family_trip_visit_form_receipt_v1` are added to the already finite isolated planner/base-packing profile. Primary/ordinary/unselected profiles and advanced features remain gated. This is local synthetic acceptance, not hosted activation or physical iOS acceptance.

Known generic conflict metadata stays pinned losslessly and is never authority. Legacy editor rows containing resource/cache metadata stay preserved/export-held rather than being reinterpreted as newly qualified originals. An old retained-command test incorrectly expected generic creation dispatch; it now asserts the existing original-owner hold. The queue runtime itself is unchanged.

## Validation

- All 761 affected regressions pass; both new editor suites cover storage failure, immutable persistence, read-only unknown/committed outcomes, lost replies, malformed proof, competing work, old callbacks and source/account/Family/person/Trip/layer retirement. Typecheck and scoped lint pass with zero errors/warnings and no rule/allowance changes.
- The exact committed source builds. Correct source binding passes; wrong and missing source bindings fail. Native presentation, qualified source, original Git structure and complete backend carryover checks pass. The same 33 inherited global size findings remain; global repository quality is not accepted.
- Real Chrome at desktop and phone widths uses the actual local Auth/TOTP, PostgREST, SQL and RLS. Native forms produce the originals; no successful API/product response is injected. The matrix covers both edit kinds, held/duplicate clicks, pre-dispatch failure, cold read-only Check, same-original Retry, lost committed reply, lost proof after success, real logout/new login, real permission loss/restoration, competing tabs and held-response Trip switches. Four additional later-edit cases prove that historical receipt settlement fetches and displays the newer canonical edit.
- The final database check proves one exact digest-bound receipt per browser operation, distinct independent repeated visits, separated venue/visit notes and two genuine midnight visits. Catalog source records remain unchanged. Transform requests and external services are blocked by the test gateway; local image bytes are synthetic stored-variant fixtures, not a live Storage backup/restore test.
- All 455,678 incoming and 362,464 original rows, schema150 catalogs/ledger/692 routine definitions/owners/grants/RLS,368 canonical source/test files, the mixed canonical index,178 previous evidence seals and old service/data states remain intact. Only this packet's three owned roles are stopped; all their data remain.

Qualified application: `1860ce7a0fd243cd540318faedecdd3e7ecec118`. Accepted build source: `d57887c2b944a28540faf057ae64f0773b79f280`. Documentation commits do not relabel the accepted build.

## Next — Q27f1 arrangement and lifecycle producer/outcome audit

Use the sealed next baseline and a new guarded copy of this stopped schema150 fixture. Do not restart older fixtures or repeat accepted creation/cancellation/editor work. Preserve all completed Family packets, native5.1.4 presentation, the existing task profile, stored variants and publication protections.

Freeze a finite allowlist before editing. Trace `plannerCohortAssignments.ts`, the native move/reorder/Trash/Undo consumers, `plannerArrangementContract.ts`, `plannerArrangementHandler.ts` and their actual SQL writer/receipt contracts (resolve names from source). Establish which producers persist immutable originals before dispatch and which outcome checks can confirm them without writing. Do not infer arrangement/lifecycle success from editor or creation receipts: their digest domains and operation bodies differ.

Write focused diagnostic tests through actual native producers. Identify the minimum missing read-only outcome prerequisite before any native recovery cutover. Unknown is never cancellation, rejection or permission to discard. Preserve target/visit identities, ordering, repeat visits, timing, notes and current direct/propose/deny rules. If a permanent40001 is reproduced through real HTTP, isolate only that demonstrated server prerequisite; do not mass-rewrite serialization errors or change settings.

Then implement the bounded arrangement/lifecycle cutover and complete the remaining Q26 composed native matrix. Global inherited quality, independent database-plus-files recovery, later unused-source cleanup and the target-specific hosted/preview release gates remain open. Current local acceptance does not authorize hosted migrations, ordinary writer activation or deployment.
