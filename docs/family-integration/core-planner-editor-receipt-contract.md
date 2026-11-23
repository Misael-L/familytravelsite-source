# Q27e1 — exact-original editor outcome contract

Local schema150 prerequisite for the native saved-location and selected-visit editor cutover. This adds two public read-only APIs and one private implementation. It adds no table, index, trigger, client control, HTTPS-profile admission or writer behavior. The CLI-generated migration is `20261116142011_planner_editor_receipt_readers.sql`; canonical regression source is `supabase/tests/planner_editor_receipts.py` in FamilyTravelApp. Existing schema149 history and all 689 routines remain exact.

## Why this prerequisite exists

The actual native `usePlaceEdits` hook calls the installed planner editor port, then `PlannerCohortEditor.saveForm`, then `openFamilyLocationForm.save` or `openFamilyVisitForm.save`. The operation map is volatile. Two diagnostic tests through the native pool/selected-visit form show zero retained IndexedDB rows when the save RPC has already been reached and its reply is held. This diagnosis describes an unfixed producer gap; it is not a passing durability regression or a browser acceptance claim.

Both existing save APIs are idempotent, but calling one again can execute an unknown write. The old GET editor-context APIs describe current data and do not identify whether the exact original transaction succeeded. New readers consult the existing private root receipt under its `(trip_id, actor_user_id, operation_id)` primary key. No generic receipt listing or direct table access is exposed.

## Public inputs

`public.get_family_trip_location_form_receipt_v1(p_trip_id uuid, p_location_id uuid, p_operation_id uuid, p_observation jsonb, p_form jsonb)` accepts the unmodified original arguments from `save_family_trip_location_form_v1`.

`public.get_family_trip_visit_form_receipt_v1(p_trip_id uuid, p_visit_id uuid, p_operation_id uuid, p_observation jsonb, p_form jsonb)` accepts the unmodified original arguments from `save_family_trip_visit_form_v1`.

No defaults or nullable identifiers. The observation/form must be objects with the existing complete top-level keys. Structural checks cover original identities, positive revision shapes, normalized location fields and complete typed visit clocks; echoed observations remain client-supplied input, not an authorization claim. Total PostgreSQL UTF-8 JSONB text is limited to 1MiB. Saved-location fields remain name, description, personal notes, address, website, phone, latitude/longitude pair and Family category. Observations carry original Trip/location, Family/account/person, revision, layer, draft token and published/shown forms. Selected-visit observations also carry the selected visit/revision, shown/published occurrence and clock zone; their form carries location fields, separate visit notes and complete optional `start`/`end` clocks. Clock strings use `HH:mm`; genuine `00:00` is distinct from null. Validation reuses the existing normalizer. There is no device-zone guess, silent rebase or catalog write.

## Response

Every successful response is one JSON object with these exact fields:

- `version`:1.
- `kind`: `location` or `visit`.
- `trip_id`, `target_id`, `operation_id`: original UUIDs; target is the location or selected visit respectively.
- `observation`, `form`: the original JSONB values echoed unchanged.
- `request_sha256`:64 lowercase hexadecimal characters, calculated by PostgreSQL with the exact existing writer framing: `sha256(convert_to(jsonb_build_array(kind || '_form_save', target_id, observation, form)::text, 'UTF8'))`.
- `status`: `unknown` or `committed`.
- `result`: null for unknown, or the existing writer's saved receipt result unchanged for committed.

Response size is bounded at 2MiB to accommodate the input echo. Decimal coordinates and Unicode are supported. A client must bind the entire response to its immutable original and validate the kind-specific saved result. It must not copy an integer-only JSONB hash implementation or treat the digest by itself as evidence for another row.

**Committed means the original transaction completed.** It does not claim that a private draft still exists, is published, or has not subsequently been edited/removed. Superseded and removed drafts still have their historical outcome; reading never recreates them. The client must acknowledge only that exact original, then fetch current canonical state separately. Unknown is not rejection, cancellation or permission to discard/rewrite the original. These APIs cannot cancel an edit.

## Authorization, conflicts and transactions

The private helper checks the real current Auth session before and after reading. Its original account/person/Family/Trip identity must match the authenticated actor; current active membership, person, Trip visibility and assurance remain required. Published saved-location reads require current direct places authority. Private saved-location reads use the exact existing writer's `can_stage_capability` rule, including its distinction between a head's direct permission and a non-head's proposal permission. Selected-visit reads use current schedule direct/staging authority plus places authority when the requested form changes location fields or the saved receipt records inherited `places_intent`.

A receipt for another actor remains inaccessible. Another original body, target, layer or domain reusing the same actor/Trip/operation raises `PT409`/HTTP409 promptly. The same applies to a UUID already held by the separate native-creation cancellation namespace. Current authorization failures remain `42501`/HTTP403; anonymous/service-role function execution is revoked. Invalid input is rejected, generally `22023`/HTTP400; UUID casts retain PostgreSQL's invalid-input errors. Size output refusal uses54000. No exception is converted into successful unknown; no blanket40001 change is made.

All three new routines are `STABLE` with empty explicit search paths. Public wrappers are `SECURITY INVOKER`; one private `SECURITY DEFINER` helper performs the guarded indexed lookup. Owner is postgres, execution is granted only to authenticated on these new routines, and all default PUBLIC/anon/service-role grants are revoked. Existing table/column/schema/role grants, RLS and all old function definitions/owners/ACLs are unchanged. The private helper accepts only the two reviewed kinds; no packet chooses a relation, network target or arbitrary command.

The reader takes no Trip write/advisory lock, starts no save, inserts no receipt or cancellation, and performs no refresh mutation. Unknown and committed calls both succeed inside actual SQL `BEGIN READ ONLY` transactions. A concurrent uncommitted save may still appear unknown; the client must retain the original and may check again. Existing writer transactions, revisions, idempotency and recovery/deletion semantics remain intact.

## Verification and continuation

The final suite has 138 assertions in 14 methods using real local GoTrue/TOTP/PostgREST plus SQL read-only transactions. It covers both domains/layers, exact echoes/digests, floats/Unicode/no-op results, current permissions and inherited private places intent, actor/person/Family/Trip/layer isolation, session expiration/logout/deletion/MFA, anonymous/service-role denial, limits/clocks, later edits/soft removal and superseded/removed private drafts. The unchanged native receipt, permanent-conflict and native cancellation/race suites add 221 compatibility assertions. Two complete 149→150 rehearsals preserve old ledger arrays and all 689 routines/ACLs.

Next is the separately bounded native editor producer/recovery cutover described in the [handoff](core-planner-editor-receipt-handoff.md). Full Q26, arrangement/lifecycle durability, independent database-plus-files recovery and hosted release remain open. No existing preview/production endpoint is updated by this contract.
