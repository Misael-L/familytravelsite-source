# Current supported-core release prerequisites — Q22

**Parallel work queues, 18 November 2026:** [Coordinator/worker ownership and setup](parallel/README.md) now governs concurrent work. This original chat follows [Coordinator A](parallel/coordinator-queue.md); the second chat follows only [Worker B](parallel/worker-b-queue.md). Both start from Q126 application source. The coordinator reviews and integrates completed worker commits and records the combined checks.

**Private GitHub checkpoints — user clarification, 17 November 2026:** normal pushes of completed development checkpoints to the private integration branch are authorized and required for off-device source preservation. This supersedes historical packet-level “no push” wording for that purpose only. [Website checkpoint policy and required database-source scope](private-github-checkpoints.md). A source push does not authorize production/main promotion, public-mirror publication or deployment.

## Current release checkpoint

**21 November 2026 — original-origin recovery and conditional migration approval prepared.** The fallback at `6ef85890f` adds standalone recovery for both exact HTTPS origins. Both deployed service workers were replayed against the final package with synthetic drafts. All 220 focused checks passed. The archived Mac and X8 dumps, worklists and verification manifests match. The 67 migration files match the isolated replay byte for byte. The authorized window will establish live recovery access, confirm the write pause and verify a fresh X8 recovery point before schema changes. [Cutover approval and stop rules](preview-cutover-and-fallback.md#maintenance-window-and-conditional-approval)

**21 November 2026 — Cloudflare candidates built locally.** The preview writer, production writer and no-write fallback were built from `021be9846`. All three passed artifact checks and Cloudflare dry runs. The read-only Supabase check observed 88 applied migrations and PostgreSQL 17.12. The signed-in hosted preview and switch to the fallback await an authorized window. Complete the detached-draft handover plan and confirm fresh protection before requesting migration approval. [Candidate checks and scope](supported-core-readiness/recheck-20261121-schema154/cloudflare-candidates.json)

**21 November 2026 — production path selected.** The owner declined a second hosted Supabase project and the associated cost. The completed local migration and recovery rehearsals supply pre-release database evidence. Cloudflare can preview the website build and public delivery. Both existing sites use the primary Supabase project, so live write admission and the signed-in save check belong to a separately authorized production window. [Rollout decision](preview-cutover-and-fallback.md#production-path-without-hosted-staging)

**21 November 2026 — detached browser drafts exported in the local transition rehearsal.** Both deployed service-worker versions served the cached app for the recovery URL when replayed locally. A normal service-worker update then served the standalone recovery document on the same synthetic origin. The export matched the selected legacy draft and file bytes and left all original databases intact. The ordinary control build excluded the recovery utility. All 103 focused regressions pass. A hosted route on each affected origin still needs qualification. [Draft recovery and rollout scope](preview-cutover-and-fallback.md#detached-browser-draft-recovery) · [Evidence](supported-core-readiness/recheck-20261121-schema154/detached-browser-draft-recovery.json)

**21 November 2026 — managed write-pause layers rehearsed locally.** The non-superuser database role paused new export work, drained one previously claimed export and restored the admission controls. Storage policy checks protected existing bytes and refused fresh client uploads. Pre-issued signed uploads and trusted service writes remained possible, so the runbook accounts for them separately. The local REST stop also left direct SQL available. Confirm hosted coverage at the start of the approved maintenance window before the first migration. [Pause sequence and results](preview-cutover-and-fallback.md#layered-write-pause-rehearsal)

**21 November 2026 — all pending migrations pass with modeled managed permissions.** Backend checkpoint `c14ba0a` scopes the unapplied privilege migration to the `postgres` role that owns Family application tables. Current tables and newly created application tables passed the ACL checks. Supabase's internal defaults were preserved. The full 67-version sequence reached schema 155 on a fresh X8 restore, preserving all 296,764 archived rows and all 88 historical ledger entries. [Exact migration set and test results](supported-core-readiness/recheck-20261121-schema154/managed-role-migration-replay.json)

The locally modeled role still cannot register the tested REST pause. Prepare the managed pause procedure before scheduling, then verify the pause across the affected write routes before applying any migration. [Cutover runbook](preview-cutover-and-fallback.md#managed-role-reconciliation)

**21 November 2026 — shared hosted backend confirmed and managed-role migration blocker identified.** Both live sites use the primary Supabase database. Hosted has 88 applied migrations. With the observed Storage policy delegation, an isolated replay under the actual non-superuser role reached 40 of 67. Migration `20261112235203` was refused on defaults owned by the platform admin role and rolled back. Resolve that migration before scheduling the rollout. [Managed-role and route evidence](supported-core-readiness/recheck-20261121-schema154/hosted-route-coverage-and-role-replay.json) · [Hosted cutover notes](preview-cutover-and-fallback.md#hosted-route-and-migration-preflight)

**21 November 2026 — local write pause and schema 155 fallback rehearsed.** All 67 pinned migrations replayed with the REST pause active and all 296,764 archived rows survived. An in-flight legacy edit finished once while new mutations were refused. After the change, the nine old write paths stayed blocked. The replacement task and packing receipts remained readable during the pause, and exact retries produced no duplicates. The source-bound fixture build passed the signed-in fallback check. The real HTTPS preview and managed write-pause coverage still need qualification. [Cutover runbook](preview-cutover-and-fallback.md) · [Rehearsal results](supported-core-readiness/recheck-20261121-schema154/preview-write-pause-and-fallback.json)

**21 November 2026 — hosted PostgreSQL 17.12 and live Worker sources verified.** The Supabase project is active and healthy on `17.12.0.000`. The three live timezone checks passed. All 88 applied migration records and their SQL fingerprints match the X8 archive. The checked identity fields for all 77,038 Storage objects also match. The 67 schema migrations remain pending.

Both deployed sites use older task and packing writers that schema 155 refused in the isolated rehearsal. The next packet prepares the coordinated integration-preview cutover and a fallback that works with schema 155. [Hosted verification and source binding](supported-core-readiness/recheck-20261121-schema154/hosted-postgres1712-and-worker-binding.json)

**21 November 2026 — different-release handover and PostgreSQL 17.12 pass locally.** Two different source-bound builds and service workers preserved a task across a lost reply and a real update. An old-format draft remained safely exportable from its active Family database. At that checkpoint, the dashboard offered `17.12.0.000` from `17.6.1.141`. The exact offered image passed schema replay, the timezone guard and a signed-in phone day assignment before the hosted upgrade. [Handover and engine verification](supported-core-readiness/recheck-20261121-schema154/website-handover-and-postgres1712.json)

**21 November 2026 — combined fixture writer passes.** One source-bound website build supports task, planner and base packing writes against the same isolated schema 155. The actual desktop and phone-width browsers used local password and TOTP sessions. All 734 focused tests and the source checks pass. The phone selected-day place passed on PostgreSQL 17.11 and the same date-only flow was refused by the existing timezone guard on 17.6. [Combined writer evidence](supported-core-readiness/recheck-20261121-schema154/combined-writer-qualification.json)

**21 November 2026 — writer cutover rehearsed locally.** Both replacement APIs passed on the same isolated schema 155 Trip, including a committed receipt from a new connection, exact retry, conflict on changed intent and Trash/restore of the same ID. Both isolated website builds and 707 focused tests pass. The task build and the planner/packing build each refuse the other's writes and receipt readers. The hosted rollout stays on hold for a single qualified replacement writer and a verified handover. [Rehearsal results](supported-core-readiness/recheck-20261121-schema154/writer-cutover-rehearsal.json)

**21 November 2026 — schema 155 qualified locally.** Backend commit `b79933b` adds `20261121184611`. It removes inherited anonymous Vacay table access and the extra authenticated calendar-entry update grant. It also adds the missing index for the Collections authoring context's command foreign key. The same checked RLS policies and other compared grants remain intact.

On a fresh isolated X8 restore, the 66 pinned migrations reached schema 154 before the new correction. Three exact contracts failed before the change and passed afterward. An injected failure rolled back the index, grant changes and ledger entry. All 296,764 original rows and all 154 prior ledger entries match. The private backend checkpoint includes the migration and a lasting index assertion. [Schema 155 result](supported-core-readiness/recheck-20261121-schema154/schema155-additive-qualification.json)

Relative to the last read-only hosted observation of 88 versions, the candidate now has 67 pending migrations. The legacy task and packing writers remain blocked by the intended new grant model. The timed-write guard remains tied to the hosted engine decision. No hosted migration or deployment ran.

**21 November 2026 — the 66 pending migrations replayed on an isolated X8 restore. Release remains on hold.** The new PostgreSQL 17.6 candidate passed 34 target guard challenges and an injected rollback of the first migration, its ledger row and temporary local role elevation. The final ledger contains all 154 versions. All 296,764 source rows across 200 original projections survived exactly, including all Storage metadata and the 88 historical migration records. [Rehearsal evidence](supported-core-readiness/recheck-20261121-schema154/schema154-upgrade-rehearsal.json)

The older website sources still use direct task and packing writes and three packing setup/template RPCs. Nine database probes returned insufficient privilege after the upgrade. A synthetic current-session fixture saved a task and packing item through the replacement commands and retried both operations without duplicates. The live Worker source is still unbound to those older source checkpoints. Verify the actual deployed writer and replacement together before releasing the new grants.

Both Vacay tables retain inherited anonymous CRUD grants, and calendar entries retain an extra authenticated update grant. Their RLS behavior passed independently. The exact inspected day toggle uses select, insert and delete. A narrow temporary revoke made both original grant and role-behavior tests pass after rollback-only setup. A single leading index on the Collections authoring-context foreign key also passed rollback-only checks against the current Collection contracts. The index and revoke were test proposals. Canonical migrations are unchanged.

The timed-visit guard correctly refused the restored 17.6 engine. The rehearsal used the standalone executor's local role capabilities and did not qualify the hosted execution role, hosted engine change or signed-in deployment.

**21 November 2026 — hosted read-only check.** The hosted ledger lists 88 versions. The recorded statement counts and fingerprints match the archived X8 generation for all 88. The backend checkpoint `3e7087e0a` has 154 migration files. The [exact 66 pending versions and file hashes](supported-core-readiness/recheck-20261121-schema154/migration-delta.json) run from Journey entry recovery through the Vacay calendar-entry grant and same-Family insert policy. The historical ownership entry at `20260714000000` retains its archived name and SQL.

The catalog contains 112 of 236 scoped RPC names. The counts include advanced features outside the first preview. The native planner view and creation, task, base-packing, Collections and account display-preference contracts are absent. Existing bootstrap, media variants and Journey reads are present. The checked planner/packing and task profiles each retain six shared RPCs. Neither Vacay table lacks basic authenticated SQL privileges on hosted. Both have RLS and broad legacy anonymous ACLs. The pending same-Family insert policy is absent. Signed-in Data API behavior still needs separate acceptance. [Catalog and engine evidence](supported-core-readiness/recheck-20261121-schema154/read-only-observation.json)

The project runs Supabase Postgres `17.6.1.141`. Live literal probes reproduced the documented one-hour mismatch in Casablanca, Edmonton and Vancouver compared with the qualified local build. Keep the existing timing guard until the engine decision and dependent checks are complete.

The next implementation packet is an isolated rehearsal of the exact 66-version upgrade against the restored baseline. Include hosted grant differences and preservation of the legacy writers. The hosted database and deployment were unchanged by this inspection.

**21 November 2026 — independent recovery verified locally.** The encrypted X8 supplied the database, Storage metadata and all 77,038 media files. The restored database matched 296,764 rows across 200 archived projections. The file restore matched every SHA-256 across five buckets. A local Storage API probe downloaded 17 representative objects, matched their bytes and content types, and refused public access to 11 private objects. [Recovery rehearsal](parallel/coordinator-queue.md#independent-x8-database-and-media-recovery)

The preview remains on hold for current hosted schema, API, engine and writer-profile verification, an isolated rehearsal of the confirmed migration set, and preview acceptance against the matching deployment.

**21 November 2026 — supported-core readiness recheck. The hosted preview remains on hold.** Reviewed website `e075bda18`, the source-bound app build `e0f39d74a` and shared backend `3e7087e0a`. The new website changes in this review are documentation only. The four source guards and the unchanged duplication check pass at zero copied lines. The 194 focused tests cover local writer profiles, source ownership and release observation. The earlier candidate build and its 10,120-test receipt remain the application evidence.

The check-only source archive initially refused one official documentation link in a historical lodging note. The note now omits that external link. Scanner policy and runtime source stay unchanged. A check-only archive can verify retained source bytes without a Worker version or hosted preview deployment.

The 20 November database archive, Storage worklist and verified-object manifest match their recorded hashes. The prior local restore verified 296,764 rows and sampled 17 media files. At the recheck, the off-device recovery rehearsal and Storage service probe were still open. The archived ledger contains 88 versions present in the 154-file backend checkpoint, with 87 exact version/name matches and the one already-reconciled historical ownership label. The other 66 source versions are absent from this snapshot. This is a dated snapshot comparison. A fresh authorized hosted ledger, API/permission and engine check still determines the release delta.

Review the confirmed migration set on an isolated copy before the hosted change. Keep the local writer profiles scoped until the intended release source is qualified. Once recovery and compatibility are proved, qualify the specific integration preview and its matching source and rollback target before any production decision.

On 20 November 2026, the private branch review at 74e195878 reproduced two failures in the workflow that feeds ci-ok. Duplication flagged 4,020 lines across 98 files. Formatting found 37 unlisted files and zero stale baseline entries. The page pattern, desktop/phone pairs and test skip checks passed.

Commit a59b80eb8 formats the 37 flagged files. The existing 2,134-entry formatting baseline stays intact and the full formatting check passes. Normalized emitted JavaScript and significant source directives match for every touched file. The 2,072 tests across 82 client files, the qualified build at e85a42c72, typecheck and all four source checks pass. The branch uses the same 463-diagnostic strict allowance. [Coordinator handoff](parallel/coordinator-queue.md#supported-core-release-blocker-recheck)

Commit `81aa72830` completes the copied Admin Plugins retirement. The qualified build at `a58c3616b` and all 2,393 regression cases pass. The current duplication scan flags 3,266 lines across 94 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#copied-admin-plugins-retirement)

Commit `a6436b161` applies the shared offline blob-cache budget. The source-bound build at `60e717e91` and all 2,615 regressions pass. The current duplication gate flags 3,240 lines across 94 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-offline-blob-cache-budget)

Commit `837485932` applies the shared category icon catalog. The source-bound build at `4d556c97f` and all 2,796 cases pass. The duplication gate now flags 3,118 lines across 92 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-category-icon-catalog)

Commit `fb637f22d` applies the shared CustomSelect repair. The source-bound build at `f2938b1a0` and all 3,203 cases pass. Duplication now flags 3,004 lines across 90 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-custom-select-repair)

Commit `20d1960ad` applies the shared browser offline base schema. The source-bound build at `d545750c4` and all 3,280 tests pass. Duplication now flags 2,920 lines across 90 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-offline-base-schema)

Commit `a7ab203a5` applies the shared retained packing command sessions. The source-bound build at `0be4797c5` and 3,882 regression tests pass. Duplication now flags 2,562 lines across 86 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-retained-packing-command-sessions)

Commit `76a341520` applies the shared packing request handlers. The source-bound build at `f692cd559` and 3,963 regression tests pass. Duplication now flags 2,229 lines across 81 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-qualified-packing-request-handlers)

Commit `8078412c6` applies the shared packing category snapshot lifecycle. The source-bound build at `eab88ab17` and 4,064 regression tests pass. Duplication now flags 2,120 lines across 79 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-packing-category-snapshot-lifecycle)

Commit `17dd92961` applies the shared planner original sessions. Both source-bound builds and all 4,241 regression tests pass. Duplication now flags 2,005 lines across 77 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-planner-original-sessions)

Commit `6bfd5125f` applies the shared planner recovery checks. Both source-bound builds and all 4,343 regression tests pass. Duplication now flags 1,871 lines across 74 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-planner-recovery-checks)

Commit `6a7c10394` applies the shared arrangement and edit queues. Both source-bound builds and all 4,418 regression tests pass. Duplication now flags 1,789 lines across 73 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-planner-intent-queue)

Commit `51a7d2ec3` applies the shared retained row constructor. Both source-bound builds and all 4,481 regression tests pass. Duplication now flags 1,753 lines across 71 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-retained-planner-row)

Commit `c2e2c94df` applies shared packing command ownership checks. Both local builds and all 4,481 regressions pass. Duplication now flags 1,674 lines across 71 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-packing-command-context)

Commit `f57705404` removes the two disconnected Family offline banner and OAuth consent page copies. The active files remain in the build. Both builds and all 4,565 regressions pass. Duplication now flags 1,583 lines across 68 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#disconnected-offline-banner-and-oauth-consent)

Commit `0297ecb5c` shares the offline database proxy forwarding used by the native and retained clients. Both builds and 4,699 regressions pass. Duplication now flags 1,548 lines across 68 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-offline-database-proxy)

Commit `374648b6d` scopes Family Admin permission responses to the current account. All 4,732 client tests, six adapter tests and the source-bound build pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#family-admin-permissions-session-repair)

Commit `9626b2b25` retires the copied instance-permissions fallback after verifying the desktop, phone and Family routes. All 4,737 combined client tests pass. Duplication now flags 1,447 lines across 66 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#copied-admin-permissions-fallback-retired)

Commit `3ff11b8b5` retires the copied Admin backup panel and prevents known managed installs from mounting it through the standalone backup shortcut. Both standalone layouts retain their tested schedule reads and saves. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#copied-admin-backup-panel-retired)

Commit `3fbc3d60c` retires the copied Admin MCP access panel. The standalone desktop and phone workflows and Family route visibility pass their fixtures. Both local builds and 4,858 combined client tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#copied-admin-mcp-access-panel-retired)

Commit `a8350ea69` retires the copied Admin GitHub panel. Both standalone layouts retain their verified release history and pagination. Both builds and 4,913 combined client tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#copied-admin-github-panel-retired)

Commit `1a037aac1` retires the copied Admin Add-ons manager and its dedicated settings reads. Both standalone layouts pass their save-and-reload checks and Family retains its Features entry. Both builds and 5,009 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#copied-admin-add-ons-manager-retired)

Commit `3cace8a02` guards developer notification bookmarks and retires the copied Family panel. Both builds and 5,058 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#developer-notifications-bookmark-guard-and-family-copy-retirement)

Commit `26d510bdf` scopes the Family audit reader to the current session and filters and retires the copied instance panel. Both builds and 5,096 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#family-audit-session-repair-and-copied-instance-panel-retirement)

Commit `71fbfe339` retires the copied update and Demo Baseline controls. Both builds and 5,140 regression tests pass, including standalone update instructions and synthetic baseline saves. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#copied-admin-update-and-demo-baseline-controls-retired)

Commit `70aaf3e3a` removes the copied Family JWT rotation dialog and fixes the native managed controls. Both builds and 5,187 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#managed-jwt-rotation-guard-and-family-confirmation-retirement)

Commit `154656290` removes the copied instance OIDC read and guards Family identity results against prior sessions. Both builds and 5,196 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#family-oidc-reader-retirement-and-identity-session-repair)

Commit `e475217dc` removes the copied instance API-key read and protects Family Maps from late responses after access changes. Both builds and 5,205 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#copied-admin-api-key-reader-retirement-and-family-maps-session-repair)

Commit `8ec2d07ac` removes the copied instance SMTP and WebAuthn reader and aligns standalone managed SMTP visibility and dispatch. Both builds and 5,251 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#copied-admin-smtp-reader-retirement-and-managed-relay-guard)

Commit `6861c42b7` protects Family notification defaults reads, saves and feedback after access changes. Both builds and 5,254 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#family-notification-defaults-session-protection)

Commit `3450b520e` protects Family preference defaults reads, saves and feedback after access changes. Both builds and 5,259 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#family-preference-defaults-session-protection)

Commit `2ca01afc1` protects Family feature controls, product rollout history and save feedback after access changes. Both builds and 5,269 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#family-feature-controls-session-protection)

Commit `75243c7e9` protects Family place-category reads, drafts, confirmations and write feedback after access changes. Both builds and 5,299 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#family-place-categories-session-protection)

Commit `f1d921fd5` protects Family packing-template reads, drafts, confirmations and write feedback after access changes. Both builds and 5,307 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#family-packing-templates-session-protection)

Commit `e1395dea3` protects Family member lists, access requests, statistics and their actions after access changes. Both builds and 5,317 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#family-member-administration-session-protection)

Commit `501789314` protects Family export jobs, request feedback and browser download delivery after access changes. Both builds and 5,344 regression tests pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#family-data-export-session-protection)

Commit `731ba2389` shares packing terminal proof validation. Both builds and 5,545 regression tests pass. The duplication gate remains open with 1,198 copied lines across 58 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-packing-terminal-proof-validation)

Commit `5acf81b9d` shares the packing RPC refusal mapping. Both builds and 5,902 regression tests pass. The duplication gate remains open with 1,136 copied lines across 55 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-packing-rpc-refusal-mapping)

Commit `4b8db1353` fixes the packing group fallback and shares the category and group refusal lookup. Both builds and 6,036 regression tests pass. The duplication gate remains open with 1,102 copied lines across 53 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#packing-category-and-group-refusal-handling)

Commit `aeb08b007` shares queued-row selection and ownership checks for planner arrangement and edit recovery. Both builds and 6,071 regression tests pass. The duplication gate remains open with 1,078 copied lines across 51 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-planner-original-recovery-inspection)

Commit `a423c170d` shares completion checks for import and stay actions. Both builds and 6,196 regression tests pass. The duplication gate remains open with 1,026 copied lines across 49 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-import-and-stay-action-checks)

The browser-language audit verified both supported language lists and preserved the interface-specific preference behavior. All 167 focused checks pass. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#native-and-family-browser-language-detection)

Commit `ab5cf94eb` shares saved-place and scheduled-visit form session checks and closes an asynchronous cancellation gap. The local build and 6,248 regression tests pass. The duplication gate remains open with 1,002 copied lines across 47 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-saved-place-and-scheduled-visit-form-session-checks)

Commit `3b124a10f` shares task and packing read scope and prevents follow-up requests after cancellation. The local build and 6,417 regression tests pass. The duplication gate remains open with 964 copied lines across 45 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-task-and-packing-planner-read-session-checks)

Commit `d35b0320b` shares lodging request refusal handling and preserves each adapter's contract. The local build and 6,732 regression tests pass. The duplication gate remains open with 918 copied lines across 43 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-lodging-request-refusal-mapping)

Commit `d235684b9` shares the original sign-in and Family actor checks for lodging commands. The local build and 6,778 regression tests pass. The duplication gate remains open with 870 copied lines across 41 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-lodging-command-session-checks)

Commit `5d2a2db9d` shares packing submission and receipt recovery and preserves newer queue entries. The local build and 6,815 regression tests pass. The duplication gate remains open with 818 copied lines across 39 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#exact-queue-settlement-for-packing-commands)

Commit `af9f740f5` binds native packing saves and archive replacements to the original queued row before dispatch. The local build and 6,861 regression tests pass. The duplication gate remains open with 818 copied lines across 39 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#original-queue-snapshots-for-native-packing-saves-and-archive-replacements)

Commit `7948a6af9` protects queued work during packing and lodging retention. The local build and 6,881 regression tests pass. The duplication gate remains open with 788 copied lines across 37 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-competing-trip-queue-checks-for-packing-and-lodging)

Commit `d0533d8ef` protects the lodging retry record when a queued Trip edit arrives during confirmation. The local build and 6,885 regression tests pass. The duplication gate remains open with 788 copied lines across 37 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#queued-trip-work-during-lodging-confirmation-and-planner-reads)

Commit `d16703f0a` shares validation for the isolated HTTPS writer profiles. Both local builds and 6,973 regression tests pass. The duplication gate remains open with 766 copied lines across 35 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-https-writer-profile-validation)

Commit `7ddaea05b` shares booking type presentation and the Other fallback. The local build and 7,367 regression tests pass. The duplication gate remains open with 734 copied lines across 33 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-booking-type-presentation)

Commit `091da5752` uses the Axios multipart method on the legacy upload client. The local build and 7,547 regression tests pass. The duplication gate remains open with 697 copied lines across 31 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#legacy-multipart-upload-dispatch)

Commit `e790d49bf` shares itinerary leg expansion and preserves bookings with malformed segment lists. The local build and 7,796 regression tests pass. The duplication gate remains open with 653 copied lines across 29 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-itinerary-transport-leg-projection)

Commit `d71414d41` keeps booking details and search usable with malformed segments. The local build and 7,883 regression tests pass. The duplication gate remains open with 653 copied lines across 29 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#defensive-booking-segment-reads)

Commit `d71d2eb4b` shares browser language matching across the native and legacy catalogs. The local build and 8,084 regression tests pass. The duplication gate remains open with 601 copied lines across 28 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-browser-language-matching)

Commit `b24ef54eb` shares the Family locale loader table and corrects translation fallback. The local build and 8,093 regression tests pass. The duplication gate remains open with 551 copied lines across 26 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-family-translation-loaders-and-fallback)

Commit `a954de596` retires the unreferenced legacy planner row helper. The local build and 8,584 regression tests pass. The duplication gate remains open with 500 copied lines across 24 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#unused-legacy-planner-row-helper-retirement)

Commit `aeef40d1d` retires the unused legacy context menu. The local build and 8,707 regression tests pass. The duplication gate remains open with 467 copied lines across 22 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#unused-legacy-context-menu-retirement)

Commit `f36377ec3` retires the unreachable legacy plugin frame and its three callers. The local build and 8,991 regression tests pass. The duplication gate remains open with 424 copied lines across 20 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#unreachable-legacy-plugin-frame-retirement)

Commit `fded9885d` isolates calendar link state by account and feed and consolidates shared copy controls. The local build, 9,127 client regression tests and 12 backend calendar tests pass. The duplication gate remains open with 390 copied lines across 18 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#calendar-subscription-scope-and-copy-controls)

Commit `9dd49af48` aligns phone and desktop calendar subscription availability and feed selection. The local build, 9,212 client regression tests and 12 backend calendar tests pass. The duplication gate remains open with 390 copied lines across 18 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#phone-and-desktop-calendar-subscription-availability)

Commit `15e1c1376` shares the notice lifecycle, discards obsolete replies and cancels pending retries. The local build and 9,384 client regression tests pass. The duplication gate remains open with 354 copied lines across 16 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-system-notice-lifecycle)

Commit `3ac7ef5e5` retires the unused Atlas country search and fixes stale results and keyboard selection. The local build and 9,489 client regression tests pass. The duplication gate remains open with 315 copied lines across 14 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#atlas-country-search-cleanup-and-query-handling)

Commit `e26fff513` retires the unused join page and scopes invite responses to the original account and route. The local build and 9,593 client regression tests pass. The duplication gate remains open with 288 copied lines across 12 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#trip-invite-lifecycle-and-legacy-cleanup)

Commit `f01cc72c9` closes the client ESLint release gate. The local build and 9,687 client regression tests pass. The duplication gate still reports 288 copied lines across 12 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#client-eslint-release-gate-verification)

Commit `3042e3718` removes the unused Family theme registry. The before-and-after builds and 9,781 client tests pass. The duplication gate reports 264 copied lines across 10 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#unused-family-theme-registry-removal)

Commit `6b274630e` shares currency formatting and preserves Family date and clock behavior. The local builds and 9,958 tests pass. The duplication gate reports 210 copied lines across 8 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-native-and-family-currency-formatting)

Commit `edea4dfb1` shares Family category ordering across the optimistic and realtime paths. The local build and 10,071 regression tests pass. The duplication gate reports 177 copied lines across 6 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-family-budget-category-ordering)

Commit `29b08fa96` removes the unused Family trip loader. The local build and 10,092 regression tests pass. The duplication gate reports 149 copied lines across 4 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#disconnected-family-trip-loader-removal)

Commit `ee75cae41` shares password and MFA completion after the existing session checks. The local build, ESLint gate and 10,092 regression tests pass. The duplication gate reports 113 copied lines across 3 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-password-and-mfa-sign-in-completion)

Commit `582d92867` shares bulk cache writes and preserves database selection per store. The local build and 10,092 regression tests pass. The duplication gate reports 89 copied lines across 3 files. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-offline-cache-bulk-writes)

Commit `5a34fd862` shares offline table declarations and writer bindings. The local build and 10,092 tests pass. The duplication gate reports 22 copied lines in the Journey mapping module. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-offline-table-declarations-and-writer-bindings)

Commit `e957ab842` shares the Family Journey header mapping. The local build and 10,120 tests pass. The repository duplication check now reports zero copied lines across zero files with its existing rules and baseline. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#shared-journey-header-mapping)

**Next release prerequisite.** Rehearse the coordinated transition from the older task and packing writers to the new commands.

**Hosted prerequisites.** The current evidence is local. Preview rollout still requires the intended HTTPS writer profile, hosted schema and engine parity, current recoverable database and media protection, and signed-in acceptance of the matching preview and source. The 154-migration local foundation and the older hosted ledger observation are from different checkpoints. Use fresh authorized metadata and exact migration identities to determine the hosted delta. The 20 November generation is verified. Independent database-plus-files recovery still needs proof before hosted mutation.

**Historical checkpoint, 19 November 2026.** Family now preflights desktop and phone timeline gestures before an optimistic update or write. The accepted visit-only path and Undo passed through the installed Family adapter with canonical saved bookings and notes. The local source-bound build passed. [Coordinator queue](parallel/coordinator-queue.md#family-timeline-reorder-preflight).

**Historical checkpoint, 17 November 2026 — [Q91 application-handler decomposition](core-quality-application-qualification-handoff.md) passes locally.** The complete two-file boundary is applied: factory684→15 lines,callback678→9/complexity217→3; helpers20/120/5,formatted/unlisted996/344.244 unchanged regressions plus279 private cases pass before/after (523 checks each,98.02% branch coverage),2132 complete comparisons and15 lifecycle profiles/1228 tick-retirement schedules pass. Build/compiler/four guards/artifact controls pass with128 fixed declarations. Actual source3423/3419,complexity218/218 now closed,length134/130; four excess length findings and32 identical size failures keep G2 open. Next review: complete useGeolocation hook129/120. No feature/schema/API/hosted admission.

Historical baseline reviewed 15 November 2026 on `codex/trek-v5.1.4-family-reconcile`, from clean integration/publication HEAD `c5b6009b1a25c91d23213a214aaccc750f6d66b3`. This is the current release checklist. Earlier readiness documents and `core-schema144-acceptance.json` contain dated checkpoints, not current hosted measurements. Do not execute their historical next steps again.

**Decision: keep the preview release on hold.** Finish the supported-core website, not every TREK feature. The [available native Q26 subset](core-packing-https-edges-handoff.md) is accepted locally; next address G2’s actual repository-quality gate; Q23 task-only acceptance, Q24 preflight and Q25 local session repair are completed historical steps. Primary-project writer activation, hosted changes and deployment remain separate release steps.

Historical Q21/Q22 build checkpoint: Q21 accepted source was `c470128da2948739403253a40ebf18db226f8080`; Q22 did not rebuild or relabel it. The historical Q23b task-only build was `105860be6f7be44fa955bb6ae3eaa7c1e45478a0`; Q24 made no application build. Q26e later accepted native planner/base-packing browser cases at compiled source `35cb9d9ded343308b85fb47c6aebd143dc0349f6`. Q28 builds the source-only GL extraction at `a96f096d26e9b6a6a38fab05cb75d35575c2debe`, qualified against implementation `4dec8c6242dae922c5a55fcf3a9812f589c39eee`; it claims no new browser walk. The historical documentation-only reviews left application, native presentation, backend, migrations, permissions, public runtime configuration and qualification policies unchanged; later Q28/Q29 source changes have their own bound handoffs. Q22a corrects one test-only non-null assertion, with reviewed test/source commit `3875984f582efe6743c40100088553a6e845d9dd`. Only its existing test provenance row and qualification pointer advance. That commit is not a new application build.

## Closed locally; retain the evidence

- **TREK source adoption and parity:** full 5.1.4 provenance is adopted, with original history/backend carryover preserved. Q30 protects eleven upstream-byte-exact files plus the fixed Sidebar type-only derivation; all twelve native runtime/layout files stay protected. [S1](core-source-adoption-handoff.md), subsequent exact source rows and Q21 guards supersede the old 5.1.2 declaration failure. This proves source identity, not backend availability.
- **Public configuration and archive preparation:** [S2](core-public-config-handoff.md) and the [public configuration contract](public-client-config-contract.md) provide an independently checked source-bound receipt. Q21's correct-source scan passes; wrong/missing-source scans refuse. Its clean local publication checkout and check-only archive retain 17,416 of 17,417 tracked files; the sole omission is the declared private operational plan. Old hardcoded-preview-origin/private-plan scanner failures are repaired. No source was remotely published and no real Worker binding exists for this candidate.
- **Discovery and honest partial reads:** [typed catalog discovery](core-catalog-handoff.md) supplies real entity identity/coordinates and ready stored variants; [Atlas availability](core-atlas-availability-handoff.md) and [schema144 aggregate correction](core-travel-statistics-handoff.md) supersede earlier placeholder/count defects within their accepted local scope. Museum/grocery, unsupported Atlas layers and other explicitly unavailable functions remain unavailable. No new transformation or schema is needed just to repeat these completed repairs.
- **Functional preservation through Q21:** [Q21 acceptance](core-quality-reservation-time-guard-handoff.md) records 6,582 regressions, typecheck/build and 16 final local desktop/phone reader checkpoints. Its 12 original map crashes are fixed, valid/midnight arithmetic and previous map outputs are intact. These are local, scoped receipts, not 6,582 independent features or a hosted end-to-end release test.

## Open release gates and exact next actions

### G1 — supported writes on the intended HTTPS source: blocked

**Evidence:** [local core profile](core-local-profile.json), [original-command recovery](core-original-recovery-handoff.md), [HTTPS Collection reading](core-https-collection-handoff.md), and current `nativeSourceOwnership.ts` / `coreProfile.test.ts`. Q22 freshly passes 72 existing profile/ownership/Collection command tests. Q22a also preserves all 30 planner API test cases before/after. The ordinary unselected HTTPS profile installs no qualified native source owner; local writer/retained-work proofs use explicit loopback qualification. Successful image reads, a configuration receipt or setting a local marker cannot promote the HTTPS source into writer authority.

**Current local decision:** [Q26e](core-packing-https-edges-handoff.md) closes R07/R11/R12 at the measured available-native scope; no supported-cohort runtime repair was needed. Native Back retires the packing callback while the dashboard cards wait behind the held lease; subsequent B-route isolation and returning read-only Check are proved. This is not a direct warm card switch during that lease. Do not repeat completed packets. Ordinary/primary source admission and actual target-specific hosted activation remain blocked until their separate backend/protection/source-binding requirements are met. No new API/profile admission is authorized by the local subset result.

**Next:** qualify the integration-preview writer against its selected HTTPS origin and backend. Rehearse the write pause, handover and schema-compatible fallback before any hosted cutover. [Current sequence](#order-from-here)

Q27a supplies only the read-only creation receipt prerequisite. Its first semantic40001 prototype reproduced repeated PostgREST retries; the corrected reader returns PT409. A read-only inventory lists51 existing routines with custom40001 sites, preserved unchanged and not all dynamically reproduced. Verify and repair permanent-conflict behavior in the exact supported native command cohort before marking its conflict matrix accepted; do not mass-rewrite unrelated domains or change server settings. [Measured limits and next](core-native-plan-receipt-handoff.md).

### G2 — duplication check passes locally

The current check reports zero copied lines with the existing rules and baseline. [Journey verification](parallel/legacy-reservation-retirement-audit.md#shared-journey-header-mapping)

#### Historical duplication checkpoints

The workflow formatting check passes. Duplication reports 1,260 lines across 60 files after retiring the copied Admin Add-ons manager. The duplication gate remains open.

Q125 closed RTL and translation checks. Q126 moved the Collection sharing read to its online-only repository and preserved the existing session and view protections. PA-00 removed the one obsolete entry. The offline check now passes with 145 actual bypasses and 145 entries in the baseline.

All three Worker B test packets are integrated. PB-02 preserves the literal null in the existing route fixture, and PB-03 preserves the emitted coherent-cache test JavaScript. The strict check passes with 463 diagnostics against the same 463 total allowance. Each file is checked against its own allowance. The full duplication scan reports 13,046 copied lines across 215 files after the shared Family reservation detail sections.

The scan after `c6014bb9d` measured 8,606 copied lines across 178 files. Retiring the unused password recovery copies reduced duplication by 377 lines and produced byte-identical application bundles. [Verification and handoff](parallel/legacy-reservation-retirement-audit.md#unused-family-password-recovery-pages-retirement).

The [disconnected date picker cleanup](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-date-picker-removal) reported 7,711 copied lines across 174 files, 895 fewer than the preceding check. The [Transport retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-transport-editor-removal) reduced the count to 7,393 lines across 171 files. The [System Notice retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-system-notice-removal) reduced the count to 7,032 lines across 167 files. The [Photo Providers retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-photo-providers-removal) reduced the count to 6,719 lines across 165 files. The [Appearance Settings retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-appearance-settings-removal) reduced the count to 6,544 lines across 162 files. The [AirTrail settings retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-airtrail-connection-settings-removal) reduced the count to 6,412 lines across 160 files. The [legacy Notifications tab retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-personal-notifications-tab-removal) reduced the count to 6,232 lines across 158 files. The [legacy plugin settings retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-plugin-settings-removal) reduced the count to 6,150 lines across 154 files. The [legacy map settings retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-map-settings-removal) brought the count to 6,124 lines across 152 files. The [Family passkeys settings review](parallel/legacy-reservation-retirement-audit.md#family-passkeys-settings-boundary-and-legacy-review) reported 6,120 lines across 152 files. The [legacy Passkeys removal](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-passkeys-section-removal) brings the count to 6,040 lines across 150 files. This gate remains open.

The [Family map settings review](parallel/legacy-reservation-retirement-audit.md#family-map-settings-persistence-review) reproduced a provider save that reports success without persisting the choice. The [local cutover](parallel/legacy-reservation-retirement-audit.md#durable-family-map-settings) verified durable provider editing through the existing Family preference. Hosted provider validation follows the preview rollout prerequisites. The [Offline Settings review](parallel/legacy-reservation-retirement-audit.md#offline-settings-preparation-guard-and-legacy-review) fixes the premature force-offline transition and verifies the disconnected legacy panel. Its [removal](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-offline-settings-removal) preserves active Offline settings and recovery behavior at the tested scope. The [Family passkeys settings review](parallel/legacy-reservation-retirement-audit.md#family-passkeys-settings-boundary-and-legacy-review) hides an unavailable control and verifies the disconnected legacy section. The [Family Vacay review](parallel/legacy-reservation-retirement-audit.md#family-vacay-sharing-boundary-and-legacy-settings-review) fixes refused sharing requests on both calendar routes. The [Vacay settings review](parallel/legacy-reservation-retirement-audit.md#family-vacay-settings-permissions-and-database-grant-rehearsal) qualifies the local website controls and identifies a missing holiday table grant on the isolated database. The [holiday-calendar grant migration](parallel/legacy-reservation-retirement-audit.md#family-holiday-calendar-grant-qualification) passed isolated SQL and signed-in PostgREST checks. The [signed-in Vacay browser acceptance](parallel/legacy-reservation-retirement-audit.md#signed-in-family-vacay-browser-acceptance) verified the native calendar and settings on both layouts after adding the entry-table migration. Hosted Vacay acceptance requires checking both calendar table grants and applying the confirmed migration delta.

The [legacy Vacay removal](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-vacay-page-and-settings-removal) preserved the native calendar and lowered the duplication measurement to 5,913 lines across 148 files.

The [remaining legacy Vacay removal](parallel/legacy-reservation-retirement-audit.md#remaining-legacy-vacay-widget-and-state-removal) preserved the native calendar and lowered the duplication measurement to 5,876 lines across 146 files.

The [Files review](parallel/legacy-reservation-retirement-audit.md#legacy-family-file-manager-review-and-markdown-preview-repair) verified the local Markdown preview repair and identified the native attachment assignment contract as the next repair before legacy Files retirement.

The [native Files assignment repair](parallel/legacy-reservation-retirement-audit.md#native-family-file-assignment-through-link-records) locally verifies place and reservation attachment through the Family handler. Unscoped offline attachment requests remain recoverable through the existing queue hold.

The [legacy Files retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-files-modules-retired) matches the active route, assignment and private preview regressions and both source-bound web builds. Duplication remains a release gate.

The [Collections cleanup audit](parallel/legacy-reservation-retirement-audit.md#copied-collections-api-and-catalog-picker-audit) confirms local native reads and typed catalog selection, the existing Family sharing restriction, and a closed 12-file legacy group for a separate removal rehearsal.

The [legacy Collections retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-collections-modules-retired) matches native reads, typed catalog selection, sharing gates and web build checks. Duplication remains open at 5,348 copied lines.

The [Collab startup repair and legacy audit](parallel/legacy-reservation-retirement-audit.md#family-collab-startup-guard-and-copied-module-audit) verifies disabled Family admission and standalone routing locally. A separate removal rehearsal covers the 27 disconnected copies.

The [legacy Collab retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-collab-modules-retired) matches the disabled Family gate, enabled standalone panels and source-bound web builds. Duplication remains open at 4,964 copied lines.

The [Costs settlement repair and legacy audit](parallel/legacy-reservation-retirement-audit.md#family-costs-settlement-display-repair-and-copied-module-audit) verifies consistent legacy payment display amounts through the Family handler. The active admin currency constants have an import witness and the ten disconnected components have a separate removal rehearsal.

The [legacy Costs retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-costs-modules-retired) matches the Costs and settlement regressions, active admin currency imports and source-bound web builds. Duplication remains open at 4,864 copied lines.

The [native dialog repair and copied shell audit](parallel/legacy-reservation-retirement-audit.md#native-dialog-interaction-repair-and-copied-shell-audit) verifies focus, backdrop dismissal and form regressions. Duplication remains open at 4,804 lines.

The [copied dialog shell retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-copied-dialog-shell-and-callers-retired) matches the native discard and dismissal regressions, retained Family focus helper and source-bound web builds. Duplication remains open at 4,740 copied lines.

The [phone compass repair and copied compass audit](parallel/legacy-reservation-retirement-audit.md#phone-map-compass-repair-and-copied-compass-audit) verifies tilt-only reset and existing phone and desktop placement. The disconnected copy has a separate removal rehearsal.

The [legacy compass retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-legacy-map-compass-retired) matches the active source graph, all 719 regression cases and both source-bound web builds. Duplication remains open at 4,687 copied lines.

The [native Family category review](parallel/legacy-reservation-retirement-audit.md#native-family-map-category-availability-and-legacy-bridge-review) aligns the map controls with the typed catalog reader. Desktop and phone category and viewport requests pass against the real SDK with a fixture transport. Hosted acceptance remains pending.

The [Family map bridge retirement](parallel/legacy-reservation-retirement-audit.md#disconnected-family-map-bridge-and-callback-retired) preserves the native map and Family Settings routes. Their shared cluster stylesheet is verified and precached. Duplication remains open at 4,638 copied lines.

The [Family map preview review](parallel/legacy-reservation-retirement-audit.md#family-map-preview-fallback-and-renderer-review) confirms the member and admin raster fallback. Preview consolidation needs to preserve provider error feedback and configured tile attribution.

### G3 — schema 155 rehearsed and writer cutover remains blocked

The pinned 66-version migration set and the new Vacay grant and Collections index migration passed from a fresh X8 restore. The three affected test contracts now pass. The older task and packing writers still depend on operations that the upgraded schema refuses. [Schema 155 qualification](supported-core-readiness/recheck-20261121-schema154/schema155-additive-qualification.json)

### G3 writer cutover rehearsal

The exact 67 migrations replayed against a fresh database restore from the encrypted X8. All 296,764 archive rows survived. The nine old write probes returned insufficient privileges. The same synthetic Trip accepted both replacement command families in separate database connections. Each produced one record, returned its original result on retry, rejected altered intent under the original operation ID and restored the same item from Trash. The disposable database and raw restore working files were removed. This proves the local SQL contracts independently of the browser.

The exact website source built both existing fixture profiles. The real SDK and native request fences admit the selected profile only, including its receipt readers. A combined string or undefined third value admits neither. Four representative legacy task and packing queue paths were retained with their original identity and body, made exportable and held for explicit review. Automatic replay would lack the original Family scope and revision. The staged builds used a synthetic HTTPS configuration and the SDK tests used a stubbed final fetch. [Evidence](supported-core-readiness/recheck-20261121-schema154/writer-cutover-rehearsal.json)

### G3 combined writer qualification

The fixture-only profile `isolated-task-planner-packing-v1` uses the existing planner/base-packing boundary and admits only its exact task command, receipt and Trash reader in addition. Each existing standalone profile still has its regression coverage. Ordinary and primary HTTPS sources, unrelated or raw table writes, advanced packing, Collections and unsupported configuration remain outside the combined profile. The protected native presentation and shared schema require no changes for this profile.

The compiled site reached real local GoTrue and PostgREST with the same isolated PostgreSQL 17.11 schema 155. The final rebuild after a test-only lint correction matches every served application file from the browser run. Only the source binding in its public configuration receipt changed. Desktop planner creation succeeded. A lost committed task response was resolved through a fresh tab, and a lost packing response was resolved after reload. The browser sent no second command for either. A separate task test dropped the request before execution, checked the unresolved original and explicitly retried the identical body. Native task Trash and Restore reused the original ID. Packing Trash and Restore reused the original ID, and actual logout and sign-in switched to a different Family without exposing the previous Trip. Phone-width Chrome saved a task, a packing item and an untimed visit on the chosen Trip day. The saved state survived reload. Independent SQL verified 11 accepted operations and exactly one original receipt per operation. [Measured tests and build](supported-core-readiness/recheck-20261121-schema154/combined-writer-qualification.json)

On the exact 17.6.1.141 restore, the selected-day phone command returned SQLSTATE `55000` even with both times blank. The same native action passed the existing gate on 17.11.0.003 and stored the visit as untimed. Preserve the timing guard and account for selected-day flows in the hosted engine decision. The two X8 replays preserved all 296,764 archived rows. The isolated services and raw working copies were removed.

### G3 different-release handover

The fixture served the previous task-only website and the combined writer as distinct compiled releases on one local browser origin. Each used its real generated service worker and a verified asset manifest. The old native task form committed once and lost the reply. Closing it preserved the exact scoped IndexedDB original. The native update notice and Reload page activated the replacement worker and loaded the new JavaScript entry. The replacement checked the existing receipt, removed only that original and read back the same task. Independent SQL confirmed one task and one receipt. No second write ran.

One synthetic legacy packing draft matched the older native format and sat in the active source-owned database. Reload added its ID to the account's pause marker while preserving the whole draft. The native Offline settings export included it without automatic replay. A second synthetic draft in the detached legacy account database remained byte-identical and outside that export. The target has no verified in-app export for that detached database. Check the deployed source and affected devices during cutover planning. Preserve any unattributed drafts and establish a reviewed export route before asking anyone with such drafts to reload. No browser storage clearing or ownership reassignment is part of this procedure.

Both checked artifacts match their own source receipts. All 352 focused regressions passed. This local test does not identify the actual hosted Worker or verify detached-database export in it. [Handover evidence](supported-core-readiness/recheck-20261121-schema154/website-handover-and-postgres1712.json)

**Recommended hosted sequence after qualification and authorization.** Bind the deployed and replacement website artifacts to their exact sources and select a rollback target that can run on the new schema. Rehearse the write pause and wait for known in-flight edits, including old tabs and service workers. Preserve and reconcile unknown legacy edits before any manual re-entry. A retained command with checked scope uses its original identity and receipt; an unscoped draft requires an export and comparison against the saved state. Validate current backup and engine protection before applying migrations inside that pause. Switch the selected website target, check both write paths and then resume writes. If verification fails after the schema change, keep edits paused and use only the prequalified recovery path. Reverting to the legacy website by itself cannot recover these write paths under the new grants.

### G4 — hosted engine upgrade verified

The project owner started the managed upgrade from `17.6.1.141`. The project returned to `ACTIVE_HEALTHY` on Supabase image `17.12.0.000`. Live SQL reports PostgreSQL 17.12, confirms the installed extensions checked, and returns the expected local times in Vancouver, Edmonton and Casablanca. The managed upgrade leaves 88 applied schema versions. Their statement counts and fingerprints match the X8 archive.

The anonymous Auth and Storage health endpoints returned HTTP 200. The anonymous Data API read returned HTTP 401. A signed-in live website check remains pending. [Hosted verification](supported-core-readiness/recheck-20261121-schema154/hosted-postgres1712-and-worker-binding.json)

The prior isolated rehearsal used the same engine image, passed all 67 migrations, preserved all 296,764 original rows and saved an untimed visit on the selected day from a signed-in phone-width browser. [Local rehearsal](supported-core-readiness/recheck-20261121-schema154/website-handover-and-postgres1712.json)

### G5 — independent recovery verified locally

The 20 November backup was copied to an encrypted X8 and restored from that copy into a new database and private versioned file backend. All database projections, Storage metadata and file hashes matched. The local Storage API successfully served public and private samples. The API test used native Linux scratch space for file metadata. [Recovery rehearsal](parallel/coordinator-queue.md#independent-x8-database-and-media-recovery)

The mounted X8 copy matches the Mac copy's completion receipt, database archive and verified-file manifest. Its independent restore receipt matches this generation. The 77,038 live Storage records match the archive on the inspected identity fields. A fresh snapshot for the schema window remains pending. Confirm database and media freshness when setting that window. [Backup observation](supported-core-readiness/recheck-20261121-schema154/hosted-postgres1712-and-worker-binding.json)

### G6 — live Worker sources confirmed and preview acceptance pending

Production runs `1bf654b`. Its active Cloudflare version matches the corresponding-source manifest. Integration preview runs `ef89af599`. Its active version matches the archived deployment receipt and the live JavaScript entry. Both deployed sources use direct task and packing writes and the three legacy packing RPCs. The isolated schema 155 rehearsal refused those nine write paths. Both active deployments are unsuitable as stand-alone rollback versions after the schema cutover. [Source binding and checked paths](supported-core-readiness/recheck-20261121-schema154/hosted-postgres1712-and-worker-binding.json)

The newer source has local HTTPS fixture proof. Prepare the production-bound build and a schema-compatible fallback with matching corresponding source. Rehearse the profile rules locally, then verify actual hosted behavior during the authorized window. Validate signed-in desktop and phone journeys, authorized callbacks, original queued writes, receipts, Trash and restore, stored media roles, update and logout. The earlier [different-release rehearsal](#g3-different-release-handover) covered the same isolated backend. The standalone utility has now passed a local worker-update and scoped export rehearsal. Hosted delivery and browser profile scope remain release prerequisites.

## Scope of the first preview

The 22-domain matrix remains a scope inventory, not 22 equally complete features. Use the linked feature receipts at their actual source/profile/fixture scope:

- C01–C04: startup/auth, dashboard/Trip lifecycle and saved-location/day/untimed/timed/repeated-visit planning. Existing commands and recovery are preserved, but the intended HTTPS writer composition still needs G1.
- C05: observed booking details are distinct from the advanced native stay creation/lifecycle profile; do not enable all stay controls.
- C06–C08: ready stored catalog media, existing map pins and the supported typed discovery/select/save categories. No transformation fallback; missing variants remain placeholders.
- C09 and C13: provider routes/enrichment and new packing categories/bags/recovery stay outside this milestone unless separately qualified.
- C10–C12: tasks, existing base packing/observed groups and supported exports, with exact original IDs and explicit retries. [Packing acceptance](core-packing-composed-handoff.md) is local and does not qualify every HTTPS writer.
- C14–C18 and C20–C22: only existing honest read/recovery/export subsets for Costs, Files, Trip/Journey recovery, Atlas, Vacay, Journey and offline/update. [Global composition](core-global-composed-handoff.md) does not prove Vacay/Journey editing or private Storage. Whole-Journey destructive removal remains held where aggregate recovery is absent.
- C19: the [Collection subset](core-collection-composed-handoff.md) has local command/Trash/restore proof and subsequent HTTPS image-reading proof; ordinary unqualified sources remain read only. Root metadata/sharing/labels/ratings/import/export/Trip transfers are not silently enabled.

Tours, Collab, Studio, AI and other unsupported features may remain off. iOS application compatibility is not this website's deliverable. Phone evidence is Chromium emulation until separately tested on physical hardware. Keep geography/catalog identity separate from saved trip locations and repeatable visit records; do not rework the existing normalized foundation to imitate an upstream transport label.

## Order from here

1. Prepare the production-bound writer, schema-compatible fallback and recovery artifacts. Pin their HTTPS origins, backend and corresponding source. Document how to verify and reverse the production write pause. The existing Cloudflare preview remains available for optional website-only checks.
2. Obtain authorization for the maintenance window and the pinned migration set. In the window, verify and preserve affected browser drafts on their original origins. Capture and verify fresh database and media protection after writers drain.
3. At the start of the window, verify the managed pause and writer drain across the affected routes. Stop if a prerequisite fails. With the pause proved, apply the pinned migrations and deploy the compatible website build. Run the scoped signed-in checks before reopening normal writes. [Cutover and stop conditions](preview-cutover-and-fallback.md)

### Earlier checkpoint sequence

1. Q22a, Q23b and Q24 are completed historical prerequisites. Q26d’s review and Q26e’s six packing cases are complete; the available native planner/base-packing subset is accepted locally. Keep task and planner profiles distinct; ordinary/primary/hosted activation stays gated.
2. Q96 closes the warning ratchet. Q97 closes the controller size finding; Q98 closes the statically imported admin-plugin panel while preserving its hidden Family profile. Q99 verifies native Costs and finds no current entry path to all 30 retained size failures. Q100 retires only the bounded four-file entry island, leaving28 size failures. Q101 repairs those11 formatting violations with the real gate and unchanged rules. Q102 retires those two proved-closed Costs UI modules. Q103 retires only the old Login/Dashboard entries; Q104 the old SharedTripPage. Q105 retires that old Atlas page/hook island. Q106 retires those three old Settings modules; Q107 retires those old day-plan sidebar/detail candidates; Q108 retires that old inspector pair; Q109 retires the copied task/list island; Q110 retires the copied packing UI chain; Q111 retires that copied notice pair; Q112 retires that copied trip-members modal; Q113 retires those two reservation candidates; Q114 retires the copied transport/search boundary; Q115 preserves the tested Explore view while separating its props contract; Q116 extracts the retained Family BookingSection; Q117 extracts retained transport presentation; Q118 extracts the retained Family transport editor; Q119 retires the closed retained planner hook; Q120 retires the closed five-file stylesheet/page island; Q121 applies the approved correction; Q122 measures all remaining commands and repairs64 strict diagnostics; Q123 repairs the response contract; Q124 closes registration; Q125 applies the specifically approved RTL/i18n corrections; Q126 completes the Collection sharing data-layer repair. PA-00 closes the offline check, and PB-01 starts the remaining test typing repairs. Q28–Q89 and all11 recent delta locations are closed; preserve their receipts rather than replaying them. Prepare fresh protection/incremental capture plus independent restoration. Preserve the verified backup; the user runs heavy captures in Terminal. Both remain release gates.
3. Refresh authorized hosted contract/engine facts, rehearse the exact current delta and review rollout/rollback before any hosted mutation. Existing schema151 rehearsals are not current hosted acceptance.
4. Bind and validate only the selected integration-preview candidate and matching source after applicable gates pass. Production/main require their separate release decision. Pre-production unused-source cleanup remains its own deliberate checkpoint, followed by fresh acceptance after any removal.


No overall completion percentage is claimed: local feature packets, hosted readiness and full TREK parity have different denominators. Track the explicit release gates above rather than deriving a completion percentage from test or handoff counts. The original Q22 review started no new fixture/build/hosted operation. Current Q89 closes the complete Journey handler through context/validation/route/async groups with explicit completion/retirement proof, preserving view/cache/wrapper/permissions/business ordering and Q28–Q88. It starts no live database/browser fixture, RPC/provider request, backup, transformation or hosted operation.

## Remaining size inventory

**Current size gate: zero findings after Q120.** Historical Q22 listed33 failures. Q28–Q119 progressively refactored active/tested boundaries or independently proved closed unused islands; all dated receipts remain. Q120 retires exactly the three old stylesheet findings (index.css1740,collections.css1750,dashboard.css2023 wrapped lines) and their closed importing wrapper/owning copied page. The complete native CSS output is byte-exact. No broad legacy-directory exclusion, baseline relaxation or dependency-union deletion was used.

Native AdminPluginsPanel, MapViewGL and FamilyFrontendController were previously refactored with their entry witnesses and profile/permission admission preserved. Their local source qualification remains in the existing evidence. Q121 repairs the theme ownership failure; Q122 measures six remaining failed quality commands, which and separate release gates still require acceptance. Future unused-code cleanup still requires full runtime/type/test/tool/configuration/loader closure and preservation proofs.
