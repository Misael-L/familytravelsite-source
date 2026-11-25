# FamilyTravel preview feature acceptance

The preview must let a Family member inspect Route Planning, Tours, the linked Journal and Collab on a populated trip. Use the TREK v5.1.4 tag (`2bcfc1bfcbbff0affd097c0f789c835396389572`) as the comparison and test the same trip shape at desktop and phone widths.

- **Route Planning** opens from the trip planner. Verify the ordered visit list, repeats, timed and untimed stops, routed legs and map selection. Add controls for route preferences and shaping once they have durable, trip-scoped commands, permissions and safe retry handling. Routing failures must leave stops readable and show that the driving route is unavailable.
- **Tours** opens from the trip and the planner's Places/Tours switch. Verify a tour with published stops and a track, assignment to an itinerary day and the Family permissions for viewing and editing.
- **Linked Journal** opens from the trip and shows entries from the linked Journey. Verify the linked and unlinked states, trip and Journey access together, authoring and recovery. A global Journeys page alone does not satisfy this check.
- **Collab** opens within the trip. Verify the supported collaboration actions with at least two test accounts and show which actions each Family role can take.

Use generated accounts for local acceptance and populate the mock trip with public place names and coordinates from the Family catalog. Keep dates, schedules, traveler names, notes, and booking details synthetic. For hosted acceptance, open a private test trip in the existing Cloudflare integration preview using the Family account and trip permissions. Its Supabase project also serves the production website.

## First Route Planning preview

The test trip is **Mexico · Route Planning Preview**. It has three days, six visits and four saved catalog places. Puebla and Guanajuato each appear on two days. It includes start/end times and an untimed visit. The visits were created through the existing authenticated Family planner commands after replaying the 67 previously qualified migrations in the isolated X8 restore. This slice adds no route-specific migrations.

The local build exposes the native Route Planning switch only for the configured fixture trip and exact loopback origin. The read adapter checks the trip header before returning preview preferences and route-shaping defaults. The preview shows ordered visits and road distances and durations. Route editing, saved preferences, stop shaping and corridor search are follow-up work.

The route assembly, route hook and route calculator match the tagged TREK source. The comparison uses that source and a populated Family browser fixture. It does not depend on the public demo's trip configuration.

## Road trip driving settings

The same Mexico fixture now saves Driving settings through the native Road trip controls. The preview uses an online Family endpoint with the existing trip scheduling permission and a current private session. The database stores one revisioned settings row per trip. A stale patch is rejected and the UI refreshes the saved values. An identical retry has no effect on the revision. The preview does not enqueue offline settings writes.

The schema migration is at backend commit `9560812` on `codex/family-road-trip-preferences`. It was applied only to the restored local database. The browser verification changed the longest drive to 95 minutes and enabled Connect the days and A colour per day. Reload and a fresh browser session read back the same values. The original six visits remain the basis of the itinerary.

Road trip stop and waypoint editing, imported tracks, boundary drags and corridor search remain outside this slice. Tours, the linked Journal and Collab remain preview acceptance requirements.

## Road trip waypoints and Cloudflare review

The local desktop Road trip preview can save, move, and remove one coordinate waypoint per leg. The migration at backend commit `625048d` stores its directed visit pair and revision. The route uses a waypoint only while its original visits remain consecutive and routable on that day. The display computes the native route index from the current assignments.

The Mexico fixture retains a Day 1 waypoint between Ciudad de Mexico and Puebla. Browser checks proved that the native router requested the saved coordinates and that moving, removing and adding the point again persisted across reload and a fresh sign-in. The local database tests covered stale writes, an identical retry, a reversed leg, and access controls.

The [Cloudflare visual review](https://mexico-road-trip-familytravelsite-integration-preview.lmisael0721.workers.dev) first shipped in Worker version `2c8b1c1d-5901-4141-9f60-2f0ef4d8f264` with three sanitized Road trip captures. The current review includes a link to the Tour station captures. The interactive editor is available in the loopback preview at `http://127.0.0.1:55671/api/open-mexico-preview`.

## Road trip stop order

The local Mexico preview saves a new order for mapped stops within the same day. On desktop, drag a stop to another stop in its day or focus the stop and press Option + Up or Option + Down. The existing Family planner command checks the observed visit revisions and saves the full day order, including visits without coordinates. No schema migration was needed for this change.

The browser test reversed Day 1 with the keyboard, read the new order in a fresh session, and restored it by dragging. The reverse leg had no saved waypoint. Returning to the original order brought back the existing waypoint between Ciudad de Mexico and Puebla. A retry after an interrupted save reply used the original receipt and issued one reorder write in total. The test trip is back to its original six visits in order.

## Waypoints on the map

The local desktop preview accepts a click on the drawn route between two stops on the same day. Zoom in to drag the waypoint or right-click it to remove it. A leg accepts one waypoint. Clicking an occupied leg leaves its waypoint in place. Dragging keeps the original directed pair of visits, and a rejected save returns the marker to its saved position. The coordinate fields remain available for precise edits.

The map uses the existing published-itinerary waypoint permission and save command. The native template check pins the narrow waypoint permission change in PlanMapStage. The browser test verified placement, dragging, fresh sign-in, a rejected drag, and removal on Day 1. The fixture's original waypoint was restored.

## Tours in the Mexico preview

Open **Tours** in the desktop tab bar to see **Mexico City Historic Center Walk** and its saved track. Open **Tours** in the Plan sidebar to see the three stops. The walk uses synthetic geometry around the Family catalog’s Mexico City coordinates.

The published read API is in backend commit `845c44d` on `codex/family-tours-preview`. It requires a current session with access to the trip and reads only published Tours on active saved locations. The migration and seed ran in the isolated local database. SQL checks covered a different Family, unpublished Tours, and the list and detail response. An untimed assignment in a rolled-back transaction correctly changed the tour’s planned status. The demo remains unassigned and retains the original six Road trip visits.

## Assigning a tour to a day

On desktop, use **Add to day** on the walk’s row in either Tours list. The preview appends one untimed visit to the selected day using the existing Family planner creation command. The menu disables days that already contain the walk. A lost reply can be retried with the same operation, and the original creation receipt identifies the saved visit.

The Tour day guard is in backend commit `959fe6f`. The isolated SQL test reproduced a same-day duplicate before the guard. Afterward, the original receipt still replayed, an independent duplicate was refused, and a different day accepted the walk. The browser confirmed both assignment menus, persistence after a fresh sign-in, and removal and restoration of the same visit. The walk is unassigned in the demo, with the original six Road trip visits and saved waypoint present.

Tour assignment in the local preview is untimed.

## The linked Journal in the Mexico preview

Open **Journal** from the desktop trip tabs or **More → Journal** on a phone. The isolated database stores two sample stories linked to the same Mexico mock trip, with locations from the Family catalog. The Journal shows the active itinerary’s writing suggestions. Suggestions from removed visits are omitted, and written stories are preserved.

Backend commit `813f612` adds the read that checks for a current private session, access to the trip and a Journey role. Local SQL checked owners, granted viewers, a Family member with no Journey role, another Family, an expired session, and an unlinked trip. The website clears linked Journal summaries and details when the active Family actor changes. The six original visits, saved driving waypoint and unassigned walk remain available.

Desktop Chrome and an emulated iPhone opened both stories in separate signed-in sessions. The browser hid the tab when the link was absent. The 144 focused tests, local build, typecheck and native presentation check passed.

The first embedded Journal build covered reading. Use the loopback preview to inspect the linked Journal.

## Editing and recovering an existing Journal entry

In the local Mexico Journal, select the pencil marked **Edit Journal entries**. The editor allows an owner or editor to change the title and story of a saved entry, move it to Trash, or restore it on desktop or phone. The entry keeps its identity, dates and catalog location. Managing the Journal link remains separate work.

Backend commits `86736c4` and `c4a4297` check that the trip and Journal still match, that the private session is current, and that the command carries the revision the editor observed. A stale command cannot replace newer text or trash a newer revision. An identical retry can acknowledge the saved result without advancing its revision. Recovery uses the existing Journal Trash and version history.

The isolated database checks covered simultaneous edits and reader permissions. Desktop and phone browser sessions confirmed that a lost reply keeps the draft, a retry keeps the same revision, and a stale phone edit receives a conflict. A fresh phone sign-in recovered the same entry from Trash. The two original stories and locations are present again. The local build and 144 focused regression tests passed.

## Creating a Journal entry

In the same editor, select **New entry** and save a date with a title or story. **A walk through Guadalajara** is available on April 3 alongside the original two entries. The new entry is linked to the Mexico trip.

Backend commit `beda250` binds the identifier for a new draft to the saved entry. The first retained revision lets the server recognize an identical retry even after a later edit or move to Trash. Two simultaneous browser requests and a retry after a lost reply returned one entry at revision 1. A retry with changed text was refused, and a fresh phone session opened the saved story. The next preview feature is Collab.

## Shared Notes in Collab

The local Mexico preview opens **Collab → Notes** on desktop and **More → Collab** on phone. The board initially opened read-only with two notes based on the Mexico itinerary, **Meet before the Puebla drive** and **Last morning in Guadalajara**.

Backend commit `45c970c` stores shared notes separately from daily itinerary notes. The read requires a current private session and either the trip’s collaboration permission or a place on its traveler list. The isolated checks covered an organizer, a guest traveler, an unlisted guest, another Family, an expired session and anonymous access. The guest test sign-in is local and its gateway permits only reads.

Desktop Chrome opened both notes as the organizer and recovered from a simulated failed load through **Try again**. A separate guest account opened the same notes and the full note view on an emulated iPhone. The build, typecheck, native presentation check and 460 focused tests passed.

## Creating and editing shared notes

Organizers can use **New Note** or edit an existing note on desktop and phone. The editor saves the title, text and category. **Day 2 check-in** is a third sample note, created on desktop and edited on an emulated iPhone. Guests can read it, including the updated departure reminder.

Backend commit `cad2e64` adds the save command. It checks the active session and collaboration permission, retains the original note identity on a retry, and refuses an edit based on an older revision. Two overlapping create requests and a browser retry produced one note. The saved phone edit persisted in a fresh guest session, and a simulated stale desktop view received a conflict while retaining its draft. The isolated SQL checks also verified that guests, expired sessions and other Families could not write. The two original notes, itinerary, Tour and Journal entries were verified after testing.

Use the loopback preview for the editor.

## Moving and restoring shared notes

In the Mexico preview, organizers can use **Move to Trash** from a note’s menu on desktop or its Trash icon on phone. Open the Trash icon at the top of Notes to restore a note. Backend commit `42c7681` retains the note’s identity, author and content. Each move checks the observed revision and records an operation receipt. Guest reads contain only active notes.

Desktop Chrome moved **Meet before the Puebla drive** after two overlapping requests and a retry following a lost reply. A fresh guest session could no longer see it. An organizer restored the same note on an emulated iPhone. A stale desktop restore received a conflict, and refreshing showed the recovered note. The fixture has all three notes active again. The build, typecheck, native presentation guard, 481 focused tests and isolated database checks passed.

Note pinning, attachments and note websites still need qualification.

## Shared Links in Collab

On desktop, open **Collab** to see Links beside Notes. On phone, open **More → Collab → Links**. The Mexico trip has **Historic Centre of Puebla**, **Historic Centre of Mexico City** and **Querétaro visitor guide**. Organizers can create a link or edit its title and address. Guests can open the saved links. The board uses link icons so loading it makes no automatic requests to the bookmarked sites.

Backend commit `5c1f848` adds the trip-scoped read and save commands. The save validates the website address, requires collaboration permission and checks the original link revision. SQL tests covered read and write permissions, exact retries, stale edits and invalid addresses. A failed board read recovered through **Try again**. Two overlapping desktop create requests and a retry produced one bookmark. A phone edit changed its title and address, while a stale desktop edit kept its unsaved text and received a conflict. A fresh guest session saw all three links and could return to Notes.

## Pinning and recovering shared links

Organizers can pin or unpin a bookmark and move it to Trash. The **Links Trash** button opens the restore list. The isolated database migration at backend commit `bafbf1a` checks the observed revision for each action and stores the operation receipt. Restore keeps the original bookmark and its address and pin state. Guests see active bookmarks only.

Desktop Chrome pinned **Querétaro visitor guide** and replayed an interrupted reply without applying the pin twice. An emulated iPhone unpinned and repinned it. A stale desktop request received a conflict, then the refreshed board let the organizer move it to Trash. A fresh phone session restored it and a guest saw it again at the top. The mock trip has all three bookmarks active, with Querétaro and Puebla pinned.

## Text Chat in Collab

On desktop, open **Collab** to see Chat next to Notes and Links. On phone, open **More → Collab → Chat**. Organizers can send plain text. Guests can read the same history. The initial Mexico chat had four organizer messages about the Puebla drive, the historic center walk and the Querétaro bookmark.

Backend commit `1ee931f` adds the trip-scoped read and send commands. SQL checks covered 100-message pagination, sender identity, session and trip permissions, and exact repeats of a send. Two overlapping desktop sends and a retry after a lost reply produced one message. Changing the draft before retry received a conflict and kept the draft. An emulated iPhone sent a second message, and a guest saw the stored text after refreshing. The existing Notes and Links were available from the same phone session.

## Automatic Chat updates

An open Chat checks for new messages about every five seconds. Updates pause on a hidden browser tab, while offline and while the phone displays a different Collab panel. Returning to Chat starts a check from the last confirmed read position. **Refresh** remains available.

Backend commit `dbac0ef` adds a forward cursor in the private trip chat. The isolated database returned 205 messages over three ordered pages with their original IDs. The browser test sent two messages from desktop. An open guest phone recovered from an interrupted update and received the first message automatically. It paused while Notes was visible and caught up when Chat reopened. Six sample messages are available for review.

## Replies in Chat

In the Mexico preview, select **Reply** while hovering over a message on desktop or use the reply arrow beside a message on phone. The composer quotes the original, and the sent reply keeps a short excerpt. Guests can read both. Two replies are available in the mock trip, including the lobby check-in and its follow-up.

Backend commit `34877c5` adds a same-trip reply reference to the original message. SQL checked both history and automatic updates, rejected a reference to another trip, and verified that changing a previously submitted reply target produces a conflict. The browser recovered one desktop reply after a lost response. An emulated iPhone posted an emoji reply with the excerpt intact, and an open guest session received both replies automatically. All six earlier messages are present.

## Recovering Chat messages

Hover over your message on desktop or use the Trash action beside it on phone. The message stays in its original position as a removal notice. Automatic updates hide the original text and its quoted excerpts from other readers. Open **Chat Trash** to restore the message and its excerpts. Each author can recover their own messages.

Backend commit `60577b9` adds author-scoped Trash and restore, revision checks, and automatic updates for message changes. Desktop Chrome moved the Puebla lobby message to Trash once after overlapping requests and an interrupted response. An open guest session kept the reply and hid the quote, then saw both the original and quote after the organizer restored the message on an emulated iPhone. The isolated database retains all eight active messages and exactly one removal and one restore. The build, typecheck, native presentation check, and 486 focused tests passed.

## Chat reactions

Right-click a message on desktop or double-tap or hold it on a phone to choose from eight reactions. On desktop the message's smile button also opens the picker. Selecting your reaction badge again removes it. Guests see reaction counts through the same automatic Chat updates. The Mexico preview has a thumbs-up on the message about the historic center walk.

Backend commit `437cbbe` records a reaction against a trip, message and authorized Family actor. Each write states whether the emoji should be present and reuses its operation ID after a lost response. Chat Trash hides reactions and restoring the message brings them back. The browser test confirmed desktop retries, removed and re-added the reaction on an emulated iPhone, and verified changes in an open guest session and a fresh organizer session. A phone interaction fix keeps the gesture that opens the picker from also choosing a menu action. All eight sample messages remain active. The build, typecheck, native presentation check, 487 focused tests and isolated SQL checks passed.

## Chat image attachments

Organizers can attach up to four JPEG, PNG, GIF or WebP images, up to 10 MiB each, using the desktop or phone composer. A caption is optional. Guests can open the images on active messages. The Mexico trip includes two generated PNGs for review.

Backend commit `1d09b0e` binds immutable objects in the private trip-files bucket to a saved Chat message. A retry repeats the same draft and attachment identities. Failed registration leaves no partial message, and the existing cleanup worker handles unregistered uploads. Trash hides the image and denies new downloads. Restoration keeps the original file. The isolated Storage server used a local compatibility index because the installed image predates the restored Storage schema. That index is outside the migration.

Desktop Chrome recovered an interrupted send with one message and one file. An emulated iPhone sent a photo without a caption and opened the reaction picker by holding the photo. An open guest viewer closed after Trash, a fresh read of the file was denied, and restoring the message returned the same bytes. The fixture retains the original eight messages and the two active image messages. Isolated SQL, 547 focused tests, the build and typecheck passed.

## Collab Polls

Open **Collab** on desktop or **More → Collab → Polls** on phone. The Mexico trip has two examples. **Which Puebla stop should we visit first?** is closed with one vote for Amparo Museum. **What should we add to the Mexico walk?** is open and has two selections on the organizer's ballot. Organizers can create, vote, close, trash and restore polls. Guests can read active polls and their vote totals, and see the breakdown once voting closes.

Backend commit `9ecef1a` stores the poll, one ballot per voter, and revisioned action receipts. Closed polls and expired deadlines reject new votes. Retrying a lost result does not toggle a ballot again. The browser preserved the desktop draft through an interrupted response and saved one poll. A phone saved two choices, and Trash and restore preserved the closed poll and its result. An open guest session saw the removal and recovery, and a fresh session saw both polls. The build, typecheck, native presentation check, 549 focused tests and isolated SQL passed.

## What’s Next

Open **Collab** on desktop to see **What’s Next**. It reads the same trip itinerary and stays as the planner. Repeated stops keep their own visit time. The list shows up to eight upcoming stops, groups them by trip day, and updates every minute while visible. Timed Family visits use their stored start and end instants to decide whether they are still upcoming. The displayed clocks come from the visit.

The organizer and guest both saw all six published Mexico visits, including the repeated Puebla and Guanajuato stops and the untimed stop. With the browser clock in Tokyo, the first Puebla visit stayed visible while it was underway in Mexico and disappeared after its recorded end. The next day’s Puebla visit stayed on the list. The phone Collab navigation and both sample polls were also verified. This change uses the existing database and itinerary.

## Editing a saved walk’s track

In the local desktop preview, open **Tours → Mexico City Historic Center Walk → Edit track**. Choose a point between stations, change its latitude or longitude, and select **Save track point**. The map redraws the saved walk. The edit preserves the number of points, the three stations, and the walk’s place and itinerary links. The preview requires an online organizer with direct place-edit permission.

Backend commit `4f16df1` adds the revisioned point command to the isolated database. The saved revision protects newer edits, and repeating a save after a lost reply can confirm the same point without another revision. The command requires a current private session and checks the published walk, station bounds and trip role.

Chrome verified the lost-reply retry, a conflict between two organizer sessions, the exact saved coordinate after fresh sign-in, and the guest’s read-only map. The same fixture retains six visits and its saved driving waypoint. The local build and 707 focused tests passed.

## Adding a photo to a saved Journal entry

Open **Journal → Edit Journal entries**, select a saved story, choose a file under **Add a photo**, and select **Attach photo**. The preview accepts an image up to 8 MiB per attachment. The photo appears on the entry and in **Gallery** via the existing private Journey library.

Backend commit `4bc96dc` connects the existing upload validator and Journey photo registration to a current private session, the linked trip and the entry’s observed revision. Pending objects stay private to the uploader. An identical retry returns the existing attachment and preserves the revision. A distinct upload based on an older entry revision is refused. The entry recovery history retains the registered photo association.

Desktop Chrome retried an interrupted attachment, an emulated iPhone added a photo to the Puebla story, and a fresh Journal viewer opened both images. The two original stories each have one synthetic attachment. The stored hashes match the source bytes and both associations are in the entry recovery history. The six itinerary visits and saved driving waypoint are still present. The local build, typecheck, 1,093 focused site tests, and nine upload-validator tests passed.

The local gateway runs the finalizer source against the isolated Auth, Storage and database services. This verification covers the local preview.

## Removing and restoring an entry photo

Open **Journal → Edit Journal entries**, select a story, and choose **Remove from entry** alongside its photo. The original stays in the private **Gallery**. Reopen the story’s editor and choose **Restore to entry** to recover that photo. The command preserves later edits to the story and its other photos.

Backend commit `55ace13` checks the linked trip, current editor session, entry revision and the selected Gallery photo’s attachment history. An identical lost-response retry acknowledges the same transition. The command reuses the existing version history and keeps the gallery row and original bytes.

Desktop Chrome retried an interrupted removal and recorded one new revision. A fresh Journal guest saw the story without that attachment and could still open the image in **Gallery**. An emulated iPhone restored the same photo after a later story edit and preserved that edit. The original demo text and both attachments were verified after the run. The local build, focused lint, 1,095 site tests, and isolated SQL checks passed.

## Adding and removing points on a saved walk

Open **Tours → Mexico City Historic Center Walk → Edit track**. Choose **Add a point**, select the segment, and save the suggested midpoint or enter coordinates. Choose **Remove a point** to take an intermediate point out of the track. The station positions, names, and durations are preserved as the point indices change.

Backend commit `ed4b771` applies the track and station index changes together. A retry of the most recent structural edit returns the already-saved track when the operation and contents match. A stale action that would affect a shifted point is refused.

Chrome verified a lost-response retry, a fresh session seeing the inserted point, rejection of a stale removal, and read-only guest access. Removing the test point returned the walk to its exact prior geometry. The six visits, saved driving waypoint, and two Journal photos are in place. The local build, focused lint, 709 site tests, and isolated SQL checks passed.

## Editing intermediate points on the map

Open **Tours → Mexico City Historic Center Walk → Edit track**. In **Move a point**, drag an intermediate point. In **Add a point**, click the track line. In **Remove a point**, select an intermediate point on the map. The flat map previews one edit at a time. Use the form’s save button to apply the edit or **Cancel** to discard it.

Desktop Chrome verified all three gestures, cancellation before a save, and read-only guest access. The saved edits preserved station positions and the test restored the original track geometry. The fixture still has six visits, its driving waypoint, and both Journal photos. The map editor uses the existing Tour save commands.

## Editing a saved walk’s stations

Open **Tours → Mexico City Historic Center Walk → Edit stations**. Select a station, edit its name and stay in minutes, and choose **Save station**. Organizers edit the published walk while online. Guests can see the ordered stations and stay times.

The station command identifies the selected station by its saved key and shares the walk’s revision with track edits. Retrying the last save after an interrupted reply confirms the saved station. An editor with an older revision receives a conflict. The save preserves the track, station positions, walking estimate, and itinerary links.

Desktop Chrome exercised cancellation, validation, an interrupted reply followed by closing and reopening the editor, saving from a stale tab, and guest readback. The browser restored the original stations after the test. Local SQL checked access, field preservation, and conflicts in both directions between station and track edits.

## Adding and removing intermediate stations

Open **Tours → Mexico City Historic Center Walk → Edit stations**. Choose **Add a station** to turn an existing point on the path into a stop with a name and stay time. Choose **Remove a station** to turn a stop back into a regular track point. Select either target from the list or on the map. The start and finish are required.

Both actions save against the current walk revision. Retrying the same addition keeps the new station’s identity. The station list follows the order of the existing path. The save preserves the coordinates, walking estimate, and itinerary links.

Desktop Chrome tested map selection, cancellation, an interrupted save and retry, a stale-tab conflict, and guest readback. The test removed its temporary station and confirmed the original walk. Local SQL covered protected endpoints, permission checks, and preservation of existing track and station edits.

## Moving an intermediate station

Open **Tours → Mexico City Historic Center Walk → Edit stations → Move a station**. Select the station, then select an unused intermediate point on the map or from **Destination point**. The map marks the station’s current location while you choose. Confirm with **Move a station**.

The station keeps its identity, name, and stay time. Its former position becomes a regular track point, and the station list follows the order along the saved path. The first and last stations and points already occupied by another station are protected.

Desktop Chrome verified the map and list controls, cancellation, an interrupted save and retry, a stale-tab conflict, and guest readback. The test moved the station back to its original point and confirmed the original walk. Local SQL verified moving across another station, order, field preservation, endpoint protections, and compatibility with the existing station and track saves.

## Viewing saved stations on the Tour map

Open **Tours → Mexico City Historic Center Walk**. The map numbers the saved stations in path order, matching the station list. Hover a pin to see its name and stay time. The flat map and 3D terrain both use the saved positions. Opening the track editor or choosing a station action on the map brings up that action’s controls. Closing the editor brings the saved pins back.

Desktop Chrome checked guest tooltips, opening and closing an editor, and the pin appearing at a different map position after a saved move and a fresh guest sign-in. The test restored the original walk. The terrain test verified the same station names and non-draggable pins.

## Cloudflare Tour station review

Open the [Mexico Tour stations review](https://mexico-road-trip-familytravelsite-integration-preview.lmisael0721.workers.dev/tours/) for five sanitized browser captures from website commit `f469c3540`. The page shows the guest map and the edit, add, move, and remove controls. The original three Road trip captures are accessible from the same alias.

Cloudflare Worker version `f88dab8e-04bc-4199-8f1b-53e6c2f67d70` uses only the static assets binding. The new captures exclude the account header and show the synthetic walk. Capturing the editor flows sent zero save requests. The hosted check verified file hashes and Chrome navigation at desktop and phone widths. The before-and-after deployment checks returned matching IDs for production and the active integration site.

## Combined Mexico preview acceptance

Desktop Chrome and an emulated iPhone each navigated Road trip, Tours, Journal, and Collab as the organizer and as a guest in separate sessions on the same mock trip.

- **Road trip** kept the six visits in their saved driving order on desktop and let each role select the two Puebla visits separately. Both roles and layouts routed through the saved Day 1 waypoint. Injected router failures kept the stops readable and showed **No route** on the unavailable legs.
- **Tours** opened the saved walk and station pins on desktop. On iPhone, **Plan → Places → Tours** now uses the planner's Tours setting. The phone list and day picker use the same qualified assignment permission as desktop. The organizer saved one untimed Day 1 assignment, the receipt confirmed the visit, and a fresh phone guest saw it. The temporary assignment was removed after verification.
- **Journal** showed both stories and loaded their signed Gallery photos. The organizer saw the editor. An unlinked response hid the Journal entry point while Tours and Collab remained available.
- **Collab** loaded Notes, Links, Polls, and Chat in both layouts. Organizer controls were available for composing, creating notes, and creating polls. Desktop **What's Next** showed all six visits, including the untimed stop.

The local build, typecheck, 158 focused tests, and native presentation check passed. The final fixture check confirmed the original six visits, saved driving waypoint, unassigned walk, and both Journal photos.

## Opening the Mexico test trip on the Cloudflare integration preview

The intended review opens a private Mexico test trip from the existing preview's trip list into its normal workspace. The mock record and its linked itinerary, Tour, Journal, and Collab data belong in Supabase. Use generated trip content, Family catalog references, and ordinary signed-in membership checks. The screenshot alias remains available for visual reference.

A local Chrome network trace covered Road trip, Tours, Journal photos, and Collab as the desktop organizer and the iPhone-sized guest. The fixture uses actual Family RPCs and table reads, signed photos, and public map and routing services. The flows issued zero save requests. All 18 local tests for preview-origin scoping and Tour reads passed. The branch currently enables these routes only for the local test trip and loopback origin.

The last hosted preflight verified 88 applied migrations and restored the earlier build on both Cloudflare sites. The 67 core migrations are still pending in that record. The Mexico backend branch at `5f8116388` adds 26 migration files after core checkpoint `c14ba0a8c`, covering reads and editing. Identify which of those files the first Mexico inspection needs and qualify their dependency order and compatibility with the deployed production website. [Hosted preflight and restored versions](preview-cutover-and-fallback.md#hosted-data-api-preflight-passed)

### Isolated replay of the core and Mexico migrations

The existing browser traces and source show that the trip workspace loads the core planner view, route preferences and waypoints, Tours, the linked Journey, and Collab Notes, Links, Chat, and Polls. Chat also polls the version 2 updates reader from the recovery migration. Later revisions of the Tour and Chat readers include track revisions, reactions, and attachment data. The rehearsal used the full ordered Mexico history so it covers the contracts behind the current build. A smaller inspection-only migration set would need its own rehearsal.

On 22 November 2026, a new network-disabled PostgreSQL 17.12 instance restored the verified X8 database archive. It replayed all 67 core migrations through `20261121184611` at `c14ba0a8c`, then all 26 Mexico migrations from `20261122050845` through `20261122222205` at `5f8116388`. File bytes were pinned to the Git commits. The replay used the modeled hosted non-superuser `postgres` login and Supautils 4.0.0 policy delegation. The ledger reached 181 versions, preserving all 88 original records. All 296,764 original rows matched across 200 archived projections. The new rows on these projections were the 93 migration records and three access-assurance registry entries.

On the upgraded copy, all ten workspace reads returned objects for a synthetic organizer and guest. Every read refused an unrelated account and an expired session, and all ten lacked anonymous grants. The transaction rolled back the test accounts and trip. These were database calls. Media reads and desktop and phone navigation have separate evidence from the earlier populated local browser fixture.

All 27 website tests for the feature gate, Tour reads, and core build profiles passed at the migration checkpoint. At that point the gate admitted only the configured loopback trip. The shared database rollout also needs the schema-compatible production build and fallback because the core migrations retire legacy writer permissions. [Coordinated rollout and recovery](preview-cutover-and-fallback.md#cutover-decisions)

### Cloudflare integration build rehearsed locally

The candidate `family-2026.11.22.1-rc.1` is built from website commit `32b3b64ef`. Set the `primary-core-mexico-preview-read-v1` core profile and `FAMILY_MEXICO_PREVIEW_TRIP` to the designated mock trip UUID at build time. The profile requires the approved Supabase origin and the existing Cloudflare integration hostname. It enables the four sections only for the designated trip. The read-only web transport checks the trip ID on the new read RPCs, admits signed photo requests through Storage and rejects saves, queue replay, and uploads. Supabase still enforces membership and media permissions.

The source-bound package passed typecheck, 234 focused tests, the native presentation check, the artifact scan, and `wrangler deploy --dry-run` for `familytravelsite-integration-preview`. In desktop Chrome as the organizer and at iPhone width as the guest, both browsers opened Mexico from the dashboard trip list and reached Road trip, Tours, linked Journal, and Collab. Both loaded the saved stops and two signed Journal photos. The read-only editor controls stayed unavailable and no feature saves were sent. The build also hid Journal when the link was absent. The browser used synthetic sessions issued by the isolated Auth service and routed its data requests to the local fixture. Unrelated dashboard stats and Collections requests were outside that fixture gateway's scope. Live sign-in, trip seeding, and activation remain rollout checks.

### Mexico seed and production fallback rehearsal

The [transactional seed](../../scripts/family/mexico-preview-seed.sql) uses the designated trip UUID, an approved Family, and a current MFA-verified organizer session. It creates one new trip and published walk, then uses the Family commands for six scheduled visits, a saved driving waypoint, two Journal stories, and Collab examples. It defaults to rollback and rejects an occupied ID or a matching trip name in that Family. No share or invitation links are created. Use the same trip UUID in the preview build and seed. Rehearse with `trip_id`, `family_id`, `organizer_user_id`, and `organizer_session_id` as psql variables. `commit_seed=true` is the explicit commit switch for the approved target.

The seed ran as the modeled non-superuser `postgres` on a fresh local restore with all 181 migration records. The rollback left zero trips. The commit produced the six visits, one traveler, one Tour, two stories, and the expected Collab data. The same ID and a different ID with the same Family and name were both refused on repeat. An unrelated account could neither seed nor read the trip and linked Journal. An active AAL1 organizer session was also refused.

The exact fallback built from `4b9ea419a` opened the trip in Chrome using both hostname configurations against the isolated feature database. Planner, Tasks, and Packing returned their saved views. A task save was refused before transmission, and the new Mexico panels stayed gated on the fallback.

The two generated assets are staged for the private `journey-media` bucket. Resolve the entry ID and current revision from the linked Journal for the seeded trip. Upload only these bytes to a new object in that Journal's path. Invoke `finalize-private-upload` as the authorized organizer with `kind=journey_image`, the same path, the trip, Journey and entry IDs, and the expected revision. If a response is lost, retry with the original path and revision and verify the saved attachment before another upload.

- **First evening in Mexico City** uses [Mexico-walk-preview.png](../../scripts/family/mexico-preview-media/Mexico-walk-preview.png) with SHA-256 `788565705870d602d58dfccddb194e6750126a588be6fb254e80e0c6034ccdd0`.
- **A morning in Puebla** uses [Puebla-preview.png](../../scripts/family/mexico-preview-media/Puebla-preview.png) with SHA-256 `fa95cd2d1fca42532f1f55a3ea4713d7f78856e1ff84a22be4cf093dc49d1418`.

The hosted `finalize-private-upload` source still uses the older Journey registration. The backend revision at `5f8116388` has the trip-scoped, revision-aware registration used in the local photo tests. The rollout must include that Edge Function before attaching the staged photos. After both photos are attached, verify the signed Gallery images and the normal preview trip-list path before announcing the new preview. Production and the integration URL still serve their existing builds.

### Journal upload function candidate and rollback

Hosted `finalize-private-upload` is active at version 6 with JWT verification enabled. Its `index.ts` and `inspect.ts` both match backend commit `c14ba0a8c` byte for byte. Those exact files form the rollback package. The release package takes the same two files from `5f8116388` and preserves JWT verification and the pinned Supabase client dependency. `inspect.ts` is byte-identical across both packages.

The handler tests compared eight existing request cases against v6, including ordinary Journey images, trip files, avatars, and list covers. Statuses, response bodies, RPC arguments, and cleanup behavior all matched. Eight linked-Journal cases covered hashing the staged PNG, revision conflicts, denied access, invalid inputs and failed reads. Rejected linked requests did not delete the image bytes. Nine inspection tests passed. The isolated database checks verified retry, revision and access checks, attachment recovery, and both original photo hashes.

Deploy just `finalize-private-upload` from the pinned candidate after the rehearsed migration sequence makes `register_family_trip_journal_photo_v1` available to the Data API. Keep JWT verification enabled. Fetch the deployed source and compare the two files and the setting to the package before attaching the staged images. If the function must be rolled back, redeploy the byte-matched v6 files. Once both images render in the signed Journal Gallery, the integration Worker can be activated and checked through the normal trip list. [Supabase Edge Function deployment](https://supabase.com/docs/guides/functions/deploy)

### Shared database rollout candidates verified

The exact production writer from `021be9846` and the recovery fallback from `4b9ea419a` match their staged asset receipts. A fresh network-isolated X8 restore replayed the 67 core and 26 Mexico migrations in order under the modeled hosted login. Its 181-entry ledger retained all 88 historical migration records and all 296,764 original rows. The current hosted ledger still matches those 88 version IDs.

Chrome used the production hostname with intercepted requests and signed in through real local GoTrue password and MFA. The production writer saved a task and a packing item in an existing category. Independent SQL found one row and one create receipt for each save. The fallback opened the same trip in a separate browser context, displayed both committed items, and refused a save before dispatch. This rehearsal exercised the supported-core writer and fallback. Hosted login, cache transition, and activation are still part of live acceptance.

The [release inventory](evidence/mexico-cutover/release-inventory.json) pins all 93 migration files and the asset hashes for production, fallback, and Mexico preview. It also pins the upload-function candidate and rollback and the trip seed and photo files. The hosted window must cover the shared database and these exact changes. Verify and record the fresh X8 recovery point and confirm the approved write pause before changing the ledger. Qualify the supported-core production writer or keep the compatible fallback in service while checking Mexico on the integration URL. The preview itself is read-only at this milestone. [Cutover and fallback procedure](preview-cutover-and-fallback.md#cutover-decisions)

## Ordinary trips on the live integration preview

The integration preview at `ce3201a65` opened the original Mexico trip from My Trips and showed both **Days / Road trip** and **Places / Tours**. The saved stop and empty Tours state rendered. The separate populated Mexico trip still displayed its sample walk, Journal and Collab tabs. Ordinary trip Road trip views show saved stops and waypoints without sending private itinerary coordinates to the public router.

The browser initially displayed an older app shell in a new tab and showed the new switches after a hard refresh. The release-handover tests reproduce a stale worker-served page skipping the update when the browser's shared version marker is missing or already current. The Family launch now compares the current release against the version compiled into that page. It requests a worker update in both cases and reloads once after takeover. For other installs the previous marker-based behavior remains available.

## Production qualification after the live preview

On November 23, the active production Worker was `7196c6c6-a836-4197-bb91-9f22f5e8ecd8` from `021be9846`. The integration Worker was `14147a66-db08-49e0-96ee-0a7f458a8291` from `cf0de6d65`. Supabase had the expected 181 migration versions and the same ledger digest as the approved cutover. The live production entry, release descriptor and service worker matched the rollback package. The existing read-only fallback package from `4b9ea419a` also matched its recorded asset inventory.

Local build `family-2026.11.23.4-rc.1` packages `cf0de6d65` with the production writer profile. Its 3,466 assets hash to `9e149830711c7b9edd9a17502a9b881edf62d3075abc2edbbbec183e0f3e03e1`. The build, typecheck, asset and source scans, source guards and Cloudflare dry run passed. The 911 selected website tests and 542 backend tests ran locally. In 181 additional checks using the real origin and profile bindings with a test transport, the writer admitted supported planner, task and packing commands, and the fallback admitted their receipt reads while refusing saves. No requests from those checks reached the hosted database. The build is a local comparison package.

The production profile still keeps Road trip and Tours off, even though their read routines are present on Supabase. The dashboard's New Trip form calls `create_trip_proposal`, which is also present. Its submit is still blocked by the production browser's write boundary. A planner create command adds a place or visit to an existing trip and cannot substitute for the proposal flow.

Qualify the actual New Trip proposal first, including membership, role, and retry behavior on an isolated fixture. Then qualify the ordinary Road trip and Tours readers within the production writer profile while preserving supported saves in the rest of the workspace. The integration preview remains the reference for the linked Journal and Collab surfaces. Approval and a separate source binding for the resulting production build belong to that release.

### New Trip database repair rehearsal

The network-disabled preview restore had 155 migration records. Read-only catalog checks matched the definitions of nine relevant routines byte for byte against hosted Supabase. Using synthetic members, the original routine accepted an organizer and denied guests and members of another Family. An adult member passed the proposal check but failed the separate schedule permission when creating the new draft's days. Repeating the organizer's submit created two trips and two proposals. The database routine alone accepted the simulated expired and missing session claims.

The [shared schema candidate](https://github.com/Misael-L/FamilyTravelApp/commit/60b6c222c080a3f1c29bd4f3a4da3f80cea5ebb4) checks current session and proposal authority, initializes the days of the newly created draft, and records a receipt for each operation ID through `create_family_trip_proposal_v1`. The old function signature remains available to existing callers. The receipt-backed route handles the retry.

The candidate applied under the local `postgres` role inside a transaction that rolled back. Both permitted roles succeeded. A repeated submit returned one trip, one proposal, one audience row, three dates and one receipt. A changed payload, suspended member, expired or missing session, and traveler from another Family were refused. The guest and unrelated member remained denied. The legacy routine also refused the expired-session case. The candidate schema and all fixture rows rolled back. All 116 existing focused website and backend connector tests passed.

The Cloudflare website still submits through the earlier route. Next, connect the desktop and phone form to the receipt-backed command in the writer profile. Verify that a lost reply reuses the original operation, and rehearse the whole submission on an isolated fixture before considering the hosted migration.

### New Trip website integration

Website source `2079cfbc4` routes both dashboard New Trip forms through `create_family_trip_proposal_v1` in the bound writer profile. A retry from the open form sends the original submission ID and payload. It holds those details in memory and drops them when the form closes or the page reloads. The browser forwards this command only from the bound writer to the configured Supabase origin.

All 176 focused website tests passed. They exercised both screen sizes, a lost reply across midnight, a double click, an incomplete receipt, a definitive database rejection, and a change of account during submission. The separate isolated database rehearsal repeated the same operation and returned one trip, one proposal and one receipt. The SQL transaction rolled back the migration and fixtures.

The shared database migration in `60b6c222c` has to precede the writer build at rollout. Continue locally with ordinary-trip Road trip and Tours reads in the production writer profile, then qualify the combined release. Cloudflare's current integration preview still has its read-only profile.

### Saved Road trip and Tours on ordinary trips

Website source `506643aa3` shows Road trip and Tours on normal trip pages in the origin-bound production and writer-preview profiles. Road trip displays saved stops, settings and waypoints. Tours displays saved tracks and stops. These views are read-only, and Road trip has no live driving directions. The Days planner keeps its edit permissions. It does not send legacy positional waypoint updates when an itinerary changes because Family waypoints belong to pairs of visit IDs.

All 478 focused website tests passed, including the desktop and phone wiring, planner edits, the New Trip receipt, and the scope checks. The 329 additional checks used the real configured origin bindings with a test transport. The route and tour readers follow the active trip UUID. Requests for another trip, route and tour writes, and ordinary-trip Journal and Collab access are refused by the browser boundary. Supported planner, task and packing writes remain available in the writer profiles. The read-only fallback stays on its existing profile.

The three existing database readers were also exercised against two synthetic trips in the isolated local restore. The populated trip returned a saved waypoint and a tour with track and stops. The organizer and a permitted guest could read it. An unrelated Family account and a session without a session ID were refused. All checks ran in a read-only transaction.

The next release check is the combined New Trip, Road trip and Tours candidate and its fallback. Confirm the shared schema migration and website activation order before calling the release ready. This checkpoint did not change either Cloudflare site or the shared database.

### Combined writer and fallback rehearsal

The production writer `family-2026.11.23.6-rc.1`, writer preview `family-2026.11.23.7-rc.1` and read-only fallback `family-2026.11.23.8-rc.1` were all verified from website commit `b390c07ba`. The package inventory pins each app entry, service worker and full asset tree. Wrangler dry runs passed for both writer targets and for the fallback on both Workers. The loopback Workers served the expected dashboard and trip shells. Both fallback configurations returned the exact standalone recovery page directly. [Build and rehearsal evidence](evidence/combined-writer-release-20261123.json)

All 689 focused website tests, 542 backend connector tests and 360 origin and profile checks passed. The fallback blocked New Trip and other writes, and admitted the existing task and packing receipt reads on both original origins. The website tests also covered release handover and retained queue data. Open-form New Trip retry still depends on the dialog staying open.

In the isolated restore, the pending database migration reused one trip, one proposal and one receipt when the submit was repeated. The new trip's saved driving preferences, waypoints and tours returned valid empty results. Eleven existing route, tour, planner, task and packing function definitions and grants matched before and after applying the migration. The transaction rolled back the migration and test data.

Before rollout, compare the hosted ledger and both active Worker versions with the approved deployment plan. The read-only fallback remains the recovery package. The writer requires migration `20261123221046` from shared schema commit `60b6c222c`. Apply the migration before activating a writer, then check the signed-in flow in a designated test trip before production activation. The rehearsal ran locally.

### Hosted preflight for the combined release

The hosted PostgreSQL 17.12 migration ledger has 181 versions and the same digest as the approved Mexico cutover. Migration `20261123221046`, its new command, and its private receipt table are pending. Twenty relevant function definitions and their authenticated and anonymous execution grants match the isolated rehearsal. The migration role can create the required objects and replace the existing proposal routine. The PostgREST schema reload watchers are enabled. Confirm that the new command is visible through the hosted Data API after the migration. [Hosted preflight evidence](evidence/hosted-new-trip-preflight-20261123.json)

Cloudflare reported the expected active Worker version at 100 percent traffic for each origin. Production serves `021be9846`, and integration preview serves `cf0de6d65`. Both public release descriptors, app entries and service workers match their previously pinned packages. Cloudflare also retains the earlier recovery version for each Worker. The three local candidate asset trees and the pending SQL match the combined rehearsal.

The next release step is to stage the prepared recovery version, apply the single New Trip migration during the coordinated rollout, and verify the signed-in flow in the writer preview before activating production. The active preview remains the read-only Mexico build. This preflight only read catalogs, deployment metadata and public assets.

### Read-only fallback staged on both Workers

Cloudflare holds `family-2026.11.23.8-rc.1` as an inactive version on each Worker. Production's staged fallback is `65d2df60-8520-498c-9fac-d13d8a44fe5e`, and the integration preview's is `93268165-5679-47b4-b990-f7fc65d3e6ae`. On both version URLs, the release descriptor, app entry, service worker and standalone recovery HTML match the local package. The recovery HTML returned HTTP 200 directly. The actual device-recovery flow requires the original website origins. [Fallback staging evidence](evidence/combined-fallback-staging-20261123.json)

Both live traffic assignments remained at 100 percent on their previous versions throughout staging. Supabase still matches the 181-version ledger. The sanitized corresponding-source archive for `b390c07ba` passed both local scans and awaits publication before activation. New Trip migration `20261123221046` remains pending for the coordinated window.

### Matching fallback source published

Public tag `source-20261123-b390c07` points to source snapshot `a7ca594b4`. The sanitized archive uses the exact tracked bytes and file modes of website commit `b390c07ba`, with the reviewed private plan omitted. Its release manifest binds one source tree to both staged fallback versions. The archive scan, public tag lookup and unauthenticated manifest download all passed. [Public source archive](https://github.com/Misael-L/familytravelsite-source/tree/source-20261123-b390c07)

The publication updated only the new source tag. Both recovery versions and the previous live assignments were verified again. The Supabase ledger still has 181 migrations, with New Trip migration `20261123221046` pending. [Publication receipt](evidence/combined-fallback-source-publication-20261123.json)

### November 25 X8 recovery point

The X8 generation `pre-new-trip-cutover-20261125` was captured at 4:06 p.m. Eastern after both Cloudflare recovery builds were active, the Data API guard had refused the live test request, and two checks showed that active database transactions, exports and multipart uploads had drained. Independent verification checked the database archive, source archive and all 77,040 stored objects. The dump contains all 181 hosted migrations. The backup reused 77,038 media objects and captured the two Journal preview images, which match the pinned original files byte for byte. [Backup receipt](evidence/new-trip-x8-backup-verification-20261125.json)

The dump includes the temporary maintenance schema and Storage policies. Reconcile those controls when restoring this recovery point before enabling writes. Verification covered archive contents and file hashes. The full restore rehearsal used an earlier generation. The New Trip migration is still pending and both sites were in recovery mode at this checkpoint.

### New Trip migration applied on November 25

Supabase recorded migration `20261123221046` in the same transaction as the schema changes. The migration source matched the pinned SHA-256, and the 182-entry ledger retains all 181 previous version IDs. Nineteen existing routine definitions and their checked grants match preflight. The updated proposal routine retains its signature and grants. The new command requires authentication, and its receipt table and helper stay private. After maintenance, an anonymous request to the hosted command returned HTTP 401 with PostgreSQL code `42501`. [Migration and maintenance evidence](evidence/new-trip-migration-20261125.json)

The temporary REST guard and three Storage policies were removed, and scheduled exports and their execute grants were restored. Both Cloudflare Workers returned to the builds they served before maintenance. Their version IDs, public app entries and service workers matched the pinned records. The integration preview is read-only. The remaining release check is the New Trip submit and its retry from the signed-in writer preview before promoting the new production build.

### Hosted writer-preview New Trip verification

Cloudflare served writer candidate `family-2026.11.23.7-rc.1` to the isolated desktop Chrome test through a version override on the normal integration origin. It received zero percent of ordinary preview traffic. The retained test Family's household link was initialized for its sole QA member. The test signed in with a password and MFA and opened New Trip from the dashboard.

Supabase accepted the proposal. The test dropped the first successful response, and **Retry submission** sent the same operation ID and payload. Both responses identified the same trip and proposal. The dashboard showed the trip after reload. A separate hosted query found one trip, one proposal, one matching receipt, one audience branch, one traveler, and seven trip days in the private QA Family. The synthetic trip remains in that private Family. [Hosted writer test receipt](evidence/new-trip-writer-preview-qa-20261125.json)

The temporary QA account was disabled and its active sessions were revoked. The version override was removed. Cloudflare verified both original live assignments. The standard integration URL serves its read-only build, and the production writer candidate is ready for its separate rollout decision.

### Production writer staged for release

Cloudflare holds production writer `family-2026.11.23.6-rc.1` as inactive version `88152fc4-4a1b-4ee2-9345-732b71aecb85`. Its public version URL served the exact login, dashboard, and trip workspace shells, and its app entry and service worker match the rehearsed build. The ordinary production and integration origins still serve their prior versions at 100 percent. Both recovery versions and the direct recovery page passed re-verification. Supabase still has the verified 182-entry ledger, with the normal Data API and export schedule active. [Production staging evidence](evidence/new-trip-production-staging-20261125.json)

The prepared `source-20261125-b390c07` tag binds the production Worker version to the source tree already verified for the public mirror. Its only change is the scanned release manifest. After release approval, publish and verify that tag, then route the production origin to the pinned writer. Recheck the production entry, service worker and signed-out app routes on that origin. If the checks fail, return production traffic to the verified previous version, keeping the supported database migration in place.

### New Trip production release

Cloudflare activated production writer `family-2026.11.23.6-rc.1` at 100 percent on November 25. Version `88152fc4-4a1b-4ee2-9345-732b71aecb85` serves New Trip and the saved Road trip and Tours views on ordinary trips. Its login, dashboard, and trip shells and the entry and service worker match the pinned build. In a fresh signed-out Chrome context, the protected dashboard redirected to the production sign-in form. The signed-in submit and lost-response retry were verified on the writer preview using the same website source. [Production verification](evidence/new-trip-production-release-20261125.json)

The public source tag `source-20261125-b390c07` was verified before traffic moved. The live preview still serves its pinned read-only version. Supabase retains migration `20261123221046` and its 182-entry ledger. Cloudflare retains the exact previous production build and the staged read-only recovery package. [Matching public source](https://github.com/Misael-L/familytravelsite-source/tree/source-20261125-b390c07)

### Profile photo and Admin loading fix staged

Commit `f2a0b4500` lets the hosted builds request signed links for registered private profile photos under the Family people folder. It also forwards the eleven Supabase reads used by User Defaults, Maps, Packing Templates, Categories, identity and file-policy health, Features, notification defaults, Export status, and product Audit. Existing authorization still applies to each request. The production database still links the reported photo to its private Storage object.

The isolated restore matched all eleven hosted function definitions and grants. Ten Family-level reads returned results for a reviewer, and refused a guest and a reviewer in another Family. Rollout history required a platform administrator. Storage let a member read a fixture avatar and refused a reviewer from another Family. The synthetic rows rolled back. All 237 focused website tests, 542 backend tests, typecheck, scoped lint, and the production build passed. [Staging and permissions evidence](evidence/avatar-admin-production-staging-20261125.json)

Cloudflare holds the fix as inactive production version `9296b138-b5b1-4c12-81fe-8a7bb0e13cb9`. The version URL served the pinned app entry, service worker, login, dashboard, Admin, and trip shells. Production currently serves `88152fc4`, and the recovery page and integration preview match their pinned versions. The scanned source tag `source-20261125-f2a0b45` is prepared. After approval, publish and verify that tag, then activate the staged version and check both live origins. The previous production version is available for rollback.

### Profile photo and Admin loading fix released

Production Cloudflare version `9296b138-b5b1-4c12-81fe-8a7bb0e13cb9` serves the profile photo and Admin read fix at 100 percent. The deployed entry, service worker, and login, dashboard, Admin, and trip shells matched the pinned build. A fresh signed-out Chrome context redirected the protected Admin route to the production sign-in form. The signed-in request and authorization checks were performed in the earlier isolated verification. [Production verification](evidence/avatar-admin-production-release-20261125.json)

The public tag `source-20261125-f2a0b45` was verified before traffic moved. The previous production version `88152fc4` remains the rollback target. [Matching public source](https://github.com/Misael-L/familytravelsite-source/tree/source-20261125-f2a0b45)
