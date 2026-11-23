# U05-B2 — editor repairs and demonstrated stay contract blocker

13 November 2026 UTC. Local application `8ced14cadf7b12720227f0ff56e524f7a33f5588`, parent `05625f4da998b491ba41263e948c0f97c21010ea`, branch `codex/trek-v5.1.4-family-reconcile` in `/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4`. **The bounded editor/provenance repairs are complete. Linked stays and confirmed timing remain blocked on the new canonical foundation; the whole B2/U05/release is not complete.** No hosted SQL or deployment occurred.

## Reproduced failures and repair

The starting eleven-file cohort passed 467 methods. Ten new focused cases then reproduced five failures: the actual booking and transport dialogs kept the first imported item when another draft was selected, and the shared hotel form borrowed window ends from another check-in source or showed an orphan end without check-in.

Exactly five runtime/test paths changed. The two existing dialog call sites now pass their reviewed draft as opening identity when no saved booking exists. The Family initialization hook preserves refreshed records by saved ID, distinguishes unsaved draft objects, preserves typed values through fresh arrays and resets on close/reopen. Guarded state replaces render-time ref mutation. This adopts the upstream refresh-safe behavior while correcting the Family hook's draft-selection omission; no layout/style/control change was made.

The shared hotel form now follows the existing native card rule: an explicit booking check-in uses only its own window end; inherited stay check-in uses only the same stay's end; missing check-in has no window end. Explicit check-out still wins. The phone continues omitting the desktop-only end field, and its existing observed writer preserves canonical metadata. The protected 12 native layout files, permissions, source pins, timing refusal, original commands/files/queue and backend sources remain unchanged. Source hashes/reasons are recorded individually in runtime-scope.json; no prefix allowance or baseline expansion was added.

## Fresh qualification

- **477 passed / zero failed / zero pending in 12 client files**, one final combined run: 467 existing and 10 new methods. Includes native desktop/phone booking/transport/form models, actual observed Axios/IndexedDB callbacks, permission/refusal/retry/session handling, date-only and genuine-midnight preservation, and stay consumers. A mocked backend boundary remains mocked; this is not a new real SQL/Auth/browser qualification. The separate live-named test harness was not invoked or counted as live evidence.
- Configured client and Family backend types pass. All seven existing page/layer/offline/pair/format/localization gates pass, as do actual carryover verification and 90 source/history/inspector/carryover guard cases. Carryover remains 120 files/eight revisions/nine existing patches/21 additions. Scoped ESLint has zero errors, no increase in warning counts/categories and no warnings in the new test/hook; existing native complexity/other warnings remain. Format baseline remains 2137, unchanged.
- Ordinary build from `8ced14cadf7b12720227f0ff56e524f7a33f5588` passes using only the earlier loopback public anon fixture. All 3474 files were hashed; only anon JWTs and no private/secret keys were found. The 33,631-byte worker retains native skipWaiting/clientsClaim; the repaired v4 holiday reader remains bundled and its v3 URL absent. This local fixture build is not a selected deployable artifact.

An initial fixture omitted a required file-delete callback and was corrected without relaxing compiler checks. A diagnostic root-directory Vitest invocation selected no runnable tests; the final combined command uses the actual client directory and explicit file list. Red failure identities, final exits, source scope and lint comparisons are retained separately.

## Missing canonical stay/timing facts

The audit traced native DayAccommodations, AccommodationsService.createAccommodation, real Family booking-view/read/saved contracts and the legacy editor. Native TREK atomically creates stay+partner-booking+stop and mirrors metadata. Family currently keeps lodging as trip_reservations, and the old mistaken day_accommodations table was removed. There is no qualified independent stay identity/link/read/write contract or classified named-zone hotel timing in canonical 129. metadata.check_in_until and legacy midnight/UTC helpers are not a safe substitute.

Current native accommodation APIs are deliberately refused before consuming compatibility empty responses. No guessed hotel/Trip/day join or fabricated clock was added, and no stay table was implemented in this packet. Existing note/date editing stays qualified; transport/timing/create/companion gates remain intact. Existing saved/shared DTOs were not changed or relabelled as containing new stay facts.

**Next: [U05-B2b canonical stay/timing foundation](trek-5.1.4-stay-timing-foundation-packet.md).** It specifies separate planned stays, optional explicit booking links, authoritative existing booking instants plus named-zone classification, same-Trip/location FKs, permissions, transactional commands, recoverable aggregate ownership and versioned live/saved/shared projection. B2b1 is the bounded additive local schema/read foundation and real SQL/RLS/recovery qualification; no hosted application or native activation. Later commands and coordinated consumers have finite separate acceptance steps. Do not copy upstream cascade/mirrored mutable data or add three DTO columns blindly.

## Preservation and release limits

Canonical 129 migrations / 296 source files and the mixed canonical index are byte-exact. The old 5.1.2 branch remains clean at 60b1e092a with 16,885 tracked hashes intact. 83 earlier evidence seals/6,048 members and 26 original backup nonmedia hashes verify unchanged. Media bytes/ignored ETL were neither scanned nor written. No database was contacted; no production/preview/main/push/publication, billing/settings, backfill or transformation change occurred. Independent/off-device restore and incremental backup remain separate existing work.

Accepted source metadata still describes 5.1.2 and deliberately refuses the unadopted 5.1.4 candidate. F4 publication/F5 catalog and final U05-C/F3c actual service/browser/engine/source/release acceptance remain. Holiday live availability/CORS also remains unverified. Do not interpret this local repair as a preview/main release.

Private stage: `/private/tmp/trek-u05b2-bookings-20261113`. Sealed evidence: canonical `evidence/u05b2-editor-stay-contract-2026-11-13`.
