# Family frontend source alignment — 27 October 2026

The reference is upstream TREK commit `d4da05bbc93bcfa9668e7a8f4e5384b788452418`.
This replaces the separately styled P1–P4 presentation with upstream source views and shared components. It is not a replacement of the Supabase data plane with TREK's numeric-ID Nest store.

## P1 — Days and Places rails

- Copy `Planner/planParts.tsx`, `Planner/dayPlanSurfaces.ts`, and `shared/ContextMenu.tsx` directly from upstream.
- `family/FamilyDayHead.tsx` takes its grid, raised number tile, title/date typography, action sizes and pill layout from upstream `DayPlanSidebar.tsx`. Keep the Family title and note callbacks, keyboard selection, civil dates, UUIDs and governed actions.
- `family/FamilyDayToolbar.tsx` uses the upstream toolbar band and controls. `FamilyTripExportModal.tsx` uses upstream `TripExportModal.tsx` header, sections and `ExportRow` with the existing Family PDF/ICS/subscription callbacks. Unsupported day reorder and server GPX controls are omitted rather than being wired to placeholder toasts.
- `family/FamilyPlacesHeader.tsx` takes `BandButton`, `SearchField`, `FilterDropdown` and the three-row head band from upstream `PlacesSidebarHeader.tsx`. Family search, categories and counts remain the controller. Its name-sort control sorts the existing in-memory records.
- `family/FamilyPlaceRow.tsx` is the upstream `PlacesSidebarRow.tsx` view adapted to Family UUIDs and the existing avatar, select, assign and context-menu callbacks. Nest drag payloads and unavailable rating fields are not fabricated.
- `family/FamilyPlacesEmptyState.tsx` is upstream `shared/EmptyState.tsx`, using the existing desktop mascot component (whose supported search mood is `confused`). The new 3D mobile mascot/media system is not imported.
- The card must be `flex-none`, and the rail must have `flex: 1 1 0%` and `minHeight: 0`. The previous implementation added a flex-column list without the upstream card rule, crushing headers on long trips.

## P2 — booking and transport editors

- Copy upstream `shared/DialogShell.tsx`, with only the discard-hook import redirected to a copied `useTrekDiscardGuard.ts`. Copy `utils/bodyScrollLock.ts` and their original behavior tests.
- Copy the field classes, `EditorField`, `Segmented`, and `AddRowButton` from upstream `shared/dialogParts.tsx`.
- The Family editors now consume the source header/title-input, type/status pills, segmented choices, field typography and footer buttons.
- Keep `FamilyBookingDialogFrame` and the transport editor's existing `Modal` lifecycle: these own the accepted StrictMode opener restoration, owned pickers, raw dirty drafts, pending-save protection and Costs handoff. `Modal` gains only an optional header presentation slot. Other callers retain their existing presentation and focus behavior.

## P3 — booking and transport details

- Copy `bookings/BookingDialogShell.tsx`; its imports resolve to the extracted upstream type configuration and pure `bookingParts.tsx` presentation exports.
- Family detail dialogs consume `BookingDialogHeader`, `TypePill`, `StatusPill`, `Field`, `DialogSection`, `DialogFooter`, `DeleteButton` and `DialogButton`.
- Keep Family projections, UUID and leg/endpoint identity, lazy files, fresh signed-URL opening, expense loading/error/retry, governed editor/delete callbacks and restoration handoffs.
- Render notes from the existing detail record. Booking time facts retain the stored civil-clock convention: no place-zone conversion, and the UTC-midnight assignment anchor is untimed. Transport endpoint clocks remain recorded local clocks.

## P4 — merged timeline

- Use the copied upstream `TypeTile`, `TimePill`, `SoftPill`, row controls and source day-head surfaces around the existing projection.
- The Family shell supplies reservation types from its loaded lists. It does not fetch each row.
- Keep the repaired phase/span rules, deterministic transport grouping, pair-local schedule reorder/undo, refresh lifecycle, independent expense refresh and stable active-editor source record. These are backend integration, and are not replaced by upstream Nest writes or timestamp mutation.

## Explicit capability boundary

`RoadtripModeSwitch.tsx` and `PlacesToursModeSwitch.tsx` are copied from upstream and mounted above their respective rails, including the mobile sheet. Each has one additive `unavailableReason` prop. Days and Places work; Road trip and Tours are disabled with a reason because their Family routing/tour adapters were never implemented in P1–P4. Copying their switches does not create routes, tours or a fake empty success. Full Road trip, Tours, GPX export, member ratings and the newer global trip-settings navigation are not claimed by this port. The Family Published/My draft controls and existing auth/navigation remain.

## Verification

- Focused P1–P4, panel, editor, picker, confirmation and modal suites: 188 tests.
- Copied upstream dialog/body-scroll tests and existing context-menu suite.
- Independent P4 projection, repeat-refresh/unlink browser checks, and editor-draft reproduction.
- `playwright.family.frontend-parity.config.ts`: nine real-shell cases, 1/15/30 days, desktop/tablet/phone and asserted rendered light/dark themes, plus populated desktop/phone rails. Assert card nonshrink, complete 52px empty headers, real scrolling, last-day reachability and explicit mode availability. Uses existing fake fixtures and neutral mocked map tiles only.
- Typecheck, theme lint and a production web build. Page lint's pre-existing `RequestAccessPage.tsx:19` effect remains a separate baseline failure.

Protected image work is excluded. No schema, provider, persistence or production-data changes are part of the port.

## Exact-copy SHA-256 checks

- `client/src/components/Planner/planParts.tsx` — `8417d9cf2e0e00495630203b7c9ea99e5f852e4c89ec47fef7c02c604afac438`
- `client/src/components/Planner/dayPlanSurfaces.ts` — `a820688dd37e57f6363e3e579ffe2243d2ca56409989bdbf16523c47ec11b3bf`
- `client/src/components/shared/ContextMenu.tsx` — `ceee72200cc4a88a9ba3d70019308ec9b74ea64cbfae7c268b58080888d07177`
- `client/src/components/shared/DialogShell.test.tsx` — `e6292d62c6e5d1bf8cd9bb756fecc7bc4274e00c683a0552d89cab5aa5745937`
- `client/src/utils/bodyScrollLock.ts` — `212b7a3b0c9670a57129b81eb0b495f9477277a9c62bf50ff3a6af88b780c23d`
- `client/src/utils/bodyScrollLock.test.ts` — `c62c1a5d956325aeb9b07f6bc6cd954517776b6023d297c624e304d850688dfc`
