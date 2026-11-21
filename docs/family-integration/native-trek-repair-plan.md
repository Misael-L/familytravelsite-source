# Native TREK presentation and Family connector repair plan

Date: 31 October 2026. Clarified after the subsequent matched screenshots and bounded read-only checks. Execution checkout: `/Users/Misael/Downloads/FamilyTravelSite`. Integration branch: `codex/trek-v5-family-integration`. Read this entire file before changing code. This is a sequenced execution contract for a lower-cost coding model; do not reinterpret it as permission to redesign the UI.

## 9 November 2026 upstream reconciliation order

The owner has prioritized reconciling the complete upstream version gap before additional packing UI wiring. Follow [the upstream update workflow](upstream-update-workflow.md). Current application pin remains 5.0.1; the candidate target is complete 5.1.2, commit `5cfc7a602a21598039668387f749f5a419e69bc9`. Read-only U01 inspection and temporary merge rehearsal do not adopt that release. Preserve the qualified Family work and its tests. Resume native packing controls after the full-version candidate passes its contract/regression gates. No hosted schema/settings, production or preview deployment, billing, media backfill or transformation change is authorized by this ordering update.

## 0. Wider backend program (3 November update)

The owner has now requested a broader database/feature architecture plan. Read [the full TREK feature plan](trek-feature-onboarding-plan.md), [demo-derived validation plan](demo-fixtures-and-validation-plan.md) and the canonical `FamilyTravelApp/docs/backend-modernization/README.md`. This repair document retains its bounded native presentation/connector scope; it is not authorization to apply the wider proposed SQL. The broader program is website-first, preserves native UI and variant readers, and prioritizes recoverable personal content. Participants remain deferred under the owner's earlier instruction; the owner observed them appearing.

## 1. Product contract and boundaries

Use TREK's native v5 frontend and connect the Family backend to its contracts. Preserve native layouts, dialogs, menus, map engines, day controls, phone sheets and gallery presentation. Do not mount the old Family frontend inside the native frontend. Thin typed adapters, permission/capability checks, native error reporting and image-role selection are legitimate connectors; replacement views are not.

The exact source baseline for this restoration is TREK **5.0.1**, commit `a0943f8226269bc192c1cda992fbac33333337a1`, already imported as `trek-v5.0.1`, from https://github.com/liketrek/TREK. Do not mix selected files from latest upstream/main into that baseline. A later v5 release upgrade is a separate whole-version integration task.

Current repair restrictions: no schema, RLS, production deployment, billing, transformation settings, full sync, full inventory, verification or backfill operations. No originals, media IDs, canonical URLs, gallery order, trip records or UUID identities may be rewritten. Tours, Roadtrip and Collab remain unavailable until their backend contracts are implemented. Keep PUBLIC/anon restrictions and Family write policies intact. A build passing is not evidence that a workflow works.

The existing production Worker is `familytravelsite`. Only the separately authorized `familytravelsite-integration-preview` can be used for a preview update. Root `wrangler.jsonc` names production: every preview command MUST explicitly include `--name familytravelsite-integration-preview`. Pushing the integration branch is not authorization to merge main or deploy production.

## 2. Established facts; do not repeat expensive discovery

- The original native import is the exact upstream baseline. Commit `bdb7a674b9e60120d75dfd1214593afa31cfae7e`, 30 October 2026 at 13:55:32 EDT, subsequently mounted legacy Family governance/Explore UI and installed Family map/timeline substitutions while connecting the backend. This bundled presentation carryover into backend integration.
- The native `PlaceInspector`, `PlacePhotoGallery` and `usePlaceGallery` were unchanged from that baseline when the issues were reported. Missing optional sections are therefore often caused by their input DTOs, not deleted JSX.
- `client/src/integrations/family/views.ts` assigns `row.notes` to BOTH `description` and `notes`.
- `family-backend/src/data/supabase/tripPlaces.ts` reads a narrow destination projection and assigns only the cover's ready thumbnail to `imageUrl`. `FamilyViews.place` exposes that as native `image_url`. The native gallery uses the same URL for its first slide.
- A bounded read-only production check found Puebla `649f70d3-e660-416b-83ea-6bb378907bfe`: City, Puebla state, Mexico, `America/Mexico_City`, 688 characters of catalog notes, one trip link, no custom Family category, ZERO schedule rows. It is an unscheduled destination, not a scheduled visit. No street-address column exists on generic `places`.
- Puebla's manifest has ready v1 thumb **192×128 / 10,564 bytes** and hero **1200×799 / 300,264 bytes**. This was a manifest read, not a new object-byte verification. No regeneration is needed to solve the image-role bug.
- Native Participants appears only with a selected assignment and more than one trip member. Missing/empty native assignment participants means everyone joins. Family's `trip_travelers(person_id)` joins `people(display_name,color)` and already supplies the trip roster. That is distinct from per-visit attendance. `schedule_items.advocate_person_id` is NOT a participant list. No per-visit many-to-many attendance connector or save handler is implemented.
- Generic places, hotel/food/experience entities and scheduled occurrences have different data/identity scopes. Do not flatten a food or experience's details into its containing city's identity.
- The later matched screenshots DO show the native day rail and native places sidebar. Missing Days/Roadtrip and Categories controls have separate conditional causes below; do not dismiss this evidence as a screenshot mismatch or stale cache.
- `TripPlannerPage.tsx` renders `RoadtripModeSwitch` only when `enabledAddons.roadtrip` is true. The Family `/addons` handler explicitly sets Roadtrip false and filters disabled add-ons out. The restored native source therefore still hides this switch. The demo has this capability enabled. Copying the same JSX does not supply its backend.
- `PlacesSidebarHeader.tsx:CategoryFilter` returns null when `categories.length === 0`. The tag-shaped right-hand control is **Categories**, not a separate tags feature. A bounded read-only check of Mexico trip `123f4667-76da-4471-9975-56294fa5221d` found zero `family_place_categories` in its Family, six City destinations and two Town destinations; all eight have null `trip_places.family_place_category_id`. `places.place_type_id` is a different taxonomy/FK from the editable Family palette.
- Native top map pills call `mapsApi.pois` -> GET `/maps/pois` with category, viewport bounds and language. `applicationHandler.ts` has NO handler for that route; its fallback rejects it with HTTP 501 / `adapter_not_connected`. Empty optional plugin marker/layer responses do not implement this core route. Native map rendering was restored without finishing this connector; previous startup/browser tests did not toggle these pills.
- Existing legacy `data/supabase/catalogPois.ts:listCatalogPoisInBbox` already contains Family category/type-code and bbox queries; it is not reached by the native pills. Its hook `useWorkspacePois` also contains old presentation/source-switch/boundary behavior. Recover the data reader, not that hook or the old Family map UI. `/maps/search` currently returns city names with null coordinates and `/maps/autocomplete` returns no suggestions; these remain separate search-connector gaps, not proof that the catalog is empty.

## 3. Work already performed in this repair

Native planner/phone/map presentation is restored from the pinned baseline. The 12 exact files are enumerated in `docs/family-integration/native-presentation.json`; run `node scripts/family/check-native-presentation.mjs` to compare their bytes against the pinned Git object. This removes legacy governance/Explore mounts, map substitutions, native-map-chrome suppression and the custom timeline path from those native views. Atlas uses its native map renderer again; its existing unsupported-write guards stay in place. The native trip tab list uses native add-on conditions; actual Family add-on capability responses still disable unsupported domains.

Family backend/auth/permissions, typed identities, persisted data, variant readers and the invisible backend/controller boundary remain. Error-only partial-load retry is retained in the boundary's alert lane rather than inserted into the native day rail. Native optional plugin marker/layer reads return authenticated empty-provider responses only after trip access is checked; these are plugin contributions, not the trip's destination pins or Family catalog data. Unsupported contribution writes remain rejected.

This does NOT finish Description/Notes, full place metadata, the native catalog POI route, Roadtrip backend support, gallery resolution or every timeline semantic connector. Participant work is now deferred by the user; do not expand that domain. Read `native-trek-restoration-receipt.md` for actual tests, commit and deployment status. Never mark those remaining phases done from this section.

## 4. Execution discipline and setup

1. Read root/client `CLAUDE.md`, `docs/family-github-workflow.md`, `native-trek-restoration-receipt.md` and this plan. Inspect `git status --short` and `git log -5 --oneline`. Leave untracked `.cursor/` plans and other agents' work alone. Work on the integration branch or a `codex/*` topic branch targeting it. No force pushes, broad reset or generic `git add .`.
2. Use Node **24**, the existing lockfile and installed npm workspaces. Do not upgrade dependencies. Build commands run from the repository root with `--workspace=...`. In this machine Node 24.22.2 is installed under `~/.nvm/versions/node/v24.22.2/bin`.
3. The client uses native React/Zustand; the compatibility closure uses isolated legacy aliases. Do not merge their stores or introduce a second Supabase client. Preserve `family-backend/src` carryover unless a phase explicitly changes an adapter and updates its source-integrity record with the real reason.
4. Take one phase per scoped commit. First add a focused failing regression through the actual handler/repository/store/consumer boundary. Use fakes at HTTP/data-provider boundaries. Mocking the component under test, accepting every request, returning success from unimplemented writes, or merely asserting helper outputs is insufficient.
5. Do not edit a protected native presentation file to work around a DTO mismatch. Repair the adapter first. A small native data-contract extension is allowed only where native contracts cannot represent the required image roles or capability, with unchanged JSX/layout and tests for the original Nest path. Update the guard manifest only after documenting that explicit extension; never delete the guard to make tests green.
6. Stop a dependent phase on a missing data contract. Record exact evidence and continue independent phases. Do not invent fields, IDs, rows or successful writes. No long production jobs are part of this plan.

## 5. Phase A — lock native presentation and preserve backend semantics

Status: native restoration is implemented; use the receipt to determine its validation/push status.

Files: the exact-file manifest; `TripPlannerPage`, `DayPlanSidebar`, `PlanMapStage`, `MapViewAuto`, native phone shells/map/More sheets; Atlas map wiring; `applicationHandler.ts`; `FamilyReadStatus.tsx`; Family browser fixtures.

- Keep native Days/Roadtrip and Tours conditions driven by the real add-on response. Do not enable unsupported features just to reproduce a demo screenshot where different add-ons are enabled.
- Keep the old Family UI modules unmounted. Some source remains transitively necessary for backend adapters; do not delete that closure blindly.
- Keep authorization enforcement at repository/handler/SQL boundaries. Removing a Published/My draft toolbar must not turn a propose/deny outcome into a direct write. Proposed changes may remain unavailable until a native proposal connector is implemented; return the existing explicit error, not a fake save.
- Verify native timeline rendering against existing Family civil-clock, endpoint, booking-span and adjacent-reorder semantics. Native view restoration removes `familyTimelineDay` injection from `DayPlanSidebar`; any semantic mismatch must be repaired in a typed read/write projection, not by bringing back the legacy row renderer or toolbar. Cover cross-midnight flight, hotel spanning days, multiple visits to one place, standalone activity, day notes and denied reorder. A mismatch is a connector gap to report, not permission to rewrite persisted ordering or timestamps.
- Native plugin map contribution readers are empty because there are no providers. Do not treat those arrays as the catalog or overwrite saved destination data with them.
- Add a regression through the actual `/addons` response, native add-on store and planner wiring: the current false Roadtrip capability omits the switch; a supported-on fixture renders the unchanged native Days/Roadtrip control. The positive fixture is not authorization to advertise support in the real handler. A separate canonical database proposal now exists at `FamilyTravelApp/docs/trip-planning-postgres-design.md`; it records the owner's relational-design charter, proposed Plan/routing entities, compatibility requirements and local-test/rollout gates. Its existence is not evidence of an implemented or deployed schema. Keep those database phases separate from this current no-schema native presentation repair. If Roadtrip is requested next, inventory its native settings, route/leg/stop reads and writes against canonical Family contracts first; implement/test those before enabling the add-on. Do not remove its native condition or expose a nonworking tab to match the demo.

Acceptance: real Family-backed desktop and phone planner render native map/rail/sheets; no legacy governance/Explore controls appear; native add-on gates work; backend permission tests still deny unauthorized writes; partial failures remain visible/retryable; guarded files match their pinned source.

## 5a. Phase P — reconnect native top map pills to the existing Family catalog

Priority: an active functional repair; implement before claiming native map discovery works. No map JSX/layout replacement, external enrichment, schema change or production data write is needed.

Primary files: `client/src/integrations/family/applicationHandler.ts`, `repository.ts`, `transport.ts`, the existing legacy `data/supabase/catalogPois.ts`, `family-backend/src/lib/map/catalogPoiRef.ts`, and native `client/src/components/Map/usePoiExplore.ts` / `poiCategories.ts` contracts. Proposed new backend module: `family-backend/src/data/supabase/catalogPois.ts`; do not import a client React component type into this package. Keep a typed structural data contract and a compatibility re-export where old backend callers need one. Follow the repository's carryover-manifest process for intentional source changes.

1. Write a failing test through `createFamilyAxiosAdapter` and the real application handler for GET `/maps/pois?category=restaurant&south=...&west=...&north=...&east=...&lang=en`. It must reproduce the current 501 before implementing the route. Fake the Supabase data/query boundary, not `mapsApi.pois`, `usePoiExplore`, or the route handler under test.
2. Require the existing Family session/membership before querying. Keep the authenticated browser client/RLS; no service-role key and no second client. The native route has no trip parameter: do not invent a client-supplied Family scope or bypass catalog access rules.
3. Recover the existing code mappings exactly: restaurant uses the current restaurant establishment-code set; cafe uses CAF/COFFEE_SHOP and the existing bakery/patisserie set; bar uses BAR/COCKTAIL_BAR/HOLIDAY_POP_UP_BAR/BAR_GRILL; hotel reads hotels; sights/museum/nature/activity resolve ATTRACTION/CULTURAL_EXPERIENCES/NATURE_OUTDOORS/ACTIVITY respectively. Restaurant and bar intentionally overlap BAR_GRILL; do not accidentally broaden every food category to all foods. Verify code-to-ID resolution with fakes and bounded canonical type metadata if needed, rather than guessing UUIDs.
4. Preserve `archived_at IS NULL`, viewport filtering, finite required coordinates, request cancellation and genuine database errors. Validate category and bounds at the handler boundary and reject malformed input with a typed client error. Preserve native bbox conventions, including any wrapped-longitude behavior, with explicit tests. Keep the existing 80-result bounded catalog page, stable ordering and an extra-row probe for truthful `truncated`; do not scan the whole catalog or claim truncation from array length alone. Any dateline splitting must keep a single aggregate cap and deduplicate by identity.
5. Answer the native envelope `{ pois, source: 'catalog', truncated }`; each row must carry the native Poi fields and `osm_id: catalog:{food|hotel|experience}:{uuid}`, verified coordinates, category, type, and available address/website/phone. Preserve this kind-qualified identity on click; a food pin must not hydrate its parent city. Null optional metadata is valid. Reuse `parseCatalogPoiRef` and the existing catalog detail reader.
6. Cover the actual pin-selection/detail path, not merely the list endpoint. Trace the native popup's enrichment/detail and add-to-trip calls. Read-only selection must show the matched Family entity and ready variant pictures. If an add/save target lacks a canonical write contract, keep its permission/capability restriction and report it; do not return a successful save or silently add the containing city. If a minimal data-only contract is needed for Family metadata, define and test it through the shared type/repo boundary, leaving the native popup presentation intact.
7. Preserve the native hook's toggling, aborted/stale-response protection, explicit Search this area behavior and failure/retry state. Do not mount `useWorkspacePois`, restore the old Family Catalog dial, enable Google/Overpass as an automatic fallback, or suppress errors with an empty successful result. A valid empty catalog viewport is distinct from an unconnected or failed request.

Required regressions: authenticated restaurant and cafe clicks show different appropriate fixture pins; hotel and each experience category use the right table/type; coordinates at zero remain valid; archived/invalid-coordinate/out-of-bounds records excluded; unknown category/malformed bounds reject; logged-out calls reject before data access; abort plus rapid category toggle cannot reinsert old pins; genuine empty results versus database failure/retry; pagination cap/truncation; pin selection retains source UUID/kind and displays that entity's details. Browser tests must click pills on both native map renderers and the phone map, wait for the real handler response, then select a returned pin. Use production-host-denying fakes first. Intercept transform attempts before they can reach Supabase.

Live acceptance after an authorized preview-only deployment: one bounded known city viewport with catalog records, Restaurants then Cafes, a pin/detail from each, and retry/no-results behavior where reproducible. Record the actual data and result. Do not infer success from the initial trip destinations or merely visible pills.

## 6. Phase B — separate catalog description from actual notes

Primary files: `family-backend/src/data/supabase/tripPlaces.ts`, `scheduleItems.ts`, compatibility re-exports under `client/src/integrations/family/legacy/data/supabase/`, `client/src/integrations/family/views.ts`, native `PlaceInspector` tests.

B1 — current-schema repair, authorized for implementation without a database migration:

- Generic catalog `places.notes` is the existing imported catalog description: expose it as `Place.description` ONCE.
- Do not also expose it as `Place.notes`. Until a genuine trip-place personal-notes store is connected, return `notes: null` for that scope. Do not blank or migrate catalog `places.notes` in the database.
- Read `schedule_items.explanations` and expose it as native `Assignment.notes` for the selected occurrence. It is occurrence-specific; do not copy it into the global place description. Update the TypeScript row/projection and explicit SELECT together.
- Do not implement description/personal-notes writes by redirecting them into the catalog's global description. Keep unsupported writes explicit until their proper target is defined.
- Preserve original text. Malformed imported Markdown such as `**Elevation: **7,005` should be handled in a separate conservative display-normalization test or import cleanup proposal, not a destructive database rewrite or enabling raw HTML.

B2 — future persisted personal Notes (design proposal, NOT current schema/deployment authorization):

- Native `Place` is trip-scoped. The recommended store is nullable `trip_places.notes`, keyed by the existing `(trip_id, place_id)` relationship. Do not add another global catalog description column or use global `places.notes` for personal notes. A note about Puebla on one trip must not change another trip or the catalog description.
- New trip-place notes start null. Save updates only that field; clear/delete sets null without deleting the trip place. Occurrence-specific notes remain `schedule_items.explanations` and are not automatically copied into a trip-place note. If the product later needs one note for a saved venue/occurrence, establish its actual association first; do not invent a generic city's association to store it.
- Prepare a separate additive migration in canonical FamilyTravelApp only when this persistence phase is requested. Inspect existing RLS/RPC/write policy, retain direct/propose/deny semantics, and test cross-Family denial, read/save/clear/reload, two trips sharing one city, rollback, and offline replay against a disposable local Supabase database. No production SQL or backfilled invented notes in this repair.
- Until B2 has a real write endpoint, reject Notes writes explicitly and roll back optimistic UI. Do not claim the blank field is editable/persistent merely because the native editor displays it. Native TREK hides an empty Notes section in view mode; keeping the field does not require rendering a permanent blank box.

Regressions: handler payload to real inspector shows catalog description once, no duplicate Notes block; genuine occurrence notes appear separately for the selected day; different visits keep different notes; null/empty text renders no empty section; unrelated catalog text is unchanged; unsafe HTML/links remain sanitized.

## 7. Phase C — complete entity details and header projection

First inventory the explicit SELECTs and available canonical fields for `places`, `hotels`, `foods`, `experiences`, `schedule_items`, `trip_reservations`, `countries`, `admin_divisions`, `place_types`, and custom `family_place_categories`. Use canonical migration/schema sources or bounded read-only column queries. Do not run a full catalog inventory.

Primary files: `tripPlaces.ts`, catalog detail readers found with `rg --files family-backend/src/data/supabase | rg 'catalog|hotel|food|experience'`, `scheduleItems.ts`, `FamilyViews.place/assignment`, `repository.placeList/dayList`, native inspector/gallery tests and shared Place/Assignment response contracts if needed.

- Preserve the native numeric-ID boundary and canonical Family UUID registry. Keep source kind, source UUID and occurrence UUID distinct. An experience/food linked to Puebla must not silently become Puebla's name, location, phone or picture.
- Read and project available entity address, website, phone, email, opening-hours/timezone and the appropriate description. Never scrape new external sources or turn on Google enrichment to cover a missing Family mapping.
- For a city, use verified geography as a display location, e.g. Puebla, Mexico, without pretending it is a street address or writing that derived label to the database. Keep type/country/region metadata available in the adapter. Do not invent a virtual editable category/FK to force a badge.
- Native header category reflects `categories.find(c => c.id === place.category_id)`, so returning an embedded `category` alone cannot create the chip. Supply the real category list and a matching registered category ID. The empty Family palette also explains the missing right-hand Categories filter: the frontend already contains it.
- C1, read-only header enrichment: batch/read verified `place_types.label`, country and admin-division names through the existing relations. Use native fields for their native meanings, e.g. existing location line for a verified city/region/country display label, and `country_code` / `region_name` for native location filtering. No street address exists for the generic city. Venue addresses/contact fields come from their own source entity. Preserve stored text; derive labels only in the adapter.
- C2, proposed data mapping for the requested City/Town chips: reuse or deliberately create actual Family palette categories and assign the existing trip-place category FK through the existing authorized category/update APIs. Creating palette rows/assignments is a data mutation, not a frontend repair: prepare an idempotent scoped mapping and review it before any real write. Do not execute production data changes during diagnosis/planning. Preserve any pre-existing custom category, UUID, name, icon and user choice; no automatic overwrites and no mass seeding of all Families. Do not make `place_type_id` masquerade as `family_place_category_id`, fabricate editable categories, or mark category writes successful without persistence.
- These existing native fields can display a City/Town chip and richer location line without adding header JSX or changing layout. If automatic read-only catalog-type chips independent of the editable palette are later required, that is a distinct data-contract decision; do not silently repurpose native category edit/save behavior. Test whichever mapping is actually approved, not a fixture-only synthetic badge.
- Do not mix Google/catalog review scores with native per-member star votes. Leave collaborative ratings unavailable/read-only if no persistence connector exists; native numeric zero is not evidence of a successful read or save. Add capability checks for callbacks instead of optimistic fake ratings.
- Keep list reads batched. Avoid one RPC per destination or full details for every map pan. Lazy/batch detail hydration may enrich a selected native Place while leaving its ID/order stable.

Regressions: one city, hotel, food and experience; populated and absent fields; real handler-to-inspector header output; custom category and no category; a scheduled food/experience retaining its own identity instead of its containing city; reload stability; denied edits; cached details cannot bleed between selected entities. Test `/categories` through the real Family repository/native store/sidebar: zero palette rows hides the native Categories filter, real matching City/Town palette IDs display both the filter and the header chip, and selection/clear/reload uses the same category identity. Fixtures must model actual canonical rows and FK associations, not a forged embedded chip. Category filtering must not change the unrelated top map pill selection.

## 8. Phase D — Participants DEFERRED by user

The user now sees Participants and explicitly chose to ignore this issue. Do not implement attendance, force the section visible, add a participant table, alter its visibility rules or expand the write API in this execution. Preserve the current native behavior and existing permission checks. A broader attendance-persistence gap is background information only, not a to-do in the active repair. If a regression is caused by another phase, fix that regression without expanding this domain.

## 9. Phase E — thumbnail, hero and explicit original in the native gallery

Primary files: `family-backend/src/data/supabase/tripPlaces.ts` and `catalogExploreMedia.ts`; Family Place DTO projection; `shared/src/place/place.schema.ts` (`placeSchema` AND `assignmentPlaceSchema`) and derived response/types; `client/src/components/Planner/usePlaceGallery.ts` and its tests; `PlaceAvatar` and native map/phone image consumers only if needed for role selection. Keep `PlacePhotoGallery` and `PhotoLightbox` presentation.

Chosen connector approach:

1. Keep `image_url` as the ready thumb for existing list/map/avatar readers.
2. Add optional typed `image_full_url` and `image_original_url` to the native Place response contract and Family projection. `image_full_url` is a ready v1 hero ordinary-object URL; `image_original_url` is the canonical original. These are DTO fields, not new database columns. Retain source media ID in adapter metadata for lookup, without changing the native place ID.
3. Data selection precedence is explicit: `catalog_photos` when present is authoritative (including an empty array); otherwise use the typed full-size cover contract if present; only rows with neither new contract use the legacy Nest `image_url` behavior. Explicit null for the full-size cover means that cover hero is unavailable; do not promote the thumb or canonical original to an automatic full-screen fallback. Other ready ordered gallery slides may still open. No empty/broken slide.
4. Family gallery custom slide uses the ready hero; keep native provider candidates for the Nest path. Family external enrichment remains disabled. Ready descriptor lookup is batched/lazy and validated with existing `isReadyCatalogVariantUrl` rules.
5. Expose the canonical original only through an explicit native lightbox caption/link action using its existing caption/captionHref support (or a minimal data-only connector if the exact component contract requires it). Use existing translations or add real locale translations; do not insert an English-only legacy panel. Passing the original URL as a link must not trigger an image fetch until clicked.
6. Define the ordered-photo contract explicitly, rather than expecting the singular cover fields to represent a gallery: add optional `catalog_photos` to BOTH shared place response schemas, typed as an ordered array of `{ media_asset_id: string, position: number, hero_url: string, original_url: string | null }`. This is a response DTO, not a DB schema. Family supplies it from existing `listCatalogVariantSlides` / `listCatalogVariantSlidesForEntity` (`catalog_media_variants`, recipe v1), retaining media ID and junction position and including only ready hero slides. No transform helper in this path. An explicitly empty array means no ready slides and does not permit a thumb/original fallback. Absence means the old Nest path, preserving original behavior.
7. Array ordering follows the existing canonical junction `position` order returned by that reader, without promoting the cover or sorting by URL. Stable slide IDs are media-asset IDs. If the canonical reader's cover treatment/tie ordering needs clarification, pin its existing behavior in a regression before changing it; preserve it. The original link must refer to the media item currently on screen after Next/Previous, including after missing heroes were skipped. Do not choose another media identity or regenerate variants.
8. Carry the fields through the real list/single-place, assignment embedding, selected-place store and Dexie read-through path. `placeSchema` / `assignmentPlaceSchema` must not strip them. Verify refresh and offline-cache roundtrips retain them without changing cache/table names or mutating a shipped Dexie version. Old Family cached rows lacking new fields must be safely identified at the Family repository boundary and hydrated online or normalized to explicit unavailable role/array values offline. Do not mistake a legacy Family thumbnail-only row for the Nest path, clear the entire cache, or discard queued mutations to fix stale display data. The native gallery hook consumes the ordered array when present and uses its first available hero for full-screen selection; the separate `image_url` continues to supply avatars/list thumbs.
9. Update ALL gallery branches consistently: `photos`, `canOpen`, immediate opening, loading, cached-candidate handling, no-photo/error conditions and hook dependencies. Merely replacing the `src` line leaves thumbnail-based opening/fallback bugs. With Family `catalog_photos` present, no provider enrichment is fetched; `undefined` keeps the original Nest behavior. The photo `caption`/`captionHref` is the explicit original action already supported by `client/src/components/Journey/PhotoLightbox.tsx`. Keep that component's markup and native zoom/next/previous controls. Preserve existing attribution where present; do not turn attribution links into automatic original fetches.

Regressions through shared schema parsing, real Family adapter/repository/cache + native gallery/lightbox: thumbnail remains small in avatar; clicking opens hero; missing hero yields the agreed unavailable state without original/transform fallback; legacy Nest custom images still open; slide order and explicit original correspond after Next; prefetch uses only ready ordinary hero objects. Capture **attempts** to `/render/image/`, including prefetch, and fail before any request reaches Supabase. A helper-only URL test is insufficient. No backfill, recipe change or global transformation disablement.

## 10. Phase F — broader native/frontend contract audit

After the active P, B1, C1 and E phases (C2/B2 only if separately approved; D is deferred), inspect `git diff --name-status trek-v5.0.1 HEAD -- client/src`. Classify each remaining native-file change as backend data/auth/permission/capability/source-offer connector, intentional tested data-only extension, or unwanted presentation replacement. Do not undo Supabase auth, recovery, Family RLS authorization, explicit unsupported-feature errors or stored-image readers in a cosmetic revert.

Specifically audit remaining dashboard calendar subscription, native new-trip form wrappers, budget/booking edit restrictions, export connectors, Atlas write restrictions, settings/integration availability, hidden controller side effects and legacy map modules. Replace any additional old-view wrapper with native markup and connect the corresponding repo/hook contract; if the write backend is unavailable, retain an explicit capability state and record it. Do not activate Tours/Roadtrip/Collab or make schema decisions as part of a visual restoration.

The old controller still provides invisible backend/context and published-snapshot export inputs. Untangling that into a smaller backend boundary is a later refactor, not permission to delete a provider and break policy or export provenance. Preserve published-vs-draft semantics even when the old governance UI is gone.

Acceptance is a reviewed path-by-path diff with reasons and no reachable legacy frontend surface for a domain claimed native. The presence of copied files alone does not prove they execute; trace actual imports from main/App and browser routes.

## 11. Validation commands and release gate

From repository root, using Node 24 and the existing lockfile:

```bash
node scripts/family/check-native-presentation.mjs
npm run check:family-carryover
NODE_OPTIONS=--max-old-space-size=8192 npm exec --workspace=@trek/client -- tsc --noEmit
npm run typecheck --workspace=@family/backend
npm run build:web
npm exec --workspace=@trek/client -- node scripts/check-gl-split.mjs
git diff --check
```

Focused tests (from `client/`; extend with each phase's new actual-consumer tests):

```bash
node ../node_modules/vitest/vitest.mjs run \
  src/integrations/family/applicationHandler.test.ts \
  src/integrations/family/applicationHandler.nav.test.ts \
  src/integrations/family/repository.test.ts \
  src/integrations/family/transport.test.ts \
  src/pages/TripPlannerPage.wiring.test.tsx \
  src/components/Planner/PlaceInspector.test.tsx \
  src/components/Planner/usePlaceGallery.test.ts

node ../node_modules/@playwright/test/cli.js test \
  --config playwright.family.full-frontend.config.ts --reporter=line
```

Browser fixtures must deny production Supabase/other backend hosts, exercise real local application orchestration, and return correct JSON for JSON map/style requests rather than one PNG for every map URL. Keep genuine failures visible. Update expectations that demanded removed legacy controls; replace them with native behavior assertions, not skips or wholesale test deletion. Use screenshots at matched 1440×1000 desktop and 390×844 phone viewports; also check RTL, selection and scrolling, without modifying native styling to imitate a screenshot with different preferences/add-ons.

Before any authorized preview update: build with the existing public Supabase URL/anon key/data-plane variables only; run the artifact secret scanner and source check; record preview and production Worker IDs read-only. Dry-run with the explicit preview name. Deploy only that preview, verify built/live entry match, then sign in and walk the exact repaired map popup, scheduled occurrence, gallery/Next/original, global sections and phone rail. Use request interception or network capture that can observe attempted transforms. Do not claim zero requests from a timing log that omitted cross-origin loads. Preserve rollback version and receipt. Full main merge, required GitHub checks and public corresponding-source publication remain a separately authorized release step.

If local database tests are needed for a separately approved additive personal-notes schema proposal, use a disposable local Supabase database only. Record exact commands, role-based authorization cases, results and tooling blockers. No unrun check may be reported as passed. Do not raise budgets, weaken protected-branch checks or post fabricated passing statuses.

## 12. Required final handoff from the executing model

Report implemented phase IDs, exact commits/branch/push status, native baseline and remaining diffs; each tested path with result and evidence; explicit unrun/failed checks; preview vs production deployment status; unsupported capabilities and missing schema decisions; media/original/order preservation; and the next bounded task. Link the plan and receipt. Keep completed source restoration separate from pending POI, notes, category, details, Roadtrip and gallery contracts. Participants is deferred, not an unresolved task to implement.

Execution status at this clarification: **plan only**. P, B1, C1 and E are not implemented/tested merely by this document. C2 category row creation/assignment and B2 notes persistence are proposed separate data/schema actions. No runtime code, production records, schema, deployment, billing or transformation setting is changed by this clarification. Reproduce each failure before fixing it; finish with the exact remaining limitations, not “everything fixed.” No vague claim of complete TREK parity from compilation or a few screenshots.
