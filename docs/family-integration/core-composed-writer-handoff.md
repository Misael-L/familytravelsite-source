# Q26c — composed native planner and base packing

**Accepted locally for the measured scope below. Full Q26 and preview release remain open.**

## Exact source and repairs

Incoming integration/publication HEAD was `8d8c9d13ec065017c8c443ba89fda829feffe844`. Application source is `fcf946324730f3797ead57838bc7ad8ea632391c`; the actual committed production-build source is `35cb9d9ded343308b85fb47c6aebd143dc0349f6` on `codex/trek-v5.1.4-family-reconcile`. Full TREK 5.1.4 ancestry, 12 exact presentation pins and native planner history remain unchanged. The existing isolated planner/base-packing profile, RPC allowlist, permissions and all qualification flags remain unchanged.

Actual native sequencing exposed two related gaps: reorder captured an older collection revision during a preceding edit's canonical refresh; the next partial-count click captured an older row revision while reorder finished. The server safely returned PT409, but the client had retained an original that would keep conflicting. Under the existing exclusive queue lease, the new queue-admission helper refuses an unretained stale collection command or one-click packed-state command before retention/network. A fresh native action succeeds against current observations. It never silently rebases/replaces an original. Already-retained originals keep exact retry/receipt recovery; independent unchanged rows, create operations, existing form drafts, bag semantics and Trash/restore remain intact.

The admission concern lives in existing `packingIntentQueue.ts`, called by `plannerCohortPacking.ts`; six regressions were appended to its existing test file. No native control/layout/CSS was changed. The initial inline version crossed the unchanged size limit by two wrapped lines; extracting the queue concern removes that new finding without compression or allowance changes. A broader experimental row check also refused bag/restore/form operations; 20 existing controls detected it. That experiment was narrowed to the actual one-click packed-state case. Failed diagnostics and all successful controls remain retained privately.

## Actual browser and database proof

Ten fresh native scenarios (five per layout) cover: composed manual creation/selected-visit editing/base-packing create/name/quantity/weight/partial/group/visibility/Trash-Undo/reload; current packing permission denial/restoration; actual logout/fresh AAL2 sign-in; and unresolved planner versus packing originals holding the competing writer. The additional desktop scenario holds real canonical read responses to prove both revision races: the waiting stale action creates no queue row/RPC; its fresh counterpart succeeds once. Phone uses 390 px Chromium emulation, not a physical iOS application.

The browser uses actual App/production build, GoTrue password/TOTP, PostgREST/RLS and current schema 151 in a new synthetic Family. Native producers retain originals in the real immutable-owner IndexedDB before network dispatch. Unknown Check writes nothing; explicit Retry retains body/scope/UUID. A dropped committed reply settles after cold reload by a real read-only receipt. The final SQL verifier checks 32 unique operations, 127 write attempts and 40 read-only receipt checks against one digest-bound receipt per operation. Its 167 pre-network original inspections preserve exact owner/Trip/domain/operation intent.

Repeated visits keep distinct occurrence identities/day/notes. Catalog versus saved-location description/personal notes and selected-visit notes stay separate. Real midnight in America/Mexico_City remains timed; other visits stay untimed. Shared group commands leave both users' personal contents untouched. Reload retains the actual canonical planner and packing results. A separate 12-case real HTTP/session probe proves an unexpired signed AAL2 token from an expired session cannot read/write/receipt or obtain direct-table private rows. Only the newly synthetic test account's session is expired.

Zero JavaScript page errors and zero catalog transformation attempts occurred in accepted runs. Nonfixture requests and WebSockets were blocked before forwarding. Synthetic stored fixture bytes are not real Storage restoration or provider acceptance. No successful API responses or original queue records were injected.

## Explicit native entry limitations

Desktop packing drag reorder is available and exercised. The current phone `MPackingListTab.tsx` / `MPackingItemRow.tsx` expose no packing reorder control; no action was injected or frontend feature added to claim it. The earlier accepted inventory still excludes unmounted My Draft and native phone planner cross-day Move/Clear. These are unavailable-entry exclusions, not backend successes. Advanced bags/categories, stays, Collections writes, Tours, Collab, providers and other unrelated writers remain outside this profile.

## Verification and preservation

416 affected tests in 15 files pass, including the original bag/form/Trash/recovery controls and six new admission cases. Typecheck/build and all four exact-source/native/history/backend guards pass. Correct-source artifact scan passes; wrong/missing-source controls refuse. Scoped lint has zero errors/two unchanged inherited warnings; all 33 inherited size findings remain unchanged, no new findings or allowance changes. This is not a global quality-gate pass.

Schema151 catalogs/ledger/definitions/owners/grants/policies remain exact; no migration was applied. All 487141 incoming rows and 362464 original rows survive. The 370 canonical schema/test sources and mixed index, 183 prior seals/12135 members,11 auxiliary manifests and three other checkouts remain exact. Original backup/media/ignored ETL remain untouched.

The Mac had about 15 GiB free at entry. The new fixture uses strict APFS copy-on-write clones with distinct inodes and full source/target hash/mode verification, no hardlinks or fallback full copy. This is a local continuation fixture, not an independent backup. The older stopped source was never restarted. Only this packet’s three services stop; 265 older service states/135 older volume names and every older dataset/evidence remain preserved. See the final sealed runtime receipt for exact stopped manifest identity.

## Remaining work and next bounded step

Consolidate Q26's available native acceptance against its finite matrix and prior creation/editor/arrangement/task receipts. Identify any actual remaining source/account/Family/person/layer or competing-tab gaps before closing G1's local supported writer subset; do not equate this composition pass with every supported writer or ordinary/primary HTTPS activation. Record each unavailable native entry explicitly and do not add UI merely to make a test pass.

Then select the next demonstrated blocker from the [current release prerequisites](core-release-prerequisites.md). Inherited quality, current protection/incremental backup and independent database-plus-files restoration, current hosted schema/API/engine facts and real preview/source binding remain separate gates. The near-production retained-source cleanup checkpoint remains deferred; unused helpers are neither activated nor deleted by this packet. No main/remote push/hosted SQL/settings/billing/deployment/transformation change occurred. The publication companion is a clean local fast-forward and check-only unbound archive only.

Private reproduction stage: `/private/tmp/trek-core-composed-writer-source-20261116`. Fixture: `/private/tmp/trek-core-composed-writer-fixture-20261116`. Sanitized evidence is sealed separately in the canonical handoff index after final preservation/publication checks.
