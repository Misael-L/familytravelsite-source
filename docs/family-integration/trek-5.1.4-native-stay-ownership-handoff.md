# U05-B2b3c5 — native ownership and current Direct-permission repair

Status: local repair/acceptance checkpoint, 14 November 2026, parent `145ddc450a2f6423a0a5d15b4863b0aec540d212`. Continue C5 acceptance. This is not completion of real Auth/PWA qualification, normal activation or a hosted release.

## Demonstrated defect and scoped repair

A real synthetic child actor had current `trip.schedule.manage=direct` and `trip.reservations.manage=direct`, while whole-Trip `can_mutate=false`. The database correctly admitted its domain actions, but the combined adapter and shared Lodgings/Trash control additionally required `canEditPublished`, a whole-Trip authority bit. The UI therefore hid an explicitly granted feature.

`nativeStayControlsAllowed` now uses the current published per-domain Direct outcomes rather than that unrelated bit. The shared management control uses the same admission helper. Creation still requires both scheduling and reservation Direct authority; lifecycle requires scheduling Direct. Read-only, stale/unsupported controllers, Draft, Propose, Deny, source/disposal/session fences, exact original observations and SQL authorization remain enforced. No grant, RLS, database function, capability map or protected native layout was changed. The real child browser creates a lodging with no whole-Trip mutation privilege, and a Direct-to-Propose change while preparation is waiting refuses before retention/execution. Fresh reads withdraw controls; restoring only the synthetic policy permits a fresh view without reviving an old command.

Two old live suites also tried to install a manual factory after the newer cohort automatically installed a combined writer. Their setups now temporarily disable combined auto-install while installing their manual factory, then restore the qualification flag before actions. The one-writer runtime rule, exact original fixture path pins and all existing delayed assertions remain intact. The copied local runner adapts only the explicitly owned fixture path and relative import resolution; it does not broaden tracked fixture pins.

## Actual final-artifact acceptance

**13 distinct browser checkpoints pass on the final generated artifact.** Seven cover unsafe desktop day reorder/delete, safe desktop rename/append, phone rename, phone Clear day refusal with both an independent visit and lodging-owned arrival, and successful removal of that independent visit while preserving the owned arrival exactly. Ordinary native layouts are used. The native UI represents owned arrivals as lodging chips, rather than exposing duplicate generic stop rows; generic guard placement/clock cases are also covered by the existing regression suite and inherited SQL constraints.

Two cases hold a genuinely committed HTTP reply, close the native editor and leave the Trip through its actual Back control. The late reply does not publish into the new route, and the original whole command remains in real IndexedDB. Returning to the Trip checks the historical outcome and refreshes/acknowledges it without executing or allocating another stay/arrival. Four cases cover the real non-admin Direct save and delayed policy refusal/withdrawal/re-admission described above.

Date extension separately requires Direct `trip.metadata.edit` because it changes the Trip bounds. A schedule-only child was correctly refused. The final append fixture grants metadata Direct explicitly while retaining `can_mutate=false`; no rule was relaxed. Browser driver corrections addressed a modal blocking Back, a toggled day panel, early reload before queue acknowledgement, and receipt-file naming. Interrupted committed originals were finished through the actual historical recovery UI, never deleted or rewritten. Repeated corrected runs are not counted as new behaviors. Final passive browser-origin inspection proves zero pending work across all owned profiles.

The final entry is `/assets/index-BlaQxPIo.js`, SHA256 `b238972ea4daa3a74c5b60b5e92de781d5cd9645d29e27f9d47bd229313ab885`. Formatting changed chunk ordering, so the 13 cases were replayed directly on this final artifact rather than assuming byte parity. External origins and `/render/image/` are blocked before network; the accepted final receipts have zero transformation attempts and uncaught page errors. No media bytes were loaded this turn; stored-variant decoding proof is inherited.

## Validation, preservation and limits

- 1,268 client cases in 44 files pass, including a rendered non-admin management-control regression and existing refusal/one-writer cases. The earlier 71-case focused run is a subset, not an additional count.
- Eight actual installed-SDK/PostgREST/RLS delayed source, permission, disposal and layer cases pass on the repaired sources. Their other 43 filtered cases are skipped, not counted as passing. Source URL changes use the provider seam because the generated URL is fixed at build time; no browser source-switch setting was invented.
- Typecheck and zero-added five-file scoped lint pass. Unchanged carryover, 99 source guards and seven quality gates pass, including formatting without baseline expansion. Three pre-existing source-adoption release guards remain held. Both builds scan clean with only the synthetic public anon key, and both 405-file JavaScript syntax/descriptor checks pass.
- Canonical remains136 migrations/317 migration-and-test sources; mixed index, all324,419 original rows/240 COPY projections,98original NULL-owned visits,612old routine bodies/owners/ACLs,2private calendar bodies,12protected native5.1.4layouts,104prior seals/7,633members, unscoped website sources and oldclean5.1.2 checkout remain preserved. No schema migration, dependency, qualification flag or source-adoption pin was changed.

Browser profiles use desktop/phone viewports, not physical devices. Auth uses signed synthetic local users/session/MFA metadata and fixture Auth/user with actual PostgREST/RLS; it does not prove GoTrue login/refresh or gateway authentication. Service workers were blocked. Ordinary/hosted lodging controls remain gated. Independent complete database-plus-file recovery remains unproved.

Private stage: `/private/tmp/trek-u05b2b3c5-ownership-20261114`. Accepted schema136 fixture: `/private/tmp/trek-u05b2b3c5-controls-20261114/rehearsal`. Requalify only this stage's newest `owned-fixture-stop.json` before reuse; validate exact IDs/images/nonce/stopped metadata/readiness and unrelated service states. Only the owned relay and exact local pair were stopped; volumes/profiles and99other container states are retained. Fresh synthetic expiry and empty-active-stay Trips are required for first Add. Do not adopt the superseded schema135 reproduction fixture or clear retained work.

Sanitized evidence and exact reviewed sources are sealed in `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/evidence/u05b2b3c5-native-stay-ownership-2026-11-14`. Canonical planning/evidence remains outside its mixed index. Website work is a scoped local commit; nothing was pushed or deployed.

## Exact next

Qualify real GoTrue/AAL2 sign-in/refresh/session retirement and the generated App's service-worker/offline lifecycle in a separately owned local environment. Preserve the same original-command, current-domain permission and complete-publication rules. This local browser checkpoint does not replace those dependencies. Keep ordinary/hosted activation closed; complete the same C5 acceptance before the existing saved/shared/ancillary and release-readiness work. Existing second-precision/overnight/off-calendar records remain accurately refused by the limited native editor pending an expressive-editor decision.

No production/preview/main/push/publication, hosted settings/billing, schema/backfill/sync, original backup/media/ignored ETL or transformation-setting changes.

Continue [the same C5 packet](trek-5.1.4-native-stay-client-packet.md).
