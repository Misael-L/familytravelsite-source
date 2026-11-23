# Native TREK website: complete feature onboarding and phased work

Latest checkpoint: **U04-F3a real database baseline restored and verified** (12 November 2026). Read [acceptance](real-backup-baseline-handoff.md). Immediate next is [F3b baseline provenance reconciliation and forty-migration rehearsal](real-backup-upgrade-execution-packet.md), followed by U05 pinned5.1.4 source reconciliation and required connector/publication repairs before final application acceptance. The current application/source pin remains qualified5.1.2. All earlier packet work is retained; production/preview and original backup/media remain unchanged. Full file/off-device recovery and incremental capture are not proved by this database restore.

Date: 3 November 2026. Status: **planned; no feature enabled, migration applied or preview deployed by this document**. Primary implementation checkout: `/Users/Misael/Downloads/FamilyTravelSite`, `codex/trek-v5-family-integration`.

## Authority and version baseline

Website implementation is the active product scope. Read canonical `FamilyTravelApp/docs/backend-modernization/README.md`, `architecture-review.md`, `recovery-and-history.md` and `docs/trip-planning-postgres-design.md`. The owner's PostgreSQL architecture charter and all twelve decisions take precedence over older carryover-only/iOS-parity notes.

Preserve native TREK presentation, Family business permissions, originals/media IDs, gallery order and ready ordinary variant objects. New Family database/API identifiers use neutral Trip/Plan/Visit/Route naming. Native `roadtrip` paths/add-on keys are compatibility identifiers, not the Family name for a Trip.

Two references are deliberately separate:

- Current integrated frontend: TREK 5.0.1 `a0943f8226269bc192c1cda992fbac33333337a1`; integration HEAD inspected `cede145a2e1963c59b667498e99e5056eaf65266`.
- Newer reference: `/Users/Misael/Downloads/TREK`, v5.1.0 `dc36c21c08f681fd2806764fad8e17b270f6f175`.

Do not cherry-pick random v5.1 frontend files into v5.0.1 during a connector repair. First finish a baseline contract or run a separately scoped whole-version upgrade with Family compatibility tests. The 636 changed source paths are an inventory, not an upgrade approval. Freeze the exact version for every fixture/packet.

`evidence/trek-feature-sources-2026-11-03.json` inventories 68 v5.1 controller domains, 137 controllers and 818 method decorators, alongside the baseline's controllers and changed paths. This is source coverage; it does not mean all routes are mapped to Family or all are product features. Dynamic routes, non-controller workers/MCP/plugin hooks and runtime behavior need their own tests.

## Feature ledger: core website and trip workspace

Each entry identifies its next contract and evidence gate. Existing Family tables/handlers indicate a foundation, not an end-to-end pass. Code-path observations below were made without mutating production.

### F01 — sign-in, sessions, recovery and account settings

Reuse Supabase Auth, Family membership, assurance and clock/unit preferences. Do not import Nest user/password/SSO tables. Test sign-in/out/recovery on the exact preview host, expired session, role/Family changes and cache isolation. Provider links/credentials remain server-owned. Native auth/settings presentation receives accurate capabilities.

### F02 — dashboard, trip lifecycle and members

Use current Trips, countries, travelers, proposals, archive and duplicate contracts; add recoverable Trash/Restore. Existing duplicate-trip RPC intentionally copies the hub envelope into a proposal, not a complete itinerary. Keep it stable and introduce an explicit optional deep-copy API if required. Test create/propose/accept/open/archive/restore and return-to-trip login paths. No duplicate Family governance system.

### F03 — geography, catalog and saved trip locations

Keep countries/divisions/locality types separate from venues and saved trip locations. Add typed `trip_plan_locations` and provenance/manual-point support as designed; read City/Town/country/region data without representing a restaurant by its parent city. Test destination-level visits, venue-level visits, unknown coordinates and no global catalog edits.

### F04 — day planner, notes, times and repeat visits

Evolve schedule occurrences with explicit day membership and optional time intent, independent occurrence notes and repeat visits. Legacy date-only timestamps require a versioned compatibility rule. Implement atomic move/reorder/clear/undo with operation/revision semantics. Preserve native drag behavior, day notes, endpoint ordering and private/proposed write outcomes. Never introduce a 90-minute default merely to make a calculated route look complete.

### F05 — map rendering and map settings

Retain native Leaflet/GL surfaces and phone map; reuse Family basemap preferences/provider settings. Test each supported engine and theme/RTL/phone layouts. Runtime geometry, provider config and tokens are service concerns. No map provider/billing/credential change is implied by onboarding.

### F06 — location search, autocomplete and category POIs

Native `/maps/pois` is currently not connected; `/maps/search` returns a narrow city result and autocomplete returns no suggestions. Reuse Family catalog bbox/type readers at the native contract boundary. Test Restaurants/Cafes/etc., real pin selection, typed source identity, no-results versus failure, cancellation and Search this area. Optional external index/Overpass/Google/Amap lookup is a separately configured provider, not an automatic fallback that masks a missing Family connector.

### F07 — details, categories, tags, ratings and personal notes

Map available source-specific metadata to the native inspector. Editable Family categories and catalog locality types have different identities. Empty categories legitimately hide the native filter. Description is catalog text; trip-personal notes and occurrence notes have separate stores. Existing global catalog star/quality ratings do not constitute native per-member trip votes. Add a properly scoped vote relation only if supporting that action; test all save/reset/clear/reload paths.

### F08 — image roles and galleries

Reuse the ready v1 thumb/hero manifest and ordinary Storage URLs for list/map/gallery/prefetch. Connect selected-entity ordered gallery slides and explicit original links through the native hook/lightbox. Preserve media UUIDs and junction positions. Missing hero remains unavailable; no automatic render/image or original fallback. Test old cached rows and both shared Place schemas, not just URL helpers.

### F09 — normal day routing and navigation

Route the actual ordered visits with accurate coordinates, travel mode, locked stops and bookings. Family's current iOS route service is evidence, not the website backend. Build a compatible service path for OSRM/Valhalla/other approved providers. Test missing/failed legs, cancellation, reorder, duration units and explicit native navigation links. A straight line is not a successful road route.

### F10 — advanced route planning (native Roadtrip capability)

Use the neutral trip routing settings, occurrence routing attributes, stable via anchors, boundaries and followed-track links from the canonical design. Cover daily windows, alternative routes, fuel/EV range, route exclusion and vehicle/service stops. Preserve flight/train/ferry seams and hotel bookends. Capability stays off until advertised operations work; each optional subservice must state its availability. Generic Trips are not renamed road trips.

### F11 — public transport, weather and other derived map services

Transitous/Google transit, Open-Meteo forecast/archive and similar results need provider adapters, bounded caches, units, provenance and failure states. Only user-saved bookings/choices become canonical trip data; do not create tables for every ephemeral response. Demonstrate a deterministic fake-provider scenario before a live service smoke.

### F12 — accommodation and bookings

Reuse `trip_reservations`, hotel links, start/end days and endpoint/leg records. Native `/accommodations` currently answers an empty list; derive or implement the correct stay projection rather than resurrecting the intentionally abandoned `day_accommodations` table. Reconcile native booking types with Family's actual type constraint. Preserve timezone/confirmation/timetable semantics and no automatic duplicate expense. Test a multi-night stay, real midnight, multi-leg travel and cancelling/removing a visit without cancelling its booking.

### F13 — booking/receipt import

Family has existing booking-import helpers, but parsed preview is not a persisted booking. Native KItinerary/AI extraction is an external service capability; do not assume Nest's extractor runs in a static Cloudflare build. Add idempotent review/apply with source hashes and transactional booking/cost effects. No real user emails/files or model-provider credentials in fixtures. Test cancellation and partial parsing.

### F14 — costs, payers, shares, settlement and exchange rates

Adapt Family's exact numeric currency representation to native UI units explicitly. Define rounding/minor-unit rules, frozen rates and sum constraints. Test multiple payers, unequal shares, partial shares, reversals, duplicate retry, read-only/propose/direct and export. Keep settled financial history auditable; ordinary Trash must not silently erase ledger consequences.

### F15 — packing, bags, templates and to-dos

Reuse current packing/todo tables, recipients/contributors/categories/templates; inventory native bag weights, privacy tiers, reminders and due dates. Add only missing behavior with typed ownership. Test per-person access, duplicate template apply, item reassignment, undo/restore and after-reload state.

### F16 — files and attachment targets

Reuse the existing private upload/finalize and files Trash/Restore API. Enforce same-trip target relationships for place/day/booking links. Align new saved-location attachments deliberately. Test byte hash/size/type, missing file, expired URL, restore, shared references and purge race; retain private Storage policy and cleanup fencing.

### F17 — PDF, ICS, GPX/KML imports and exports

Existing PDF/ICS use published Family state; some native my-plan/GPX/subscribe actions are unavailable. Implement each export from a coherent authorized snapshot with source/revision provenance. Imports need review/dedup/source mapping and no fabricated city location. Compare downloaded content, not only a toast. Test export after restoration and private/draft exclusion.

## Feature ledger: global and personal domains

### F18 — Atlas: countries, regions, localities and personal history

Reuse personal marks, trip-derived stats and geographic catalog/boundaries. Separate manual memories/notes from recalculable derived totals. Inventory native region/bucket-list/tour-activity requirements; add typed user/person ownership and provenance rather than treating every country as a trip Place. Test manual mark/undo/restore, corrected source trip, multi-country stats and preservation after catalog archival. Native Atlas writes remain off until their backend works.

### F19 — Vacay: leave, entitlements and sharing

Current Family calendar tables/adapter support whole-day leave and school breaks; non-1 fractions are explicitly rejected. Native half days, carry-over, holiday overlays and sharing need exact fractional representation and authorization. Family annual entitlement columns are currently integer, so half-day support is a real schema decision. Test cross-year/half-day totals, family/person scopes, blocked dates, visibility grants and duplicate paint/retry. Do not store a leave date as a timezone-shiftable appointment.

### F20 — Collections: saved library outside trips

Reuse lists/items/status/visibility with their typed catalog FKs. Inventory manual locations, links, labels, per-list membership/invites, ratings, tours, reorder/export and copy-to-trip. Current adapter archives a collection root but physically removes individual list items; recovery must cover both. Copy to a trip creates/links a saved location, while an intentional visit is a separate operation. Test existing catalog and manual items plus root/child restore.

### F21 — Journey: stories, co-authors, drafts and galleries

Reuse existing Journey/entry/media/tag/trip linkage, plus preservation/history first. Current adapter rejects several draft/visibility/stats flags and public sharing is unavailable. Do not pretend complete parity from current CRUD. Test independent authored stories, linked trip changes, entry/gallery order, captions, membership, text revision restore and original byte retention. A Trip purge must not silently erase an independent Journal.

### F22 — linked trip journal and recorded days

Define a trip-to-Journal link and contributor scope; synchronize generated suggestions separately from authored entries. Recorded tracks/stays require provenance, dismissal/restore and idempotent import. Existing `journey_trips` links are a foundation, not all native link/draft/sync behavior. Test one source moved/deleted and locally edited/generated content without duplicate or lost stories.

### F23 — Studio/books, designed pages and exports

New domain: books, spreads/pages, typed design/document versions, immutable asset links, collaboration revisions and rendered export jobs. Do not store a book as one unversioned string on Journey or put secret/provider data in document history. Preserve native themes/fonts/layout semantics at the pinned version, including source/license obligations for copied assets. Test edit/reopen/undo/restore, cross-book copy with new child IDs, shared assets and PDF bytes. No existing Family book schema was demonstrated.

### F24 — Tours core: definitions, routes, stages and assignments

New domain, distinct from motorized trip routing and global catalog geography. Native Tours facets attach routes/stages to reusable trip-owned places; translate to the new Family location/visit model rather than storing a trail as a city. Define tour, type, versioned route, legs/variants, stops, stages, planning parameters and recorded-track links. Native type names include an older food type but seven plannable activity families in the inspected reference. Tours stays disabled until this core and the relevant actions are implemented and locally tested.

### F25 — hiking, city walking and running

Tour facets: hike grading/ferrata layers/elevation; city-walk opening hours/stays/transit; running/trail pace. Use checked typed parameters/units and calculated-route provenance. Test selected source type, real route failure, grade/pace limits, timed station or stay, no invented safety guarantee and save/reload of planned geometry.

### F26 — cycling

Support native touring, road, gravel and MTB profile codes at the adapter boundary; Family-owned column/table names remain neutral. Store chosen profile, legs, elevation and planning input, not all provider road-network data. Test profile changes, manual legs, import and route variants. The native `road` profile is a genuine provider enum value, not a Family trip label to rename globally.

### F27 — paddling

Model paddle type/water context, planned water/portage legs, locks/obstacles, wind inputs and routing capability. Separate provider observations from saved decisions and check units. An unavailable water router is a capability gap, not permission to draw a navigable-looking fallback. Test canoe/SUP/kayak selection, portage, cancellation and save/reload.

### F28 — horse and winter/ski

Store the domain-specific profile/discipline and manual-versus-routed leg intent. Native horse routing includes hand-shaped stretches; winter has several disciplines and optional piste routing. Test a manual route and routed/unsupported discipline explicitly. These require service/data providers beyond adding Tour type labels.

### F29 — multi-day stages, planned versus recorded and activity statistics

Link stage identity to visit/day and the correct recorded track without copying raw tracks into catalog places. Preserve planned and actual distances/ascent/time separately. Test repeat stages/source corrections, route edits invalidating derived stats, Atlas aggregates and import retry. No graph-network or regional partitioning is justified without measured need.

## Feature ledger: collaboration, sharing and platform services

### F30 — Family roles, proposals and native action availability

Retain existing direct/propose/deny outcomes and assurance. New visit/routing/Tour/Studio operations need versioned draft/apply schemas and allow-listed commands. Native trip owner/member/editor concepts must map to Family rules, not replace them. Test current action rights on the real handler and SQL roles; rendering a button is not permission enforcement.

### F31 — realtime, offline, conflicts and undo

Supabase Realtime is not Nest WebSocket transport. Connect domain events/canonical readbacks and cache invalidation deliberately; preserve native repos/Dexie/queue discipline and auth isolation. Test two sessions, stale revisions, offline replay, ID reconciliation, Trash visibility and rollback. “Undo” must issue an authorized inverse/restore, not just revert the local display after a committed deletion.

### F32 — Collab: chat, notes, links, polls and What's Next

New bounded persistence/API for messages/threads/reactions, notes with revisions, polls/options/votes and shared links/tasks as applicable. Reuse Family person and trip permissions; do not put all social state in a generic unschematized JSON column. Test privacy, deletion/revision retention, two-user updates and vote idempotency. Capability remains off until its advertised subfeatures are supported.

### F33 — invitations, guest travelers and sharing

Family's invite-only onboarding differs from native account creation and reusable trip invites. Preserve Family business intent and explicit guest identity. Native public Trip/Collection/Journal shares require scoped, expiring/revocable tokens, restricted projections, media policy and no default publication of family content. Test read-only and revoked/trashed sources; no invitation messages are sent by this plan.

### F34 — notifications and channels

Reuse Family notification catalog/preferences/inbox/push jobs. Map inline actions and native event grouping to the real permission/transaction boundary. Email/webhook/ntfy/Web Push/plugin channels require independently configured services and signed/authenticated actions. Test dedup, retries, undo state, no deleted-content leak and no real outbound messages in local fixtures.

### F35 — import/export provenance, feeds and calendar subscription

Reuse current calendar/feed privacy and revocation patterns; add only missing per-trip/my-plan/GPX projections. Timezone, private draft exclusion and restored content need deterministic behavior. Imports/feeds must not become a route to execute arbitrary URLs/SQL. Test stale tokens and a trashed source.

### F36 — provider integrations

Inventory AirTrail, Dawarich, Wanderer, Immich/Synology Photos and document providers (Paperless/Papra/Nextcloud/OpenCloud/Synology Drive). These are external-service contracts, credential scopes, source identities and synchronization jobs; a table is not the service. Disable until configured/tested. Define disconnect versus delete-imported-data and protect existing personal notes/media. No background full sync from this plan.

### F37 — AI assistant, parsing, receipt scan and MCP

Optional service layer; reuse the same authenticated domain commands/validators for UI and agent calls. Provider credentials and spending policy remain server-side. Preview generated plans before applying, enforce bounded/idempotent writes and preserve existing proposal permissions. No AI credit/billing activation or real personal-file send is authorized by onboarding documentation. MCP tokens must not bypass a disabled capability or expired membership.

### F38 — plugins, map/layer/detail contributions and route providers

Native out-of-process plugin execution does not run in the static frontend/Supabase automatically. Define the hosting/security decision before onboarding a plugin runtime. Authenticated empty optional contribution responses can be valid when no providers exist, but they do not implement Family catalog POIs. Test each contribution's permission, serialized payload, failure/cancellation and disabled-provider state.

### F39 — administration, credentials, sessions and system notices

Keep Family Auth/admin/membership and assurance controls. Evaluate native OIDC/OAuth/API keys/service identities and session management against Supabase capabilities; do not copy auth tables as a shortcut. Server credential stores and key rotation are distinct from database personalization. Newer v5.1 routing-relay/service-identity endpoints need a separate deployment/service review.

### F40 — backup, storage, health, scheduled jobs and public API

Operator responsibilities span database plus object bytes, restore drills, retention/purge, performance and bounded workers. Native Nest backup/Docker/scheduler modules are not substitutes for Supabase facilities. Public APIs must share explicit scopes and versioned contracts. Keep system/jobs/caches separate from the personal-content Trash policy. Follow the recovery plan; no production cleanup or billing changes.

## Platform completeness and version delta

The controller evidence also lists airports, categories/tags, config/settings, help/health, geo, photos/enrichment/import/shadow indexes, query/read models, receipt scans, route usage, scheduling, service identity, sessions, school holidays, system notices, transit, weather and plugin contribution modules. These support the feature groups above; do not leave them unaccounted because they are not top-level tabs.

At contract-lock time, classify every controller/domain from the evidence as Family replacement, adapter-needed, external service, operator infrastructure, version-upgrade-only or intentionally unsupported. Then map actual reachable client calls, workers, provider hooks and offline flows. The regex inventory is an exhaustive listed-file starting point, not a substitute for semantic route discovery. Record new upstream versions as a new dated delta.

## Execution packets and dependency gates

Each packet must publish: baseline commits/migration IDs; dependency packet; permitted implementation paths; exact request/response and persistence contract; positive/negative/recovery cases; commands actually run; evidence files; rollback; commit/push and deployment status. Derive Zod/API types from the shared contracts and database types from the actual schema where tooling supports it. Do not weaken guards or fake check statuses.

Use canonical `FamilyTravelApp/docs/backend-modernization/execution-packet-template.md` before implementation. The packets below are dependency and acceptance outlines, not finalized SQL specifications. Expand one domain/subpacket at a time: close column/constraint/RPC details and pin the real native caller before allowing code changes. A large P01/P06/P07/P09 heading is not permission to implement every listed domain in one unreviewed commit. A documented environment blocker does not satisfy a dependent packet's database-test gate.

### P00 — environment, evidence and contract inventory

Scope: local fixture environment, version pins, route/feature ledger and owner decisions. Paths: these docs, evidence artifacts and dedicated local-test scripts/config only. Prove disposable stack identity/ports and production-host refusal before any seed/reset script. **Environment verified 4 November:** a separate PostgreSQL 17.6 project replayed all 88 migrations and passed four existing SQL scripts without skips; Docker is available. See canonical `FamilyTravelApp/docs/backend-modernization/p00-local-rehearsal-2026-11-04.md`. The project was stopped with volumes retained. Feature-level endpoint/contract discovery remains packet work; baseline tool/test success does not implement those features.

### P01 — preservation contracts and first recoverable aggregate

**4 November status:** P01a Journey entry Trash/history/media holds and Family-only recovery controls are locally implemented and verified. Canonical contract/receipt: `FamilyTravelApp/docs/backend-modernization/p01a-journey-entry-recovery.md`. P01b.1 whole-Journey recovery is now locally verified as recorded below; Trip aggregate recovery, other domains, independent backups and remote preview release checks remain pending. No deployment was performed. The next acceptance outline is canonical `FamilyTravelApp/docs/backend-modernization/p01b-aggregate-recovery-acceptance.md`: P01b.1 whole-Journey recovery before P01b.2 Trip recovery. Preserve the whole-Journey deletion guard until replacement database/control tests pass. Provide a small owner-review recovery example before expanding the full adapted TREK scenarios; use an isolated test backend for all fixture writes.

Depends P00. Paths: canonical new lifecycle/history migrations and tests, website delete/restore adapter and affected native action wiring. Start with Journey authored entry and its media, then Trip aggregate. Lock Archive/Trash/Restore/Purge distinctions, parent-aware reads, history/media holds and old direct-delete writers. Completion: real SQL-role denial and byte-preserving delete/restore/overwrite recovery through the website fixtures. No production deletes.

### P02 — shared Plan locations

Depends P00 and preservation baseline. Paths: new typed location migration/API/tests, `family-backend` location reader/writer, Family `views/repository/applicationHandler`, shared response contracts and actual native detail tests. Completion: catalog city, food, hotel, experience and manual locations, correct identity/category/notes/images, save/read/reload, cross-Family denial and old source mapping. No catalog rewrite.

### P03 — explicit scheduling, visits and idempotency

Depends P02. Paths: schedule/day migration/versioned commands, source mapping, native assignment adapter/queue tests. Completion: unscheduled/untimed/timed/midnight, two restaurant visits, retry without duplicate, atomic move/reorder and date-shift behavior. Add tests before replacing partial uniqueness or changing old date conventions. iOS feature implementation is deferred; shared write-boundary tests cover any affected existing contract.

### P04 — details/POIs/gallery contracts

Depends appropriate P02/P03 read identities; can parallelize independent approved native repair phases. Paths: catalog POI/detail/media readers, shared Place schemas and existing native hooks/consumer tests. Completion: actual map pills produce correct pins, selected venue metadata, category filter and City/Town projection where authorized, Description once, separate notes, hero lightbox with ordered originals and zero attempted transformations. No UI redesign.

### P05 — routing inputs and provider service

Depends P03 and relevant P04. Paths: neutral routing tables/RPCs, provider boundary, native routing repos/hooks and permissions tests. Completion: settings save/reset/reload, stable vias, reorder/delete, day boundary and track linkage, failed-route honesty, transit/hotel seams and phone behavior. Enable only supported native subfeatures.

### P06 — bookings, stays, costs and import review

Depends P03/preservation. Split into independently reviewed booking, money and import commits. Completion: multi-night hotel projection, multi-leg endpoints/zones, real confirmation separate from visit, native money conversion, atomic shares, idempotent import/apply, no accidental expense deletion and local review/restore.

### P07 — Atlas, Collections and Vacay

Depends preservation and shared location/visit contracts where used. One domain per packet/commit. Completion: typed personal marks/provenance and region support; manual/catalog Collection item with labels/sharing as advertised; fractional leave/year totals and existing Family privacy. Each includes save/reload, cross-owner denial, Trash/Restore where applicable and real browser controls. Read-only opening alone does not pass.

### P08 — Journey completion and Studio

Depends preservation/history/media. Complete remaining Journey drafts/link/suggestions/privacy/co-authorship first. Build Studio as a separately versioned domain with its own document/media history and export job; no generic blob column on Journey. Completion: narrative/edit/reload/restore, deterministic native book fixture, expected exported bytes and contributor conflict behavior.

### P09 — Tours foundation and per-activity capabilities

Depends saved locations/visits/recorded tracks/provider boundary. One core schema/API packet plus separate activity/stage/recording packets. Complete the seven activity families against their required algorithms/providers; do not enable a tab to hide empty handlers. Cover saved route geometry, stages, versions, import/copy, planned/actual statistics and unavailable provider cases. Tours remains off until its core and offered actions pass.

### P10 — lists/tasks/files/export completeness

Connect remaining packing/todo/file attachment and import/export/feeds features using existing Family business rules. Completion is saved/reloaded actual state and recovered files/documents, verified export content, attachment target integrity and permission boundaries.

### P11 — collaborative and external-service features

Depends the relevant domain APIs and preservation. Implement shared state/events/offline conflict behavior before chat/polls/invites/public shares. Providers, plugins, AI and MCP each require a scoped configuration/security/deployment packet; they are optional capabilities, not compulsory installations. No outbound messages or paid-service changes from a local test.

### P12 — hardening, rehearsals and staged release

Triage schema findings/advisors with minimal grants and workload evidence; rehearse migrations/upgrades/restore on representative local data. Only reviewed specific migrations and separately authorized preview deploys proceed. Record production migration and frontend deployment independently, include exact rollback and corresponding-source workflow, and never use an unresolved global verification/backfill as a release gate for a bounded feature. A whole upstream v5.1 upgrade is a separate packet, not hidden inside P12.

## Definition of done and outstanding work

A feature is complete only when its real read/write contract, Family authorization, reload/offline/realtime behavior, relevant recovery path and native desktop/phone consumer have passed with evidence. Empty arrays, mocks replacing the handler, a successful build, or the upstream demo being functional do not establish Family support.

The 3 November task created research documents/evidence only. On 4 November the environment portion of P00 completed a fresh migration replay and four existing SQL-script checks; the earlier Docker blocker is resolved. P01a entry recovery is locally implemented and tested as recorded above; aggregate recovery, new planning features, adapted demo loaders and browser feature suites remain pending. The live demo trip could not be inspected; provider availability and backup configuration are unknown. Production, preview, original media and transformation settings were not changed.

## P01b.1 local implementation update — 4 November

Whole-Journey Trash/Restore is implemented locally on the integration development branch. Canonical contract: `FamilyTravelApp/docs/backend-modernization/p01b-journey-aggregate-contract.md`. Root/child identity, previous child Trash and original media are retained. Twenty-seven database/HTTP/Storage and eighteen website/transport tests passed, along with fresh/upgrade migration rehearsals and real signed-in desktop/phone recovery on the built app. Native pages and carried backend sources remain preserved. Production and Cloudflare previews are unchanged. P01b.2 Trip recovery is next; adapted demo datasets and owner-review preview remain later acceptance work.

## P01b.2 Trip recovery local update — 4 November

The integration development checkout now connects native Trip Delete to retained-root Trash and exposes a shared Family Journey/Trip recovery control without modifying native pages or carried backend sources. Canonical contract, evidence and exact local commands: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p01b2-trip-recovery-handoff.md`. Fresh/upgrade, 18 Trip + 27 Journey database tests, four SQL suites, 24 website tests and real desktop/phone native recovery passed. The synthetic fixture includes three initialized days, one food occurrence, two restaurant booking links, a multi-night stay, cost shares, a previously trashed file, actual original bytes and an independent Journey. It is not the full adapted TREK demo, and repeated venue occurrences remain P03 work. No production/preview deployment or fixture write occurred. Next is P02/P03 foundation work; later owner review needs an isolated backend, not merely a development hostname.

## P02a local foundation update — 4 November

Saved-location persistence and versioned Family API are locally verified, with actual native-inspector consumer tests. Canonical handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p02a-saved-location-handoff.md`. Nineteen new SQL/Auth/HTTP/Storage tests, eighteen Trip and twenty-seven Journey regressions, four SQL suites and forty-five website tests passed, along with fresh/upgrade, typecheck/build and source guards. This bounded packet does not switch native Place/assignment routes, enable repeated visits or deploy a browser-visible feature. The existing Cloudflare preview remains unchanged. P02b/P03 must map those identities/writers together and exercise actual desktop/phone controls before presenting the adapted demo as supported.

## P02b.1 local relationship proof — 4 November

The canonical 93-chain visit/location bridge and versioned Family visit read seam now pass local migration/rollback, authorization, recovery and unchanged native inspector tests. Food/experience occurrences retain venue identity rather than using contextual city coordinates. The native `/places`/assignment cutover, explicit time intent, repeated venue writes and full adapted demo/browser control suite are still pending. No Cloudflare host or production backend changed. Current canonical handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p02b-visit-location-handoff.md`; use the 93-chain rehearsal there rather than the historical 91/92 runners.

## P03a.1 local command proof — 4 November

The canonical 94-chain untimed visit command boundary is locally verified: repeat visits, unassigned/day-only intent, safe retries/revisions, notes/duration, move/unassign and recovery. Day-sync scope/no-op failures were reproduced and repaired, with atomic date-edit protection for assigned explicit visits. 107 distinct DB/Auth/HTTP/Storage cases, four SQL suites and 66 web tests passed, including the actual native offline queue through the Family adapter after a lost acknowledgement. Native UI files and preserved backend remain unchanged. The native normal planner routes are not yet redirected, timed writes/typed new proposals/copy/export/category coverage and actual desktop/phone demo controls remain pending; no Cloudflare or production changes occurred. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03a-untimed-visit-handoff.md`; native cutover outline: `p03b-native-cutover-prerequisites.md` beside it. Use the current 94-chain rehearsal, not older packet runners.

## P03b.1 local proposal proof — 4 November

The current canonical chain is 95 migrations. Typed location/untimed-visit commands can be staged, submitted and reviewed through the existing proposal workflow without publishing drafts. Intent/decision retries, author-private typed bodies, current scope/MFA/capabilities, stale conflicts and accept-all rollback are verified. The baseline missing request-op grant and unchecked internal executor bypass were reproduced and repaired. 128 distinct real DB/Auth/HTTP/Storage cases, four SQL suites and 77 real-handler/transport/native-queue tests with Supabase fakes passed; full client typecheck, strict changed-module lint, local build/credential scan and native/backend source guards passed. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03b-typed-plan-proposals-handoff.md`; use its 95-chain guarded rehearsal.

This packet adds Family API seams only. Normal native Place/assignment routes and My Draft/Pending Changes overlays are not switched; timed classification/DST, copy/export/category boundaries and full adapted TREK desktop/phone/demo walks remain pending. No new browser or Cloudflare network proof is claimed, and neither production nor the integration preview changed. The isolated disposable stack is stopped. Independent DB/object restore and preservation of ignored ETL source remain separate requirements.

## P03c.1 local classification proof — 4 November

The canonical chain is now 96 migrations. An explicitly reviewed legacy visit can become untimed on a chosen real day or unassigned, requiring observed timing/revision and retaining the exact original row in immutable private history. No midnight is guessed; activity, notes, venue/visit identities, booking/story/media links and ordering remain intact. A checked minimal history read and strict classification route are tested through the actual Family dispatcher/transport/native queue with Supabase fakes. Lost-ack replay changes the visit once.

Only the marked disposable backend was pinned to corrected PostgreSQL image `17.11.0.003`; affected-zone/DST-instant/fractional-offset probes passed. Fresh 96 / populated 95→96, 149 distinct real DB cases, four SQL suites and 87 web tests passed, plus typecheck, strict module lint, local build/credential scan and source guards. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03c-legacy-time-classification-handoff.md`. Its 96-chain guarded runner supersedes historical reset commands.

This is not a native time-control or demo release: timed writes, timing/classification proposals, inverse conversion/Undo, native pool/occurrence/overlay/version/queue cutover and full desktop/phone adapted demos remain pending. No new live browser/network proof is claimed. The original local database, production, both Cloudflare hosts, transformations and billing remain unchanged. Independent DB/object restore and ignored ETL source preservation are still unproved.

## P03d.1 historical local named-zone timing proof — 4 November

The current canonical chain is 97 migrations. Complete timing commands support validated local offsets or exact instants, midnight, DST gaps/folds, fractional zones, explicit overnight dates, open-ended estimates, derived elapsed duration, deliberate legacy classification and retained timing revisions/restoration. Existing timed notes/source/lifecycle proposals work; clock/day/duration proposals remain next. No visit-time edit changes bookings, venue/media identity or independent stories. Legacy Trip date shifts are guarded for retained unassigned/trashed appointments too.

Fresh 97 / populated 96→97, 176 distinct real database cases, four SQL suites and 97 real Family dispatcher/transport/native-queue tests with only Supabase faked passed, alongside full client typecheck, strict module lint, local build/API/credential scan and source guards. The application handler shrank via a bounded plan-dispatch extraction. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03d-named-zone-timing-handoff.md`; its guarded 97-chain runner supersedes historical resets.

Normal native assignment/time/place/draft routes are not switched. Typed timing/classification proposals, end-only/reset/default/native queue contracts, other-writer coverage and full adapted desktop/phone demos remain incomplete. No new browser/remote transformation-network check is claimed. Production timezone qualification and independent DB/object restore remain gates. Production, both Cloudflare hosts, billing and transformations are unchanged. Ignored ETL source was untouched and remains independently unpreserved by this packet.

## P03e.1 historical local timing-proposal proof — 4 November

Current chain is 98 migrations. Existing typed drafts/requests now support complete timing/classification/clear/history-restore proposals. Stage/submit leave published visits unchanged; current Direct approval rechecks the visit revision and timing contract, then calls the checked timing command. Reject/withdraw never publish; accept-all rolls back earlier timing/history if a later operation conflicts. Existing function OIDs, data, pending work, history, venue/booking/story links, gallery ordering and original bytes survive expansion.

Fresh 98 / populated 97→98, 194 distinct real DB cases, four SQL suites and 104 actual Family dispatcher/transport/native-queue cases with Supabase faked passed. Full client typecheck, strict changed-module lint, local build/API/credential scan and 12-native/120-backend preservation guards passed. Current handoff is `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03e-timing-proposals-handoff.md`; use its guarded current runner, not historical chain resets. The local build uses the disposable API and must not be deployed.

No normal native pool/day/time/draft route or presentation was switched; native end-only/reset/default/create-and-time contracts and coordinated identity/revision/queue/draft-overlay mapping remain next. Full adapted desktop/phone demos, other-writer coverage, production timezone qualification and independent DB/object backup restore remain gates. The disposable stack is stopped with retained volumes. Production, both Cloudflare hosts, original local DB, billing, transformations and full data jobs remain unchanged. No new browser/remote network proof or independent ignored-ETL preservation is claimed. All current work remains uncommitted/unpushed.

## P03f.1 historical local independent-endpoint proof — 5 November

Current canonical chain is 99 migrations. Existing timing/proposal/history commands now support End-only timing and independent endpoint clears without inventing Start/midnight, duration or a location default. Partial intervals can carry an explicit estimate; complete intervals derive elapsed duration. Day uses Start's local date, or the known End's when Start is unknown. Existing IDs, rows, appointments, snapshots/history, pending typed/legacy/timing work, function OIDs, booking/story/media links, gallery ordering and original bytes survive expansion.

Fresh 99 / populated 98→99, 206 distinct real DB cases, four SQL suites and 112 actual Family dispatcher/transport/native-queue cases with Supabase faked passed. A targeted baseline web test and real pre-upgrade commands reproduced the former End-only refusal. Full typecheck, strict changed-file lint, local build/API/credential scan, 12-native/120-backend preservation guards, ACL and DB error gates passed. The disposable build must not be deployed. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03f-partial-visit-times-handoff.md`; earlier reset runners are historical.

No normal native route or presentation was redirected. Next is atomic create-and-time, then coherent native pool/day/selected-occurrence/form/draft/version/queue cutover. Defaults, broader writers, full adapted desktop/phone demos, hosted timezone qualification and independent DB/object/source backup proof remain pending. Only the marked disposable stack was stopped with volumes retained; production, Cloudflare, original local DB, billing, transformations and full data jobs are unchanged. Work is uncommitted/unpushed. No new browser/remote network result or independent ignored-ETL preservation is claimed.

## P03g.1 local atomic-entry proof — 5 November

Current canonical chain is100 migrations. One parent operation atomically commits saved-location/occurrence/timing or rolls back every new child, audit/history/receipt. Existing catalog-source deduplication and separate notes/venue/media identities remain intact; intentional repeated visits use new operation UUIDs. Compound proposals stay private until checked approval; current places authority also applies to inline-source submit/accepted-review replays. Native presentation/routes remain unchanged.

Fresh 100 / populated 99→100,223 distinct real DB cases, fourSQL suites and 125 actual dispatcher/transport/native-queue cases with Supabase faked passed. Baselines reproduced the absent composite command/proposal and older partial-save failure. Full typecheck, strict six-file lint, local build/14-API/credential scan,12-native/120-backend guards, ACL and DB error gates passed. Build targets the disposable API and must not be deployed. Current handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p03g-atomic-plan-entries-handoff.md`; historical resets are not current.

Next is the coordinated unchanged native pool/day/selected-occurrence/form/draft/version/queue cutover. Defaults, broader writers, transactional dates/reorder, full adapted demos, hosted timezone qualification and independent DB/object/source backup proof remain pending. The marked disposable stack is stopped with volumes retained. Work is local/uncommitted/unpushed; production, Cloudflare, original local DB, billing, transformations and full data jobs are unchanged. No new browser/remote transformation-network result or independent ignored-ETL preservation is claimed.


## P04a.1 local planner snapshot/read identity proof — 5 November

Current canonical chain is101. The checked snapshot preserves active published pool/visits/explicit days/notes and separate geographic destinations in one MVCC snapshot. Native read projection uses actual venue identities, one-based days, local clock facts and ready v1 heroes. Old city/UTC/text/thumbnail projection failures are reproduced through the retained adapter and the new path is exercised through actual native repositories/cache/queue with only Supabase faked. Session/Trip fences, strict relationship validation and Trip-scoped legacy destination aliases are proved.

Fresh101 / populated100→101,234 distinct DB cases, four SQL suites,148 focused web cases, full client typecheck, strict seven-file lint, disposable-target build/15-RPC/credential scan,12-native/120-backend guards,36 ACL checks and DB error gates passed. Current canonical handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04a-planner-state-handoff.md`; current reset runner: `rehearse_planner_state.py --reset-disposable`. Historical reset runners are not current.

The versioned diagnostic seam is connected, but the explicit read-only native rehearsal coordinator is not installed by default. It retains/report-blocks unmaterialized destinations, legacy timing and unassigned native representations. It refuses native writes and preserves parked older queued intent. This is not the complete writer/draft/version/offline cutover or a changed preview. Destination bridging, complete real controls, pending-work/old-temp identity migration, wider writers and independent database/original-object/source restore remain gates. Production and both Cloudflare hosts are unchanged; work remains uncommitted/unpushed. Tours/routing stay disabled.


## P04b.1 local explicit destination bridge — 5 November

Current canonical chain is102. The checked bounded bridge turns selected existing geographic destinations into Trip-owned saved pool identities without inventing visits, changing geography/catalog/media or overwriting an existing personal location. It checks observed Trip/category versions, current Direct places authority, preserved Trash and original retry intent. New saved rows use the actual bridge actor; old creators/overrides/revisions remain intact. Archived retained catalog sources stay archived. GET/migration DDL creates no user rows.

The explicit website command performs selected-Family preflight, one mutation and current snapshot readback. It carries original user/Family/person scope, and actual native queue tests prove account-switch parking without rebinding or deletion. Fresh102 / populated101→102,252 real DB cases, fourSQL suites and167 web orchestration/native-reader/cache/queue cases passed, with full typecheck, strict three-file lint, disposable build/16-RPC/credential scan,12-native/120-backend guards,39 ACL checks and DB error gates. Current canonical handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04b-destination-bridge-handoff.md`; current guarded runner: `rehearse_destination_bridge.py --reset-disposable`. Historical resets are not current.

Default native planner routes/writers, native presentation and both Cloudflare hosts remain unchanged. This removes the destination-identity prerequisite, not the full pool/form/visit/draft/version/offline cutover. Legacy/unassigned representation, other old queues, broader writers, transactional Trip dates/reorder and independent database/original-object/source restore remain gates. Work remains uncommitted/unpushed; Tours/routing stay disabled.


## P04c.1 observed saved-location editor — 5 November

Current canonical chain is103. New explicit existing-location editor APIs preserve original actor/Family/revision/layer and diff full forms against their served values. Catalog Description remains inherited unless intentionally changed; saved personal Notes stays separate. Private saves replace one observed unsubmitted typed intent atomically and return editor-scoped readback without touching published caches. Older frozen overrides remain preserved.

Fresh103/populated102→103,272 distinct real DB cases, four SQL suites and188 focused web cases passed. Three new tests render the actual unchanged native PlaceFormModal and drive Update. Full client typecheck, strict five-file lint, local build/18-RPC/public-credential scan,54 grant checks,12-native/120-backend guards and DB error gates passed. Canonical handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04c-location-forms-handoff.md`. Current guarded reset runner is `rehearse_location_forms.py --reset-disposable` on the qualified local image.

The new editor is opt-in; default planner routes remain unswitched. UI save is online-only; original-scope native queue protocol is tested, not complete offline optimism/older-queue migration. Next coordinate selected-occurrence form/time/notes before the full default read/write/draft/revision/queue cutover. Whole-operation refusal of unsupported uploads/image/time fields prevents partial saves. Broader writers, dates/reorder, legacy/unassigned representation, full adapted desktop/phone demos, hosted timezone qualification and independent DB/object/source restore remain gates. No preview/production/browser release proof is claimed. Work remains uncommitted/unpushed; ignored ETL remains untouched and independently unpreserved. Tours/routing stay disabled.


## P04d.1 selected native form — 5 November

Current canonical chain104. The explicit selected-visit editor atomically saves location fields, occurrence Notes and complete clock intent. One private compound operation stays isolated until checked approval, with original scope/revision retries and atomic replacement. Repeated visits remain separate; source inheritance, exact unchanged legacy Notes and subsecond/midnight instants survive. Unknown/ambiguous clocks or implicit day changes fail before partial saves.

Fresh104/populated103→104,301 distinct DB cases, four SQL suites, three replay-authority probes,78 grant checks and210 focused web cases passed. Three new real native modal Update cases cover combined values, no-op and private reopen. Full typecheck, strict six-file lint, local build/20-RPC/credential scan,12-native/120-backend guards and DB error gates passed. Canonical handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04d-selected-visit-forms-handoff.md`.

The editor remains opt-in/online-only; queue protocol proof does not complete default offline optimism or old/temp intent migration. Next coordinate actual pool/day/form read/write/draft/version/pending identities and full adapted desktop/phone flows. Uploads/new creation/import/export/categories, dates/reorder, legacy/unassigned representations, hosted timezone qualification and independent DB/object/source restore remain gates. Default routes/production/previews unchanged; Tours/routing disabled. Work uncommitted/unpushed; ignored ETL untouched, independent source preservation unproved.


## P04e.1 scoped private snapshot/cache prerequisite completed locally

Canonical specifications: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04e-private-planner-view-contract.md` and `p04e-private-planner-view-handoff.md`. The105-chain read-only view combines current saved/visit/day state and one author's typed pending operations without writes or partial private overlays. Legacy/stale/overlapping intent is retained as a blocker. Native list consumers have an optional read-only persistence port; checked scoped IndexedDB snapshots separate API/user/Family/person/Trip/layer and retain variant descriptors for bounded offline reads. Online requests revalidate authority; denial cancels older readers before cache publication. Generic native caches and old queued intent remain untouched by this rehearsal.

Default runtime is still unswitched: legacy bundle reads and split actual form callbacks require the next coordinated writer/read/queue packet. Do not install new reads alone. Legacy/unassigned representation, new-create/upload/import/export/category writer coverage, blocked-draft resolution, adapted desktop/phone demo and independent restore remain explicit gates. The qualified105-chain disposable rehearsal is the current local command; older chain commands are historical. No hosted or preview change is implied.


## P04f.1 first native startup/editor/queue cohort verified locally

Canonical contract/handoff: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04f-native-planner-cohort-contract.md` and `p04f-native-planner-cohort-handoff.md`. Actual native Trip store loading, opener/Update callbacks and save/reload now use scoped snapshots and original observed atomic form commands in an explicitly installed composition. Retained cross-domain location links are bridged or refused, not guessed. Strict original-source/user/Family/person/operation packets replay through the native queue; older requests are parked intact. Generic native caches are not filled with private state.

This is not default activation. Complete native creation/day/assignment writers, legacy controller/governance handoff, retained-data/blocked-intent handling and scoped offline startup before switching bootstrap. Then prove adapted desktop/phone flows and independent recovery before preview/release. Current source chain stays105; no new migration or hosted/preview change occurred.


## P04g.1 implementation update — 5 November

Native New place (manual pool/day-only) and Add to day (committed saved locations/repeat visits) now use one original-scope atomic creation command in the explicit cohort. Private typed intents, snapshot reload and native queue replay are covered; interrupted acknowledgements retain the original operation rather than duplicating a changed form. Unsupported inputs refuse before partial writes. Default bootstrap remains legacy; this is not a deployed cutover.

Fresh106/populated105→106,350 distinct real DB cases,493 web cases (318 Family+175 native), four SQL suites,90 grants, client typecheck, strict lint, local-target build and12/120 source guards pass. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04g-native-creation-*`. Current runner: `rehearse_native_creation.py --reset-disposable`.

Next complete native assignment/day commands, controller/governance handoff, retained/blocked intent behavior and scoped offline startup before local activation/adapted desktop-phone proof. Provider/catalog creation UI, unknown-zone timed manual stops and file uploads remain explicit gaps. Independent DB/original-object/source restore and hosted qualification remain release gates. Production/previews unchanged; ignored ETL untouched and not independently backed up; work uncommitted/unpushed.


## P04h.1 native assignment arrangements — 5 November

Move/Remove/Reorder/Clear day now enter an atomic original-observation command in the explicit native cohort. Published Remove/Reorder Undo preserves identity; private arrangements use one checked typed intent and read-only projection. Timed local clocks/zone/precision, repeat visits, notes and independent bookings/media survive. Stale membership/revisions, DST ambiguity and overlapping private intent refuse the complete operation.

Fresh107/populated106→107,381 distinct DB cases,523 web cases (346 Family+177 native), four SQL suites,99 grants, typecheck/lint/local-target build and12/120 source guards pass. Current runner: `rehearse_visit_arrangements.py --reset-disposable`. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04h-native-assignment-*`.

Default runtime remains legacy. Next are day/date and remaining inline writers, controller/governance/blocked-intent and scoped offline cutover, then local desktop/phone proof. Move/bulk-Clear/private Undo, broad Trash UI, hosted qualification and independent DB/original-object/source restore remain incomplete. Production/previews unchanged; ignored ETL untouched and not independently backed up; work uncommitted/unpushed.


## P04i observed calendar foundation — 5 November

Native title, append-at-end and explicit end-date extension now use an original-observation transaction in the explicit cohort. Server-owned day revisions, whole-calendar conflict checks and retry receipts preserve existing day/visit/booking/media identities and content. Actual native hooks/store, HTTP coordinator and IndexedDB queue are covered. Middle insertion/reorder/delete/shrink/rebase, private calendar authorship and booking shifts remain guarded pending recovery-aware commands.

Fresh108/populated107→108,408 distinct DB cases,594 web cases (381 Family+213 native), four SQL suites,111 grants, typecheck/lint/local-target build and12/120 source guards pass. Current runner: `rehearse_trip_calendar.py --reset-disposable`. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04i-observed-calendar-*`.

Default runtime remains legacy. Next: calendar recovery/proposal and remaining inline writers, controller/governance and scoped offline cutover, then local desktop/phone proof. Independent DB/original-object/source restore and hosted qualification remain outstanding. Production/previews unchanged; ignored ETL untouched and not independently backed up; work uncommitted/unpushed.


## P04j recoverable whole-day order

The explicit native cohort now reorders existing days transactionally and exposes exact server-backed Undo. Day/visit identities and day notes follow the movable day; confirmed booking timestamps and civil dates stay fixed, with booking day anchors realigned. Direct reservation authority is required for day-bound bookings. Unresolved planner/booking proposals, unknown legacy timing, orphan notes and DST ambiguity block the entire operation without discarding data. Stale Undo cannot replace later work.

Fresh109/populated108→109 and the final31-case calendar-order suite qualify the amended migration.439 distinct DB cases,613 web cases (400 Family+213 native), four SQL suites,114 function/12 table privilege checks, typecheck/lint/local-target build and12/120 source guards pass. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04j-recoverable-day-order-*`. Current runner: `rehearse_trip_day_order.py --reset-disposable`.

Default bootstrap/legacy boundary remain unchanged. Insertion/deletion/shrink/rebase, private calendar authorship, remaining writers/controller/offline and independent backup/restore remain incomplete. Production/previews unchanged. Ignored ETL remains untouched and not independently backed up. Work remains uncommitted/unpushed.

## P04k recoverable dated day insertion — 6 November

The explicit native cohort now inserts a dated day at any position, preserving existing day/visit identities, day notes, named-zone clocks, media and booking dates/confirmed instants. Exact server-backed Undo archives and removes only its still-empty created row after checking every declared day reference plus date-owned notes. Later content/scope/authority changes refuse recovery. Native history retains the identical Undo after transient failures; stale post-Undo refreshes cannot report success. The selected removed day is cleared only after successful recovery. Native Add without date is explicitly refused in this dated cohort; no date is invented.

Fresh 110/populated 109→110, the final 31 insertion cases, 470 distinct real DB/Auth/TOTP AAL2/HTTP cases, 643 web cases (427 Family +216 native), four retained SQL suites, 120 function/36 table privilege checks, typecheck/strict lint/local-target build/25-RPC credential scan and 12/120 source guards pass. Repeated cases are counted once. Existing warning findings and the corrected initial test-lint warning are retained in evidence. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04k-recoverable-day-insertion-*` and `evidence/p04k-2026-11-06/`.

General existing-day Trash/deletion/restoration remains the next recovery packet. Private calendar proposals, remaining inline writers/controller/governance/blocked-intent/offline cutover, default activation, adapted desktop/phone walks, hosted qualification and independent database-plus-original-object/source restore remain incomplete. Default bootstrap/legacy boundary, production and both previews are unchanged. Ignored ETL remains untouched with zero tracked files and no independently proven source backup. Work is local, uncommitted and unpushed. Current guarded runner: `python3 supabase/tests/rehearse_trip_day_insertion.py --reset-disposable` from FamilyTravelApp, marked disposable API 55331/DB 55332 only; earlier runners are historical.

## P04l exact recovery for unreferenced existing days — 6 November

The explicit native cohort removes/restores an existing dated day only when it has no retained child references. Its UUID, title and creation metadata survive with monotonic revisions; survivors compact atomically and exact Undo restores original bounds/order/instants. Confirmed bookings stay on their dates. Visits (including Trash), notes, booking/file references, disappearing-date bookings and pending planning changes block removal without cascades. This is not populated-day aggregate Trash or general deletion.

The native question binds its original account/source/layer/observation; stale display and switched scope require reopening it. Native history retains exact transient recovery retries. Actual confirmation/history/HTTP/IndexedDB tests include cancel, duplicate clicks, lost replies, forged identities, queued replay after cohort release and foreign parking. Default/native presentation stays unchanged. Legacy direct store deletion stays guarded in the cohort.

Fresh 111/populated 110→111 and 27 core recovery cases plus a supplemental legacy-sync proof pass with the exact migration hash captured before application and rechecked at completion. 498 distinct DB/Auth/TOTP AAL2/HTTP cases, four retained SQL suites, 850 web cases (447 Family +403 native, including 187 controller cases), 123 function/60 table privilege checks, typecheck/strict lint/local-target build/25-RPC credential scan and 12/120 source guards pass. Existing DB warnings and corrected initial failures are retained. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04l-unreferenced-day-recovery-*` and `evidence/p04l-2026-11-06/`.

Next is populated-day recovery, then private calendar proposals/remaining writers/controller/governance/blocked-intent/offline activation and adapted desktop/phone proof. Default bootstrap/FamilyTripBoundary, production and both previews remain unchanged. Independent DB-plus-original-object/source restore and hosted qualification remain release gates. Ignored ETL was untouched, has zero tracked files and has no independently proven source backup. Work remains local, uncommitted and unpushed. Current guarded runner: `python3 supabase/tests/rehearse_trip_day_recovery.py --reset-disposable` from FamilyTravelApp, marked temporary API 55331/DB 55332 only. Earlier packet runners are historical.

## P04m recoverable day visits and notes — 6 November

The explicit native cohort now uses `trash_day` / `restore_day` to retain a selected day with typed visits and day notes. Visits keep their identities, clocks, time zones, notes and independent relationships; note rows keep their IDs, body, icon, order and timestamps. Exact immediate Undo restores the original day and children with monotonic revisions; prior independently trashed visits stay trashed. Shared catalog/media, saved-location notes, visit-linked bookings without day anchors and independent Journey stories stay intact. Older unreferenced-day APIs remain compatible; a reproduced child-only date restoration bypass is fenced so it cannot strand retained contents.

Selected-day files, all day-bound bookings, pending planner/booking proposals, Private and Propose-only changes remain protected and unsupported. Exact observation/scope/current authority/operation IDs, stale/lost-reply handling, native history and original-scope HTTP/IndexedDB replay remain enforced. Later work can invalidate the immediate Undo token; a durable Trash browser and conflict-aware recovery are separate gates.

Final-source fresh 112/populated 111→112 qualification passes all 42 new real DB/Auth/TOTP AAL2/HTTP cases on both paths, plus the 28 prior day-recovery cases and four retained SQL suites. The earlier-draft broad run passed 534 distinct functional cases but its final metadata check failed because the harness reused its saved baseline variable; that instrument error and the genuinely failing child-only restore reproduction are retained. A genuine HTTP timeout exposed automatic retries of a deliberate serialization error; aggregate conflicts now return non-retriable HTTP 409 and unsupported child-only recovery uses the existing unsupported-operation code. The corrected final runner records the original baseline and proves it unchanged. Across broad/final runs 540 distinct DB case IDs pass; no duplicate fresh/retry cases are counted. 866 web cases (463 Family +403 native, including 187 controller cases), client typecheck, strict lint, local-target build/25-RPC credential scan, 135 function/120 table privilege checks and 12-native/120-backend source guards pass. Applied migration hashes are captured before application and rechecked at completion; draft/final receipts are separate. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04m-day-visit-note-recovery-*` and `evidence/p04m-2026-11-06/`.

Next are file-linked-day retention/cleanup-race proof and booking date-anchor recovery. Broader history/Trash/conflict handling, private calendar proposals, remaining writers/controller/governance/offline activation and adapted desktop/phone proof remain incomplete. Default bootstrap/FamilyTripBoundary, production and both previews are unchanged. Independent DB-plus-original-object/source restore and hosted qualification remain release gates. Ignored ETL was untouched, is Git-ignored with zero tracked files and has no independently proven source backup. Work remains local, uncommitted and unpushed. Current guarded runner: `python3 supabase/tests/rehearse_trip_day_contents.py --reset-disposable` from FamilyTravelApp, marked temporary API 55331/DB 55332 only; earlier runners are historical. Journals and retained volumes are not independent backups.

## P04n day attachment and original-file recovery — 6 November

The explicit native cohort now retains selected-day attachment links without trashing shared documents or changing their original paths/bytes. Exact immediate Undo restores the same link/day/file identities; independent prior Trash and other day/booking/destination links remain intact. Typed archive FKs and immutable history retain original-file references after restore/unlink; permanent history-aware purge is not installed. Cleanup shares the Trip fence: retention first makes revalidation skip; armed deletion first makes day removal refuse. Missing Storage metadata and future incoming link references refuse the whole operation. Current attachment metadata authority is checked before execution and before cached receipt replay.

The real file handler-to-planner contract exposed missing nullable native DTO fields. The Family adapters now supply the native file-list/link-read contract using actual uploader identity and null for unavailable values, keeping explicit original opening and native presentation. Tests cover native confirmation/history, lost replies, ordinary HTTP and IndexedDB replay with boundary fakes; database tests use real authorization, Auth/TOTP and Storage bytes. 118 distinct final-source real DB/Auth/TOTP AAL2/HTTP cases (30 attachment cases on both fresh 113 and populated 112→113, 42 prior content cases, 28 prior day-recovery cases and 18 Trip aggregate cases), plus 885 web cases (472 Family cohort +10 existing adapter +403 native, including 187 native controller cases). 150 function and 132 private-table privilege checks pass. Five retained SQL suites, typecheck, strict cohort lint, unchanged/improved existing adapter lint findings, local-target build/25-RPC credential scan and 12-native/120-backend preservation guards pass. Applied final migration hashes, prior operation restoration, initial failed fixtures, actual DTO/replay failures and the pre-replay-fix draft are recorded separately. Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04n-day-file-recovery-*` and `evidence/p04n-2026-11-06/`.

Overall: recovery and location/visit/timing foundations plus substantial planner orchestration are locally implemented; default rollout is still gated. Next is booking date/anchor recovery, followed by remaining private/calendar/writer/controller/governance/offline work, durable/conflict-aware recovery and adapted desktop/phone acceptance. Day-bound bookings and pending planning changes still block removal. Production, both previews and default startup are unchanged. Independent DB-plus-original-object/source restore and hosted qualification remain unproved. Ignored ETL was untouched, Git-ignored with zero tracked files and no independently proven source backup. Work remains local, uncommitted/unpushed. Current guarded runner: `python3 supabase/tests/rehearse_trip_day_files.py --reset-disposable`, marked temporary API 55331/DB 55332 only; earlier commands are historical. Retained volumes/history are not independent backups.


## P04o independent booking calendar dates — 6 November

Confirmed date-only bookings now retain dates independently of planning days, with checked saves, immutable typed history, active-Trip RLS and the service export allowlist. Fixed instants, existing booking identities and other content remain intact. Unresolved booking proposals block date edits. The explicit website API seam is tested; native booking displays/writers and booked-day recovery are still gated.

Canonical contract/handoff/evidence: `/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04o-booking-calendar-dates-*` and `evidence/p04o-2026-11-06/`.

Next: coordinated native date reading/writing and booked-day rebind/Undo, followed by the remaining release gates in the canonical handoff. Default startup, production and both previews are unchanged. The ignored ETL directory was not modified and has no proven independent source backup. Independent DB-plus-original-object/source restore remains unproved. Use only the current marked-stack rehearsal procedure in the contract; earlier packet commands are historical. Work is local, uncommitted and unpushed.


## P04p booked-day recovery and coherent booking reads — 6 November

The explicit native cohort now retains independent bookings across planning-day removal and exact Undo, without retiming confirmed reservations or inventing midnight for date-only/outside-calendar facts. Scoped coherent reads feed the native Bookings detail and planner/history/HTTP/IndexedDB paths; mismatched or invalidated snapshots refresh/refuse. Canonical source visits and endpoints remain preserved. Current reservation authority precedes cached replay, and held bookings refuse physical deletion. Pending proposals and armed-file deletion remain guarded.

Local qualification passes 249 distinct real DB/Auth/TOTP AAL2/HTTP cases: 29 booked-day cases on fresh 115 and populated 114→115, plus 220 retained booking/calendar/recovery cases. Repeated fresh/upgrade cases are counted once. Five retained SQL suites and 518 website cases pass, including 230 actual native planner orchestration cases. Client typecheck (8-GiB heap), strict module lint, local-target build/credential scan, 21 function/search-path checks, 12 private-table privilege/RLS checks, existing service-export grants and 12-native/120-backend source guards pass. Historical lint/advisor identities remain unchanged (16 / 382). The full historical DB and 403-case native suites were not rerun.

Canonical implementation/limits: [P04p handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04p-booked-day-recovery-handoff.md). These are synthetic DB/real-native-consumer cases, not signed-in browser or desktop/phone demo acceptance. Native booking form writes remain guarded; their observed writer/queue contract is next. Default startup, preview, production and image behavior stay unchanged. No feature-complete or deployment-ready claim is made. Local build targets the disposable API and must not be deployed. Independent DB/object/source restore and ignored-ETL backup remain unproved.


## P04q observed booking edit command/form/retry prerequisite — 6 November

The next safe existing-booking writer foundation is local: narrow atomic header/civil-date edits with original observations and current Direct authority; native full-form diffing preserves unchanged metadata and confirmed precision, including hotel/phone hidden fields. Unsupported companion edits refuse before any save. Actual shared form hooks, Family application/Axios and IndexedDB replay are tested. Native form callbacks are **not installed**; mandatory companion-action preflight and fresh coherent hydration are the next packet. This is not signed-in browser/phone acceptance or a deployed form change.

Final qualification passes 279 distinct real DB/Auth/TOTP AAL2/HTTP cases: 30 observed-booking cases on fresh116 and populated115→116, plus 249 retained booking/day/Trip recovery cases. The repeated new cases count once (309 total DB executions). Five retained SQL suites and 560 website tests pass, including 42 new native-form-hook/application/Axios/IndexedDB cases and 230 retained planner orchestration cases. Client typecheck with an 8-GiB heap, strict module lint, disposable-target build/credential scan, nine function/search-path checks, 12 private-table privilege/RLS checks, existing export grants and 12-native/120-backend source guards pass. The full historical DB and 403-case native suites were not rerun. Historical warning/advisor identities are compared with P04p in the evidence; their existence is not reported as zero.

Canonical scope/next steps: [P04q handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04q-observed-booking-edits-handoff.md). Existing native presentation, image variants, production/previews/default bootstrap and carried backend remain unchanged. No billing/schema deployment/transform setting/backfill/sync change. Independent DB/object/source restore and ignored-ETL source backup remain unproved. Local build targets the disposable API; do not deploy it.


## P04r supported native booking callbacks — 6 November

The existing desktop/phone forms now use observed saves for supported existing-booking detail/civil-date edits when the explicit Family cohort is installed. Full-action preflight and immediate file/cost guards prevent half-saves; durable original online intent survives lost replies and close/disposal. Current coherent reads refresh the UI. Creation/deletion, clock changes, linked lifecycles and automatic offline new-form authorship remain guarded.

Current P04r qualification: 767 website tests in 25 files, including 48 actual native booking-callback regressions, 232 planner-cohort cases and retained native booking/file/cost behavior; four additional real local HTTP/Auth/TOTP AAL2 tests through the actual desktop/phone forms; and 99 real database authorization/booking/calendar/recovery cases. Client typecheck, strict lint for the touched Family modules, local-target build/credential scan and 12-native/120-backend source guards pass. Four upstream native components retain the same 14 warning identities (line/complexity counts are recorded); database function lint retains 16 historical warning entries and advisors retain 382 identities. These are not zero-warning claims. No migration, reset or new SQL suite was run in P04r. P04q's fresh116/populated115→116 migration rehearsals, 279 distinct database cases and five SQL suites are prior evidence, not newly rerun results.

This is jsdom native-consumer and real local HTTP evidence, not signed-in hosted/browser/phone visual acceptance. No default startup or preview activation. Canonical [P04r handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04r-native-booking-callbacks-handoff.md) defines the next controller/governance/blocked-intent and release gates. Adapted TREK demo fixtures remain a local/preview acceptance task; synthetic test data is not written to production.

Production and both Cloudflare previews remain unchanged. Default `bootstrap.ts` and `FamilyTripBoundary.tsx` remain pinned; this is an explicitly installed development cohort, not default startup activation or a deployed UI change. Native layout/styles and the carried backend source guards pass. Tours remain disabled. No hosted migration/deployment, full sync/inventory/backfill, billing or transformation-setting change occurred. Work is local, uncommitted and unpushed. Ignored ETL source was untouched, remains Git-ignored with zero tracked files and has no independently proven source backup. Independent DB-plus-original-object/source backup and restore remain unproved; journals and retained local volumes are not independent backups.


## P04s retained-command conflict safety — 6 November

The original native queue's prefer-server behavior reproduced deletion of a Family command. Versioned commands and parked native cohort work now retain their original body/scope/UUID/token. Generic auto-strategies cannot overwrite/discard them; exact retry and unsupported-resolution messages are proved through actual desktop/phone settings, IndexedDB and HTTP. Blocked discard starts no full sync. The larger governance/controller seam remains incomplete; the typed reader loses v2 details and submission still needs coordinated original intent.

P04s passes 928 website tests in 37 files: the retained P04r native/Family tests, 31 new real queue/settings regressions, one new installed-cohort/application regression, the complete 10-file native mutation-queue test set and the existing desktop offline-settings suite. The new tests exercise actual IndexedDB, Axios/HTTP orchestration and unchanged desktop/phone settings controls with HTTP/sync boundaries faked. Typecheck, strict touched Family/new-module lint, local-target build/credential scan and 12-native/120-backend source guards pass. The two edited native infrastructure modules retain the same 22 normalized warning identities; raw before/after line/complexity counts are recorded. Tests run with TZ=UTC, as required by an existing settings date-format assertion. This is not full browser/phone visual acceptance. No database, migration, SQL or live AAL2 suite was rerun: P04r's 99 DB and four live native HTTP cases, and P04q's migration/SQL/ACL proofs remain historical evidence. The unchanged chain contains 116 migrations.

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04s-retained-planner-commands-handoff.md) includes the supported-action matrix and the next typed governance/controller packet. No default activation or hosted UI change. Unsupported export/discard/rebase, offline/cache-clear, demo acceptance and independent restore remain gates.

Default bootstrap/FamilyTripBoundary, production and both previews remain unchanged. Native desktop/phone settings markup was not changed; existing notices report retained-work refusals. No hosted migration/deployment, full sync/inventory/backfill, billing or transformation change occurred. The full-sync manager was faked in tests, including assertions that blocked discard never invokes it. Work remains local, uncommitted and unpushed. The disposable stack remains stopped with retained volumes. The build targets the disposable API and must not be deployed. Ignored ETL source was untouched, remains Git-ignored with zero tracked files and has no independently proven source backup. Independent DB-plus-original-object/source backup and restore remain unproved.

## P04t observed governance and controller handoff — 6 November

The explicit cohort now preserves full typed proposal JSON, captures exact native confirmation/request observations and submits/reviews one durable original command. Concurrent changes refuse; current authority precedes receipt replay; bulk failures roll back all publication. Layer changes fence native editors and stale/released legacy controllers cannot overwrite the cohort. The live native-control test also exposed and repaired an unhandled post-review read. Existing presentation remains intact.

Final local qualification: 964 focused website cases in 38 files, including 33 new actual governance-control/HTTP/IndexedDB regressions and three new installed-cohort/controller cases. Two additional tests use real local Auth/TOTP AAL2, the Supabase SDK/HTTP, native confirmation and review buttons, the full cohort reader bundle and fresh native-store hydration. They prove one real typed publication and refusal of a draft operation added after confirmation opened. No production browser or full desktop/phone visual acceptance is claimed. Typecheck (8-GiB heap), strict lint for the new/touched non-legacy adapters, disposable-target build/credential scan and 12-native/120-backend preservation guards pass. The explicitly linted carried controller/governance modules retain 108 existing findings, including one pre-existing prefer-const error; the hook rename is normalized in the comparison. This is not a clean whole-repository lint claim. DB function lint retains the same 16 historical entries and advisors the same 382 identities, with no new governance findings.

The new suite has 45 cases (24 new governance cases plus 21 inherited proposal cases). It passed on fresh117 and populated116→117. Retained booking-details30 and day/bookings29 cases also passed: 104 distinct database cases, 149 executions. Migration rehearsal proves old public/family_auth row hashes and function definitions/OIDs/grants unchanged, private payloads unchanged, a read is pure, prior day Trash restores original visit/note/file-link identities and original test-object bytes, and a genuine booked midnight retains microseconds. Explicit probes cover 12 function/search-path checks, 12 receipt-table privilege checks, RLS and three preserved export grants. These fixture proofs do not establish independent disaster recovery.

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04t-observed-governance-handoff.md) defines the completed scope and next retained-work recovery/default-offline lifecycle packet. The current local runner is `supabase/tests/rehearse_plan_governance.py --reset-disposable`; all earlier runners/chain counts are historical. No default activation or hosted UI change.

Production, both Cloudflare previews, default bootstrap and FamilyTripBoundary remain unchanged. No hosted migration/deployment, full sync/inventory/backfill, billing or transformation-setting change occurred. No media recipe, original image, media identity, gallery order or legacy API body/grant was changed. The first116 migration sources are unchanged; the local chain now has117. Work remains local, uncommitted and unpushed. The disposable stack is stopped with volumes retained; the older FamilyTravelApp local database remains running with unchanged identity/migration metadata. The local-target build must not be deployed. Ignored ETL source was untouched, remains Git-ignored with zero tracked files, and has no independently proved source backup. Independent DB-plus-original-object/source backup and restore remain unproved.

## P04u retained-work export and cache-clear protection — 6 November

A real pre-repair regression reproduced loss of original commands through Clear cache. The repaired operation refuses within its all-table transaction; existing desktop/phone settings report the refusal and offer a private local export. The export preserves full original queue rows/dependencies and never triggers sync, replay or discard. Enqueue-time retention marking survives disposal before the first flush.

P04u passes1,071 focused website cases in42 files: the964 retained planner/settings/queue cases,35 new export/cache/settings regressions and72 native IndexedDB/cache/upgrade cases. The new cases exercise actual Dexie transactions, the real mutation queue and desktop/phone settings controls, with browser-download/network/sync boundaries faked. They cover every retained status, complete original bodies/IDs/tokens/unknown JSON, dependencies, atomic refusal and rollback, export failure/bounds/credential and unsupported-data refusal, account-connection fencing and preservation after cohort disposal before a flush. No full sync ran. Client typecheck (8-GiB heap), strict new/touched adapter/database lint, local-target build/credential scan and12-native/120-backend preservation guards pass. Four edited existing settings/queue modules retain the same39 normalized warning identities; raw line/complexity values remain in evidence. No new lint suppression was added. TZ=UTC remains necessary for an existing settings date assertion.

No PostgreSQL migration, real Supabase HTTP/Auth suite, SQL authorization suite or signed-in browser/phone visual acceptance was run in this packet. P04t's fresh117/populated116→117,104 distinct DB cases and two real native HTTP tests are historical evidence, not rerun results. All117 migration sources remain byte-for-byte unchanged; the marked disposable stack stayed stopped.

The separate logout audit still reproduces loss through the unchanged database-deletion path. It is a release blocker, not a passing recovery proof. [Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04u-retained-export-cache-guard-handoff.md) prioritizes coordinated logout/account/queue/connection recovery before default activation, broader demo acceptance or preview release.

No production or Cloudflare-preview change, default cohort activation, schema migration, billing/transformation change, image generation/backfill, inventory or sync occurred. The default bootstrap, FamilyTripBoundary, Auth store, legacy server APIs, media recipe/originals/identities/gallery order and carried backend remain unchanged. The conditional export action is the only added settings presentation; existing desktop/phone styles and controls are retained, with English fallback labels. Work remains local, uncommitted and unpushed. The build targets the stopped disposable API and must not be deployed. ETL was untouched, remains Git-ignored with zero tracked files and has no independently proven source backup. Independent DB-plus-original-object/source backup and restore remain unproved.

## P04v logout recovery and queue session boundaries — 6 November

The P04u loss path is now repaired locally. Original Family commands and following queued work stay paused in their original account on logout; read caches/visible Trip data clear. Native auth and queue callbacks are fenced across teardown and re-login. Explicit supported retry keeps original identity/current authority, while unscoped native recovery stays export-only. Queue format 2 preserves recovery semantics; physical IndexedDB schema 14 and all 117 PostgreSQL migration sources are unchanged.

Final P04v qualification passes 1,179 focused website cases in 47 files: the 1,071 retained cases, 39 new real logout/auth/queue/settings regressions and 69 additional native auth/push/cache/sync-trigger cases. The new tests use actual IndexedDB, native authStore logout/login, the queue, desktop/phone retry controls and the checked Family application/Axios handler; external HTTP/RPC/download/sync boundaries are faked. They cover all retained statuses, mixed dependencies, original bytes/IDs/tokens/unknown fields, lost acknowledgements, late success/403/409/500/network replies into another or the same returning account, storage readiness/cleanup/pause failures, changed user/person/Family/source, current revoked authority, stale auth completions, repeated clicks and bounded queue waiting. Full trip sync is faked and never run against a project.

Two additional local SDK tests use Supabase SDK/Auth 2.112.2 with persistent browser storage and the actual carried Family logout route. Successful remote logout and a simulated 500 Auth response both remove the installed SDK's persisted/local session, finish native sign-out, clear read caches and retain originals only in their old account. SDK HTTP login is real; only the 500 sign-out response is faked. The synthetic accounts have no production data. These are Auth tests, not new SQL/RLS/migration proofs. A separate captured pre-packet format 1 queue probe passes one case proving it leaves pending recovered format 2 work unsent and intact. It does not prove old clear/discard UI or an entire rollback release.

Client typecheck (8-GiB heap), strict new/session/cache-module lint, local-target build/credential scan and the 12-file native/120-file backend source guards pass. The existing authStore and mutationQueue retain the same 33 normalized warning identities, with raw line/complexity values recorded and no new suppression. No full website suite or signed-in browser/phone visual acceptance was run. No PostgreSQL migration/reset or SQL authorization suite was rerun; all 117 migration sources remain unchanged. P04t's DB/RLS proofs remain historical evidence.

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04v-logout-recovery-handoff.md) advances the remaining work to broader default/offline/background-reader/full-sync/source/cross-tab/rollback qualification and adapted desktop/phone acceptance. No default or hosted rollout is implied.

Production and both Cloudflare previews remain unchanged. No default cohort activation, hosted schema/migration, billing/transformation change, backfill/inventory or real project sync occurred. Stored variants/approved recipe, originals, media identities/gallery order, the default bootstrap/FamilyTripBoundary and carried backend remain unchanged. The physical IndexedDB schema stays 14; the queue wire-format guard is now 2. Existing native markup/styles and server API contracts are unchanged. Work remains local, uncommitted and unpushed. The disposable stack is stopped with retained volumes; the other local database remains running with unchanged identity/migration metadata. The disposable-target build must not be deployed. ETL was untouched, remains Git-ignored with zero tracked files and has no independently proven source backup. Independent DB-plus-original-object/source backup and restore remain unproved.

## P04w background trip-cache session isolation — 6 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04w-background-session-handoff.md) qualifies captured connection/epoch protection through native login/logout, actual trip sync and background/optional cache paths. Final results: 1,374 focused tests/55 files, typecheck, local build/credential scan and native/backend source guards pass; no new lint findings. This packet ran with fake HTTP/download boundaries only. No migration, real project sync or deployment occurred. P04v retained originals remain preserved. Next: native startup/UI hydration and reconnect continuations, then Family scope/cross-tab/rollback and adapted browser acceptance. Independent restore and ETL source backup remain unproved.

## P04x startup/UI-read/reconnect isolation — 7 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04x-startup-read-session-handoff.md) records 1,686 focused tests/85 files, including 28 new orchestration regressions, plus typecheck, build/credential scan and source guards. Named native reads/settings/feature metadata and reconnect continuations are scoped to their origin. No new lint findings or suppression, database run, migration or deployment. Next: direct write/upload completions and Family scope transitions, then cross-tab/rollback and adapted browser acceptance. Independent restore and ignored ETL source backup remain unproved.

## P04y direct write/upload completion fencing — 7 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04y-direct-write-session-handoff.md) records 1,888 focused tests/100 files, including 18 new orchestration regressions, plus typecheck, build/credential scan and native/backend source guards. Named direct writes, uploads, queue waits and view rollbacks stay with their origin; server commits are not undone or automatically replayed. No new lint findings/suppression, database run, migration or deployment. Next: Family context cache/controller ownership, then remaining paths, cross-tab/rollback and adapted browser acceptance. Independent restore and ignored ETL source backup remain unproved.

## P04z Family context ownership — 7 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04z-family-context-handoff.md): 1,935 focused tests/105 files, 35 new context/request cases, passing typecheck, build/credential scan and native/backend guards. Canonical caches and repository continuations belong to source/user/person/Family plus itinerary layer; stale authority cannot dispatch writes. Stable numeric IDs, retained originals and separate Published/MyDraft snapshots remain intact. No new lint findings/suppressions, database run, schema change or deployment. Remaining handler follow-up dispatch, Auth-derived stores/realtime, other paths, cross-tab/rollback, adapted browser acceptance and independent restore still gate release. Ignored ETL source backup remains unproved.

## P04aa Family Auth/handler/realtime continuations — 7 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04aa-family-continuations-handoff.md) records 1,984 focused tests/109 files, including 36 new actual orchestration cases; typecheck, local build/credential scan and source guards pass. Context-owned Auth flights and stores, per-call handler facades, scoped map cache, MFA assurance/access distinctions and realtime/install cleanup are qualified locally with fakes. No new lint findings/suppressions, SQL/Auth run, schema change or deployment. Internal composite adapters, remaining native caches/jobs, cross-tab/rollback, signed-in browser acceptance and independent restore remain gates. Ignored ETL source backup remains unproved.

## P04ab backend operation continuations — 7 November

[Latest handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/p04ab-backend-operations-handoff.md) records 2,037 client tests/111 files (34 new orchestration cases and 19 existing Collection cases newly included), 269 backend tests/47 files, ten actual carryover-command tests, both typechecks, source guards and local-only build/credential/variant-reader scan. Touched-client lint adds no findings. Six carried adapters and one existing test now have explicit verified local patches; the 120-file baseline is intact, with one recorded helper addition. Uploaded sources are retained after unconfirmed finalization errors. Other composite adapters and remaining native caches are not qualified by this packet. No new SQL/Auth run, schema change, real project sync or deployment. Independent restore and ignored ETL source backup remain unproved.
