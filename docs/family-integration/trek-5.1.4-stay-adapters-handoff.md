# U05-B2b3a — typed stay adapters and original-operation recovery

Locally qualified on the complete `codex/trek-v5.1.4-family-reconcile` successor. This packet adds typed stay RPCs, strict versioned handler/transport contracts, a separate stay identity namespace and explicitly owned retained requests. It does **not** enable native accommodation/compound controls, confirmed booking timing, new saved/shared DTOs or any hosted service. Accepted source-adoption metadata stays5.1.2. The existing release source/native/history guards deliberately reject this unadopted5.1.4 candidate; do not silence them by repinning working files.

## Database outcome protocol

New additive migration132 is `20261113225457_original_stay_command_outcomes.sql`, generated with the pinned Supabase CLI2.109.1. All131 historical migration sources/ledger entries remain exact. Apply/qualification occurred only in two newly created, guarded, network-none local derivatives from the preserved source131 derivative. The final SQL is copied exactly into this website's `supported-core-readiness/backend132` review folder; the canonical mixed Git index remains untouched.

`get_family_stay_command_outcome_v1` and `cancel_family_stay_command_v1` require the **entire original** trip/stay/operation, seven-field scope, four-field observation, action, changes and optional booking identity. The immutable cancellation ledger shares the original writer's Trip advisory/root lock. A delayed write and cancellation therefore cannot both win. Cancelling an already committed operation reports its historical acknowledgement. Cancelling an unknown create creates no phantom stay, booking or stop and changes no content/Trip revision.

A current authorized login may inspect/cancel an earlier operation for the same user/person/Family/Trip. It never substitutes its new Auth session into the original request. Submitting/retrying remains restricted to the original Auth session; same-session token refresh is compatible. Deleted/expired/suspended/demoted/foreign or insufficient Direct schedule/booking authority refuses recovery. Permission revoked during an actual session-lock wait is rechecked after the wait and refuses cancellation.

Outcomes are explicitly `committed`, `cancelled` or `unknown`. Unknown is **not** permission to drop the retained request, generate another operation, infer absence from history, or retry through a different session. Only an exact terminal proof clears the exact retained row. The two terminal decisions retain restrictive ownership and remain in SQL backups. Cancellation stores only operational identifiers/digest/timestamps, not user content; it is not added to portable Family content exports. Purge/retention policy remains a separate reviewed operation.

## Browser adapter and queue boundary

The backend SDK allowlists ten installed browser-client RPCs; no raw tables, service client or arbitrary RPC names. Its transient session fence returns only user/session UUIDs; signed/current-session authorization remains in PostgreSQL. Neither tokens nor credentials enter retained command rows.

The private versioned handler namespace is `/trips/:trip/family/stays`, with stay editor, context, history, `commands`, `outcome` and `cancel` suffixes. Numeric presentation keys are resolved by **kind**, canonical SQL identities stay UUIDs, and stay/place/reservation keys cannot alias. Full observation JSON, including unknown nested location facts and sub-millisecond strings, survives validation without stripping. Source, account, Family/person, Trip/layer, registry, actual Auth session and request-abort fences surround asynchronous work.

Acknowledgements contain historical identity/revision proof, never replacement current records. Fresh readers remain authoritative. Stay requests are retained before dispatch; offline/uncertain results remain intact. Generic queue replay holds them for the explicit owner. A fresh login can inspect/cancel the original, never silently rebase it. Future metadata, recovery holds, dependency protection, changed rows and older Trip work prevent destructive acknowledgement. Existing packing protocol holds are shared without increasing existing flush complexity/size diagnostics.

Read limits remain2000 stays/8MiB, editor256KiB, context512KiB, original operation1MiB, outcome32KiB and bounded history1–100/8MiB. Date-only, actual midnight, overnight windows, named zones, off-calendar stays, repeated stays, exact lodging/booking/city identities and Direct/propose/deny rules remain distinct. Native companion booking/stop creation stays refused pending an explicit atomic contract.

## Qualification and preserved boundaries

- **101 distinct SQL/signed-HTTP methods**:33 foundation,49 original commands and19 outcome/cancellation cases pass. Final clean replay repeats this cohort; repeats are not additional distinct coverage. The new cancellation revocation/concurrency and fresh-login/lost-reply cases run against real PostgreSQL/PostgREST signatures and RLS.
- **318 affected client regressions**, **16 backend SDK tests**, and **seven actual SDK → Axios handler → signed local RPC/queue tests** pass. The seven use the installed Supabase client and private loopback relay into the new Unix-only PostgREST target; they do not simulate successful database replies. Auth/session/factor metadata and keys are synthetic, not a GoTrue enrollment/browser/device proof.
- Client/backend typechecks, scoped lint with no new warnings, measured no-growth generic-queue lint, the locked web build/public-anon-only secret scan, unchanged seven quality gates,92 source/inspector/carryover adversarial tests and exact backend carryover verification pass. See sealed receipts for command exits; initial test/SQL/refactor diagnostics are not acceptance results. No baseline expansion or dependency/lock upgrade.
- All **324,419 source131 rows across240 complete COPY projections** remain exact with multiplicity; all prior ledger arrays,21 function ACLs/owners and20 unchanged function bodies match. The sole prior-body change is the pinned executor's terminal-cancellation guard. New API ACL/RLS/immutability/index audit and23 isolation refusals pass.
- All12 native layouts match upstream5.1.4. The original mixed canonical index,302 prior migration/test sources, old clean5.1.2 branch,86 prior seals/6,211 members, package locks, existing media readers and source-adoption pins remain protected. The sealed qualification record binds the actual local commit and final reviewed files.

Old `family.offline-trip.v3` / `family-web/complete-trip-v3` remain unchanged and do not claim stay coverage. Booking-view v2 and complete-trip v4 remain reserved. No native stay controls, public/shared notes/history/Auth scope, unsupported companion actions or timing writers were enabled. No hosted SQL/settings/billing, preview/production/main/push/publication, original backup/media/ETL operation or image transformation occurred. Storage/GoTrue/device behavior, full/off-device backup recovery, incremental backups and final release acceptance remain unproved/separate.

Next: the coordinated stay/booking projection and native consumer packet. Retain these working adapters/commands and original-operation proofs; qualify all live/saved/shared consumers before activating native controls.

[Next packet](trek-5.1.4-stay-projection-packet.md).
