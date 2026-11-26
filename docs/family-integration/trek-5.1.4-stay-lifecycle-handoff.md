# U05-B2b3c2 — lifecycle command qualification and native-control audit

Completed locally on `codex/trek-v5.1.4-family-reconcile`, starting from `2a930bb4a4e7bf4dc86239833dc127bf1bf344f9`. Application runtime, native presentation, canonical schema 133, source adoption metadata and deployment configuration are unchanged. Only two test files and scoped documentation change.

## Findings that constrain activation

Native desktop `DayDetailPanel.tsx:186` calls `useDayDetail.handleRemoveAccommodation`; the stay card renders Remove at line 488. That callback currently reaches the deliberate Family repository refusal. Its cached row and original queue are preserved. The phone `MAccommodationSheet` supplies Save/Cancel; `MDaySheet` opens that edit by tapping the lodging row. Neither exposes a stay restore, Undo or Trash listing. The general planner Undo toolbar does not itself supply a stay restoration contract.

The existing `FamilyPlannerTaskRecovery` resolves an unresolved original command. It is not a browser for already confirmed Trash and cannot substitute for an accessible restore action. Therefore **native stay deletion remains gated**. No new interface was invented, no native protected layout changed, and no successful native Trash/restore cutover is claimed.

Upstream `AccommodationsService.createAccommodation` is transactional and creates a stay, hotel booking and arrival-stop mirror. Its delete path physically deletes linked bookings and budget items. Family recoverable Trash must preserve those independently owned records. Native `keepStop`/routing-release flows and compound creation remain unavailable until their exact ownership/transaction contracts are connected.

## What is proven now

The installed SDK and actual Family handler, transport, original-operation queue and recovery pass 13 enabled lifecycle cases against a new isolated schema-133 derivative. Cases prove same-ID Trash/restore and history, one receipt per identical retry, independent repeated stays, stale-observation refusal, offline persistence/reopen/retry, lost replies after real Trash and restore commits, fresh-session cancellation without rebinding, changed Direct-to-Propose/Deny permissions, foreign/AAL1/expired-session refusal and exact retained-row protection.

A booking's derived `stay_link.state` intentionally changes between active and retained. Tests compare all independent booking facts unchanged and check that presentation marker separately; they do not mistake that marker for a booking edit. Native desktop removal still refuses without deleting its cached row, enqueueing a legacy deletion or issuing a network delete. The actual phone sheet exposes no invented restore/removal controls.

Current stay recovery authority is the domain's **current Direct `trip.schedule.manage`** permission, evaluated again at restoration. There is no separate global stay-recovery capability in schema 133. Tests prove a non-owner with schedule authority and no booking-edit authority can Trash/restore without altering a booking, and loses restore authority immediately when its policy becomes Propose or Deny. Linking/editing reservations still has separate booking permission requirements. No new policy or role was added to the application.

The full affected suite, unchanged quality baselines, type/lint, isolation guards, original-row preservation, source/presentation/evidence pins and existing artifact syntax checks are recorded in the sealed evidence. The application runtime and dependency sources are byte-exact to C1. Its default/qualification build and desktop/phone edit acceptance are explicitly inherited; no new native deletion browser acceptance or new build is claimed for this test/documentation-only packet. The two actual native-control regression cases and 13 new signed lifecycle cases are current checks.

Current acceptance: **752 passing tests in 19 files**, including all 13 enabled signed lifecycle cases and 30 native writer/control regressions; 95 source-guard tests and 23 isolation refusal cases pass. Full client typecheck and zero-warning scoped lint pass. All 324,419 original rows across 240 projections survive without changes. The 133 migration files and 308 canonical migration/test sources, 12 protected layouts and 91 prior evidence seals remain exact.

## Next and remaining gates

The atomic creation contract is a proposal, not a migration. Existing tables/receipt ledgers appear sufficient for a bounded stay+new-hotel-booking+date+link transaction. Separate public RPCs are needed because browser-side composition is not atomic and the old outcome dialect cannot safely stand in for a new compound request. Preserve standalone unbooked stays; the new function is an additional explicit bundle operation.

Next is the bounded local SQL implementation/rehearsal packet. Native creation remains off until its queue, arrival-stop/visit mapping and restore path are qualified. Native Trash/restore also remains off until a reachable restoration contract exists; do not silently re-enable the destructive Nest delete semantics. Advanced routing, shared/public output, media preparation and source-adoption release gates remain separate.

No original backup, media bytes or ignored ETL files were accessed. No hosted SQL, new schema source, billing/settings, transformation, main merge, push, source publication or production/preview deployment occurred. Auth/session/factor fixtures are synthetic and signed PostgREST/RLS is real; this does not prove GoTrue enrollment/login/refresh or independent backup recovery. The new test services are stopped after checks, with their containers and volumes retained; prior source databases and regular Supabase stacks are not stopped by this packet.

[Atomic creation contract](trek-5.1.4-atomic-stay-create-contract.md). [Next local packet](trek-5.1.4-atomic-stay-create-packet.md).

## Confirmed-Trash discovery is also a prerequisite

The current active stay view omits Trash. Editor/context/history functions require an already known stay ID. There is no current paginated user-facing trashed-stay discovery contract, so local command recovery cannot stand in for cross-device Trash recovery. Before native deletion activation, specify a separately authorized `list_family_trashed_stays_v1` with bounded keyset pagination by `(deleted_at,id)`, current Direct schedule authority, no cross-Family content and explicit unavailable-location/parent-Trip handling. The existing partial `trip_stays_trash_idx(trip_id,deleted_at,id)` is the first index to evaluate; add no redundant index without a demonstrated need. This discovery/UI work is not part of the next creation SQL migration.
