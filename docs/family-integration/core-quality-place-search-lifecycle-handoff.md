# Q33 — native place-search lifecycle

Completed locally 16 November 2026. This repairs demonstrated active async lifecycle defects from G2. Repository-wide quality and release acceptance remain blocked.

## Reproduction and behavior

The desktop place-search hook already retired work when its dialog closed, but neither shell retired the hook's work on unmount. Pending map-link replies could call the old form and show success; details replies could apply a selection, or a details failure could start a fallback lookup nobody would see. Full/nearby failures could show stale notices and clear a retired parent's busy indicator. Separately, a superseded autocomplete request that failed with a normal Error could clear a newer suggestion list.

Unmount cleanup now increments the existing opening epoch, clears a pending debounce, aborts autocomplete and ends the existing in-memory search-session object. The established epoch checks then refuse late form callbacks, notices and fallback searches. Only autocomplete has an AbortSignal transport contract: this does **not** claim that already-started full/nearby/details HTTP work is cancelled at the server. Its obsolete UI work is retired.

Autocomplete's catch now ignores a reply from its own aborted controller before changing state. A genuine current failure retains native desktop/phone handling, including their existing AbortError difference. The debounce callback is synchronous and explicitly starts the already error-handled autocomplete Promise. No fake Promise type, new suppression, lost current error report or provider/billing configuration change.

## Exact proof and verification

Incoming clean integration/publication HEAD: `e938fe559dc515cfea3a64fdf60a4d7a5384444a`. Local implementation: `58fd79abe0290db141a5b050a8ac1ecabc998d31`. Committed build/qualification source: `e550293013fe4283895daca19e6973a92f5953d7`. Six frozen website paths: one search hook, one new regression test, two qualification files and two handoff/checklist documents.

The final exact new test bytes run the real `usePlaceSearch` hook in both native variants and the real `usePlaceSuggestions` adapter; only provider API methods and inactive shadow logging are mocked. On frozen incoming source, **16 of22 new cases failed;6 controls passed**. All22 now pass. Cases cover map-link/details/full-search/nearby completion after unmount, avoiding the retired fallback request, autocomplete abort/session cleanup, and stale autocomplete success/refusal. Current success/error controls stay active. Existing suggestion and desktop/phone form suites passed208 cases before the edit and continue to pass.

- **230 tests pass across six files**, with no failure or pending case. Existing native form tests complement the direct real-hook/adapter proof; no fresh signed-in browser walk or hosted transport proof is claimed.
- Client typecheck with the established8GB heap, committed local `npm run build:web`, all four actual source guards and source-bound artifact positive/negative controls pass. No database fixture.
- Fresh scoped lint: hook9→8 inherited findings, errors0; new test0 findings. The timer's Promise-returning callback warning clears. The other eight rule occurrences and suppression count remain unchanged. No rule, baseline, suppression, ignore or size-limit expansion.
- Final actual installed warning gate after the build with source/declaration inputs hash-fixed: errors0; source3554/3455, tests3047/2881, suppressed84/83 (now/baseline). It still fails inherited over-budget/stale rules. Size retains the exact same32 failure lines. This is not a global G2 pass.

All twelve protected native runtime/layout files retain eleven upstream-byte-exact files plus Q30's one fixed Sidebar type-only derivation. The desktop/phone markup is untouched. Q31/Q32 route cancellation/calendar code, planner history, actor/Trip/source/session boundaries, original operation/payload/retry identity, native single Undo and stored variants remain exact.

## Exact continuation

Q28–Q33, the eleven older warning-delta locations, and these unmount/autocomplete races are closed. Do not replay their provenance or call these tests a new packet. Continue G2 with another bounded group of demonstrated active async/dependency defects using current source hashes.

**Concrete next candidate:** same-opening full-search/nearby/pick ordering. The native desktop input stays enabled and routes Enter through `handleSearchKeyDown` while its search button is busy/disabled. The search methods share an opening epoch, not a per-operation generation. Reproduce an actual overlap through native keyboard/control behavior before deciding on a repair; do not bypass disabled controls or assume the candidate is already proved. Preserve current provider retries, ranked picks, explicit coordinates and manual location entry. No new schema or fixture is required for that client-only investigation. Normal optional Costs/Files failures are already owned; do not invent missing error paths from lint text alone.

Keep the [release prerequisites](core-release-prerequisites.md) and [deferred cleanup checkpoint](pre-production-retained-source-cleanup-packet.md). No automatic size-refactor/deletion queue, dormant ZoomTracker activation, broader native overlays or feature activation.

All370 canonical schema/test sources,151 migrations, C's mixed index,191 prior seals/12412 members,11 auxiliary manifests and three other checkouts remain exact. Hosted compatibility/current protection and independent DB-plus-Storage restoration remain unproved release gates. No hosted SQL/settings/billing, production/preview deployment, main update, remote push, backup/media/ignored ETL or transformation change. The unchanged isolated planner/base-packing profile is used only for the local build; publication is local check-only/unbound.

Private drivers, original source, exact red/green inputs and final diagnostics: `/private/tmp/trek-core-quality-place-search-lifecycle-source-20261116`. Canonical evidence records the final documentation commit and sealed hashes.
