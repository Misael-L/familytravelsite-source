# Native frontend patches

## Current 5.1.2 reconciliation candidate

The active candidate is `codex/trek-v5.1.2-family-reconcile`, targeting TREK commit `5cfc7a602a21598039668387f749f5a419e69bc9`. The declared application baseline remains 5.0.1 until whole-version acceptance is complete. This record does not describe a deployment.

The native desktop/phone planner layout, day sidebar, map stage, Journey map, shared map and map settings files are byte-identical to that target (12 protected presentation files). Family behavior enters through data/command ports, permissions, session boundaries and recovery gates. Do not reapply the historical sidebar/map replacements described below. In particular, the native Days/Road trip switch remains governed by its actual add-on capability; Family still disables the unsupported Road trip backend.

Catalog display and prefetch retain stored `variants/v1` objects with placeholders and explicit originals. Tours, Collab, unsupported providers, community contributions and routing relay endpoints remain unavailable. Provider autocomplete/details capability flags are false because their endpoints are not implemented; this does not disable the separate Family catalog search.

U03-D4B closes the remaining formatter/import work without expanding baselines. Connector boundary tests cover actual handler refusals, collection identity/permission handling and calendar permissions. U03-D5 repairs that outdated fixture and qualifies 14 production-built native cohort cases. The native UI auth display cache is separated from the preserved Family snapshot with a non-destructive old-native-cache copy. Full application-entry, remaining live callback/private-file and PWA acceptance remain open. See the canonical [D5 handoff](/Users/Misael/Desktop/FamilyTravelApp/docs/backend-modernization/u03d5-built-startup-handoff.md) for evidence and the next packet.

## Historical 5.0.1 integration record

The sections below preserve the earlier integration history. They are not instructions to restore obsolete frontend overrides on the 5.1.2 candidate.

Family wiring added to the TREK 5.0.1 client. The controller no longer emits the fixed Explore overlay, the viewport "Close Family Explore" button, or the floating governance bar.

## Entry and transport

- `client/src/main.tsx` — `installFamilyFrontend()` runs before `startConnectivityProbe()`. `FamilyNavigationBoundary` wraps `App`.
- `client/src/api/websocket.ts` — `installRealtimeDriver` delegates connect, disconnect, join, and leave. Native exports stay.
- `client/src/App.tsx` — Family MFA and membership gate, admin capability check, `FamilyTripBoundary` around the `/trips/:id` viewport route, `FamilyDomainBoundary` for journey and collection routes, Family admin page when the runtime is on.

## Desktop planner

- `client/src/pages/TripPlannerPage.tsx` — `useFamilyTripTabBridge(activeTab)`. `FamilyPartialLoadBanner` and `FamilyGovernanceHost` are the first children of the desktop left rail. `FamilyExploreHost` is the last child of the plan stage and renders only while Explore is open.
- `client/src/pages/tripPlanner/PlanMapStage.tsx` — the stage always mounts the TREK overview, compass, and alternatives. `MapViewAuto` supplies the Family map. The TREK POI pill is omitted while that map is mounted so the Family categories are the only ones.

## Phone shell

Phones stay on `MTripShell`. They are not routed to `TripPlannerPage`.

- `client/src/mobile/screens/trip/MTripShell.tsx` — `useFamilyTripTabBridge(trTab)`. Explore overlay uses the non-plan tab box and `TabScroller` padding, only while the dock tab is Plan. The map-view partial-load strip sits under the day chips.
- `client/src/mobile/screens/trip/map/MMapArea.tsx` — `FamilyGenericMapBridge` syncs the selected day and place, forwards `onMapReady` to the compass, and places Family category and catalog controls under the day chips. The TREK POI pill stays off while that map is mounted.
- `client/src/mobile/screens/trip/plan/MPlanTimeline.tsx` — partial-load banner is the first child of the scrolling timeline card.
- `client/src/mobile/screens/trip/sheets/MTripSheets.tsx` — `familyGovernance` bottom sheet.
- `client/src/mobile/screens/trip/sheets/MMehrSheet.tsx` — More row opens that sheet.

## Stores and map entry

- `client/src/components/Planner/TransportModal.tsx` — `useEditorInitialization` keeps an open editor's title and notes stable across reservation and expense refreshes.
- `client/src/store/tripStore.ts`, `slices/reservationsSlice.ts`, `slices/budgetSlice.ts`, `slices/filesSlice.ts` — a late read does not replace another trip's rows.
- `client/src/store/permissionsStore.ts` — Family capability checks while the runtime is on.

## Not a native tab

`explore` is not added to `TRIP_TABS`. Opening Explore is the catalog partial card's "Open in Explore" button. Closing it is the in-host Close control. On a phone the card sits above `--bottom-nav-h`, so the dock does not cover that button.

## Repair pass

`@family/shared-compat` is built before the client typecheck, Vite build, Vitest `pretest`, root `dev`/`build`/`test`, and the client CI jobs that typecheck, lint, bundle, or test. Checks and baselines are unchanged.

Family behavior ported into the current TREK files:

- `TripFormModal.tsx` and `MNewTripSheet.tsx` open `FamilyProposalDialog` for create and edit.
- `useLogin.ts` starts on the Family MFA challenge when that gate is already set.
- `Navbar.tsx` uses `canReviewFamilyAdmin` for the administrator mark and Admin link.
- `useSettlementForm.ts` omits `settled_at` and `note` while Family is active.
- `JourneyDetailPageEntryEditor.tsx` and `MJourneyEntrySheet.tsx` disable the draft toggle.
- `JourneyMapAuto.tsx` uses the preserved Family journey map.
- `AtlasPage.tsx` uses the Family atlas container (`AtlasMapAuto`) and `client/src/pages/atlas/useAtlas.ts` paints country borders. `GET /addons/atlas/countries/geo` returns the existing `server/assets/atlas/admin0.geojson.gz` borders. Stats still come from `family_travel_stats` and `family_country_visited`. Visited countries use fill opacity 0.7; the rest stay `#e2e8f0` at 0.3. Region and bucket-list responses stay empty because Family has no tables for them.
- `SharedMap.tsx` uses `publicMapRender()` for the Family basemap.
- `AboutTab.tsx` and `SettingsPage.tsx` offer `FAMILY_SOURCE_URL`.
- `MapSettingsTab.tsx` shows the Family map settings tab.
- `BookingCostsSection.tsx` and `BookingDetailDialog.tsx` show `FamilyExpenseReadStatus`.
- `BookingDetailHost.tsx` and `ReservationsPanel.tsx` follow Family edit rights.
- `ReservationModal.tsx` freezes its initial values the same way `TransportModal` does.
- `transportEditorOpeners.ts` and `useTripPlanner.ts` refuse a non-editable Family transport.
- `assignmentsSlice.ts` appends a Family visit instead of splicing a temporary row.
- `DayPlanSidebar.tsx` reads the Family timeline, skips position writes, and limits reordering to an adjacent visit swap.
- `TranslationContext.tsx` fills missing strings from `@family/shared-compat`.
- `ExplorePoiPartialCard.tsx` clears the phone dock.
- `FamilyFrontendController.tsx` shows category and catalog controls at every width and forwards map-ready. `renderMap` uses the desktop route, route colors, focus points, and fit key from `FamilyGenericMapBridge` instead of a hardcoded empty route.
- Family GL maps load `@family/mapbox-gl-v3` and `@family/maplibre-gl-v5` from separate dynamic imports (`legacy/components/Map/familyGlLazy.tsx` and `engines/`). `check:gl-split` stays green.
- `client/src/integrations/family/legacy/data/supabase/familyMaps.test.ts` mocks `family-backend/src/data/supabase/client.ts`. The frozen backend test is unchanged.

## Release repairs

- `useResetPassword.ts` and `ResetPasswordPage.tsx` accept a Supabase recovery session without `?token=`. The Family reset route reads `new_password` or `password` and returns `PasswordChangeError` as a 422.
- `IntegrationsTab.tsx` shows one unavailable section while Family is active and does not mount API keys, MCP, photo, AirTrail, Dawarich, Wanderer, or AI. Atlas mark, unmark, bucket, and region writes stop before submit. Road trip, Tours, and Collab switches stay off.
- `useTripExport.ts` exports the published plan through `loadFamilyPlanExport` (`groupScheduleByCivilDay`, `notesByCivilDay`). PDF opens `#family-pdf-preview-overlay`. ICS downloads the plan calendar. My plan, GPX, and per-trip subscribe stay unavailable. `DashboardPage.tsx` opens `FamilyCalendarSubscribeModal`.
- Login links once to `FAMILY_SOURCE_URL`. `client/.env.example` lists only the public `VITE_*` names.
- RTL, theme, and i18n skip only the unreachable Family hosts in `client/scripts/lib/family-scanner-ownership.mjs`. Reachable Family code stays scanned. Family files resolve keys against `@family/shared-compat/i18n/en`. Native files resolve against that catalog or TREK `en`.

## Snapshot export and catalog ownership

- `loadFamilyPlanExport` reads the mounted controller. It does not call `familyFrontend.core()`. A missing controller, `partialLoad.failed`, a non-published layer, or a UUID that is not the open trip throws `FamilyPlanNotReady`. PDF and ICS then clear their busy state and do not call `onExported`.
- While Family is active, a failed Trek `loadTrip` does not send the member to the dashboard. The controller keeps a partial trip open.
- The secret scan treats JSX `</` and `/>` as code, ignores member-shaped `pk.` names in comments, and does not treat Helm placeholders, bare URLs, prose, or short stubs as CARTO secrets. Real Mapbox and long CARTO values still hit.
- Family call sites that named a Trek-only key now use an existing Family key, or the Family catalog gained the key in every locale. `files.toast.tooLarge` and `files.toast.downloadError` are English in every locale because Trek has no translation for them. The other new keys use the Trek locale strings.

## Either view exports the published rows

- `loadFamilyPlanExport` still reads only `controller.core`. My Draft uses the same published rows. Draft operations are not merged. A missing controller or `partialLoad.failed` still throws `FamilyPlanNotReady`, and `onExported` still runs only after a successful PDF or ICS.
- The CARTO check trims surrounding whitespace and a credential prefix before it decides. Helm `{{` values and English sentences stay exempt. A padded or prefixed negative fixture is still a HIT, and archive findings stay class, path, and line.
- Reachable Family screens use logical sides and theme tokens. Files the import walk from `main.tsx` and `App.tsx` does not reach stay unscanned. RTL is 284/284 and theme is 3499/3499. Neither baseline was raised.

## Category colors and physical coordinates

- Cost and POI categories use their own reviewed hex palette, stored beside the style so the theme ratchet does not see a raw `color: '#…'`. A 6-digit hex can take an alpha suffix. A CSS variable goes through `color-mix` instead of `var(--token)18`.
- Explore pins carry `data-marker="explore-poi"` and `data-poi-category`. The hotel pin stays `#2563EB`.
- Context menus, sliding-tab indicators, map tooltips, packing menus, and centered markers assign a physical `left` or `right`. A viewport `clientX` is not stored as `inset-inline-start`. The tab indicator uses the button's `offsetLeft`, which stays aligned after the strip scrolls in LTR and RTL.

