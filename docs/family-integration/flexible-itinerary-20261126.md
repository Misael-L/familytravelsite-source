# Undated New Trip website integration

This candidate completes the website adoption of the flexible-calendar backend in FamilyTravelApp commit `a615475`. It requires migrations `20261126045856_family_flexible_trip_calendar` and `20261126191518_family_flexible_trip_planner_bridge` in that order. Neither is installed in production yet; live schema remains 184, latest `20261126010207`.

New Trip keeps absent dates absent, materializes the requested numbered itinerary, and saves the selected catalog currency. Its receipt freezes the currency and all other original submission fields across retries. A start-only or end-only input remains an explicit anchor; it is resolved by the checked database command. Duration does not become a second writable count stored beside the itinerary rows.

Native notes use their day UUID rather than a nullable date. Their descriptive Markdown, icon, color and fractional ordering survive saves, copy and day recovery. The historical native note `time` property means description and maps to the relational `detail` column. The online note port retains the operation UUID, original edit timestamp and actor; it checks older queued work and fences hydration after navigation or session changes.

The published planner exposes Choose dates only for direct metadata and schedule authority and only after its checked calendar port is installed. It assigns dates to the existing days. The desktop sidebar and phone timeline have exact two-line Family insertions; removing them reproduces the previously pinned native files byte for byte. All other protected presentation remains pinned. Occasion remains on the right of New Trip.

## Verification

The ordinary production application build was exercised against a real local PostgREST API and an isolated restored PostgreSQL database with synthetic current-MFA users. Browser checks deliberately lost a successful submission reply, retried without another trip, created a seven-day undated MXN proposal, added a native activity and a Markdown/color note, copied the trip, checked fresh copy identities and retained contents/currency, assigned dates across leap day, and reloaded. The iPhone layout repeated date assignment and reload on the copied undated trip without changing day, visit or note IDs. No unexpected API failures or browser exceptions remained. The phone control was verified below the floating toolbar and without horizontal overflow.

The focused website suite passed 463 tests. The affected backend-adapter suite passed 42 tests. The existing presentation/release-contract suite passed 70 tests. Database checks cover managed-role installation, invalid state rejection, session/Family isolation, exact retries, concurrent stale changes, privileged direct-write serialization, old retained-note recovery, full fractional ordering and a committed 3,660-day trip. Both v1 and v2 cover receipt/Storage authorization tests pass. Synthetic committed databases, their API service and temporary auth material were removed afterward; the restored baseline was preserved.

The source gate also records the already-published end-only-date fix and private cover reader, which were missing from the previous carryover manifest. These are provenance records for existing behavior.

Third-party map and image-search services were excluded from the isolated browser run. The photo picker retains its separate paste/drop/HEIC/retry tests. Timed visits and dated bookings still require dates. General unrelated application writers are not enabled by this feature. Notes are online-only and published-layer; this is not an offline note-command rollout.

## Coordinated rollout

Verify the recovery point and live schema, apply the two reviewed backend migrations, check invariants and function grants, then activate the matching website build and perform the established private QA check. Keep older dated APIs available. Retain the expanded schema when rolling back the website: converting real undated plans into invented dates is not a safe rollback.

Machine-readable browser evidence is in `evidence/flexible-itinerary-20261126/verification.json`; backend SQL evidence is in the matching FamilyTravelApp verification document.
