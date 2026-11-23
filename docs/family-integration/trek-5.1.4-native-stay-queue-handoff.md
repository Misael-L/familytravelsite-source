# U05-B2b3c5 — original native lodging queue and cold recovery checkpoint

C5 client section 2 is locally qualified. This source commit follows `9b89a0ab858c161e833c2d8b605fc769991d538d` on `codex/trek-v5.1.4-family-reconcile`. Sections 3–4, native Add/edit/removal/Trash UI and actual desktop/phone acceptance, remain pending in the same milestone. No current preview behavior is implied.

## Implemented ownership and recovery

The separate `family/native-stays/.../commands` queue stores the whole original outer envelope, including all inner stay/booking/arrival observations and original actor/session/source/operation identities. Generic flush and stale-syncing cleanup explicitly hold that namespace. Exact type-tagged row comparison preserves missing versus present-but-undefined metadata, unknown holds, status, attempts and timestamps. Corrupt, ambiguous, foreign, syncing or changed work remains retained rather than being reinterpreted or silently discarded.

A shared original-operation engine removes duplicate session mechanics while preserving the C4 stay-bundle codec, response/error dialect, selected-Trip checks and core-only service completion. Its existing unit regressions and a real SDK/RLS C4 case pass. The new native protocol uses only the already qualified schema-135 SDK commands and tagged native reads. It inspects the original outcome before retry, coalesces same-session submits, rejects mixed concurrent actions, preserves deliberate repeat identities and never allocates new IDs during recovery. Historical acknowledgements never become current content.

Native completion has an additional mandatory refresh boundary: a known committed operation stays in IndexedDB until a fresh complete native core and the supplied complete-refresh consumer both succeed. A missing consumer yields `native_stay_refresh_required` and retains the row. Failed core/ancillary refresh can reopen and retry reads without executing the stay again. Cancellation can settle undecided original work; fresh same-actor login can inspect/cancel but cannot submit under the old write session. Current permissions still come from SQL, not the local queue or a cached receipt.

Cold recovery pins the exact inspected metadata and original Family/person/source/layer/Trip. It does not require a previously published Trip or manufacture a cohort witness. Its route/view and opening store selection remain fenced; a later account/session/source/Trip/registry/view change retires the result. Multiple inspectors cooperate through the same exclusive queue lock and cannot both send/acknowledge the original.

## Required refresh lease

Ordinary planner reads still require no relevant pending work. Only the original native command's session, already holding the exclusive cross-tab queue lock, creates a short-lived refresh lease. It ignores exactly that unchanged owning row, rejects any other relevant work or staged imports, fingerprints native/cache rows and preserves the original read session. The queue row cannot disappear/change during the lease. Closed leases cannot be reused. The completed-row case uses the ordinary no-pending-work fingerprint without an exemption.

The engine passes this guard to `confirmCurrent(current, guard)`. The consumer must thread it through the complete read/cache/native pipeline so there is no nested shared-lock request behind its own exclusive lock. The real qualification exercises the actual coherent producer with this inherited guard, a real signed SDK native core, representative validated ancillary fixtures and a complete v4 cache commit while the original queue row still exists. The row is acknowledged only afterward. This is not acceptance of the eventual native cohort/store publication or real ancillary application loaders.

The recovery facade recognizes this new protocol only with the exact loopback `local-native-v1` qualification at `http://127.0.0.1:57171`. That mode also permits the existing coherent read rehearsal at that address. It does not enable the old existing-stay writer there, any native Add/removal control or a hosted/default feature. Prior local C4 gates remain exact.

## Actual qualification

- 1,090 client regressions in 38 files pass, including unchanged stay/bundle/native/queue consumers and new retention, simultaneous cold-inspector, metadata, session retirement, read-lease and qualification cases.
- Eleven enabled actual installed SDK/PostgREST/RLS/IndexedDB-adapter cases pass: full refresh before acknowledgement, offline close/reopen plus generic flush hold, genuinely lost committed reply, durable failed ancillary refresh, cold fresh-login cancellation and committed recovery, deliberate repeats, no-op save/Trash/restore preserving identities and bookings, unchanged C4 dialect, real source switch and present-undefined metadata change.
- Auth identity/session/factor rows are synthetic and IndexedDB uses the test adapter. This is not GoTrue, actual browser storage, native form or native UI acceptance. Ancillary scenarios are representative validated fixtures; the native core and command outcomes are real SQL/RLS responses. No fabricated passing statuses or weakened protections are used.
- Client types, scoped zero-added lint, 99 source guards, 23 isolation refusals, seven unchanged quality gates, the final local build/secret scan and generated JavaScript syntax/descriptor checks pass. Three preexisting source/native/history adoption holds remain at 5.1.2. Existing backend code/contracts and canonical135/314 sources are unchanged.
- Original row/source/evidence/index/native-layout preservation is recorded in the final seal. The explicitly requalified retained schema-135 candidate's services are stopped after qualification, volumes and latest restart receipt retained, prior services unchanged. No original backup/media/ignored ETL is accessed.

## Next: finish the same C5 native milestone

Continue sections 3–4 of the client packet. Supply the production-quality complete-refresh callback from the real `PlannerCohortReads`/coherent bundle path, passing the inherited original-command guard throughout. **Do not call ordinary `hydrate` from inside this callback without threading the supplied guard: that path takes a new shared queue lock and would wait behind the command's exclusive lock. Do not clear the original queue first to make hydration work.** Add an explicit original-command hydration entry point if needed, with normal owner/generation/permission/paired-publication checks and rollback/withdrawal on retirement.

Connect desktop/phone native create/edit/Trash/restore/keepStop and reachable cross-device confirmed-Trash discovery together, using the original published empty/nonempty cohort witness and actual saved lodging UUIDs. The present recovery facade intentionally supplies no complete native UI refresher yet, so committed work cannot be settled by a fake empty callback from default app wiring. Section3 must install the real guarded consumer and qualify it before activation. Keep ordinary generic visit/day operations compatible with owned-arrival restrictions. Resolve the remaining native clock/calendar/eligibility contracts without altering protected upstream layouts or inventing observations.

Then prove actual generated desktop/phone flows, complete ancillary/native/cache publication, restored original identities and zero catalog transformation attempts before enabling native controls. Source adoption, release/preview acceptance, hosted migrations and independent database-plus-files recovery remain separate existing gates.

No schema, hosted settings/billing, preview/production/main/push/publication, dependency/source-pin, native layout/style, backfill/sync or transformation change. The mutation queue itself has only the single new protocol-hold line; its original formatting and all unrelated behavior are preserved.

[Continue sections3–4 of the same native stay client packet](trek-5.1.4-native-stay-client-packet.md).
