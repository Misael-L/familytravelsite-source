# Proposed atomic stay and hotel-booking creation contract

Status: implemented and qualified locally by U05-B2b3c3 as canonical migration 134 (`20261114051232_atomic_stay_booking_bundle.sql`). It was design-only at C2. No hosted migration or native creation activation occurred. See [the implementation handoff](trek-5.1.4-atomic-stay-create-handoff.md) for actual acceptance and remaining gates.

## Observed behavior and chosen scope

TREK 5.1.4 `server/src/nest/accommodations/accommodations.service.ts:755` creates a stay, hotel reservation and arrival-stop mirror in one `UnitOfWork.transactional`. `Reservations.repository.ts:691` chooses pending/confirmed from the confirmation field. Deletion at `accommodations.service.ts:893` physically removes linked reservations and budget items, then the stay. None of those server routes runs in our static Cloudflare/Supabase integration.

Family already separates a shared catalog entity, its saved Trip location, a planned stay, reservation facts, reservation civil dates, and their association. Existing schema 133 can save a standalone stay and can link an existing booking. Separate browser calls to those RPCs cannot make stay-plus-booking creation atomic.

Recommendation: add one transaction for **a new planned stay, a new hotel reservation, its civil-date record and their one-to-one link** at an already saved lodging. Reuse existing tables, identity constraints, private immutable receipt/history and cancellation ledgers. No parallel Trip table, catalog duplication, automatic expense, new `road` table/column, or schema-wide rewrite is required.

Keep itinerary arrival-visit creation outside this first SQL slice. Native Days can display the stay through its own day references; creating or attaching a routing visit has separate identity/order/ownership rules. **Native creation stays gated until its arrival-stop mirror and recovery behavior are explicitly reconciled.** This contract does not claim full TREK creation parity. Existing intentional repeated visits must never be silently merged by location/day. A future visit composition must identify an existing visit explicitly or allocate a distinct new visit ID; its transaction must include the stay bundle if they are one user action.

## New public functions

Names are proposed, to be added by a new additive migration, never by editing an applied migration:

- `get_family_stay_bundle_context_v1(p_trip_id uuid, p_location_id uuid, p_arrival_day_id uuid, p_departure_day_id uuid, p_stay_id uuid, p_reservation_id uuid) returns jsonb`.
- `create_family_stay_bundle_v1(p_command jsonb) returns jsonb`.
- `get_family_stay_bundle_outcome_v1(p_command jsonb) returns jsonb`.
- `cancel_family_stay_bundle_v1(p_command jsonb) returns jsonb`.

All are private-user operations: authenticated role only, current linked person, active Family membership, current Auth session and existing MFA requirements. Creation requires **current Direct `trip.schedule.manage` and `trip.reservations.manage`**, not Propose. Checking an outcome or cancelling requires current access and both domain permissions again. A previously granted edit or a historical receipt is not current authority.

Use the existing published scope exactly: `{version:1, layer:"published", trip_id, family_id, user_id, person_id, session_id}`. Derive/compare identities in SQL against `auth.uid()`, the current session and database membership. Never trust user-editable JWT metadata. Private layers have no published fallback.

## Context and immutable command

Context has exact keys `{format:"family.stay-bundle-context.v1", scope, observation, admission:{create:boolean}, native_controls:false}`. It validates all selected IDs belong to the same accessible Trip. `observation` has exact keys:

- `trip_revision`: positive bigint representable by JavaScript's safe integer range.
- `candidate_location`: the complete existing canonical location projection, preserving unknown nested read facts for equality/digest checks. Only an active saved `hotel` or `manual` lodging is admitted.
- `arrival_day`, `departure_day`: complete canonical `{id,revision,civil_day,day_index,title}` projections. Both belong to this Trip; same-day stays are valid. This first version requires actual current Trip days.
- `stay_absent:true`, `reservation_absent:true`: the two proposed UUIDs have no existing rows. Do not reveal the owner of a colliding foreign ID.

The exact SQL command keys are `{format:"family.stay-bundle.v1", operation_id, scope, stay_id, reservation_id, observation, stay, reservation}`. All identifiers are UUID strings. Allocate the operation, stay and reservation IDs once when preparing the user's intent and retain them unchanged through retries. They must be distinct. Unknown top-level or write fields fail validation. Bound the complete serialized command to 1 MiB.

The client queue wraps the SQL command in `{version:1, source_url, command}`. `source_url` is an exact original data-source binding enforced by the adapter/queue. It is not a SQL authorization credential. Preserve original source/account/session/person/Family/Trip/layer and registry fences; source changes must never move the retained command to another backend.

`stay` has exact required keys `location_id`, `arrival_date`, `departure_date`; optional keys are only the existing `stayPatch` fields `check_in_time`, `check_in_window_end`, `check_out_time`, `check_in_window_end_day_offset`, `time_zone`, `notes`:

- Location equals `observation.candidate_location.id`.
- Dates are real ISO civil dates and equal the two observed days. Departure is on or after arrival. They are PostgreSQL `date`, never midnight `timestamptz` placeholders.
- Omitted nullable clocks, zone and notes default to SQL NULL on creation; explicit NULL has that same creation meaning. A supplied `00:00` is a real clock. Preserve the existing accepted second precision and overnight-window rules; do not truncate values for a native editor.
- Window day offset defaults to 0 and admits only 0 or 1. Validate combinations using the existing stay rules.
- An optional named zone must be valid in the server time-zone catalog. No default server/browser zone or fabricated UTC moment. Zone omission is valid for date-only plans.
- Notes use the existing 20,000 UTF-8-byte bound and are stay-owned. They are not catalog description or automatically duplicated booking notes.

`reservation` admits exactly `title`, `status`, `confirmation_code`, `notes`, `url`:

- `title` is required, nonempty, at most 1,000 UTF-8 bytes. The native adapter may send the original observed lodging name.
- `status` is explicitly `pending` or `confirmed`. Native parity may map its user-entered confirmation field to that request, but SQL does not infer confirmation from an opaque code. Confirmed status does not imply a known instant.
- Optional `confirmation_code` defaults to NULL, maximum 1,024 UTF-8 bytes. Empty strings normalize to NULL before the immutable packet is retained.
- Optional `notes` defaults to NULL, maximum 20,000 UTF-8 bytes, independent of stay notes.
- Optional `url` defaults to NULL; if present it is an absolute HTTP(S) URL, maximum 2,048 UTF-8 bytes.
- SQL fixes `type='hotel'`, `timing_kind='untimed'`, `starts_at=NULL`, `ends_at=NULL`, `time_zone=NULL`. Unknown time remains unknown even when a stay has local check-in guidance.
- The reservation date record contains the explicit arrival/departure civil dates, and its day associations match the same observed days. It must remain consistent with the reservation's start/end day references.
- Resolve a hotel catalog FK only from the selected saved location's actual hotel source. Manual lodging has no fabricated hotel FK. A country/city/geographic place ID is not the saved-lodging ID. Never coerce the native numeric display key into a database UUID or infer an activity from city coordinates.

Existing booking linking and booking edit remain separate contracts; this version does not adopt an already existing booking or change someone else's reservation. No zero-value expense is invented.

## Transaction, locks and authorization

Validate the envelope before writes. Reuse the current per-Trip recovery advisory lock and Trip-row lock convention, then current session/membership locks, saved-location lock and referenced source-row locks in a consistent documented order. Read/lock observed calendar rows in UUID order. If shared catalog facts participate in observation equality, hold appropriate read locks against their modification without changing those catalog rows. Recheck current session/membership/MFA/domain permissions after any wait, before inspecting a receipt and immediately before mutation. Do not introduce an opposite lock order to existing stay/booking/day commands.

First inspect both stay receipts and cancellation ledgers under the same `(trip_id, actor_user_id, operation_id)` operation namespace. Compute `sha256(convert_to(jsonb_build_array('family.stay-bundle.v1', p_command)::text,'UTF8'))` over the complete parsed original command. The dialect tag prevents an old save/link/Trash request from being mistaken for this creation.

An exact prior receipt returns its historical acknowledgement after current access checks. Different IDs/body/action under the same operation key refuse with `PT409`. A cancellation prevents later creation. Before a new mutation, compare the complete original observation, verify both IDs are absent, and enforce existing stay/booking aggregate limits. Expected observations are not reconstructed from current mutable data.

Within one database transaction: create the stay, create its hotel booking and civil dates, insert the existing stay-booking link, append required domain audit/history, validate the complete booking/stay aggregate, and insert one immutable create receipt. Its `before_state` is JSON `null` and its `after_state` is the complete existing `stayProjection`, including linked booking/dates. Any constraint, permission, admission, audit or final-receipt failure rolls back every row and revision change. Several legitimate trigger revision increments are acceptable; the acknowledgement reports the actual final revision, not a guessed +1.

Use hardened, narrowly granted existing write-helper conventions. Direct writes to protected content/ledger tables remain revoked. A required `SECURITY DEFINER` entry point must have fixed empty search path, explicit current-actor checks, no caller-supplied SQL, narrow ownership, revoked PUBLIC/anon/service-role execution and an authenticated-only grant. Do not grant table access or use definer rights to evade a failed permission test. Do not modify old helper bodies to force this command through.

## Receipt, outcome and recovery

The new acknowledgement has exact keys `{format:"family.stay-bundle-ack.v1", state:"published", acknowledgement:true, read_current_required:true, changed:true, trip_id, stay_id, reservation_id, operation_id, stay_revision_after, trip_revision_after, event_sequence, recorded_at}`. It contains identities/revisions only. An identical retry returns the exact original acknowledgement, including `changed:true` as a historical fact; it does not insert again or repeat side effects.

The existing private receipt table can hold the new result object and existing `action='create'`; the existing history API can continue returning its unchanged before/after stay projections. Do not alter an old public response schema or make the old outcome parser accept this dialect. Add the separate outcome/cancel functions above. Reuse the existing private cancellation table: stay ID and digest already bind the never-created reservation ID through the complete command. No additional content table or ledger column is currently justified.

New outcome format: `{format:"family.stay-bundle-outcome.v1", trip_id, stay_id, reservation_id, operation_id, current_scope, original_session_id, status, acknowledgement, cancelled_at}`. Status is `unknown`, `committed` or `cancelled`; acknowledgement exists only for committed, cancellation time only for cancelled. The same actor's fresh valid session may inspect or terminally cancel the exact original unknown command with current permissions. It cannot change the original IDs/body/session and replay it. Serialize create/cancel under the same lock so exactly one wins. Return no hidden content or operational signing credentials.

The adapter retains the whole operation in one original-operation queue item, never as several legacy create/link requests. After confirmation, obtain a fresh complete v2 booking/stay view and authorized ancillary data before native publication. A late old receipt must not overwrite a newer edit. If the confirming read fails, retry that read; do not generate a second creation. Cancelled/unresolved operations remain protected by exact queue-row comparison and original-owner recovery.

Trash/restore later preserves the booking, location, expenses, media and identity. Creating records together does not make it safe to cascade-delete independently owned content. A trashed stay's booking link may be presented as `retained`; restore changes that derived marker back to `active` while booking facts remain unchanged.

## Error and admission contract

Use `22023` for malformed/bounded input, `42501` for current authorization failure, `PT409` for observation/identity/operation conflicts, `0A000` for unsupported layer/workflow and `54000` for aggregate admission limits. Return safe messages without exposing foreign records. Tests must distinguish these from transport ambiguity. No exception is translated into fake success, empty content or a substitute row.

## Required local acceptance before implementation is called complete

Use a fresh guarded schema-133 derivative, synthetic signed sessions and actual SQL/RLS plus installed SDK. Prove all-or-nothing rollback at each insertion/audit/receipt boundary; current permissions after lock waits; original-session ownership; date-only versus true midnight; named zones; distinct repeated creates; identical retries; collision against legacy stay commands and cancellations; concurrent create versus create/cancel; no booking/calendar/link orphans; original history/export compatibility; current-session/AAL/foreign denial; content/row preservation; coherent final reads; and exact old helper/function/response compatibility. Validate old migration sources, protected canonical index and source/presentation/evidence pins before and after the new local migration.

This SQL acceptance does not enable native Add, routing mirrors, Trash/restore UI or hosted deployment. A subsequent packet must qualify the new queue/outcome adapter, reconcile native arrival-visit behavior and provide a reachable user restoration path before exposing the corresponding controls.

## Implementation references

Use [Supabase function security guidance](https://supabase.com/docs/guides/database/functions) for exact function privileges and search-path hardening. Use [PostgreSQL 17 locking guidance](https://www.postgresql.org/docs/17/explicit-locking.html) when proving consistent lock ordering and rechecking authorization after waits. These support the implementation rules; they do not establish that the proposed RPCs are already implemented.
