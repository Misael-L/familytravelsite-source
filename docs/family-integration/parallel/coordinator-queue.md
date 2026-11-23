# Coordinator A queue

Read README.md and plan.json first. Work only in `/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4` on `codex/trek-v5.1.4-family-reconcile`. The [status file](coordinator-status.json) records the current state of this queue.

## PA-00 complete

The user approved removing the obsolete Collection sharing exemption. Commit `0ac7acb1f` removes the exact line and both offline-check invocations pass with 145 listed exemptions.

Worker B’s PB-01 test annotation is integrated at `2938ec5ef`. The combined branch passed 13 focused tests and four source checks. The strict diagnostic count fell from 636 to 635.

## PA-01 complete

Commit `50ef4ddfc` validates the stored category strings before observing a named packing group. An empty string and an explicit category named “Other” keep their distinct stored values. If a matching row lacks its stored category, the action stops before opening an observation and asks the user to reopen or recover it. The existing observation still owns the exact selected rows and original operation.

Both new missing-category cases fail on the old code and pass with the repair. All 136 focused tests, formatting, typed lint and four source checks pass. The strict diagnostic count fell from 635 to 634. The local build is bound to `67d4741b2` and passes its artifact scan.

## PA-02 complete

The full duplication scan found 17,619 copied lines in 285 files at `74475c13e`. The [currency catalog review](duplication-currency-review.md) traces both modules to live routes. Its separate patch reduced the two-file fixture from 374 copied lines to zero and preserved the catalogs and fallback behavior. Applying the proposal and running the global checks are separate work.

Worker B completed all three assigned packets. PB-02 and PB-03 are integrated at `4becf2fec` and `74475c13e`. All 77 existing cases across the three worker suites and four source checks pass. The strict check scores 632 diagnostics, two fewer than PA-01. The previous bound build still matches the runtime source.

## Currency catalog consolidation complete

The [currency catalog consolidation](duplication-currency-review.md#implementation-result) shares native currency data with the retained Family module. The full scan found 17,245 copied lines across 283 files. All other duplicate blocks and the 632 strict diagnostics match the previous reports. Both selector menus and the supported Family Admin preference save matched in the before and after browser fixtures. All 142 focused tests and the fixture build passed.

## Native share and invite link typing complete

Commit `2a408a39f` gives the native link state its existing nullable token contract and types the seven known permission keys. The only native caller supplies those seven keys, and the shared schema accepts them as written. TypeScript and Vite produce identical JavaScript before and after. All 222 cases pass in both runs, including account and trip switches, link rotation, permission updates and clipboard ownership.

Strict drops from 632 to 630. The other diagnostics and the full duplication report are identical. The local browser artifact is still bound to the previous build at `012d3bbff`.

## Planner arrangement and Undo dates complete

Commit `000eb8845` uses the existing arrangement date validator when observing a day. A missing or malformed date refuses arrangement before receipt lookup, command dispatch or queue persistence. Undo refuses an invalid date at capture or invocation, and a receipt from an earlier date cannot offer a new Undo for the refreshed day.

All 302 focused tests pass, including the nine added date cases. Eight reproduced the behavior being repaired. The strict count dropped from 630 to 628, and the duplication report is identical. The source-bound planner fixture build at `6517b6962` passes its artifact scan. Validation used the existing in-process planner integration fixtures.

## Native booking edit capture complete

Commit `dab10d7f7` clones the checked original reservation with the form options before any await. The validated clone supplies the observed editor and the post-save lookup. Desktop and phone creation still hit the existing edit-only refusal. The direct regression mutates both the caller’s reservation and the enclosing request while opening, then confirms the original reservation is saved and refreshed.

All 289 focused cases pass before and after. Four cases require the separate disposable HTTP fixture and were skipped in both runs. Strict diagnostics fell from 628 to 627. The full duplication report is identical. The source-bound local build at `046fbf73b` passed artifact verification.

## Planner creation context complete

Commit `7c8e1ae93` captures the original trip, optional day and insertion position when the form opens. The submit path captures its comparison before waiting. A changed context is refused before a queue write or creation RPC. The original form remains saveable. An undated save sends a null day and creates only a place. A day-scoped save sends that day’s stable identity and civil date and creates one visit.

All 413 focused cases pass, including three new cases that reproduced the issue on the original code. Strict diagnostics fell from 627 to 626 and the full duplication report is identical. The source-bound local build at `1213f506c` passes artifact verification.

## Offline trip startup cleanup complete

Commit `f16dd4cda` closes the saved-trip read lease if saved-data preparation, image setup or projection fails. If an image resolver exists, cleanup attempts to dispose it before closing the lease, and a disposal error still closes that lease. The request handler reuses the already prepared saved data. Four failure cases verify cleanup before publication without a network request. Two reproduced a lease left open on the original code.

All 191 focused cases passed, including stored-images and saved-trip read-only behavior. Strict diagnostics fell from 626 to 625 and the full duplication report is identical. The source-bound local build at `ff5d6ba4f` passed artifact verification.

## Packing bag Trash restore complete

Commit `533994331` uses the saved Trash row through asynchronous restore. The restore still checks the issued page, account, session and collection revision. The new regression case shows that a later edit to the displayed row cannot alter the outgoing restore observation. A stale collection revision is refused with no queued mutation or RPC.

All 654 focused packing cases passed. Strict diagnostics fell from 625 to 623 and the full duplication report is identical. The source-bound local build at `b2dc3f8ab` passed artifact verification.

## Native lodging identity complete

Commit `e8f21fddd` uses the original stay observation for save and Trash, and the original Trash observation for restore. The prepared accommodation ID also supplies confirmation after creation or a lifecycle change. The three new fixtures reproduced late edits to the displayed row interfering with the original selection and verify that only the original stay's context is requested. The existing retry tests cover lost replies, retained intent and session changes.

All 440 focused cases passed. Strict diagnostics fell from 623 to 621 and the full duplication report is identical. The source-bound local build at `06bde1beb` passed artifact verification. The qualified lodging controls still require the isolated fixture configuration.

## Packing terminal recovery guard complete

Commit `099c94e35` verifies the selected queue row, its companions and the archive after refreshing the packing scope. The first explicit cancellation records the original in a transaction before sending. An already recorded cancellation can still recover after a lost reply or when an older tab removed its queue row. Twelve new regression cases reproduced a status check or cancellation reaching transport after a removed or replaced row and now confirm refusal before that request.

All 685 focused cases passed. Strict diagnostics fell from 621 to 593 because the compiler now recognizes the existing refusal path. The full duplication report is identical. The source-bound local build at `c0e91e0c8` passed artifact verification.

## Packing receipt fixtures complete

Commit `39cf839fb` separates the non-null acknowledgement fixture from receipt modes that set the result to null. Each of the nine cases verifies that only the original receipt read was called. A replay confirmed all nine serialized payloads are identical before and after, match their intended mutations, and pass the structural schema before the transport rejects them. The pristine receipt and the corrected reorder were both accepted.

All 360 focused cases passed before and after. Strict diagnostics fell from 593 to 587 and the full duplication report is identical. The source-bound local build at `dce3c7f12` passed artifact verification.

## Packing export fixture complete

Commit `3679c0570` supplies the missing color on the canonical bag and passes it through the existing projection. The print assertion verifies the projected default swatch with the escaped bag label. It failed on the old fixture, which supplied null directly to the native export view. The existing CSV, Markdown and print checks still cover the intended labels, grouping, checked state and visibility.

All 198 focused cases passed. Strict diagnostics fell from 587 to 586 and the full duplication report is identical. The source-bound local build at `e3a8f3ef5` passed artifact verification.

## Packing recovery mock types complete

Commit `9072794f9` uses a single typed callback that accepts both the packing read and command RPC names. The test can supply that mock to both transports without type assertions. The full emitted test JavaScript is byte-for-byte identical, covering the receipt payloads, exact command body and replay assertions.

All 319 focused cases passed before and after. Strict diagnostics fell from 586 to 582 and the full duplication report is identical. The source-bound local build at `f8cb4d477` passed artifact verification.

## Queue retirement fixture complete

Commit `b81196c3b` keeps the database update result typed and verifies that one row was persisted before the test ends the session. The queued row retains its original body and syncing status while dispatch makes no request. A separate test run without session retirement made one mocked request and failed the same dispatch assertion.

All 247 focused cases passed. Strict diagnostics fell from 582 to 581 and the full duplication report is identical. The source-bound local build at `827074c94` passed artifact verification.

## Public image lease fixture complete

Commit `57ec84b59` uses the saved-Trip serializer to produce a validated read-only fixture. The image test pins a distinct unlisted media ID for manifest rejection. The delayed-read cases check the selected signal and verify that retiring the Trip aborts it before delayed bytes complete. At 999 ms, the control caught a read awaiting the retirement poll. At the 1,000 ms poll, the signal aborts and the late bytes create no display URL.

All 240 focused cases passed, including V4 image preparation and stored-variant cache tests. Strict diagnostics fell from 581 to 579 and the full duplication report is identical. The source-bound local build at `862a621bd` passed artifact verification.

## Public image projection fixtures complete

Commit `43f7ba892` checks original, transformation and missing hero values independently. Each case verifies the native placeholder, empty hero metadata and zero display resolver calls. A control run with a valid stored hero called the resolver once in each case. Four earlier verification descriptions copied from the receipt test were corrected in the source record.

All 242 focused cases passed. Strict diagnostics fell from 579 to 578 and the full duplication report is identical. The source-bound local build at `2c8b26b4d` passed artifact verification.

## Release observer fixtures complete

Commit `281b50f29` types the build read mock with the real descriptor contract and uses a controlled pending descriptor. The tests verify one descriptor read for fallback and concurrent callers, refusal of late responses after a source change, disposal or going offline, and a second reader completing after the first cancels. The control run had three expected failures when it supplied a descriptor, kept the original source or aborted the shared request.

All 107 focused cases passed. Strict diagnostics fell from 578 to 575 and the full duplication report is identical. The source-bound local build at `c194d409c` passed artifact verification.

## Startup reconnect fixtures complete

Commit `1af9a083d` keeps each delayed reconnect payload typed and compares the exact response JSON for places, days, budget, reservations and files. The tests confirm the current Trip stays on screen and the selected cache table equals its snapshot before the response. All five controls with an extra mock field failed at the response comparison.

All 88 focused cases passed. Strict diagnostics fell from 575 to 574 and the full duplication report is identical. The source-bound local build at `6c80cf2ee` passed artifact verification.

## Task writer fixtures complete

Commit `17eb7b56a` uses the task contract's space-only trim in the create acknowledgement and verifies that the original command carries the submitted name, including tabs and surrounding spaces. The retention test runs online, confirms it reached the queue read, and expects session retirement to prevent both a queued write and the outgoing request. The two controls caught an untrimmed acknowledgement and a dispatch after omitting retirement.

All 223 focused cases passed. Strict diagnostics fell from 574 to 572 and the full duplication report is identical. The source-bound local build at `11d273122` passed artifact verification.

## Trip access fixtures complete

Commit `070cf40a2` gives the Trip lookup mock the real nullable reader type. Disabled sharing returns its 501 before private lookup. An inaccessible invite looks up the exact Trip once, returns 403 and skips traveler reads, header or member cache writes and queue writes. The two controls verified that the tests distinguish these refusal paths.

All 107 focused cases passed. Strict diagnostics fell from 572 to 570 and the full duplication report is identical. The source-bound local build at `052e44ff6` passed artifact verification.

## Catalog place identity checks complete

Commit `e423c00c7` explicitly returns the existing refusal when a catalog place ID is missing. The four new handler tests pass before and after the edit. Missing IDs return 422 before direct or staged writes. A valid catalog ID saves and returns the refreshed place, and a valid native ID stages a proposal with the canonical ID.

All 129 focused cases passed. Strict diagnostics fell from 570 to 564 and the full duplication report is identical. The source-bound local build at `eafe6e44d` passed artifact verification.

## Visit form fixtures complete

Commit `2aeba6d0f` models the catalog name fallback when a location label is cleared and uses the fixture day's time zone to distinguish local clocks from UTC instants. The old fixture failed three readback checks. The corrected tests read through the native form and verify separate location notes and selected-visit notes, including the separation of draft and published values.

All 190 focused cases passed. Strict diagnostics fell from 564 to 560 and the full duplication report is identical. The source-bound local build at `aeeb5bee1` passed artifact verification.

## Shared planner cohort fixture complete

Commit `1de686336` gives the shared planner fixture the reader's resolved catalog name after a label is cleared, converts the visit's local clock to the corresponding UTC instant, and retains earlier draft location edits on a later time change. Six checks distinguish the old fixture from the corrected one. The planner tests cover both a location-pool editor and a selected visit, with draft and published layers and an independent repeat visit.

All 195 focused cases passed. Strict diagnostics fell from 560 to 553, including the typed local replacement in the planner test. The full duplication report is identical. The source-bound local build at `3d0546830` passed artifact verification.

## Collection Trash fixture complete

Commit `42ac87417` uses the Collection reader's type for the shared fixture. Both archive and deletion timestamps can be null or a timestamp, and the fixture emits identical JavaScript. The command test verifies all six digits of the deletion timestamp in the refreshed Collection and its Trash entry, restores that selected entry, and confirms the Collection is active and Trash is empty. A control that cut the timestamp to milliseconds failed the new assertion.

All 79 focused cases passed. Strict diagnostics fell from 553 to 550 and the full duplication report is identical. The source-bound local build at `2ad6fb74d` passed artifact verification.

## Location form fixture complete

Commit `b54800058` makes the location-only fixture return the catalog name after clearing a custom label. The published and draft readbacks expose their own values. A later draft address edit retains the earlier draft note while leaving the published details intact. The original fixture failed all three new checks.

All 198 focused cases passed. Strict diagnostics fell from 550 to 548 and the full duplication report is identical. The source-bound local build at `fcf772162` passed artifact verification.

## Collection read fixture complete

Commit `f7dfe8345` uses the real library types for test data with an unlinked owner or viewer. Tests verify the owner is never fabricated, an unlinked viewer keeps read access with the supplied permissions, and the reader refuses a response that incorrectly marks that viewer as the owner. Archived reads preserve the timestamp and item list. A response that claims item edit permission for an archived Collection is refused before the detail request.

All 109 focused cases passed. Strict diagnostics fell from 548 to 545 and the full duplication report is identical. The source-bound local build at `947a1fb28` passed artifact verification.

## Packing Trash cursor checks complete

Commit `598904d1d` verifies a two-page Packing category Trash read using timestamps within the same millisecond. The second request sends the original cursor timestamp and category ID. The tests also reject a repeated page, a cursor with the wrong category or timestamp, and a page size of zero before a request.

All 128 focused cases passed. Strict diagnostics fell from 545 to 544 and the full duplication report is identical. The source-bound local build at `adeb7a812` passed artifact verification.

## Complete Trip v3 fixture complete

Commit `1e604155e` checks that the source fixture contains a v3 revision vector before changing its version. The reader rejects the downgraded vector at manifest validation even with a recomputed digest. Six malformed or mislabeled v3 package cases report the expected schema fields. The earlier formats still reject v3 category data and preserve their byte fingerprints.

All 172 focused cases passed. Strict diagnostics fell from 544 to 543 and the full duplication report is identical. The source-bound local build at `08a5542f4` passed artifact verification.

## Queue offline transition complete

Commit `5149fdf80` observes the persisted syncing row before forcing offline mode or simulating a browser disconnect. In both tests the original returns to pending, its row and zero-attempt count match the original exactly, and the HTTP request spy is never called. The fixture keeps the real IndexedDB update type.

All 86 focused cases passed. Strict diagnostics fell from 543 to 542 and the full duplication report is identical. The source-bound local build at `e6657ba20` passed artifact verification.

## Late direct write verification complete

Commit `bc4c2e75e` retains the typed JSON response in the direct write fixture. The packing, task, expense and reservation tests verify that the new account and its database are active before serving the old reply. The retired write reports the session change and leaves the replacement account's visible and saved rows untouched.

All 108 focused cases passed. Strict diagnostics fell from 542 to 541 and the full duplication report is identical. The source-bound local build at `85f54e144` passed artifact verification.

## Planner export fixture complete

Commit `e60eb2a24` supplies a complete Trip row to the planner export fixture. The Family calendar tests confirm that its original snapshot request starts before navigation, an account switch or signing back into the same account. The old reply cannot download, show an error toast or trigger export completion.

All 104 focused cases passed. Strict diagnostics fell from 541 to 540 and the full duplication report is identical. The source-bound local build at `6627742ce` passed artifact verification.

## Private file preview fixture verification

Commit `e60890e55` uses the stored and native file types in the preview fixture. A missing, trashed, moved or denied file is refused before signing, fetching or displaying cached bytes. The account-switch tests wait for each pending phase, including the body read, before allowing a late response to finish.

All 193 focused cases passed. The strict count fell from 540 to 537 with all other diagnostics identical. Four source checks passed at `ab2b1075a`. The remaining project checks and a fresh source-bound build await sufficient disk space. The prior bound artifact is `6627742ce`.

The newer source-bound build and project checks were completed in the list route packet below.

## Family packing and to-do route guards complete

Commit `71324aa06` validates the method, route shape and resolved IDs before invoking nested list commands. The original handler accepted five unsupported requests in the regression suite. The updated handler refuses all five before persistence, and the supported membership, sharing, contributor and removal commands receive the expected canonical IDs.

All 565 focused cases passed. The strict count fell from 537 to 531 with all other findings identical. Typecheck, formatting, source checks and the source-bound local build at `429468d81` passed. The full duplication report is identical. Scoped lint reports the same nine inherited warnings, and the build passed artifact verification.

## Planner bootstrap transport verification complete

Commit `550ec74f5` checks that installation returns a cleanup function before calling it. Axios and same-origin fetch both use the installed planner. Repeating cleanup disposes it once and restores both original functions. After replacement, old cleanup leaves both current bindings active, and final teardown restores the original functions.

All 135 focused cases passed. Strict diagnostics fell from 531 to 530 with all other findings identical. Typecheck, scoped lint, formatting and four source checks passed. The full duplication report is identical. The local build at `8dac2085d` passed artifact verification.

## Native lodging writer verification complete

Commit `695d622e0` uses the saved place validated on the original stay. The mocked save request carries the original lodging ID and arrival and departure dates. A refreshed stay has a new observation in the test. The old desktop editor still submits its original reference and is refused before any save or offline queue entry. The phone editor also submits its original reference.

All 332 focused cases passed. Strict diagnostics fell from 530 to 527 with all other findings identical. Typecheck, scoped lint, formatting and four source checks passed. The full duplication report is identical. The local build at `5a1fbbb8c` passed artifact verification.

## Background download session verification complete

Commit `712964b98` supplies typed trip download replies and the expected nullable map style result. The optional trip responses are released after the replacement database opens and leave it free of the old account’s tour records. Late raster and vector responses preserve the replacement account’s saved map metadata. Raster workers stop dispatching, and vector work skips the follow-up style request.

All 214 focused cases passed. Strict diagnostics fell from 527 to 524 with all other findings identical. Typecheck, scoped lint, formatting and four source checks passed. The full duplication report is identical. The verified local artifact at `5a1fbbb8c` was reused after checking that the revision changes only the test fixture and qualification or handoff records. Its source check passed again.

## Assistant quota and cancellation verification complete

Commit `2d398b47d` verifies the whole quota after cancellation. A second test waits until the original reply is visible, replaces the connection status, then releases the original stream’s late usage reply. The full replacement status stays intact. Both cases use synthetic streams.

All 206 focused cases passed. Strict diagnostics fell from 524 to 522 with all other findings identical. Typecheck, scoped lint, formatting and four source checks passed. The full duplication report is identical. The verified local artifact at `5a1fbbb8c` was reused after checking the test and qualification changes against its runtime inputs. Its source check passed again.

## Planner day and visit route verification complete

Commit `0a8e64e2a` matches the method and path together before handing day-title and visit-timing requests to the planner. Tests show valid renames and moves use the expected Trip, day and visit identities. Requests with missing IDs, unknown records or unsupported methods stop before a write.

All 324 focused tests passed. Strict diagnostics fell from 522 to 520, and the rest of the strict and duplication reports match the previous run. Typecheck, formatting and four source checks passed. Scoped lint reported 9 inherited warnings across the edited files. The local build at `3138c0ca3` passed artifact verification.

## Private file-open route verification

Commit `050746cff` passes the ID captured by the matched GET route to the existing file lookup. Tests open authorized files by both supported ID formats. Unsupported methods and paths stop before file lookup. Trashed or moved files are refused before signing or fetching their bytes.

All 237 focused tests passed. Strict diagnostics fell from 520 to 519 with all other findings identical. Typecheck, formatting and four source checks passed. Scoped lint reported the same 9 inherited warnings, and the duplication report is identical. The local build at `9a99c1f21` passed artifact verification.

## Trip map contribution route verification

Commit `2ce3f1840` uses the matched GET path for marker and layer requests. Tests verify that either Trip ID format resolves to the same Trip, both routes refuse denied or foreign-family records, and unmatched methods or paths skip the Trip lookup.

All 187 focused tests passed. A scoped strict check cleared both map route diagnostics and confirmed the four other findings in the handler. Formatting and four source checks passed. The full quality checks and fresh build await sufficient disk space. The prior local artifact is bound to `9a99c1f21`.

## Weather request validation

Commit `08cad01ac` rejects blank coordinates before dispatch and requires a date for detailed weather. Four cases failed against the old handler and passed with the fix. Valid coordinates, languages and historical times reach the expected weather function in the test.

All 120 focused tests passed. A scoped strict check cleared both weather diagnostics. Formatting and four source checks passed. The full project checks and fresh build await sufficient disk space. The prior local artifact is bound to `9a99c1f21`.

## Visit removal day scope

Commit `7268735c5` checks the requested day before removing one visit. The direct write filters by the visit, Trip and day and reports a conflict when the row has moved. A proposed removal includes the original day. Unsupported DELETE and POST requests to the reorder route stop before any write.

All 404 focused tests passed. The pending map and weather full checks ran on the cumulative source. Strict diagnostics fell from 519 to 513, with all six changes in the application handler. The duplication report and scoped lint warnings match their earlier results. Typecheck, formatting, dependency layers, offline lint and four source checks passed. The cumulative local build at `c18026dbc` passed artifact verification and produced identical CSS.

## Offline write queue stop result

Commit `ceb6b9dc4` returns false if the session ends or the app goes offline after the queue reads its pending decision. Tests verify that a second tab can take the lock, no request is sent, and the original edit remains in its account after the app switches to anonymous mode.

All 398 focused tests passed. Strict diagnostics fell from 513 to 512, and the duplication report and scoped lint warnings match the prior results. The full typecheck, test formatting, layer and offline checks, and four source checks passed. The local build at `3de1ae5a4` passed artifact verification and produced identical CSS.

## Trip editor reminder configuration

Commit `126f15240` lets the classic Trip editor apply only a boolean reminder flag. Missing, null and string values preserve the current setting. Tests confirm that replies from a closed editor, unmounted editor, another Trip or prior sign-in cannot update that setting.

All 219 focused tests passed. Strict diagnostics fell from 512 to 511, with the three existing Trip editor diagnostics still within the baseline. The duplication report is unchanged. The existing component-length warning measures one more line, and the count of lint warnings is unchanged. Typecheck, test formatting, layer and offline checks, and four source checks passed. The local build at `e62a84c0d` passed artifact verification and produced identical CSS.

## Atlas country counts

Commit `98b8d86ce` keeps the country and its totals in the classic Atlas view when a place or trip count is missing after the last region is unmarked. The local view can remove a country when both counts are explicitly zero, the last region is gone, and the server confirms the country is unmarked.

All 282 focused cases passed. Strict diagnostics fell from 511 to 509, with only the two Atlas count findings removed. The duplication report and scoped lint warnings are unchanged. Both edited files pass formatting, and the typecheck, layer and offline checks, and four source checks passed. The local build at `a36283b4a` passed artifact verification and produced identical CSS.

## Day write replies and the trip cache

Commit `0dc732fb9` captures the optional trip returned when a day is removed, inserted or appended. Each scheduled cache update uses that checked value and the existing write-session guard. The 17 repository tests pass on both versions. They verify that an omitted trip leaves the cached trip intact, a late reply leaves both caches intact, and a current insert caches its returned trip.

All 318 focused cases passed. Strict diagnostics fell from 509 to 506, with only the three day repository findings removed. The duplication report, scoped lint warnings and existing formatting status are unchanged. Typecheck, layer and offline checks, and four source checks passed. The local build at `b73282cac` passed artifact verification and produced identical CSS.

## Isolated HTTPS receipt assertions

Commit `9ca89741b` makes the planner and packing profile test and the task profile test assert a scanned receipt containing the expected source commit. Both tests still fail if the receipt is absent or belongs to a different commit. The scanner and app runtime match the previous source. All 199 focused tests passed before and after, including all ten profile tampering cases.

Strict diagnostics fell from 506 to 504, clearing both receipt findings. The duplication report and scoped lint warnings are unchanged. Typecheck, formatting, layers, offline lint and four source checks passed. The local build at `e8d6c0112` passed artifact verification and produced identical CSS.

## Public configuration fixtures

Commit `b2f12e0ab` explicitly requires a receipt for positive fixtures and types the generated chunks. The scan still compares the complete key and origin pair. All 199 focused tests passed before and after, including the 70 public configuration cases, all 15 receipt tampering cases in that suite, and the cases that expect no receipt.

Strict diagnostics fell from 504 to 491. The duplication report and scoped lint warnings are unchanged. Typecheck, formatting, layers, offline lint and four source checks passed. The local build at `0f4462765` passed artifact verification and produced identical CSS.

## Translation catalog types

Commit `7b8355210` attaches the existing catalog and outside-reference type documentation to the scanner evaluator. The scanner code and output are identical. All 116 focused translation, RTL, theme and ownership tests passed before and after.

Strict diagnostics fell from 491 to 487, clearing two ownership findings and two related translation test findings. The duplication report and scoped lint warnings are unchanged. Typecheck, formatting, layers, offline lint and four source checks passed. The local build at `f08a9e8e9` passed artifact verification and produced identical CSS.

## Shell recovery delayed replies

Commit `31cb19285` checks that both delayed reply callbacks exist before resolving them. The health case also confirms that the request starts before the entry recovers. All 130 focused tests passed before and after, including the 28 shell recovery cases. The shell recovery script is unchanged.

Strict diagnostics fell from 487 to 485. The duplication report, scoped lint warnings and existing formatting status are unchanged. Typecheck, layers, offline lint and four source checks passed. The local build at `1994e2c26` passed artifact verification and produced identical CSS.

## Native stay cohort callback types

Commit `938dcd76e` gives the test helper the command session's existing confirmation callback type. The emitted test JavaScript is byte-for-byte identical. All 319 local lodging and planner tests passed before and after, and all 27 live cases were skipped in both runs.

Strict diagnostics fell from 485 to 483. The duplication report and scoped lint warnings are unchanged. Typecheck, formatting, layers, offline lint and four source checks passed. The local build at `9830ef256` passed artifact verification and produced identical CSS.

## Native stay writer refusal

Commit `d2e5f2f9a` requires a place identifier in the live fixture before making the unsupported create request. Both writer tests check for the exact accommodation refusal on create and delete. The local test confirms that these attempts send no save. All 358 local tests passed before and after, and all 10 live cases were skipped.

Strict diagnostics fell from 483 to 482. The duplication report and scoped lint warnings are unchanged. Typecheck, formatting, layers, offline lint and four source checks passed. The local build at `80251c473` passed artifact verification and produced identical CSS.

## Packing recovery prepared restore

Commit `6987f5a57` requires a prepared bag restore before submitting it in the cancelled-batch rediscovery test. The earlier handoff named the cancellation lookup. The strict finding was on the restore submission because preparation can report an already committed child. The cancellation lookup and archive and replacement assertions are unchanged. All 481 local tests passed before and after, and all 32 live cases were skipped.

Strict diagnostics fell from 482 to 481. The duplication report and scoped lint warnings are unchanged. Typecheck, formatting, layers, offline lint and four source checks passed. The local build at `5712fa5af` passed artifact verification and produced identical CSS.

## Native stay update payload types

Commit `d12b79f76` makes the shared lodging helper accept the repository’s update contract for a known stay. Calls that can create a stay still require the creation fields under strict TypeScript. The emitted JavaScript differs only in whitespace. All 240 local tests passed before and after, and the 51 live cases were skipped.

Strict diagnostics fell from 481 to 467, clearing 13 lifecycle test findings and one desktop update finding. The existing desktop create finding, quality baselines, duplication report and formatting status were preserved. Typecheck, scoped lint, the layer and offline checks, and all four source checks passed. The local build at `4aa8a0218` passed artifact verification and produced identical CSS.

## Private upload and profile-photo types

Commit `e68f5e324` binds the Edge Function JSON parser to its response within the existing operation guard. The profile-photo adapter reuses the recorded object after checking its path, filename and availability. The new upload path keeps its generated filename and retains the bytes after uncertain finalization. The carryover check replays all three changed files from their recorded source. All 195 local tests passed before and after, including a fixture using the pinned SDK's HTTP error and a real Response.

Strict diagnostics fell from 467 to 463, clearing the four remaining per-file type errors outside the allowances. The three stale allowance entries still fail the strict check. The duplication report and format status are unchanged. Both package typechecks, the layer and offline checks, and all four source checks passed. The local build at `5f745d13a` passed artifact verification and produced identical CSS.

## Strict allowance reductions

Commit `ccbdc0c35` lowers the three stale allowances. `useFileManager.ts` goes from five to four, `useDayDetail.ts` from two to one, and the two-entry allowance for `tripRepo.ts` is removed. The original strict command now passes with the same 463 compiler diagnostics and a 463 total allowance. Each affected file still fails the checker if a new diagnostic is added. All 10 checker tests, formatting for the edited JSON and the four source checks passed. The local build at `0d64c8b58` passed artifact verification and produced identical CSS.

## Shared map style rules

Commit `965a8fa56` uses the native GL preset definitions and pure normalization rules from the retained Family adapter. The native planner and the Family Admin preview continue through their existing map components. The Family preset arrays, entries and tags remain independently mutable. The local comparison preserved the provider defaults, every preset, both style settings and basemap language outputs across 348 cases. All 194 map tests passed on both versions.

The full duplication report fell from 17,245 lines across 283 files to 17,219 lines across 281 files. Only the two GL provider blocks left the report. The strict check still passes with the same 463 diagnostics. Typecheck, formatting, layer and offline checks, and the four source checks passed. The existing ESLint configuration excludes the retained adapter. The local build at `7f22ac31c` passed artifact verification and produced identical CSS.

## Shared Mapbox setup

Commit `53f74eed6` gives the native Mapbox helpers the six-method interface used by both installed SDK versions. The retained Family module re-exports those helpers. A separate strict compile accepts both SDK `Map` types. The native helpers emit identical JavaScript. The before and after Family helpers matched in 30 style checks and 1,344 mocked method traces, including repeated setup, label order, and rejected SDK operations. All 230 map, preview and Journey tests passed on both versions.

The full duplication report fell from 17,219 lines across 281 files to 17,163 lines across 279 files. Only the two Mapbox setup entries left the report. Strict passes with the same 463 diagnostics. Typecheck, layer and offline checks, and the four source checks passed. The native lint and format results are unchanged. The retained re-export passes formatting and is outside the default ESLint scope. The local build at `bcc30893d` passed artifact verification and produced identical CSS.

## Shared transport duration

Commit `67aa39edd` extracts the same duration formatter from native transport hops and the two retained Family overlays. Each renderer keeps its existing waypoint order, longitude framing, geometry and label assembly. The shared formatter omits the duration for an invalid imported time zone and leaves the distance available. The regression failed on the original code and passes for both endpoints. The local comparison matched the outputs of all three originals across 8,100 other input sets. All 266 focused tests passed.

The full duplication report fell from 17,163 lines across 279 files to 16,950 lines across 279 files. Strict passes with the same 463 diagnostics. Typecheck, formatting, layer and offline checks and the four source checks passed. The default ESLint scope excludes both retained renderers. The local build at `aa7d688fe` passed artifact verification and produced identical CSS.

## Shared transport labels

Commit `57e10d342` keeps duration and route labels in one module. All three renderers use the same code for the ordered route label, the two-end fallback when an intermediate code is missing, and the rounded distance line. Every renderer continues to supply its own waypoint order and distance. The prior duration code is identical in the renamed module. The new helper matched all three original formats across 5,508 input sets. All 266 local map tests passed before and after.

The full duplication report fell from 16,950 lines across 279 files to 16,927 lines across 278 files. Strict passes with the same 463 diagnostics. Typecheck, targeted lint, formatting, layer and offline checks, and four source checks passed. The initial lint comparison tried the deleted filename. A separate rerun compared both snapshots at the current path and passed with the same warnings. The existing ESLint scope excludes the two retained renderers. The local build at `d9a2bc4d4` passed artifact verification and produced identical CSS.

## Shared transport waypoints and leg geometry

Commit `8b7d339d8` filters transport waypoints through one helper and reuses the existing endpoint sort. The helper matched all three original sorters across 5,164 input sets, including missing and tied sequence values and mixed endpoint roles. The comparison checked endpoint identity and order using frozen inputs. Each renderer still supplies its own coordinates. The retained Leaflet and GL renderers share the leg calculation, using their original world-wrap settings and distance formula. A before/after comparison matched all 696 geometry and distance results, including antimeridian crossings, repeated coordinates and ground legs. All 275 focused tests passed before and after.

The waypoint-only change briefly added two lines to the scanner total because it joined neighboring matches. With the shared leg calculation, the full report fell from 16,927 lines across 278 files to 16,890 lines across 278 files. Strict passes with the same 463 diagnostics. Typecheck, targeted lint, scoped formatting, layer and offline checks, and four source checks passed. The existing ESLint scope excludes the two retained renderers. Pre-existing formatting in the endpoint utility remains. The local build at `529529216` passed artifact verification and produced identical CSS.

## Unused reservation stats badges

Commit `cbe9128cf` removes private, unreferenced badge code from the retained Family maps. The Leaflet stats component had no mount and the GL stats markup function had no callers. A source comparison confirmed the remaining statements match after the two unused React imports were removed. The check covered the active endpoint labels, escaping, map events and the existing GL subscription. All 339 focused map tests passed before and after, including the retained overlay icon, click and lifecycle cases.

The full duplication report fell from 16,890 lines across 278 files to 16,852 lines across 278 files. Strict passes with the same 463 diagnostics. Typecheck, formatting, layer and offline checks, and four source checks passed. Both files are outside the default ESLint scope. The local build at `2ee8518e6` passed artifact verification. All 3,789 other files matched the previous build byte for byte. Only the public config’s source commit changed.

## Unused reservation stats calculations

Commit `792c20f56` removes the label, duration, midpoint and distance calculations used only by the retired badges in the two retained Family maps. Both renderers still produce the same route lines, use their original world-wrap settings and preserve their endpoint labels and subscriptions. The route helper matched all 696 geometry outputs across 174 waypoint sets. The native planner keeps its duration and route label code. All 339 focused map tests passed before and after.

The duplication report still counts 16,852 lines across 278 files. Strict passes with the same 463 diagnostics. Typecheck, formatting, layer and offline checks, and four source checks passed. The three retained files are outside the default ESLint scope. The local build at `e8fddde50` passed artifact verification with identical stylesheets. JavaScript hashes changed. Of the 134 renamed JavaScript chunks paired by the manifest analysis, 89 matched after updating references to renamed chunks.

## Shared reservation map item assembly

Commit `939343288` lets the two retained overlay renderers use the same reservation filter and waypoint projection. The helper retains the accepted transport types and leaves each caller in charge of world wrapping and transit reads. The two original paths matched all 1,284 comparisons, including excluded bookings, missing and tied sequences, antimeridian crossings and transit read order. All 339 focused tests passed before and after.

The full duplication report fell from 16,852 lines across 278 files to 16,830 lines across 276 files. Strict passes with the same 463 diagnostics. Typecheck, formatting, layer and offline checks, and four source checks passed. The three retained files are outside the default ESLint scope. The local build at `1cf072c89` passed artifact verification. Stylesheets match the previous build. The emitted JavaScript chunk hashes changed.

## Shared OSRM route leg formatting

Commit `9a2809ba6` shares the retained RouteCalculator's per-leg formatting. Only the full-route result includes `durationText`. The actual retained module matched across 576 mocked scenarios covering both entry points, distance units and rounding, profiles, aborted requests, transport errors, cache hits and eviction. The native calculator source is unchanged. All 378 focused route and map tests passed before and after.

The full duplication report fell from 16,830 lines across 276 files to 16,799 lines across 275 files. Strict passes with the same 463 diagnostics. Typecheck, formatting, layer and offline checks, and four source checks passed. The retained calculator is outside the default ESLint scope. The local build at `fa8bbf6ed` passed artifact verification. Stylesheets match the previous build. The emitted JavaScript chunk hashes changed.

## Unused packing template button

Commit `5bf6a0af8` removes the unreferenced legacy copy of ApplyTemplateButton. The tracked source and loader inventory found no incoming reference. The ordinary compiler file inventory is identical before and after. Trip Lists still imports the native button, whose Family group-action gate and mutation guard are byte-exact. All 463 packing, permissions and planner tests passed before and after.

The full duplication report fell from 16,799 lines across 275 files to 16,725 lines across 273 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `544fd6be1` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused packing panel header

Commit `1ddb1feae` removes the unreferenced legacy PackingListPanelHeader. The source and loader inventory found no incoming references. The compiler includes the same files before and after. The active packing panel still imports the native header. Both files, including the controls that use the group and permission checks, match the previous source. All 486 packing, bag, category, permissions and planner tests passed before and after.

The full duplication report fell from 16,725 lines across 273 files to 16,458 lines across 271 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `f28bdef7d` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused packing bag modal and sidebar

Commit `c843c6411` removes the two legacy bag editor files. The source and loader inventory found no callers. The native modal, sidebar, bag card and packing panel match the previous source, and their compiler file inventory is identical. All 827 focused tests passed before and after, covering active bag editing, permissions, command settlement and recovery.

The full duplication report fell from 16,458 lines across 271 files to 16,380 lines across 269 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `254aa4c1a` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused packing bag card

Commit `9a8af0e9a` removes the legacy BagCard. The legacy modal and sidebar were its only callers before their retirement. The current source and loader inventory found no incoming references. The native editors still use the native BagCard, and the compiler file inventory matches the previous checkpoint. All 827 focused tests passed before and after, covering active packing, bag commands, permissions and recovery.

The full duplication report still counts 16,380 lines across 269 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `859bc9090` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused planner address and airport pickers

Commit `f6bd5dc59` removes the unused legacy AddressInput and AirportSelect copies. The source audit resolved all nine named module references to the native files. This includes the Airport type consumed by transportEndpoints. The Family transport form and its airport picker match the previous source, as do both location picker files. The compiler file inventory is identical. All 563 focused picker, booking and transport tests passed before and after.

The full duplication report fell from 16,380 lines across 269 files to 16,120 lines across 267 files. The scanner now pairs three existing matches directly between the untouched FamilyAirportSelect and LocationSelect files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `38e0cbe38` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused planner location picker

Commit `e2fe5e26d` removes the unused legacy LocationSelect. All ten module references resolve to the native location picker, including the LocationPoint imports used by map search, location picks and transport endpoints. The native search and Family airport-picker paths match the previous source. The compiler file inventory is identical. All 611 focused picker, booking, map and transport tests passed before and after.

The full duplication report fell from 16,120 lines across 267 files to 15,964 lines across 265 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `e7f41fbc2` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused AirTrail import dialog

Commit `e135b4719` removes the unused legacy AirTrail dialog. All seven module references resolve to the native file, including the test import of detectConnections. The native desktop and phone callers, connection and availability checks, and route to the AirTrail API match the previous source. The compiler file inventory is identical. All 411 focused tests passed before and after.

The full duplication report fell from 15,964 lines across 265 files to 15,802 lines across 263 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `949fe669b` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused booking costs section

Commit `568e778c4` removes the unused legacy BookingCostsSection and its request type module. All 13 module references resolve to the native component or native BookingExpenseRequest. The active booking expense paths, mobile linked costs and FamilyBookingEditor are byte-exact. The compiler file inventory is identical. All 472 focused expense, booking and permission tests passed before and after.

The full duplication report fell from 15,802 lines across 263 files to 15,714 lines across 262 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `bbe382090` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused legacy place form

Commit `329df7e9d` removes the unused legacy PlaceFormModal and its helpers. All 40 references from outside the pair resolve to the native form or native helpers. The compiler file inventory is identical. All 694 focused tests passed before and after across 26 suites, including desktop and mobile place editing, Family planner adapters, place search, linked expenses, uploads and collection selection.

The full duplication report fell from 15,714 lines across 262 files to 15,568 lines across 260 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `bc8a5f1f0` passed artifact verification. The generated stylesheet drops six utilities from the retired form. The shipped markup and scripts contain zero occurrences of those utility tokens. The remaining CSS and the scripts match after resolving asset renames. The service worker references and integrity metadata match the new build.

## Unused legacy collection picker

Commit `3070ba123` removes the unused legacy CollectionPicker. The desktop place form and picker tests both resolve to the active picker. The compiler file inventory is identical. All 515 focused tests passed before and after across 11 suites, including collection search and selection, place creation and account permissions.

The full duplication report fell from 15,568 lines across 260 files to 15,505 lines across 258 files. The removed match accounted for both the picker and its paired block in the legacy filter bar. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `05ebdf895` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused legacy Collections page components

Commit `58bf665c1` removes the unused legacy Collections hero, list and place details. All 13 module references resolve to the active desktop components. Mobile continues through its own screen and shared data hooks. The compiler file inventory is identical. All 409 focused tests passed before and after across 17 suites covering both screen sizes, stored image reads, sharing permissions and supported edits.

The full duplication report fell from 15,505 lines across 258 files to 15,271 lines across 252 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `af887c046` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused legacy Collections dialogs and hooks

Commit `a976f5ce3` removes the two unused legacy Collections dialogs and two unreferenced legacy hooks. The only links within those files were the legacy Collections hook loading its Family helper and that helper importing the legacy editor type. Every external reference resolves to an active component or the shared Collections hook. The compiler file inventory is identical. All 412 focused tests passed before and after across 17 suites covering desktop and mobile, create and edit dialogs, images and sharing permissions.

The full duplication report fell from 15,271 lines across 252 files to 15,095 lines across 247 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `2d09ac762` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused legacy collection-save and sidebar modules

Commit `8bdfba242` removes 11 unused legacy collection-save and planner sidebar modules. The audit verified 14 imports entirely within the retired group and 33 references to the active modules. The compiler file inventory is identical. All 898 focused tests passed before and after across 20 suites covering single-place and bulk saves, desktop sidebar actions, mobile sheets and Family edits.

The full duplication report fell from 15,095 lines across 247 files to 14,695 lines across 237 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `ae72e46ed` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused legacy planner import and category dialogs

Commit `0f03b68ea` removes unused legacy file-import, bulk-category and Family track dialogs. All five references resolve to the active desktop components. Mobile uses its own views and the shared import hook. The shared track parser and data adapter match their previous source. The compiler file inventory is identical. All 424 client tests and 14 mocked track backend tests passed before and after.

The full duplication report fell from 14,695 lines across 237 files to 14,181 lines across 235 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `1e63d2b1c` passed artifact verification. The generated stylesheet dropped the unused `text-[#b45309]` rule from the legacy file-import dialog. The shipped markup and scripts contain zero occurrences of the utility. The remaining CSS matches byte for byte. The application JavaScript matches after resolving renamed assets. The service worker has equivalent local bindings and verified cache entries for the rebuilt files.

## Unused legacy ICS dialog and toolbar

Commit `b8f787022` removes the unused legacy ICS dialog and its toolbar. The Family dashboard still opens FamilyCalendarSubscribeModal, which continues to use the legacy SubscribeLinks module. The audit resolved all 15 retained references and verified the compiler file inventory, desktop and mobile calendar entry points and Family adapter. All 367 client tests and 12 mocked Family calendar tests passed before and after.

The full duplication report fell from 14,181 lines across 235 files to 14,030 lines across 233 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `27ca3a84e` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused legacy day-reorder popup and trip warnings banner

Commit `9bd93bd38` removes the unused legacy day-reorder popup and trip warnings banner. All six references resolve to the active planner components. The compiler file inventory is identical. All 536 tests passed before and after, covering reordering, day addition and deletion rules, the timeline toolbar and trip warnings.

The full duplication report fell from 14,030 lines across 233 files to 13,984 lines across 231 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `109345bd0` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused legacy transit modal and display helpers

Commit `e5bf581cb` removes the unused legacy transit journey modal and its display helpers. The old modal was the last caller of the old helper. All 19 other references resolve to the active transit modules, including mobile itinerary types and booking views. The compiler file inventory is identical. All 732 tests passed before and after across 16 planner, transit, booking and phone suites.

The full duplication report fell from 13,984 lines across 231 files to 13,716 lines across 227 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `12637477b` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused legacy booking-import draft converter

Commit `645310b99` removes the unused legacy booking-import draft converter. The import-review runtime caller and 11 type references resolve to the active converter, including reservation and transport forms. The compiler file inventory is identical. All 624 tests passed before and after across 12 suites covering import review, booking callbacks and desktop and mobile form behavior.

The full duplication report fell from 13,716 lines across 227 files to 13,669 lines across 225 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `50ca4de8b` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Family booking-import fallback cleanup

Commit `60d17e92b` removes the unreachable background import fallback from the retained Family dialog. Both Family panels provide extract and confirmation callbacks. The active desktop and mobile routes use the separate native modal. The TypeScript file graph drops only the legacy background task store that served the removed fallback. All 225 tests passed before and after across eight suites. The new bookings panel test covers upload, preview, confirmation and transition to the editor.

The full duplication report has 13,669 lines across 225 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `b89448594` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused legacy background import widget and store

Commit `73e2b1843` removes the unused legacy background import widget and task store. The legacy widget was the last caller of its store. All 24 other references resolve to the active app widget and store, including booking review, receipt scanning and sign-out cleanup. The compiler file inventory is identical. All 190 focused tests passed before and after across nine suites.

The full duplication report has 13,669 lines across 225 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `c4fd112b4` passed artifact verification. The generated site matches byte for byte except for its source commit metadata.

## Unused legacy day-plan controls and constants

Commit `a9712de2d` removes four unused legacy files for the add-place button, sidebar constants, note editor and transport detail. The desktop planner, mobile timeline and sheets, and shared view continue to resolve to the active modules. The audit resolved all 17 retained references, and the compiler file inventory is identical. All 639 tests passed before and after across 14 suites.

The full duplication report fell from 13,669 lines across 225 files to 13,558 lines across 221 files. Strict passes with the same 463 diagnostics. Typecheck, size, layer and offline checks, and four source checks passed. The local build at `85d339c36` passed artifact verification. The generated stylesheet dropped two unused background utilities. The remaining stylesheet rules match, and the application JavaScript matches after resolving renamed asset references. The service worker cache entries and artifact integrity metadata match the rebuilt files.

## Family planner badge reuse

Commit `8c369b079` connects three Family day components to the native status and time badges. Five render cases match after sorting CSS class tokens, including entries with and without a time. The retained toolbar button and row actions menu preserve their tooltip behavior and right-to-left menu anchoring. All 484 focused tests passed before and after.

Strict passes with the same 463 diagnostics. The duplication scan still reports 13,558 lines across 221 files. The two reported blocks in the planner helper cover the retained interactive controls. Typecheck, layer, offline, size, and four source checks passed. The local build at `17fc56501` passed artifact checks and emitted byte-identical stylesheets.

## Unused legacy day-plan route connector

Commit `f4af5e36b` removes the unused route connector from the legacy Family planner. The sole importer resolves to the active connector for day routes and hotel departure and return. Compiler membership and the protected planner sources match before and after. All 453 focused tests passed in both runs.

The duplication report fell from 13,558 lines across 221 files to 13,512 lines across 220 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `1604e6f57` passed artifact verification. Generated files match byte for byte except for the source commit in the public config.

## Family timeline detail callback reuse

Commit `7911abd26` shares file and expense retry callbacks, file opening, and dialog close props between the booking and transport detail dialogs. Each dialog still receives its own edit and delete permissions and editor target. Four local dialog cases exercise independent retries, the existing 120-second signing request, signer and file-open errors, and editor handoff. All 80 tests passed before and after.

The duplication report fell from 13,512 lines across 220 files to 13,478 lines across 219 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `59f62d6c2` passed artifact checks and emitted byte-identical stylesheets.

## Shared linked-file selection for Family reservation details

Commit `11688ea12` gives the booking and transport detail models one attachment selector. Both models exclude deleted files, require a link to the selected reservation, and retain the first eligible row per file ID in input order. The existing output fields and consumer types are preserved. All 84 focused tests passed before and after, including four projection cases and four mocked dialog cases.

The duplication report fell from 13,478 lines across 219 files to 13,440 lines across 217 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `cd6e55965` passed artifact checks and emitted byte-identical stylesheets.

## Shared attachment display for Family reservation details

Commit `bbc59a7a4` shares the attachment section between the booking and transport detail dialogs. The loading, error and retry, empty, and populated states produced identical markup before and after in both dialogs. Tests verify button order, the selected file passed to the handler, and retry behavior. All 86 focused tests passed in both runs.

The duplication report fell from 13,440 lines across 217 files to 13,382 lines across 217 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `4190ae0d5` passed artifact checks and emitted byte-identical stylesheets.

## Shared expense display for Family reservation details

Commit `f842aa5d8` shares the expense section between the booking and transport detail dialogs. Twelve before-and-after comparisons match for loading, error with and without Retry, empty, and populated output in English and German locales. Tests verify the retry callback, currency formatting, row order, and dialog focus. The attachment section output also matches. All 88 focused tests passed in both runs.

The duplication report fell from 13,382 lines across 217 files to 13,336 lines across 217 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `d28e6230a` passed artifact checks and emitted byte-identical stylesheets.

## Shared confirmation code display for Family reservation details

Commit `3bca405ba` shares the confirmation row and Copy action between the booking and transport detail dialogs. Both rows produce identical markup before and after. Tests cover missing codes, exact clipboard text, success and error feedback, an unavailable clipboard, and button focus. Expense and attachment markup also match. All 90 focused tests passed in both runs.

The duplication report fell from 13,336 lines across 217 files to 13,263 lines across 217 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `12eae3157` passed artifact checks and emitted byte-identical stylesheets.

## Shared keyboard and focus behavior for Family reservation details

Commit `734a14650` shares initial focus, Tab containment, Escape dismissal and focus restoration between the booking and transport detail dialogs. Four direct dialog cases verify keyboard behavior, the latest close callback and opener, listener cleanup, and skipped restoration during editor handoff or when the opener is detached. Confirmation, expense, and attachment markup match the baseline. All 94 focused tests passed before and after.

The duplication report fell from 13,263 lines across 217 files to 13,192 lines across 217 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `0fdb58a3a` passed artifact checks and emitted byte-identical stylesheets.

## Shared panel and backdrop for Family reservation details

Commit `dbe92e99a` shares the portal panel and backdrop. Headless Chrome reproduced unwanted dismissal in both dialogs when a press started on the backdrop and ended inside the panel. The new panel clears that gesture before the browser dispatches its click. Chrome confirmed that inside clicks and gestures in both directions across the edge leave both dialogs open. A backdrop click still dismisses and restores focus to the opener. The 94 baseline tests and two new pointer regressions passed after the fix. Confirmation, expense, and attachment markup match the baseline.

The duplication report fell from 13,192 lines across 217 files to 13,150 lines across 217 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `c7522a48c` passed artifact checks and emitted byte-identical stylesheets.

## Shared action footer for Family reservation details

Commit `84058bfd6` moves the Edit and Delete footer into the shared detail panel. Each caller supplies its own permissions and actions. All 16 before-and-after comparisons match across the two dialogs, including combinations with a missing callback. Tests verify the Delete-then-Edit tab order, independent callbacks, and the editor handoff. All 98 focused tests passed in both runs.

The duplication report fell from 13,150 lines across 217 files to 13,112 lines across 217 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `bccb94540` passed artifact checks and emitted byte-identical stylesheets.

## Shared header for Family reservation details

Commit `ae92b0b24` moves the title, category and status display, and Close action into the shared panel. The panel labels itself with its own heading ID. All four header comparisons match after normalizing generated IDs, covering confirmed and pending statuses for both booking and transport. Tests verify initial focus, Tab to Close, the latest close callback, and focus restoration. The footer, confirmation code, expense and attachment comparisons also match. All 100 focused tests passed before and after.

The duplication report fell from 13,112 lines across 217 files to 13,090 lines across 217 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `7f5f6d154` passed artifact checks and emitted byte-identical stylesheets.

## Shared date and notes display for Family reservation details

Commit `e3000aa29` moves the scrollable body, date display, booking time and note formatting into the shared panel. Twenty before-and-after body comparisons match across English and Mexican Spanish fixtures, including missing dates, start-only and end-only dates, same-day and multi-day ranges, and multiline notes. Booking time and the order of transport stops and legs are preserved. All 102 focused tests passed in both runs.

The duplication report fell from 13,090 lines across 217 files to 13,046 lines across 215 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `67224a903` passed artifact checks and emitted byte-identical stylesheets.

## Shared section order for Family reservation details

Commit `32d20ae69` moves the existing confirmation, expense, and attachment sections into the shared panel and uses one set of shared display and callback props. The transport caller retains its endpoints and legs between confirmation and expenses. Twenty full body comparisons and the separate confirmation, expense, attachment, header and footer comparisons match. All 102 focused tests passed before and after.

The duplication scan still reports 13,046 lines across 215 files. Strict passes with the same 463 diagnostics. Typecheck, layer, offline, size, and four source checks passed. The local build at `a17bf0400` passed artifact checks and emitted byte-identical stylesheets.

## Family reservation list reachability and behavior

The desktop trip route mounts ReservationsPanel for Bookings and Transports. Its status, type and traveler filters are stored per trip for the session. The phone route uses the native Bookings and Transports tabs with traveler filtering and status groups. Both routes share the native date ordering model. Its sort uses the reservation date and then the linked trip day. The legacy transport list also has an endpoint-date fallback. The Family transport draft normalizer derives the stored start from the first endpoint date when one is supplied.

The two legacy list components have four direct test imports and one controller import of a transport type. TypeScript removes that import from the emitted controller. The existing qualified build at `a17bf0400` has no legacy list manifest entries. All 156 focused tests across 10 files passed, including desktop filters, phone ordering, undated entries, native reservation reads and both legacy lists. Four source checks passed. This checkpoint updates the review records.

## Legacy reservation list retirement audit

The old list panels still carry 32 cases across four suites. The active desktop, phone and Family suites cover grouping, permissions and current detail flows. They leave differences in the old draft, file and focus behavior, and a synthetic endpoint-only date sorts as undated in the active lists. All 571 checks and four source checks passed. The review retains both panels and their tests. [Coverage and repair plan](legacy-reservation-retirement-audit.md).

## Family transport departure ordering

Commit `603fdfd76` uses the canonical departure date for desktop and phone sorting and desktop day grouping when the coherent Family read has no recorded start, independent header date or linked day. The hint also works without endpoint coordinates. The view retains genuine midnight, keeps invalid and arrival-only dates undated, and leaves reservation facts, geometry and write payloads intact.

The newly added cohort regression reproduced the original ordering error. All 601 focused tests passed in 29 files after the repair. Strict passed with 463 diagnostics, and the existing duplication finding remains at 13,046 lines across 215 files. The typecheck, layer, offline, size and four source checks passed. The local build at `6e78f3e7a` passed artifact verification and emitted byte-identical stylesheets.

## Reservation attachment open failures and retry

Commit `739fcae0c` makes phone booking and transport cards and their detail sheet report attachment open failures with the existing localized message. The attachment stays available for a new attempt. Two regressions reproduced the missing error feedback. The actual Family fetch handler test verifies that retry confirms file membership and obtains a new signature. Existing tests reject delayed file data after the original trip or session is retired.

The native detail uses files already loaded for the trip. Closing the detail ends that view and leaves an explicit file-open request governed by the existing Family ownership checks. The legacy late-list test exercises a per-dialog metadata read, which the native detail has replaced with the trip-level read.

All 373 focused tests passed across 19 files. Typecheck, strict, layer, offline, size and four source checks passed. Duplication reports the same 13,046 lines across 215 files. The local build at `d0f76901a` passed artifact verification and emitted byte-identical stylesheets.

## Phone editor attachment failure and retry

Commit `6844d7be2` connects the shared booking, transport and place editor attachment row to the same file opener as reservation details. A failed open displays the existing error message and keeps the file button available. The new regression reproduced the missing feedback, then verified retry without upload permission. Pending file selection, linking and unlinking use their existing handlers.

All 262 focused tests passed across 8 files, including the three editor screens and their shared attachment controls. Typecheck, strict, layer, offline, size and four source checks passed. Duplication reports the same 13,046 lines across 215 files. The local build at `d68a60a7b` passed artifact verification and emitted byte-identical stylesheets.

## Native reservation focus audit

The native booking and transport editors received focus when opened from a detail in StrictMode. Closing the desktop editor with Cancel or the phone editor with Escape returned focus to the original row. A linked expense moved focus into the actual desktop Costs editor.

Desktop Delete left focus on the background detail. Chromium confirmed that Tab and Shift+Tab cycle through that detail while the question is visible, and Escape dismisses the question without refocusing its trigger. Confirming deletion of the selected row left focus on the document body in the desktop and phone component probes. That case needs a surviving focus target.

Seven local component probes measured these transitions. The Chromium fixture used the actual web dialog components. All 544 reservation regressions and four source checks passed. The audit records the existing behavior for a scoped repair. [Focus audit and reproduction](legacy-reservation-retirement-audit.md#native-reservation-focus-audit).

## Reservation Delete confirmation keyboard focus

Commit `7385908fa` gives the list and detail Delete question a name and description. Focus starts on Cancel and stays in the question while tabbing. Cancel and Escape return focus to the Delete trigger. Confirm closes the detail and sends one delete. Only the reservation list and detail callers use the new HTML focus behavior. The system question and its HTML fallback still follow their existing routing.

All 570 focused tests and seven component probes passed. Chromium confirmed the focus transitions at desktop and phone widths. Confirming deletion of the selected row still leaves focus on the document body once that row disappears. The editor and Costs handoff probes match the audit.

Typecheck, strict, layer, offline, size and four source checks passed. Duplication reports the same 13,046 lines across 215 files. The local build at `52041fcd3` passed artifact verification and emitted byte-identical stylesheets.

## Focus after reservation removal

Commit `d8b31e64f` returns focus to a visible neighboring reservation after the active list loses its selected row. Desktop uses its existing Add or Reset filters action when available. The named list provides a fallback on either layout. A refused write keeps the original row available. Moving focus away or switching trips or views cancels the handoff.

All 582 focused tests passed. Eight cases reproduced missing focus before the repair, and four cases covered refusal and interruption. A Chromium modal fixture also skipped a hidden row at desktop width and reached Add at phone width. The phone list and sheet themselves were exercised in the component suite.

Typecheck, strict, layer, offline, size and four source checks passed. Duplication remains at 13,046 lines across 215 files. The local build at `11dbef76e` passed artifact verification and emitted byte-identical stylesheets.

## Legacy reservation coverage after the focus repairs

The review matches all 32 remaining legacy cases to the current view, command or read owner. The retained transport request type is erased by the project compiler. The request state is never read, while the controller tab state still refreshes reservations when returning to Plan.

655 checks passed, including five probes of editor and Costs focus. Two phone probes reproduced focus dropping to the page body after deletion from a card. Four source checks passed. Keep both old panels until the card path and the identified coverage gaps are addressed. [Coverage decisions and reproduction](legacy-reservation-retirement-audit.md#coverage-decision-after-the-focus-repairs).

## Phone reservation card Delete focus

Commit `4336ccc47` keeps focus recovery in the phone list so it survives the card's removal. Focus goes to the next visible card, the previous card when needed, or the named list when empty. Cancel and refusal return to the Delete button. Leaving the list during a slow write cancels focus recovery.

All 609 focused tests passed. Five new cases reproduced the focus loss before the repair. Chromium with the real phone confirmation sheet verified that focus skips a hidden card, lands on the empty list, and returns to Delete after Cancel or refusal. The component suite exercises both actual reservation tabs.

Typecheck, strict, layer, offline, size and four source checks passed. Duplication reports the same 13,046 lines across 215 files. The local build at `498197ad7` passed artifact verification and emitted byte-identical stylesheets.

## Reservation editor and Costs focus regressions

Commit `de794cbc4` makes the five StrictMode checks part of the normal client suite. Opening the desktop booking or transport editor moves focus inside it. Cancel returns focus to the original row. The phone equivalents return focus to the card title on Escape. A linked expense closes the reservation detail and leaves focus in the Costs editor.

All 614 focused tests, typecheck, strict, layer, offline, size and four source checks passed. The repository duplication check still reports 13,046 lines across 215 files. The source-bound local build at `a6ea4a376` passed artifact verification and its 412 bundled JS and CSS files are byte-identical to the preceding build.

## Family trip files read and Retry

Commit `6c7b9eeda` lists trip files once per collection request. A successful empty list produces no error. If the full planner refresh fails, it keeps the last valid files and shows one Retry for the current trip. An independent file read still shows its own error and Retry. The active and Trash listing requests pass their existing filter to the canonical reader.

The three new tests exercise the installed planner boundary, store and real file route with a mocked data reader. All 778 focused tests, typecheck, strict, layer, offline, size and four source checks passed. The repository duplication check still reports 13,046 lines across 215 files. The local build at `04b9f41b4` passed artifact verification and emitted byte-identical stylesheets.

## Desktop reservation collapse preferences

Commit `a7a2909a3` adds two StrictMode regressions for the active Bookings and Transports card sections. They verify that Pending and Confirmed collapse independently, that an unrelated day update and reopening preserve the choice, and that each trip restores its own choice. The fixture remounts the panel when its trip changes, matching the Family route boundary.

All 809 focused tests, typecheck, strict, layer, offline, size and four source checks passed. The repository duplication check still reports 13,046 lines across 215 files. The local build at `72ddcfffc` passed artifact verification and its 412 bundled JS and CSS files are byte-identical to the preceding build.

## Unused legacy transport creation request

Commit `821a9b1f2` removes the Family controller's unused request state, its type import and the callback inside the unmounted sidebar. The retained tab bridge tests pass before and after the cleanup. They verify that returning to Plan from Bookings or Transports refreshes the original trip's reservation reads and its matching native store. The active transport editor passes its existing planner wiring tests.

All 1016 focused tests, typecheck, strict, layer, offline, size and four source checks passed. The repository duplication check still reports 13,046 lines across 215 files. The local build at `759bf351b` passed artifact verification and emitted byte-identical stylesheets. The old Transports list source references are now confined to its own module and two test files.

## Legacy Transports list retirement

Commit `2c8c60b00` removes the unused list, its two list-only presentation helpers and its two suites. Those five files had no outside consumers. The shared transport editor, detail and projection continue to serve the retained timeline and its tests.

All 1,084 baseline tests passed. The 1,069 retained tests passed again with the same names, including the native filtering, departure dates, collapse, permissions, attachments and keyboard handoffs. The retired 15 cases are mapped to their coverage in the [retirement audit](legacy-reservation-retirement-audit.md#legacy-transports-list-retirement).

Typecheck, strict, layer, offline, size and four source checks passed. Duplication reports 11,743 lines across 212 files, down from 13,046 lines across 215 files. The local build at `4c9e26ba3` passed artifact verification and emitted identical JS and CSS bundles.

## Legacy Bookings draft staging review

All four old cases are traced to current handlers and controls. Family advertises the import parser but the native review gate refuses the editor. The legacy DELETE handler can stage a removal under Family permissions. The qualified native Delete control refuses the old write path. The native editors use the shared discard guard.

The 1,302 focused tests and four source checks passed, with four test skips. The old panel and its tests remain for the pending cases. The import availability repair follows below. [Coverage and follow-up](legacy-reservation-retirement-audit.md#legacy-bookings-draft-staging-review).

## Family booking import availability

The Family feature endpoint reports booking import as unavailable. The native planner flags and phone share entry use the review gate, and the widget keeps prior booking imports and stored file references while review is unavailable. The production layout files remain byte-exact to their pinned source.

Six tests reproduced the defects before `727b1a0ab`. All 663 focused tests, typecheck and four source checks pass. The local web build at `adf97edd7` passed artifact validation. [Coverage and next step](legacy-reservation-retirement-audit.md#family-booking-import-availability).

## Family draft reservation removal

Commit `0bc2e637f` adds seven checks through the real reservation DELETE route and the Family repository. My Draft passes the canonical reservation and trip IDs to the draft RPC and Published still returns the original booking. Three refused calls issue zero SDK writes. Authorized Published removal still uses the direct REST delete.

All 221 focused tests, scoped lint, format, typecheck and four source checks passed. The source-bound build at `5f179a010` emitted 414 byte-identical JS and CSS bundles. Next, cover Keep editing and Discard in the native booking editors. [Coverage and limits](legacy-reservation-retirement-audit.md#family-draft-reservation-removal).

## Native booking editor discard

Commit `e3f3826cf` covers Escape on desktop and tapping outside the phone sheet. Keep editing preserves the typed note. Discard closes the editor. Reopening the same editor reloads the saved note and allows a clean close. Both cases observe only booking reads, zero queued writes and the same saved record.

All 397 focused tests, scoped lint, format, typecheck and four source checks passed. The source-bound local build at `b0fc25487` emitted 414 byte-identical JS and CSS bundles. Next, review the remaining legacy Bookings panel dependencies and test coverage. [Coverage and next step](legacy-reservation-retirement-audit.md#native-booking-editor-discard).

## Legacy Bookings panel retirement review

The dependency review identifies five files with four internal references and zero outside consumers. Shared details, editors, timeline types, and import data remain in their existing ownership. The historical Published import and draft scenarios can be replayed from `1e1c1c9e9`.

All 859 focused tests passed, including 17 legacy cases. The import review examined 14,007 sources and found the candidates outside the 6,096 reachable nodes. The four source checks and read-only translation simulation passed. Next, rehearse the five-file retirement and compare the retained tests and local build output. [Coverage and exact file list](legacy-reservation-retirement-audit.md#legacy-bookings-panel-retirement-review).

## Legacy Bookings list retirement

The isolated rehearsal removed the exact five files identified by the review. Commit `418423afb` applies that removal on the integration branch. All 842 retained cases matched and passed. The 17 legacy cases remain replayable from `1e1c1c9e9`. The application reaches the same 6,096 source nodes and retained source bytes.

Typecheck, strict, layer, offline, size, translation and RTL checks passed, along with four source checks. The local build at `06be06459` emitted identical JS and CSS. The duplication report fell from 11,743 lines across 212 files to 11,589 across 208. Duplication remains a release gate. Next, review the legacy timeline detail reference in the Family controller. [Verification and old case replay](legacy-reservation-retirement-audit.md#legacy-bookings-list-retirement).

## Legacy timeline detail reference review

The controller's only timeline detail ref read is in an unused sidebar element. The ref has no component binding. An erased type import is the detail module's sole consumer. The active Family tab refresh and the native desktop and phone planner use their own paths.

All 582 focused tests and four source checks passed. The 6,096-node entry graph matches the preceding build source. Next, rehearse the detail module deletion and three controller line removals. [Evidence and retirement scope](legacy-reservation-retirement-audit.md#legacy-timeline-detail-reference-review).

## Legacy timeline detail retirement

Commit `9261c1038` deletes the unused timeline detail module and the controller's type import, ref and sidebar callback. All 582 planner cases passed before and after, including the reservation refresh when returning to Plan. The application entry graph still reaches 6,096 nodes.

Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. The local build at `e0fc78978` changed one generated JavaScript call and kept all 14 stylesheets byte-identical. The duplication report still shows 11,589 lines in 208 files. Next, review the remaining legacy day sidebar. [Verification](legacy-reservation-retirement-audit.md#legacy-timeline-detail-retirement).

## Legacy day sidebar review

The legacy day sidebar creates an element with no reader. The native desktop and phone planners use their existing components. The qualified build still creates the legacy reservation type map. Simulating removal of the sidebar import disconnects 10 files in the source graph, including the sidebar itself.

All 1,021 focused tests and four source checks passed. The next rehearsal targets the legacy sidebar file and its controller import, unused element and reservation type map. [Evidence and source scope](legacy-reservation-retirement-audit.md#legacy-day-sidebar-review).

## Legacy day sidebar retirement

Commit `ceef95bbd` removes the unused day sidebar module, the discarded JSX element and its reservation type map. The same 1,021 focused tests passed before and after. The application graph matches the 10-node reduction predicted in the review. Nine of those source files remain available to other source and test callers.

Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. The local build at `7f3c56118` preserves all 14 stylesheets and creates one lazy shared `planParts` chunk. All 401 emitted JavaScript modules link offline without evaluation. The duplication report remains at 11,589 lines in 208 files. Next, review the old Places sidebar. [Verification](legacy-reservation-retirement-audit.md#legacy-day-sidebar-retirement).

## Legacy Places sidebar review

The legacy Places element has no consumer. The desktop Places list, phone browser and Family map use their own paths. The import still brings in global mascot CSS also used by the phone UI.

All 931 focused tests and four source checks passed. The next two-file rehearsal preserves the existing mascot stylesheet import and checks the emitted styles and the live Places surfaces before applying the removal. [Evidence and source scope](legacy-reservation-retirement-audit.md#legacy-places-sidebar-review).

## Legacy Places sidebar retirement

Commit `b1c074e6a` deletes the unused Places sidebar and its controller element and planned-place memo. The controller imports the existing mascot stylesheet directly. All 931 focused tests match the prior run, and the application graph retains the stylesheet while losing the 13 expected nodes.

Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. The local build at `d8ab29170` preserves all 14 stylesheets byte for byte. All 402 JavaScript modules link offline. Duplication remains at 11,589 lines in 208 files. Next, review the disconnected legacy row and header, which still contribute to that report. [Verification](legacy-reservation-retirement-audit.md#legacy-places-sidebar-retirement).

## Legacy Places row and header review

The legacy Places row and header have no callers. The native versions remain reachable and own the live search, filtering, selection, category and assignment controls. The two-file simulation clears 145 copied lines across four findings. It preserves the translation verdict and all 3,024 generated utility rules.

All 1,006 focused tests and four source checks passed. Next, rehearse deleting the two files and verify the full build and duplication report before applying. [Evidence and exact scope](legacy-reservation-retirement-audit.md#legacy-places-row-header-review).

## Legacy Places row and header retirement

Commit `ba06c0c1d` deletes the two disconnected legacy Places components. All 1,006 focused tests match, along with the 6,073-node application graph. The source-bound build at `fc506a7a3` emits 416 byte-identical JavaScript and CSS bundles.

Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. The full duplication report clears 145 copied lines, falling from 11,589 lines across 208 files to 11,444 across 204. The review's estimate matches the exact result. Next, trace the legacy mascot and its wrappers while preserving the shared stylesheet. [Verification](legacy-reservation-retirement-audit.md#legacy-places-row-header-retirement).

## Legacy mascot and Journey consumer review

The legacy mascot and seven dependent files form a closed group outside the application graph. The live phone mascot, loading and empty states, and native Journey routes remain reachable. The Family controller imports the existing mascot stylesheet directly.

The source-only simulation clears 1,110 copied lines, including the mascot and legacy public Journey pairs. It drops seven utility selectors used only by the candidate files. All other generated utility declarations retain their order. The focused suites passed 670 tests, with 38 existing Journey cases skipped. Four source checks passed. Next, rehearse the eight deletions and compare the full build. [Review and exact scope](legacy-reservation-retirement-audit.md#legacy-mascot-journey-consumer-review).

## Legacy mascot and Journey retirement

Commit `83dde2076` deletes the eight reviewed legacy files. All 670 passing test cases and 38 existing skips match in 19 suites. The source graph retains the same 6,073 nodes, and all 402 emitted JavaScript bundles match after resolving generated filenames.

Build `690672913` removes exactly the seven reviewed utility selectors. The retained entry stylesheet content and order match, including the mascot fallback. Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. Duplication fell from 11,444 lines across 204 files to 10,334 across 200. Next, trace the remaining legacy Journey provider picker. [Verification](legacy-reservation-retirement-audit.md#legacy-mascot-journey-retirement).

## Legacy Journey provider picker review

The legacy Journey provider picker has no callers. Journey and Studio use the current picker. All 403 tests and four source checks passed. The simulated deletion clears 131 copied lines and five legacy utility rules. The translation verdict and retained utility rules match.

Next, rehearse deleting only the legacy picker and compare the full build and duplication scan. [Evidence and source scope](legacy-reservation-retirement-audit.md#legacy-journey-provider-picker-review).

## Legacy Journey provider picker retirement

Commit `0e46a47e3` deletes only the disconnected legacy provider picker. All 403 focused cases and the 6,073-node application graph match the review checkpoint. The current Journey and Studio picker remains reachable.

Build `9c13c6da6` removes only the five expected utility selectors. The retained CSS order and the JavaScript bundles match after resolving generated filenames. Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. Duplication fell from 10,334 lines across 200 files to 10,203 across 198. Next, trace the remaining legacy Journey settings and sharing components. [Verification](legacy-reservation-retirement-audit.md#legacy-journey-provider-picker-retirement).

## Legacy Journey settings and sharing review

The legacy settings dialog imports the legacy share section, and neither has a caller outside the pair. Native Journey settings and public sharing remain in the live graph. All 269 focused tests and four source checks passed. Simulated removal clears 67 copied lines and preserves translation coverage and retained utility rules.

Next, rehearse the two-file removal with the full build and artifact checks. [Evidence and source scope](legacy-reservation-retirement-audit.md#legacy-journey-settings-sharing-review).

## Legacy Journey settings and sharing retirement

Commit `a7ba11936` deletes the two reviewed legacy files. All 269 focused cases and the 6,073-node application graph match the review. The desktop and phone settings and public sharing paths remain reachable.

Build `e84c496fb` drops exactly the 12 documented utility selectors. The retained CSS and JavaScript bundles match after resolving generated filenames. Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. Duplication fell to 10,136 lines in 194 files. Next, review the legacy Journey entry card and mood configuration. [Verification](legacy-reservation-retirement-audit.md#legacy-journey-settings-sharing-retirement).

## Legacy Journey entry card and mood configuration review

Neither legacy file has callers. The native card and its live dependencies are reachable, and the separate native mood module still has a unit test. All 396 focused tests and four source checks passed. Simulated removal clears 105 copied lines and leaves the same translation verdict and retained utility rules.

Next, rehearse the two-file removal and compare the full build. [Evidence and source scope](legacy-reservation-retirement-audit.md#legacy-journey-card-mood-review).

## Legacy Journey entry card and mood configuration retirement

Commit `aa1d92454` deletes the two reviewed legacy files. All 396 focused cases and the 6,073-node graph match the review. The native card, its mood and weather chips, and the separate native mood module and test are preserved.

Build `b76cac8d9` drops exactly the eight documented utility selectors. The retained CSS and JavaScript bundles match after resolving generated filenames. Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. Duplication fell to 10,031 lines in 191 files. Next, review the legacy Booking and Transport editors and the old Transport regression suite. [Verification](legacy-reservation-retirement-audit.md#legacy-journey-card-mood-retirement).

## Legacy Booking and Transport editor review

The legacy Booking pair has no outside callers. The old Transport editor is still used by its behavior suite. All 556 focused tests and four source checks passed. The Booking-only simulation clears 342 copied lines with matching utility CSS and translation checks.

Next, rehearse deleting the Booking editor and frame. Keep the Transport files and their coverage in place. [Evidence and source scope](legacy-reservation-retirement-audit.md#legacy-booking-transport-editor-review).

## Legacy Booking editor and dialog frame retirement

Commit `15de560d5` deletes the two reviewed Booking files. The 6,073-node runtime graph and all 556 cases match, including all 10 retained legacy Transport cases.

The local build at `dabb75795` produces 416 byte-identical JavaScript and CSS bundles. Typecheck, strict, layer, offline, size, translation, RTL and four source checks passed. Duplication fell by 342 lines to 9,689 in 188 files. Next, verify the remaining Transport assertions against the active desktop and phone routes. [Verification](legacy-reservation-retirement-audit.md#legacy-booking-editor-retirement).

## Active Transport editor regressions

Commit `7a9d9bd0e` strengthens midnight, multi-stop and expense-failure coverage. The shared planner callback refuses raw Transport writes under the Family read port before HTTP or queue effects. All 643 focused tests and four source checks passed on the final files. Typecheck and strict passed before the last test-only toast refinement.

Next, verify the remaining Family endpoint-identity, automated mode and attachment/focus assertions. The legacy suite and both source files stay together. [Coverage and handoff](legacy-reservation-retirement-audit.md#active-transport-editor-regressions).

## Family Transport endpoint and automated transit review

The six local probes confirm that Family transit search returns 501 and the installed planner refuses raw Transport create/edit. Canonical train endpoint links survive reading. The older mapper can copy a stop link by row position when a stop is removed. 516 existing focused cases passed across 15 suites. All four source checks passed.

Next, gate the unsupported Family Transport actions on desktop and phone while keeping their read paths. [Findings and handoff](legacy-reservation-retirement-audit.md#family-transport-endpoint-and-automated-transit-review).

## Family Transport capability gates

Commit `54712204d` gates unsupported Family actions through the Transport list, shared details, phone cards and day sheet, connector menu and trip shortcuts. All 1,057 focused tests across 26 suites, typecheck and the source checks pass. The exact upstream planner templates remain protected. The remaining native launchers and mounts need reviewed changes in four of those templates. [Verification and handoff](legacy-reservation-retirement-audit.md#family-transport-capability-gates).

## Native Family Transport launchers

Commit `c9b04c8ef` hides the remaining unsupported Family Transport actions on desktop and phone. Saved train and transit detail, including the narrow desktop drawer, remains accessible. All four UI regressions reproduced on the old templates. The final source passed 1,061 focused tests, 67 source-contract cases, the four source guards and the source-bound local build. [Verification and handoff](legacy-reservation-retirement-audit.md#native-family-transport-launchers).

Next, reproduce mixed timeline reorder with saved Transport and check for partial writes.

## Mixed Family timeline reorder review

Twelve layout probes and two installed-cohort probes reproduced a partial visit commit after single-leg reservation or note refusal, an early multi-leg refusal, and phone optimism retained after two failed recovery reads. All 608 existing related tests and the four source checks passed. The application tree matches the prior source. [Verification and repair handoff](legacy-reservation-retirement-audit.md#mixed-family-timeline-reorder-review).

Next, preflight the intended order before temporary state, time removal or any write, with visit-only moves retained where they can produce the requested order.

## Family timeline reorder preflight

Commit `acd17c617` prevents Family mixed-order partial saves. It accepts visit-only projections that preserve the requested visible order, retains qualified Undo and keeps saved notes and bookings intact. 620 focused tests including the installed Family adapter case, the source guards and a source-bound fixture build passed. [Verification](legacy-reservation-retirement-audit.md#family-timeline-reorder-preflight).

Next, remeasure the application duplication gate and use the result to scope the next cleanup.

## Application duplication recheck

The current branch has 9,689 copied lines across 188 files. All per-file counts match the previous check. The isolated simulation found that dropping the unused legacy chunk retry helper would remove 116 copied lines without changing other counts. All 324 focused cases and the native presentation check passed. [Verification and handoff](legacy-reservation-retirement-audit.md#application-duplication-recheck).

Next, rehearse and verify retiring just that unused helper.

## Unused Family chunk retry copy retirement

Commit `2b0ad60c7` removes the unused copy. All 324 focused tests passed before and after. The two fresh fixture builds have 417 byte-identical application bundles. Duplication dropped by 116 lines to 9,573 in 186 files. [Verification and handoff](legacy-reservation-retirement-audit.md#unused-family-chunk-retry-copy-retirement).

Next, review the retained LoginWorld component against native sign-in.

## Unused Family sign-in animation retirement

Commit `146380dac` removes the disconnected animation and its dot data. All 216 focused tests passed before and after. The two fixture builds share 417 byte-identical application bundles. Duplication fell by 590 lines to 8,983 in 182 files. [Verification and handoff](legacy-reservation-retirement-audit.md#unused-family-sign-in-animation-retirement).

Next, trace the retained password recovery pages against the active routes.

## Unused Family password recovery pages retirement

Commit `c6014bb9d` removes the disconnected pages and hooks. All 239 focused cases passed before and after, and the fixture builds share 417 byte-identical JavaScript and CSS bundles. Duplication fell by 377 lines to 8,606 in 178 files. [Verification and handoff](legacy-reservation-retirement-audit.md#unused-family-password-recovery-pages-retirement).

Next, trace both date and time picker copies through current callers.

## Date picker caller and validation review

Both picker copies are active. The older copy supplies the Family proposal start and end dates on desktop and phone. Nine local probes confirmed the date format and week-start differences and reproduced impossible ISO dates reaching the proposal payload. All 525 existing cases and four source guards passed. [Findings and handoff](legacy-reservation-retirement-audit.md#date-picker-caller-and-validation-review).

Next, validate actual calendar dates in both pickers and in the proposal payload before evaluating consolidation.

## Calendar date validation for pickers and proposals

Commit `db050b0b7` rejects impossible typed dates in both pickers and invalid proposal payloads before a request. All 539 client cases, 35 backend cases, both typechecks, the quality checks and the bound fixture build passed. [Verification and handoff](legacy-reservation-retirement-audit.md#calendar-date-validation-for-pickers-and-proposals).

Next, verify whether the proposal dialog can use the current native picker on desktop and phone.

## Native date picker in Family proposal forms

Commit `ef18d06ee` connects the desktop and phone Family proposal dialogs to the native date picker. All 545 focused tests, typecheck, source guards and the local fixture build passed. [Verification and handoff](legacy-reservation-retirement-audit.md#native-date-picker-in-family-proposal-forms)

Next, trace how Family date format and week start are saved and reloaded.

## Family date preference account boundaries

Commit `27ffa120f` clears date format and week start at the Family account boundary. Six reproduced failures now pass. All 670 focused tests, typecheck, source checks and the bound local fixture build passed. [Verification and handoff](legacy-reservation-retirement-audit.md#family-date-preference-account-boundaries)

Next, qualify account-owned persistence for date format and week start on the local Supabase schema. The site still uses in-session choices today.

## Account-owned Family date display preferences

The new account preferences passed isolated migration, access, signed-session and competing-write checks. Website source `b212ee8e3` passed the native route regressions and bound build. [Verification and rollout dependency](legacy-reservation-retirement-audit.md#account-owned-family-date-display-preferences)

Next, review the retained legacy date and time picker imports for any active consumers.

## Retained date and time picker review

Neither legacy picker is reachable from the website. All 940 existing focused tests, 11 comparison probes and four source checks passed. The five-file date-only simulation found 895 fewer copied lines. [Review and exact removal scope](legacy-reservation-retirement-audit.md#retained-date-and-time-picker-review)

Next, verify and retire the five disconnected date picker files together. Keep the old Transport suite and clock for a separate review.

## Disconnected legacy date picker removal

Commit `70ca79653` removes the five disconnected date files and the seven duplicate legacy cases. All 933 remaining tests, typecheck, source guards and the baseline-to-candidate build comparison passed. Duplicate lines fell by 895 to 7,711. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-date-picker-removal)

Next, review the retained Transport editor, clock and ten-case regression suite.

## Retained Transport editor coverage

Commit `4438a1a9b` protects exact station identities and the saved Family train's linked attachment and Costs focus handoff on current paths. All 1,721 focused tests, typecheck and source checks passed. The ten-case map separates current coverage from held writer requirements. [Verification and handoff](legacy-reservation-retirement-audit.md#retained-transport-editor-coverage)

Next, rehearse the three disconnected Transport source deletions and the obsolete suite together.

## Disconnected legacy Transport editor removal

Commit `990636515` retires the three disconnected components and their old suite. All 1,711 surviving tests match the prior outcomes. The JavaScript, styles and offline assets are byte-identical, and duplicate lines fell by 318 to 7,393. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-transport-editor-removal)

Next, review the retained System Notice banner and action helpers against the mounted native host.

## System Notice banner and actions review

The TypeScript scan found three disconnected legacy modules. All 406 local tests and probes pass. The mounted TREK host and both notice stores are reachable. A three-file omission projects 361 fewer duplicate lines. [Verification and handoff](legacy-reservation-retirement-audit.md#system-notice-banner-and-actions-review)

Next, rehearse only those three source deletions.

## Disconnected System Notice removal

Commit `15a562957` removes the three audited modules. All 406 local checks returned the same outcomes. The entry stylesheet drops two unused utilities, and the JavaScript and offline assets match after resolving filenames. The full scan confirms 7,032 duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-system-notice-removal)

Next, review the legacy Photo Providers panel against the current desktop and phone settings.

## Legacy Photo Providers panel review

The scan found one unused legacy panel whose only outside reference is its translation file-list entry. All 225 local tests and probes passed. Simulated omission projects 313 fewer duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#legacy-photo-providers-panel-review)

Next, rehearse deleting the legacy panel and removing the two stale translation exceptions generated by its file-list entry.

## Disconnected Photo Providers removal

Commit `983277d7b` removes the legacy panel and the one file-list row that generated its two translation exceptions. All 225 local checks reproduce their earlier results. The generated site assets are byte-identical. The full scan confirms 6,719 duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-photo-providers-removal)

Next, review the legacy Appearance Settings panel against both current settings shells.

## Appearance Settings session fix and legacy review

Commit `7621870e1` discards pending theme saves from retired sessions. The three regressions, 230 focused tests, boot fixtures, build and source checks pass. The legacy panel has no importer. Simulated omission projects 175 fewer duplicate lines. [Verification and handoff](legacy-reservation-retirement-audit.md#appearance-settings-session-fix-and-legacy-review)

Next, rehearse deleting the legacy panel from the fixed checkpoint.

## Disconnected Appearance Settings removal

Commit `0b3aeddae` removes the one disconnected panel. All 230 tests and three boot fixtures reproduce the fixed checkpoint. The build comparison verified the JavaScript, stylesheet and offline assets. The full scan confirms 6,544 duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-appearance-settings-removal)

Next, review the legacy AirTrail connection settings panel.

## Legacy AirTrail connection settings review

The scoped scan found one unused settings component. All 368 local tests and probes passed. Omitting it projects 132 fewer duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#legacy-airtrail-connection-settings-review)

Next, rehearse deleting only that panel.

## Disconnected AirTrail connection settings removal

Commit `37d3ced2b` removes the one disconnected settings panel. All 368 tests and probes reproduce the reviewed results. The build comparison verified the JavaScript, stylesheet and offline assets. The full scan confirms 6,412 duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-airtrail-connection-settings-removal)

Next, review the legacy personal Notifications settings panel.

## Personal Notifications settings repair and legacy review

Commit `5da2a9805` connects Family personal settings to the in-app inbox on desktop and phone. The two new checks and 489 existing regressions pass. The build scanner also passes after the inactive recovery guard fix. The disconnected legacy tab projects 180 fewer duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#personal-notifications-settings-repair-and-legacy-review)

Next, rehearse deleting only the disconnected legacy personal Notifications tab.

## Disconnected legacy personal Notifications tab removal

Commit `71cecc4c4` removes the single disconnected tab. All 491 cases reproduce the reviewed results. The generated website assets match byte for byte. The full scan confirms 6,232 duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-personal-notifications-tab-removal)

Next, review the legacy Plugin Settings tab against desktop and phone plugin settings.

## Plugin Settings deep-link repair and legacy review

Commit `95e367cca` opens General for unavailable Plugins deep links and honors them when the plugin list allows. All 235 focused cases and both Family adapter probes pass. Omitting the disconnected legacy tab and its activity panel projects 82 fewer duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#plugin-settings-deep-link-repair-and-legacy-review)

Next, rehearse the two legacy deletions together.

## Disconnected legacy plugin settings removal

Commit `89565e4b5` removes the two disconnected plugin settings modules. All 237 checks reproduce the reviewed results. The generated website comparison passes and the full scan confirms 6,150 duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-plugin-settings-removal)

Next, review the legacy Map Settings components against the active desktop and phone settings.

## Family map settings persistence review

The local desktop and phone probes reproduced an acknowledged map save that is lost on a fresh load. The isolated member RPC test verifies the existing named-option contract. All 239 focused cases and three probes pass. [Evidence and repair handoff](legacy-reservation-retirement-audit.md#family-map-settings-persistence-review)

Next, repair Family map choice loading and saving before any legacy Map Settings deletion.

## Durable Family Map Settings

Commit `510b6662f` saves member map choices through the existing RPC on desktop and phone and projects the confirmed choice into the native maps. All 522 tests, the isolated RPC check and the source-bound build pass. [Verification and handoff](legacy-reservation-retirement-audit.md#durable-family-map-settings)

Next, verify retirement of the legacy Map Settings wrapper and TREK tab.

## Disconnected legacy map settings removal

Commit `a33b406b6` removes the two disconnected map settings modules. The same 522 cases pass, the build comparison is verified and the full scan reports 6,124 duplicated lines. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-map-settings-removal)

Next, review the legacy Offline settings panel against desktop and phone.

## Offline settings preparation guard and legacy review

Commit `ce23e489d` keeps the app online after skipped or failed preparation and prevents a retired session from flipping the persisted mode. All 298 local cases pass. The legacy Offline panel has no external reference. [Verification and handoff](legacy-reservation-retirement-audit.md#offline-settings-preparation-guard-and-legacy-review)

Next, rehearse removing only that disconnected panel and verify the generated website.

## Disconnected legacy Offline settings removal

Commit `c7fa56a84` removes the disconnected Offline settings panel. The same 298 cases pass, the generated website comparison passes and duplication still measures 6,124 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-offline-settings-removal)

Next, review the legacy passkeys section against desktop and phone account settings.

## Family passkeys settings boundary and legacy review

Commit `ab6d13e58` keeps the unavailable Passkeys section off both Family account screens and avoids its unnecessary credential request. Both new regressions and 453 existing cases pass. The legacy Passkeys section has no external reference. [Verification and handoff](legacy-reservation-retirement-audit.md#family-passkeys-settings-boundary-and-legacy-review)

Next, rehearse removing only the disconnected legacy Passkeys section.

## Disconnected legacy Passkeys section removal

Commit `7c9ed4364` removes the disconnected Passkeys section. The same 455 local cases pass, the generated website comparison passes and duplication falls to 6,040 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-passkeys-section-removal)

Next, review legacy Vacay settings against the active desktop and phone views.

## Family Vacay sharing boundary and legacy settings review

Commit `e46b53cfc` removes refused standalone sharing requests and controls from Family Vacay. Both native routes pass through the real adapter in local tests, and all 299 focused cases pass. The preference probe confirms working mapped saves as well as refused personal year and school-provider writes. [Verification and handoff](legacy-reservation-retirement-audit.md#family-vacay-sharing-boundary-and-legacy-settings-review)

Next, fix Family settings capability and reviewer gating before considering legacy removal.

## Family Vacay settings permissions and database grant rehearsal

Commit `fae501763` aligns desktop and phone settings with the Family reviewer and capability contract. All 305 local tests pass. The isolated holiday table grant is missing, and a rollback-only rehearsal verified the narrow correction. [Verification and handoff](legacy-reservation-retirement-audit.md#family-vacay-settings-permissions-and-database-grant-rehearsal)

Next, verify the current shared backend grants and qualify the calendar table migration before considering legacy Vacay deletion.

## Family holiday-calendar grant qualification

Shared backend `be653a4ab` adds the missing table grant. The isolated 153-migration stack passes SQL and actual signed-in PostgREST checks for reads, reviewer changes, denied writes, MFA and Family isolation. [Verification and handoff](legacy-reservation-retirement-audit.md#family-holiday-calendar-grant-qualification)

Next, verify native desktop and phone Vacay using the migrated database and real local sessions. Then reconsider legacy Vacay retirement.

## Signed-in Family Vacay browser acceptance

Shared backend `3e7087e0a` repairs calendar-entry access. Six signed-in Chromium scenarios pass across desktop and phone, including shared settings, reviewer persistence, member read-only settings and personal-day changes. [Verification and handoff](legacy-reservation-retirement-audit.md#signed-in-family-vacay-browser-acceptance)

Next, qualify removal of the disconnected legacy Vacay page and settings panel.

## Disconnected legacy Vacay page and settings removal

Commit `e645edd1b` removes the disconnected page and panel. The same 308 cases pass, the source-bound builds compare successfully and duplication is 5,913 copied lines across 148 files. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-vacay-page-and-settings-removal)

Next, review the remaining legacy Vacay calendar widgets, state and session hooks.

## Remaining legacy Vacay widget and state review

Nine legacy Vacay files are disconnected from the app. The old store has one test-helper import. All 322 baseline cases across 22 suites pass, including the reset helper's consumers. [Verification and handoff](legacy-reservation-retirement-audit.md#remaining-legacy-vacay-widget-and-state-review)

Next, rehearse removing the nine files and the legacy store references in the reset helper.

## Remaining legacy Vacay widget and state removal

Commit `930810184` removes the nine disconnected Vacay files and retires the old store reset. The same 322 cases pass, the source-bound builds compare successfully and duplication is 5,876 copied lines across 146 files. [Verification and handoff](legacy-reservation-retirement-audit.md#remaining-legacy-vacay-widget-and-state-removal)

Next, audit the retained Family file manager and its assignment and preview components.

## Legacy Family file manager review and Markdown preview repair

Commit `69346f9b9` clears rendered Markdown when its preview lease retires. All 518 local cases pass. The 22 legacy Files paths are disconnected. [Verification and handoff](legacy-reservation-retirement-audit.md#legacy-family-file-manager-review-and-markdown-preview-repair)

Next, repair the native first-link assignment contract before qualifying the legacy Files removal.

## Native Family file assignment through link records

Commit `fa57e13c1` repairs first and additional Family assignments and unlinks on both layouts. All 684 local cases pass, including the existing offline recovery hold. [Verification and handoff](legacy-reservation-retirement-audit.md#native-family-file-assignment-through-link-records)

Next, qualify removal of the 22 disconnected legacy Files modules.

## Disconnected legacy Files modules retired

Commit `72c8c1cb9` removes the 22 audited files. All 684 local cases match, the reachable source graph is identical, and the source-bound builds pass comparison. Duplication falls to 5,631 lines across 142 files. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-files-modules-retired)

Next, audit the copied Collections API and catalog picker.

## Copied Collections API and catalog picker audit

The two candidates and their copied callers form a closed 12-file group. All 1,380 local tests and fixture probes pass. The next packet rehearses deletion with matching runtime and artifact evidence. [Verification and handoff](legacy-reservation-retirement-audit.md#copied-collections-api-and-catalog-picker-audit)

## Disconnected legacy Collections modules retired

Commit `346e28aa9` removes the 12 audited files. All 1,380 local cases, the reachable source graph and both source-bound builds match. Duplication falls to 5,348 lines across 136 files. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-collections-modules-retired)

Next, audit the copied Collab modules and the Family feature gate.

## Family Collab startup guard and copied module audit

Commit `22d64e1c7` blocks startup and programmatic entry for disabled Family Collab. All 781 local cases, source checks and the build pass. The 27 disconnected copies are ready for a removal rehearsal. [Verification and handoff](legacy-reservation-retirement-audit.md#family-collab-startup-guard-and-copied-module-audit)

## Disconnected legacy Collab modules retired

Commit `f1cc5958b` removes the 27 audited files. All 781 local cases, the reachable source graph and both source-bound builds pass comparison. Duplication falls to 4,964 lines across 120 files. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-collab-modules-retired)

Next, audit the remaining copied Costs helpers and components.

## Family Costs settlement display repair and copied module audit

Commit `0f5d27694` reconciles legacy payments across the Costs balances and final budget. All 1,031 local cases, source checks and the build pass. The ten disconnected copies are ready for a removal rehearsal. [Verification and handoff](legacy-reservation-retirement-audit.md#family-costs-settlement-display-repair-and-copied-module-audit)

## Disconnected legacy Costs modules retired

Commit `f29278f73` removes the 10 audited files. All 1031 local cases, the reachable source graph and both source-bound builds pass comparison. Duplication falls to 4,864 lines across 118 files. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-costs-modules-retired)

Next, audit the copied shared dialog shell and its callers.

## Native dialog interaction repair and copied shell audit

Commit `d753fa4b2` repairs discard focus, focus return and backdrop drags. All 836 local cases, source checks and the build pass. The copied shell and its 16 dependent files form a closed review group, including the historical test. [Verification and handoff](legacy-reservation-retirement-audit.md#native-dialog-interaction-repair-and-copied-shell-audit)

## Disconnected copied dialog shell and callers retired

Commit `0910fa1c1` removes the 16 audited runtime files and their two-case historical suite. All 834 local cases, the reachable source graph and both source-bound builds pass comparison. Duplication falls to 4,740 lines across 114 files. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-copied-dialog-shell-and-callers-retired)

Next, audit the copied map compass and control placement.

## Phone map compass repair and copied compass audit

Commit `6e17d073c` keeps reset available on a tilted phone map facing north. All 719 local map and integration cases pass. The copied compass has no consumers and is ready for a removal rehearsal. [Verification and handoff](legacy-reservation-retirement-audit.md#phone-map-compass-repair-and-copied-compass-audit)

## Disconnected legacy map compass retired

Commit `85e7b8b0b` removes the audited copy. All 719 local map cases, the reachable graph and both source-bound builds pass comparison. Duplication falls to 4,687 lines across 112 files. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-legacy-map-compass-retired)

Next, review the native and Family map category controls and the active catalog path.

## Native Family map category availability and legacy bridge review

Commit `87eac52a0` shows supported categories on the native Family map. All 1,366 client and 24 reader cases pass, including both real-SDK fixture category searches. The copied control is referenced by the old controller map callback. [Verification and handoff](legacy-reservation-retirement-audit.md#native-family-map-category-availability-and-legacy-bridge-review)

Next, trace the unused Family map bridge and its callback dependencies.

## Legacy Family map bridge and controller callback audit

The bridge has no application caller. The exact prototype preserves the fallback controller and settings maps. All 573 retained cases match, and the two historical cases passed at the baseline. Duplication projects 49 fewer lines. [Verification and handoff](legacy-reservation-retirement-audit.md#legacy-family-map-bridge-and-controller-callback-audit)

Next, qualify the 17-file prototype with both source-bound web builds and the existing release guards.

## Disconnected Family map bridge and callback retired

Commit `81b000139` retires the audited bridge and callback. All 573 retained and 48 supplemental cases pass. Both builds preserve the entry points and verify marker-cluster styling on each active map route. Duplication falls to 4,638 lines across 110 files. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-family-map-bridge-and-callback-retired)

Next, review the retained Family Settings and admin map preview renderers.

## Family map preview fallback and renderer review

Commit `a63e70f46` restores the desktop, phone and admin previews when GL cannot start. All map cases pass. The broader run exposed an independent standalone invite race with a deterministic reproduction. [Verification and handoff](legacy-reservation-retirement-audit.md#family-map-preview-fallback-and-renderer-review)

Next, repair the stale Admin invite list read. The follow-up renderer review is retained after it.

## Standalone desktop and phone Admin invite list repair

Commit `fdd4fb709` fixes the stale invite-list read and covers create, delete, a failed refresh and clipboard behavior. The full 546-case focused cohort passes. [Verification and handoff](legacy-reservation-retirement-audit.md#standalone-desktop-and-phone-admin-invite-list-repair)

Next, return to the Family map preview consolidation.

## Native map preview startup feedback and raster attribution

Commit `11c83853c` reports current Mapbox and MapLibre startup failures and displays the linked CARTO credit on the native map. All 594 focused cases, release source checks and the local build pass. [Verification and handoff](legacy-reservation-retirement-audit.md#native-map-preview-startup-feedback-and-raster-attribution)

Next, rehearse the Family member and Admin default preview cutover before removing copies.

## Family member and Admin native map preview switch

Commit `4a5bd4d44` shares the native GL and raster previews across desktop, phone and Admin. All 625 focused cases and four loopback Chrome checks pass. The qualified build drops both legacy SDK chunks. [Verification and handoff](legacy-reservation-retirement-audit.md#family-member-and-admin-native-map-preview-switch)

Next, audit the disconnected GL preview and its lazy entry points for retirement.

## Disconnected Family GL settings preview retired

Commit `dd889f948` removes the disconnected GL preview and its lazy bindings. Both builds match across all 391 chunks, and the same 729 cases pass on both trees. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-family-gl-settings-preview-retired)

Next, trace the remaining legacy Atlas and Journey map wrappers and engine bindings.

## Legacy GL map and dependency retirement rehearsal

The isolated prototype removes 14 disconnected GL modules and the old SDK aliases. All 1,134 retained cases pass, including all 143 Leaflet cases in the mixed suites. The build comparison accounts for one unused spacing rule and the renamed chunks it affects. [Verification and handoff](legacy-reservation-retirement-audit.md#legacy-gl-map-and-dependency-retirement-rehearsal)

Next, apply and qualify the rehearsed removal.

## Legacy GL map and SDK aliases retired

Commit `34209bdaf` applies the rehearsed map and dependency cleanup. All 1,134 retained tests, standalone Leaflet captures and the two source-bound builds pass comparison. Duplication falls to 4,599 lines across 109 files. [Verification and handoff](legacy-reservation-retirement-audit.md#legacy-gl-map-and-sdk-aliases-retired)

Next, audit the standalone Admin defaults preview before touching the copied Leaflet map.

## Standalone Admin defaults route audit

Standalone desktop and phone already use TREK’s native defaults. The two-file prototype disconnects the copied fallback from Family Admin. All 1,205 local regression cases and four Chrome fixture checks pass. [Verification and handoff](legacy-reservation-retirement-audit.md#standalone-admin-defaults-route-audit)

Next, apply and qualify the rehearsed change. Keep the copied renderer and its test coverage until their callers are reviewed.

## Family Admin defaults routing cleanup

Commit `06b8732f3` applies the rehearsed fallback removal. All 1,205 focused tests, the four Chrome fixture checks and the source-bound build pass. The build excludes the copied preview. [Verification and handoff](legacy-reservation-retirement-audit.md#family-admin-defaults-routing-cleanup)

Next, audit the copied Leaflet group and its remaining test coverage.

## Disconnected Family Leaflet retirement rehearsal

The prototype retires 14 disconnected client files and four renderer-only suites, and keeps seven dependencies with other consumers. All 1,446 retained cases pass. Both builds match apart from the expected build source commit. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-family-leaflet-retirement-rehearsal)

Next, apply and qualify the exact rehearsed patch.

## Disconnected Family Leaflet preview retired

Commit `9376fd773` applies the exact retirement patch. All 1,446 retained cases, the shared icon and track tests, and both source-bound builds pass. Duplication falls to 4,396 lines across 104 files. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-family-leaflet-preview-retired)

Next, audit the copied Admin packing-template and category configuration fallbacks.

## Admin configuration fallback audit

Standalone Personalization uses the native controls, and the Family route uses its Family managers. The prototype drops the unreachable fallback imports. All 1,548 client and eight Family adapter tests pass. [Verification and handoff](legacy-reservation-retirement-audit.md#admin-configuration-fallback-audit)

Next, apply and qualify the exact tested patch before auditing the copied managers for removal.

## Family Admin Personalization fallback cleanup

Commit `72379766a` applies the tested fallback removal. All 1,548 client cases, eight backend adapter cases and the qualified build pass. [Verification and handoff](legacy-reservation-retirement-audit.md#family-admin-personalization-fallback-cleanup)

Next, audit the two disconnected managers and their helper imports for retirement.

## Disconnected Admin configuration panels retirement rehearsal

The two-file prototype removes the unused copies and keeps all six shared helpers. All 1,548 client and eight backend adapter tests pass. The two local builds match apart from their source commit. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-admin-configuration-panels-retirement-rehearsal)

Next, apply and qualify the exact two-file deletion.

## Disconnected Admin configuration panels retired

Commit `40d477ecb` applies the tested two-file deletion. The 1,548 client cases, eight Family adapter cases and both source-bound builds pass. Duplication falls to 4,056 lines across 100 files. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-admin-configuration-panels-retired)

Next, audit the copied standalone Admin Settings fallback.

## Admin Settings fallback audit

Standalone keeps the native Settings controls and Family keeps its identity and file-policy manager. All 1,642 focused client tests, 12 Family adapter tests and the prototype build pass. [Verification and handoff](legacy-reservation-retirement-audit.md#admin-settings-fallback-audit)

Next, apply and qualify the tested two-file change.

## Family Admin Settings fallback cleanup

Commit `dec975995` removes the unreachable Settings fallback. All 1,642 client cases, 12 Family backend cases and the qualified web build pass. [Verification and handoff](legacy-reservation-retirement-audit.md#family-admin-settings-fallback-cleanup)

Next, audit the copied Settings panel for retirement.

## Disconnected Admin Settings panel retirement rehearsal

The one-file prototype removes the unused Settings copy and keeps the shared Family dependencies. All 1,642 client and 12 backend adapter tests pass. Both builds match apart from their source commit. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-admin-settings-panel-retirement-rehearsal)

Next, apply and qualify the exact one-file deletion.

## Disconnected Admin Settings panel retired

Commit `aadd393ec` applies the audited Settings deletion. All 1,642 client and 12 backend adapter cases pass, and both source-bound builds match apart from their source commit. Duplication falls to 4,020 flagged lines. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-admin-settings-panel-retired)

Next, audit the copied standalone Admin Notifications fallback.

## Admin Notifications fallback audit

Standalone desktop and phone use the TREK notification preference endpoint. Family retains its own defaults and permissions. All 1,736 focused client cases, 17 Family adapter cases and the local prototype build pass. [Verification and handoff](legacy-reservation-retirement-audit.md#admin-notifications-fallback-audit)

Next, apply and qualify the exact tested two-file change.

## Family Admin Notifications fallback cleanup

Commit ae32def37 removes the unreachable Notifications fallback. All 1,736 client cases, 17 Family backend cases and the qualified web build pass. [Verification and handoff](legacy-reservation-retirement-audit.md#family-admin-notifications-fallback-cleanup)

Next, audit the three disconnected Notifications files for retirement.

## Disconnected Admin Notifications retirement rehearsal

The prototype removes the three unused copies and keeps their four shared dependencies. All 1,736 client and 17 backend adapter tests pass. The two builds match apart from their source commit. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-admin-notifications-retirement-rehearsal)

Next, apply and qualify the exact three-file patch.

## Disconnected Admin Notifications retired

Commit ce44ea51b applies the audited Notifications deletion. All 1,736 client and 17 backend adapter cases pass, and both source-bound builds match apart from their source commit. [Verification and handoff](legacy-reservation-retirement-audit.md#disconnected-admin-notifications-retired)

Next, make Family notification defaults visibly read-only for reviewers.

## Family notification defaults reviewer controls

Reviewers can read the current On or Off state. Managers can use the named toggle to save and reread the default. The six local notification route cases pass, alongside the 1,737 client and 17 backend adapter cases. [Verification and handoff](legacy-reservation-retirement-audit.md#family-notification-defaults-reviewer-controls)

Next, recheck the supported-core release blockers and identify the next repair.

## Supported-core release blocker recheck

The full format gate now passes after a 37-file formatting repair with equivalent normalized JavaScript. All 2,072 focused client cases and the qualified build pass. Duplication still flags 4,020 lines across 98 files. The supported-core preview retains its hosted prerequisites. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

Next, audit whether the copied Admin Plugins path can be disconnected while preserving native desktop and phone behavior and the plugin permission and trust regression coverage.

## Admin Plugins route audit

The route prototype removes the copied panel group and three dependencies from the web build and preserves native desktop and phone behavior. All 2,422 client cases, including the 42 legacy panel cases, pass. A separate source-only scan projects 754 fewer flagged lines after future deletion. [Verification and handoff](legacy-reservation-retirement-audit.md#admin-plugins-route-audit)

Next, apply and qualify the exact route patch with the test and tooling references retained.

## Admin Plugins route disconnection

Commit 2fae63312 applies the verified route patch. All 2,422 client cases, the qualified build and the source checks pass. The 42 legacy cases and their tooling reference stay available. [Verification and handoff](legacy-reservation-retirement-audit.md#admin-plugins-route-disconnection)

Next, check the remaining test and tooling references and map the legacy safeguards to native coverage before any file removal.

## Copied Admin Plugins retirement rehearsal

The ten-file prototype removes six disconnected copies and their translation reference, retains the Family policy tests and verifies the native coverage of the old renderer. All 2,393 client cases pass. Both builds match after accounting for the 16 unused CSS rules and their generated asset filenames. [Coverage, verification and handoff](legacy-reservation-retirement-audit.md#copied-admin-plugins-retirement-rehearsal)

Next, apply and qualify the exact rehearsed patch.

## Copied Admin Plugins retirement

Commit `81aa72830` applies the exact rehearsed patch. All 2,393 tests and source qualification pass. The two builds reproduce the verified 16 unused CSS rules and generated asset changes. Duplication now flags 3,266 lines across 94 files. [Verification and handoff](legacy-reservation-retirement-audit.md#copied-admin-plugins-retirement)

Next, review the repeated code in the two active offline database modules.

## Offline database duplication audit

Both offline database modules remain reachable and own different connection and queue policies. The isolated prototype shares the pure blob budget calculation. All 222 cases pass before and after, including both ports opening older synthetic databases and reading original blobs and queued edits. [Verification and handoff](legacy-reservation-retirement-audit.md#offline-database-duplication-audit)

Next, apply and qualify the exact four-path budget calculation patch.

## Shared offline blob-cache budget

Commit `a6436b161` applies the rehearsed calculation. All 2,615 tests and both source-bound builds pass, with a 26-line reduction in flagged duplication. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-offline-blob-cache-budget)

Next, audit the native and legacy category icon catalogs and their visible choices.

## Category icon catalog audit

The isolated prototype shares the common catalog while preserving 49 native and 47 Family options. Both map and PDF consumers use the catalog fallback. All 499 tests and the local fixture build pass. The copied PDF fixture also passes as a separate audit check. [Verification and handoff](legacy-reservation-retirement-audit.md#category-icon-catalog-audit)

Next, apply and qualify the exact rehearsed patch.

## Shared category icon catalog

Commit `837485932` applies the verified catalog and fallback. All 2,796 regression cases and both source-bound builds pass. Duplication now flags 3,118 lines across 92 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-category-icon-catalog)

Next, audit the native and legacy CustomSelect components and their active consumers.

## CustomSelect compatibility audit

The isolated prototype shares rendering and filtering and repairs Escape dismissal in Family Admin and unscoped legacy dialogs. All 432 tests and the fixture build pass. The prototype reduces flagged duplication by 114 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#custom-select-compatibility-audit)

Next, apply and qualify the rehearsed patch.

## Shared CustomSelect repair

Commit `fb637f22d` applies the audited Escape repair and shares rendering and filtering across both selectors. All 3,203 tests and both source-bound builds pass. Duplication now flags 3,004 lines across 90 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-custom-select-repair)

Next, audit the native and legacy browser offline database modules.

## Offline base schema audit

The isolated prototype shares only the first four IndexedDB schema registrations. Both wrappers retain their connection and recovery policies. All 299 tests pass before and after, and the local build passes. The projected duplication reduction is 84 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#offline-base-schema-audit)

Next, apply and qualify the rehearsed schema helper and upgrade fixtures.

## Shared browser offline base schema

Commit `20d1960ad` safely shares the first four IndexedDB schema registrations. All 3,280 regression tests and both source-bound builds pass. Duplication now flags 2,920 lines across 90 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-offline-base-schema)

Next, audit the Family packing command session modules.

## Retained packing command session audit

The rehearsal shares five matching packing command lifecycles while preserving their domain-specific receipts, editor checks and queued originals. All 673 tests pass before and after. The source-bound local build passes. The prototype reduces flagged duplication by a net 358 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#retained-packing-command-session-audit)

Next, apply and qualify the rehearsed retained packing session patch.

## Shared retained packing command sessions

Commit `a7ab203a5` shares the five audited packing session lifecycles. All 3,882 regression tests and both source-bound builds pass. Duplication now flags 2,562 lines across 86 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-retained-packing-command-sessions)

Next, audit the Family packing command request handlers.

## Qualified packing request handler audit

The isolated prototype shares the five handlers and preserves the route, per-domain payload limit and typed response contracts. All 754 tests pass before and after, and the local build passes. The prototype reduces flagged duplication by 333 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#qualified-packing-request-handler-audit)

Next, apply and qualify the rehearsed packing request handler patch.

## Shared qualified packing request handlers

Commit `76a341520` shares the audited request handler lifecycle across five packing domains. All 3,963 regression tests and both source-bound builds pass. Duplication now flags 2,229 lines across 81 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-qualified-packing-request-handlers)

Next, audit the Family packing category cohorts.

## Packing category snapshot audit

The isolated prototype shares the category snapshot lifecycle and retains per-instance state and the aggregate editor check. All 855 tests pass before and after, and the local build passes. The prototype reduces flagged duplication by 109 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#packing-category-snapshot-audit)

Next, apply and qualify the rehearsed packing category snapshot patch.

## Shared packing category snapshot lifecycle

Commit `8078412c6` shares the audited category snapshot lifecycle with independent per-instance state. All 4,064 regression tests and both source-bound builds pass. Duplication now flags 2,120 lines across 79 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-packing-category-snapshot-lifecycle)

Next, audit the Family planner arrangement and edit sessions.

## Planner original session audit

The isolated prototype shares the lifecycle while keeping distinct arrangement and edit contracts. All 369 tests pass before and after, the source-bound build passes, and duplication drops by 115 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#planner-original-session-audit)

Next, apply and qualify the rehearsed planner original session patch.

## Shared planner original sessions

Commit `17dd92961` applies the audited planner session patch and preserves each receipt contract. All 4,241 regressions and both source-bound builds pass. Duplication now flags 2,005 lines across 77 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-planner-original-sessions)

Next, audit Family creation, packing and task recovery checks.

## Planner recovery checks audit

The isolated prototype shares recovery context and exact-row checks while preserving domain-specific behavior. All 943 tests pass before and after, the source-bound build passes, and duplication drops by 134 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#planner-recovery-checks-audit)

Next, apply and qualify the rehearsed planner recovery checks.

## Shared planner recovery checks

Commit `6bfd5125f` applies the audited session and retained-row checks. All 4,343 regressions and both source-bound builds pass. Duplication now flags 1,871 lines across 74 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-planner-recovery-checks)

Next, audit the Family arrangement and edit intent queues.

## Planner intent queue audit

The isolated prototype shares arrangement and edit queue operations. All 572 tests pass before and after, the source-bound build passes, and duplication falls by 82 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#planner-intent-queue-audit)

Next, apply and qualify the rehearsed arrangement and edit intent queues.

## Shared planner intent queues

Commit `6a7c10394` applies the audited arrangement and edit queue operations. All 4,418 regression tests and both source-bound builds pass. Duplication now flags 1,789 lines across 73 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-planner-intent-queue)

Next, audit construction of newly retained planner queue rows.

## Retained planner row audit

The prototype shares only new row construction. It preserves each queue's existing validation and transactions. All 531 focused tests pass before and after, including nine new regressions, and duplication falls by 36 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#retained-planner-row-audit)

Next, apply and qualify the rehearsed retained planner row constructor.

## Shared retained planner row constructor

Commit `51a7d2ec3` applies shared row construction with the original validation and transaction order. All 4,481 regressions and both source-bound builds pass. Duplication now flags 1,753 lines across 71 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-retained-planner-row)

Next, audit the base and retained packing command sessions.

## Packing command context audit

The prototype shares packing ownership checks and preserves the two settlement paths. All 582 focused tests pass before and after, and duplication falls by 79 lines. [Verification and handoff](legacy-reservation-retirement-audit.md#packing-command-context-audit)

Next, apply and qualify the rehearsed shared packing command context.

## Shared packing command context

Commit `c2e2c94df` applies the audited ownership and editor checks. All 4,481 regressions and both source-bound builds pass. Duplication now flags 1,674 lines across 71 files. [Verification and handoff](legacy-reservation-retirement-audit.md#shared-packing-command-context)

Next, prepare incremental backup tooling for an isolated recovery rehearsal.

## Incremental backup tooling

The incremental tool is installed in `~/FamilyTravelApp-backups/incremental-tooling-v1`, with the command and resume instructions in `RUN-ME.md`. Each new generation captures a fresh database and object worklist from the same PostgreSQL snapshot. Reuse requires matching object identity and checked bytes. Each completed generation can be verified offline and restored independently of its predecessor.

All 36 tests passed. In a local PostgreSQL 16 and HTTP Storage rehearsal, the second generation reused one file and downloaded two. A concurrent write after snapshot export stayed out of the database dump and the worklist. The copied generation restored two application rows, three Storage metadata rows and all three corresponding files with its original and prior locations unavailable. The six checked files in the verified November backup retained their original hashes.

Next, the user runs the fresh capture in Terminal. The release gate remains open until an independent copy of the actual backup verifies and its database and files restore together in isolation. Tooling and backup content are stored locally outside the website repository.

## Verified 20 November backup

The user completed the fresh incremental capture. The 20 November archive came from PostgreSQL 17.6, differs from the November 7 archive and decoded successfully. The sealed worklist matches the verification receipt for 77,038 objects and 30,091,756,926 media bytes. All objects were reused, and the verification receipt shows zero failures.

The completed generation is local. The next step is to copy it to the user's independent destination, verify that copy and rehearse restoring its database and media together. No external volume was mounted during the check. The release recovery gate stays open.

## Local database and media restore rehearsal

Reused the [guarded baseline procedure](../real-backup-baseline-handoff.md) on a fresh, network-disabled PostgreSQL 17.6 container and labelled volume. All 34 foreign-target cases were refused. The archive restored in one transaction, with the local source role briefly elevated for event trigger ownership and returned to its captured privileges before commit. All 296,764 rows matched their archive commitments across 200 projections. The verification also matched 32 role attribute records, 22 memberships, 198 archived relation owners, 176 archived RLS flags and the 88 migration ledger records. The two restored scheduled jobs stayed disabled.

All Storage bucket records and 77,038 object records matched the sealed worklist. Seventeen files totalling 20,550,845 bytes were restored by bucket and object key to a separate private directory and verified against their SHA-256 values. The sample covered catalog thumbnails, hero images, other catalog files and all 11 files from the other buckets. The disposable container, volume and raw scratch copies were removed after checks passed. The rehearsal used a filesystem destination. Full Storage service recovery and recovery from the off-device copy remain open.

The off-device transfer is deferred while the user obtains an adapter for an existing external drive. Next local work is to review the remaining duplication findings. Resume independent recovery when the drive is available, before hosted migration or preview rollout.

## Disconnected offline banner and OAuth consent

Commit `f57705404` retires two unused Family copy files and leaves the active banner and consent route in the build. Both builds and 4,565 tests pass. The scanner now flags 1,583 lines across 68 files. Next, audit the native and retained offline database overlaps. [Source and build comparison](legacy-reservation-retirement-audit.md#disconnected-offline-banner-and-oauth-consent)

## Shared offline database proxy

Commit `0297ecb5c` shares proxy forwarding. Each module still owns its connection and account lifecycle. Both builds and 4,699 tests pass. The scanner now flags 1,548 lines across 68 files. Next, audit the native and retained Admin permissions overlaps. [Verification and scope](legacy-reservation-retirement-audit.md#shared-offline-database-proxy)

## Family Admin permissions session repair

Commit `374648b6d` fixes stale read, save and reset completions in the Family permissions panel. All 4,732 client tests, six backend adapter cases and the source-bound build pass. Next is proving the active route contracts and retiring the copied standalone permissions fallback. [Verification and scope](legacy-reservation-retirement-audit.md#family-admin-permissions-session-repair)

## Copied Admin permissions fallback retired

Commit `9626b2b25` removes the fallback and its copied panel. The standalone desktop and phone permissions, Family manager and reviewer all pass their route checks. Both builds and all 4,737 client tests pass. Duplication falls to 1,447 lines across 66 files. Next, audit the copied website Admin backup panel. [Verification and scope](legacy-reservation-retirement-audit.md#copied-admin-permissions-fallback-retired)

## Copied Admin backup panel retired

Commit `3ff11b8b5` removes the copied website Admin backup panel and guards managed deep links before render. Seven new route checks cover standalone, Family, already-managed and direct wrapper cases. Duplication falls to 1,363 lines across 64 files. Next is the copied Admin MCP tokens panel audit. [Verification and scope](legacy-reservation-retirement-audit.md#copied-admin-backup-panel-retired)

## Copied Admin MCP access panel retired

Commit `3fbc3d60c` removes the copied panel from the Family Admin wrapper and preserves standalone token management. All five route cases and 4,858 combined client tests pass. Duplication falls to 1,283 lines across 62 files. Next is the copied Admin GitHub panel audit. [Verification and scope](legacy-reservation-retirement-audit.md#copied-admin-mcp-access-panel-retired)

## Copied Admin GitHub panel retired

Commit `a8350ea69` retires the copied GitHub release history panel. Seven route tests cover both standalone layouts, Family and known-managed bookmarks, and the direct wrapper. Both builds and 4,913 client tests pass. Next is the copied Admin Add-ons manager audit. [Verification and scope](legacy-reservation-retirement-audit.md#copied-admin-github-panel-retired)

## Copied Admin Add-ons manager retired

Commit `1a037aac1` removes the copied manager and its dedicated reads and callbacks. Five route tests cover standalone saves and reloads, installed Family visibility and the direct wrapper. Both builds and 5,009 regression tests pass. Next is the copied developer notifications panel audit. [Verification and scope](legacy-reservation-retirement-audit.md#copied-admin-add-ons-manager-retired)

## Developer notifications bookmark guard and Family copy retirement

Commit `3cace8a02` guards the native developer notifications bookmark and retires the Family copy. Nine route tests cover synthetic dispatch, disabled and delayed configuration, and Family visibility. Both builds and 5,058 regression tests pass. Next is the copied Admin audit-log panel audit. [Verification and scope](legacy-reservation-retirement-audit.md#developer-notifications-bookmark-guard-and-family-copy-retirement)

## Family audit session repair and copied instance panel retirement

Commit `26d510bdf` guards Family audit results against stale filter and session responses, then retires the copied instance panel. Eight route cases verify the standalone and Family pagination contracts and the reproduced races. Both builds and 5,096 regression tests pass. Next is the copied Admin update and demo baseline controls audit. [Verification and scope](legacy-reservation-retirement-audit.md#family-audit-session-repair-and-copied-instance-panel-retirement)

## Copied Admin update and Demo Baseline controls retired

Commit `71fbfe339` retires the copied update banner, instructions and Demo Baseline action. Seven route cases verify standalone update and demo behavior, managed visibility and the Family boundary. Both builds and 5,140 regression tests pass. Next is the copied Family JWT rotation confirmation audit. [Verification and scope](legacy-reservation-retirement-audit.md#copied-admin-update-and-demo-baseline-controls-retired)

## Managed JWT rotation guard and Family confirmation retirement

Commit `70aaf3e3a` aligns desktop and phone rotation visibility and dispatch with the managed flag, and retires the copied Family dialog. Eleven route cases cover confirmation, cancellation, managed transitions and the Family boundary. Both builds and 5,187 regression tests pass. Next is the copied Family Admin instance OIDC reader audit. [Verification and scope](legacy-reservation-retirement-audit.md#managed-jwt-rotation-guard-and-family-confirmation-retirement)

## Family OIDC reader retirement and identity session repair

Commit `154656290` removes the disconnected instance OIDC read and guards Family identity responses and link completions. The standalone save contract and Family identity RPCs pass fixture verification. Both builds and 5,196 regression tests pass. Next is the copied Family Admin instance API-key reader audit. [Verification and scope](legacy-reservation-retirement-audit.md#family-oidc-reader-retirement-and-identity-session-repair)

## Copied Admin API-key reader retirement and Family Maps session repair

Commit `e475217dc` removes the disconnected instance API-key reader and guards Family Maps against late responses after access changes. Standalone key behavior and the existing Family Maps API pass fixture verification. Both builds and 5,205 regression tests pass. Next is the copied Family Admin SMTP settings reader audit. [Verification and scope](legacy-reservation-retirement-audit.md#copied-admin-api-key-reader-retirement-and-family-maps-session-repair)

## Copied Admin SMTP reader retirement and managed relay guard

Commit `8ec2d07ac` removes the disconnected instance SMTP and WebAuthn reader and guards native SMTP actions with the managed flag. Both builds and 5,251 regression tests pass. Next is the Family notification defaults session audit. [Verification and scope](legacy-reservation-retirement-audit.md#copied-admin-smtp-reader-retirement-and-managed-relay-guard)

## Family notification defaults session protection

Commit `6861c42b7` protects notification defaults from delayed reads and write completions after access changes. Existing writes and the normal refresh pass fixture verification. Both builds and 5,254 regression tests pass. Next is the Family preference defaults session audit. [Verification and scope](legacy-reservation-retirement-audit.md#family-notification-defaults-session-protection)

## Family preference defaults session protection

Commit `3450b520e` scopes Family Defaults data and controls to current access, including pending saves and currency resets. Both builds and 5,259 regression tests pass. Next is the Family feature controls session audit. [Verification and scope](legacy-reservation-retirement-audit.md#family-preference-defaults-session-protection)

## Family feature controls session protection

Commit `2ca01afc1` binds Family overrides, rollout writes and product history to current access. Both builds and 5,269 regression tests pass. Next is the Family place categories access audit. [Verification and scope](legacy-reservation-retirement-audit.md#family-feature-controls-session-protection)

## Family place categories session protection

Commit `75243c7e9` binds Family place categories, drafts, confirmations and write feedback to current access. Both builds and 5,299 regression tests pass. Next is the Family packing templates access audit. [Verification and scope](legacy-reservation-retirement-audit.md#family-place-categories-session-protection)

## Family packing templates session protection

Commit `f1d921fd5` binds Family packing templates, drafts, confirmations and write feedback to current access. Both builds and 5,307 regression tests pass. Next is the Family member administration access audit. [Verification and scope](legacy-reservation-retirement-audit.md#family-packing-templates-session-protection)

## Family member administration session protection

Commit `e1395dea3` binds Family member lists, access requests, statistics and their actions to current access. Both builds and 5,317 regression tests pass. Next is the Family data export access audit. [Verification and scope](legacy-reservation-retirement-audit.md#family-member-administration-session-protection)

## Family data export session protection

Commit `501789314` binds Family export jobs, request feedback and browser download delivery to current access. Both builds and 5,344 regression tests pass. Next is the packing item and bag terminal contract duplication audit. [Verification and scope](legacy-reservation-retirement-audit.md#family-data-export-session-protection)

## Shared packing terminal proof validation

Commit `731ba2389` shares strict packing terminal proof validation and preserves each command contract. Both builds and 5,545 regression tests pass. The scan reports 1,198 copied lines across 58 files. Next is comparing packing transport error mapping. [Verification and scope](legacy-reservation-retirement-audit.md#shared-packing-terminal-proof-validation)

## Shared packing RPC refusal mapping

Commit `5acf81b9d` shares the packing RPC status table and preserves each transport’s refusal handling. Both builds and 5,902 regression tests pass. The scan reports 1,136 copied lines across 55 files. Next is auditing the older category and group refusal mappings. [Verification and scope](legacy-reservation-retirement-audit.md#shared-packing-rpc-refusal-mapping)

## Packing category and group refusal handling

Commit `4b8db1353` fixes the packing group fallback and shares the category and group refusal lookup. Both builds and 6,036 regression tests pass. The scan reports 1,102 copied lines across 53 files. Next is auditing planner arrangement and edit recovery inspections. [Verification and scope](legacy-reservation-retirement-audit.md#packing-category-and-group-refusal-handling)

## Shared planner original recovery inspection

Commit `aeb08b007` shares queued-row selection and ownership checks for planner arrangement and edit recovery. Both builds and 6,071 regression tests pass. The scan reports 1,078 copied lines across 51 files. Next is auditing the import and stay action session guards. [Verification and scope](legacy-reservation-retirement-audit.md#shared-planner-original-recovery-inspection)

## Shared import and stay action checks

Commit `a423c170d` shares completion checks for import and stay actions. Both builds and 6,196 regression tests pass. The scan reports 1,026 copied lines across 49 files. Next is auditing browser-language detection. [Verification and scope](legacy-reservation-retirement-audit.md#shared-import-and-stay-action-checks)

## Native and Family browser-language detection

The two interfaces offer different sets of languages. All 167 focused checks pass, including 15 cases where language detection should differ. The original detectors remain in service and the duplication gate remains open. Next is auditing saved-place and scheduled-visit form session checks. [Verification and scope](legacy-reservation-retirement-audit.md#native-and-family-browser-language-detection)

## Shared saved-place and scheduled-visit form session checks

Commit `ab5cf94eb` prevents canceled form requests from issuing a new save or acting on a committed reply after the session check. Two reproduced regressions, 6,248 combined tests and the local build pass. The duplication scan reports 1,002 copied lines across 47 files. Next is auditing task and packing planner read session checks. [Verification and scope](legacy-reservation-retirement-audit.md#shared-saved-place-and-scheduled-visit-form-session-checks)

## Shared task and packing planner read session checks

Commit `3b124a10f` uses one scope check for tasks and packing and prevents follow-up requests after cancellation. Four reproduced regressions, 6,417 combined tests and the local build pass. The duplication scan reports 964 copied lines across 45 files. Next is auditing native and atomic stay transport errors. [Verification and scope](legacy-reservation-retirement-audit.md#shared-task-and-packing-planner-read-session-checks)

## Shared lodging request refusal mapping

Commit `d35b0320b` shares the lodging status mapping across three adapters. All 352 compared outcomes, 6,732 combined tests and the local build pass. The duplication scan reports 918 copied lines across 43 files. Next is auditing the original stay command session checks. [Verification and scope](legacy-reservation-retirement-audit.md#shared-lodging-request-refusal-mapping)

## Shared lodging command session checks

Commit `d235684b9` shares the original sign-in and actor checks for lodging commands. All 64 compared session checks, 6,778 combined tests and the local build pass. The duplication scan reports 870 copied lines across 41 files. Next is auditing packing command and retained receipt handling. [Verification and scope](legacy-reservation-retirement-audit.md#shared-lodging-command-session-checks)

## Exact queue settlement for packing commands

Commit `5d2a2db9d` preserves packing entries changed while a save or receipt request is in flight. Four reproduced regressions, 6,815 combined tests and the local build pass. The duplication scan reports 818 copied lines across 39 files. Next is auditing how native packing saves and archive retries capture the retained row. [Verification and scope](legacy-reservation-retirement-audit.md#exact-queue-settlement-for-packing-commands)

## Original queue snapshots for native packing saves and archive replacements

Commit `af9f740f5` refuses native sends and archive replacements when the queue entry differs from the one just retained. Four reproduced regressions, 6,861 combined tests and the local build pass. Next is auditing competing queued Trip work checks in packing and lodging. [Verification and scope](legacy-reservation-retirement-audit.md#original-queue-snapshots-for-native-packing-saves-and-archive-replacements)

## Shared competing Trip queue checks for packing and lodging

Commit `7948a6af9` uses one Trip rule and archive check for packing and lodging retention. Ten reproduced regressions, 6,881 combined tests and the local build pass. The duplication scan reports 788 copied lines across 37 files. Next is auditing queued Trip work before lodging refresh and planner reads. [Verification and scope](legacy-reservation-retirement-audit.md#shared-competing-trip-queue-checks-for-packing-and-lodging)

## Queued Trip work during lodging confirmation and planner reads

Commit `d0533d8ef` preserves the lodging retry record when a same-Trip edit arrives during confirmation. Two reproduced lodging cases, two planner publication cases, 6,885 combined tests and the local build pass. Next is reviewing the isolated HTTPS writer-profile checks. [Verification and scope](legacy-reservation-retirement-audit.md#queued-trip-work-during-lodging-confirmation-and-planner-reads)

## Shared HTTPS writer-profile validation

Commit `d16703f0a` shares HTTPS profile validation while preserving each profile's policy. Both build configurations and 6,973 combined tests pass. The duplication scan reports 766 lines across 35 files. Next is reviewing the native and legacy booking type helpers. [Verification and scope](legacy-reservation-retirement-audit.md#shared-https-writer-profile-validation)

## Shared booking type presentation

Commit `7ddaea05b` makes both booking views use the native catalog and fixes the Other fallback. The local build and 7,367 combined tests pass. The duplication scan reports 734 lines across 33 files. Next is reviewing the native and legacy multipart upload helpers. [Verification and scope](legacy-reservation-retirement-audit.md#shared-booking-type-presentation)

## Legacy multipart upload dispatch

Commit `091da5752` simplifies legacy multipart dispatch on its existing client. Both upload entry points pass the shared transport tests, and the local build and 7,547 combined tests pass. The duplication scan reports 697 lines across 31 files. Next is reviewing the native and legacy itinerary transport-leg helpers. [Verification and scope](legacy-reservation-retirement-audit.md#legacy-multipart-upload-dispatch)

## Shared itinerary transport leg projection

Commit `e790d49bf` shares flight and train leg projection and preserves the original booking when a stored segment is malformed. Six reproduced cases, the local build and 7,796 combined tests pass. The duplication scan reports 653 lines across 29 files. Next is reviewing the separate booking-detail readers. [Verification and scope](legacy-reservation-retirement-audit.md#shared-itinerary-transport-leg-projection)

## Defensive booking segment reads

Commit `d71414d41` protects booking details and search from malformed segment entries. Six reproduced cases, the local build and 7,883 combined tests pass. The duplication scan reports 653 lines across 29 files. Next is reviewing native and legacy browser language detection. [Verification and scope](legacy-reservation-retirement-audit.md#defensive-booking-segment-reads)

## Shared browser language matching

Commit `d71d2eb4b` shares language matching while retaining both catalogs. The local build and 8,084 combined tests pass. The duplication scan reports 601 lines across 28 files. Next is reviewing the native and legacy translation loaders. [Verification and scope](legacy-reservation-retirement-audit.md#shared-browser-language-matching)

## Shared Family translation loaders and fallback

Commit `b24ef54eb` shares the Family locale loader table and corrects translation fallback. Three reproduced cases, the local build and 8,093 combined tests pass. The duplication scan reports 551 lines across 26 files. Next is reviewing the native and legacy day timeline helpers. [Verification and scope](legacy-reservation-retirement-audit.md#shared-family-translation-loaders-and-fallback)

## Unused legacy planner row helper retirement

Commit `a954de596` removes the unreferenced legacy planner helper. Both builds match except for the source commit in the build receipt, and all 8,584 combined tests pass. The duplication scan reports 500 lines across 24 files. Next is reviewing the native and legacy context menus. [Verification and scope](legacy-reservation-retirement-audit.md#unused-legacy-planner-row-helper-retirement)

## Unused legacy context menu retirement

Commit `aeef40d1d` removes the unused legacy context menu. All 8,707 combined tests pass, and both builds match except for the source commit in the build receipt. The duplication scan reports 467 lines across 22 files. Next is reviewing native and legacy plugin frames. [Verification and scope](legacy-reservation-retirement-audit.md#unused-legacy-context-menu-retirement)

## Unreachable legacy plugin frame retirement

Commit `f36377ec3` removes the unreachable legacy plugin frame and its three callers. All 8,991 combined tests pass, and both builds match except for the source commit in the build receipt. The duplication scan reports 424 lines across 20 files. Next is reviewing trip subscription link controls. [Verification and scope](legacy-reservation-retirement-audit.md#unreachable-legacy-plugin-frame-retirement)

## Calendar subscription scope and copy controls

Commit `fded9885d` keeps late calendar subscription and clipboard results with their original view. Both link views share the copy controls. All 9,127 combined client tests and 12 backend calendar cases pass. Next is checking phone calendar availability against desktop. [Verification and scope](legacy-reservation-retirement-audit.md#calendar-subscription-scope-and-copy-controls)

## Phone and desktop calendar subscription availability

Commit `9dd49af48` aligns the phone and desktop calendar subscription controls with the account and backend. All 9,212 combined client tests and 12 Family calendar adapter cases pass. Next is reviewing the duplicate system notice stores. [Verification and scope](legacy-reservation-retirement-audit.md#phone-and-desktop-calendar-subscription-availability)

## Shared system notice lifecycle

Commit `15e1c1376` shares the notice-store lifecycle and keeps replies and retries tied to their session. All 9,384 combined client tests pass. Next is reviewing the legacy Atlas country search. [Verification and scope](legacy-reservation-retirement-audit.md#shared-system-notice-lifecycle)

## Atlas country search cleanup and query handling

Commit `3ac7ef5e5` retires the disconnected Atlas country search and keeps desktop results tied to the visible list and current query. All 9,489 combined client tests pass. Next is reviewing the legacy join-trip page. [Verification and scope](legacy-reservation-retirement-audit.md#atlas-country-search-cleanup-and-query-handling)

## Trip invite lifecycle and legacy cleanup

Commit `e26fff513` retires the disconnected legacy join page and keeps invite results tied to the account and route that started them. All 9,593 combined client tests pass. Next is resolving the repository-wide ESLint release gate. [Verification and scope](legacy-reservation-retirement-audit.md#trip-invite-lifecycle-and-legacy-cleanup)

## Client ESLint release gate verification

Commit `f01cc72c9` closes the repository-wide client ESLint release gate. All 9,687 combined client tests and the source-bound build pass. Review the native and Family theme defaults next. [Verification and scope](legacy-reservation-retirement-audit.md#client-eslint-release-gate-verification)

## Unused Family theme registry removal

Commit `3042e3718` removes the unused Family theme registry. The build comparison and 9,781 client tests pass. Duplication fell by 24 lines to 264. Review the duplicated native and Family formatting helpers next. [Verification and scope](legacy-reservation-retirement-audit.md#unused-family-theme-registry-removal)

## Shared native and Family currency formatting

Commit `6b274630e` consolidates currency formatting and preserves Family date and clock behavior. The local build comparison and 9,958 tests pass. Duplication fell by 54 lines to 210. Review Family budget category ordering next. [Verification and scope](legacy-reservation-retirement-audit.md#shared-native-and-family-currency-formatting)

## Shared Family budget category ordering

Commit `edea4dfb1` shares category ordering across the Family edit and realtime paths. The source-bound build and 10,071 regression tests pass. Duplication dropped by 33 lines to 177. Review duplicated trip loading callbacks next. [Verification and scope](legacy-reservation-retirement-audit.md#shared-family-budget-category-ordering)

## Disconnected Family trip loader removal

Commit `29b08fa96` removes the unused Family trip loader. The source-bound build and 10,092 tests pass. Duplication fell by 28 lines to 149. Review the password and MFA sign-in completion paths next. [Verification and scope](legacy-reservation-retirement-audit.md#disconnected-family-trip-loader-removal)

## Shared password and MFA sign-in completion

Commit `ee75cae41` shares password and MFA completion after the existing session checks. The local build, ESLint gate and 10,092 client tests pass. Duplication fell by 36 lines to 113. Review duplicated offline cache upserts next. [Verification and scope](legacy-reservation-retirement-audit.md#shared-password-and-mfa-sign-in-completion)

## Shared offline cache bulk writes

Commit `582d92867` shares bulk cache writes while keeping each store's database selection. The local build and 10,092 regressions pass. Duplication fell to 89 lines. Review duplicated offline table declarations next. [Verification and scope](legacy-reservation-retirement-audit.md#shared-offline-cache-bulk-writes)

## Shared offline table declarations and writer bindings

Commit `5a34fd862` shares the table declarations and bulk writer bindings. Schema snapshots, the source-bound build and 10,092 tests pass. Duplication fell to 22 lines. Review the Journey summary and detail mapping next. [Verification and scope](legacy-reservation-retirement-audit.md#shared-offline-table-declarations-and-writer-bindings)

## Shared Journey header mapping

Commit `e957ab842` shares the header mapping for Family Journey list and detail reads. Before-and-after payloads and signed-cover behavior match. All 10,120 regression tests and the source-bound local build pass. The duplication gate reports zero. Recheck supported-core release readiness next. [Verification and scope](legacy-reservation-retirement-audit.md#shared-journey-header-mapping)

## Supported-core release-readiness recheck

The 194 focused tests and source checks pass, with zero copied lines. The check-only archive initially caught a documentation-only link and the exact historical note has been corrected. The local backup archive and manifest checks also pass. The 66 source migrations absent from the archived ledger are a dated comparison. Hosted migration and preview remain held for independent recovery and current environment validation. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

## Independent X8 database and media recovery

The 20 November generation was read solely from the verified APFS-encrypted X8. An isolated PostgreSQL 17.6 instance restored 296,764 rows across 200 archive projections. All 77,038 object metadata records and five bucket records matched. All 77,038 files totalling 30,091,756,926 bytes were restored into the versioned file backend and verified by SHA-256.

The cached Storage API served six public and 11 private samples from native Linux scratch storage using the restored records and locally issued credentials. All 17 payloads and content types matched. The public route refused the 11 private requests. A direct read from the Mac-backed mount failed because the Docker file-sharing layer could not supply Linux extended attributes. The API probe used native Linux scratch and retained the original object keys and versions. There were no published ports or external network connections. The temporary database and working files were removed after verification. The sanitized recovery receipt is alongside the offline verifier on the X8.

Next, refresh hosted schema, API and engine facts when read-only inspection is authorized. [Release prerequisites](../core-release-prerequisites.md#current-release-checkpoint)

## Hosted Supabase read-only check

The hosted project lists 88 applied versions. All 88 version names and recorded SQL fingerprints match the restored X8 archive, including the historical duplicate ownership statements. Against the 154-file backend checkpoint, 66 versions remain pending. The scoped catalog confirms missing native planner, task, packing, Collections and profile preference contracts. The hosted `17.6.1.141` engine reproduces all three known timezone differences. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

Next, rehearse the exact pending set on a fresh isolated restore. Keep hosted changes and preview rollout pending separate approval.

## Schema 154 X8 upgrade rehearsal

All 66 pending versions replayed on a fresh isolated PostgreSQL 17.6 restore from the X8. The final ledger has 154 versions. All 296,764 original rows across 200 projections match. The first-migration rollback check and all 34 target guard cases passed.

Nine old task and packing probes were refused as an authenticated user. Synthetic saves and idempotent retries pass through the replacement commands. The older source refs confirm the direct writers. Actual deployed source binding and signed-in cutover acceptance still need proof.

The Vacay grant contracts exposed inherited privileges, and the current Collections contracts exposed one missing supporting FK index. Both targeted correction proposals passed rollback-only testing. The timed-visit guard still rejects 17.6. The next backend work is the additive grant/index migration, followed by a coordinated writer cutover rehearsal. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

## Schema 155 Vacay grants and Collections index

Private backend commit `b79933b` adds the narrow Vacay revokes, one Collections authoring foreign-key index and a durable index assertion. The three contracts fail at 154 and pass at 155. The local rollback proof covers both grant/index DDL and ledger recording. All 296,764 archive rows and the 154 prior ledger entries survive.

The nine earlier task and packing paths are still refused under the intended new grants. Next, rehearse the replacement writer cutover locally. [Current release checklist](../core-release-prerequisites.md#current-release-checkpoint)

## Coordinated task and packing writer rehearsal

Schema 155 accepts both replacement command families in the same isolated Trip. Independent connections proved matching receipts, one record per operation, conflict on changed intent and restoration with the original ID. All 296,764 archive rows match. The combined frontend and queue regression run passed 707 tests. Both separate fixture builds pass, but current configuration and request fences keep their writer and receipt paths mutually exclusive.

Next, qualify one isolated HTTPS source for both writers and the existing planner cohort. The current hosted rollout remains on hold. [Verified scope and next packet](../core-release-prerequisites.md#g3-writer-cutover-rehearsal)

## Combined fixture writer qualification

A single isolated HTTPS website build now reaches the task, planner and base packing contracts on one schema 155. The actual desktop and phone-width browser checks cover committed and unknown outcomes, explicit retry, original task identity on Restore and an untimed visit on the selected day. All 734 focused tests pass, and independent SQL matches 11 operations to exact receipts. PostgreSQL 17.6 refuses the selected-day phone save under the existing timezone guard. The 17.11 rehearsal passes.

Next, rehearse the transition between website releases and close the hosted engine gate. [Combined writer scope and next packet](../core-release-prerequisites.md#g3-combined-writer-qualification)

## Different-release handover and managed PostgreSQL target

The old task-only and new combined fixture builds ran one update through their distinct service workers on schema 155. The scoped task kept its exact original and recovered from one receipt. A v1 draft in the owned queue was paused and exported without a write. A duplicate-format draft in the detached legacy database stayed intact and outside the export. All 352 focused tests pass.

The hosted dashboard offers 17.12.0.000. The exact image restores the database, passes the timezone gates and saves an untimed visit on the selected day from the signed-in phone. Next, verify deployed source bindings and prepare the maintenance window with a current backup. [Handover and engine checklist](../core-release-prerequisites.md#g4--hosted-engine-upgrade-verified)

## Hosted engine verification and deployed website sources

The owner completed the managed Supabase upgrade. The project is active and healthy on 17.12. Live timezone probes passed. All 88 applied migration records and their SQL fingerprints match the X8 generation, and the checked identity fields for its 77,038 Storage records match. The 67 schema migrations remain pending. The anonymous Auth and Storage health endpoints returned HTTP 200. The anonymous Data API read returned HTTP 401. [Read-only evidence](../supported-core-readiness/recheck-20261121-schema154/hosted-postgres1712-and-worker-binding.json)

Production runs `1bf654b` and preview runs `ef89af599`. Both use the legacy task and packing mutations that the isolated schema 155 rehearsal refused. They cannot serve as stand-alone fallback versions on the new schema.

Next, prepare the coordinated integration-preview writer cutover and schema-compatible fallback. Rehearse a write pause, preserve pending drafts and original receipts, and qualify the exact HTTPS preview source before requesting an authorized hosted change. [Release sequence](../core-release-prerequisites.md#order-from-here)

## Local preview write pause and fallback rehearsal

The encrypted X8 restore reached schema 155 on PostgreSQL 17.12 while the REST write pause was active. All 296,764 original rows match. An in-flight edit completed once, and new work was refused until the drain check succeeded. Both typed command receipts remained available during the pause. All nine old save paths stayed refused after reopening. The typed retries each produced one record and one receipt. The source-bound fixture fallback passed the signed-in browser check and all 175 focused regressions passed. [Evidence](../supported-core-readiness/recheck-20261121-schema154/preview-write-pause-and-fallback.json)

Next, qualify the intended HTTPS preview and fallback against the approved backend, prove the managed pause coverage and settle detached draft recovery. [Cutover runbook](../preview-cutover-and-fallback.md)

## Hosted route coverage and managed role preflight

Both active sites connect to the same primary project. The read-only observations found an active export schedule and no development branches on that project. The hosted catalog shows no stored pre-request hook in the inspected scopes. The matching local Postgres login was refused when registering the tested hook.

The restored image and hosted policy delegation resolved the control run's Storage policy blocker. Forty migrations then passed as a non-superuser. The 41st rolled back when it tried to change `supabase_admin` table defaults. Hosted confirms the executor cannot assume that role and the affected defaults are present. All 296,764 archived rows match. Qualify the revised migration set before returning to preview activation. [Evidence](../supported-core-readiness/recheck-20261121-schema154/hosted-route-coverage-and-role-replay.json)

## Managed-role application privilege reconciliation

The pending migration now checks that `postgres` owns the application tables and revokes the original client privileges under that owner. The existing SQL contract and two future table probes passed. The protected platform defaults were preserved. The original refusal, foreign owner and transaction rollback checks all passed.

All 67 migrations reached schema 155 from the X8 snapshot under the modeled managed login. All 296,764 archived rows match. The calendar and Collections checks passed, both replacement command families passed, and all nine legacy writer paths stayed refused. [Pinned backend evidence](../supported-core-readiness/recheck-20261121-schema154/managed-role-migration-replay.json)

Next, rehearse a managed write pause and drain for the shared backend. The fixture hook's registration is still refused by the modeled role. [Cutover runbook](../preview-cutover-and-fallback.md#managed-role-reconciliation)

## Managed write pause layer rehearsal

The modeled Postgres role stopped new export claims and expiry work while allowing an already-claimed job to finish and verify its Storage artifact. Ordinary Storage writes and new signed upload authorizations were refused while an older signed authorization and the trusted service role still wrote synthetic files. A real local REST stop left Auth, Storage and a direct SQL writer available. All 296,764 archive rows survived. [Scoped results](../supported-core-readiness/recheck-20261121-schema154/managed-write-pause-layers.json)

Next, verify scoped recovery for detached browser drafts ahead of HTTPS preview handover. Managed Data API settings and propagation still need separate target acceptance. [Runbook](../preview-cutover-and-fallback.md#layered-write-pause-rehearsal)

## Detached browser draft recovery rehearsal

Both verified old workers intercepted the recovery URL in an isolated Chromium browser. The generated recovery worker update exposed the same-origin standalone document. An independent decoder verified the selected command and exact file bytes on desktop and phone-width fixtures while all original rows and stores remained intact. The ordinary build excludes the utility, and all 103 focused tests pass. [Export and worker evidence](../supported-core-readiness/recheck-20261121-schema154/detached-browser-draft-recovery.json)

Next, qualify the selected HTTPS preview and fallback with an approved backend and recovery route. The hosted recovery utility remains gated. [Cutover runbook](../preview-cutover-and-fallback.md#detached-browser-draft-recovery)

## Production path without hosted staging

The owner declined the additional Supabase project. Use the existing local database and recovery evidence. Cloudflare branch previews can check website delivery, and both live Workers still use the primary Supabase project. Move managed write-pause verification and the new hosted save check to the authorized production window. [Release decision](../preview-cutover-and-fallback.md#production-path-without-hosted-staging)

Next, prepare the production-bound writer, schema-compatible fallback and pre-migration stop procedure. Rehearse production profile rules locally. Preserve the shared backend and all live deployments during preparation. [Production preparation](../preview-cutover-and-fallback.md#before-scheduling-hosted-work)

## Integration and continuation

Only this lane writes shared qualification/release metadata, master handoffs, canonical preservation state and the main private integration checkpoint. At each meaningful endpoint, inspect B's own status/report and fetch its private branch read-only if needed. Review each scoped worker commit, cherry-pick approved packets, update source rows, validate the combined tree and push the integration branch. Do not modify or advance B's checkout/branch after initial setup; do not treat B's moving head as a frozen “other checkout” preservation invariant. Its authorized progress is tracked through branch/status/commit ownership instead.

When the user says “Continue with the next,” resume an unfinished A task or select the next ready A item. Respect the finite queue. Once no ready A work remains, report that and check whether reviewed B work is ready to integrate. Stop on required user decisions/external blockers rather than inventing unrelated feature work. The user starts and advances Worker B from its own chat. When a separate Worker B assignment is ready, proactively give the user the exact prompt to send to that chat.
