# U05-B2b3c5 — real Auth and installed-PWA acceptance

Status: local C5 acceptance checkpoint,14 November 2026; parent `f655c4a07a273b09748e81fdafa8b336933a6ab3`. Ordinary/hosted lodging controls remain gated. No production or preview release.

## Demonstrated issue and repair

Real GoTrue token refresh exposed a bootstrap gap hidden by the earlier synthetic-session browser fixture. `TOKEN_REFRESHED` correctly cleared the old repository generation, but did not reacquire the visible planner. Domain controls disappeared. During a cold restart with a retained original, a later refresh could also retire the read/problem that should expose recovery, leaving a loading screen.

The Family bootstrap now captures an owned planner continuation before repository retirement. After actual Auth validation, it requests a new complete coherent read for the same current planner route. A published root uses hydration; an unpublished/cold native Trip uses the existing guarded loader. The original actor, source, owner/port, route, native Trip object, authentication gate and active installation must remain current. A published read also requires its captured private read session. A cold load takes its own freshly authorized read/session boundary; it does not treat an anonymous startup database as mutation authority. Draft, non-planner routes and superseded ownership do not manufacture publication. Existing queued work still blocks publication and exposes its original recovery surface. Nothing here executes, cancels, changes or acknowledges a queued command.

`continuePlannerAuthRefresh` keeps SDK-dependent work outside the Auth callback. A reported complete-read failure keeps its existing recovery UI; an unreported validation failure leaves Auth gated. Late callbacks cannot mark a replacement account/installation failed. Native layouts, SQL authorization, current per-domain Direct checks, original command bytes, qualification flags, dependencies and adoption pins are unchanged.

## Actual authority and PWA proof

The accepted local schema 136 candidate was positively requalified, read-only captured in full, then stopped again. A fresh nonce-labelled PostgreSQL 17.11/PostgREST 14.14 copy and cached GoTrue 2.192.0 run in their own network-none namespace with no published container ports or external network. The exact loopback relay is 57171. Real Auth uses the new copy's Unix socket with `search_path=auth`; its cleanup worker is disabled to preserve historical source records. All82existing Auth migration versions and the complete schema DDL/owners/ACLs remain exact. No regular Supabase stack was adopted or modified.

Synthetic users are created through real GoTrue admin API, then password sign-in and actual TOTP enrollment/challenge/verification issue AAL2. The tested Family actor is a non-admin child with explicit domain Direct grants, still `can_mutate=false`. No user access token, Auth session or verified MFA row is fabricated. Locally signed anon/admin fixture keys remain server/private as appropriate; only the synthetic public anon enters the build.

Eight installed-SDK checks cover real AAL1 refusal; real MFA/AAL2; refresh-token rotation retaining the session identity; original compound command execution after refresh plus duplicate-safe retry; actual local logout blocking its still-signed JWT; fresh login inspecting a historical commit while refusing replay/rebinding; cancellation of an unknown retired-session command; and outsider refusal/session cleanup.

The exact final generated artifact passes **22 profile-specific browser checkpoints:11 desktop and11 phone**. Each profile performs native password/MFA login; installed-worker control and exact final entry loading; actual automatic SDK refresh preserving AAL2/session identity and lodging authority; offline native Save retaining the original; worker reload offline; cold persistent-browser restart offline; reconnect/original retry producing one untimed arrival plus booking; shared-cache isolation/zero transformations; reachable confirmed Trash; restore of the same lodging/arrival IDs; and native App logout. No tokens are injected into browser storage, no service-worker interception substitutes authenticated responses, and generic replay does not execute the native command. Queue acknowledgement follows current complete publication.

All **five** profiles, including interrupted reproduction/harness profiles, finish with zero pending commands. The interrupted desktop original was recovered through its actual historical/retry UI, without deleting or rewriting its queue. A driver correction allowed the permission read to settle on the short-lived synthetic phone session; final proof uses the sealed artifact and validates its actual entry request. The first local setup corrected a missing Auth schema search path and a bounded relay location route/fixture permission; these were fixture issues, not database authorization changes.

The proxy covers service-worker-owned traffic and blocks external origins before any network. The relay exposes only bounded local Auth/PostgREST routes. There are no hosted Storage/media requests. Zero `/render/image/` attempts are required. These tests load manual synthetic lodging identities; prior ready-WebP decoding proof is inherited, not recounted. Viewports are desktop/phone Chrome, not physical devices.

## Validation and preservation

- Final-tree client regressions: **1,374 passed in50 files**, zero skipped/failed. The38-case final focused run is a subset, not additional cases.19cases specifically cover continuation capture, cold loading and delayed ownership/route/session/Auth refusals; the installed bootstrap tests prove retirement-before-validation-before-reacquisition.
- Client typecheck passes. All four scoped implementation/test files have zero ESLint errors or warnings; no baseline expansion. Backend source is unchanged.
- Carryover and 88 source-contract tests pass. Seven existing quality gates pass. The same three source-adoption release guards remain held; no qualification or adoption pin was changed.
- Qualified and ordinary web builds pass; each secret scan finds only the synthetic public anon JWT. Each 405-file JavaScript syntax scan and final entry descriptor check passes. The checkout's `client/dist` is left ordinary/unqualified.
-23existing local PostgreSQL/PostgREST isolation refusals and17new Auth image/namespace/volume/environment refusals pass. No hosted advisor or project setting operation was used.

The original324,419 rows across240 COPY projections remain exact, with multiplicity. The entire accepted schema 136 DDL hash, including function bodies/owners/ACLs, matches after removing only dump comments/tool headers and random dump restriction nonces. The existing 612 routine audit and2 private calendar-trigger checks also pass;98 original visits retain NULL ownership. No migration, grant or policy source was changed.

Canonical 136 migrations/317 migration-and-test sources, mixed index,17,075 original website tracked files except the scoped repair,12 exact upstream5.1.4layouts, old clean5.1.2checkout and105 prior seals/7,729 members are preserved. No baseline expansion, adoption repin or ignored ETL/backup/media access.

Private stage: `/private/tmp/trek-u05b2b3c5-auth-pwa-20261114`; new owned fixture: its `rehearsal` directory. The older accepted controls fixture is stopped under this stage's newer `owned-fixture-stop.json`. Do not requalify it from the earlier ownership-stage stop receipt. Use the newest stop metadata for each separately owned target; validate exact IDs/images/nonce/readiness and prior service states before reuse. All owned browser profiles and original commands must be closed/acknowledged before stopping the new services. Retain volumes and private profiles; do not delete queued originals.

Final qualified entry: `/assets/index-8wS88bXb.js`, 1,220,671bytes, SHA256`6291b81c9d047c283a1d170482e01d2db422487ff191820890f6ec90a9cefd5e`. It was copied before the ordinary build and both profile receipts request this exact entry. The generated descriptor matches its bytes/hash.

Only the owned relay and **three** newly created services were stopped; their two labelled volumes and private profiles remain. All **101** previously existing service states are exact. `auth-pwa-owned-stop.json` is the new target's stop receipt; `owned-fixture-stop.json` is the separately updated source-pair receipt. No containers/volumes were deleted during final cleanup. The first failed new Auth startup container was replaced locally before successful qualification; no source/regular service was removed.

Sanitized evidence and the exact reviewed source files are sealed under canonical `docs/backend-modernization/evidence/u05b2b3c5-native-stay-auth-pwa-2026-11-14`; canonical documentation/evidence remains outside its mixed index. The website receives only a scoped local commit. No push or deployment.

## Next

The real Auth/PWA dependency of C5 is now proved. Consolidated local acceptance includes the unchanged inherited creation/edit/keepStop/Trash/restore, clock-boundary, ownership and delayed permission/source/Trip proofs together with this final-artifact refresh/offline/session work. Overlapping historical reruns are not added to the current test totals. Next is the already planned stay saved/shared/ancillary read and permission-contract audit, followed by release readiness. Keep ordinary/hosted activation closed while the existing source-adoption release guards and broader release prerequisites remain held. This is a local candidate qualification, not deployment authorization or proof of every advanced TREK feature. Second-precision/overnight/off-calendar records retain explicit native-editor refusals pending an expressive-editor decision. Independent complete database-plus-file recovery and the incremental backup workflow remain separate outstanding work.

No production/preview/main/push/publication, hosted SQL/settings/billing, schema/backfill/sync, original backup/media/ignored ETL or image-transformation-setting change.
