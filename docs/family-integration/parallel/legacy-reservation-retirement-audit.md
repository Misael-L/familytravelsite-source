# Legacy reservation list retirement audit

Reviewed integration source `71d37b34d`. The qualified local build is `a17bf0400`. The desktop and phone trip routes use the native reservation lists.

## Existing coverage

- **Booking sections, 6 cases.** The active `ReservationsPanel` and `useBookingsView` suites cover default pending and confirmed groups, status counts, collapse and restoration, and trip-scoped storage. The phone suites cover grouping and folding with in-memory state. The legacy suites still own their older keys and exact rerender and StrictMode assertions.
- **Transport presentation, 7 cases.** The six section behaviors match the preceding coverage boundary. The seventh case tests transport type filtering, card labels, and the absence of reservation writes. The native desktop filter/model tests and phone transport list tests cover visible rows, labels and order through their own paths. The phone uses a traveler filter.
- **Booking workflow and details, 11 cases.** Four cases cover the old Published/My Draft import and staging flows, the upload-to-review handoff, and discard confirmation. The active import modal, booking edit tests and Family native callback suite exercise the current gated import and command paths. Keep the old staging cases as evidence of the previous workflow. The seven detail cases exercise dates, currencies, copying, attachment results, read-only access and focus. Native dialog tests exercise the current detail, permissions, clipboard and modal behavior. They do not reproduce the old attachment-fetch lifecycle or every editor-to-opener focus handoff.
- **Transport details, 8 cases.** Native transport sheets and desktop detail suites exercise endpoint facts, dates, codes, files and edit handoff. Repository tests cover stale file responses and signatures across context changes. The old panel cases also distinguish empty and failed reads, preserve the list after signing or delivery failure, ignore replies after close, and check focus across Edit, Delete and Costs. Keep these cases until the corresponding active contracts are accounted for. The old add transport surface and the native transport form have different focus behavior.

The only application import of the old panels is the erased `TransportCreateRequest` type. The fallback Family controller writes the request in the callback of its unmounted `planSidebar` element. The state value has no reader. Native planner callbacks open the actual editors. Any cleanup should keep `activeTab` and the published authorization path intact because the controller still uses that tab state for map and reservation refresh behavior.

## Endpoint-only date gap

`get_family_trip_booking_view_v1` returns the reservation record, independent header date facts and ordered endpoint data. The local migration definitions keep those date fields independent. The older list uses the first endpoint's date when the reservation start is absent. The active Family projection uses the timestamp or calendar header date, and both native lists use the shared ordering model. A Family row with only a recorded departure endpoint date lands among undated rows. The probe drove the actual local cohort through a mocked booking read. That behavior reproduced with a departure that has no coordinates, so relying on the display endpoints would drop the date. Three controls confirmed explicit timestamps, independent header dates and linked days still order correctly. Production prevalence was outside the test.

## Repair criteria

Add a Family-specific fallback for list ordering from the recorded departure date when the timestamp, explicit calendar date and linked day are all absent. Read the canonical endpoint even if coordinates are unknown. Keep the fallback out of write payloads, stored date facts, map geometry and unrelated consumers of the shared start key. Add a regression using the native cohort/read path. Cover ordinary date ordering, rows lacking a departure date, missing coordinates, and preservation of the existing timestamp, header date and linked-day choices. Desktop and phone should agree. Keep the active UI layouts and permissions.

Retain both panels and the four legacy suites while the fallback is repaired and the unique cases receive a coverage decision. This review alone does not qualify their removal.

## Verification

The run passed **571 checks in 26 files**, including all 32 legacy cases and four temporary cohort date probes. Four existing source checks passed. The application and qualification files match the prior local build.

The departure-date criteria are implemented at `603fdfd76`. See the [coordinator queue](coordinator-queue.md#family-transport-departure-ordering) for the test and build receipt. The attachment and focus coverage questions still apply to the panel retirement decision.

## Native attachment follow-up

Commit `739fcae0c` covers mobile card and detail failure feedback. The active trip read owns file-list loading and retry. Reservation details filter that existing list and open bytes only after the user chooses a file. Each retry rechecks file membership and uses a fresh signature. Late file replies from a retired trip or session still fail the existing observation checks. The shared phone editor row now uses the same failure feedback at `6844d7be2`. The detail and editor focus handoffs still need verification before panel retirement.

## Native reservation focus audit

The StrictMode fixtures rendered the native reservation lists, detail views and actual editors. On desktop, focus moved into each editor and Cancel returned it to the original row. On phone, the editor sheet received focus and Escape returned it to the original row. A linked expense in the desktop detail closed that view and moved focus into Costs. The fixtures checked the editor and close actions without saving a reservation.

The desktop Delete question renders over the detail without taking focus. To reproduce, open a reservation detail by keyboard, focus Delete and press Enter. With the question visible, Tab and Shift+Tab continue cycling within the detail underneath. Escape dismisses the question and leaves focus where the user last tabbed. The focused component probe and isolated Chromium both reproduced this result. The legacy confirmation tests expected Cancel to receive focus.

Confirming deletion of the only listed reservation removed its opener and left focus on the document body on desktop and phone. The desktop question focus repair comes first. A subsequent repair should test a surviving adjacent row and the empty-list action as fallback targets when the original row disappears.

Seven local component probes, the Chromium focus reproduction, 544 reservation regressions and four source checks completed. This audit leaves the application at its existing qualified build.

The reservation HTML question accepts keyboard focus and restores it on cancellation as of integration commit `7385908fa`. The Chromium and component checks still leave focus on the document body after the original row is removed. The [next focus repair](coordinator-queue.md#reservation-delete-confirmation-keyboard-focus) covers that list transition before reconsidering panel retirement.

The selected-row transition is covered at `d8b31e64f`. Desktop Cards, List and Timeline and the phone Bookings and Transports lists focus an adjacent row or a stable control after removal. The test suite covers refused writes and focus leaving the list while the write is pending. Review the remaining legacy-specific cases and controller type before removing either panel. [Verification](coordinator-queue.md#focus-after-reservation-removal).

## Coverage decision after the focus repairs

Reviewed `f5cd77bed` with synthetic fixtures and the existing scoped local build. The four legacy suites still pass all 32 cases. The decisions below match every case group to its active owner.

- **List presentation, 13 cases.** The native desktop view owns grouping, counts, filters and trip-scoped collapse preferences. The phone tabs own ordering, independent section toggles and traveler filtering. The six legacy section checks per surface use the older storage keys. Keep one active desktop regression for group preferences across a parent rerender, a fresh mount and switching trips under StrictMode before removing those suites. The native phone collapse state is held by the mounted tab. The extra legacy transport filter case is covered by native desktop filtering, native row label tests and the departure-order cohort regression.
- **Draft staging and import, 4 cases.** The old panel switches Published and My Draft, submits a parse preview and stages a removal or dirty edit. The native import dialog and route tests cover the current upload-to-review ownership when import is enabled. The Family callback tests prove that private-layer or refused work does not fall through to a published write and that refreshed reads preserve dirty input. The old staging suite is still the executable record of that workflow. Keep it as historical coverage until the disposition of the retained staging feature is decided.
- **Detail facts and permissions, 4 cases.** The native detail and list suites cover booking and endpoint facts, linked expenses, clipboard behavior, and read-only actions. The Family callbacks cover the checks at the actual write boundary. These four cases have active coverage.
- **Attachment lifecycle, 6 cases.** Both native details consume the trip's files. The signed URL retry regression rechecks membership and obtains a new signature. Repository and preview regressions reject stale file data or download results when the trip or account changes. The trip's Family read alert owns the error and Retry action. Before removing the old lists, add one active trip-level regression for the difference between a successful empty result and a failed files read, including retry. The original per-dialog late-list tests measured a lifecycle that the native detail no longer starts.
- **Editor and delete focus, 5 cases.** Five fresh StrictMode probes verify desktop booking and transport Edit followed by Cancel, phone booking and transport Edit followed by Escape, and the move into a desktop linked-expense editor. Keep those assertions in the active test suite before dropping the legacy cases. The active desktop editor intentionally focuses its dialog when Add is used. The old transport test's expectation that Add leaves focus outside the editor belongs to the retired presentation. Selected-row deletion has committed regression coverage. Direct deletion from phone cards still has the gap below.

The controller import is type-only under the checked-in client compiler options. The request state has no reader. Its setter only appears in the unmounted `planSidebar` element, and no application component mounts either old panel. Neither panel has an entry in the existing build's asset manifest. Keep the controller's live tab state and reservation refresh when returning from Bookings or Transports to Plan. A later dependency cleanup can remove the unmounted callback, its state and the type import together.

## Phone card Delete focus

On a phone, focus Delete directly on a booking or transport card, confirm its own question, and let the write remove the card. The row disappears and the operation runs once. Focus ends on the page body even when the next row is visible. Both disposable probes reproduced this result with the real Bookings and Transports card components. Deletion through the reservation detail sheet still passes the selected-row regression.

Keep the pending focus request at list level so it survives removal of the selected card. Use the existing confirmed delete action, and cover both tabs, visible neighboring rows, the empty list, cancellation, refused writes and leaving the list while the operation is pending.

**Review results.** 655 checks passed across the 25-file run, including all 32 legacy checks and five editor and Costs focus probes. Two disposable phone card probes reproduced the issue above. All four source checks passed after the probes were removed. Both old panels and the current local build are retained.

The direct phone card gap is covered at `4336ccc47`. Both tabs restore focus after removal. Cancel, refusal and a pending write followed by leaving the tab have active tests. The editor focus, collapse preference and trip file-read coverage decisions above still apply. [Verification](coordinator-queue.md#phone-reservation-card-delete-focus).

Commit `de794cbc4` puts the five editor and Costs focus cases in the normal client suite. The active trip file-read and collapse preference cases remain open before panel retirement. [Verification](coordinator-queue.md#reservation-editor-and-costs-focus-regressions).

Commit `6c7b9eeda` covers empty, failed and retried trip file reads through the active planner boundary and file route. The native collapse preference checks still need durable coverage before retiring the corresponding legacy tests. [Verification](coordinator-queue.md#family-trip-files-read-and-retry).

Commit `a7a2909a3` verifies native desktop collapse preferences across a rerender, a fresh mount and keyed Trip switches. The next retirement step is removing the controller's unused transport creation request and keeping the live tab refresh. Retain the draft staging coverage while its workflow is reviewed. [Verification](coordinator-queue.md#desktop-reservation-collapse-preferences).

Commit `821a9b1f2` removes the controller's unused transport request. Both retained tab bridge regressions prove that returning to Plan still refreshes reservations for the current trip. The old Transports list has only test consumers. Its retirement can now proceed after checking helper reachability and the active coverage. Keep the Bookings draft staging evidence. [Verification](coordinator-queue.md#unused-legacy-transport-creation-request).

## Legacy Transports list retirement

Commit `2c8c60b00` removes the obsolete list and its list-only card and type metadata modules. The active transport editor, detail, projection and native trip controllers retain their existing source. The Bookings staging and import tests still capture the old draft workflow.

- **Seven list cases.** The native reservation view tests cover grouping, counts and filter labels. The StrictMode collapse regressions cover independent status groups, parent updates, reopening and per-trip storage. Route wiring and the Family cohort departure-date tests cover the active transport types and ordering.
- **Two recorded-data and permission cases.** Active desktop and phone detail tests cover endpoint facts, code behavior and read-only controls. Family command tests enforce write permissions.
- **Three attachment cases.** The Family trip read tests own empty, failed and retried lists. File preview and repository tests check fresh signatures and reject stale results when the trip or session changes.
- **Three focus cases.** Native editor, Costs and Delete tests cover transition and return focus. The native Add editor deliberately takes focus into the dialog. The old Add test exercised the previous focus model.

The 15 cases passed before removal. The 1,069 retained tests passed afterward. [Verification](coordinator-queue.md#legacy-transports-list-retirement).

## Legacy Bookings draft staging review

The old panel has two test consumers and no runtime caller. The four retained cases separate booking import, draft removal and unsaved editor changes.

- **Import from My Draft.** The old panel showed “Switch to Published” when a draft callback was installed. The native desktop and phone entry points use the global feature response, which currently advertises booking import for Family. The Family review opener refuses that workflow in any layer. Keep the old case as evidence of the intended Published-only flow.
- **Preview and open the booking editor.** The Family import job accepts local file extraction and returns preview items. The generic import and planner tests cover handing parsed items to native review. The Family import-session test proves that a refused review leaves the task and original source file available. The parser and native editor have no accepted Family handoff. Cover the actual Family feature response, the native entry points and a retained job together. Require permission-checked Published review before advertising a working import.
- **Stage removal.** The Family reservation DELETE handler resolves the trip's reservation and calls the repository with the reservation permission. In My Draft, the allowed path saves a reservation removal marker and returns the staged response before Published data or client caches can be changed. Native Delete uses the generic reservation repo, which refuses raw writes when the qualified planner port owns reservations. Keep the old test until a route-level regression proves the exact staged operation, no Published deletion and correct refusal for a denied user. Native draft removal needs its own command and caller verification before it can be offered as a working action.
- **Keep editing or discard.** The live desktop and phone booking editors pass form state to their existing discard guards. The shared dialog suite proves Keep editing and Discard. The Family callback tests prove that refusal leaves edited values visible and a refresh preserves a dirty form. Add a native editor regression that changes a value, keeps editing, discards, reopens with the original value and verifies zero writes.

Source paths for the current contracts are [feature response and draft acknowledgement](../../../client/src/integrations/family/applicationHandler.ts), [import jobs](../../../client/src/integrations/family/bookingImportJobs.ts), [native review gate](../../../client/src/pages/tripPlanner/useBookingImportReview.ts), [reservation DELETE](../../../client/src/integrations/family/tripResourceMutations.ts) and [native reservation repo](../../../client/src/repo/reservationRepo.ts).

**Verification.** Against `561e216cf`, 1,302 tests passed across 43 test files, with four skips and four passing source checks. The runs use local fixtures and show the current guard and review contracts independently. The application and legacy tests are retained.

**Next.** Align Family booking import availability with the review gate. Exercise the real feature handler through the native desktop and phone entry points, including any active share-to-import entry. Keep existing jobs and their source files recoverable. Verify that a non-Family planner with an available parser still offers import. Track the staged removal and unsaved-edit cases above before retiring the old Bookings panel.

## Family booking import availability

Commit `727b1a0ab` keeps the native Bookings and Transports controls aligned with the actual review gate. The Family status response reports booking import unavailable. The dialog guard also rejects stale positive parser flags and the phone's automatic opening request. The phone share sheet keeps the selected document visible with an unavailable notice and still offers a shared page as a link when Collab permits it.

The background widget keeps prior jobs and original source file references. A completed Family booking displays the unavailable notice. A missing job status retains the card and IndexedDB source bytes for recovery. Existing parser and job-status handlers remain in place for retained jobs. Native deployments with a conventional or AI-only parser retain their import controls.

Six failures were reproduced against the prior code. The repaired tree passes 663 tests across 17 test files, typecheck and four source checks. The independently scanned local web build uses `adf97edd7`. These are local fixtures and a source-bound build.

**Next.** Use the actual Family reservation DELETE route to prove that a proposal stores the removal marker with the right trip and booking and leaves Published data intact. Verify denial and retention of the old test. Native draft Delete still needs its qualified command. [Coordinator queue](coordinator-queue.md#family-booking-import-availability).

## Family draft reservation removal

Commit `0bc2e637f` covers the actual Family DELETE route, repository governance and SDK request mapping with synthetic data and a stub transport.

- A member with Propose access can stage removal using either a canonical ID or the numeric ID shown to the native planner. An owner with Direct access also stages in My Draft. Each request sends one draft RPC with the original trip and reservation UUIDs, the remove operation and schema version 1, then returns the draft acknowledgement. A fresh Published read still returns the original booking.
- A denied member in My Draft, a proposer in Published and a member with Direct access outside the owner role in My Draft each receive a refusal with zero writes. Authorized removal in Published still sends the direct delete. A subsequent read reflects the removed fixture row.

All 221 focused tests passed across 11 files, including the seven new route checks. Scoped format and lint, typecheck and four source checks passed. The source-bound local build at `5f179a010` emitted 414 byte-identical JS and CSS bundles. This establishes the handler and SDK request contract. The database responses in this proof are fixtures. The native planner's qualified draft removal command remains a separate requirement.

**Next.** Verify Keep editing and Discard through the native booking editor and prove reopening displays the saved value with zero writes. Keep the old Bookings tests until the retirement decision. [Coordinator queue](coordinator-queue.md#family-draft-reservation-removal).

## Native booking editor discard

Commit `e3f3826cf` exercises the real desktop reservation dialog and phone web reservation sheet. After editing the saved note, Escape on desktop or a tap outside the phone sheet opens the unsaved changes question. Keep editing preserves the changed note. Discard closes the editor. Reopening the same mounted editor shows the saved note and permits a clean close with no confirmation.

The two regressions observe only the booking detail reads, zero legacy save calls and an empty offline mutation queue. The fixture record and native store retain the saved note. The phone case exercises the web confirmation.

All 397 focused tests passed across 11 files. Scoped format and lint, typecheck and four source checks passed. The local build pinned to `b0fc25487` passed artifact verification and emitted 414 byte-identical JS and CSS bundles.

**Next.** Review the legacy Bookings panel's direct and indirect consumers, remaining presentation cases and private helpers. Preserve the old Published-only import and draft staging evidence while deciding whether the old panel can be retired. [Coordinator queue](coordinator-queue.md#native-booking-editor-discard).

## Legacy Bookings panel retirement review

The incoming checkpoint is `1e1c1c9e95e05f4d819a4675ba81e5be5e0689b6`. The TypeScript import review found four references into the proposed five-file removal. The two legacy test files import the panel. The panel imports its private section and import dialog. Each reference starts inside the same five-file set. The files are outside the 6,096 nodes reachable from the web, device recovery, native address screen, and push worker entries. The 28 locale and 98 clip glob matches exclude the files. The remaining variable import retries failed bundle URLs. The review also checked type imports, re-exports, mocks, and module augmentations.

The proposed removal is limited to these paths under `client/src/integrations/family/legacy/components/Planner/`.

- `BookingsPanelFamily.tsx`
- `BookingsPanelFamily.test.tsx`
- `BookingsPanelFamily.sections.test.tsx`
- `FamilyBookingSection.tsx`
- `BookingImportModal.tsx`

The retained day timeline detail module imports the shared booking and transport editors, both detail dialogs, and the detail projection. Its handle has a controller type consumer. The retained detail panel suite also imports the booking detail dialog. Keep those modules and their dependencies, including the dialog frame, expenses, and file projection. The active web planner's own import dialog, background jobs, and the Family booking parser have their own entry paths. Keep the booking import data modules outside this removal. [Timeline details at the review checkpoint](https://github.com/Misael-L/FamilyTravelSite/blob/916697b470c87dc884eca3a3f7f905dce337622e/client/src/integrations/family/legacy/components/Planner/family/FamilyDayTimelineDetails.tsx), [detail panel tests](../../../client/src/integrations/family/legacy/components/Planner/FamilyReservationDetailPanel.test.tsx), [active import jobs](../../../client/src/integrations/family/bookingImportJobs.ts).

### Coverage for the 17 old cases

- **Six section cases.** Native tests own initial grouping and counts, independent collapse, stored preferences, parent rerenders, remounts, trip switches, and StrictMode. The six old tests exercise the legacy storage keys. [Native list coverage](../../../client/src/components/Planner/ReservationsPanel.views.test.tsx).
- **Seven detail cases.** Native booking details and Costs cover dates, currency display, copying, and read-only actions. The active trip read owns empty and failed attachment lists and Retry. File preview rechecks membership on retry and rejects results from retired contexts. The native detail receives its list from the trip read, so it has no per-dialog list request to finish after closing. Focus tests cover closing details, handing off to Edit, cancelling Delete, and restoring focus when a row disappears. [Booking details](../../../client/src/components/Planner/bookings/BookingDetailDialog.test.tsx), [Costs](../../../client/src/components/Planner/BookingCostsSection.test.tsx), [trip file read](../../../client/src/integrations/family/FamilyPlannerBoundary.test.tsx), [file preview](../../../client/src/integrations/family/filePreview.test.tsx), [editor focus](../../../client/src/components/Planner/reservationEditorFocus.test.tsx), [removal focus](../../../client/src/components/Planner/reservationRemovalFocus.test.tsx).
- **Two draft and editor cases.** The Family handler verifies the exact draft removal RPC, denied writes, and the fresh Published booking read. Native editors verify Keep editing, Discard, and reopening with zero writes. The old draft toast remains part of the historical workflow. [Draft removal tests](../../../client/src/integrations/family/applicationHandler.test.ts), [native editor tests](../../../client/src/integrations/family/nativeBookingCallbacks.test.tsx).
- **Two historical import cases.** In My Draft the old button explains that the user must switch to Published. In Published the old importer previews `hotel.eml`, shows the parser warning, and opens the unsaved `Harbor Hotel` review editor on confirmation. Retain these executable cases and the old draft-toast check at the pinned ancestor above. The Family website currently gates import admission, while the active tests cover disabled controls and retention of the old jobs and source file bytes. Keep that gate and the native provider tests as part of the removal verification. [Old scenarios at the tested commit](https://github.com/Misael-L/FamilyTravelSite/blob/1e1c1c9e95e05f4d819a4675ba81e5be5e0689b6/client/src/integrations/family/legacy/components/Planner/BookingsPanelFamily.test.tsx), [active import session tests](../../../client/src/integrations/family/importReviewSession.test.tsx).

To replay the historical cases in an isolated checkout of `1e1c1c9e95e05f4d819a4675ba81e5be5e0689b6` with the pinned dependencies, run the two `BookingsPanelFamily` suites from `client/`.

```sh
node ../node_modules/vitest/vitest.mjs run \
  src/integrations/family/legacy/components/Planner/BookingsPanelFamily.test.tsx \
  src/integrations/family/legacy/components/Planner/BookingsPanelFamily.sections.test.tsx
```

All 859 tests passed across 26 files, including the 17 old cases. The import review examined 14,007 source and test files. All four source checks passed. A read-only translation check simulated removing the files' references and produced the same verdict and 722 unused keys. The latest qualified web build is `b0fc25487`. The review retains the runtime files and both legacy test suites.

**Next.** Rehearse the five-file retirement, prove the retained tests match before and after, and compare the new pinned build against the previous runtime bundles and stylesheets. Preserve the shared source, both current import controls and their guards, and the historical test replay. Review any changed quality result under the existing rules and baselines before recording the retirement. [Coordinator queue](coordinator-queue.md#legacy-bookings-panel-retirement-review).

## Legacy Bookings list retirement

The isolated checkout used its own dependency copies and removed the five reviewed files. All 842 retained test names, results and suite paths matched the prior 859-case run after accounting for the 17 old cases. The historical test replay remains pinned to `1e1c1c9e9`. Commit `418423afb` contains only the five deletions. The shared detail and editor files, active importer, and booking data modules remain in the application source.

The web, device recovery, native address, and push worker entries reach the same 6,096 nodes, edges, and source bytes. The source-bound local build at `06be06459` emitted 414 byte-identical JS and CSS bundles. The public configuration changed only its source commit. Source, artifact and quality checks passed apart from the measured duplication gate. The duplication count fell from 11,743 to 11,589. The build and tests used local fixtures.

**Next.** Review the legacy timeline detail reference in the Family controller. A type import supplies a ref used by the legacy sidebar callback. Trace mounted consumers before making a further removal. Preserve the active native editors and the Family refresh when returning to Plan. [Coordinator queue](coordinator-queue.md#legacy-bookings-list-retirement).

## Legacy timeline detail reference review

At `5a922308d`, the Family controller initializes `timelineDetailsRef` to null. Its only read is the optional `openTarget` callback on `planSidebar`. The controller never attaches the ref, and nothing reads the `planSidebar` element. The controller itself still mounts on the Family fallback route and reloads reservations when switching back to Plan. [Controller and callback](../../../client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx), [return-to-Plan tests](../../../client/src/integrations/family/FamilyTripBoundary.test.tsx).

The TypeScript dependency scan examined 14,002 tracked code and test files. The detail module has one reference from the controller, a type import erased by TypeScript, and sits outside the 6,096 nodes reachable from the configured application entries. The graph and its source hashes match the preceding verified build source. The sidebar module is reachable through the controller import. Its constructed element has no consumer. The desktop planner uses its own booking callbacks, and the phone timeline opens native reservation sheets through the trip shell. [Desktop planner](../../../client/src/pages/TripPlannerPage.tsx), [phone timeline](../../../client/src/mobile/screens/trip/plan/MPlanTimeline.tsx).

All 582 focused tests passed in 15 files, with four source checks passing. Coverage includes the installed Family boundary, Bookings and Transports return-to-Plan refresh, retained itinerary moves, native desktop and phone planner entry points, and the retained reservation dialog and transport editor suites. This checkpoint records the review. The latest qualified local build is still `06be06459`.

**Next.** Rehearse deleting `FamilyDayTimelineDetails.tsx` and removing the type import, ref declaration, and callback line in `FamilyFrontendController.tsx`. Keep the legacy sidebar declaration and component, the retained itinerary projection, reservation refresh, native editor and sheet callbacks, and the legacy booking and transport helpers and their tests. Compare the focused test names, entry graph, and emitted application bundles against the qualified baseline, and record any change to the existing quality checks before applying the retirement.

## Legacy timeline detail retirement

Commit `9261c1038` removes the unused detail module, the controller's type import and unbound ref, and the optional callback on the unconsumed sidebar element. All 582 case names, suite paths and results match the prior run. The 6,096-node entry graph has the same roots and edges. The controller is the sole reachable source file with changed bytes. [Controller](../../../client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx), [return-to-Plan tests](../../../client/src/integrations/family/FamilyTripBoundary.test.tsx).

The local build pinned to `e0fc78978` passed artifact verification. Of 414 JavaScript and CSS bundles, 276 are byte-identical and 137 more match after resolving generated filenames. The remaining entry bundle removes one unused `useRef(null)` call and joins its adjacent declarations. All 14 stylesheets are byte-identical. The asset manifest and service worker have the same entries after resolving filenames and checking the regenerated index revision. All 313 compressed bundles decompress to their corresponding output.

Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. The strict report retains 463 diagnostics within its existing baseline. The duplication report is identical at 11,589 lines in 208 files, so duplication remains a release gate.

**Next.** Review the unused day sidebar's prop expressions, module references and fixture coverage. Keep any values used by the rendered planner, map or retained itinerary actions. Use that review to define the smallest viable retirement. [Coordinator queue](coordinator-queue.md#legacy-timeline-detail-retirement).

## Legacy day sidebar review

The Family controller creates a single `planSidebar` element. Its local has no reads. The sidebar module has one import from the Family controller among 14,001 checked code and test files. The desktop Plan route renders the native `DayPlanSidebar`, and the phone shell uses its own timeline. [Family controller](../../../client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx), [native desktop planner](../../../client/src/pages/TripPlannerPage.tsx), [phone planner](../../../client/src/mobile/screens/trip/MTripShell.tsx).

The 21 prop expressions consist of existing values, the trip title read, and five callbacks created in the element. Those five callbacks would select a day and open the Places rail, move an item, select a note, save a title, or undo. The three controller callback factories for removal, movement and title changes defer writes until their returned callbacks are called. Keep the shared history hook and `pushUndo`, the selected-day map and itinerary projections, the note and permission state, and the reservation refresh when returning to Plan. [Retained itinerary actions](../../../client/src/integrations/family/legacy/pages/familyTripWorkspace/controllerItineraryActions.ts), [Family boundary tests](../../../client/src/integrations/family/FamilyTripBoundary.test.tsx).

The qualified local build at `e0fc78978` has no legacy sidebar expansion key in its JavaScript, but the controller still allocates the reservation type map and reads the trip title for the discarded element. Simulating removal of the import disconnects 10 of 6,096 sources in the TypeScript import graph. This includes the sidebar, its export dialog, day head, timeline row and entry, toolbar, and four presentation/style modules. Those files contain no direct CSS or side-effect-only imports. The shared PDF export retains its native caller, and the calendar subscription modal retains its Dashboard caller. [Native export](../../../client/src/components/Planner/useTripExport.ts), [Dashboard](../../../client/src/pages/DashboardPage.tsx).

All 1,021 tests in 23 suites and four source checks passed. The test set covers desktop and phone day planning, notes, transport and booking details, itinerary operations, reservation refresh, exports, and Dashboard. The application graph still matches the preceding build source. This is a documentation checkpoint.

**Next.** In an isolated checkout, remove the controller's sidebar import, the `planSidebar` element and its `reservationTypes` map, then delete `FamilyDayPlanSidebar.tsx`. Keep the other nine files, shared callbacks, provider, map, timeline and live export/calendar commands in scope for preservation. Compare the same suites, module graph, CSS and normalized output, then verify quality checks before applying the two-file removal. The machine-readable review lists the ten graph nodes. [Coordinator status](coordinator-status.json).

## Legacy day sidebar retirement

Commit `ceef95bbd` deletes the sidebar module and removes 38 lines from the controller for the import, unused JSX element and reservation type map. Test paths, case names and results match across all 1,021 tests in 23 suites. The application import graph drops from 6,096 to 6,086 nodes as predicted, with the same expected edges and all other reachable source bytes intact. The nine other files that leave the import graph remain byte-identical in the checkout. [Controller](../../../client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx), [source graph review](#legacy-day-sidebar-review).

The source-bound build at `7f3c56118` keeps all 14 stylesheets byte-identical. The entry bundle no longer constructs the discarded reservation map. The unchanged `planParts` source moves into a 3,231-byte shared chunk outside the startup import graph. The combined uncompressed startup JavaScript in the manifest falls from 6,060,009 to 6,043,328 bytes. The lazy route entries remain present. Of 414 paired JavaScript and CSS bundles, 342 match after normalizing generated filenames. The remainder reflect the different chunk layout and the sidebar removal. All 401 emitted JavaScript modules linked offline, including 3,081 static imports, and 314 compressed bundles decompress to the matching asset.

The artifact scan passed with the bound source and refused both missing and wrong source bindings. Service worker code matches after normalizing minified local identifiers and comparing the precache separately. The precache adds the new shared chunk and records the updated index revision. Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. The duplication report is identical at 11,589 lines in 208 files and remains a release gate. The build and tests used local fixtures.

**Next.** Review the remaining unused legacy Places sidebar element. Trace where the native Places list, map, category picker and trip-place commands actually read and write before deciding which code can be removed. [Coordinator queue](coordinator-queue.md#legacy-day-sidebar-retirement).

## Legacy Places sidebar review

The Family controller imports `FamilyPlacesSidebar` once and constructs one `placesSidebar` element. The element has no reads. The desktop Plan route renders the native `PlacesSidebar`, which opens the place editor and handles day assignment and category actions. The phone shell renders `MPlacesBrowser`. The Family controller separately publishes map geometry and forwards place selection to the planner. [Family controller](../../../client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx), [desktop planner](../../../client/src/pages/TripPlannerPage.tsx), [phone Places browser](../../../client/src/mobile/screens/trip/places/MPlacesBrowser.tsx).

The 16 legacy props include one inline selection callback and one conditional category-picker callback. Creating the element cannot invoke those callbacks or its place and track actions. The qualified build still reads the picker and palette properties. The `plannedPlaceIdSet` memo has one consumer, the discarded element. It builds a set from schedule rows. The category hook runs its own palette-loading effect, so its call belongs outside this removal. Keep the track-to-map projection, Family permissions, retained itinerary actions, and native import routing. [Category hook](../../../client/src/integrations/family/legacy/pages/familyTripWorkspace/useFamilyWorkspacePlaceCategories.ts), [retained itinerary actions](../../../client/src/integrations/family/legacy/pages/familyTripWorkspace/controllerItineraryActions.ts).

The 6,086-node source graph matches the local build at `7f3c56118`. Removing the sidebar import in the graph disconnects 14 sources, including the legacy mascot stylesheet. That stylesheet has 34 shared selector strings and 27 shared keyframe names with the phone stylesheet. The compiled entry CSS includes the legacy `.trek-eye` fill fallback. Preserve the legacy stylesheet import explicitly in the rehearsal and check its emitted rules and order. Keep the other disconnected files, including both track parser modules and their tests. [Legacy mascot styles](../../../client/src/integrations/family/legacy/components/shared/trekMascot.css), [phone styles](../../../client/src/mobile/mobile.css).

All 931 focused tests in 21 suites and four source checks passed. Coverage includes native desktop and phone Places, map selection, creation, assignment, category actions, import controls, and the Family boundaries. This checkpoint records the review.

**Next.** In an isolated checkout, replace the sidebar import with an explicit import of its existing mascot stylesheet. Delete the unused element and its private planned-place memo and import from the controller, then delete the sidebar module. Keep the category-loading hook and the live planner, map and track paths. Run the same 21 suites and compare emitted styles and their order, the source graph and the generated route chunks before applying the two-file removal. [Test paths and source graph](coordinator-status.json).

## Legacy Places sidebar retirement

Commit `b1c074e6a` removes the legacy Places sidebar, the discarded element, and its private planned-place memo and import. The controller imports the existing mascot CSS in the former component import position. Test paths, case names and results match across all 931 tests in 21 suites. The application graph drops from 6,086 to 6,073 nodes and matches the simulated edge change. The stylesheet remains reachable. The other 12 disconnected source files retain their original bytes. [Controller](../../../client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx), [source graph review](#legacy-places-sidebar-review).

The build pinned to `d8ab29170` emits all 14 stylesheets with identical paths, bytes and manifest order, including the mascot fallback. It moves Markdown parsing helpers into a 7,255-byte shared chunk. The startup manifest now loads that chunk, and the larger React Markdown chunk remains available to the planner on demand. The uncompressed startup dependency total falls from 6,043,328 to 5,924,424 bytes. The existing lazy route entries remain present. Of 415 paired JavaScript and CSS bundles, 321 match after normalizing generated filenames. All 402 JavaScript modules link without execution, including 3,081 static imports. All 315 Brotli bundles decompress to the served bytes.

The artifact scanner accepts the bound source and rejects a missing or wrong source binding. The service worker retains its logic after normalizing minified local names. Its precache includes the new shared chunk and the updated index revision. Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. The duplication report is identical at 11,589 lines in 208 files and remains a release gate. This was a local build and fixture verification.

**Next.** Review the disconnected legacy Places row and header. The duplication report counts 34 and 45 copied lines in those files, respectively, with matched blocks in the native Places list. Trace remaining source and fixture references before deciding whether to remove either file. [Legacy row](https://github.com/Misael-L/FamilyTravelSite/blob/ec8e73c3a5b2b83ab1ad31e64f049d2bd65d4171/client/src/integrations/family/legacy/components/Planner/family/FamilyPlaceRow.tsx), [legacy header](https://github.com/Misael-L/FamilyTravelSite/blob/ec8e73c3a5b2b83ab1ad31e64f049d2bd65d4171/client/src/integrations/family/legacy/components/Planner/family/FamilyPlacesHeader.tsx), [coordinator queue](coordinator-queue.md#legacy-places-sidebar-retirement).

## Legacy Places row and header review

The review checked 13,999 tracked code and test files for value, type, re-export and fixture references. The legacy row and header have no callers and sit outside the 6,073 nodes reachable from the application entries. The native row and header remain reachable through Places. The graph and reachable source hashes match the qualified local build at `d8ab29170`. [Legacy row](https://github.com/Misael-L/FamilyTravelSite/blob/ec8e73c3a5b2b83ab1ad31e64f049d2bd65d4171/client/src/integrations/family/legacy/components/Planner/family/FamilyPlaceRow.tsx), [legacy header](https://github.com/Misael-L/FamilyTravelSite/blob/ec8e73c3a5b2b83ab1ad31e64f049d2bd65d4171/client/src/integrations/family/legacy/components/Planner/family/FamilyPlacesHeader.tsx), [native Places list](../../../client/src/components/Planner/PlacesSidebar.tsx).

The scanner matches two blocks in each pair. The row copies cover the category glyph and name, and the Add to Day button and row menu. The header copies cover search and clearing the query, and the filter dropdown. On an extracted copy with the two legacy files removed, the same scanner measured 11,444 copied lines in 204 files, down from 11,589 in 208. The four findings clear together. All other per-file counts match. [Native row](../../../client/src/components/Planner/PlacesSidebarRow.tsx), [native header](../../../client/src/components/Planner/PlacesSidebarHeader.tsx).

The two files have no stylesheet imports. The CSS simulation uses the existing PostCSS and Tailwind plugins and produces the same 3,024 utility rules byte for byte. Removing the 11 literal translation references leaves the same translation verdict and unused-key set. Both simulations use the existing configuration and baselines.

All 1,006 focused tests in 23 suites and four source checks passed. Tests cover desktop and phone Places, search and filtering, category editing, map selection, day assignment, imports and the Family boundaries. This checkpoint records a review.

**Next.** Rehearse deleting the two legacy files in isolation. Re-run the same 23 suites and compare the application graph, built JavaScript and stylesheets, and the exact duplication delta. Preserve the active native row and header and the rest of the source. [Test paths and simulation results](coordinator-status.json).

## Legacy Places row and header retirement

Commit `ba06c0c1d` applies exactly the two reviewed deletions. All 1,006 test paths, case names and results match across 23 suites. The application graph still has the same 6,073 nodes, edges and reachable source bytes. The native Places row and header remain reachable. [Previous review](#legacy-places-row-header-review).

The source-bound local build at `fc506a7a3` emits the same 416 JavaScript and CSS bundles, including 14 stylesheets, byte for byte. Only the source-commit field in the generated public configuration changes. All 402 JavaScript modules link locally. Artifact validation accepts the bound source and rejects missing and wrong source bindings. Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed.

The full duplication scan measures 11,444 copied lines in 204 files, down from 11,589 in 208. It clears all four findings predicted in the review, including the copied ranges on the two active native files. Counts match the baseline for every other file. Duplication remains a release gate.

**Next.** Review references to the legacy mascot and its loading and empty-state wrappers. The scanner reports 364 copied lines in the legacy mascot and 374 in the live phone mascot. The controller's explicit stylesheet import preserves the global styles. Verify the native and legacy runtime paths before deciding what to retire. [Legacy mascot](https://github.com/Misael-L/FamilyTravelSite/blob/6de822279ba03dc43f9bf8c60d4447c56a277479/client/src/integrations/family/legacy/components/shared/TrekMascot.tsx), [native mascot](../../../client/src/mobile/components/MDancingTrek.tsx), [shared styles](../../../client/src/integrations/family/legacy/components/shared/trekMascot.css).

## Legacy mascot and Journey consumer review

Three disconnected wrappers import the legacy mascot. The old shared empty state in turn serves the legacy Journey detail page, gallery and mobile map timeline. The old public page also imports that mobile timeline. Across 13,997 tracked code and test files, all nine imports into the eight-file group originate within that group. The application's 6,073 reachable nodes and source hashes match the qualified local build at `fc506a7a3`. [Native mascot](../../../client/src/mobile/components/MDancingTrek.tsx), [desktop loading state](../../../client/src/components/shared/TripLoadingSplash.tsx), [native routes](../../../client/src/App.tsx).

The proposed scope contains eight files under `client/src/integrations/family/legacy/`.

- `components/Journey/JourneyDetailPageGalleryView.tsx`
- `components/Journey/MobileMapTimeline.tsx`
- `components/Planner/family/FamilyPlacesEmptyState.tsx`
- `components/shared/EmptyState.tsx`
- `components/shared/TrekMascot.tsx`
- `components/shared/TripLoadingSplash.tsx`
- `pages/JourneyDetailPage.tsx`
- `pages/JourneyPublicPage.tsx`

The live phone mascot, desktop loading and empty states, and native Journey detail and public routes sit outside the removal. The controller imports `trekMascot.css` independently, and the built index CSS contains its eye-fill fallback. Keep that import and the stylesheet. The utility simulation removes seven selectors whose source tokens occur only in the proposed files. Every retained utility rule keeps the same declarations and order. The machine-readable evidence lists each selector and its source. [Family controller](../../../client/src/integrations/family/legacy/pages/FamilyFrontendController.tsx), [shared styles](../../../client/src/integrations/family/legacy/components/shared/trekMascot.css), [simulation evidence](coordinator-status.json).

The duplication simulation moves from 11,444 copied lines in 204 files to 10,334 in 200, clearing the two mascot findings and two public Journey findings. All other per-file counts match. Filtering the 65 literal translation references preserves the translation verdict and unused-key set.

The 19 focused suites passed 670 tests. The existing Journey detail suite skips 38 cases. Four source checks passed. This checkpoint records the review.

**Next.** In an isolated checkout, rehearse just the eight listed deletions. Compare the same test cases and skips, the exact source graph and JavaScript, and the seven expected utility removals. Verify that the built mascot styles and cascade order remain intact before applying. [Coordinator queue](coordinator-queue.md#legacy-mascot-journey-consumer-review).

## Legacy mascot and Journey retirement

Commit `83dde2076` deletes exactly the eight reviewed legacy files. The 19 focused suites preserve the same 670 passing cases and 38 pre-existing skips. The application graph matches the earlier build across 6,073 reachable nodes, including the native Journey routes, loading and empty states, and the controller's direct mascot stylesheet import. [Previous review](#legacy-mascot-journey-consumer-review), [shared styles](../../../client/src/integrations/family/legacy/components/shared/trekMascot.css).

The source-bound build at `690672913` emits the same 402 JavaScript bundles after resolving generated filenames. The entry CSS differs by exactly the seven documented utility selectors. Its retained bytes and rule order match, including the mascot eye-fill fallback. The other 13 stylesheets are byte-identical. All 402 modules link without evaluation, all 315 Brotli bundles decompress to their served assets, and the service worker matches after accounting for generated filenames, minified locals and the updated index revision. The artifact scan accepts the bound source and refuses missing or wrong source bindings.

Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. The duplication report falls from 11,444 copied lines across 204 files to 10,334 across 200. The four mascot and public Journey findings clear, and every other per-file count matches the simulation. Duplication remains a release gate.

**Next.** Review the remaining legacy Journey provider picker. The scanner reports 65 copied legacy lines and 66 lines in the native counterpart. Trace the native Journey and Studio photo selection paths and confirm the remaining callers before deciding which source can retire. [Legacy picker](https://github.com/Misael-L/FamilyTravelSite/blob/aa3a15f38f11cf1c7997937750c0615556dfa330/client/src/integrations/family/legacy/components/Journey/JourneyDetailPageProviderPicker.tsx), [native picker](../../../client/src/components/Journey/JourneyDetailPageProviderPicker.tsx), [coordinator queue](coordinator-queue.md#legacy-mascot-journey-retirement).

## Legacy Journey provider picker review

The legacy provider picker has zero value, type, re-export or fixture references among 13,989 checked files. It sits outside the 6,073-node application graph. Desktop Journey gallery and entry editing, Studio, and both phone Journey callers import the native picker. The native component and its callers remain reachable, and the graph matches the local build at `690672913`. [Legacy picker](https://github.com/Misael-L/FamilyTravelSite/blob/aa3a15f38f11cf1c7997937750c0615556dfa330/client/src/integrations/family/legacy/components/Journey/JourneyDetailPageProviderPicker.tsx), [native picker](../../../client/src/components/Journey/JourneyDetailPageProviderPicker.tsx), [Studio](../../../client/src/components/Studio/StudioShell.tsx), [phone entry sheet](../../../client/src/mobile/screens/journey/MJourneyEntrySheet.tsx).

The four copied blocks cover picker state, trip range and request cancellation, the target-entry menu, and thumbnails with original-image fallback. The one-file simulation clears both picker findings. The total moves from 10,334 copied lines in 200 files to 10,203 in 198, with the other per-file counts matching. The file has no stylesheet imports. The utility CSS simulation removes five selectors whose tokens occur only in the legacy picker. The retained rules have the same declarations and order. The 19 removed translation references leave the same verdict and unused-key set.

All 403 tests in 13 suites and four source checks passed. The fixtures cover provider photos and albums, paging, cancellation, photo selection and add, the Journey and Studio callers, and read-only permissions. This checkpoint records the review. [Picker tests](../../../client/src/components/Journey/JourneyDetailPageProviderPicker.test.tsx), [test paths and simulations](coordinator-status.json).

**Next.** Rehearse deleting only the legacy picker and compare the same test cases, the reachable graph, built JavaScript, the five expected CSS removals, and the exact duplication result before applying. Keep the native picker, permissions and helper modules. [Coordinator queue](coordinator-queue.md#legacy-journey-provider-picker-review).

## Legacy Journey provider picker retirement

Commit `0e46a47e3` deletes the one reviewed legacy picker. All 403 case names and results match across 13 suites, including the desktop and phone Journey and Studio paths. The application graph matches across 6,073 reachable nodes and source hashes. [Previous review](#legacy-journey-provider-picker-review), [current picker](../../../client/src/components/Journey/JourneyDetailPageProviderPicker.tsx).

The source-bound build at `9c13c6da6` produces the same 402 JavaScript bundles after resolving generated filenames. The entry CSS drops exactly the five selectors identified in the review. The retained entry rules, mascot fallback and rule order match byte for byte. The other 13 stylesheets are byte-identical. All 402 modules link without evaluation, and all 315 Brotli bundles match their served assets. The service worker preserves its logic and asset set after normalizing generated filenames and the updated index revision. Artifact validation accepts the bound source and rejects missing and wrong source bindings.

Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. The full duplication scan falls by 131 copied lines to 10,203 in 198 files. Both picker findings clear and every other per-file count matches. Duplication remains a release gate.

**Next.** Review the legacy Journey settings dialog and sharing section. The scanner still reports 18 and 16 copied lines in those files, respectively. Trace the current settings and public share entry points and their permission checks before determining a removal scope. [Legacy settings](https://github.com/Misael-L/FamilyTravelSite/blob/a0f48559f1a1e0d517bfd67eb6d98a3476221543/client/src/integrations/family/legacy/components/Journey/JourneyDetailPageSettingsDialog.tsx), [legacy sharing](https://github.com/Misael-L/FamilyTravelSite/blob/a0f48559f1a1e0d517bfd67eb6d98a3476221543/client/src/integrations/family/legacy/components/Journey/JourneyShareSection.tsx), [coordinator queue](coordinator-queue.md#legacy-journey-provider-picker-retirement).

## Legacy Journey settings and sharing review

The legacy settings dialog imports the legacy share section. That is the only incoming reference to either file across 13,988 checked source and test files. Neither file is reachable from the application entry points or pulled in by a glob. Both files have no direct stylesheet imports. The similarly named feature-pair and baseline entries refer to live native paths. [Legacy settings](https://github.com/Misael-L/FamilyTravelSite/blob/a0f48559f1a1e0d517bfd67eb6d98a3476221543/client/src/integrations/family/legacy/components/Journey/JourneyDetailPageSettingsDialog.tsx), [legacy sharing](https://github.com/Misael-L/FamilyTravelSite/blob/a0f48559f1a1e0d517bfd67eb6d98a3476221543/client/src/integrations/family/legacy/components/Journey/JourneyShareSection.tsx).

The desktop Journey page and phone Journey detail gate opening settings on the owner role. Their native settings paths reach the shared settings and link hooks. The desktop share section hides its controls after a permission refusal. The separate read-only public page continues to resolve token links and render permitted sections. Those paths remain reachable, and the 6,073-node application graph matches the local build source at `9c13c6da6`. [Desktop settings](../../../client/src/components/Journey/JourneyDetailPageSettingsDialog.tsx), [phone settings](../../../client/src/mobile/screens/journey/MJourneySettingsSheet.tsx), [share link hook](../../../client/src/components/Journey/useJourneyShareLink.ts), [public Journey](../../../client/src/pages/JourneyPublicPage.tsx).

The copied blocks cover settings form state and title/subtitle saves, and the timeline/gallery/map sharing switches. Simulating both removals clears 67 copied lines across four files. The duplication total moves from 10,203 lines in 198 files to 10,136 in 194, with all other file counts matching. The utility CSS simulation removes 12 selectors with tokens found only in the two files (`max-h-[85vh]`, `min-w-9`, `max-w-[980px]`, `bg-red-500/10`, `hover:bg-red-500/20`, `dark:bg-red-500/15`, `dark:hover:bg-red-500/25`, `md:max-h-[90vh]`, `md:rounded-[24px]`, `md:px-3.5`, `md:px-6`, `md:pb-4`). All retained rules keep the same declarations and order. The simulation removes 61 literal translation references with the same verdict and unused-key set.

All 269 tests in 11 suites and four source checks passed on the existing application. The tests cover desktop and phone settings, share-link creation, copying, toggles and deletion, permission refusals, and revoked public links. This checkpoint records the review. [Test paths and simulation details](coordinator-status.json).

**Next.** Rehearse deleting only these two legacy files. Repeat the tests and verify the built JavaScript, retained CSS, exact duplication result and artifact checks before applying. [Coordinator queue](coordinator-queue.md#legacy-journey-settings-sharing-review).

## Legacy Journey settings and sharing retirement

Commit `a7ba11936` deletes the two reviewed legacy files. All 269 cases across 11 suites have the same names and results. The 6,073-node reachable graph and source hashes match, including the native desktop and phone settings and token-based public sharing. [Previous review](#legacy-journey-settings-sharing-review), [desktop settings](../../../client/src/components/Journey/JourneyDetailPageSettingsDialog.tsx), [phone settings](../../../client/src/mobile/screens/journey/MJourneySettingsSheet.tsx), [public Journey](../../../client/src/pages/JourneyPublicPage.tsx).

The build bound to `e84c496fb` produces 402 matching JavaScript bundles after resolving generated filenames. The entry stylesheet drops exactly the 12 selectors identified in the review. The remaining entry rules, mascot fallback and rule order match byte for byte. The other 13 stylesheets are byte-identical. All 402 modules link, all 315 Brotli bundles decompress to their served bytes, and the service worker uses the same code and assets after resolving filenames and the updated index revision. The artifact scanner accepts the correct source binding and rejects wrong and missing bindings.

Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. Duplication fell from 10,203 copied lines across 198 files to 10,136 across 194. The four affected file findings clear and every other per-file count matches. Duplication remains a release gate.

**Next.** Review the legacy Journey entry card and mood configuration. The duplication scan reports 79 lines within the entry card and 12 in the legacy mood configuration. Trace callers and determine which mood, weather and tag behavior the native Journey UI needs. [Legacy entry card](https://github.com/Misael-L/FamilyTravelSite/blob/ba7d548457997d14bce8b201728cc8b45eba87b2/client/src/integrations/family/legacy/components/Journey/JourneyDetailPageEntryCard.tsx), [legacy mood configuration](https://github.com/Misael-L/FamilyTravelSite/blob/ba7d548457997d14bce8b201728cc8b45eba87b2/client/src/integrations/family/legacy/components/Journey/moodConfig.ts), [coordinator queue](coordinator-queue.md#legacy-journey-settings-sharing-retirement).

## Legacy Journey entry card and mood configuration review

The reference scan covered 13,986 source and test files and found zero callers of either legacy file. Neither file has a direct stylesheet import or an application entry or glob reference. The native card is used by Journey detail. The native mood configuration module has one consumer, its unit test, and stays in place. The retained sources for mood and weather chips and tag presentation, phone Journey, desktop and phone settings, and the read-only public share page remain reachable. The 6,073-node application graph matches the build source at `e84c496fb`. [Legacy entry card](https://github.com/Misael-L/FamilyTravelSite/blob/ba7d548457997d14bce8b201728cc8b45eba87b2/client/src/integrations/family/legacy/components/Journey/JourneyDetailPageEntryCard.tsx), [legacy mood configuration](https://github.com/Misael-L/FamilyTravelSite/blob/ba7d548457997d14bce8b201728cc8b45eba87b2/client/src/integrations/family/legacy/components/Journey/moodConfig.ts), [native card](../../../client/src/components/Journey/JourneyDetailPageEntryCard.tsx), [native mood unit test](../../../client/src/components/Journey/moodConfig.test.ts).

The 79 copied lines in the legacy card are two versions of its Edit/Delete menu for cards with and without a photo. The other duplicate is the weather definition and lookup block shared by the two mood configuration files. Simulating both legacy removals clears 105 copied lines, moving the total from 10,136 in 194 files to 10,031 in 191. All other per-file counts match. The utility CSS simulation removes 8 legacy-only rules (`left-4`, `left-5`, `right-14`, `right-5`, `mr-2`, `transition-[border-color,border-style]`, `hover:border-solid`, `hover:bg-black/50`). Every retained rule has the same declarations and order. Removing six literal translation references leaves the same verdict and unused-key set.

All 396 focused tests across 12 suites and four source checks passed. The tests cover native entry cards and edits, mood/weather presentation, tag colors, phone Journey, settings and public-link behavior. [Test paths and simulation details](coordinator-status.json).

**Next.** Rehearse deleting only the two legacy files. Repeat the tests and verify the built JavaScript, CSS, duplication result and bound artifacts before applying the change. [Coordinator queue](coordinator-queue.md#legacy-journey-card-mood-review).

## Legacy Journey entry card and mood configuration retirement

Commit `aa1d92454` deletes the two reviewed legacy files. The same 396 cases pass in 12 suites. The 6,073-node application graph and source hashes match, including the live desktop and phone Journey cards, settings and public sharing. The native mood module and its unit test are byte-identical. [Previous review](#legacy-journey-card-mood-review), [native card](../../../client/src/components/Journey/JourneyDetailPageEntryCard.tsx), [native mood test](../../../client/src/components/Journey/moodConfig.test.ts).

The build at `b76cac8d9` produces 402 matching JavaScript bundles after resolving generated filenames. The entry stylesheet drops only the eight selectors identified in the review, including the escaped comma in the transition class. The remaining entry rules, mascot fallback and rule order match byte for byte. The other 13 stylesheets are byte-identical. All 402 modules link, 315 Brotli outputs match their served bytes, and the service worker preserves its code and asset set after resolving filenames and the updated index revision. The artifact scanner accepts the correct source binding and rejects wrong and missing bindings.

Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. The scan clears 105 copied lines, going from 10,136 in 194 files to 10,031 in 191. The three affected file findings clear and all other per-file counts match. Duplication remains a release gate.

**Next.** Review the old Booking and Transport editors. The manual Transport form has 366 duplicated lines and the old Booking editor has 156. An existing behavior suite imports the old Transport editor. Trace its coverage against the current desktop and phone flows before proposing removal. [Legacy transport form](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportManualForm.tsx), [legacy booking editor](https://github.com/Misael-L/FamilyTravelSite/blob/2562bcdd034b466e261caff00b139f8445db3a23/client/src/integrations/family/legacy/components/Planner/FamilyBookingEditor.tsx), [legacy transport tests](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.behavior.test.tsx).

## Legacy Booking and Transport editor review

The reference scan covered 13,984 source and test files. The old Booking editor imports its private frame, and neither has an outside caller. The old Transport behavior suite still imports its editor, which imports the manual form. All four legacy modules are outside the 6,073-node application graph. The desktop and phone Transport forms, native Booking dialog and Family booking scope, and the shared modal remain reachable. Their source graph matches the build at `b76cac8d9`. [Old Booking editor](https://github.com/Misael-L/FamilyTravelSite/blob/2562bcdd034b466e261caff00b139f8445db3a23/client/src/integrations/family/legacy/components/Planner/FamilyBookingEditor.tsx), [old Transport suite](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.behavior.test.tsx).

All 556 focused tests in 14 suites and four source checks passed, including all 10 legacy Transport cases. The active cases cover separate car rental dates, stop creation and removal, ordered train legs, editing an existing transport, save-before-cost handoff, permission gates and save errors. The comparison left specific assertions to verify on the active paths before deleting the legacy Transport suite. These include two intermediate flight stops with one removed, explicit place identity for typed train stops, forced read-only submit, retained edits and a blocked cost handoff after a save failure, and the Family boundary for automated mode. The status record maps all 10 cases to reviewed evidence. [Desktop Transport](../../../client/src/components/Planner/TransportModal.test.tsx), [phone Transport](../../../client/tests/unit/mobile/trip/MTransportFormSheet.test.tsx), [planner wiring](../../../client/src/pages/tripPlanner/useTripPlanner.bookings.test.tsx), [Family permissions](../../../client/src/integrations/family/plannerActionAvailability.test.tsx), [expense unlink](../../../client/src/components/Planner/BookingCostsSection.test.tsx), [case mapping](coordinator-status.json).

A read-only simulation removed only the old Booking editor and frame. Duplication fell 342 lines from 10,031 in 191 files to 9,689 in 188. The two old Transport files and shared modal lose their copied matches with Booking while their source stays in place. Every other file's count matches. All 3,203 generated utility rules match in order and declarations, and the translation check has the same verdict and unused-key set after dropping 70 literal references.

**Next.** Rehearse the two Booking deletions with the same tests and a full build comparison. Keep the old Transport editor, manual form and behavior suite together. [Coordinator queue](coordinator-queue.md#legacy-booking-transport-editor-review).

## Legacy Booking editor and dialog frame retirement

Commit `15de560d5` deletes the two reviewed Booking files. All 556 tests in 14 suites have the same names and results, including the 10 legacy Transport cases. The old Transport editor, manual form and test are byte-identical, along with the shared modal and the 6,073-node reachable application graph. [Previous review](#legacy-booking-transport-editor-review), [legacy Transport suite](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.behavior.test.tsx).

The build at `dabb75795` produces 402 byte-identical JavaScript bundles and 14 byte-identical stylesheets. The service worker, entry HTML and asset manifest are byte-identical. All 402 modules link and 315 compressed bundles match their served bytes. Artifact verification accepts the correct source binding and rejects wrong and missing bindings.

Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. Duplication falls from 10,031 lines in 191 files to 9,689 in 188. The five per-file count changes match the simulation, including reduced duplicated counts for the untouched Transport files and shared modal. Duplication remains a release gate.

**Next.** Verify the remaining Transport assertions on the active editor paths. Use the ten-case comparison to preserve supported route editing, save/refusal and cost handoff behavior while retaining the old Transport suite. [Review and handoff](coordinator-status.json).

## Active Transport editor regressions

Commit `7a9d9bd0e` adds five cases and strengthens the existing car rental case with a confirmed midnight pickup, separate return day, notes and confirmation. The active desktop editor preserves the remaining flight stop and its outgoing leg after deleting another stop. A failed save preserves typed edits and clears the expense intent before an ordinary retry. A failed expense unlink preserves the link and keeps the editor open. [Desktop Transport tests](../../../client/src/components/Planner/TransportModal.test.tsx).

The planner test uses the shared desktop and phone save callback with the real store and reservation repository. With the Family read port installed, raw create and update refuse before HTTP, queue mutation, follow-up callbacks or editor dismissal. The existing phone suite independently confirms the supported save-before-expense handoff using a returned ID. [Planner tests](../../../client/src/pages/tripPlanner/useBookingEdits.test.ts), [phone form tests](../../../client/tests/unit/mobile/trip/MTransportFormSheet.test.tsx), [Family write guard](../../../client/src/repo/plannerReadPort.ts).

The native location picker carries the selected name and coordinates. The old train regression asserts a Family trip-place ID. That exact identity contract, automated transit admission and linked-cost attachment and focus handoff remain to be verified before retiring the legacy suite. [Native location picks](../../../client/src/components/Planner/locationPicks.ts), [legacy Transport suite](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.behavior.test.tsx).

All 643 focused cases in 17 suites passed, including all 10 legacy Transport cases. Four source checks passed on the committed source. Typecheck and strict passed before the last test-only change switched the unlink assertion to the real toast component. The full focused test set passed again with that change. The shared runner requires 512 MiB immediately free for another compiler and typed lint run. All 6,073 reachable source files match the prior local build at `dabb75795`. This checkpoint changes tests and source qualification metadata. [Verification details](coordinator-status.json).

**Next.** Verify Family endpoint identity and automated mode at the active boundary before deciding how to retire the remaining Transport fixture and its source. [Coordinator queue](coordinator-queue.md#active-transport-editor-regressions).

## Family Transport endpoint and automated transit review

The synthetic review passed six probes through the native API client, installed Family composition and the older compatibility mapper. Both automated transit requests return HTTP 501 with `adapter_not_connected`. The desktop and phone planner still expose search and change-route actions based on dates or day permission. Raw Family Transport creates and edits return HTTP 409 with `planner_writer_not_cut_over` before SDK work. The existing Family permission check already rejects editing saved transit rows through the Transport opener. [Request fallback](../../../client/src/integrations/family/transport.ts), [write admission](../../../client/src/integrations/family/plannerCohort.ts), [desktop planner](../../../client/src/pages/TripPlannerPage.tsx), [phone timeline](../../../client/src/mobile/screens/trip/plan/useMPlanTimeline.ts), [phone transit details](../../../client/src/mobile/screens/trip/sheets/MTripSheets.tsx).

The canonical booking snapshot preserves a train stop's linked Family trip-place ID. A new native picker selection gives the endpoint builder a location name and coordinates. The older compatibility mapper can attach the removed stop's place link to a surviving endpoint after a deletion because it inherits by array position, even when the request carries the surviving endpoint ID. The installed planner refuses these raw writes. A future Transport writer needs to validate endpoint and place identity before admitting changes. [Compatibility mapper](../../../client/src/integrations/family/tripResourceMutations.ts), [native location picks](../../../client/src/components/Planner/locationPicks.ts), [endpoint builder](../../../client/src/components/Planner/transportEndpoints.ts).

Existing desktop and phone Transport tests cover focus on opening and return to the opener on Cancel or Escape. Other tests cover file linkage and retry on the returned reservation ID. The desktop Costs focus assertion covers a booking-detail handoff. The older combined Transport expense, attachment and focus case stays in the legacy suite. [Focus tests](../../../client/src/components/Planner/reservationEditorFocus.test.tsx), [attachment tests](../../../client/src/components/Planner/TransportModal.test.tsx), [legacy suite](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.behavior.test.tsx).

516 existing focused cases passed across 15 suites. All 10 legacy Transport cases and four source checks passed. All 6,073 reachable files match the earlier build. The prior compiler rerun still awaits 512 MiB of immediately free disk space on this Mac.

**Next.** Gate the unsupported Family Transport create/edit and automated transit actions on desktop and phone. Preserve saved transport detail, authorized file reads, existing Booking controls and the other data plane's transit support. [Coordinator queue](coordinator-queue.md#family-transport-endpoint-and-automated-transit-review).

## Family Transport capability gates

Commit `54712204d` uses a shared availability check for the Family planner. The desktop Transport list hides create and edit operations. Desktop booking details and phone transport cards, details and day sheets keep saved data and hide their unavailable editing or transit actions. The phone route connector omits automated transit. Old transport create links are consumed without opening a form, and the shared trip shortcut uses Add place on the Family Transports tab. The native transit modal retains its itinerary in read-only mode. The existing Booking and upstream transport paths have regression coverage. [Availability](../../../client/src/integrations/family/uiPermissions.ts), [native transit details](../../../client/src/components/Planner/TransitJourneyModal.tsx), [phone day sheet](../../../client/src/mobile/screens/trip/sheets/MDaySheet.tsx).

All 1,057 cases in 26 focused suites, client typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. Strict lists 463 existing diagnostics. The tests used local fixtures. This checkpoint has no fresh browser or release-build acceptance.

**Remaining controls.** The upstream byte-exact requirement covers `TripPlannerPage`, `MTripShell`, `MPlanTimeline` and `MTripSheets`. The remaining native add/edit launchers and direct editor mounts need narrow, reviewed changes to those files. A local patch with regression tests is prepared. The protected files and their verification contract still match the existing checks. [Presentation contract](../native-presentation.json), [coordinator queue](coordinator-queue.md#family-transport-capability-gates).

**Related follow-up.** Inspect mixed timeline reorder independently. Both timelines can attempt raw reservation-position or leg-metadata writes, and the order of those calls relative to assignment or note writes differs. Reproduce with stored transport and prove that any refused movement leaves both the server and the visible day consistent before changing arrangement behavior.

## Native Family Transport launchers

Commit `c9b04c8ef` gates the Family Transport add and edit launchers, automated transit shortcuts and direct editor mounts in the desktop and phone planner. On the phone timeline, an existing train opens details even in edit mode. The narrow desktop planner and drawer also open saved booking details after edit controls are removed. Saved transit and Booking creation stay available. The four templates continue to call the upstream actions in the other data plane. [Desktop](../../../client/src/pages/TripPlannerPage.tsx), [phone timeline](../../../client/src/mobile/screens/trip/plan/MPlanTimeline.tsx), [phone shell](../../../client/src/mobile/screens/trip/MTripShell.tsx), [phone sheets](../../../client/src/mobile/screens/trip/sheets/MTripSheets.tsx).

Commit `c883d8109` shares the day-plan and drawer launch callbacks and moves the phone launcher into the existing header component module. Both files pass the current size check. The source guard checks all twelve protected files. Seven match the upstream files directly, the existing Sidebar type derivation still applies, and four Transport overlays are pinned by full-file upstream and reviewed SHA-256 identities. The verifier rejects manifest-supplied changes to those identities, source drift and rollback to the upstream bytes. Reversing the reviewed delta returned all four files to the original TREK bytes. [Source contract](../native-presentation.json).

All four new UI cases reproduced the old behavior. On the reviewed source, **1,061 focused UI and adapter tests** passed in 26 suites. All 67 source-contract cases, all four source guards, typecheck and layer, offline, size, translation and RTL checks passed. Strict reports 463 existing diagnostics within its baseline. The isolated production build is bound to `40d886203`. The artifact scanner accepted that source identity and rejected wrong and missing identities.

**Next.** Reproduce mixed timeline reorder with saved Transport. Desktop and phone can attempt reservation-position and flight-leg metadata writes while arranging the day. Trace the resulting state when Family refuses and check whether a move can partially commit. Confirm that ordinary visits, bookings and notes still arrange through their supported commands.

## Mixed Family timeline reorder review

The desktop sidebar and phone timeline both saved the visit swap before rejecting the reservation-position write when a single-leg bus or ordinary unpinned restaurant booking was on screen. The same split occurred with a day note and no booking. The error interrupted the path before Undo was offered. The simulated saved visit order and its visible projection changed, while the booking and note values stayed intact. The mixed-order planner emits new positions for all displayed non-visit rows, including rows that kept their relative place in the gesture. [Desktop reorder](../../../client/src/components/Planner/DayPlanSidebar.tsx), [phone reorder](../../../client/src/mobile/screens/trip/plan/useMPlanTimeline.ts), [mixed order projection](../../../client/src/utils/mergedOrder.ts).

A multi-leg flight hit the reserved metadata write before the visit command, leaving the saved visits in their original order. The desktop restored its speculative booking changes. The phone recovered canonical booking state after a successful read. With both recovery reads refused, the phone retained its speculative bus position or flight-leg metadata in memory. The raw booking and note operations stopped at the repository guard before HTTP. Visit-only reorder and Undo remained available. [Reservation write boundary](../../../client/src/repo/reservationRepo.ts), [note write boundary](../../../client/src/repo/dayNoteRepo.ts), [qualified visit command](../../../client/src/repo/plannerAssignmentPort.ts).

Twelve UI probes exercised the native consumers with the actual client ports and synthetic persistence. Two further probes ran through the installed Family cohort, confirmed a committed visit receipt and reloaded that order after the raw bus-position and note updates refused. The latter probes checked both online and forced-offline refusal against synthetic saved bookings and notes, including an unchanged local queue. All 608 existing cases across eleven related suites and all four source checks passed. The three temporary test insertions were removed and the application tree is byte-identical to `ba51d78b8`.

**Next.** Preflight Family timeline gestures against the latest day before any optimistic position change, visit-time removal, write or queue entry. Let a gesture use the qualified visit command when reordering only visits can reproduce the intended visible order with saved bookings, legs and notes held at their stored positions. Refuse gestures that need unavailable writes before changing anything. Check the desktop confirmation path, which can clear visit times before replaying the move, and the desktop mount path that tries to initialize missing reservation positions. Preserve the supported booking editor and the upstream planner behavior. Treat an atomic combined visit, reservation and note writer as future scope.

## Family timeline reorder preflight

Commit `acd17c617` checks both native gestures against the current saved day before a write or temporary display update. The shared projection compares visit, booking, note and flight-leg row identities. It retains hidden visits in the full visit order. A representable move takes the existing qualified visit command and offers its bound Undo after success. A stale or unsupported move stops before saving or joining the queue. [Shared projection](../../../client/src/components/Planner/familyTimelineReorder.ts), [desktop](../../../client/src/components/Planner/DayPlanSidebar.tsx), [phone](../../../client/src/mobile/screens/trip/plan/useMPlanTimeline.ts).

The desktop skips optimistic initialization of missing booking slots and declines timed moves that would require a separate time-clearing save. The confirmation handler checks again before clearing time. In the final application commit `ae30c8874`, desktop note arrows use the existing repository guard for unavailable position writes and cross-day note relocation checks the existing repository guard before removing the note from the visible day. The shared save still passes through the store’s writable-session boundary and suppresses feedback or Undo registration after a trip or port change. The other data plane keeps its mixed-order writer.

The 620 focused tests in 12 suites include a dedicated installed Family adapter case that saved one visit receipt, ran its bound Undo and retained the canonical booking and note records. The four source guards, 70 source-contract cases and 49 note-hook and note-store tests passed. The Sidebar retains its verified upstream type overlay and the exact reviewed Family delta. Typecheck and the existing layer, offline, size, translation and RTL checks passed. Strict reports 463 within its baseline. The fixture production build at `65c7ed7df` passed its artifact scan. Wrong and missing source bindings were refused.

**Next.** Remeasure G2 duplication on this checkout and identify the next independently safe consolidation from the current findings. Retain the older Transport regression sources while their outstanding endpoint semantics remain unqualified.

## Application duplication recheck

The application scan at `237cc453e` found **9,689 copied lines in 188 files**. Every per-file count matches the last scan after legacy Booking editor retirement. Duplication remains open against the existing zero allowance.

The next isolated candidate is the [retained chunk retry copy](../../../client/src/integrations/family/legacy/utils/lazyWithRetry.ts). The tracked runtime, type, tooling and test references use the [active loader](../../../client/src/utils/lazyWithRetry.ts). That includes the legacy Family map loader, which imports the active module by relative path. The retained copy has no import or mock reference. Existing build globs cover mascot assets or translations. The [legacy RouteErrorBoundary](../../../client/src/integrations/family/legacy/components/Layout/RouteErrorBoundary.tsx) imports the legacy `chunkReload` module directly, so that module stays outside this candidate.

The read-only simulation omitted just the retained retry helper and ran the same detector on all the other eligible source files with the same baseline. It reports **9,573 lines in 186 files**. Each side of this matched pair loses 58 copied lines. Every other per-file count matches. The source checkout retains both files.

All 324 focused cases in six suites passed on the existing source, including the active chunk loader and the desktop and phone Transport template regressions. The native presentation check passed for all 12 protected files.

**Next.** Prove the candidate remains unreachable through the configured build and test entry points, then rehearse deleting just that file. Compare active retry and planner tests, emitted assets and source guards before applying. Remove only its obsolete qualification row if the proof passes. Retain the legacy Transport regression suite and source pending endpoint qualification.

## Unused Family chunk retry copy retirement

Commit `2b0ad60c7` deletes the unused Family copy of `lazyWithRetry.ts`. The [live loader](../../../client/src/utils/lazyWithRetry.ts) still serves the native routes and the Family map loader. Commit `3da1c4a30` removes the obsolete source-qualification entry.

The same 324 loader and planner cases passed on each side of the deletion. Typecheck and the strict, layer, offline, size, translation and RTL checks passed. Strict reports 463 existing diagnostics within the baseline. All four source guards passed after qualification.

Fresh builds at `59eb2fc8e` and `2b0ad60c7` used the same pinned dependencies and the synthetic planner and packing profile. The builds have the same file inventory. All 417 JavaScript and CSS bundles match byte for byte. Across the build, 3,796 files match, including the service worker and compressed assets. The sole changed file is the public configuration receipt, whose source commit advances to the candidate. The artifact scanner accepted that binding and refused wrong and missing bindings.

The full duplication count fell from 9,689 lines across 188 files to **9,573 lines across 186 files**. Only the matched lines in the active helper and its removed copy changed. The duplication gate remains open. The generated comparison builds are disposable after acceptance.

**Next.** Trace the retained Family LoginWorld component and its data imports against the active sign-in routes and tests. Review that boundary independently of password recovery and session code before proposing a removal.

## Unused Family sign-in animation retirement

The native [sign-in page](../../../client/src/pages/LoginPage.tsx) imports the [active animation](../../../client/src/pages/login/LoginWorld.tsx). That component renders the ambient and takeoff canvases and reads the adjacent [dot data](../../../client/src/pages/login/worldDots.ts). Native tests resolve both modules and cover animation, reduced motion and dot decoding. TypeScript resolution found one reference to either legacy file. The retired legacy animation imported its own adjacent dot data. No configured runtime or test glob loads those files.

Commit `146380dac` removes only the two legacy files. Commit `a755150c8` removes their obsolete qualification entries. The same 216 cases in 11 sign-in, animation and password recovery suites passed before and after. Typecheck, strict, layer, offline, size, translation and RTL checks passed. Strict reports 463 existing diagnostics within the baseline. The four source guards passed.

Fresh fixture builds at `40de66234` and `146380dac` contain the same file inventory. All 417 JavaScript and CSS bundles and 3,796 output files match byte for byte, including the service worker and compressed assets. The sole changed file is the public configuration receipt, whose source commit advances to the candidate. The artifact scanner accepted that binding and refused wrong and missing bindings. The generated comparison builds are disposable after acceptance.

Duplication fell by 590 lines, from 9,573 in 186 files to **8,983 in 182 files**. The four reported file count changes are the two matched pairs. The full duplication gate remains open.

**Next.** Trace the retained Family password recovery pages and their imports against the live forgot-password and reset-password routes, tests and tooling. Treat any connected code and session behavior as evidence to preserve.

## Unused Family password recovery pages retirement

The [web route table](../../../client/src/App.tsx) lazy-loads the current forgot-password and reset-password pages. Each imports its adjacent hook. The [Family application handler](../../../client/src/integrations/family/applicationHandler.ts) serves their requests through the existing Supabase Auth adapter. TypeScript resolution found just two references to the four retired files, both within the old pages and their hooks. The configured application graph and test globs exclude those four files.

Commit `c6014bb9d` removes the four files and `4c83a05b9` retires their qualification entries. The same 239 cases in 8 suites passed before and after, including the current recovery forms, session gates, auth adapter and API routing. Tests used local mocks. Typecheck, strict, layer, offline, size, translation and RTL checks passed. Strict reports 463 existing diagnostics within the baseline. The four source guards passed.

Fresh fixture builds at `0156b6a3b` and `c6014bb9d` share the same file inventory and 417 byte-identical JavaScript and CSS bundles. 3,796 output files match, including the service worker and compressed assets. The public configuration receipt records the new source commit. Artifact scans accepted that binding and refused wrong and missing bindings. The generated comparison builds are disposable after acceptance.

Duplication fell by 377 lines from 8,983 in 182 files to **8,606 in 178 files**. The four changed file counts are the recovery page matches. The full duplication gate remains open.

**Next.** Trace both implementations of the date and time picker through their desktop, phone and retained Family callers. Check which behavior those callers exercise before proposing consolidation or removal.

## Date picker caller and validation review

Both picker modules are reachable. The [desktop trip form](../../../client/src/components/Trips/TripFormModal.tsx) and the [phone new trip sheet](../../../client/src/mobile/screens/dashboard/MNewTripSheet.tsx) select the [Family proposal dialog](../../../client/src/integrations/family/FamilyProposalDialog.tsx) in Family mode. Its create and edit form uses the [older date-only picker](https://github.com/Misael-L/FamilyTravelSite/blob/fd589cd932176c89a6dce54ad6a24c2f40f07cc8/client/src/integrations/family/legacy/components/shared/CustomDateTimePicker.tsx) for start and end dates. The form checks proposal context and defines date and duration handling. Its modal does not opt into the older picker portal ownership used by the retained Transport test path.

The [native picker](../../../client/src/components/shared/CustomDateTimePicker.tsx) is used in desktop bookings, costs, tasks, trips, Vacay and school holidays. The phone uses it in planner sheets, tasks, Vacay and school holidays. Phone Collab polls reference its combined date and time export. The native implementation supports read-only fields, date bounds, user date format and week start. The older proposal picker localizes from its own translation context and renders Monday first. The other three legacy imports point to the older trip form and budget rows outside the observed application graph. Their retirement requires separate caller review.

Nine local probes confirmed the differences and the shared failure. In English with `DD.MM.YYYY` selected, the native picker interpreted `04.11.2026` as November 4. The proposal picker interpreted it as April 11. With Sunday selected as week start, March 1, 2026 begins the native grid but appears in the last column of the older grid. Selecting March 15 through the calendar emitted the same date-only value in both pickers. Typing `2027-02-31` caused both pickers to emit that string. The pure proposal date builder copied it into the UTC start timestamp. The probes exercised the existing local callbacks and builder without a network or database request.

All 525 existing cases in 11 picker and caller suites, and all four source guards, passed. The older and native picker files account for 437 and 432 counted lines respectively in the current duplication report. The review changed documentation only. The duplication count remains 8,606.

**Next.** Reject impossible explicit dates before emitting a picker value or generating a proposal payload. Add regressions for impossible ISO and localized dates, leap-day acceptance and the existing duration-only path. Reuse existing civil-date validation where appropriate. Prove the same valid date-only values and proposal permission and duration flow, then evaluate a shared picker for the Family proposal page.

## Calendar date validation for pickers and proposals

Commit `db050b0b7` sends manual ISO and localized dates through [one civil-date validator](../../../family-backend/src/lib/civilDate.ts) in the [native picker](../../../client/src/components/shared/CustomDateTimePicker.tsx) and [Family proposal picker](https://github.com/Misael-L/FamilyTravelSite/blob/fd589cd932176c89a6dce54ad6a24c2f40f07cc8/client/src/integrations/family/legacy/components/shared/CustomDateTimePicker.tsx). A real date must round-trip to the same UTC date and fit the supported four-digit year range. The existing locale order and date bounds still determine which valid dates the picker emits.

The [proposal builder](../../../family-backend/src/data/supabase/tripProposals.ts) validates both explicit dates before building either create or edit RPC arguments. Invalid explicit dates return the existing date error, including when one endpoint is empty. Blank fields still support duration-only planning. A valid start can anchor the duration, including a range that passes through a leap day. A duration that exceeds the four-digit year range also returns the date error.

All 539 browser-client unit cases and 35 proposal cases passed locally. The 18 new rejection cases that failed before the repair all pass. The existing 525 picker and caller case results match the review, including desktop and phone proposal admission. Both typechecks and strict, layer, offline, size, translation and RTL checks passed. Strict reports 463 diagnostics within the baseline. Source commit `93f64871b` pins the exact reviewed frontend and Family backend files. The four source checks and local fixture build passed. Its artifact scan accepted the bound source and refused wrong or missing bindings. The full duplication scan found 8,606 copied lines in 178 files.

**Next.** Check whether the proposal dialog can use the current native picker and follow the same saved date format and week start on desktop and phone. Run actual proposal-entry tests for valid typed and selected dates, empty dates and duration, locale, keyboard and modal focus, and create, edit and vote admission before retiring anything.

## Native date picker in Family proposal forms

Commit `ef18d06ee` connects Family proposal creation and editing to the shared native date picker. The desktop trip form and phone sheet use the same proposal dialog. Its two date controls now follow the date format and first day of the week in the current website session. The form retains its existing date-only submission contract, duration behavior and create, edit and vote admission. [Proposal form](../../../client/src/integrations/family/legacy/components/Trips/FamilyProposeTripModal.tsx) · [Native picker](../../../client/src/components/shared/CustomDateTimePicker.tsx)

Six focused cases render the actual Family form through its desktop and phone entry points with fixture reads and mocked writes. They cover a day-first English date, a Sunday-first calendar, calendar selection, duration-only planning, editing the selected proposal, admitting another member's proposal to voting, and German keyboard entry with the existing modal Escape behavior. Four cases reproduced failures with the prior picker. All six now pass. The legacy picker drops out of the active browser import graph. The legacy trip form and budget component imports still need review before its removal.

All 545 tests across 12 suites, typecheck, and the strict, layer, offline, size, translation and RTL checks passed. The strict check reports 463 existing diagnostics within its baseline. The duplication scan found 8,606 lines in 178 files, compared with 8,606 lines in 178 files before the change. All four source guards passed. The local fixture build binds to source commit `cffef2380`. Its artifact scan accepted the intended source binding and rejected wrong or missing bindings.

The Family settings adapter does not persist date format or week start today. The picker therefore follows in-session changes. Verify the current save and reload behavior and determine where to persist these preferences before retiring the old picker. [Family settings adapter](../../../client/src/integrations/family/legacy/store/settingsStore.ts)

## Family date preference account boundaries

The native settings store sends single and bulk changes through the Family settings route. Both display fields were accepted into browser memory. A read in the same session returned the new choices. A fresh load of both stores for the same account returned the built-in values, because the Family preference RPCs only store temperature, distance, time format and display currency. The shared schema's Vacay week start is a separate calendar setting. [Settings route](../../../client/src/integrations/family/applicationHandler.ts) · [Existing preference contract](../../../family-backend/src/data/supabase/familyPreferences.ts)

The same temporary state also survived the Family store's account reset. A subsequent native settings GET could load the previous account's two display choices back into the interface even after the native store was reset. Commit `27ffa120f` resets these two fields to TREK's defaults at the existing Family actor boundary. The same account can still use its choices during the current session. [Family settings store](../../../client/src/integrations/family/legacy/store/settingsStore.ts)

Six account-boundary cases failed before the repair and pass after it. The tests use the native settings store, the actual Axios settings route and fixture preference RPC results. Cases cover person, user, Family, data source and access changes, plus sign-out followed by a different account. All 670 tests across 17 suites, typecheck, six quality checks and four source guards passed. Strict diagnostics stayed at 463. Duplicate lines stayed at 8,606 across 178 files. The local fixture build bound to source commit `bdc236063` and passed artifact validation. [Regression suite](../../../client/src/integrations/family/authContinuations.test.ts)

**Next.** Persist these as website account preferences so choices follow the signed-in user across browsers and Family workspaces. Use a small typed table such as `profile_display_preferences`, with one row per `profiles.id`, ownership policies, and allowed values drawn from the shared TREK settings contract. The existing Family preference rows are keyed by Family and person. The existing profile read policy also admits Family members, which makes an owner-only relation a better fit for personal settings. Keep the current values of `auto` and `monday` for accounts without an override. There is no durable date preference to backfill from this route.

Prove the migration on the established isolated schema checkpoint. Verify owner reads and writes, rejection of other accounts, invalid values, atomic patches to both fields, and concurrent edits to different fields. Wire the native GET, single save and bulk save through the qualified backend adapter, then repeat cold-start and account-switch cases. Confirm any mixed settings writes preserve the existing portable-preference contract and return errors for failed saves. Require explicit rollout coordination for the schema and website together.

## Account-owned Family date display preferences

The Family website now saves date format and first day of the week for the signed-in account. Migration `20261119233622_profile_display_preferences.sql` adds one private typed relationship keyed to `profiles.id`. An account without saved choices gets `auto` and `monday`. Existing Family portable settings and Vacay calendar settings have separate storage. Owner policies require a current Auth session, and the website uses two authenticated invoker RPCs. The update merges only supplied keys and uses the existing Family preference command in the same transaction when a bulk request includes both kinds of preference. [Canonical migration](https://github.com/Misael-L/FamilyTravelApp/blob/12be53ff20cf9c0de0cf4e9ae3b161190d516ed5/supabase/migrations/20261119233622_profile_display_preferences.sql)

The disposable Supabase stack replayed all 151 historical migrations and applied the candidate without any original user data. SQL regression checks covered same-Family isolation, expired sessions, invalid inputs and whole-patch rollback. Auth-issued sessions over local PostgREST proved a fresh sign-in loads the saved values and another account sees its own defaults. A competing patch blocked on the row lock and retained both writers' changed fields. The local advisors reported zero findings on the three new objects. The shared backend checkpoint is `12be53ff2`. [SQL regression suite](https://github.com/Misael-L/FamilyTravelApp/blob/12be53ff20cf9c0de0cf4e9ae3b161190d516ed5/supabase/tests/profile_display_preferences.sql) · [Supabase ownership policies](https://supabase.com/docs/guides/database/postgres/row-level-security) · [PostgreSQL upsert semantics](https://www.postgresql.org/docs/17/sql-insert.html)

Website source `b212ee8e3` wires the native settings endpoints to the Family adapter and protects in-flight changes from older GET responses. The older database can still serve other website settings during a schema-first rollout. An unavailable date write returns an error. All 674 focused client tests and eight backend adapter tests passed, along with both typechecks, scoped quality checks and four source guards. Strict diagnostics are 463 within the existing baseline. The full duplication scan found 8,606 lines in 178 files. The local fixture build bound to source commit `9c453bcb1` and passed its artifact checks.

Roll out the reviewed schema before enabling these saves in a hosted website release. This verification used a local Supabase stack and local website tests. Next, review the legacy date and time picker imports and measure the existing behavior of each retained caller before removing code.

## Retained date and time picker review

The reference review examined 14,061 tracked source and test files. The existing browser scanner and a separate TypeScript import walk found both legacy picker copies outside the main website and optional device recovery entry points. Desktop and phone trip forms, Family proposal forms, the current Costs table, and native Booking and Transport components still reach the current pickers. The Family shared modal and picker ownership module remain in the runtime graph, as does the legacy Budget constants module used by Admin. [Native date picker](../../../client/src/components/shared/CustomDateTimePicker.tsx) · [Native time picker](../../../client/src/components/shared/CustomTimePicker.tsx) · [Family proposal form](../../../client/src/integrations/family/legacy/components/Trips/FamilyProposeTripModal.tsx)

The date copy has three direct retained component callers and one shared test importer. Its complete disconnected component group contains these five files.

- [BudgetPanel.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/fd589cd932176c89a6dce54ad6a24c2f40f07cc8/client/src/integrations/family/legacy/components/Budget/BudgetPanel.tsx)
- [BudgetPanelAddItemRow.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/fd589cd932176c89a6dce54ad6a24c2f40f07cc8/client/src/integrations/family/legacy/components/Budget/BudgetPanelAddItemRow.tsx)
- [BudgetPanelCategoryTable.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/fd589cd932176c89a6dce54ad6a24c2f40f07cc8/client/src/integrations/family/legacy/components/Budget/BudgetPanelCategoryTable.tsx)
- [TripFormModal.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/fd589cd932176c89a6dce54ad6a24c2f40f07cc8/client/src/integrations/family/legacy/components/Trips/TripFormModal.tsx)
- [CustomDateTimePicker.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/fd589cd932176c89a6dce54ad6a24c2f40f07cc8/client/src/integrations/family/legacy/components/shared/CustomDateTimePicker.tsx)

The shared picker suite has seven date validation cases that run for both implementations. Keep each native case and the proposal entry tests when removing the duplicate legacy render setup. The scoped simulation omitted only the five files above and found 895 fewer copied lines, from 8,606 in 178 files to 7,711 in 174 files. The calculation reran the detector on the remaining files so copied matches that move between files are accounted for. The website itself still has the original source and original duplication count. [Native validation suite](../../../client/src/components/shared/CustomDateTimePicker.test.tsx)

Eleven comparison probes confirmed the native picker uses the saved date order and first weekday. With day-first and Sunday selected, typing `05.03.2026` returns March 5 in the native control and May 3 in the retained English copy. Both compact controls emit the selected date without time data. The native clock reads `5:30 PM` as `17:30` even in 24-hour mode. The retained component reads it as `05:30` in that mode. In the retained scoped modal, the first Escape closes the time popup and returns focus to its trigger. The next Escape closes the modal. This behavior matters if the old path is ever reused, and its only remaining component caller after date cleanup is the retained Transport editor's manual form. Keep that editor, form, time picker and its ten-case suite together while reviewing the remaining endpoint identity and cost, file and focus evidence. [Retained time picker](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/shared/CustomTimePicker.tsx) · [Transport regression suite](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.behavior.test.tsx)

All 940 focused tests in 24 suites and the four source checks passed. The 674 tests from the account-preference checkpoint returned the same results. The client tree matches the verified build at `9c453bcb1`. The comparison fixtures were temporary, and this review changes documentation only.

**Next.** Remove the five-file date group and the legacy-only test setup together. Prove the remaining test cases stay identical, the current import graph and compiler remain clean, and the resulting build preserves served JavaScript, CSS and offline assets except for source binding or explicitly accounted-for dormant styles. Keep the active Admin Budget constants and shared modal files. Reassess Transport independently after that removal.

## Disconnected legacy date picker removal

Commit `70ca79653` removes the five disconnected component files listed in the [preceding review](#retained-date-and-time-picker-review). The shared test suite drops only the seven duplicate cases for the deleted picker. All 933 surviving cases have the same names and results, including the native date validation, account-preference and proposal cases and all ten retained Transport regressions.

The 3,051 files reached by the website and device recovery import walk have identical paths and bytes. The fixture builds at `fd589cd93` and `efe1c9bdd` preserve 403 JavaScript bundles after generated filenames are resolved and checked. Thirteen stylesheets are byte-identical. The entry stylesheet drops only the 12 utilities referenced by the deleted files. The service worker, asset manifest, entry HTML and 318 precompressed assets passed the comparison. Artifact scanning accepts the exact source and refuses wrong or missing bindings.

Client typecheck, the quality checks within their existing allowances and all four source guards passed. The full duplication scan confirms the simulated reduction of 895 lines, from 8,606 across 178 files to 7,711 across 174. Strict diagnostics stay at 463 within the existing baseline. The remaining duplication gate is open.

**Next.** Review the retained Transport editor, manual form and time picker together. Trace all ten regression assertions to current coverage or a specific held requirement before proposing deletion. Pay particular attention to exact saved endpoint identity, linked costs, attachments and focus restoration. [Retained Transport suite](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.behavior.test.tsx)

## Retained Transport editor coverage

The reference scan covered 14,056 tracked files and checked the main and device recovery entries. The legacy Transport editor, manual form and time picker still have one test consumer and no browser path. The active desktop and phone Transport views, native clock and shared modal remain reachable. Commit `4438a1a9b` adds two cases on current paths. The Family snapshot test checks two stations with the same display name, distinct place and endpoint IDs and exact leg identity. Its raw edit refuses with HTTP 409 and leaves the RPC, original rows and queue untouched. The desktop test opens the read-only train by keyboard, shows its linked ticket, excludes other bookings' files and costs, then focuses the exact linked expense without saving or deleting the train. [Snapshot test](../../../client/src/integrations/family/plannerCohort.contentRecovery.test.tsx) · [Desktop test](../../../client/src/components/Planner/reservationEditorFocus.test.tsx)

### Ten-case comparison

1. **Preserves midnight, separate civil days, confirmation and notes in a car save.** The native car payload retains midnight, separate days, confirmation and notes. Family Transport authoring remains held. [TransportModal.test.tsx](../../../client/src/components/Planner/TransportModal.test.tsx)
2. **Adds independent flight stops and removes one without changing the remaining airport or leg.** The native editor keeps the second stop and its outgoing leg when the first is removed. Family Transport authoring remains held. [TransportModal.test.tsx](../../../client/src/components/Planner/TransportModal.test.tsx) · [MTransportFormSheet.test.tsx](../../../client/tests/unit/mobile/trip/MTransportFormSheet.test.tsx)
3. **Matches train locations to their own identity and preserves intermediate leg fields.** The Family lookup preserves both stored place UUIDs and the leg IDs for equal display names. A raw remove-and-save request is refused before RPC or queue work. Native route forms retain station geometry and leg fields. The future writer must use explicit saved place and endpoint identities. [plannerCohort.contentRecovery.test.tsx](../../../client/src/integrations/family/plannerCohort.contentRecovery.test.tsx) · [TransportModal.test.tsx](../../../client/src/components/Planner/TransportModal.test.tsx) · [MTransportFormSheet.test.tsx](../../../client/tests/unit/mobile/trip/MTransportFormSheet.test.tsx)
4. **Keeps edits, linked expense identity, file identity and focus handoff together.** The current Family desktop detail shows the matching linked file and focuses the exact linked expense. Ordinary transport tests separately cover save-before-Costs and file retry on the returned reservation ID. The combined Family save, attachment and Costs focus handoff requires a qualified writer. [reservationEditorFocus.test.tsx](../../../client/src/components/Planner/reservationEditorFocus.test.tsx) · [TransportModal.test.tsx](../../../client/src/components/Planner/TransportModal.test.tsx) · [MTransportFormSheet.test.tsx](../../../client/tests/unit/mobile/trip/MTransportFormSheet.test.tsx) · [useBookingEdits.test.ts](../../../client/src/pages/tripPlanner/useBookingEdits.test.ts)
5. **Saves before opening a new expense linked to the returned transport identity.** The ordinary phone form saves before opening the cost sheet with the returned ID. The Family save guard blocks the callback on refusal. The Family create-and-link workflow requires a qualified writer. [MTransportFormSheet.test.tsx](../../../client/tests/unit/mobile/trip/MTransportFormSheet.test.tsx) · [useBookingEdits.test.ts](../../../client/src/pages/tripPlanner/useBookingEdits.test.ts)
6. **Unlinks only the linked expense and refreshes without resaving the transport.** The shared Costs section unlinks only the selected expense and keeps the expense record. Native Transport leaves editing open when unlink fails. Family Transport details expose saved links. Editor unlink remains outside that read-only path. [BookingCostsSection.test.tsx](../../../client/src/components/Planner/BookingCostsSection.test.tsx) · [TransportModal.test.tsx](../../../client/src/components/Planner/TransportModal.test.tsx)
7. **Keeps the editor open when an expense unlink fails.** The native Transport test checks the exact unlink request, preserves the still-linked expense and leaves the editor open on failure. Family Transport editor mutations remain held. [TransportModal.test.tsx](../../../client/src/components/Planner/TransportModal.test.tsx)
8. **Refuses a read-only form submit even if a caller bypasses its disabled save button.** The active save callback refuses both create and edit without an optimistic change, HTTP write, queue entry or follow-up. The installed handler also refuses raw reservation writes. Keep the refusal until the observed writer is qualified. [useBookingEdits.test.ts](../../../client/src/pages/tripPlanner/useBookingEdits.test.ts) · [plannerApplicationReads.test.ts](../../../client/src/integrations/family/plannerApplicationReads.test.ts)
9. **Retains entered data and refuses the close/cost handoff after a failed save.** A refused save keeps typed notes, leaves the editor open and drops the linked-expense handoff. An ordinary retry uses the preserved data. The protected Family branch refuses the save before follow-up work. [TransportModal.test.tsx](../../../client/src/components/Planner/TransportModal.test.tsx) · [useBookingEdits.test.ts](../../../client/src/pages/tripPlanner/useBookingEdits.test.ts)
10. **Keeps automated transport unavailable without issuing a save.** The current Family desktop and phone gates keep saved route details and omit unsupported editing and automated actions. The earlier installed-adapter probe recorded HTTP 501 with no provider request. Automated transit remains a separate integration. [TripPlannerPage.wiring.test.tsx](../../../client/src/pages/TripPlannerPage.wiring.test.tsx) · [TransitJourneyModal.test.tsx](../../../client/src/components/Planner/TransitJourneyModal.test.tsx) · [MPlanTimeline.test.tsx](../../../client/tests/unit/mobile/trip/MPlanTimeline.test.tsx) · [MTripShell.test.tsx](../../../client/tests/unit/mobile/trip/MTripShell.test.tsx)

### Requirements for any future Family Transport writer

Use stable endpoint IDs to distinguish updates, removals and reordering. Validate an explicitly selected place against the current trip and actor. Keep a free-text station unlinked unless the user selects a verified identity. The older compatibility mapper can inherit the removed station's place or airport link from its array position. The installed Family planner blocks that write path. Preserve an existing reservation ID on update and use the committed ID for new Costs or file links. On save failure, retain the form and skip the handoff. If a subsequent file upload fails, retry its attachment against the committed reservation. Verify the focus handoff after an accepted save on desktop and phone before exposing the action. [Compatibility mapper](../../../client/src/integrations/family/tripResourceMutations.ts) · [Retained fixture](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.behavior.test.tsx)

All 1,721 focused tests in 38 suites passed, including all ten old cases and the two additions. The 933 cases in the date cleanup have the same names and outcomes. Client typecheck, the scoped quality checks and the four source guards passed. The reachable source fingerprint matches the verified date cleanup build at `efe1c9bdd`. Strict diagnostics stay at 463 within the existing baseline. This packet adds coverage only.

**Next.** Rehearse removing the exact three disconnected Transport files and the legacy suite together. Keep the two active tests, ordinary Transport behavior and Family refusal cases. Preserve the held writer requirements above and prove the resulting build and reachable source match. Shared modal and picker ownership are outside this deletion.

## Disconnected legacy Transport editor removal

Commit `990636515` removes the unused Family Transport editor, its manual form, its private clock, and the disconnected editor's ten-case suite. The [ten-case comparison](#ten-case-comparison) records the supported checks and the editing cases that depend on a future Family writer. The surviving 1,711 cases across 37 suites have identical names and outcomes. They include the two new identity and attachment checks, the native desktop and phone forms, and the Family write refusals. [FamilyTransportEditor.behavior.test.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.behavior.test.tsx) · [FamilyTransportEditor.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportEditor.tsx) · [FamilyTransportManualForm.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/Planner/FamilyTransportManualForm.tsx) · [CustomTimePicker.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/e0592af4bb9bd787ace90fbbf04ae74063d9e01c/client/src/integrations/family/legacy/components/shared/CustomTimePicker.tsx)

Both import scans retain the same reachable counts, including the shared Family modal, picker ownership module and native clock. The browser source fingerprint is identical. Local fixture builds at `e0592af4b` and `b3ab79b86` match byte for byte for all 403 JavaScript bundles, 14 stylesheets, 318 precompressed assets, the entry HTML, service worker and asset manifest. Only the source commit field in the fixture public config changes. Artifact scanning accepts the bound candidate and rejects an incorrect or absent binding.

Typecheck and the four source guards pass. Strict diagnostics stay at 463 within the existing allowance. The full duplication scan falls from 7,711 lines across 174 files to 7,393 across 171, a reduction of 318 lines. The duplication gate remains open.

**Next.** Review the retained System Notice banner and action helpers against the mounted native host. Trace explicit `.js` specifiers to their TypeScript files and check dynamic imports, test mocks, notice actions and dismiss persistence. [Native host](../../../client/src/components/SystemNotices/SystemNoticeHost.tsx) · [Legacy banner](https://github.com/Misael-L/FamilyTravelSite/blob/a316a88bc91998de3f71249cfe0e0662b080f139/client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeBanner.tsx)

## System Notice banner and actions review

The two old host/modal files were retired earlier. This review proposes three additional files for a separate removal rehearsal.

- [SystemNoticeBanner.tsx](https://github.com/Misael-L/FamilyTravelSite/blob/a316a88bc91998de3f71249cfe0e0662b080f139/client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeBanner.tsx)
- [Legacy notice action registry](https://github.com/Misael-L/FamilyTravelSite/blob/a316a88bc91998de3f71249cfe0e0662b080f139/client/src/integrations/family/legacy/components/SystemNotices/noticeActions.ts)
- [Legacy Trip action registration](https://github.com/Misael-L/FamilyTravelSite/blob/a316a88bc91998de3f71249cfe0e0662b080f139/client/src/integrations/family/legacy/pages/Trips/noticeActions.ts)

The TypeScript scan resolves explicit `.js` imports from the main website, the device-recovery entry and the native shell. It examined 13,974 source and test files. The only incoming module edges are the legacy banner and legacy Trip action registration importing their own registry. The scan found zero outside imports, test mocks, path references or augmentations for the three candidates. The reachable literal globs load locale modules and mascot videos. The indirect chunk import retries an existing failed lazy asset URL. Simulating omission preserves all 6,076 reachable paths, edges and source bytes. [Earlier host and modal retirement](../core-notice-ui-retirement-handoff.md)

The website mounts the current System Notice host from App, uses its native banner, toast and modal components, and registers the Trip creation action through the native registry. The Family response for active notices is an empty list and a dismissal request returns HTTP 501 with `adapter_not_connected` before any repository write. Family authentication still calls its legacy notice store. Its Supabase-mode read returns an empty loaded state without fetching. Preserve both notice stores, both auth paths, the native renderer and registry, and the server API. [Native host](../../../client/src/components/SystemNotices/SystemNoticeHost.tsx) · [Family application handler](../../../client/src/integrations/family/applicationHandler.ts) · [Legacy notice store](../../../client/src/integrations/family/legacy/store/systemNoticeStore.ts)

The ordinary TREK server records dismissals by user and notice and keeps the app version for notices that recur after an upgrade. The local UI probe exercised the real host and Trip creation action, observed navigation to `/dashboard?create=1`, then verified the request for the exact notice ID and its absence after resetting and refetching from the fixture. A second probe confirmed the Family route responses and lack of repository writes. All 367 existing client tests, 37 ordinary server tests, and both temporary probes passed. These are local fixture results. The current application source and reachable-source fingerprint match the prior build inputs.

The duplication simulation estimates 7,032 copied lines across 167 files if these three files are removed, 361 fewer than the current full scan of 7,393 lines. This review preserves all three files and the existing release gate.

**Next.** Rehearse removal of exactly the three disconnected files. Preserve the live auth stores, notice writes and action registration. Re-run the 28 existing suites and both local behavior probes and compare the reachable source, generated assets and full duplication results before accepting the deletion.

## Disconnected System Notice removal

Commit `15a562957` removes the three legacy modules listed in the [preceding review](#system-notice-banner-and-actions-review). A fresh import scan verifies all 6,076 paths, edges and reachable source bytes match the prior review. The mounted native host, its registry and Trip action, and both notice stores remain in the graph.

The 367 client cases, 37 ordinary server cases and two temporary probes return the same results as before. Standard TREK follows its registered Trip action and stays dismissed after a fixture refetch. The Family adapter still returns an empty feed and refuses dismissal before a repository write.

The builds at `a316a88bc` and `b4c368689` match across 403 JavaScript bundles after resolving generated filenames. Thirteen stylesheets are byte-identical. The entry stylesheet drops only `-mr-2` and `ml-3`, which occurred in the deleted banner. The 318 precompressed assets, offline service worker, asset manifest and entry HTML pass the comparison. The artifact scanner accepts the bound build and refuses incorrect or missing source bindings. Typecheck and source guards pass. Strict diagnostics remain at 463 within the existing allowance.

The full duplication check confirms the projected reduction of 361 lines, from 7,393 lines across 171 files to 7,032 across 167. The duplication gate remains open.

**Next.** Review the legacy Photo Providers settings panel's imports and exports, then compare any reachable behavior with the current desktop and phone settings. Check provider availability, omitted secret fields and request routing with local fixtures. Start with the panel and retain shared helpers until their callers are verified. [Legacy panel](https://github.com/Misael-L/FamilyTravelSite/blob/d1ef444a67023cd12d7c61d5040ee02f0cfed2a8/client/src/integrations/family/legacy/components/Settings/PhotoProvidersSection.tsx) · [Current provider hook](../../../client/src/components/Settings/usePhotoProviderConnections.ts)

## Legacy Photo Providers panel review

The retained Family panel has no importer in the 13,971 modules and tests reviewed. The scan resolves explicit `.js` imports, literal lazy imports and test mocks from the website, device recovery and native shell. Its only outside source reference is a translation scanner entry. Previewing omission preserves all 6,076 reachable paths, import edges and source bytes. The current desktop and phone panels still use the same provider connection hook. The proposed deletion is limited to the old panel. [Legacy panel](https://github.com/Misael-L/FamilyTravelSite/blob/d1ef444a67023cd12d7c61d5040ee02f0cfed2a8/client/src/integrations/family/legacy/components/Settings/PhotoProvidersSection.tsx) · [Current hook](../../../client/src/components/Settings/usePhotoProviderConnections.ts)

Both actual settings shells hide provider controls and issue no provider request in managed mode, even with an enabled provider row in the fixture. In their ordinary mode, both read the declared settings and status routes and leave a stored secret out of the field. The local HTTP probes observe the declared POST test and PUT save without the untouched optional secret. They verify the status recheck after saving and that the fallback GET is unused when a POST route is declared. The existing tests cover the GET-only fallback and disabled or required fields. With Journey enabled, the real Family add-on handler still returns no photo provider rows. Neither settings shell shows a provider action or calls a provider route in that fixture.

Omitting the old panel alone leaves its two dynamic translation entries stale. The simulation removing that one entry from the file list in `DYNAMIC_ALLOWED` drops exactly those two exceptions. All other verdicts and the four entries for the live desktop and phone panels are identical. The translation catalogs and unused-key baseline require no adjustment. [Translation file list](../../../client/scripts/i18n-keys.mjs)

All 199 existing settings, add-on and Journey cases, 21 scanner cases and five temporary behavior probes pass. The four source guards pass. The application source still matches the previous verified build. Omitting the panel projects 6,719 duplicated lines across 165 files, 313 fewer than the current full scan. This review changes documentation only.

**Next.** Rehearse removing the single legacy panel and its obsolete file-list entry together. Preserve shared controls, the live provider hook and both settings gates. Rerun the existing tests and five probes, the full translation check, source qualification and build comparison before accepting the deletion.

## Disconnected Photo Providers removal

Commit `983277d7b` removes the unused legacy panel and one source row from the translation file list. That row generated two exceptions for the old panel. The four entries for the desktop and phone panels are retained, and the live translation check passes with the existing catalogs and unused-key baseline. All 6,076 paths, import edges and reachable source bytes match the reviewed source. [Translation file list](../../../client/scripts/i18n-keys.mjs)

All 225 local tests and probes reproduce their earlier outcomes. They cover both settings shells, managed mode, omission of an untouched secret, declared routes and the Family add-on response without photo providers. The TypeScript check and four source guards also pass. Strict diagnostics remain at 463 within the existing allowance.

The local builds compare `d1ef444a6` with `cf95603e6`. The generated JavaScript, stylesheets, entry HTML and offline assets match byte for byte. Only the source commit field in the fixture configuration changes. The artifact scanner accepts the bound candidate and rejects incorrect and missing source bindings.

The full duplication count falls by 313 lines, from 7,032 across 167 files to 6,719 across 165. The duplication gate remains open.

**Next.** Review the legacy Appearance Settings panel for importers and prove the current desktop and phone behavior around color mode, palettes and theme preview before proposing removal. Keep shared theme controls and persisted preferences in scope for preservation. [Legacy Appearance panel](https://github.com/Misael-L/FamilyTravelSite/blob/ede925419ec2da691f2300cadae8bbd7732d764e/client/src/integrations/family/legacy/components/Settings/AppearanceSettingsTab.tsx) · [Current desktop Appearance panel](../../../client/src/components/Settings/AppearanceSettingsTab.tsx)

## Appearance Settings session fix and legacy review

The review reproduced a priority issue in the native editor used by both settings shells. A pending appearance edit reached the settings writer even after its session ended, both when the timer elapsed and when the editor closed. A late rejected save also showed its error in the replacement session. Commit `7621870e1` records the existing client session at the preview gesture. A retired session discards its pending edit before the store or API is called and drops a late error toast. A current session still previews immediately, persists after the existing delay and flushes once on normal close. [Shared editor](../../../client/src/components/Settings/useAppearanceEditor.ts)

The three new cases reproduced those failures and pass with the fix. All 230 focused cases pass across desktop and phone appearance, settings and authentication. Three additional fixtures execute the shipped theme boot script and verify an auto-mode custom scheme, a shared-page neutral scheme and a malformed snapshot fallback. The build at `be373c6f9` passes its source-binding controls. Typecheck, theme and translation checks, formatting in the changed files and the four source guards pass. Strict diagnostics stay at 463 within the existing allowance.

The legacy panel has no importer in the 13,970 reviewed files. The scan found no outside source path references, test mocks or augmentations. It resolves explicit JavaScript-style imports, lazy chunks and the main website, device recovery and native shell entries. A simulated omission preserves all 6,076 reachable paths, edges and bytes from the fixed checkout, including the native panels, shared editor and theme boot script. The component's local settings, palette and API code are outside that graph. [Legacy panel](https://github.com/Misael-L/FamilyTravelSite/blob/ede925419ec2da691f2300cadae8bbd7732d764e/client/src/integrations/family/legacy/components/Settings/AppearanceSettingsTab.tsx) · [Theme boot](../../../client/public/theme-boot.js)

The full duplication count remains at 6,719 lines across 165 files after the session fix. Omitting only the legacy panel projects 6,544 lines across 162 files, 175 fewer. The legacy panel is retained for a separate removal rehearsal.

**Next.** Rehearse deleting only the disconnected Appearance Settings panel. Preserve the pending-save session check, theme boot, both native settings panels, shared theme controls and existing scanner baselines. Compare build outputs and re-run settings and theme checks from the fixed checkpoint.

## Disconnected Appearance Settings removal

Commit `0b3aeddae` removes the single legacy panel from the [preceding review](#appearance-settings-session-fix-and-legacy-review). The main website, device recovery and native shell still reach the same 6,076 paths with the same edges and source bytes. That includes theme boot, the current desktop and phone panels, and the shared editor that binds pending saves to their session.

All 230 existing test cases and three boot fixtures reproduce their previous results. The current theme controls, pending-save regressions, source checks, typecheck, translation and theme checks pass. Strict diagnostics stay within the existing allowance of 463.

The local builds compare `ede925419` with `42246a5a9`. All 403 JavaScript bundles match after resolving generated filenames. Thirteen stylesheets match byte for byte. The entry stylesheet drops the removed panel’s two now-unused utilities, `border-l-2` and `pl-3`. The 318 precompressed assets, offline service worker, manifest and entry HTML pass the comparison. Artifact scanning accepts the exact source binding and rejects an incorrect or missing binding.

The full duplication scan confirms the projected reduction of 175 lines, from 6,719 across 165 files to 6,544 across 162. The duplication gate remains open.

**Next.** Review the legacy AirTrail connection settings panel. Trace module and tooling references and compare provider visibility and request behavior with the current desktop and phone settings before proposing any removal. Keep the import dialog and its existing connection checks in scope for preservation. [Legacy AirTrail settings](https://github.com/Misael-L/FamilyTravelSite/blob/1cd42b8b6032d1aa37cecee2d7a1707de716f598/client/src/integrations/family/legacy/components/Settings/AirTrailConnectionSection.tsx) · [Current AirTrail settings hook](../../../client/src/components/Settings/useAirTrailSettings.ts)

## Legacy AirTrail connection settings review

The legacy AirTrail settings panel has no importer in the 13,969 source and test files reviewed. The scan resolves explicit JavaScript-style imports, lazy imports and test mocks. It found no outside tooling reference or augmentation. Simulated omission preserves all 6,076 reachable paths, edges and source bytes. This scope covers one settings component. [Legacy panel](https://github.com/Misael-L/FamilyTravelSite/blob/1cd42b8b6032d1aa37cecee2d7a1707de716f598/client/src/integrations/family/legacy/components/Settings/AirTrailConnectionSection.tsx) · [Current settings hook](../../../client/src/components/Settings/useAirTrailSettings.ts)

The current desktop and phone settings share the connection hook. Both shells hide it when the add-on is disabled or the instance is managed. Local HTTP fixtures observe the settings read, connection test, save and status recheck at their expected routes. The masked key field stays empty and omits a stored key from both the test and save bodies. The planner needs both the add-on and a healthy connection before it shows import. The real Family add-on handler leaves AirTrail off, so neither settings shell nor the planner availability check sends an AirTrail request in the Family fixture. [Planner availability](../../../client/src/hooks/useAirtrailConnection.ts) · [Current import dialog](../../../client/src/components/Planner/AirTrailImportModal.tsx)

All 362 existing cases and six temporary probes pass. The four source guards pass. The import fingerprint matches the previous verified build. The translation simulation preserves both the verdict and unused keys with the current scanner settings. Omitting just the legacy panel projects 6,412 duplicated lines across 160 files, 132 fewer than the current full scan. This checkpoint changes documentation only.

**Next.** Rehearse removing only the disconnected AirTrail settings panel. Keep the shared settings and planner connection hooks, both native forms, the Family add-on gate and the current import dialog. Rerun the cases and probes, verify source qualification and compare builds before accepting the deletion.

## Disconnected AirTrail connection settings removal

Commit `37d3ced2b` removes the one unused settings component from the [preceding review](#legacy-airtrail-connection-settings-review). A fresh scan verifies the same 6,076 reachable paths, edges and source bytes. The native settings forms, shared settings and availability hooks, current import dialog, and both planner entry paths remain in the import graph.

All 362 test cases and six temporary probes reproduce their earlier results. They verify the expected connection routes without including an untouched key, the settings gates, and the planner import behavior. The Family fixture has no AirTrail action and issues no AirTrail requests. Typecheck, theme, translation and source checks pass. Strict stays within the existing allowance of 463 diagnostics.

The local builds compare `1cd42b8b6` with `d69bfedd1`. All 403 JavaScript bundles match after resolving generated filenames. Thirteen stylesheets match byte for byte. The entry stylesheet drops the two unused rules for `focus:ring-slate-300` and `sm:basis-auto`. The service-worker comparison verified all 525 precache entries and identical loader logic after resolving two renamed local variables. The 318 precompressed assets, manifest and entry HTML also pass the comparison. The artifact scanner accepts the exact source binding and refuses an incorrect or missing binding.

The full duplication scan confirms a reduction of 132 lines, from 6,544 across 162 files to 6,412 across 160. The duplication gate remains open.

**Next.** Review the legacy personal Notifications settings panel for importers and active settings behavior. Compare the desktop and phone settings, their saved preferences and delivery controls with local fixtures. [Legacy panel](https://github.com/Misael-L/FamilyTravelSite/blob/0925663fbafa6f12ab1446dc29d1f2fc8ed9e3d5/client/src/integrations/family/legacy/components/Settings/NotificationsTab.tsx) · [Current notifications hook](../../../client/src/components/Settings/useNotificationSettings.ts)

## Personal Notifications settings repair and legacy review

Desktop and phone Family settings both showed an error when the native TREK panels requested delivery preferences. A local reproduction through the Family application handler and Axios adapter returned HTTP 501 for that request. The existing [Family inbox adapter](../../../client/src/integrations/family/notificationHandler.ts) already serves in-app notifications. The older [member preferences component](../../../client/src/integrations/family/legacy/components/Settings/FamilyNotificationPreferencesPanel.tsx) manages iOS push overrides.

Commit `5da2a9805` uses the existing desktop and phone cards to describe Family in-app delivery and link to the inbox. The two route regressions open the real inbox screens and confirm the signed-in Family scope at the adapter boundary with synthetic inbox results. Opening the Family settings card sends zero delivery settings requests. The 259 existing settings, delivery and inbox regressions pass.

The first fixture artifact was refused after bundling changed the minified names around an inactive local recovery check. Commit `e3d737aa0` compiles out that check when its local qualification is absent. All 230 existing recovery/profile and scanner tests pass. Build `168043127` verifies the exact source binding and refuses a wrong or absent binding. The four source guards, typecheck, strict, theme, translation and other focused checks pass. The build uses the existing scanner policy and inbox backend.

The [legacy personal Notifications tab](https://github.com/Misael-L/FamilyTravelSite/blob/0925663fbafa6f12ab1446dc29d1f2fc8ed9e3d5/client/src/integrations/family/legacy/components/Settings/NotificationsTab.tsx) remains disconnected. The scan finds no module or tooling consumer and omitting it preserves all 6,077 reachable paths and edges. It projects 180 fewer duplicated lines, from 6,412 across 160 files to 6,232 across 158. The translation simulation preserves the verdict and unused key count. The current duplication count stays at 6,412 until the deletion is independently verified.

**Next.** Rehearse removing only the disconnected legacy personal Notifications tab using this fixed source. Rerun the notification, device-recovery and source checks and compare the two builds. Keep the old iOS member preferences component, Admin defaults, shared backend preferences and inbox paths available for their own review.

## Disconnected legacy personal Notifications tab removal

Commit `71cecc4c4` removes the single disconnected tab confirmed by the [preceding review](#personal-notifications-settings-repair-and-legacy-review). The import scan verifies the same 6,077 reachable paths, dependency edges and source bytes, including both active Notifications settings panels, their Family inbox link, and the inbox routes. The deletion preserves the separately retained [member preferences component](../../../client/src/integrations/family/legacy/components/Settings/FamilyNotificationPreferencesPanel.tsx).

All 491 named cases in 21 suites reproduce their prior results, including the Family settings-to-inbox routes on desktop and phone, recovery qualification, and artifact scanner tests. The four source guards, typecheck, theme, translation and other measured checks pass. Strict remains at the existing 463 diagnostics.

The local builds compare `0925663fb` with `46cf23839`. The generated JavaScript, stylesheets, entry HTML and offline assets match byte for byte. The fixture configuration updates its source commit field. The artifact scanner accepts the exact source binding and refuses an incorrect or missing binding.

The full duplication scan confirms a reduction of 180 lines, from 6,412 across 160 files to 6,232 across 158. The duplication gate remains open.

**Next.** Review the [legacy Plugin Settings tab](https://github.com/Misael-L/FamilyTravelSite/blob/2d91bcebaf79c54170af3edfe901cdca9af80229/client/src/integrations/family/legacy/components/Settings/PluginSettingsTab.tsx) against the active desktop and phone forms. Trace its importers and check saved fields, activity and plugin availability before proposing a retirement.

## Plugin Settings deep-link repair and legacy review

Opening `/settings?tab=plugins` on desktop selected a hidden tab and left the settings body blank when the plugin list was empty or the instance was managed. The same shared hook carries the requested tab on phone, where the shell already falls back to its first section. Commit `95e367cca` makes the hook select General while Plugins is unavailable and honor the request when plugins become available. All three new regressions reproduced the blank body before the repair and pass afterward.

The real Family handler returned an empty active plugin list to both local settings shells. Each shell opened General and made zero requests for plugin settings, OAuth or activity. Mock plugin fixtures exercise field loading, saves that preserve untouched masked credentials, and activity refresh on the existing native views. All 235 cases in 13 focused suites and both Family adapter probes pass. Build `01e59eb8d`, source and artifact checks, typecheck, strict, theme and translation pass.

The legacy [Plugin Settings tab](https://github.com/Misael-L/FamilyTravelSite/blob/2d91bcebaf79c54170af3edfe901cdca9af80229/client/src/integrations/family/legacy/components/Settings/PluginSettingsTab.tsx) is the sole importer of the legacy [activity panel](https://github.com/Misael-L/FamilyTravelSite/blob/2d91bcebaf79c54170af3edfe901cdca9af80229/client/src/integrations/family/legacy/components/Settings/PluginActivityPanel.tsx). No outside module or tooling references either file. Omitting them preserves the same 6,077 reachable paths, dependency edges and source bytes, with the active desktop and phone forms, navigation and their shared hooks still reachable. Translation checks give the same results in the simulation.

Omitting the two files projects 82 fewer duplicated lines, from the last verified 6,232 across 158 files to 6,150 across 154. The proposed removal is a separate step with a before-and-after build comparison.

**Next.** Rehearse removing the two disconnected legacy modules together. Rerun these 13 suites and two Family adapter probes and verify the source binding, generated website assets and the expected duplication result.

## Disconnected legacy plugin settings removal

Commit `89565e4b5` removes the two legacy modules confirmed by the [preceding review](#plugin-settings-deep-link-repair-and-legacy-review). The fresh import scan verifies the same 6,077 reachable paths, dependency edges and source bytes, including the active desktop and phone plugin forms, activity hook, and shared deep-link behavior.

All 235 named cases and two Family adapter probes reproduce their prior results. The checks include saved fields, masked credentials, activity refresh, a late plugin list, and the Family fallback to General. Typecheck, theme, translation and the four source guards pass. Strict remains at the existing 463 diagnostics.

The local builds compare `2d91bceba` with `dd0892200`. All 403 JavaScript bundles match after resolving generated filenames. Thirteen stylesheets match byte for byte. The entry stylesheet drops the unused `text-right` rule from the legacy activity panel. The offline worker retains the same loader and 525 precache entries. The 318 precompressed assets, manifest and entry HTML also pass the comparison. The artifact scanner accepts the exact source binding and refuses an incorrect or missing binding.

The full duplication scan confirms a reduction of 82 lines, from 6,232 across 158 files to 6,150 across 154. The duplication gate remains open.

**Next.** Review the [legacy Map Settings wrapper](https://github.com/Misael-L/FamilyTravelSite/blob/c57f6d8a884529b44e761f1ea49d5f185e816688/client/src/integrations/family/legacy/components/Settings/MapSettingsTab.tsx), its Family picker and its old TREK tab. Trace their consumers and compare the current desktop and phone map settings, especially how the Family app loads and saves provider choices.

## Family map settings persistence review

Desktop and phone both reported a successful Map Settings save without updating the Family preference. The real form and adapter show the chosen template in memory, then lose it after a fresh settings load. The canonical Family map store sends a scoped named-option save and supports inheriting the family default. Both behaviors were reproduced through local fixtures. [Failure sequence and repair contract](family-map-settings-cutover.md)

The isolated Supabase focused test confirms reading the default, saving an enabled choice, reading the saved value, resetting, and refusing disabled and unrelated-family writes. It also refuses the unrelated-family read. The broader historical smoke expects two MFA registry entries absent on that isolated database. All three frontend probes, 239 focused regressions in 16 files, and four source guards pass at their documented scope.

The legacy wrapper imports the old [Family picker](../../../client/src/integrations/family/legacy/components/Settings/FamilyMapPicker.tsx) and [TREK tab](https://github.com/Misael-L/FamilyTravelSite/blob/c57f6d8a884529b44e761f1ea49d5f185e816688/client/src/integrations/family/legacy/components/Settings/NestMapSettingsTab.tsx). No other importer reaches those three components. A three-file omission leaves the same 6,077 reachable paths and translation results, and projects 26 fewer duplicated lines. The picker remains an implementation reference for the Family settings repair. The reachable GL preview stays in the active dependency graph.

**Next.** Connect the current settings shells and native renderers to the existing Family preference contract, then reassess the legacy components. [Implementation and acceptance checks](family-map-settings-cutover.md)

## Durable Family Map Settings

Commit `510b6662f` connects desktop and phone Map Settings to the existing Family member preference. Both shells reuse the Family picker, which offers enabled options with usable credentials and a reset to the family default. The native trip and signed-in Journey maps read the same confirmed choice. The old generic settings path refuses Family-managed map fields with a clear error. Device-local rendering controls continue through the general settings adapter.

The local cases show that a confirmed selection reaches both native renderers, reloads from the stored choice, and resets to the family default. They also cover disabled choices, rejected saves, concurrent requests, stale reads, account retirement, and isolation on the public Journey renderer. All 522 tests across 31 suites pass. The isolated Supabase RPC test verifies the named selection, subsequent read, reset and authorization refusals. Its synthetic rows roll back.

Build `d90450f9d`, artifact binding, typecheck and source checks pass. Commit `d390b0068` keeps the actor and assistant cache identities in the scanner’s existing approved Vite configuration context. The native presentation guard verifies all seven upstream-exact files.

**Next.** Verify retirement of the disconnected legacy [settings wrapper](https://github.com/Misael-L/FamilyTravelSite/blob/c57f6d8a884529b44e761f1ea49d5f185e816688/client/src/integrations/family/legacy/components/Settings/MapSettingsTab.tsx) and [TREK map tab](https://github.com/Misael-L/FamilyTravelSite/blob/c57f6d8a884529b44e761f1ea49d5f185e816688/client/src/integrations/family/legacy/components/Settings/NestMapSettingsTab.tsx). The Family picker now has active consumers. Keep its renderer and the shared map policy in the import graph.

## Disconnected legacy map settings removal

Commit `a33b406b6` removes the wrapper and TREK tab verified in the [preceding review](#durable-family-map-settings). The import trace still reaches the same 6,080 paths with identical source bytes and dependency edges. The active Family picker, Mapbox preview, desktop and phone settings, and native map renderers stay in that graph.

The same 522 named cases pass across 31 suites, including Family provider save, reload, reset, concurrent reads, session retirement, and public and offline map behavior. Typecheck, all four source guards and the scoped lint checks pass. Strict stays at 463 diagnostics within its existing allowance.

The local builds compare `c57f6d8a8` with `70f44a3c5`. All 401 JavaScript bundles match after resolving generated filenames. Thirteen stylesheets match byte for byte. The entry stylesheet drops only five utilities referenced by the deleted modules. The offline worker retains its loader and 523 precache entries. The 319 precompressed assets, manifest and entry HTML also pass the comparison. The artifact scanner accepts the exact source commit and refuses an incorrect or missing binding.

The full duplication scan confirms 26 fewer lines, from 6,150 across 154 files to 6,124 across 152. The duplication gate remains open.

**Next.** Trace the [legacy Offline settings panel](https://github.com/Misael-L/FamilyTravelSite/blob/10f7dc1c377f3a295cc4f9f02ed7ac36916ba48a/client/src/integrations/family/legacy/components/Settings/OfflineTab.tsx) and compare it with the active desktop and phone settings. Check which surfaces own download, removal and pending-work recovery before proposing any deletion.

## Offline settings preparation guard and legacy review

The active [desktop Offline tab](../../../client/src/components/Settings/OfflineTab.tsx) and [phone Offline section](../../../client/src/mobile/screens/settings/MSettingsOffline.tsx) both use [the same settings hook](../../../client/src/components/Settings/useOfflineSettings.ts). It owns download and re-sync, saved-trip pinning and per-trip cache eviction. Per-trip eviction preserves queued writes. Full cache clearing refuses atomically while protected original work or import sources are present. Both shells show guarded retry and discard, and export private retained work where eligible. The separately qualified unattributed device recovery route belongs to its own entry point. Planner-specific saved-trip reading has a separate source qualification.

On both surfaces, Force offline mode previously engaged even when the active planner refused full preparation. A failed download had the same effect, and an accepted download could flip the persisted mode after the initiating session ended while the screen refreshed its cache. Commit `ce23e489d` requires a completed preparation in the original session before changing the mode while online. A user can still turn the override on while already disconnected and turn it off to reconnect. The planner preparation scope and the visible download notice are inherited from the existing manager.

All four regression cases reproduce the original problem and pass with the repair. The same 294 existing cases also pass. The two opt-in disposable Auth cases are skipped. Local build `5ab5b920a`, artifact source-binding controls, typecheck, scoped lint and the four source checks pass. Strict remains at 463 existing diagnostics. Duplication remains at 6,124 lines across 152 files.

The [legacy Offline panel](https://github.com/Misael-L/FamilyTravelSite/blob/10f7dc1c377f3a295cc4f9f02ed7ac36916ba48a/client/src/integrations/family/legacy/components/Settings/OfflineTab.tsx) has no external import, type, mock, tooling, or route reference in the reviewed tree. Omitting that single file preserves the same 6,080 reachable paths, dependency edges and bytes in the import simulation. The import trace preserves both settings entry points, the shared native hook, queue status, guarded database operations, the Family retained export and device recovery entry.

**Next.** Rehearse removing just the disconnected panel. Repeat the native and retained-work regressions and verify the paired source-bound builds. Keep the active download, cache, and recovery owners in the dependency graph.

## Disconnected legacy Offline settings removal

Commit `c7fa56a84` removes the panel verified in the [preceding review](#offline-settings-preparation-guard-and-legacy-review). The dependency scan reaches the same 6,080 paths, source bytes and import edges. Both active settings screens, the shared download and cache logic, guarded queue commands, retained-work export and the device recovery entry are included.

The same 298 cases pass, including the four Force offline regressions and the guarded per-trip cache and retained-work cases. Two opt-in Auth cases were skipped. Typecheck, scoped lint and all four source checks pass. Strict remains at 463 diagnostics within the existing allowance.

The local builds compare `10f7dc1c3` with `97bb4dfe8`. All 401 JavaScript bundles, 14 stylesheets, 319 precompressed assets, the entry HTML and offline worker match byte for byte. Only the expected source commit marker differs among the 3,798 files. The artifact scanner accepts the exact source commit and refuses an incorrect or missing binding.

Duplication still measures 6,124 copied lines across 152 files. This panel removal reduces unused code while the duplication gate stays open.

**Next.** Review the [legacy passkeys settings section](https://github.com/Misael-L/FamilyTravelSite/blob/30d7a4ac86e44bb1d3fbdf766310d7c164afb28f/client/src/integrations/family/legacy/components/Settings/PasskeysSection.tsx) against desktop and phone account settings. Trace which registration, removal and provider controls are active and check the existing permissions before proposing any removal.

## Family passkeys settings boundary and legacy review

Native [desktop account settings](../../../client/src/components/Settings/AccountTab.tsx) and [phone account settings](../../../client/src/mobile/screens/settings/MSettingsAccount.tsx) share [the passkey hook](../../../client/src/components/Settings/usePasskeys.ts). For a standalone TREK server, the existing controls load credentials, require the enabled and configured flags for adding, require password confirmation for addition and removal, and keep existing keys visible for cleanup if enrollment is disabled. The standalone device and browser gates stay in that hook.

The Family handler supplies disabled login and enrollment flags and an empty legacy credential view. While the view was loading, both Family account screens briefly rendered the Passkeys section and called the legacy credential endpoint. The real adapter and handler reproduce both results against a held credential response. Commit `ab6d13e58` uses the existing Family frontend mode to keep the section hidden from the first render and skip the obsolete request. The Family password/MFA paths and the adapter capability contract retain their existing source and gates. Supabase Auth's separate passkey capability requires explicit opt-in. [Supabase passkey documentation](https://supabase.com/docs/guides/auth/passkeys)

Both regressions pass with the repair, along with the same 453 existing cases. The existing cases cover enrollment and password refusal, cancelled WebAuthn, renaming, removal, standalone browser and native-app conditions, login, and Family auth recovery. They use local fixtures. Local build `ad57a2ccd`, artifact source binding, typecheck, scoped lint and the four source checks pass. Strict stays at 463 diagnostics within the existing allowance. The full duplication scan reports 6,120 lines across 152 files.

The [legacy Passkeys section](https://github.com/Misael-L/FamilyTravelSite/blob/30d7a4ac86e44bb1d3fbdf766310d7c164afb28f/client/src/integrations/family/legacy/components/Settings/PasskeysSection.tsx) has no external import, type, mock, tooling or route reference in the reviewed tree. Omitting that one file preserves the same 6,080 reachable paths, dependency edges and bytes in the import simulation, including the active shared hook, both account screens, and login and device recovery entries.

**Next.** Rehearse removing only that disconnected section. Run the same account and auth regressions again, check the source-bound website artifacts and compare the full duplication measurement.

## Disconnected legacy Passkeys section removal

Commit `7c9ed4364` removes the section verified in the [preceding review](#family-passkeys-settings-boundary-and-legacy-review). The dependency scan reaches the same 6,080 paths with identical source bytes and import edges. The active passkeys hook, both account screens, login and device recovery all stay reachable.

The same 455 cases pass across 17 test files. They cover standalone enrollment, renaming and removal, Family account visibility, login and session recovery. Typecheck, scoped lint and all four source checks pass. Strict stays at 463 diagnostics within the existing allowance.

The local builds compare `30d7a4ac8` with `c701e4b16`. All 401 JavaScript bundles match after resolving generated filenames. Thirteen stylesheets match byte for byte. The entry stylesheet drops the unused `bg-red-50/40` utility. The offline worker retains the same logic and 523 precache entries. Its generated loader swaps two local variable names. The 319 compressed assets, manifest and entry HTML also pass the comparison. The artifact scanner accepts the exact source commit and refuses an incorrect or missing binding.

The full duplication scan confirms 80 fewer lines, from 6,120 across 152 files to 6,040 across 150. The duplication gate remains open.

**Next.** Review the [legacy Vacay settings panel](../../../client/src/integrations/family/legacy/components/Vacay/VacaySettings.tsx) against its active desktop and phone counterparts. Trace who owns the calendar link and saved preferences before proposing removal.

## Family Vacay sharing boundary and legacy settings review

The active desktop and phone routes use the native Vacay store and Family adapter. On both, opening Vacay requested the standalone Shares list and calendar overlays. The real adapter refused both requests with HTTP 422, and each screen still offered standalone sharing. Commit `e46b53cfc` skips those unavailable requests, clears their view state and hides the corresponding entry points in Family. The two local route cases verify the calendar's plan and visible year through the actual adapter with synthetic data. Standalone sharing and calendar behavior pass the existing regression suite.

A separate local adapter probe saved weekend blocking and week start, then reloaded the saved values from the fixture. The shared weekend, week-start, carry-over, public-holiday and Family Days settings already map to the Family calendar record. The repository's database policies restrict calendar-settings and public-holiday calendar writes to reviewers. The probe confirms mapping and readback with fake storage. Hosted persistence and reviewer permissions still need their own acceptance.

The active settings still offer the personal fiscal/anniversary year and school-holiday preference. The adapter refuses both writes, as confirmed by the probe. The Family calendar model records school breaks separately from a standalone school-calendar provider. Native settings also lack the old view's reviewer gating and offer the standalone dissolve control on multi-person Family calendars. These settings gaps take precedence over removing the older panel. Vacay's standalone sharing controls are separate from the trip calendar subscription feature.

The [legacy panel](../../../client/src/integrations/family/legacy/components/Vacay/VacaySettings.tsx) is imported only by the [legacy Vacay page](../../../client/src/integrations/family/legacy/pages/VacayPage.tsx). Neither is reached from an application entry point. Omitting them leaves the same 6,080 reachable paths, edges and bytes in the simulation. The existing [scanner ownership test](../../../client/tests/unit/scripts/family-scanner-ownership.test.ts) still names the old page as an excluded entry. Any later removal needs to preserve the test's coverage and the active Family calendar adapters, models and data.

All 299 focused cases pass, including the two newly reproduced route failures. The isolated adapter preference probe also passes. Build `b29a4042f`, source-binding checks, typecheck, scoped lint and the four source checks pass. Strict stays at 463 diagnostics. Duplication measures 6,040 lines across 150 files.

**Next.** Align desktop and phone Vacay settings with the existing Family calendar capabilities. Keep supported shared preferences and holiday-calendar edits available to reviewers, make read-only settings clear to other members, and gate unsupported year, school-provider and dissolve controls before reconsidering the legacy page and panel. Validate supported save/reload and refused writes through the real adapter with an isolated fixture.

## Family Vacay settings permissions and database grant rehearsal

Commit `fae501763` makes the native desktop panel and phone sheet follow the review permission returned by the Family plan read. Reviewers can edit supported shared settings. Other members see the saved values and holiday-calendar names in a view-only panel. The Family screens hide the personal year selector, standalone school-holiday provider settings and fusion controls. The adapter also rejects shared settings and holiday-calendar writes by members without review permission and refuses a school-calendar payload before it reaches the public-holiday writer.

All 305 local cases pass across 17 files. Six of those cases reproduced the former behavior and now pass. The settings tests use the actual handler with fixture storage, verify save and readback from both screens, and check the review and calendar-type refusals. Build `f4514fd26`, the artifact source controls, typecheck, scoped lint and all four source checks pass. Strict is 463 within the existing allowance. Duplication measures 6,040 lines across 150 files.

The isolated database exposed a separate release blocker. The authenticated role has SELECT, INSERT, UPDATE and DELETE for `public.family_calendar_settings`, but lacks those table privileges for `public.family_holiday_calendars`. The Vacay plan load includes a select from that table, so the missing grant can also prevent the calendar from opening. A rollback-only test with synthetic Auth sessions and the existing MFA requirement confirmed that granting those four operations to `authenticated` enables reviewer adds, edits, and removal. Members could read their Family data while all write tests failed and a different Family remained invisible. The transaction rolled back the grant and fixture rows. The migrations' existing reviewer, membership and assurance policies continue to govern row access. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

**Next.** Check the grant at the current shared backend checkpoint. If canonically absent, add the narrow grant for `public.family_holiday_calendars` in an additive migration, rehearse it against the current target, and validate the signed-in Vacay read/write paths on the isolated stack. Keep the existing RLS and MFA policies and the [legacy panel](../../../client/src/integrations/family/legacy/components/Vacay/VacaySettings.tsx) until the backend dependency is resolved. The hosted grant state is still unverified.

## Family holiday-calendar grant qualification

Shared backend commit `be653a4ab479fb2f3355e53fefcca3be7ba1090e` adds migration `20261120043029` and a rollback-only SQL regression. The migration grants SELECT, INSERT, UPDATE and DELETE on `public.family_holiday_calendars` to `authenticated` without grant options. The three existing row-level policies retain Family membership, reviewer authorization and MFA enforcement.

The disposable PostgreSQL 17.6 stack replayed all 152 migrations at shared checkpoint `12be53ff2` before applying migration 153. Auth-issued member and reviewer sessions received permission-denied responses on the baseline. After applying the migration, a member read its own Family calendar and could not add, edit or remove entries. A reviewer with a verified TOTP session added, edited and removed an overlay, and the member saw the persisted changes. The same reviewer with an AAL1 session, anonymous requests and cross-family requests could not read or change protected calendars.

The SQL regression failed on the baseline and passed on the migrated stack. The catalog comparison found only the four expected grants, identical policies and unchanged fixture row counts across migration and testing. The local security advisor reported zero findings for this table. The prior 305 website cases used fixture storage. Signed-in browser acceptance through the native Vacay route and hosted grant verification are still pending.

**Next.** Open native Vacay against a disposable migrated stack using signed-in member and reviewer accounts. Verify the calendar loads, reviewer changes survive reload, and a member gets read-only settings on desktop and phone. Verify that the same Family entries are visible across both sessions before retiring the disconnected legacy Vacay page and settings panel.

## Signed-in Family Vacay browser acceptance

The website build at `1eab0451814ff5b7230c73f4652dcf75970c5d1f` ran against an isolated Supabase stack seeded through Auth and the database. The prior holiday-calendar grant returned HTTP 200. Vacay still failed to load because its year projection also reads `public.family_calendar_entries`, which returned HTTP 403 on the 153-migration baseline.

Shared backend commit `3e7087e0a5f9e51cad169cd0e074babacc6cbb84` adds migration `20261120044024`. It grants the three operations used by the day reader and toggle to `authenticated` and adds a restrictive insert policy that matches the calendar entry's Family to the person's Family. The five existing row policies retain view, paint and MFA requirements. The regression fails without the grant and passes at 154 migrations. It verifies own-day read, add and remove, denies unshared peer access and rejects a mismatched person and Family for an account active in both families. The existing seeded entry survives, the holiday-calendar regression passes again, and the local advisor reports zero findings for the entry table.

All six signed-in browser scenarios passed in Chromium. On desktop and phone layouts, an MFA reviewer renamed the same overlay and toggled weekend blocking, then reloaded both changes. A separate member session saw each published overlay label and disabled settings controls. The other Family stayed hidden. On both layouts a member marked and cleared a personal day from the calendar and verified each database result following a page reload. The session, settings and entry traffic used the real isolated Supabase stack. Public Nager responses were fixed test data, and other external browser requests were blocked.

**Next.** Rehearse deleting the disconnected legacy Vacay page and settings panel. Check the active import graph and scanner ownership coverage before applying the deletion. Hosted acceptance still requires verifying both table grants and applying the confirmed migration delta before updating the preview.

## Disconnected legacy Vacay page and settings removal

Commit `e645edd1b` removes the legacy Vacay page and its settings panel. The before-and-after source scan follows seven entry points and reaches the same 6,080 files with identical source bytes and import edges. The active calendar pages, settings controls and Family calendar adapter remain reachable. The scanner ownership test now verifies both active routes and keeps its unreachable-host fixture.

All 308 cases across 18 test files pass before and after, including desktop and phone calendar routes, shared settings and Family adapter permissions. Typecheck and all four source guards pass. Strict reports 463 diagnostics within the existing allowance.

The source-bound builds at `4619330f5` and `0b3e71c4d` produce 401 matching JavaScript bundles after accounting for generated asset filenames. 13 stylesheets match byte for byte. The entry stylesheet drops only 5 utilities unique to the removed files. The manifest, entry HTML, offline precache of 513 files and 319 compressed assets also pass comparison. Artifact verification accepts the exact qualified source and refuses a missing or incorrect binding.

The full duplication scan measures 5,913 copied lines across 148 files, down from 6,040 across 150. No file's count increased and the duplication gate remains open.

**Next.** Trace the remaining legacy Vacay calendar widgets, state and session hooks. Verify that the active adapter's imports of the calendar model and database readers stay reachable before proposing another deletion.

## Remaining legacy Vacay widget and state review

At `6ca305ebf`, a scan of 13,966 source files found nine Vacay files disconnected from the running app. The six files under `legacy/components/Vacay`, the legacy `pages/vacay/useVacay.ts` and `vacaySession.ts`, and the legacy `store/vacayStore.ts` form the proposed removal. Omitting them in the graph keeps all 6,080 reachable files, source bytes and import edges identical. The existing scanner already recognizes the nine files as unreachable.

The [Family reset helper](../../../client/src/integrations/family/tests/helpers/store.ts) is the sole external import of the cohort. It captures and resets the old store for tests. A removal needs to delete that import and its capture and reset calls while preserving the other stores' resets. All three consumers of the helper are covered in the 322 passing baseline cases across 22 suites.

The live Vacay handler imports `buildPtoStats` from [vacayModel.ts](../../../client/src/integrations/family/legacy/pages/vacay/vacayModel.ts). The active [database adapter](../../../client/src/integrations/family/legacy/data/supabase/vacay.ts) also uses that model for calendar settings, trip overlays and person visibility. Keep both files, the public holiday adapter and the active desktop and phone stores, hooks and views.

A temporary source copy with the nine files and three reset references removed measured 5,876 duplicated lines across 146 files, down from 5,913 across 148. No file's count rose. The measurement is a projection. The verified branch still has 5,913 duplicated lines.

**Next.** Rehearse the nine-file removal with the reset helper cleanup in an isolated checkout. Match all 322 baseline test results, verify the active graph and scanners, compare the source-bound web artifacts and confirm the duplication projection before advancing the private branch.

## Remaining legacy Vacay widget and state removal

Commit `930810184` removes the nine reviewed legacy Vacay files. The Family test helper drops its import and two reset references to the old store. The before-and-after source scan follows seven entry points and reaches the same 6,080 files with identical source bytes and import edges. The active calendar pages, calendar model, data adapter and scanner ownership checks remain in place.

All 322 cases across 22 test files pass before and after, including desktop and phone calendar routes, shared settings, adapter permissions and all three users of the Family store reset helper. Typecheck and all four source guards pass. Strict reports 463 diagnostics within the existing allowance.

The source-bound builds at `ee6c8d2e0` and `57e691cdf` produce 401 matching JavaScript bundles after accounting for generated asset filenames. 13 stylesheets match byte for byte. The entry stylesheet drops only 5 utilities unique to the removed files. The manifest, entry HTML, offline precache of 513 files and 319 compressed assets also pass comparison. Artifact verification accepts the exact qualified source and refuses a missing or incorrect binding.

The full duplication scan measures 5,876 copied lines across 146 files, down from 5,913 across 148. No file's count increased and the duplication gate remains open.

**Next.** Trace the retained Family file manager and its assignment, PDF preview and Markdown preview components. Check direct links, lazy routes, test coverage and the active private-file ticket flow before proposing any deletion.

## Legacy Family file manager review and Markdown preview repair

The direct trip Files route loads [FilesPage](../../../client/src/pages/FilesPage.tsx). The desktop trip tab mounts the active [FileManager](../../../client/src/components/Files/FileManager.tsx), and the phone trip tab mounts [MFilesTab](../../../client/src/mobile/screens/trip/tabs/MFilesTab.tsx). The active PDF and Markdown previews acquire URLs through the file preview hook and Family preview port. The port rechecks the original trip and file observation before signing, downloads within that same session, and releases the resulting object URL when its owner retires. These paths and the repository file handler remain reachable. [Family preview port](../../../client/src/integrations/family/filePreview.ts), [Supabase private file delivery](https://supabase.com/docs/guides/storage/serving/downloads)

The scan found 22 disconnected Family additions, comprising the old Files page and hook and the legacy Files component group. They include the old assignment, PDF and Markdown modals. The scan found no external import or literal path reference in application code, tooling or tests. The scanner treats the full group as unreachable. Simulating their removal preserves all 6,080 reachable paths and import edges. Their exact inventory and hashes are in the coordinator record.

The active Markdown component kept loaded text when the preview lease ended. The regression reproduced the previous body with the URL cleared. Commit `69346f9b9` ties the Markdown body to the current preview URL. The body unmounts when the URL clears, and reacquisition loads fresh text. The same commit updates a pre-existing planner test that expected flight editing to be enabled. It now verifies that place and supported reservation permissions retire on source change while transport editing stays disabled.

All 518 local cases pass across 24 suites. They cover direct routing, native assignment and preview components, the Family preview port, private-file acquisition and lifetime, and the planner permission regression. Typecheck, lint, four source guards and build `66b79e33b` pass. The duplication measurement stays at 5,876 lines across 146 files. Hosted file acceptance remains pending.

The next blocker is native attachment assignment. Both layouts use the first-link branch of [the shared file action](../../../client/src/components/Files/fileActions.ts), which sends `place_id` or `reservation_id` in a metadata update. [The Family handler](../../../client/src/integrations/family/fileHandler.ts) accepts only the description there. Family already has a link-record API for assignment. Cover first assignment, removal and additional links through the real Family handler and both native entry points, including existing authorization and queue behavior, before retiring the legacy group.

## Native Family file assignment through link records

Commit `fa57e13c1` routes Family file assignment and removal through the existing link-record API from both native layouts. Family's file view returns attachment IDs from link records. Standalone TREK still uses its primary place and reservation columns and its additional link records.

Four new regressions use the actual desktop assignment modal and phone link sheet, file repository, Axios adapter and Family request handler with fixture storage. They cover the first and additional place link, a reservation link, removal of exact link records, preserved notes and permission denial. The wrong metadata request reproduced before the change. The fixed paths use the established Family metadata permission and canonical target checks.

The first offline Family assignment records the correct link POST and optimistic attachment identity. Offline removal still requires a connection. Reconnect retains the unscoped request as a recovery conflict, with the original method and body and no write dispatched. The standalone queue replay and session retirement tests also pass.

All 684 tests across 29 local suites pass. Typecheck, scoped lint, all four source guards and source-bound build `7bde820e1` pass. Duplication holds at 5,876 lines across 146 files. Hosted file acceptance still needs verification.

**Next.** Rehearse removing the 22 disconnected legacy Files modules using the exact [audited candidates](#legacy-family-file-manager-review-and-markdown-preview-repair). Preserve the active Files route, assignment and private previews. Compare the focused tests, source graph, web artifacts and duplication before advancing the private branch.

## Disconnected legacy Files modules retired

Commit `72c8c1cb9` removes the 22 previously audited Family additions. The full import scan matches all 6,080 reachable source files and their import edges across both checkouts. The direct Files route, native desktop and phone assignment, private preview acquisition, file handler and offline recovery paths retain their existing sources.

All 684 cases across 29 suites match their baseline names and outcomes. Typecheck, scoped lint and all four source guards pass. Strict reports 463 existing diagnostics within the existing allowance. The production-mode local builds have identical file inventories and bytes, except for the commit field in the public configuration. That includes all 401 JavaScript assets and 14 stylesheets. All 319 Brotli files decode to their corresponding assets. Manifest and precache contents match, and the artifact scanner accepts the qualified source `ae3f7d906` and rejects missing and wrong source values. The build and regression checks use isolated fixtures.

The full duplication scan measures 5,631 copied lines across 142 files, down from 5,876 across 146. No file's count increased, and the duplication gate remains open. Hosted file acceptance remains pending.

**Next.** Audit the copied Collections API and catalog picker for runtime, test and tooling consumers. Verify native Collections, sharing and catalog item selection through the actual Family adapter before considering any removal.

## Copied Collections API and catalog picker audit

The two audited entry points close over 12 copied Family modules when their importing modules are included. The old API has three direct callers in the copied store, share modal and Dashboard widget. The store and collections model have more copied consumers, including type-only imports. The complete inventory and SHA-256 hashes are in the coordinator record. The scan found 16 internal imports and no external runtime, type, test or tooling imports, global declarations or literal path references. Removing the group from the graph preserves all 6,080 reachable files and edges. The active Collections routes, native Dashboard widget, sharing repository and Family catalog and Collection handlers all have entry witnesses. The older Family Lists reader also remains reachable through Explore.

All 1,270 native and Family tests across 69 suites and 106 backend fixture tests across four suites pass. Four additional local probes use native consumers and the actual Family handlers with fixture responses at the data boundary. The native Collections store loads a list and its nine typed items, with distinct descriptions and personal notes. The desktop and phone add-place hooks search the Family catalog, carry the food UUID and contextual geography as separate fields, and open the Collection authoring context using the selected UUID. They stop before issuing a save. The Family invitee lookup returns the existing explicit unavailable response without a roster read. Native standalone sharing and its online and session guards pass their existing tests. Hosted behavior and database writes were outside this audit.

Temporarily omitting the 12 files from the isolated duplication scan projects 5,348 copied lines across 136 files, down from 5,631 across 142. No file's count increases in the projection. The source in this checkpoint is cee723608 with documentation only.

**Next.** Rehearse deleting the 12 audited Family additions together. Rerun the baseline cases and handler probes, verify the retained source and import graph, compare both source-bound web builds and confirm the duplication projection before pushing the removal. Keep the active Family Lists reader and standalone sharing covered.

## Disconnected legacy Collections modules retired

Commit `346e28aa9` removes the 12 hashed Family additions from the prior audit. All 6,080 reachable source files and import edges match, including the active Collections routes, desktop and phone catalog selection, the standalone sharing repository, and the Family Lists reader used by Explore.

All 1,380 local checks match the baseline by test name and outcome. The four handler probes cover the native Collections list and item reads, typed catalog selection in both layouts up to authoring context, and the existing Family invitee refusal without a roster lookup. Typecheck, scoped lint and all four source guards pass. Strict reports 463 diagnostics within the existing allowance. All 401 JavaScript assets match after normalizing generated names. The entry stylesheet loses only the unused list-item utility generated from a comment in the old copy-to-trip modal. Every surviving rule matches, including the Collab Markdown list styling. All 319 Brotli files decode to their matching assets. The artifact scanner accepts the qualified commit `0a9fb28f6` and rejects missing and wrong source values. These checks used local fixtures. Hosted acceptance remains pending.

The full duplication scan confirms 5,348 copied lines across 136 files, down from 5,631 across 142, with no per-file increase. Duplication remains a release gate.

**Next.** Audit the copied Collab modules for runtime, type, test and tooling consumers. Verify the Family feature gate and the active native desktop and phone routes, including standalone behavior, before proposing any deletion.

## Family Collab startup guard and copied module audit

The actual Family add-on handler omits Collab. A direct link, the remembered tab, programmatic navigation and the planner setter previously still selected Collab during the pending add-on request. Both layouts mount from the shared active tab, so that briefly let the disabled panel start rendering. Commit `22d64e1c7` applies the Family availability check before either layout consumes the tab and persists Plan for unavailable navigation. Standalone TREK still honors a direct Collab link on an enabled server.

Four regressions reproduce the previous selection and pass with the repair through a Family handler response held pending. The focused suite includes the existing standalone startup case. All 781 local cases across 29 suites pass, including desktop, phone, add-on navigation and Collab subpanels. Typecheck, scoped lint and all four source guards pass. Strict reports 463 existing diagnostics within the original allowance. The production-mode fixture build at qualified commit `996c35d7f` passes source-bound artifact checks. Hosted acceptance remains pending.

The copied Collab group consists of 27 Family additions with 41 internal imports. The scan finds no external runtime, type, test or tooling reference, literal path or global augmentation. Removing the group from the import graph preserves all 6,080 reachable paths and edges, including the native desktop and phone Collab routes, their active components and the Family add-on handler. The source qualification and candidate hashes are recorded. The full duplication scan still reports 5,348 copied lines across 136 files. An isolated projection omitting the candidates gives 4,964 across 120 files with no per-file increase.

**Next.** Rehearse removing the 27 audited Family additions together. Repeat the feature gate and standalone tests, verify the source graph and compare both source-bound builds before pushing. Preserve the active Collab components and Markdown list styling.

## Disconnected legacy Collab modules retired

Commit `f1cc5958b` removes the 27 hashed Family additions from the prior audit. All 6,080 reachable source files and import edges match, including the shared planner startup guard, native desktop and phone Collab routes, active Collab components and the Family add-on handler.

All 781 local cases across 29 suites match the baseline by test name and outcome. The tests cover the disabled Family gate on direct, remembered and programmatic startup and the enabled standalone layouts. Typecheck, scoped lint and all four source guards pass. Strict reports 463 existing diagnostics within the original allowance. Both builds produce the same 3,793 files, including 401 JavaScript assets and 14 stylesheets. The only byte change is the commit marker in the public configuration. The Collab Markdown list rules survive verbatim. All 319 Brotli files decode to their matching assets. The artifact scanner accepts the qualified commit `d5b76f3cf` and rejects missing and wrong source values. These checks use local fixtures.

The full duplication scan confirms 4,964 copied lines across 120 files, down from 5,348 across 136, with no per-file increase. Duplication remains a release gate.

**Next.** Review the remaining copied Costs components and helpers left after the earlier two-component retirement. Trace their runtime, type, test and tooling consumers, and verify native desktop and phone Costs, Family expense permissions and settlement behavior before proposing any removal.

## Family Costs settlement display repair and copied module audit

The actual Family settlement read returned a different payment amount in its final budget breakdown than in its balances. A payment with a missing currency uses the current display currency in the settlement engine and native ledger. The budget breakdown treated that same payment as trip currency and converted it again. In the fixture, a €4 payment was shown as €2 in the final breakdown, turning two €10 shares into €12 and €8. Commit `0f5d27694` uses the same display amount throughout. Payments with explicit currencies still use their established conversion.

The two new handler cases exercise the real planner and Family read path with fixture settlement rows. The missing-currency case fails on the old source and both cases pass with the repair. All 1,031 local cases across 52 suites pass, covering desktop and phone Costs, expense payer/authorization contracts, settlement reads and the existing planner writer restrictions. Typecheck, scoped lint, formatting for the two changed files and all four source guards pass. Strict reports 463 existing diagnostics within the original allowance. The production-mode fixture build at qualified commit `5d3053fed` passes source-bound artifact checks. Hosted Costs acceptance remains pending.

Ten copied Costs components and helpers form a closed group with nine internal imports. The scan finds no external runtime, type, test or tooling import, literal path reference or global augmentation. The active Family admin preferences import the copied currency constants, which are outside the proposed removal. Simulated removal preserves all 6,080 reachable paths and import edges, including the native Costs layouts, Family expenses, settlement handler and data readers. Duplication currently measures 4,964 lines across 120 files. A separate scan omitting the 10 candidates projects 4,864 lines across 118 files, with no per-file increase.

**Next.** Rehearse removing the 10 hashed Family additions together. Match native and Family Costs tests, the live currency-constant imports, the source graph and both source-bound builds before pushing the removal. Compare the full duplication measurement with the projection.

## Disconnected legacy Costs modules retired

Commit `f29278f73` removes the 10 hashed Family additions from the prior audit. All 6,080 reachable source files and import edges match, including the native desktop and phone Costs routes, Family expense and settlement handlers and the existing Family admin import chain for the currency constants.

All 1031 local cases across 52 suites match the baseline by test name and outcome. The tests cover both layouts, expense permissions and settlement totals, including the legacy-payment conversion regression. Typecheck, scoped lint and all four source guards pass. Strict reports 463 existing diagnostics within the original allowance. All 401 JavaScript assets match after normalizing generated filenames. The entry stylesheet loses one unused 320-pixel width utility used only by a deleted file. Every surviving rule matches. The existing admin currency constants match byte for byte. All 319 Brotli files decode to their matching assets. The artifact scanner accepts the qualified commit `014849e92` and rejects missing and wrong source values. These checks use local fixtures.

The full duplication scan confirms 4,864 copied lines across 118 files, down from 4,964 across 120, with no per-file increase. Duplication remains a release gate.

**Next.** Review the copied shared dialog shell and its callers. Trace runtime, type, test and tooling consumers, and verify native dialog focus, dismissal and Family form behavior before proposing any removal.

## Native dialog interaction repair and copied shell audit

Commit `d753fa4b2` fixes two reproduced defects in the active native dialog. The discard question now owns Tab and Shift+Tab while visible. Keep editing and Escape return focus to the previously focused editor control or the dialog itself. A drag that starts on the backdrop and ends in the panel cannot dismiss the dialog. An ordinary backdrop click still follows the existing discard and close rules.

All four new cases failed on the previous behavior and pass with the repair. The 836 local cases across 24 suites also cover desktop and phone reservation interactions, native forms, Family proposal dialogs, export and the two old booking and transport backdrop fixtures. Typecheck, scoped lint, existing formatting and warning status and all four source guards pass. Strict reports 463 diagnostics within the original allowance. The production-mode fixture build at qualified commit `d82ea48c6` passes source-bound artifact checks.

The copied dialog shell and its reverse import group include 16 legacy runtime modules and one historical suite with two backdrop cases. The 22 incoming imports are internal. The review finds no outside module, literal path or global augmentation. The native shell preserves the backdrop invariant exercised by the historical suite, and both old cases pass at this checkpoint for replay. Omitting the group preserves all 6,080 reachable paths and edges. The older focus helper has an active Family admin path through its Modal and is outside the proposed group.

Duplication fell from 4,864 to 4,804 copied lines in the repair, with no per-file increase. A separate scan omitting only the audited group projects 4,740 lines across 114 files.

**Next.** Rehearse removal of the 16 runtime copies and the historical suite as one group. Match all current tests and the two recorded historical cases at this checkpoint. Recheck the same interaction through the native shell and both layouts after removal. Verify the source graph, both source-bound builds and duplication before advancing.

## Disconnected copied dialog shell and callers retired

Commit `0910fa1c1` removes the 16 hashed Family runtime copies and the historical two-case suite from the prior audit. All 6,080 reachable source files and import edges match, including the native shared dialog, desktop and phone reservation flows, Family proposal dialogs and the older focus helper still used by Family admin.

The two historical backdrop cases replay at the incoming checkpoint. The other 834 cases across 23 suites match by name and result, including the native drag, discard keyboard trap and focus return regressions. Typecheck, scoped lint and all four source guards pass. Strict reports 463 existing diagnostics within the original allowance. All 401 JavaScript assets match after normalizing generated filenames. The entry stylesheet loses one unused grid-column utility traced to the removed files. Every surviving rule matches. The retained Family focus helper matches byte for byte. All 319 Brotli files decode to their matching assets. The artifact scanner accepts the qualified commit `a40cd662a` and rejects missing and wrong source values. These checks use local fixtures.

The full duplication scan confirms 4,740 copied lines across 114 files, down from 4,804 across 118, with no per-file increase. Duplication remains a release gate.

**Next.** Audit the copied map compass and its consumers. Verify native bearing reset and control placement with the Family maps before deciding which copies can be retired.

## Phone map compass repair and copied compass audit

Commit `6e17d073c` keeps the native phone reset control visible while the map is tilted, including when its bearing is north. The control follows pitch and bearing events and releases both listeners when the renderer changes or unmounts. The existing reset still animates to bearing zero and pitch zero. The phone control stays above the layer switcher at its existing offsets. The source guard confirms byte-for-byte equality of the protected phone map layout. Desktop controls remain centered between the planner panels, and the Leaflet fallback has no GL compass.

Both the compass-level and phone-level regressions reproduced the missing control on a north-facing tilted map. They pass with the repair. All 719 local cases across 20 suites pass, covering desktop and phone control placement, GL map switching, the offline fallback and Family catalog behavior. Typecheck, scoped lint and all four source guards pass. Strict reports 463 diagnostics within the original allowance. Formatting and scoped ESLint warning counts match the incoming files. The production-mode fixture build at qualified commit `43ffadae1` passes source-bound artifact checks.

The copied compass has no callers in runtime source, tests or tooling and no literal path references. Omitting it preserves 6,080 reachable paths and edges, including the active native compass and the Family map renderers and catalog handler. The exact candidate hash is recorded. Duplication measures 4,740 copied lines across 114 files after the repair. Omitting the copy projects 4,687 lines across 112 files with no per-file increase.

**Next.** Rehearse removing the one disconnected copied compass file. Match the map tests and reachable graph, compare both source-bound web builds, and confirm the duplication projection before pushing the deletion.

## Disconnected legacy map compass retired

Commit `85e7b8b0b` removes the single exact copy from the prior map compass audit. All 6,080 reachable source files and import edges match, including both native compass placements, the Family map renderers and catalog handler.

All 719 local cases across 20 suites match by name and result. These include the phone tilt reset, desktop and phone control placement, renderer switching, the offline fallback and Family catalog behavior. Typecheck, the existing strict limit and all four source guards pass. The two production-mode fixture builds produce the same 3,793 files. Only the source commit marker in the public configuration changes. All 401 JavaScript assets and 14 stylesheets match byte for byte. Each of the 319 Brotli files decodes to the corresponding asset in both builds. The artifact scanner accepts the qualified commit `c6c989541` and rejects missing and wrong source values.

The full duplication scan confirms 4,687 copied lines across 112 files, down from 4,740 across 114, with no per-file increase. The duplication gate remains open.

**Next.** Compare the native and Family category controls on the map. The Family frontend controller still imports the legacy category pill. Trace both consumers and the real catalog request, including viewport and category filters, before deciding if any code can be shared safely.

## Native Family map category availability and legacy bridge review

The native desktop `PlanMapStage` and phone `MMapArea` both use `usePoiExplore` and the same category list. In Family mode, the request goes through the Family Axios adapter to `GET /maps/pois`. The handler uses the typed catalog reader and keeps the request's viewport and session. The native list also offered Museums & culture and Groceries. Both category keys are explicitly unsupported by the catalog reader. Commit `87eac52a0` filters the Family controls by the reader's existing capability list. Standalone TREK keeps its full list and plugin feed. The desktop and phone layout files and the catalog reader are byte-for-byte identical.

Two new cases reproduce the unsupported buttons. With the fix, the desktop restaurant and phone café controls reach the actual Family handler, reader and Supabase SDK through a fixture HTTP transport. The cases verify type-code resolution, venue type and archive filters, the requested bounds, a visible result and exclusion of an out-of-bounds row. Panning makes the results stale and the next Search this area request carries the new bounds. This is local fixture validation. Hosted catalog acceptance remains pending.

All 1,366 focused client cases and 24 catalog-reader cases pass. Typecheck, scoped lint, the strict allowance and all four source guards pass. The fixture web build at `a6d8d1cf5` passes source-bound artifact checks. The full duplication report is identical at 4,687 lines across 112 files.

The fallback Family controller still references the copied pill in its `renderMap` callback. The only source call to this callback is in `FamilyGenericMapBridge`, for which there is no current import. The existing geometry fixture proves native map drawing bypasses the legacy callback even when the Family context is present. The old callback includes alternate OSM and Family catalog reads, place-boundary clipping and Nearby controls. These behaviors need a caller audit before replacing or deleting the copy.

**Next.** Verify the bridge and its exact callback dependencies with a tracked-source and runtime audit. Preserve the fallback Family controller's trip, reservation, and Explore behavior. If the bridge and map-only dependencies are disconnected, prepare a bounded removal rehearsal with matching native map and controller tests.

## Legacy Family map bridge and controller callback audit

The tracked-source review at `5fccc58a5` finds no import of `FamilyGenericMapBridge` and no other application call to the fallback controller's `renderMap` property. The similarly named test renders native `MapViewAuto` with Family context and verifies that native geometry updates still reach the native renderer. The fallback controller itself is active through `FamilyTripBoundary`. Family settings separately imports the legacy Leaflet renderer and the shared GL loader, so both stay in scope for preservation.

The disposable prototype edits the callback owner, controller context and two test fixtures. It removes 12 private source modules and one historical partial-card suite. The controller loses the unused map render, map-only observers and projections. Its trip, schedule, reservation, governance and track reads, native permission publication, partial-load state and Explore state remain. The legacy Explore host and its test are retained. There is no application import of that host at this checkpoint. Only the controller and its context change among surviving reachable source files. The native planner, catalog handler, settings map and track reader keep their import paths. Twenty-five files become unreachable from application entries, including transitive modules outside the 13-file deletion list. The other transitive files are retained.

The two historical partial-card tests pass at the incoming checkpoint. All 573 retained cases across 18 suites match by name and outcome, including native desktop and phone maps, Family reservation refresh on return to Plan, Explore host and catalog filters. The prototype passes typecheck, the existing strict allowance, quality checks, native presentation and backend carryover. Duplication projects 4,638 lines across 110 files, down from 4,687 across 112, with no per-file increase.

**Next.** Apply the exact 17-file prototype in an isolated checkout. Verify the input hashes and two historical cases, then rerun the retained cases and source guards. Compare source-bound web builds. Review any chunk, precache, CSS or asset delta against the retired callback and confirm active native maps, catalog reads, reservation refresh and Family settings map behavior before advancing the integration branch. The packet's path list and hashes are in [coordinator status](coordinator-status.json).

## Disconnected Family map bridge and callback retired

Commit `81b000139` applies the exact audited removal and four associated edits. The fallback controller still loads the trip, reservations and tracks. All 573 retained cases match by name and outcome, and both retired partial-card cases passed at the incoming checkpoint. The additional 48 catalog, permissions, media and track checks pass. The reachable graph matches the prototype, including the native planner, the catalog handler and the active Family Settings renderer.

Both source-bound web builds pass artifact checks. The bundle inventories reproduce all 399 primary chunks in each build and preserve all 138 entry points. The emitted module changes trace to the retired code and its private dependencies, including a now-unused catalog POI identity predicate. The active catalog save module and native map renderers remain in the output. The 17 Leaflet marker-cluster rules move from the startup stylesheet to a shared stylesheet. Their bytes match, and the desktop planner, phone planner and Family Settings all import the new stylesheet. The other stylesheets match byte for byte.

The service worker code matches outside the precache inventory. The cache entries resolve to the built files, including the new cluster stylesheet, and their explicit revisions match. All 322 Brotli assets in the candidate decode to their served files. Typecheck, the existing strict allowance, quality checks and all four source guards pass. Duplication matches the projection at 4,638 lines across 110 files. It remains a release gate.

**Next.** Review the copied map renderers still used by Family Settings and the admin map preview. Follow their dependency paths and compare the native preview before proposing another removal. Keep active map provider selection, Leaflet styles and the shared Atlas and Journey loaders covered.

## Family map preview fallback and renderer review

Desktop and phone Family Settings both use the Family picker, and the Family admin Maps panel uses its own renderer inputs. Both use the copied Leaflet and GL previews. The copied Leaflet map also remains reachable through the standalone defaults branch of the legacy admin page. The native Journey and Atlas routes use their own map paths. The copied Atlas and Journey preview wrappers have no application entry witness, while the shared legacy lazy loader still ships the branches it registers.

Two fallback problems reproduced on the incoming source. Without WebGL2, the member preview sent the OpenFreeMap style endpoint to Leaflet as a raster URL, and the admin preview tried to construct GL anyway. An admin preview also failed when the GPU refused to initialize despite the probe succeeding. Commit `a63e70f46` uses the built-in raster URL and its paired attribution for both fallback paths. The Family preview uses the existing GPU constructor guard. Saved option IDs, healthy GL previews, credential controls and device preference writes retain their current paths.

All four new fallback cases fail on the original behavior and pass with the repair. All 11 Family map fixture cases pass. The broader 21-suite run has 443 passes and one standalone admin invite-list failure. Typecheck, the existing strict allowance, the four source guards and both the fixture build and engine-split check pass. Duplication is unchanged at 4,638 lines across 110 files.

The invite failure is independent of the preview edits. The original case succeeds alone at the incoming commit. Holding the initial invite-trips read open in a deterministic fixture lets invite creation complete and the invite appear. Releasing that read replaces the list with the earlier empty result. The standalone admin files are identical across the map change. Address that race before the next preview consolidation.

The native GL preview has constructor protection but lacks the copied preview's visible provider/style error state. The native Leaflet renderer derives credits from the tile URL and currently has no CARTO credit branch, while Family passes explicit configured attribution. Review those two contracts and the separate admin default preview before substituting renderers.

**Next.** Fix the stale standalone admin invite list read. Reproduce the held-read create case, cover deletion while a list read is pending, and verify the copy link and invite state before returning to the Family preview consolidation.

## Standalone desktop and phone Admin invite list repair

Commit `fdd4fb709` preserves confirmed invite creation and deletion while the initial Admin reads are still settling. Each pending list read records the changes that complete during it. A successful current read publishes its rows with those changes applied. It keeps unrelated invites, avoids a duplicate row when a created invite is already in the response, and omits a deleted row even when the response predates the delete. A failed or superseded invite-list request leaves the displayed list intact. Desktop and phone use the same native hook.

The deterministic desktop fixture holds the trip-picker read open until a created invite appears and verifies both the new invite and the existing row after release. The focused hook tests also hold the invite-list read across deletion and verify an older successful response and a failed response. All three cases fail on the incoming behavior and pass with the fix. Desktop and phone copy the full fixture registration link. The prior standalone Admin suite passes in the broader 546-case run across 24 suites.

Typecheck, the existing strict limit, scoped lint and all four source guards pass. Formatting findings match the incoming files. The fixture build at `ab29a33e5` passes source-bound artifact verification. Duplication is unchanged at 4,638 lines across 110 files.

**Next.** Return to the Family map preview consolidation. Verify provider and style failure feedback and exact raster attribution, including CARTO, through the native renderer contracts before replacing any copied preview. Keep member preferences, the admin default preview, and the active Atlas and Journey paths covered.

## Native map preview startup feedback and raster attribution

Commit `11c83853c` gives the native settings preview an accessible message when the current Mapbox or MapLibre attempt fails before its first render. The canvas stays mounted so a successful retry can clear the message. A retired map’s callbacks are ignored after switching its provider or style. Subsequent tile errors leave a loaded preview usable. Map clicks, camera updates and the existing GPU fallback are covered by the regression suites.

The native raster attribution uses the same CARTO hostname matcher as credential resolution. The real Leaflet control shows both linked credits for the light, dark and unsharded CARTO sources and removes the CARTO credit after switching to either OpenStreetMap source or to an unrelated host. [CARTO attribution requirements](https://carto.com/attribution/)

Six tests reproduce the missing feedback and credit on the incoming tree. All 594 focused cases across 26 suites pass on the fixed tree, including the member and admin previews, Atlas, Journey and keyless CARTO handling. These are local fixtures. Typecheck, strict limits, scoped lint, formatting comparison and all four source guards pass. The source-bound build at `9b54549d2` passes artifact verification and keeps the two map SDKs in separate chunks. Duplication is unchanged at 4,638 lines across 110 files.

**Next.** Rehearse switching the Family member picker and Admin defaults to the native previews with the exact resolved URLs, provider-specific credit, missing-GPU fallback and save behavior under test. The Family controls still use the copied previews. Verify both callers, including the phone picker, before removing a renderer. Preserve the active Atlas and Journey engine bindings.

## Family member and Admin native map preview switch

Commit `4a5bd4d44` switches the Family desktop and phone map picker and the Family Admin default map to one shared preview. GL uses the native lazy Mapbox or MapLibre renderer. The raster preview uses Leaflet’s tile and marker components with the native attribution resolver, independent of the planner’s satellite mode and location controls. It draws the selected CARTO tile template with its resolved key and linked credit. When a CARTO default lacks a usable key, the credit follows the OpenStreetMap tiles actually drawn. A failed WebGL probe or refused GPU context uses the built-in raster preview.

The member preference and Admin default commands keep their existing inputs and permission checks. The member fixture covers saving and reloading a named map, inheriting the Family default, keeping Mapbox quality device-local and retaining the current planner and Journey map selection. Admin fixtures cover read-only access, changing the default with the existing command and loading after a startup error. All 625 cases across 28 suites pass, including 17 Family settings cases and the active Atlas and Journey regression suites.

In loopback Chrome, the real Leaflet map decoded fixture tiles and showed both credits and the sample marker. Real MapLibre reported a rejected fixture style and drew the replacement. Real Mapbox loaded in its own canvas and released it when switching back to Leaflet. The browser harness mounted the shared preview with intercepted provider responses. The hosted providers and hosted sign-in were outside this rehearsal.

Typecheck, strict limits, source checks, artifact verification and the fixture build at `eb7898deb` pass. The build keeps native Mapbox and MapLibre separate and drops both legacy SDK chunks from the previous build. Existing formatting and duplication findings are unchanged. Atlas and Journey renderer source and the standalone legacy defaults renderer are retained.

**Next.** Audit the two old GL settings preview entry points and the copied GL preview for remaining references, then verify the removal against the source and bundle graphs. The copied Leaflet map still has a standalone defaults caller. Keep the Atlas and Journey routes protected during this review.

## Disconnected Family GL settings preview retired

Commit `dd889f948` removes the copied GL settings preview, its two lazy entries and their selector. The only imports of the removed component were those two entries. The preserved legacy Atlas and Journey adapters still resolve their existing imports from the same loader. All six other bindings stay intact. The native Family preview and the standalone legacy Leaflet defaults path both have application entry witnesses.

The before-and-after import scan matches all 6,043 reachable source files, including their bytes and edges. Both local web builds record the same 391 emitted chunks, module membership and imports. The only byte difference across 3,777 output files is the expected source commit in the public build descriptor. All 312 Brotli payloads match their served assets, and the native Mapbox and MapLibre split is identical. Artifact checks use the final qualified source at `92bf7da49`.

The same 729 tests pass on both trees across 31 suites, including the native Family settings, desktop and phone Journey, Atlas and Admin defaults coverage. Typecheck, quality checks and all four source guards pass. Duplication remains 4,638 lines across 110 files. The remaining duplicated lines still block the duplication gate.

**Next.** Trace the remaining legacy Atlas and Journey map wrappers and engine bindings as a group. Confirm which retain callers and which can be retired. Keep the standalone legacy Leaflet defaults dependency and the active native routes covered.

## Legacy GL map and dependency retirement rehearsal

The audit traced 13,856 tracked code files and found 14 disconnected runtime modules in the legacy Atlas, Journey and trip GL group. Their SDK imports include type-only callers. The group also includes the two engine loaders and the copied Journey detail view and hook that refer to its map handle. Two suites exercise the copied GL renderers exclusively. Three other suites also cover the still-reachable standalone Leaflet map and must retain that coverage. The native Atlas and Journey paths, shared Family previews and legacy Leaflet defaults renderer have unchanged entry witnesses.

The isolated 22-file prototype removes the runtime group and the two GL-only suites. It keeps all 143 Leaflet cases across the three mixed suites. All 34 captured Leaflet reservation marker and route outputs match their baseline. The wider run has 1,299 passes before and 1,134 retained passes after. Every removed case belongs to the copied GL implementation. Native map handling and retained Leaflet behavior are covered by the active suites.

The offline lockfile regeneration removes the two legacy SDK aliases and 23 package records in total. Every retained package resolution stays identical. The local build and tests run with the pruned packages absent. All 6,043 reachable source files and edges match. Tailwind drops one spacing rule used only by the copied Journey detail view. That changes 128 chunk filenames. Module membership and JavaScript match after mapping those filenames, both native SDK bundles match, and every surviving stylesheet rule and precache entry is accounted for. Typecheck, existing quality limits and artifact checks pass. The prototype projects 39 fewer duplicated lines, leaving 4,599 across 109 files. This is a projection until the candidate is applied.

**Next.** Apply the exact rehearsed patch. Check the recorded source hashes, retain every Leaflet case, qualify the resulting file inventory and compare clean builds and the native SDK resolutions before publishing the retirement. The current checkpoint records the audit and leaves the prototype in the local evidence directory.

## Legacy GL map and SDK aliases retired

Commit `34209bdaf` applies the audited 22-file patch to retire 14 disconnected legacy GL modules, prune the two SDK aliases and remove the tests exclusive to those renderers. The active Atlas and Journey routes, native Family previews and legacy standalone Leaflet defaults are still reachable. The 6,043 reachable source paths, bytes and import edges match the prior checkpoint. All 1,134 retained test cases match the rehearsal, including all 143 Leaflet cases. The 34 captured Leaflet reservation marker and route outputs also match.

The build and tests ran with the 23 pruned package records absent from the disposable installation. The installed package tree and lockfile both resolve Mapbox GL 3.31.0 and MapLibre GL 6.16.0. Both native SDK bundles match byte for byte. The two source-bound builds include the same 391 emitted JavaScript chunks. Removing the unused Journey spacing rule changes 128 generated filenames. JavaScript matches after accounting for those names. The surviving CSS, manifest paths, 504 precache entries and 312 Brotli payloads pass the comparison.

Typecheck, quality checks, artifact verification and all four source guards pass at `d7be81926`. Duplication falls by 39 lines to 4,599 across 109 files. The remaining findings are still a release gate.

**Next.** Audit the standalone Admin defaults map preview against the native rendering paths. It is the remaining application entry witness to the copied Leaflet map. Verify that a replacement can preserve browser map display, the custom tile template workflow, persisted defaults and the Family Admin branch before another removal.

## Standalone Admin defaults route audit

The previous handoff identified a static import path from the Family Admin page to the copied Leaflet preview. The runtime route closes that path. Browser startup activates Family only on the Supabase data plane. The app then selects the Family Admin wrapper, whose setup checks the same data plane. Standalone desktop and phone already open TREK’s native Admin defaults. Family opens its own preferences and map managers.

The two-file prototype at `923acfb78` removes the unreachable fallback from Family Admin and adds a route fixture. Four of the five new cases pass on the incoming tree. The fifth mounts Family Admin directly in standalone mode and reproduces the fallback reaching the copied defaults endpoint. All five pass with the cleanup. The 43-file run passed all 1,205 cases. This covers route selection on desktop and phone, Family preference reads, save, reset and read-only access. The route fixture uses synthetic sessions and responses.

Loopback Chrome mounted the native desktop defaults with the real Leaflet renderer. Four checks passed against fixture tiles and a fixture API. The saved template decoded, a custom template with query parameters rendered and saved, reload restored it, and reset cleared it. Typecheck and the existing quality checks pass. Duplication remains at 4,599 lines across 109 files because the prototype leaves the copied sources in place.

The prototype removes one application import and takes 21 paths out of the runtime graph. The native defaults, Family managers, Atlas and Journey paths remain reachable. The disconnected defaults component still imports the copied map. Three tests reference the map, including the Family bridge test's mock. Review those consumers before retiring the copy.

**Next.** Apply the two-file prototype in a separate change. Verify the patch hash in the coordinator status, rerun the route and map checks, and qualify a source-bound build before retaining the change. Then audit the copied Leaflet sources and their test coverage for removal. This checkpoint records the audit. The exact patch and receipts are in `/private/tmp/family-admin-defaults-audit.4MrMyt`.

## Family Admin defaults routing cleanup

Commit `06b8732f3` applies the exact two-file rehearsal. Standalone desktop and phone still use the native Admin defaults. The Family Admin route uses its existing preferences and map managers. The former fallback no longer imports the copied Leaflet preview. All 1,205 cases across 43 files match the rehearsal, and all four local Chrome fixture checks repeat successfully.

The application graph matches the 6,022 reachable paths from the rehearsal. The source-bound web build at `c55429812` drops the 20 formerly emitted modules predicted by that graph. The active Admin, Atlas and Journey routes are retained. Both native map SDK chunks keep their content-hashed names and pass the split check. All 504 precache entries and 312 Brotli payloads pass validation. The artifact scanner accepts the correct build source and rejects the two invalid source cases.

Typecheck, quality checks, scoped fixture lint and formatting, and the four source guards pass. The existing duplication gate still reports 4,599 lines across 109 files. The copied Leaflet sources and the three tests that reference the copied map remain available for the dependency audit.

**Next.** Audit the disconnected defaults component, copied map and their private dependencies together. Check imports and test mocks, classify the old renderer-specific tests, and preserve coverage of active native observers, map markers, reservations and routing. The runtime graph alone does not establish which regressions the legacy tests cover.

## Disconnected Family Leaflet retirement rehearsal

The broader reference scan reviewed the 21 paths that left the website import graph after the Admin defaults fix. Fourteen client files form a disconnected group. Six client dependencies stay because another source, a type import or the shared icon serializer test still uses them. The copied POI type is referenced by the Family API client. The older settings, Journey and route callers and the place photo consumer also retain their dependencies. The Family backend track converter has its own test and stays. The prototype removes only its disconnected client re-export.

The 19-file prototype at `cffe44f8d` retires 14 client source files and four suites exclusive to the old renderer. Those suites contain 161 cases that assert the old widget’s marker, event observer and reservation overlay output. The native geometry test still verifies that changing route, colors and focus reaches the rendered map with a Family controller. The prototype removes its mock of the disconnected widget. Native suites retain coverage for viewport delivery and cleanup, hover, pin and waypoint interaction, category and photo markers, reservation routes and labels, and malformed booking times. All 1,446 retained cases across 54 files pass with the same identities as before. The seven separate icon serialization and backend track cases also pass on both trees.

The 6,022 reachable source paths, hashes and edges match. Both local builds emit the same 391 JavaScript chunks and 3,777 files. The only byte difference is the source commit in the public build configuration. Both builds keep the same SDK split and 504 precache entries, and all 312 Brotli payloads per build verify. Typecheck, existing quality checks and artifact validation pass. The prototype reduces the projected duplication count by 203 lines to 4,396 across 104 files.

**Next.** Apply the rehearsed 19-file patch and qualify the result. The coordinator status records the input hashes and patch checksum. Keep the seven retained dependencies and rerun the active map and Admin cases on the exact qualified checkout. This checkpoint records the audit. The patch and verification receipts are in `/private/tmp/family-legacy-leaflet-audit.ozY62U`.

## Disconnected Family Leaflet preview retired

Commit `9376fd773` applies the exact 19-file rehearsal. It retires 14 disconnected client files and the four suites exclusive to that renderer. The native geometry test still runs, and the seven dependencies with other callers or tests remain in place. All 1,446 retained cases across 54 files match the rehearsal. Six shared icon serialization cases and the Family backend track case also pass.

The 6,022 reachable paths, source hashes and import edges match. Both clean local builds match across 391 JavaScript chunks and 3,777 output files. The only byte difference is the source commit in the public build configuration. Both builds retain the same SDK split, 504 precache entries and 312 verified Brotli payloads. The artifact scanner accepts the qualified build at `050d5d23d` and rejects its wrong-source and missing-source controls.

Typecheck, quality checks and all four source guards pass. The code duplication gate drops by 203 lines to 4,396 across 104 files. The remaining findings still block release.

**Next.** Audit the copied packing-template and category managers in the Family Admin configuration fallback. Trace both standalone routes and the live Family managers, then verify read, save and read-only behavior before proposing any removal.

## Admin configuration fallback audit

On standalone desktop and phone, the /admin route opens the native Personalization panel. Each layout reads and saves templates and categories through the standalone API. Family activation uses the Supabase data plane. Its Admin wrapper opens the Family managers, and the two copied standalone managers sit in a fallback the registered route cannot reach.

Five fixtures render the App route or directly mount the Family wrapper. Both standalone layouts load and create a template and a category. A Family manager saves the existing template and category with their Family IDs, preserving the template's items and the category's color and icon. An admitted Family reviewer can inspect both records and sees view-only controls. Four cases pass before the change. The direct standalone mount reproduces both copied HTTP reads. All five cases pass with the two-file prototype at `bc2d0d784`. The fixtures use synthetic sessions, local standalone responses and mock RPC responses. The test harness shares the production router context for both import names, and the web bundle has one router module.

The focused run passes 1,548 client cases across 59 files, including the previous cohort, plus eight existing Family backend adapter cases. The prototype removes only the two fallback imports from the reachable graph and takes it from 6,022 to 6,020 paths. The local web build excludes 2 formerly emitted modules and preserves both native layouts and both Family managers. Typecheck, existing quality checks, scoped fixture lint and formatting, and artifact validation pass. The duplication check remains at 4,396 lines across 104 files.

**Next.** Apply the exact patch and qualify a build on the integration branch. Review the newly disconnected managers and helpers separately before removing those source files. The patch, input hashes and verification receipts are recorded under `/private/tmp/family-admin-config-audit.YlPEyN`.

## Family Admin Personalization fallback cleanup

Commit `72379766a` applies the audited two-file patch. Standalone desktop and phone still open their native Personalization panels. Family Admin uses its packing-template and place-category managers with the existing permissions. The local fixtures repeat the standalone creates, Family saves and view-only checks. All 1,548 client cases across 59 files and eight backend adapter cases pass.

The 6,020 reachable source paths and the web bundle match the rehearsal. The two copied managers leave the bundle, and both native layouts and both Family managers remain reachable. The source-bound build at `513f16ee0` passes artifact validation. Map SDK separation, 504 precache entries and 312 Brotli payloads also verify.

Typecheck, existing quality checks, fixture lint and formatting, and four source guards pass. Duplication remains at 4,396 lines across 104 files. The copied files stay available for a separate retirement review.

**Next.** Audit the disconnected packing-template and category managers for deletion. Check their type, test and tooling references and keep shared helpers with other callers. Rehearse both builds and account for any CSS delta before applying a deletion.

## Disconnected Admin configuration panels retirement rehearsal

The reference scan found no imports, type references, test mocks or tooling dependencies on the two copied Admin panels after the Personalization fallback cutover. The six helper modules they imported still have website callers, including the active Family API and category icons. All six stay in the prototype.

The two-file prototype at `481b056d5` removes only the disconnected CategoryManager and PackingTemplateManager copies. All 1,548 client cases across 59 files match the preceding integration run, including the routed native desktop, phone and Family permission cases. Eight Family backend adapter cases also pass.

The 6,020 reachable paths, hashes and edges match across both trees. Both local builds emit 3,777 files and the same 391 JavaScript chunks. Every stylesheet matches byte for byte. The only asset difference is the expected source commit in the public build configuration. Both builds verify the map SDK separation, 504 precache entries, and 312 Brotli payloads. Typecheck, existing quality checks and artifact validation pass. The prototype projects a reduction of 340 flagged duplicate lines to 4,056 across 100 files.

**Next.** Apply the exact two-file deletion and qualify it on the integration branch. Verify the input and patch hashes in the coordinator status and repeat the active tests and build comparison. This checkpoint records the audit. The patch and receipts are in `/private/tmp/family-admin-managers-audit.G9KzUJ`.

## Disconnected Admin configuration panels retired

Commit `40d477ecb` applies the exact two-file deletion of the copied category and packing-template panels. All six shared helpers remain available to their current callers. The same 1,548 tests across 59 client files pass, including the five native and Family route and permission cases, alongside eight Family backend adapter tests.

The 6,020 reachable paths, hashes and edges match. Both local builds emit 3,777 files and the same 391 JavaScript chunks. Stylesheets match byte for byte. The only output difference is the source commit in the public build configuration. Both builds verify the map SDK separation, 504 precache entries and 312 Brotli payloads. The artifact scanner accepts the qualified build at `5527f49a6` and rejects wrong or missing source commits.

Typecheck, existing quality checks and all four source guards pass. The duplication count falls by 340 lines to 4,056 across 100 files. The remaining findings still block release.

**Next.** Audit the copied standalone Settings fallback in Family Admin. Compare the native desktop and phone Settings route and the Family identity manager, then cover reads, supported writes and permissions with local fixtures before proposing a cutover.

## Admin Settings fallback audit

The normal /admin route opens native Settings on standalone desktop and phone. Family startup opens its identity and file-policy manager through the Family Admin wrapper. The copied standalone Settings panel is imported by a fallback the registered route cannot reach.

Five local Settings cases extend the existing Admin route fixture. Both standalone layouts load the file-type list, save it through the current standalone endpoint, and reload the saved value from the fixture. Family displays file limits and an unlinked account. A managing Family role sends the family, roster person and member account IDs to the existing link command and reads the linked state back. An admitted reviewer sees the policy and has no link controls. The direct standalone mount of the Family wrapper shows the copied form before the cleanup. The two-file prototype at `283809817` removes that fallback and passes all five cases.

All 1,642 client cases across 62 files pass, including the previous cohort, as do 12 backend adapter cases. The prototype drops the fallback import and takes the source graph from 6,020 to 6,019 reachable paths. Its local web build excludes 1 copied module. Both standalone panels and the Family identity manager remain reachable. Typecheck, existing quality checks, scoped fixture lint and formatting, and artifact validation pass. Duplication remains at 4,056 flagged lines across 100 files.

**Next.** Apply and qualify the exact patch. Verify its hashes and rerun the native and Family settings checks on the integration checkout. Review the copied settings source and any private dependencies separately before removing files. This checkpoint records the audit. The patch and receipts are in `/private/tmp/family-admin-settings-audit.YjivUJ`.

## Family Admin Settings fallback cleanup

Commit `dec975995` applies the audited two-file patch. Standalone desktop and phone use the native Settings panel. Both local fixtures load a file-type list, save a change and read it back after reload. Family Admin uses the identity and file-policy manager. The fixtures verify a managing role links the selected roster person and account and reads back the linked state. A reviewer sees the file policy with view-only permissions. All 1,642 client tests across 62 files and 12 backend adapter tests pass.

The 6,019 reachable paths, hashes and edges match the rehearsal. The local web build at `6229950fc` omits the copied panel and retains the active Settings routes and Family identity manager. Its source-bound artifact scanner passes, as do map SDK separation, 504 precache entries and all 312 Brotli payloads.

Typecheck, existing quality checks, scoped fixture lint and formatting, and the four source guards pass. Duplication remains at 4,056 lines across 100 files. The copied Settings file stays available for a separate reference audit.

**Next.** Audit the copied standalone Admin Settings panel for retirement. Keep the shared Family API, types and Admin hook with their current callers. Rehearse deletion only after checking references and compare both builds for stylesheet effects.

## Disconnected Admin Settings panel retirement rehearsal

The copied Settings panel has no remaining imports, type references, test mocks or tooling dependencies following the Family Settings fallback cutover. The Family API client, shared types and Admin hook still have website callers and stay in place.

The one-file prototype at `68bced74d` removes the disconnected panel. All 1,642 client tests across 62 files match the preceding integration run, including standalone Settings saves and Family identity and reviewer behavior. All 12 Family backend adapter tests also pass.

The 6,019 reachable paths, source hashes and import edges match. Both local builds emit the same 391 JavaScript chunks and 3,777 files. The only byte difference is the recorded source commit. All stylesheets, the map SDK split, 504 precache entries and 312 Brotli payloads per build verify. Typecheck, the existing quality checks and artifact validation succeed. The prototype projects 36 fewer flagged duplicate lines, leaving 4,020 across 98 files.

**Next.** Apply the exact one-file patch and qualify the integration tree. Repeat the Settings regression cases and both source-bound builds. Verify the recorded input and patch hashes. This checkpoint records the audit. The patch and receipts are in `/private/tmp/family-admin-settings-retirement-audit.aXybf6`.

## Disconnected Admin Settings panel retired

Commit `aadd393ec` applies the exact one-file Settings deletion. The Family API client, shared types and Admin hook keep their current callers. All 1,642 client cases across 62 files and 12 Family backend adapter cases pass, including the standalone file-type settings, Family identity and view-only cases.

The before-and-after builds have matching 6,019 reachable paths, 391 JavaScript chunks and 3,777 files. All stylesheets match byte for byte. The only output difference is the source commit in the build configuration. Artifact validation at `b27913c01` succeeds, and both builds verify the SDK split, 504 precache entries and 312 Brotli payloads.

Typecheck, existing quality checks and all four source guards pass. The duplication check reports 4,020 flagged lines across 98 files, 36 fewer than before. The remaining findings still block release.

**Next.** Audit the copied standalone Notifications fallback. Verify the native desktop and phone routes and the Family defaults manager with synthetic data. Cover reading the current defaults, a supported change and a reviewer's access before proposing a cutover.

## Admin Notifications fallback audit

Standalone /admin uses TREK's native Notifications screens on desktop and phone. Both share the native Admin notification preference endpoint, and the desktop panel also retains TREK's separate user defaults. Family startup selects the Family wrapper and its Notification Defaults manager. The wrapper's copied standalone panel is unreachable through the registered route. Directly mounting the wrapper on Nest in a fixture reproduces one request to /admin/notification-preferences.

Five new local cases cover both native layouts, a Family manager, a Family reviewer and the direct wrapper mount. The standalone cases save the Admin email preference and reread it on remount. The Family manager reads a catalog default and the device count, updates the selected event with the Family ID, then rereads the saved Family default. The reviewer sees the view-only explanation and pressing the visible toggle sends no write. The current toggle still appears interactive to the reviewer, and the audit records that existing accessibility issue for a separate UI decision. The fixture uses synthetic accounts and mocked API responses.

The two-file prototype at c949218ac passes all 1,736 client cases across 68 files and 17 Family backend adapter cases. It removes the fallback import and takes the graph from 6,019 to 6,016 reachable paths. The local build omits 3 copied modules and retains the native desktop, native phone and Family notification paths. Typecheck, existing quality checks, fixture lint and formatting, and artifact validation pass. Map SDK separation, 504 precache entries and 312 Brotli payloads also verify. Duplication still flags 4,020 lines across 98 files.

**Next.** Apply and qualify the rehearsed patch. Repeat the route and permission cases and verify the exact build. Audit the newly disconnected files before removing them. The patch and local receipts are in /private/tmp/family-admin-notifications-audit.nrLSap.

## Family Admin Notifications fallback cleanup

Commit ae32def37 applies the audited two-file patch. The native desktop and phone routes save and reload Admin preferences in the synthetic fixtures. The Family route reads and saves the Family default through its existing adapter. A reviewer can read the defaults, and pressing the visible toggle sends no write. All 1,736 client tests across 68 files and 17 backend adapter tests pass.

The 6,016 reachable paths and emitted module graph match the rehearsal. The local build at 287a3215e omits three copied modules and retains the native desktop, phone and Family notification paths. Its source-bound artifact scanner passes. The map SDKs remain separate, and 504 precache entries and all 312 Brotli payloads verify.

Typecheck, existing quality checks, scoped fixture lint and formatting, and all four source guards pass. Duplication still flags 4,020 lines across 98 files. The three copied source files are candidates for a separate retirement audit.

**Next.** Audit the copied Notifications tab, notification matrix panel and label constants for retirement. Check references, including tests and tooling, and compare both builds before removing the files. The reviewer's interactive-looking toggle remains an open accessibility issue in the active Family manager.

## Disconnected Admin Notifications retirement rehearsal

The copied Notifications tab, matrix panel and label constants have two references within the group and zero external references. The native desktop and phone panels and their tests and tooling use their own modules. The shared Family API client, toast component, types and Admin hook all stay.

The prototype at 2f95e01ef deletes only the three disconnected copies. All 1,736 client tests across 68 files match the integration run. The native notification preference saves and reloads, Family default changes and reviewer permission cases pass. All 17 backend adapter cases also pass.

The 6,016 reachable paths, source hashes and import edges match. Both local builds emit the same 391 JavaScript chunks and 3,777 files. The only byte difference is the recorded source commit. All stylesheets, the map SDK split, 504 precache entries and 312 Brotli payloads per build verify. Typecheck, the existing quality checks and artifact validation succeed. The duplication scanner reports the same 4,020 flagged lines across 98 files in both trees.

**Next.** Apply and qualify the exact three-file patch. Verify the file and patch hashes and repeat the native and Family notification tests and both builds. The patch and verification receipts are in /private/tmp/family-admin-notifications-retirement-audit.31Mfc7.

## Disconnected Admin Notifications retired

Commit ce44ea51b applies the audited three-file deletion. The shared Family API client, toast component, types and Admin hook keep their existing callers. All 1,736 client cases across 68 files and 17 Family backend adapter cases pass, including the native desktop and phone notification changes, Family defaults and reviewer permissions.

The before-and-after builds have matching 6,016 reachable paths, 391 JavaScript chunks and 3,777 files. All stylesheets match byte for byte. The only output difference is the recorded source commit. Artifact validation at 9004fcaa0 succeeds, and both builds verify the SDK split, 504 precache entries and 312 Brotli payloads.

Typecheck, existing quality checks and the four source guards pass. The exact deletion removes 630 source lines. The duplication check still reports 4,020 flagged lines across 98 files.

**Next.** Address the reviewer toggle in the active Family Notification Defaults manager. Reviewers can see the current state, and the existing guard prevents writes. The visible control still looks editable. Present the read-only state clearly, preserve manager writes and keep the current RPC contract.

## Family notification defaults reviewer controls

Commit a36bc43b4 shows reviewers translated On or Off text beside the notification event and default source. Managers can use the same toggle with an accessible event name. The save guard and notification RPC implementation keep their existing behavior.

The revised route fixture reproduces three failures on the previous component. Both reviewer states expose an interactive control, and the manager toggle lacks a name. All six notification cases pass with the fix. Both reviewers read the state without initiating any writes, a manager saves the exact Family/event pair and rereads the saved value, and desktop and phone standalone preferences save and reload through their native route. The local run passes 1,737 client cases across 68 files and 17 Family backend adapter cases.

The 6,016 reachable paths and their import edges are retained. The bundle has the same module inventory and map SDK assets. The qualified fixture build at 184aa63c0 passes asset and source validation, including 504 precache entries and 312 Brotli payloads. Typecheck, quality checks and the four source guards pass. The duplication scan still flags 4,020 lines across 98 files.

**Next.** Reconcile the supported-core release checklist with the current private branch. Identify the highest-priority remaining dependency using the current local evidence and the existing hosted prerequisites.

## Admin Plugins route audit

Standalone Admin opens the native desktop or phone Plugins panel. The Family Admin registry hides Plugins. Its wrapper still imported the copied panel and rendered it if mounted directly with the standalone data plane. A synthetic test reproduced one request to /admin/plugins in that direct wrapper mount. Ordinary standalone routing uses the native panels.

The two-file prototype at 4d0b2cdcf removes the copied Family route entry. Two App fixtures verify that desktop and phone keep a plugin off after consent is declined, then send the selected plugin ID and explicit consent only after approval and reread the enabled state. Two more cases verify that Family hides Plugins on both layouts. The direct wrapper no longer mounts the copied panel. All 2,422 client tests across 88 files pass, including 303 native panel and helper cases and all 42 direct legacy panel cases. Existing native tests exercise signature refusal, exact key re-trust, dependency admission, widened permissions and host restrictions. All HTTP responses in the route tests are synthetic.

The six copied panel modules, the copied icon and the copied store leave the reachable application graph. The build also omits the positioning helper, which keeps its other source references. Native desktop and phone panels stay reachable. Source-bound build, asset validation, typecheck and existing quality checks pass. The direct legacy test import and the dynamic translation declaration in the i18n check still reference the copied group. They need separate review before file deletion.

The route change alone leaves duplication at 4,020 flagged lines in 98 files. A source-only scan of a temporary copy without the six modules measures 3,266 lines across 94 files. That projection does not qualify file removal.

**Next.** Apply and qualify the exact two-file route patch. Verify both input hashes, rerun the native and Family route cases, and retain the direct tests and translation reference. The patch and verification receipts are in /private/tmp/family-admin-plugins-route-audit.KB9J32.

## Admin Plugins route disconnection

Commit 2fae63312 applies the rehearsed two-file patch. Standalone desktop and phone use the native Plugins panels. The route fixtures verify that turning on a plugin requiring new rights waits for explicit consent, that deferral sends no consent, and that approval rereads the enabled state. Family keeps Plugins hidden, and a direct standalone-mode mount of the Family wrapper makes no copied admin plugin request.

All 2,422 client tests across 88 files match the rehearsal, including the five route cases, 303 native panel and helper cases, and all 42 direct legacy panel cases. Both the legacy suite and the dynamic translation check keep their existing references.

The 6,008 reachable source paths and emitted module graph match the audit. Nine modules leave the build, including the six copied panel files. Artifact validation at 3d6eb9025 succeeds. Both map SDKs, 504 precache entries and all 312 Brotli payloads verify. Typecheck, existing quality checks, fixture lint and formatting, and all four source guards pass.

Duplication still flags 4,020 lines across 98 files. The separate six-file projection of 3,266 lines remains conditional on retaining test coverage and resolving the translation reference.

**Next.** Audit the 42 direct legacy cases and the tooling entry against the native code. Preserve the meaningful assertions and verify the references before proposing any file removal.

## Copied Admin Plugins retirement rehearsal

The six copied modules have eleven internal imports. One legacy test import and one file-specific dynamic translation declaration account for the remaining external references. The retired group excludes the legacy icon, store and positioning helper, which still have source consumers.

Prototype `52ff3c777` removes the six copies and their translation declaration, retains the three Family policy cases and replaces the 39 copied renderer cases with verified coverage of the running implementation. The coverage map links all 42 original cases to passing native desktop, phone, shared hook or retained policy tests. Ten additions explicitly check consent order, signature refusals, re-trust payload and rights consent, rejected host saves, rescan ordering, lazy detail and its compatibility offer on both layouts. Standalone TREK preserves its deliberate compatibility warning and requires acknowledgement for an incompatible install through that flow. Family keeps Plugins hidden. [Coverage map and verification](coordinator-status.json)

All 2,393 cases across 88 suites pass. Both source-bound builds preserve the 6,008 reachable paths and emit 391 Rollup chunks and 3,777 files. Tailwind drops 16 utility rules used exclusively in the removed copies. The remaining CSS matches byte for byte. The stylesheet change cascades to 128 JavaScript filenames. Each emitted script and its module graph match after substituting those asset names. Both map SDK assets match byte for byte. The 504 precache entries and all 312 Brotli payloads per build verify. Typecheck, existing quality limits, scoped lint and formatting, presentation and backend carryover checks and artifact validation pass. The rehearsal measures 754 fewer flagged duplicated lines, from 4,020 in 98 files to 3,266 in 94 files.

**Next.** Apply and qualify this exact patch on the integration branch. Verify all ten input hashes, rerun the native and Family tests and compare the qualified build outputs. The candidate patch and verification receipts are in /private/tmp/family-admin-plugins-retirement-audit.W993Qr.

## Copied Admin Plugins retirement

Commit `81aa72830` matches the rehearsed patch across all ten paths. The six disconnected modules and their file-specific translation declaration are removed. The three Family visibility cases and ten new native cases run with the existing desktop, phone and shared tests. All 2,393 cases across 88 suites match the rehearsal. The three independently referenced helpers remain in place.

The qualified build at `a58c3616b` keeps all 6,008 reachable application paths. It reproduces the exact 16 retired-only CSS rules and generated filename changes found in the rehearsal. The surviving rules, normalized JavaScript, map SDK payloads, precache entries and Brotli checks match. Typecheck, formatting, quality checks and all four source guards pass. The current duplication scan reports 3,266 flagged lines in 94 files, down 754 lines from 4,020 in 98 files. Duplication remains a release gate.

**Next.** Audit the native and legacy offline database modules. Both are reachable, and their individual findings account for 116 and 120 flagged lines. Establish which helpers can be shared while preserving database ownership, schemas, upgrade behavior, saved data and pending work. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

## Offline database duplication audit

The native Dexie database and the copied Family module have 70 and 15 direct callers in the reachable source graph. Both have a sync manager, queue and auth-store consumer. The native Family path binds the database to a verified source and member and guards opening, creation and retirement. The copied module still declares versions 1 through 4 and uses the historical anonymous and account-key names. Both share the first four version definitions. Native declares versions through 14 and the existing upgrade suite checks every shipped version. Preserve each declaration history, including the version 3 blob metadata backfill.

The repeated table declarations and bulk writes look similar, but some native operations use an explicitly captured connection. The two connection proxies look similar too. The native connection tracks session changes and enforces ownership. The copied auth store's older sign-in setup and database deletion are in its standalone branches. Its Family sign-in and sign-out use the Family data plane. Treat import reachability as evidence of retained consumers. Establish which flows can execute before removing or rerouting either connection or its guards.

Trip cache eviction has a separate policy difference. The native path leaves all queued edits intact, including failed edits that can still be recovered. The legacy path intentionally removes failed rows during trip eviction. Native full cache clearing checks retained commands and imported originals. A shared eviction or teardown implementation would require an explicit behavior decision and targeted compatibility tests.

The tested four-path prototype `01c29f420` shares the 200-entry and 100 MiB blob-cache limits and the pure calculation of which oldest keys to evict. Both database wrappers still select rows by cachedAt and delete through their original receiver. The calculation uses the supplied IndexedDB order for timestamp ties and counts rows with missing byte metadata as zero.

All 222 cases in ten local suites pass before and after, including six new cases opening synthetic version 2 and 4 databases through both ports. The fixtures check schema version, trip rows, all four queued statuses and payloads, persisted blob bytes, an existing imported file, deterministic eviction and independent account caches. The cohort includes native upgrade history, ownership, guarded opens, sync, cross-tab queue and logout recovery. Typecheck, scoped lint and formatting and the offline and layering checks pass. The prototype reports 26 fewer flagged lines, from 3,266 to 3,240 across the same 94 files. The patch and receipts are in /private/tmp/family-offline-db-audit.1eMrzX.

**Next.** Apply and qualify the exact budget calculation patch. Repeat the paired regression suite and source-bound build. Review schema or connection consolidation separately when a concrete caller benefit justifies that change.

## Shared offline blob-cache budget

Commit `a6436b161` applies the exact four-path patch. Each IndexedDB wrapper still reads rows in cachedAt order and deletes the selected keys through its own connection. Both use the same 200-entry and 100 MiB limits and oldest-key calculation. The change is confined to the blob-cache budget. The native and legacy schema declarations, connection policies and queue recovery code are byte-identical.

All 2,615 cases across 98 local suites pass. The 222-case device cohort matches the rehearsal, including old-schema opens with saved trips, queued writes, stored blob and import bytes, tied timestamps and two account caches. The 2,393 preceding regression cases match their prior run as well.

The source-bound web build at `60e717e91` contains both wrappers and the shared helper. The only added module is the helper. Both builds verify 3,777 output files, 504 precache entries and 312 Brotli payloads. All 13 stylesheets and the two map SDK payloads match byte for byte. Typecheck, existing quality checks, formatting and all four source guards pass. The full duplication gate now flags 3,240 lines across 94 files, matching the rehearsed 26-line reduction.

**Next.** Audit the two category icon catalogs. The native file has 24 flagged lines and the copied Family file has 98. Inventory the native-only icons and verify persisted category values, picker order, map markers and PDF output before proposing a shared catalog. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

## Category icon catalog audit

The native category icon module has 28 direct application callers across Admin, Collections, the planner, maps and PDFs. The legacy catalog has two direct reachable callers in Family Admin. Its copied map popup and PDF consumers are exercised separately in fixtures. The native desktop and phone pickers expose 49 options. Family exposes the first 47 in the same order with the same labels. Bakery and Groceries are native choices. Family validates submitted keys against its own list and preselects MapPin when editing a category with an unsupported key. The native shell preserves an existing saved value in its form and uses the fallback when rendering an unsupported icon. The separate native widget symbol map has its own regression suite.

The prototype at `1316f541d` shares the 47 common icons and labels. Native appends its two options and Family builds its own ordered catalog. The new resolver checks that the name belongs to the selected catalog before handing a component to the renderer. It uses MapPin for absent and unsupported entries. The pin renderer and both popup builders now use the same lookup already used by the avatar and PDF paths. Map and PDF fixtures cover stored values, native-only values and the fallback. The Admin integration tests inspect the visible options in both native layouts and the Family manager.

All 499 cases in the final prototype pass across 14 suites, including a new fallback case using a synthetic dictionary. The copied PDF fixture passed on the original catalog and the prototype. That isolated fixture exposed 53 preexisting strict TypeScript diagnostics when imported into the permanent suite. The permanent PDF check uses the active renderer. The audit retains the copied PDF receipts. Typecheck, existing strict and quality checks, scoped lint and formatting, the presentation and backend guards, and the local fixture build pass. Both catalogs remain in the same emitted module set. The prototype reduces flagged duplication by 122 lines, from 3,240 across 94 files to 3,118 across 92 files. The candidate patch and test receipts are in /private/tmp/family-category-icons-audit.DDbca9.

**Next.** Apply and qualify the exact seven-path patch. Repeat the paired picker, map, PDF and fallback checks and compare the source-bound builds.

## Shared category icon catalog

Commit `837485932` applies the exact seven-path prototype. The native Admin pickers keep their 49 ordered options and Family keeps its 47. The map pins and popup builders use the appropriate catalog to select the icon, with MapPin for an unsupported key. The fixtures verify saved keys, labels, glyphs, native PDF thumbnails and the own-entry fallback. The copied PDF renderer has its separate [audit evidence](#category-icon-catalog-audit).

All 2,796 cases across 107 suites pass, including the 499-case category cohort. The qualified build at `4d556c97f` matches the prototype's emitted module graph and keeps both catalogs. Both builds verify 3,777 output files, 504 precache entries, 312 Brotli payloads and byte-identical stylesheets and map SDK payloads. Typecheck, formatting, existing quality checks and all four source guards pass. Duplication now flags 3,118 lines across 92 files, down 122 lines.

**Next.** Review the native and legacy CustomSelect components. They account for 38 and 76 flagged lines. Check their known placement, keyboard, search and focus differences through the current presentation and Family Admin entry points before sharing code. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

## CustomSelect compatibility audit

The native picker has 49 direct application callers. The legacy picker has nine, including Family Admin settings and the Family trip proposal form. Both pickers filter group headings, visible labels and search labels the same way. The native picker matches values by their string representation, handles arrow keys and Enter, and recalculates its portal position for scroll and viewport changes. The legacy picker retains strict value matching and measures its popup when it opens. Scoped legacy dialogs already give their owned pickers first access to Escape.

Two cases failed on the original code. In Family Admin, Escape left the currency picker open. In a legacy dialog without an owned-picker scope, Escape reached the editor close handler while the picker was open. The prototype at `caef9aa0d` handles Escape within the open legacy picker and returns focus to its trigger. The existing scoped dialog still closes its picker first. Both variants share trigger and option rendering and grouped filtering. Each keeps its existing positioning, selection and interaction logic. The current Family Admin route fixture verifies the selected currency and Family ID through the mocked preferences RPC and verifies the read-only role. Browser fixtures also check both variants' compact placement, badges and original numeric callback values.

The prototype passes all 432 cases in ten suites. The same cohort on the original wrappers passed 430, with the two Escape failures above. Typecheck, the existing strict allowance, formatting, scoped lint, quality and presentation and carryover guards pass. The prototype has the same two existing ESLint warnings in the native wrapper, with measured complexity reduced from 37 to 25. The isolated fixture build adds only the two shared modules to the emitted module set and passes its artifact, precache and compression checks with one additional JavaScript chunk. Duplication falls by 114 lines, from 3,118 across 92 files to 3,004 across 90 files in the prototype. The patch and verification receipts are in /private/tmp/family-custom-select-audit.uPBule.

**Next.** Apply and qualify the six-file patch, then repeat the paired picker checks and source-bound builds.

## Shared CustomSelect repair

Commit `fb637f22d` applies the six-file patch from the [selector audit](#custom-select-compatibility-audit). Escape now closes the open Family Admin currency picker or the picker in an unscoped legacy dialog and returns focus to its button. The native and Family pickers share trigger and option rendering and grouped filtering. Their selection, placement and modal ownership rules remain in their respective wrappers.

All 3,203 tests across 116 suites pass, including the 432-case selector cohort. The two source-bound builds verify the shared modules and retain both wrappers. The qualified build at `f2938b1a0` adds one cached JavaScript chunk. All 13 stylesheets and both map SDK payloads match byte for byte. Typecheck, formatting, existing quality checks and all four source guards pass. The native wrapper retains its two existing ESLint warnings. Duplication fell by 114 lines to 3,004 across 90 files and continues to block the release gate.

**Next.** Audit the native and legacy browser offline database modules. They account for 103 and 107 flagged lines respectively. Trace their consumers, database names, schema versions, ownership and upgrade behavior before proposing shared code. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

## Offline base schema audit

The current entry-point graph still reaches both IndexedDB modules. The native module has 70 direct callers, including Family bootstrap, trip repositories and queued-work recovery. The legacy module has 15, including the copied auth store, repos and sync manager. Both appear in the local web build. The copied auth store calls its older database reopen and deletion paths in standalone mode. Static reachability alone does not show that those operations run during a Family session.

Both modules register identical versions 1 through 4, including the version 3 metadata backfill for existing blobs and the version 4 import-file store. Native later registers versions through 14. The native Family adapter verifies its own database namespace and owner and can retain failed work and import originals during cleanup. Legacy still uses its original account-key databases and discards failed rows when evicting a trip. Native trip eviction keeps those rows. Connection switching, queue operations and cache clearing require their respective policies.

The prototype at `751f5cdfe` moves only the four common registrations into one function. Emitted tokens for the registrations match both originals. All other wrapper code matches. Native still runs its guarded constructor and version sequence. The test guard now records the actual version registrations, including those made by the imported helper. Its independent copy of the shipped schema history remains intact. The controls caught a duplicate registration and an incorrect blob metadata backfill. Five new fixtures cover fresh legacy databases and saved versions 1 through 4, including all original tables, queued rows, file metadata and indexes. The existing blob fixtures compare actual synthetic file bytes. Native upgrades through 14, ownership, guarded opens, account scoping, logout and recovery all pass.

The same 299 cases pass before and after across 12 suites. Typecheck and the existing quality checks pass. The local source-bound build retains both wrappers and adds only the schema helper to the emitted module set. Manifest, precache and Brotli counts match. The prototype reduces flagged duplication by 84 lines, from 3,004 to 2,920 across 90 files. The active branch still has 3,004 flagged lines. The patch and receipts are in /private/tmp/family-offline-schema-audit.77VI8A.

**Next.** Apply and qualify the exact four-file patch and repeat the combined source-bound build and database regressions.

## Shared browser offline base schema

Commit `20d1960ad` applies the four-file patch from the [offline schema audit](#offline-base-schema-audit). Both wrappers use one implementation of the shipped v1–4 registrations and v3 blob metadata backfill. The registration code matches the original JavaScript tokens. Native retains versions through 14 and legacy retains versions through 4. Each continues to own its database names, connection selection, queued work and cleanup.

The same 299 offline cases pass with the original wrappers and the shared schema. The fixtures check historical versions, saved rows and cached file bytes, account ownership, queue retention and recovery. All 3,280 combined regressions pass across 118 suites. Both local source-bound builds and all four source guards pass. The build at `d545750c4` adds the schema helper to the emitted modules and preserves all 13 stylesheets and the map SDK bytes. Both builds verify 505 precache entries and 313 Brotli payloads. Typecheck and the existing quality checks pass. Duplication falls by 84 lines to 2,920 across 90 files and still blocks the release gate.

**Next.** Audit the Family packing command session modules. The current scan flags 485 lines across these six files. Trace how each command identifies its account, trip and pending work, and verify session changes and retry behavior before proposing shared code. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

## Retained packing command session audit

The current web build includes the bag, category aggregate and category v2 session classes through their corresponding planner cohorts. The category v1, group and older item classes have test callers. The current graph and build do not reach those three classes. Their tests still exercise the older routes and record contracts.

Five sessions use the same sequence. They confirm the original account, Family, person, source, Trip and view before and after asynchronous checks. They acquire the cross-tab queue lock before sending or reconciling, retain the original operation ID and command, and compare the retained queue row before acknowledging or parking it. Each class supplies its own parser, acknowledgement validator and receipt transport. Bag and category aggregate also consult the caller's editor lifetime. The older item class submits and reads receipts through a different contract and does not use the same queue-row snapshot. Its code stays outside this patch.

The prototype at `b1b9a57b9` shares the five matching implementations. A token comparison verifies the constructor body and each lifecycle method against the original after substituting the explicit domain adapters. The bag and category aggregate editor checks remain connected. Four new cases verify that a retired editor sends no request and neither creates nor consumes a retained original. Existing tests verify duplicate submits, source and account switches, retry and response loss, typed receipts, cross-tab queue locks and original work preservation.

The same 673 local cases pass before and after across 13 suites. Typecheck, scoped lint, formatting, the existing quality checks and the protected-source guards pass. The source-bound prototype build retains the same three active session classes and adds one shared module. JavaScript chunk, manifest, precache and Brotli counts match. Duplication falls by a net 358 lines, from 2,920 in 90 files to 2,562 in 86 files. The shared implementation still has 64 flagged lines matched against the separate item class. The patch and receipts are in /private/tmp/family-packing-session-audit.ZGqBSb.

**Next.** Apply and qualify the exact eight-file patch, then repeat the combined regressions and both source-bound builds.

## Shared retained packing command sessions

Commit `a7ab203a5` applies the eight-file patch from the [packing session audit](#retained-packing-command-session-audit). The five command classes share the retained-session lifecycle and keep their own parsers, receipt and acknowledgement checks. Method comparisons verify the account, Trip, source, queue and editor boundaries. The older item session matches its original source hash.

All 673 packing cases pass against both revisions, including four editor-retirement cases. All 3,882 combined regression tests pass across 128 suites. Both source-bound builds and all four source guards pass. The build at `0be4797c5` retains the three active session modules and adds the shared implementation. All 13 stylesheets and the two map SDK payloads are byte-identical. Both builds verify 505 precache entries and 313 Brotli payloads. Typecheck, formatting and the existing quality checks pass. Duplication falls by 358 lines to 2,562 across 86 files and continues to block the release gate.

**Next.** Audit the five Family packing command request handlers. The current scan flags 333 lines across those handlers. Trace the routing, authorization, queue and acknowledgement contracts before proposing shared code. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

## Qualified packing request handler audit

The current build includes all five request handlers through the planner cohort. The cohort tries bag, category aggregate, category v2, category v1 and group in that order, followed by the item handler and packing reads. Each handler claims only its own path. It checks the write session, source, authenticated actor, Trip, view layer and retry header before using the domain transport. It rechecks the session when the transport responds. The callers acquire the queue lock and settle the retained row. The handlers return the original acknowledgement, while the readers supply current packing state.

The prototype at `1f2b5e533` shares the request lifecycle while each wrapper supplies its original route, body schema and transport. The bag limit stays 1 MiB and the other four limits stay 8 MiB. Category v2 still checks that the path and command domain agree before resolving the Trip. The method comparison matches all five original bodies after substituting those adapters. Planner dispatch, the item handler, the Axios adapter and the queue implementation match their original bytes.

The same 754 local cases pass before and after across 16 suites. The new suite checks 15 route ownership, fallthrough and exact UTF-8 byte-limit cases. Two category v2 fixtures now check the specific refusal and verify that it precedes both Trip resolution and the transport. Existing fixtures cover permission refusal, changed sessions, late replies and original queue preservation. Typecheck, scoped lint, formatting and the existing quality and source checks pass.

The isolated build retains all five handlers and adds only the shared handler module to the emitted module set. JavaScript chunk, manifest, precache and Brotli counts match. Duplication drops by 333 lines in the rehearsal, from 2,562 in 86 files to 2,229 in 81 files. The patch and receipts are in /private/tmp/family-packing-handler-audit.fdcERq.

**Next.** Apply and qualify the exact eight-file patch and rerun the combined regressions and both source-bound builds.

## Shared qualified packing request handlers

Commit `76a341520` applies the eight-file patch from the [packing request handler audit](#qualified-packing-request-handler-audit). The five handlers share validation and dispatch while retaining their original paths, parsers, UTF-8 byte limits and transports. Category v2 checks its subroute before resolving the Trip. Method comparisons reproduce the original authorization, retry identity and late response checks. The planner dispatcher, item handler, Axios adapter and queue implementation match their audited source hashes.

The original and shared handlers pass the same 754 cases across 16 suites, including all 15 route and payload cases. All 3,963 combined regressions pass across 131 suites. Both source-bound builds and all four source guards pass. The build at `f692cd559` retains all five active wrappers and adds the shared implementation. All 13 stylesheets and both map SDK payloads match byte for byte. Both builds verify 505 precache entries and 313 Brotli payloads. Typecheck, formatting and the existing quality checks pass. The release duplication gate flags 2,229 lines across 81 files, down by 333.

**Next.** Audit the packing category aggregate and v2 cohorts. The scan flags 109 lines across both files. Compare their read and publication sequencing, source ownership and recovery boundaries before proposing shared code. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

## Packing category snapshot audit

The planner constructs and resets both category modules and exposes their SDK methods. Both modules read from the canonical v2 category list and hold a private snapshot. The category aggregate module additionally checks the editor lifetime. Native packing writes use the separate planner packing module. The category modules keep their own read commands and submit calls. A successful command acknowledgement triggers a fresh canonical read, with the original account, source, Trip and generation checked before publication.

The prototype at `85975fcdc` shares capture, snapshot, load and reset. Instance fields and method bodies match their original tokens after substituting the canonical reader and optional aggregate editor check. The domain methods match their original bodies. The planner, native writer, command sessions and canonical transport match their original bytes.

The same 855 local tests pass before and after across 19 suites. Two new fixtures prove that resetting an aggregate retires its pending load while preserving the v2 snapshot, and that an aggregate editor lifetime restriction leaves an ordinary v2 read valid. Existing fixtures cover stale reads, defensive copies, permission refusal, receipt recovery and canonical reload after a successful command. Typecheck, formatting, scoped lint and the existing quality and source checks pass.

The isolated build retains both category modules and adds only their shared snapshot implementation. JavaScript chunk, manifest, precache and Brotli counts match. The rehearsal reduces flagged duplication by 109 lines, from 2,229 in 81 files to 2,120 in 79 files. The patch and receipts are in /private/tmp/family-packing-category-audit.cpqPfv.

**Next.** Apply and qualify the exact four-file patch, then rerun the combined regressions and both source-bound builds.

## Shared packing category snapshot lifecycle

Commit `8078412c6` applies the four-file patch from the [packing category snapshot audit](#packing-category-snapshot-audit). The aggregate and v2 modules share capture, snapshot, load and reset. Each has independent state and a separate generation. The aggregate keeps its editor lifetime check. Method comparisons reproduce the original lifecycle and domain behavior. The planner, native packing writer, relevant command sessions and canonical transport match their audited source hashes.

Both revisions pass the same 855 focused cases across 19 suites. The isolation fixtures verify retirement of the pending aggregate load and preservation of the ordinary v2 read. All 4,064 combined regressions pass across 134 suites. Both source-bound builds and all four source guards pass. The build at `eab88ab17` retains both category wrappers and adds the shared implementation. All 13 stylesheets and both map SDK payloads match byte for byte. Both builds verify 505 precache entries and 313 Brotli payloads. Typecheck, formatting and the existing quality checks pass. The release duplication gate flags 2,120 lines across 79 files, down by 109.

**Next.** Audit the Family planner arrangement and edit sessions. The scan flags 115 lines across both files. Trace their account and Trip capture, queue and recovery contracts before proposing shared code. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)


## Planner original session audit

The arrangement and edit writers each share a session with their corresponding recovery surface. The two sessions capture the same account, repository context, source, Trip, layer and identity registry, recheck them around asynchronous reads, and respect the caller's lifetime. The shared runner holds the existing required exclusive queue lock as it checks the exact retained row, reads the receipt and settles the original operation. A check can return an unknown outcome without sending a write. A retry uses the original packet and operation ID, and requires a committed receipt with the same request digest and canonical acknowledgement before removing the retained row.

The arrangement adapter keeps its scope and validates the entire POST acknowledgement. The editor adapter keeps the location or visit identity check and validates the nested operation. Domain errors, route selection, queue adapters and receipt readers retain their existing behavior. The prototype at `1f5ea741d` matches both original capture and runner bodies after adapter substitution. The four writers and recovery callers, packet schemas, queue operations, HTTPS policies and receipt readers match their original bytes.

All 369 tests across nine suites pass before and after, covering native callers, permission refusal, changed sessions, lost responses, duplicate gestures, read-only recovery and exact original retries. Typecheck, lint, formatting and the quality checks against the existing limits pass. The isolated source-bound build adds only the shared module and retains both domain adapters. The local artifact, precache and compressed bytes pass verification.

The prototype reduces flagged duplication by 115 lines, from 2,120 across 79 files to 2,005 across 77 files. The patch and receipts are stored in `/private/tmp/family-planner-session-audit.nauXvg`.

**Next.** Apply and qualify the three-file patch, then repeat the combined regressions and both source-bound builds.

## Shared planner original sessions

Commit `17dd92961` applies the three-file patch from the [planner original session audit](#planner-original-session-audit). Both domains share account and Trip capture, session checks, the exclusive queue lock, and receipt-backed retry and settlement. Arrangement still verifies the complete acknowledgement. The editor checks the nested operation and retains its location or visit identity validation. Both adapter bodies match the audited substitutions, and the 14 callers and supporting contracts recorded in the audit match their original bytes.

The same 369 focused cases pass before and after across nine suites. All 4,241 combined regression tests pass across 138 suites. Both source-bound local builds, four source guards, typecheck, lint and formatting checks pass. The build at `76b9a0b04` adds only the shared planner session module. Both map SDK payloads and all 13 stylesheets match byte for byte. Both builds verify 505 precache entries and 313 Brotli payloads. The remaining release duplication finding is 2,005 lines across 77 files, down by 115.

**Next.** Audit the repeated context checks in Family creation, packing and task recovery and the exact retained-row checks in packing and task recovery. The three files account for 134 flagged lines. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)


## Planner recovery checks audit

Creation, packing and task recovery capture the same account, source, Trip, layer and identity registry. The isolated prototype at `ebc8ba827` shares capture and the checks around the session read. The existing arrangement and edit sessions use that same context helper. Their runner, receipt rules and distinct packet validation retain the prior behavior.

Packing and task recovery also share the Trip filter and exact retained-row comparison while using their existing serializers. Each domain keeps its transport initializers and receipt, permission, refusal and retry rules. Creation keeps the terminal decision check before ordinary queued work. Source comparison verified the context and row checks, transport initialization order, and the rest of the recovery and retry logic.

The same 943 tests pass before and after across 22 suites. These cover read-only discovery, stale sessions and rows, explicit retry, lost responses, permission refusal and creation cancellation. Typecheck, lint, formatting and the existing quality checks pass. The isolated build adds only the context helper and retains the existing application modules. The source-bound artifact, precache and compressed bytes pass verification.

The prototype reduces flagged duplication by 134 lines, from 2,005 across 77 files to 1,871 across 74 files. The patch and receipts are stored in `/private/tmp/family-recovery-checks-audit.TWJxlz`.

**Next.** Apply and qualify the exact five-file patch, then repeat the combined regressions and both source-bound builds.

## Shared planner recovery checks

Commit `6bfd5125f` applies the five-file patch from the [planner recovery checks audit](#planner-recovery-checks-audit). Creation, packing, and task recovery and the original arrangement and edit sessions use the shared context capture. Packing and task recovery also share the Trip filter and exact retained-row checks. The source comparison verified the original validation and transport initialization order. Each flow retains its receipt, refusal, and retry rules. Creation checks terminal decisions before queued work. The 17 callers and supporting files recorded in the audit match their original bytes.

The same 943 focused cases pass before and after across 22 suites, and all 4,343 combined tests pass across 144 suites. Both source-bound local builds, four source guards, typecheck, lint, and formatting checks pass. The build at `4870a9be3` adds only the shared context module. All 13 stylesheets and both map SDK payloads match byte for byte. Both builds verify 505 precache entries and 313 Brotli payloads. The release duplication check flags 1,871 lines across 74 files, down by 134.

**Next.** Audit the Family arrangement and edit intent queues, which account for 100 flagged lines. Compare their exact-row and transaction rules before proposing shared code. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)


## Planner intent queue audit

The prototype at `773d131a2` shares the arrangement and edit queue operations. Each adapter supplies the original packet scope, route, refusal code and messages. Editing still validates the original location or visit through `editorScope`. The shared operations keep their original row metadata and status rules, owner checks and transactions. They honor terminal creation holds and verify that the complete retained row still matches before acknowledging or parking a refusal.

All eight queue function bodies and both adapters match their originals after substituting the domain-specific values. The direct callers, creation queue, terminal archive, packet contracts and session code match their original bytes. Creation has its own timestamp and row comparisons and was used as a reference.

The same 572 tests pass before and after across 14 suites, including replaced rows, session retirement, terminal creation holds, read-only recovery and explicit retry. Typecheck, lint, formatting and the checks against the existing limits pass. The source-bound local build adds the shared queue module and retains the existing modules. Artifact verification, precache and compressed payload checks pass.

The prototype reduces flagged duplication by 82 lines, from 1,871 across 74 files to 1,789 across 73 files. The arrangement and edit findings are gone in the prototype. The 18-line overlap with creation persists in the shared helper. The patch and receipts are stored in `/private/tmp/family-intent-queue-audit.wqDtts`.

**Next.** Apply and qualify the exact three-file patch, then repeat the combined regressions and both source-bound builds.

## Shared planner intent queues

Commit `6a7c10394` applies the three-file patch from the [planner intent queue audit](#planner-intent-queue-audit). Arrangement and edit use the shared retention, verification, acknowledgement and refusal operations while each keeps its own packet scope, route and errors. The eight function bodies match their original behavior after substituting the domain adapters. The 16 callers and supporting files in the audit match their original bytes, including the creation queue and terminal archive.

The same 572 focused cases pass before and after across 14 suites. All 4,418 combined cases pass across 146 suites. Both source-bound local builds, four source guards, typecheck, lint and formatting checks pass. The build at `a487aa45e` adds the shared queue module and retains the existing modules. All 13 stylesheets and both map SDK payloads match byte for byte. Both builds verify 505 precache entries and 313 Brotli payloads. The release duplication check flags 1,789 lines across 73 files, down by 82.

**Next.** Audit construction of newly retained rows in the creation and shared planner queues. The matching block accounts for 18 flagged lines in each file. Verify their validation and transaction order before proposing a shared constructor. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)


## Retained planner row audit

The prototype at `ff8f0c8ef` shares creation of the queued record after the existing checks. The helper retains the original operation ID, request body clone, route, build marker, schema marker and timestamp calculation. The two caller bodies match their originals after substituting the helper call. Transactions, terminal creation holds, existing-row reuse, complete-row comparisons and refusal handling retain their original behavior.

Nine new cases pass on both revisions. They exercise first saves and request cloning, timestamp ordering after an unrelated queued row, retention after a refusal, and the existing domain rules for a fractional timestamp. Creation accepts a finite fractional timestamp and advances from it. Arrangement and edit require safe integers before adding a new row. All 531 focused tests across 15 suites pass before and after.

The source-bound local build, typecheck, lint and existing quality checks pass. The browser module set and map SDK payloads match. The prototype removes the 18 flagged lines in each queue, reducing the total from 1,789 across 73 files to 1,753 across 71 files. The patch and receipts are stored in `/private/tmp/family-retained-row-audit.u6in6g`.

**Next.** Apply and qualify the exact three-file patch with the new regression fixture, then repeat the combined tests and both source-bound local builds.

## Shared retained planner row constructor

Commit `51a7d2ec3` applies the three-file patch from the [retained planner row audit](#retained-planner-row-audit). Creation, arrangement and edit reuse the same construction for new queue records after their domain checks. The source comparison verifies the original record fields, exact request clone, build marker and timestamp calculation. Both queues retain their respective validation and transaction order. The 21 callers and supporting files recorded in the audit match their original bytes.

All 531 focused tests, including nine new row cases, pass before and after across 15 suites. All 4,481 combined tests pass across 149 suites. Both source-bound builds, four source guards, typecheck, lint and formatting checks pass. The build at `a34048b92` has the same compiled module set. All 13 stylesheets and both map SDK payloads match byte for byte. Both builds verify 505 precache entries and 313 Brotli payloads. The release duplication check flags 1,753 lines across 71 files, down by 36.

**Next.** Audit the base and retained packing command sessions, which account for 127 flagged lines. Check ownership, editor lifetime, transport and receipt differences before proposing shared code. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)


## Packing command context audit

The prototype at `b2fd0b52d` shares capture of the original packing command and the write-session, account, source, Trip, layer and optional editor checks. The two constructors keep their packet parsing and public parameters. Existing request cloning, locking, acknowledgement, receipt and refusal policies remain in the two sessions. All four submit and reconcile methods match byte for byte. The retained session keeps its full-row settlement check.

The base session has seven checked-in test importers and no application entry path. Both builds exclude it. The retained session is in the browser build with the new shared context. Its active imports and all five command adapters match their audited bytes.

The same 582 tests pass before and after across 16 suites, including changed session and editor state, coalesced submissions, retained work, and visible or redacted receipts. Typecheck, lint, formatting, source-bound build and artifact checks pass. The prototype lowers flagged duplication by 79 lines, from 1,753 to 1,674 across 71 files. Each session still has 24 flagged lines in its settlement method. The patch and receipts are stored in `/private/tmp/family-packing-command-context-audit.0G1xnh`.

**Next.** Apply and qualify the exact three-file patch, then rerun the combined tests and both source-bound local builds.

## Shared packing command context

Commit `c2e2c94df` applies the three-file patch from the [packing command context audit](#packing-command-context-audit). The sessions share command capture and ownership checks, including the optional editor lifetime. All four submit and reconcile methods match their original bytes. The retained session still verifies the exact row during settlement. The 21 callers and supporting files recorded in the audit match their original bytes.

The same 582 focused tests pass on both revisions across 16 suites. All 4,481 combined tests pass across 149 suites. Both source-bound local builds, four source guards, typecheck, lint and formatting pass. The build at `6bc096a06` emits the shared context and the retained session. Both browser builds exclude the test-only base session. The 13 stylesheets and both map SDK payloads match byte for byte. Both builds verify 505 precache entries and 313 Brotli payloads. The release duplication check flags 1,674 lines across 71 files, down by 79.

**Next.** Prepare and test the incremental backup tooling on isolated fixtures. Fresh protection and a recovery rehearsal are prerequisites for hosted changes. The duplication check remains open. [Current release checklist](../core-release-prerequisites.md#order-from-here)

## Disconnected offline banner and OAuth consent

Commit `f57705404` removes the two legacy files. The root App imports the native OfflineBanner and lazily opens the native OAuthAuthorizePage at `/oauth/consent`. The deleted copies had zero importers in the repository or modules in the baseline build. The source qualification at `0482ee024` drops exactly their two Family additions.

All 84 targeted cases pass before and after. All 4,565 combined tests across 155 files pass and match their prior results by test name. Typecheck, formatting, the existing ratchets and the four source guards pass. Both fixture builds pass the artifact checks. All 392 compiled JavaScript chunks and their import graph match after replacing hashed asset references. Twelve stylesheets are byte identical. The root stylesheet loses exactly one generated utility, `sm:border-r`, whose only source was the deleted legacy consent page. Both asset manifests verify 505 precache entries and 313 Brotli payloads.

The full scanner reports 1,583 duplicated lines in 68 files, down by 91 lines. Only the two legacy entries and their native OfflineBanner counterpart disappear from the report. Every other copied block and the scanner settings match the prior scan.

**Next.** Audit the overlapping native and retained offline database functions. Check transaction and account binding before proposing any shared code.

## Shared offline database proxy

The audit found that both browser database modules are live. The native module checks ownership before selecting a Family database and preserves queued work and import originals during its cleanup. The retained module still owns its account-keyed connections and original cleanup. Native and retained entity and queue types come from different contracts. Their typed tables and writer functions need a separate review before sharing.

Commit `0297ecb5c` shares the identical proxy forwarding. Each module supplies its own live connection. Property reads and assignments still reach that connection, and a method already read remains bound to its original receiver. The constructors, connection switching, transactions, and cleanup are outside the patch. Two new fake IndexedDB cases verify the existing proxy reference, bound methods, symbol property and persisted row isolation after switching accounts in each wrapper.

All 264 targeted cases match before and after. All 4,699 combined cases pass across 161 test files, including the database upgrade, account, queue and recovery regressions. Typecheck, scoped lint, format, existing quality checks and four source guards pass. Both source-bound builds and artifact scans pass. Both database modules still ship. The new helper is the only added emitted module. All 13 stylesheets and both map SDK payloads match byte for byte. Both builds verify 505 precache entries and 313 Brotli payloads.

The native database module falls from 63 flagged lines to 45, and the retained module from 63 to 46. Other files retain their previous counts. Total duplication falls from 1,583 to 1,548 lines in 68 files.

**Next.** Audit the native Admin permissions hook and retained panel. Review their permission and mutation scope before proposing any shared code.

## Family Admin permissions session repair

Standalone TREK routes use the native desktop and phone Admin screens and the original instance permissions endpoint. The installed Family route uses the separate direct/propose policy manager, which calls the existing Family permissions RPCs. The older instance panel is imported by a conditional fallback in the copied Admin Users tab. The installed Family route is selected only after the Supabase connector activates. Exercise the desktop, phone and Family routes before removing that fallback and its panel.

The audit reproduced three regressions in the active Family manager. A late list, save or reset response could restore an earlier account's displayed management state. Commit `374648b6d` ties responses and write callbacks to the captured Family actor and clears the view and reset confirmation on an account or access change. It also validates the returned Family ID before applying a snapshot. Six focused cases pass, including a same-account sign-out and return, a mismatched response and the exact current manager save and reset arguments.

All 4,732 client tests across 165 files and six backend adapter cases pass. Typecheck, scoped lint, formatting and source guards pass. The local build at `e2af334d8` passes source binding and verifies 505 precache entries and 313 Brotli payloads. The duplication report still flags 1,548 lines across 68 files.

**Next.** Exercise the native desktop and phone permission reads and saves and the Family manager and reviewer routes before retiring the copied fallback. Keep the native and Family permission contracts separate.

## Copied Admin permissions fallback retired

The registered standalone desktop and phone routes both read a saved instance permission, change it through the original endpoint and display the saved result on remount. The Family manager changes a direct scope through the original Family RPC and reads it back on remount. The Family reviewer sees the saved policy with read-only presentation. The fixtures check exact write payloads and that each route uses its own data plane.

Directly mounting the Family Admin wrapper with Nest enabled showed the copied instance panel and made one copied request to `/admin/permissions`. Commit `9626b2b25` removes that fallback and its sole panel file. Family Users still shows the Family matrix when Supabase is selected. Direct mounting on Nest now calls neither permissions API. All five route cases pass.

All 4,737 combined client tests across 165 files pass. Both source-bound builds and the artifact checks pass. They retain the native desktop and phone panels and the Family manager. The copied panel and its legacy permission store drop from emitted modules. The store's source stays available to its remaining callers. Twelve stylesheets match exactly, and the root stylesheet loses solely the `sm:w-auto` utility used by the copied panel. Both builds verify 505 precache entries and 313 Brotli payloads. Typecheck, format, scoped lint, the existing ratchets and all four source guards pass.

The duplication report drops by 101 lines to 1,447 across 66 files. All other per-file counts match. **Next.** Check the separately routed Admin backup panel and its copied fallback with local fixtures.

## Copied Admin backup panel retired

The registered standalone desktop and phone routes read the backup list and schedule, save a changed schedule through the existing endpoint, and read it back on remount. Family hides the tab and sends no backup requests, even with `?tab=backup`. Directly mounting the copied Family wrapper on Nest reached its copied panel before the change. Commit `3ff11b8b5` removes its tab and panel.

The fixtures also reproduced an early request in both native managed layouts. A backup bookmark mounted the panel before the URL-correction effect even when managed status was already known. The shared native Admin hook now resolves the active tab before rendering, then normalizes the URL. The cases check zero backup requests in both managed layouts. All seven route cases pass. The fixtures use an in-memory adapter and do not start any real backup job.

Both source-bound builds pass and retain the native desktop and phone panels. The only removed emitted module is the copied panel. All 12 other stylesheets match exactly. The root stylesheet loses four dark-mode utilities sourced solely from the removed file. Both builds verify 505 precache entries and 313 Brotli payloads. Typecheck, source guards, formatting and the existing quality checks pass. The native hook has the same 24 scoped lint warnings by rule on both revisions.

All 4,815 client tests across 168 files pass. The first concurrent run timed out in an existing Personalization fixture during startup. The focused Admin route suite and the full rerun passed with the same source and test assertions.

The scanner reports 1,363 duplicated lines across 64 files, down by 84. All remaining per-file counts match. **Next.** Audit the copied Admin MCP token panel and trace where it can mount before testing any cleanup.

## Copied Admin MCP access panel retired

The registered standalone desktop and phone routes list fixture OAuth sessions and MCP tokens. In both layouts, each removal waits for confirmation and uses its own endpoint and identifier. Reopening the route reloads the saved lists. The installed Family routes show the Family administration controls and send neither MCP list request, even with a bookmark and a synthetic enabled add-on.

On the starting revision, directly mounting the Family wrapper against standalone TREK exposed the copied tab and sent two list requests. Commit `3fbc3d60c` removes that tab and panel. The same regression case now sends neither request. The standalone routes continue to use their native panels, shared hook and server API.

All 83 focused tests and 4,858 combined client tests across 171 suites pass. The first full run had timeouts in the existing Personalization startup and route-calculator cases. Both passed in isolation and on the combined rerun with the repository timeout.
Typecheck, scoped lint, formatting, existing quality checks and all four source guards pass. The reproduced baseline and candidate builds pass artifact validation. The copied panel is the only removed emitted module. Twelve stylesheets and both map SDK payloads match exactly. The root stylesheet loses the two grid column utilities and one dark-mode hover utility from the removed panel. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scanner drops by 80 lines, from 1,363 across 64 files to 1,283 across 62 files. All unaffected file counts match.

**Next.** Audit the copied Admin GitHub integration panel through standalone desktop, standalone phone and Family Admin. Confirm the existing standalone controls with synthetic API responses before changing the Family wrapper.

## Copied Admin GitHub panel retired

The registered standalone desktop and phone routes still open GitHub release history, expand a release's notes, filter prereleases on stable installs and request page two with the original pagination parameters. Installed Family routes keep the GitHub tab hidden. A GitHub bookmark on an already-known managed install opens Users on both layouts. The Family and managed fixtures send zero release-history requests.

On the starting revision, mounting the Family wrapper directly against standalone TREK exposed the copied panel and sent a release-history request. Commit `a8350ea69` removes the copied tab and panel. Its regression case now sends zero release-history requests. The fixtures use synthetic release records behind the existing HTTP adapters.

All 100 focused tests and 4,913 combined client tests across 174 suites pass. Typecheck, formatting, scoped lint, existing quality checks and four source guards pass. Both builds pass artifact validation. The copied panel is the only removed emitted module. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,283 lines across 62 files on both revisions.

**Next.** Audit the copied Admin Add-ons manager. Exercise the standalone desktop and phone routes and the Family exclusions before considering cleanup. The duplication report pairs part of the copied manager with the native LLM parsing configuration hook.

## Copied Admin Add-ons manager retired

Standalone desktop and phone read, toggle and reload the Todo List, Bag Tracking and collaboration Notes settings. Local fixtures verify the three original save payloads and the returned settings after reopening the page. The registered Family routes continue to offer Features and send zero standalone Add-ons, bag-tracking or collaboration requests with an Add-ons bookmark.

On the starting revision, mounting the Family wrapper on standalone TREK immediately read the bag-tracking and collaboration settings. Opening the copied tab then requested the Add-ons list. Commit `1a037aac1` removes the copied panel, its two dedicated read effects and its write callbacks. The direct wrapper fixture now sends zero requests to those three endpoints.

All 148 focused tests and 5,009 combined client tests across 178 suites pass. Typecheck, formatting, scoped lint, existing quality checks and four source guards pass. Both builds pass artifact validation. The copied manager is the only removed emitted module. The builds retain both native managers, their shared Add-ons and AI parsing hooks, and Family Feature Controls. All 12 other stylesheets and both map SDK payloads match exactly. The root stylesheet loses the padding and hover-opacity utilities sourced solely by the copied manager. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan drops by 23 lines, from 1,283 across 62 files to 1,260 across 60 files. The two cleared entries were the copied panel and its match in the native AI parsing configuration hook.

**Next.** Audit the copied Admin developer notifications panel. Check developer-mode visibility through standalone and Family routes. Use fixtures for any dispatch tests.

## Developer notifications bookmark guard and Family copy retirement

Standalone desktop and phone still load the selected trip and send the exact synthetic trip reminder payload when developer mode is enabled. The installed Family routes keep developer notifications hidden. Directly mounting the Family wrapper on standalone TREK used to expose the copied panel and fetch trips. Commit `3cace8a02` removes that fallback.

The fixtures reproduced a separate native bookmark issue in both layouts. The tester mounted even when developer mode was off or app-config was pending. The shared native Admin hook now shows Users while the flag is false and retains the requested tab so an approved developer bookmark opens once configuration confirms it. Before confirmation, neither layout fetches the tester's trips. The existing server restriction continues to refuse sends outside the development environment. Fixture sends run through a synthetic adapter.

All nine route cases, 106 focused tests and 5,058 combined client tests across 181 suites pass. Typecheck, formatting, scoped lint, existing quality checks and four source guards pass. The native Admin hook has the same 24 warnings by rule. Both builds retain the standalone panels and shared hook. The copied panel is the only removed emitted module. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit the copied Admin audit-log panel. Exercise the registered standalone views and the installed Family product audit view with synthetic activity before considering cleanup.

## Family audit session repair and copied instance panel retirement

Standalone desktop and phone retain their instance audit endpoint and offset pagination. Installed Family Admin retains the product audit RPC, filter arguments and timestamp-and-ID cursor. The fixtures exercise both pages through the registered routes with synthetic audit activity.

The Family audit fixture reproduced a stale pagination response after changing the actor filter. Directly mounting the Family wrapper also reproduced stale first-page results on both a changed identity and a sign-out followed by return to the same identity. Commit `26d510bdf` discards older completions and clears the current page and cursor when access changes. Fresh reads require an active Family session. The same commit removes the copied standalone panel and its request from the Family wrapper.

All eight route cases, 104 focused tests and 5,096 combined client tests across 184 suites pass. Typecheck, formatting, scoped lint, existing quality checks and four source guards pass. Both builds retain the native panels and the Family product audit reader. The copied instance panel is the only removed emitted module. The builds match across 12 stylesheets and both map SDK payloads. The root stylesheet loses the `max-w-[140px]` utility from the removed panel. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit the copied Admin update banner and demo baseline controls. Verify which routes can render them, and use synthetic update and save responses before considering cleanup.

## Copied Admin update and Demo Baseline controls retired

The standalone desktop and phone fixtures show the available version, open update instructions and submit the existing Demo Baseline request on a demo instance. The known-managed routes skip the version check. The installed Family routes exclude both operations even when the fixture enables demo mode.

Directly mounting the Family wrapper on standalone TREK used to show the copied update banner and issue a version check. The copied Demo Baseline button also issued a save request in the fixture. Commit `71fbfe339` removes both controls, the copied upgrade instructions and their dedicated state. The direct wrapper now sends zero requests to either endpoint. The verification used a synthetic version response and intercepted save requests.

All seven route cases, 118 focused tests and 5,140 combined client tests across 187 suites pass. Typecheck, formatting, scoped lint, existing quality checks and four source guards pass. Both builds retain the native update paths and Family user dialogs. The copied banner is the only removed emitted module. The builds match across 12 stylesheets and both map SDK payloads. The root stylesheet loses 15 utilities from the retired controls. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit the copied Family JWT rotation confirmation. Trace how the standalone dialog opens and check the Family modal's remaining callers with synthetic responses.

## Managed JWT rotation guard and Family confirmation retirement

The registered standalone desktop and phone fixtures cancel without a request and confirm through the existing rotation endpoint. The confirmation fixture intercepts the request and replaces logout with a test double. The installed Family identity routes and direct wrapper expose no instance rotation control. Commit `70aaf3e3a` removes the disconnected Family dialog and its dedicated state.

Known-managed mobile Settings previously displayed Rotate while desktop hid it. An open confirmation could also stay visible and dispatch on either layout after managed mode arrived. The native Settings view, shared Admin state and dispatch handler now honor that flag. The server continues to enforce its existing managed restriction. Five previously failing fixture cases pass, including a confirmation click during the managed transition.

All 11 route cases, 239 focused tests and 5,187 combined client tests across 189 suites pass. Typecheck, formatting, scoped lint, other quality checks and four source guards pass. Two formerly byte-identical upstream files now have explicit, verified source exceptions for managed visibility and dispatch. Both builds retain the emitted module set, match across 12 stylesheets and remove one disabled-state rule from the copied dialog. Both map SDK payloads match. Each build validates 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit the copied Family Admin instance OIDC reader. Trace how the installed Family identity controls and standalone settings load, then use synthetic responses to confirm any disconnected read.

## Family OIDC reader retirement and identity session repair

Standalone desktop and phone read, update and reload instance OIDC settings through the original endpoint. A display-name change omits the stored secret from the payload. Known-managed routes omit the form and request. Installed Family Settings loads identity assurance and file policy through the existing Family RPCs. The copied Family wrapper on Nest used to fetch unrendered OIDC configuration. Commit `154656290` removes that read and its form state.

The same fixtures reproduced obsolete Family identity results after signing out and returning with different access. An in-flight identity link also retained its previous page state. The repair clears the identity snapshot and roster selections on session changes, rejects old reads and stops retired link completions from reloading or updating the current view. The fixtures exercise already-issued links with synthetic responses.

All nine route cases, 98 focused tests and 5,196 combined client tests across 190 suites pass. Typecheck, formatting, scoped lint, other quality checks and four source guards pass. Both builds retain the same emitted module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit the copied Family Admin instance API-key reader. Trace the registered standalone settings and Family map settings with synthetic values before removing any disconnected reads.

## Copied Admin API-key reader retirement and Family Maps session repair

The standalone desktop and phone routes read, save, validate and reload instance keys. The synthetic Google environment variable locks its field, and saving an Unsplash change omits the operator-controlled Google key. Managed routes hide the native key controls. The copied Family wrapper on Nest issued a read for an unrendered key form. Commit `e475217dc` removes that request and the unreachable key form state and handlers.

Installed Family Maps continues to load through the existing family-scoped command. The timed fixtures reproduced a late read restoring the edit controls and a late save replacing map settings after access changed. The settings panels now share the access guard that protects the Family identity panel. The map panel clears credential drafts when access changes and discards obsolete reads and save responses before displaying success or refreshing the effective map.

All 9 new route cases, 141 focused tests and 5,205 combined client tests across 190 suites pass. Typecheck, formatting, scoped lint, existing quality checks and four source guards pass. Both builds retain the existing emitted modules and add the shared settings access guard. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit the copied Family Admin SMTP settings reader. Verify its remaining WebAuthn and app-configuration dependencies before removing any disconnected reads. Check the standalone desktop and phone routes with synthetic values.

## Copied Admin SMTP reader retirement and managed relay guard

The standalone desktop and phone routes read, write and reload SMTP and WebAuthn settings through the existing instance API. Editing a synthetic SMTP host keeps the masked password value in the existing save contract. The installed Family Admin routes continue to use the Family notification defaults and identity APIs. The copied Family wrapper on Nest issued an instance configuration read for controls that it never rendered. Commit `8ec2d07ac` removes that read and the unreachable SMTP and WebAuthn form state.

The managed phone route now hides the operator's SMTP card, as the managed desktop route already did. The shared handler checks current managed mode before saving credentials, before sending a test email, and before applying an async result. Synthetic tests reproduce both layouts crossing into managed mode after a settings request was issued. The test-email request is now suppressed.

All 11 new route cases, 362 focused tests and 5,251 combined client tests across 191 suites pass. Typecheck, formatting, scoped lint, existing quality checks and four source guards pass. Both builds retain the existing emitted module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit Family notification defaults across access changes. Verify the active Family panel's pending reads and saves against the current access scope.

## Family notification defaults session protection

The Family notification defaults panel could accept a delayed read from a prior manager session. A successful write could also trigger a read for the previous family after the switch, and an already-issued refresh could replace the current settings or display a stale success message. The local route fixtures reproduce all three cases.

Commit `6861c42b7` reuses the Family settings access guard and shares the request state with Family Maps. It clears notification defaults and management controls on access change, then loads the current Family's settings. The adapter checks the initiating session before its post-save read. Obsolete responses have no effect on settings, loading state or feedback. A write already sent is still governed by the existing database API. The write payload, authorization and in-app delivery policy use the established Supabase contracts.

All 3 new route cases, 154 focused tests and 5,254 combined client tests across 191 suites pass. All 5 notification adapter tests and both typechecks pass. Formatting, scoped lint, other quality checks and four source guards pass. Both builds retain the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit Family preference defaults across access changes. Verify that an old response cannot alter the temperature, distance, time or display currency selections shown to the current Family.

## Family preference defaults session protection

The Family Defaults panel could display an old manager's settings after the same account returned as a reviewer. After switching families, an earlier write could replace the current display currency or keep the new family from editing while the old save remained pending. The route fixtures reproduced those failures for successful and failed old saves.

Commit `3450b520e` uses the shared Family settings access guard. Settings, edit permissions, loading and saving state now belong to the current access context. Late responses cannot replace the new panel, end a newer save or display feedback there. The selected family and explicit null reset still reach the existing Supabase commands through the same adapter. A write already sent can still complete under the established database rules.

All 5 new route cases, 146 focused tests and 5,259 combined client tests across 191 suites pass. All 4 preferences adapter tests and the client typecheck pass. Formatting, scoped lint, other quality checks and four source guards pass. Both builds retain the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit Family feature controls across access changes. Check family overrides, administrator rollout state and event history while reads or saves are pending.

## Family feature controls session protection

A delayed controls response could start a product rollout history read after administrator access was lost. An in-flight history response could replace the newer view. Late Family override and rollout saves could refresh availability from an earlier access context and display obsolete feedback. The local Admin fixtures reproduced all four cases.

Commit `2ca01afc1` binds each read and save to its initiating Family access context. Controls and product history now update together. An access change clears the previous controls, history and saving state. The current context can refresh availability, and an already submitted save can complete under the existing database rules. The ordinary rollout and explicit inheritance paths use the existing Supabase commands.

All 5 new route cases, 188 focused tests and 5,269 combined client tests across 192 suites pass. All 3 feature resolver tests and the client typecheck pass. Formatting, scoped lint, other quality checks and four source guards pass. Both builds retain the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit Family place categories across access changes. Verify that a pending read, edit or delete cannot affect the new Family's categories or form state.

## Family place categories session protection

Family place categories could restore an older list and edit controls after access changed. A creation draft could carry into the next Family, and a delete confirmation could remain open after edit access ended. Late edits and deletes could show feedback in the new session. The Admin route fixtures reproduce all five problems.

Commit `75243c7e9` uses the shared Family settings access guard. A context change clears draft and confirmation state, and delayed responses can only update their original active scope. Existing edits and deletes submit the same Family and category IDs, including under Strict Mode. A mutation already sent can still complete under the existing database rules.

All 6 new route cases, 164 focused tests and 5,299 combined client tests across 193 suites pass. All 9 category adapter and workspace model tests and the client typecheck pass. Formatting, scoped lint, other quality checks and four source guards pass. Both builds retain the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit Family packing templates across access changes. Verify pending lists and writes, expanded template selection, drafts and delete confirmations.

## Family packing templates session protection

Family packing templates could show an earlier manager list after access changed. Expanded rows, unfinished inputs and delete confirmations could survive an access change. Late creation, save and delete replies could surface in a different Family, and pressing Enter twice during creation could send a second write. Seven Admin route fixtures reproduced these issues.

Commit `f1d921fd5` scopes packing-template reads, drafts and write feedback to current Family access. A context change clears expanded rows, pending inputs and delete confirmation. A pending write blocks repeat submission in its own scope. Current-scope saves and deletes still use the existing Family and template IDs and item payload under Strict Mode. A write already sent can still complete under the existing database rules.

All 8 new route cases, 148 focused tests and 5,307 combined client tests across 193 suites pass. All 3 packing-template adapter tests and the client typecheck pass. Formatting, scoped lint, other quality checks and four source guards pass. Both builds retain the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit Family member administration across access changes. Start with late member, access-request and statistics reads, then trace actions that use those results.

## Family member administration session protection

The Family Users page could keep an old roster, access requests and an open member editor after access changed. A late approval retriggered reads for the departed Family. Separate fixtures showed a role change could start a display-name write after leaving the session, and a pending invitation or person update could start a second write under the new session.

Commit `e1395dea3` checks the original Family session before applying roster, request and statistics responses. The page clears selections and drafts when the access context changes. Member actions stop publishing results or starting later writes after session departure. Global reviewers can still load and review requests without a selected Family. A step already sent can complete under existing server permissions.

All 10 new route and adapter cases, 158 focused tests and 5,317 combined client tests across 193 suites pass. Typecheck, formatting, scoped lint, existing quality checks and four source guards pass. Both builds retain the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Audit Family data exports across access changes. Verify the job list, request refresh and download behavior when sessions change while a response is pending.

## Family data export session protection

A late list could restore export controls for a departed Family. A late request acknowledgement could trigger another read and success notice after access changed. A delayed signed link could start a file fetch, and a file already being fetched could reach the browser after access changed. Overlapping polls could also replace newer job status with an earlier response.

Commit `501789314` keeps the latest successful export job list in the original Family access scope. It checks the selected job and grant before signing, before fetching and again before giving the file to the browser. A current poll that withdraws the grant blocks delivery. The request acknowledgement is reported only in its active context. A request already accepted by the server may still queue its export.

All 7 new route cases, 185 focused tests, 5 export adapter tests and 5,344 combined client tests across 196 suites pass. Typecheck, formatting, scoped lint, existing quality checks and four source guards pass. Both builds retain the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan reports 1,260 lines across 60 files on both revisions.

**Next.** Return to the open duplication gate. Compare the packing item and bag terminal-validation contracts and their callers. Share only equivalent validation, after proving valid payloads and refusal behavior for both flows.

## Shared packing terminal proof validation

Packing restore and bag-command recovery both validate the same three terminal statuses. Their validators duplicated strict field, cancellation timestamp and redaction checks. They differ in proof kind, allowed protocols and allowed actions.

Commit `731ba2389` uses one strict schema builder for both contracts. Each contract supplies its existing kind, protocol and actions. The request arguments and digest inputs remain owned by their original contracts.

A disposable fixture compared 1,792 validation outcomes across 7 operation types, including parsed fields, refusal details and cross-contract rejection. Both revisions produced identical output and request arguments. All 336 focused transport and settlement tests pass on both revisions, and all 5,545 combined client tests across 198 suites pass. Typecheck, formatting, scoped lint and four source guards pass. Both builds retain the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 1,260 lines across 60 files to 1,198 lines across 58 files. Both proof validators cleared their findings. The remaining duplication gate stays open.

**Next.** Compare the duplicated error mapping in packing bag, category aggregate and restore recovery transports. Preserve each transport's mapped status, error code and unrecognized-error behavior before sharing any code.

## Shared packing RPC refusal mapping

Bag, category aggregate, restore recovery and bag-command recovery transports carried the same 11 server-code-to-status mappings. Each used its own refusal code and message. Commit `5acf81b9d` moves the shared status lookup into one module and retains the original refusal code, message and unmapped rejection behavior at each caller.

A disposable fixture compared all 264 results across 8 operations. It verified the same RPC names and arguments, 152 mapped refusals, and 112 original errors forwarded by reference or value. It covered numeric and inherited codes, uncoded errors and keys inherited from ordinary objects. All 885 focused tests pass on both revisions, and 5,902 combined client tests across 202 suites pass. Typecheck, formatting, scoped lint and four source guards pass.

Both builds emit the same number of JavaScript chunks. The shared mapping is the only added module in the candidate build. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 1,198 lines across 58 files to 1,136 lines across 55 files. The remaining duplication gate stays open.

**Next.** Compare error handling in the older category and group transports. Their table entries differ, and group lookup lacks an own-key check. Reproduce and repair any incorrect fallback before sharing equivalent behavior.

## Packing category and group refusal handling

The older packing group transport interpreted some unrecognized RPC errors as known refusals and returned an undefined status. Three regression cases reproduced this on the original implementation.

Commit `4b8db1353` uses the shared packing RPC lookup for both category and group transports. Category retains its unsupported-request response. Group passes unrecognized errors back to the caller, including the unsupported response it previously left unmapped. Each existing recognized error retains its status, operation-specific code and message.

The before-and-after comparison covered 140 category and group cases. It changed exactly 6 outcomes across command execution and receipt lookup. The previous four transports matched all 264 outcomes, including exact RPC arguments and original error identity. All 562 focused tests and 6,036 combined client tests across 206 suites pass. Typecheck, formatting, scoped lint and four source guards pass.

Both builds emit the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 1,136 lines across 55 files to 1,102 lines across 53 files. The remaining duplication gate stays open.

**Next.** Compare the duplicated planner arrangement and edit recovery inspections. Verify their queued-row selection, session checks and visible recovery behavior before sharing code.

## Shared planner original recovery inspection

Planner arrangement and edit recovery performed the same retained-row selection and lifetime checks. Commit `aeb08b007` shares those checks in the original planner session module. The shared inspection filters the account queue to rows that can affect the active Trip, requires exactly one candidate and verifies the original account and visibility before offering recovery. Each caller supplies its packet parser, row-matching rule and Check and Retry behavior.

The before-and-after fixture matched all 48 scenarios for arrangement, saved-place edit and selected-visit edit. It compared the order of the session and visibility checks, refusal details, the original row captured for recovery and its use by Check and Retry. All 339 focused tests pass on both revisions, and all 6,071 combined client tests across 207 suites pass. Typecheck, formatting, scoped lint and four source guards pass.

Both builds emit the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 1,102 lines across 53 files to 1,078 lines across 51 files. Both recovery inspection findings cleared. The remaining duplication gate stays open.

**Next.** Compare the import and stay action session guards. Verify whether the common promise and callback checks can be shared while preserving the import account boundary and the stay Trip, day and view lifetime checks.

## Shared import and stay action checks

Commit `a423c170d` shares the completion and follow-up checks used by import and stay actions. Imports use the writable account capture. Stay actions use the Trip read capture and their existing day and view lifetime. Both still verify their original session before starting an action and before accepting its result or error.

All 23 before-and-after scenarios matched. They covered late successes and errors, the original error on a current action, effects blocked after retirement, account changes, Trip and day changes, view unmount and read-only entry. All 184 focused tests passed on both revisions, and all 6,196 combined client tests across 214 suites pass. Typecheck, formatting, scoped lint and four source guards pass.

Both builds emit the same module set. All 13 stylesheets and both map SDK payloads match exactly. Both builds validate 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 1,078 lines across 51 files to 1,026 lines across 49 files. Both action guard findings cleared. The remaining duplication gate stays open.

**Next.** Compare native and Family browser-language detection using their current supported languages. Verify preference order, case matching, regional fallbacks and the Brazilian Portuguese alias before sharing the detector.

## Native and Family browser-language detection

At `0f578e8fa`, native TREK detects 28 supported languages and the Family interface detects 23. Native TREK also offers Estonian, Slovak, Azerbaijani, Hebrew and Thai. If the browser prefers Thai and then Spanish, native TREK selects Thai and Family selects Spanish. The Family translation provider registers loaders for its own list.

The fixture exercised both public detection functions and their language lists. All 84 shared behavior cases matched, covering preference order, case, regional fallbacks, Traditional Chinese, Brazilian Portuguese and missing browser settings. All 15 cases for the five additional native languages produced the expected interface-specific results. The inventory check and 67 existing translation and settings tests passed, for 167 checks total.

Keep each detector coupled to its own language list. Reusing the native detector directly would change which language Family login selects. A shared matcher would need to accept both lists explicitly and require a scoped change to TREK's protected startup module. This audit records the result in release documentation. The duplication scan still reports 1,026 copied lines across 49 files.

**Next.** Compare the session checks used by saved-place and scheduled-visit forms. Verify their request dispatch, abort timing, original account and identity registry checks, and form-specific status and messages before sharing code.

## Shared saved-place and scheduled-visit form session checks

Commit `ab5cf94eb` shares the original user, Family, person and identity registry checks at the existing saved-place and scheduled-visit form boundaries. Both routes retain their own request validation, stale-session errors and save and readback contracts.

The original version missed an abort during the asynchronous identity lookup. The shared check now tests cancellation before and after that lookup. A canceled saved-place request stops before the save. A scheduled-visit save that already committed retains the original operation and skips cache invalidation and editor readback after cancellation. Two regression cases reproduced these effects on the earlier version and pass after the repair.

All 164 focused tests and 6,248 combined client tests across 216 suites pass. Typecheck, formatting, scoped lint and four source guards pass. The local build retained the previous module and style inventory and both map SDK chunk names. The artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 1,026 lines across 49 files to 1,002 lines across 47 files. Both form session findings cleared. The remaining duplication gate stays open.

**Next.** Compare the task and packing planner read session checks. Verify when each captures its scope, how it handles cancellation or loss of access, and when it may return a read result.

## Shared task and packing planner read session checks

Commit `3b124a10f` shares the checks for the original browser session, Family account and person, Trip revision, itinerary layer and identity registry. Task and packing retain their own refusal codes, local-work protections and read contracts. Packing keeps its Trip header check and separate list, category, bag, Trash and receipt paths.

The original readers could issue another request when cancellation arrived during an awaited queue check or a preceding category fetch. Four regressions reproduced unnecessary task, packing list, bag and traveler requests. Both readers now recheck the original scope before those requests. Existing tests also verify retirement after account, Family, person, source, layer and Trip changes, along with local queue and cache protections.

All 263 focused tests and 6,417 combined client tests across 222 suites pass. Typecheck, formatting and four source guards pass. Scoped ESLint found the same pre-existing parameter-count warning on the packing reader. The local build retained the previous module and stylesheet inventory and both map SDK chunk names. The artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 1,002 lines across 47 files to 964 lines across 45 files. Both planner read findings cleared. The remaining duplication gate stays open.

**Next.** Compare how native and atomic stay transports handle backend refusals. Verify each transport's status, error code, message and handling of unknown errors before sharing the mapping.

## Shared lodging request refusal mapping

Commit `d35b0320b` shares one status mapping across the native, atomic stay-and-booking and older lodging request adapters. Each keeps its existing Family error code and message. Unrecognized errors are passed to the caller as the original thrown value. The shared mapping keeps Family's service-unavailable response for `PGRST202`, which PostgREST uses for a function missing from the schema cache or a stale function signature. [PostgREST error reference](https://docs.postgrest.org/en/stable/references/errors.html)

All 352 outcomes matched across 16 tested request calls before and after the change. The comparison checked exact request names and arguments, mapped status and messages, synchronous throws and asynchronous rejections, and identity for unrecognized errors. All 337 focused tests pass on both versions. All 6,732 combined client tests across 232 suites pass.

Typecheck, formatting, scoped lint and four source guards pass. The local build retained the same module and stylesheet inventory and both map SDK chunk names. The artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 964 lines across 45 files to 918 lines across 43 files. Both lodging adapter findings cleared. The remaining duplication gate stays open.

**Next.** Compare the original stay command session checks. Verify same-account recovery after a fresh sign-in, original-session requirements for writes, and the separate visibility checks for opening a stay from a saved Trip.

## Shared lodging command session checks

Commit `d235684b9` shares the original sign-in and Family actor checks across existing stay edits, native lodging commands, and atomic stay-and-booking changes. The check compares the Supabase session identifier and the Family user and person before dispatch. Submitting a retained command still requires the original sign-in. A new recovery controller can inspect or cancel the exact queued command after a fresh sign-in by the same actor. Each command keeps its own Trip visibility rules, including opening native recovery before the Trip is loaded.

All 64 before-and-after checks matched across four paths. They covered the original sign-in, fresh sign-in, changes to an already accepted recovery session, Family actor mismatches, different sources and Trips, a view closing during either asynchronous check, and preservation of provider errors. All 274 focused tests passed on each revision. All 6,778 combined client tests across 234 suites pass.

Typecheck, formatting, scoped lint and four source guards pass. The local build adds the shared check to the previous module set and retains the same stylesheet and map SDK assets. The artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 918 lines across 43 files to 870 lines across 41 files. Both lodging session findings cleared. The remaining duplication gate stays open.

**Next.** Compare packing item and retained packing command recovery. Verify how the two paths hold the queue lock, validate the retained row, and acknowledge redacted or complete receipts before sharing code.

## Exact queue settlement for packing commands

Commit `5d2a2db9d` routes item commands through the existing retained packing session. Retention supplies the queue row from its transaction. Receipt inspection supplies the row from the same read that validates it and checks dependency protection. Acknowledgement and refusal parking compare that row against the current entry under the existing queue lock and transaction. Both paths keep their original action, operation ID and receipt validation. The item compatibility session is exercised by tests. The website build includes the shared retained session and queue helpers.

The older item session could delete a row with changed metadata after a save or commitment receipt, or overwrite its metadata after a conflict. Four cases reproduce the older behavior and pass on the new session. They cover a successful save, a conflict, and visible and redacted commitment receipts. Each leaves the newer entry intact, so another recovery attempt can inspect the current row.

All 712 focused tests and 6,815 combined client tests across 235 suites pass. Typecheck, formatting, scoped lint and four source guards pass. The local build retained the same module, stylesheet and map SDK inventory. The artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 870 lines across 41 files to 818 lines across 39 files. Both packing session findings cleared. The remaining duplication gate stays open.

**Next.** Audit the native packing save and archive retry paths that still read the queue row again after retaining it. Verify how they can use the transaction's returned row while preserving their permission checks, acknowledgement and refresh behavior.

## Original queue snapshots for native packing saves and archive replacements

Commit `af9f740f5` uses the queue row returned by retention as the original snapshot for native packing saves and archive replacements. Before dispatch, both compare the current row with that snapshot using the existing packing dependency encoder, which distinguishes present undefined fields and negative zero. Both paths keep their existing queue lease, request body, acknowledgement and readback behavior. A missing or changed queue entry stops dispatch and preserves the latest local state.

Four new regressions reproduce the older behavior for a native save and item, bag and category-batch archive replacements. The old flow adopted a changed row and sent the command. On the new flow, those four calls stop before transport. Four additional removal cases preserve the original refusal when the row disappears after retention. The tests also verify that a newer entry, the archive and the visible native packing list survive these refusals.

All 824 focused tests and 6,861 combined client tests across 236 suites pass. Typecheck, formatting and four source guards pass. Scoped lint found zero errors and the same 14 existing warnings. The local build retained the same module, stylesheet and map SDK inventory. The artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan reports 818 copied lines across 39 files. The duplication gate stays open.

**Next.** Compare how packing and lodging retain an original when another command is queued for the same Trip. Cover numeric and canonical Trip IDs, existing command identity, the packing archive gate, and the error each workflow returns.

## Shared competing Trip queue checks for packing and lodging

Commit `7948a6af9` checks for competing Trip work in the same local transaction that keeps the original packing or lodging command. Both use the established planner Trip selector and row factory. The selector matches the stored native Trip ID or the route's canonical UUID or native ID. Unattributed entries and unsupported routing block admission until the queue owner can resolve them. Each workflow keeps its own original-body validation, refusal codes, and protection for a pending packing archive.

The old flow admitted a second command in eight fixture cases. They covered direct canonical routes, numeric routes, and unattributed work across both domains. In two more cases, malformed routing caused an ordinary exception. All ten now return the appropriate competing-work refusal and preserve the existing row. Tests also verify exact retries, a similar numeric ID for a different Trip, same-Trip archive holds and unrelated archival work.

All 315 focused tests and 6,881 combined client tests across 237 suites pass. Typecheck, formatting, scoped lint and four source guards pass. The build adds the shared retention module and keeps its stylesheet and map SDK inventory. Artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 818 lines across 39 files to 788 lines across 37 files. Both queue retention findings cleared. The remaining duplication gate stays open.

**Next.** Compare Trip matching when a lodging save prepares its post-save refresh and when the planner checks for queued work during a read. Verify what happens if matching local work arrives while the response or refresh is pending.

## Queued Trip work during lodging confirmation and planner reads

Commit `d0533d8ef` uses the same Trip selector in the lodging confirmation and planner read checks. If a queued edit targets the current Trip through a direct UUID or numeric URL, the lodging session now recognizes it even when the stored numeric queue field refers to a different Trip.

The two reproduced lodging cases keep both queue records and report the existing session-changed result with one create call. The planner tests confirm that both direct routes stop a pending read from publishing after a matching edit arrives. Existing exact-row, session and import checks still apply.

All 255 focused tests and 6,885 combined client tests across 237 suites pass. Typecheck, formatting, scoped lint and four source guards pass. The build keeps the same module, stylesheet and map SDK inventories. Artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan found 788 lines across 37 files, matching the previous checkpoint. The duplication gate stays open.

**Next.** Review the duplicated validation of isolated HTTPS writer profiles. Keep each profile's identity and origin pin and verify both profiles with their existing boundary tests.

## Shared HTTPS writer-profile validation

Commit `d16703f0a` gives the isolated task and planner/base-packing HTTPS writer profiles one validator. Each profile still reads its own policy. The shared function checks the selected profile, the Supabase data plane, the exact HTTPS origin pin and the absence of advanced qualification flags.

Four new contract tests pass before and after the refactor. They confirm that selecting either profile excludes the other, and that a different origin, different data plane or advanced qualification flag leaves the profile disabled. The existing native and SDK boundary tests cover the permitted commands for each profile.

All 163 focused tests and 6,973 combined client tests across 244 suites pass. Typecheck, formatting, scoped lint and four source guards pass. Both isolated build configurations pass artifact checks with 505 precache entries and 313 Brotli payloads each. The stylesheet and map SDK files have the same names as the preceding planner/base-packing build.

The duplication scan falls from 788 lines across 37 files to 766 lines across 35 files. Both writer-profile findings cleared. The duplication gate stays open.

**Next.** Compare the native and legacy booking type helpers. Check icons, visible labels, color choices and the fallback for unknown booking types before sharing any logic.

## Shared booking type presentation

Commit `7ddaea05b` uses the native booking type catalog from both views. All 17 supported types keep their icons, labels and colors, including the short Transit chip label. The existing phone color maps continue to come from the native model.

Three unsupported string values previously produced a missing icon because the lookup also recognized inherited object properties. Both views now use the existing Other icon, label, chip and color. The regression tests verify these results as well as the ordinary unknown-type fallback.

All 501 focused tests and 7,367 combined client tests across 267 suites pass. Typecheck, formatting, scoped lint and four source guards pass. The native model retains its three existing lint warnings. The local build keeps the same module inventory, stylesheet names and map SDK files. Artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 766 lines across 35 files to 734 lines across 33 files. Both booking type findings cleared. The duplication gate stays open.

**Next.** Compare the native and legacy multipart upload helpers. Preserve the request timeout, form boundaries, progress and cancellation behavior, and the results returned by each client.

## Legacy multipart upload dispatch

Commit `091da5752` uses the native upload options type and Axios multipart dispatch on the legacy client. Both clients retain their own interceptors and public upload entry points. The legacy helper keeps the zero upload timeout and forwards the original idempotency key, progress callback and abort signal.

Eight shared contract cases passed before and after. They exercise the installed browser adapter with a stubbed send, verify that the original FormData reaches it without a fixed Content-Type header, and cover cancellation in flight and HTTP errors. The adapter assertions also verify the original progress callback and response data object.

All 198 focused tests and 7,547 combined client tests across 274 suites pass. Typecheck, formatting, scoped lint and four source guards pass. The targeted legacy lint check reports the same 5 warnings before and after. The native API client matches the pinned upstream file. The local build retains the same module inventory, stylesheet names and map SDK files. Artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 734 lines across 33 files to 697 lines across 31 files. Both multipart findings cleared. The duplication gate stays open.

**Next.** Compare the helpers that expand flight and train segments into itinerary rows. Check saved leg position, overnight and multi-day inclusion, date and time fallbacks, and train-specific metadata.

## Shared itinerary transport leg projection

Commit `e790d49bf` uses one flight and train leg projection for native and legacy itinerary rows. Each timeline retains its existing day selection and ordering rules. Tests cover overnight and multi-day inclusion, original leg positions and indexes, dates and bare local times, double-encoded metadata, and train-only details.

Both paths previously threw on a null segment and drew an extra row for a string or array segment. Both now show the original booking on its scheduled days if its segment array contains unusable entries. The timeline leaves the stored booking and metadata untouched so the original itinerary can still be recovered.

All 373 focused tests and 7,796 combined client tests across 282 suites pass. Typecheck, formatting, scoped lint and four source guards pass. The explicit lint check of both helpers reports 30 warnings, down from 36. The first combined run timed out in the admin navigation test while the page was loading. The isolated admin suite then passed all 92 cases and the combined rerun passed. The local build retains the same module inventory, stylesheet names and map SDK files. Artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 697 lines across 31 files to 653 lines across 29 files. Both itinerary helper findings cleared. The duplication gate stays open.

**Next.** Review the booking-detail helpers that decode stored flight and train metadata separately. Check their malformed-list handling, segment indexes, confirmation references and single-leg fallback.

## Defensive booking segment reads

Commit `d71414d41` shares validation of stored flight and train segment entries across the booking readers and itinerary. Booking details fall back to the existing booking-level route and fields if the segment list contains an unusable entry. Complete lists preserve their order, and the native views preserve each segment's confirmation reference. Legacy renderers keep their existing fields.

Six reproduced cases cover null, numeric and array entries in stored flight and train segment lists. Booking search skips unusable entries individually, so an intact segment reference is still searchable alongside the booking reference. The tests also verify that display and search leave the original metadata intact.

All 368 focused tests and 7,883 combined client tests across 286 suites pass. Typecheck, formatting, scoped lint and four source guards pass. The explicit lint check reports 25 warnings, down from 31. The local build retains the same module inventory, stylesheet names and map SDK files. Artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication report remains at 653 lines across 29 files. The duplication gate stays open.

**Next.** Compare native and legacy browser language detection. Verify full locale and base-language matching, ordered preferences, unsupported-language fallback and behavior when the browser language data is unavailable.

## Shared browser language matching

Commit `d71d2eb4b` gives native and legacy browser language detection one matcher while each public entry point supplies its own supported catalog. Browser preferences keep their original order. Exact regional matches, base-language fallback, the Brazilian Portuguese alias, and the absence of a match behave as before.

Fourteen regression cases pass before and after. Estonian, Slovak, Azerbaijani, Hebrew and Thai can be selected natively. The legacy detector continues to the next supported preference because it lacks those five locales. The tests also cover empty and missing browser preference data and a missing navigator.

All 201 focused tests and 8,084 combined client tests across 293 suites pass. Typecheck, formatting, scoped lint and four source guards pass. Explicit legacy lint reports 6 warnings, compared with 6 before the change. The local build adds the shared matcher and keeps the existing stylesheet names and map SDK files. Artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 653 lines across 29 files to 601 lines across 28 files. Shared locale loader entries are still flagged.

**Next.** Compare the duplicated translation loader definitions and check package ownership, language coverage, lazy loading and fallback before deciding whether a shared definition is appropriate.

## Shared Family translation loaders and fallback

Commit `b24ef54eb` moves the identical Family locale loaders into a shared module. The native TREK table and Family table still own their original packages and defer the same 27 and 22 non-English imports. English remains available at startup.

Three reproduced cases now pass. Family-only labels use English when the displayed TREK language lacks Family translations. A failed legacy download keeps the last available translations and records the failed download. Both providers ignore unsupported loader keys. A later selection can load successfully.

All 204 focused tests and 8,093 combined client tests across 295 suites pass. Typecheck, formatting, scoped lint and four source guards pass. Legacy lint still reports 6 warnings. One warning for the intentional console error replaces the warning for the unhandled promise. The local build adds the shared Family loader module and retains the existing chunk count, stylesheet names and map SDK files. Artifact checks verified 505 precache entries and 313 Brotli payloads.

The duplication scan falls from 601 lines across 28 files to 551 lines across 26 files. Both translation loader findings cleared.

**Next.** Compare the native and legacy day timeline row helpers. Verify booking-linked rows, time display, and existing navigation behavior before sharing any presentation logic.

## Unused legacy planner row helper retirement

Commit `a954de596` retires the old legacy planner row helper. The former file had no callers in the repository or in the generated module graph. The active TREK planner helper stays byte-for-byte at its upstream version.

All 534 focused tests passed before and after removal. They cover planner buttons and menus, day headers, booking-linked rows, time badges, and timeline navigation. All 8,584 combined client tests across 302 suites pass. Typecheck, formatting and four source guards pass.

The before-and-after build graphs match exactly. The two builds have 3,778 identical files, including all JavaScript and CSS and the verified 313 Brotli payloads. Only the recorded source commit differs in the build receipt. Both builds verify 505 precache entries.

The duplication scan falls from 551 lines across 26 files to 500 lines across 24 files. Both planner helper findings cleared.

**Next.** Compare the native and legacy context menu actions. Verify disabled items, pointer and keyboard activation, menu cleanup and focus restoration before sharing any logic.

## Unused legacy context menu retirement

Commit `aeef40d1d` removes the unused legacy context menu. The file had no consumers in the repository or in the built module graph. The active TREK desktop context menu and its phone counterpart remain in the same application chunks.

All 426 focused tests passed before and after removal. Dedicated context menu suites verify pointer actions, disabled items, keyboard focus and Escape capture, outside dismissal, and scroll and resize cleanup. The planner and cost-table tests cover active consumers. All 8,707 combined client tests across 308 suites pass. Typecheck, formatting and four source guards pass.

The builds have 3,778 byte-identical files and identical module graphs. Only the source commit changes in the build receipt. Both builds verify 505 precache entries and 313 Brotli payloads. The active desktop context menu still matches the upstream TREK version.

The duplication scan falls from 500 lines across 24 files to 467 lines across 22 files. Both context menu findings cleared.

**Next.** Trace the native and legacy plugin frames and compare their sandbox, lifecycle and bridge behavior before considering any consolidation.

## Unreachable legacy plugin frame retirement

Commit `f36377ec3` removes the unreachable legacy plugin frame and its three callers, the legacy plugin page, widgets, and contributions. The active TREK plugin page, frame, widgets, contributions, and trip-card badges all remain in the same application chunks.

All 298 focused tests passed before and after removal. The dedicated plugin suites exercise iframe sandbox configuration, connection and message handling, cleanup, trip-card badges, widgets, and contributions. The caller tests cover planner, dashboard, settings, and trip views. All 8,991 combined client tests across 316 suites pass. Typecheck, formatting and four source guards pass.

The builds have 3,778 byte-identical files and identical module graphs. Only the source commit changes in the build receipt. Both builds verify 505 precache entries and 313 Brotli payloads. The active plugin frame still matches the upstream TREK source.

The duplication scan falls from 467 lines across 22 files to 424 lines across 20 files. Both plugin frame findings cleared.

**Next.** Trace the trip subscription link controls and compare their visibility, copy actions, and handling of trip changes before considering any consolidation.

## Calendar subscription scope and copy controls

Commit `fded9885d` binds dialog state to the account and feed endpoint for native TREK, and to the account, family and person for Family. A scope change starts a fresh read, clears the old link immediately and isolates any pending response from the new dialog. Both views use the same clipboard action and copy button. Each retains its labels, font sizes, layout and Google, Apple and Outlook handoffs.

The regression tests cover a failed read after a trip switch, delayed reads and rotations, clipboard feedback after a link changes, and temporary clipboard field cleanup. All 226 focused client tests and 12 Family backend calendar adapter tests pass. All 9,127 combined client tests across 322 suites pass. The local build, typecheck, formatting and four source guards pass. The build verifies 506 precache entries and 313 Brotli payloads. The additional precache entry is the chunk shared by consumers of the existing clipboard utility.

The duplication scan falls from 424 lines across 20 files to 390 lines across 18 files. Both subscription link findings clear.

**Next.** Compare subscription availability in the phone dashboard and export sheet with their desktop counterparts. The phone dashboard opens the native Nest all-trips feed regardless of data plane, while desktop picks the Family adapter when Family is active. The phone trip export sheet checks share permission, and desktop additionally checks that the Nest route is available. Verify both phone entry points before adjusting availability. [Phone dashboard](../../../client/src/mobile/screens/dashboard/MDashboard.tsx), [Phone export](../../../client/src/mobile/screens/trip/sheets/MExportSheet.tsx), [Desktop dashboard](../../../client/src/pages/DashboardPage.tsx), [Desktop export](../../../client/src/components/Planner/TripExportModal.tsx).

## Phone and desktop calendar subscription availability

Commit `9dd49af48` gives the phone and desktop dashboard the same all-trips subscription selection. A ready Family account uses the existing Family calendar adapter with its family and person identifiers. A signed-in TREK account uses the native all-trips feed. The action is hidden when the relevant profile is unavailable, and a profile change closes the open dialog until it is requested again.

The phone export sheet uses the same backend and share-management gate as desktop for the per-trip subscription. Family accounts can still download the calendar file from this sheet. The native per-trip dialog closes when the trip or sheet changes. Existing labels, icons and positions are retained where the controls are available.

All 278 focused client tests and 12 Family backend calendar adapter tests pass. All 9,212 combined client tests across 324 suites pass. The source-bound local build, typecheck, formatting and source guards pass. Verification checked 506 precache entries and 313 Brotli payloads. This packet used local fixtures for calendar endpoints.

The duplication scan reports the same 390 lines across 18 files as the preceding checkpoint.

**Next.** Trace both system notice stores from their authentication callers. Compare fetch, dismissal and reset behavior before sharing any duplicated logic. [Native store](../../../client/src/store/systemNoticeStore.ts), [Family store](../../../client/src/integrations/family/legacy/store/systemNoticeStore.ts).

## Shared system notice lifecycle

Commit `15e1c1376` shares fetch, reset and dismissal logic across the native and Family notice stores. They keep separate state, serializers and transports. TREK still requests release notices using the current UI version and supported layout. The Family compatibility store retains the plain Nest read and its loaded, empty feed on Supabase.

Reset now discards results from older reads and cancels pending dismissal retries. Native sign-out resets notices before waiting for its sync queue. Native account changes and definitive session expiry also clear the notice state. A silent account replacement starts a fresh read for the new account. The retained password and MFA sign-in flows use the same notice reset and sign-in completion. Dismissal still immediately removes the notice and retries a failed write once while the original store state is current.

All 268 focused tests passed, including both store paths, the mounted notice UI, unauthorized session handling, a silent account change and sign-out during a queued retry. All 9,384 combined client tests across 336 suites passed. The local build, scoped lint, typecheck, formatting and source guards passed. The build verified 506 precache entries and 313 Brotli payloads.

The duplication scan fell from 390 lines across 18 files to 354 lines across 16 files. Both notice-store findings cleared.

**Next.** Trace the legacy Atlas country search and check the native keyboard, selection and empty-state behavior before changing the legacy copy. [Native search](../../../client/src/pages/atlas/AtlasCountrySearch.tsx), [Legacy search](../../../client/src/integrations/family/legacy/pages/atlas/AtlasCountrySearch.tsx).

## Atlas country search cleanup and query handling

Commit `3ac7ef5e5` removes the copied Atlas country search after tracing source imports and checking the emitted module graph. Desktop uses the current Atlas search with country and place results. The phone continues to use its own country search, and its module is present in both builds.

Enter now selects only visible results. Refocusing a place-only list opens it again. Typing or clearing retires the old place search, and selecting a country retires a pending place lookup so it cannot replace the newer choice. Country matches still appear before place matches. The dropdown retains its existing appearance and settled empty behavior.

All 236 focused desktop and phone Atlas tests passed, including keyboard selection, the clear button, and delayed place requests. All 9,489 combined client tests across 341 suites passed. Typecheck, scoped lint, formatting and source guards passed. The local build verified 506 precache entries and 313 Brotli payloads.

The duplication scan fell from 354 lines across 16 files to 315 lines across 14 files. Both Atlas country search findings cleared.

**Next.** Trace the native and legacy join-trip pages, including how the active route handles invite tokens and auth transitions, before changing the copy. [Native join page](../../../client/src/pages/JoinTripPage.tsx), [Legacy join page](../../../client/src/integrations/family/legacy/pages/JoinTripPage.tsx).

## Trip invite lifecycle and legacy cleanup

Commit `e26fff513` removes the disconnected legacy join-trip page and its private hook. The application still mounts the native page behind sign-in, with the invite as the return destination for a signed-out visitor. The current page layout and route stay in the build.

The active hook clears the preview when the invite or account changes, admits one acceptance at a time and discards old responses after cancel, unmount or account replacement. The current invite still distinguishes a removed member, an expired link and an acceptance failure the user can retry. The Family adapter currently has no invite redemption API. This repair exercises the existing TREK invite path using local response fixtures.

All 218 focused tests passed, including the protected route, sign-in, duplicate clicks and late previews and acceptances. All 9,593 combined client tests across 346 suites passed. The local build, typecheck, scoped lint, formatting and source guards passed. The build verified 506 precache entries and 313 Brotli payloads.

The duplication scan fell from 315 lines across 14 files to 288 lines across 12 files. Both join-page findings cleared.

The repository-wide ESLint check found four warning categories above the baseline and eight entries that exceed the current counts. The affected invite files and their callers add zero warnings. Scoped comparison shows one fewer state-in-effect warning in the controller and one fewer floating-promise warning in the hook tests. The four excess categories are source complexity (222 against 218), source function length (131 against 130), test non-null assertions (1,912 against 1,910) and test promise callbacks (25 against 22). [Client lint baseline](../../../client/scripts/eslint-baseline.json), [Client CI workflow](../../../.github/workflows/test.yml).

**Next.** Trace the four excess ESLint categories against the last accepted baseline and correct the source or test cases that raised the counts. Recalculate the stale entries after those repairs. Review native and Family theme defaults after this check passes.

## Client ESLint release gate verification

Commit `f01cc72c9` resolves the four categories that exceeded the client ESLint baseline. Transport duration separates date completion from elapsed-time calculation. Map projection shares the existing resolved MapLibre style, file upload names its existing attachment test, and Settings renders the same version footer through one function. The actor transition groups the existing store resets in their original order.

The booking panel now declares that its removal callback may return a promise. Its focus handler already waits for it. The admin tests validate their fixtures directly and explicitly handle an absent configuration promise.

The full client ESLint run linted 5,141 files with zero errors. The release comparison passed with 3,391 source warnings, 2,858 test warnings and 83 suppressions. The comparison ran against the exact measurements twice, first to lower the stale entries and again to verify the resulting baseline. Every baseline edit lowers an allowance.

- src `@typescript-eslint/no-explicit-any` from 143 to 138.
- src `@typescript-eslint/no-floating-promises` from 149 to 147.
- src `@typescript-eslint/no-misused-promises` from 843 to 831.
- src `react-hooks/exhaustive-deps` from 114 to 111.
- src `react-hooks/refs` from 550 to 549.
- src `react-hooks/set-state-in-effect` from 184 to 181.
- src `trek/no-swallowed-catch` from 123 to 122.
- tests `@typescript-eslint/no-floating-promises` from 12 to 11.

All 9,687 checks in the combined client regression run passed across 351 test files. Typecheck, formatting, focused source checks and source-bound build passed. The native presentation guard passed. The build verified 506 precache entries and 313 Brotli payloads.

The duplication gate still reports 288 copied lines across 12 files. The next packet is reviewing the duplicated native and Family defaults in the two theme scheme modules.

## Unused Family theme registry removal

Commit `3042e3718` removes the Family copy of the theme picker registry. The desktop and phone appearance pickers both import the native registry. No application, test or tool imported the old module, and it was absent from both build graphs. The qualification update removes its source-inventory entry. The native swatch order, colors, custom-accent presets, theme stylesheet and boot code retain their existing source and output. [Desktop picker](../../../client/src/components/Settings/AppearanceSettingsTab.tsx), [phone picker](../../../client/src/mobile/screens/settings/MSettingsAppearance.tsx), [registry](../../../client/src/theme/schemes.ts).

All 107 focused appearance and theme cases match the previous results. The combined run passed 9,781 cases across 356 test files. Typecheck, formatting, theme and translation checks and the four source guards passed. ESLint's config already excludes the retired path, and the warning baseline had no edits.

The two local builds have the same module and chunk graph across 393 JavaScript chunks. 3,779 files match byte for byte, including CSS, the theme boot script and the offline service worker. The public configuration receipt differs only in the bound source commit. The artifact check accepts the correct commit and rejects a wrong or missing commit.

The full duplication scan dropped from 288 lines across 12 files to 264 across 10 files. The only findings removed are the two sides of the theme registry copy. Next is reviewing the native and Family formatting helpers, including their active callers and locale, date and time behavior.

## Shared native and Family currency formatting

Commit `6b274630e` makes the retained Family module use the native currency locale, precision, money and totals helpers. The existing Family exports remain available. Its date and time functions keep their previous implementations. The Family itinerary PDF still calls its existing date formatter, the only function from the legacy module referenced by a reachable caller in this build. Applying the native meridiem parser to retained Family consumers would change their time output. [Native formatters](../../../client/src/utils/formatters.ts), [Family formatters](../../../client/src/integrations/family/legacy/utils/formatters.ts), [Family itinerary PDF](../../../client/src/integrations/family/legacy/lib/plan/familyPlanPdf.ts).

All 6,905 direct comparisons match before and after. Coverage includes all 47 configured currency locales, zero- and three-decimal currencies, fallback and exchange-rate behavior, day totals, date labels across time zones, and meridiem input. All 199 focused tests passed within 9,958 combined regressions across 364 test files. Typecheck, formatting, layer, RTL and source qualification checks passed.

The local builds have the same module graph and 3,779 byte-identical files. The public configuration receipt records the new source commit. Its artifact check accepts that commit and rejects incorrect or missing bindings.

The full duplication scan dropped from 264 lines across 10 files to 210 across 8 files. Next is reviewing the budget category order shared by Family's optimistic reorder and its realtime updates. Preserve unnamed categories, unspecified categories and ordering on both paths.

## Shared Family budget category ordering

Commit `edea4dfb1` switches the Family optimistic category reorder and realtime category event to the native ordering helper. Its type now accepts either store's rows and its emitted logic is identical. It keeps row identity and within-category order, groups missing and empty categories under “Other”, and appends unlisted categories in their original group order. The Family optimistic save, failure reload and notification, item-level reorder precedence and realtime IndexedDB write-through preserve their behavior. [Shared helper](../../../client/src/store/slices/budgetOrder.ts).

All 175 before-and-after transitions matched using the real slice and event handler with local network and cache fixtures. The regression run passed 113 focused cases and 10,071 total cases across 374 test files. Typecheck, scoped ESLint, formatting, layers, RTL and the four source guards passed. The lint diagnostics match the previous result.

The local build retains its 393 JavaScript chunks, 5,835 modules and their chunk dependencies. The existing helper moved from the auth chunk into the settings chunk to serve both callers. All 13 stylesheet files match. Artifact checks accepted the correct source binding and refused an incorrect or missing one.

The duplication scan dropped from 210 lines across 8 files to 177 across 6 files. The next review covers the duplicated trip-loading calls and their independent session and offline-cache boundaries.

## Disconnected Family trip loader removal

Commit `29b08fa96` removes the disconnected `loadTrip` action from the Family compatibility store. No tracked caller invoked it. The website dispatches active trip loading through the native store and its installed Family read port. A source comparison checks all 36 kept store properties and 27 type members, including the reconnect refresh. The native loader, its account and trip guards and its offline readers retain their existing code. [Native trip store](../../../client/src/store/tripStore.ts), [Family compatibility store](../../../client/src/integrations/family/legacy/store/tripStore.ts).

All 241 focused tests and 10,092 combined cases across 375 files passed. Coverage includes failure and offline paths, a trip or account changing during a read, and native reads through the Family adapter. Typecheck, formatting, layers and all four source guards passed. The existing ESLint configuration excludes the only changed application file.

The two local builds have the same 393 JavaScript chunks and chunk dependencies, with 13 byte-identical stylesheets. The changed store was the only remaining reference to the old trip repository in this build, so that dependency dropped from its output. The artifact check accepts the correct source commit and rejects an incorrect or missing binding.

The duplication scan fell from 177 lines across 6 files to 149 lines across 4 files. The next review covers the common password and MFA sign-in completion in the native auth store, including the distinct authentication steps and session checks around that code.

## Shared password and MFA sign-in completion

Commit `ee75cae41` shares the synchronous publication of the user and startup of background work between completed password and MFA sign-ins. Each flow still waits for its authentication response and account-scoped offline database setup, then checks the authentication sequence before publishing the user. Password responses that require MFA still return the challenge before those steps. MFA code normalization, flow-specific errors, the password-reset notice restriction and the registration and demo paths preserve their behavior. [Native auth store](../../../client/src/store/authStore.ts), [Family bridge](../../../client/src/integrations/family/applicationHandler.ts), [Supabase TOTP verification](https://supabase.com/docs/guides/auth/auth-mfa/totp).

All 17 direct comparisons matched, including failed requests and storage setup, a pending sign-out barrier, superseded responses and storage opens, and background sync failures. All 299 focused tests passed within 10,092 client regressions across 375 files. Typecheck, formatting, layers, RTL and the four source guards passed.

The full client ESLint check linted 5,141 files with zero errors. The measured counts lowered `@typescript-eslint/no-floating-promises` from 147 to 146 and `no-console` from 88 to 87. Comparing the full result against the lower baseline passes. The bound local build keeps the same chunk dependency graph and byte-identical stylesheets. It accepts the correct source qualification and rejects a missing or incorrect one.

The duplication scan fell from 149 lines across 4 files to 113 across 3 files. Next is reviewing the repeated offline cache upserts. Confirm that each caller retains its choice of database, account scope, transaction and offline queue behavior.

## Shared offline cache bulk writes

Commit `582d92867` shares the implementation of 7 bulk upserts across the native and Family cache modules. Each module supplies its own table lookup, which runs when the write starts. Native writes that accept a captured session database continue to use that explicit argument. The helper awaits the original Dexie write, preserving its completion, rejection and existing transaction behavior. [Shared writer](../../../client/src/db/createBulkUpsert.ts), [Dexie bulk writes](https://dexie.org/docs/Table/Table.bulkPut()).

All 56 before-and-after traces matched. Two isolated IndexedDB cases passed before and after, covering a saved writer across account switches and rollback inside an aborted transaction in both stores. The combined run passed 207 targeted cases and 10,092 total cases across 375 test files. Typecheck, scoped ESLint, formatting, layering, offline policy and the four source guards passed.

The local build keeps 393 JavaScript chunks and the same import graph between them. The new helper sits in the existing platform chunk. All 13 stylesheets match, and the artifact check accepted the correct source binding and refused an incorrect or missing one.

The duplication scan fell from 113 to 89 lines across 3 files. It still flags the seven writer bindings and the table declarations in each database module. Next is comparing those declarations and bindings against the Dexie schema registrations and runtime initialization before deciding what can be shared.

## Shared offline table declarations and writer bindings

Commit `5a34fd862` gives both concrete Dexie stores one definition for their 16 common table fields and one binding for their seven bulk cache writers. Each database supplies its own row types and selects its own table at write time. Both concrete constructor bodies and version registrations match their prior source, including the native owner checks and the order in which the schema is registered. [Common table fields](../../../client/src/db/baseOfflineDb.ts), [bulk writers](../../../client/src/db/createBulkUpsert.ts), [Dexie version registration](https://dexie.org/docs/Dexie/Dexie.version()).

Four isolated IndexedDB cases match before and after. The registered table names, primary keys and indexes matched at native version 14 with 24 tables and Family version 4 with 16 tables. The two database bindings also passed account-switch isolation and transaction rollback. All 207 targeted cases and 10,092 combined tests across 375 files passed. Typecheck, scoped ESLint, formatting, layers, offline policy and source guards passed.

The local build keeps the same 393 JavaScript chunks, dependency graph and 13 stylesheets. The shared table class resides in the existing platform chunk. The artifact check accepted the correct source binding and refused an incorrect or missing one.

Duplication fell from 89 to 22 lines. The remaining finding is the repeated field mapping in Family Journey summary and detail reads. The next review covers title and date defaults, role and owner fields, and the existing signed cover lookup.

## Shared Journey header mapping

Commit `e957ab842` gives the Family Journey list and detail readers one mapping for owner identity, title, subtitle, signed cover, status and timestamps. Each reader keeps its role, trip dates, counts, and other response fields in the same order. This is the active module behind the native Family Journey handler. [Journey adapters](../../../client/src/integrations/family/legacy/data/supabase/journeys.ts)

The 64 before-and-after payload comparisons preserve defaults, civil dates, roles, owner fallback and cover lookup. The 10 paired reader checks cover the exact RPC arguments, signing order and deduplication, URLs missing from the signing response, and Storage or RPC refusal. A missing signed URL stays null. The fixtures use synthetic records and a recording client.

All 10,120 tests across 378 files pass, including 75 focused Journey tests. Typecheck, repository source guards and the duplication check pass. The strict check passes against its existing allowance of 463 with an 8 GiB Node heap. The source-bound local build preserves 393 JavaScript chunks, their import graph and 13 stylesheets. The artifact scan accepts the correct source binding and refuses incorrect and missing bindings.

The repository duplication check now reports zero copied lines across zero files, down from 22. The scanner rules and baselines are identical. Recheck the remaining supported-core gates against the final local candidate. Independent database-plus-files recovery remains required before hosted changes.
