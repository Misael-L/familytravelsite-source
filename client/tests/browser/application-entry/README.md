# Actual application-entry acceptance

This harness builds the ordinary `client/index.html` → `src/main.tsx` → `App` / `installFamilyFrontend()` path with the existing production Vite configuration. It uses the installed Supabase SDK and real local Auth/MFA/Data API. There is no SDK replacement plugin, custom React root, imported screen fixture, preinstalled planner cohort, fabricated session or authorization claim.

The companion guarded seeder is `/Users/Misael/Desktop/FamilyTravelApp/supabase/tests/prepare_application_entry.py`. Its existing setup verifies the disposable marker, project/configured/Docker ports, absence of a hosted project reference and absence of the production Family fingerprint. It seeds synthetic linked Family members, a nonmember, a trip, a city, restaurant/booking/expense/file metadata, a tiny synthetic original file in local Storage, and a task. It enrolls and verifies a real TOTP factor through local Auth. Passwords and the authenticator secret remain in a private mode-0600 fixture under `/private/tmp/trek-u03d6-…`; never commit or copy that file into evidence. No schema reset or migration runs.

With Node 24, the candidate dependencies/shared outputs available, Docker running and the marked 119-migration disposable stack already prepared:

```sh
python3 /Users/Misael/Desktop/FamilyTravelApp/supabase/tests/prepare_application_entry.py \
  --output /private/tmp/trek-u03d6-NEW/private-fixture.json

# From the candidate's client directory:
D6_FIXTURE=/private/tmp/trek-u03d6-NEW/private-fixture.json \
D6_OUTPUT=/private/tmp/trek-u03d6-NEW/build \
NODE_OPTIONS=--max-old-space-size=8192 \
node tests/browser/application-entry/build.mjs

D6_FIXTURE=/private/tmp/trek-u03d6-NEW/private-fixture.json \
D6_DIST=/private/tmp/trek-u03d6-NEW/build/actual-dist \
D6_OUTPUT=/private/tmp/trek-u03d6-NEW/browser \
node tests/browser/application-entry/run.mjs
```

The inherited fixture setup requires the existing local Supabase CLI and Docker binaries on PATH. The browser runner uses the Mac Chrome application path. Build output is fresh and records emitted hashes. It does not overwrite `client/dist` or a previous build. Use a fresh fixture/output for a new rehearsal. `D6_PROFILE=desktop`, `phone` or `tablet` selects one profile for diagnosis; default runs all three.

Ten cases per profile cover the signed-out trip destination, password/MFA gate before trip reads, invalid MFA rejection, valid MFA and existing-trip load, full reload, native logout and denied trip reopening, a second account's membership gate without previous-trip disclosure, blocked-account reload, returning to the owner after blocked-account logout, and a cached display identity whose SDK session is absent. Deliberate logout may choose the configured startup page; the test requires fresh owner MFA and subsequent trip access. The initial signed-out trip destination is checked strictly. Native desktop/tablet and phone labels/layouts are asserted separately. The runner also refuses a false connection-warning banner after successful validation.

Only the loopback preview and `http://127.0.0.1:55331` may receive HTTP traffic. Only that local stack's websocket is connected. Every image-transformation request is aborted and fails the suite. Currency/map provider requests are explicitly recorded and denied, never represented as successful responses; any other external application request fails. Service workers are blocked to prevent interception bypass. Therefore map tile rendering, currency rates and PWA/service-worker lifecycle are not qualified by this harness. The fixture contains no catalog photo bytes; zero transformation attempts here do not substitute for the explicit-cohort gallery/variant tests.

The historical D6 result used the preserved legacy Family controller. D7 installs the qualified planner composition during ordinary bootstrap. Its separate normalized fixture is created by `/Users/Misael/Desktop/FamilyTravelApp/supabase/tests/prepare_planner_entry.py`; it classifies a synthetic legacy visit through the observed timing command, includes repeated/untimed/midnight visits and local ready image variants, and still uses real password/MFA. This never classifies real user data automatically.

D7 supports `FAMILY_ENTRY_FIXTURE`, `FAMILY_ENTRY_OUTPUT`, `FAMILY_ENTRY_DIST` and `FAMILY_ENTRY_PROFILE` (the old D6 variables remain aliases). Use fresh `/private/tmp/trek-u03d7-…` paths. **Prepare a different fresh fixture for each explicitly selected `desktop`, `phone` or `tablet` profile**, since native edits intentionally change its personal/visit notes and task revisions. Omitting/invalidating the D7 profile fails before the browser run.

The D7 extension checks actual normalized bundle identity, clocks on embedded occurrence copies, blank personal notes separate from description, a local hero variant URL, refusal of a raw native writer, native selected-visit form save and native task create/completion/Trash/restore. A completed task's new revision is explicitly reopened before deleting it; older forms are not silently rebound. A fresh GET observation may retry a realtime-retired 409; no command is rebased or retried under a new identity. Desktop/tablet and phone use their actual native navigation and form labels.

Known map, currency, weather and native day-routing provider requests are recorded and denied; all other external requests and every transformation attempt fail the suite. These runs block service workers and do not qualify PWA lifecycle, real map tiles, native private-file/booking/expense callback coverage or packing authoring. Do not deploy the local-endpoint build or advance the source pin from this test alone.

## D8 native private files and booking callbacks

Prepare one fresh fixture per profile with `/Users/Misael/Desktop/FamilyTravelApp/supabase/tests/prepare_native_file_booking_entry.py --output /private/tmp/trek-u03d8-NEW/desktop/private-fixture.json`. The positively marked disposable stack must contain the unchanged 119 migrations. The fixture adds synthetic original PNG/PDF bytes, an existing hotel booking with microsecond instants, a separate date-only admission, linked file/expense/share/payer snapshots and another Trip. Setup is privileged arrangement; the browser signs in through the actual installed SDK and real password/TOTP. Unsafe, existing, noncanonical or symlinked destinations are refused before database setup. Keep private fixtures mode 0600 outside committed evidence.

Use the same build/run commands above with `FAMILY_ENTRY_*`, a new `/private/tmp/trek-u03d8-…` output and an explicit `FAMILY_ENTRY_PROFILE=desktop`, `phone` or `tablet`. Build the ordinary entrypoint once, then reuse that local-endpoint artifact with separate fixtures for the three profiles. It must never be deployed. `native-file-booking-checks.mjs` selects the D8 cases only when the fixture contains `native_files_bookings`; the accepted D6/D7 paths stay available.

The native consumers differ. Desktop/tablet use image and embedded PDF viewers whose scoped object URLs must be revoked on close. The phone opens a PDF as a native exported Blob tab: its bytes/hash are checked, but downloaded/exported bytes cannot be remotely recalled. Desktop/tablet keep an inline image active for account/logout retirement checks. The narrow phone uses icon rows and a modal viewer; it closes that viewer before native Trip/account navigation and proves its URL stays revoked. Trip changes go through the actual SPA router without replacing the app, SDK or provider. Phone navigation uses native Back, Dashboard and Trip cards, verifies the other Trip’s empty itinerary and restores the original Files directly through its Trip card. The final run requires coherent rapid Files return without a manual read Retry.

Existing booking forms save real synthetic title/notes/confirmation changes and an actual calendar day selection. Canonical observations preserve original instants and microseconds, metadata, identities and independent civil dates; the date-only record stays untimed. Existing hotel selectors read a separately linked accommodation; this fixture has none, and no fabricated stay is supplied to fill those selectors. Native hotel-stay/clock changes are not qualified or enabled here. Desktop/tablet's linked-expense opener reaches the real editor, whose unsupported save must stop before persistence. Phone's booking form refuses its expense companion before opening it or partially saving typed header fields. Independent post-browser read-only SQL checks compare original file/link and expense/share/payer rows.

Requests are observed at their actual boundaries. The sessionless cold-start case unloads the old valid SDK document before measuring new request initiations, so its late responses cannot be mistaken for requests by the new document. Chromium's packaged `chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/` PDF viewer and `chrome://resources/` assets are recorded separately as browser-internal resources. They are not remote HTTP providers. Every other unknown application origin and every `/render/image/` request remains denied and fails acceptance. Known map/currency/weather/routing services remain denied, and service workers remain blocked.

The phone hotel recovery case deliberately aborts one real canonical planner read only after the save RPC acknowledges success. The still-open unchanged form retries through native Update; actual RPC operation IDs and body hashes must match. The test observes visibility because a closed native phone sheet can retain its DOM. It never reopens or rebases the form, retries an unrelated failure, or fabricates a successful network response.

This packet does not prove native private-layer switching, a delayed Storage-body response across every transition, full offline startup, PWA/worker isolation, file or expense authoring, hotel-stay lifecycle, provider integrations or full version adoption. Retain the earlier focused owner/late-response/layer tests as separate evidence; do not label them new browser coverage. Whole-version acceptance and release remain gated.
