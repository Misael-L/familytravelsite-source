# Q32 — native route calendar dependency

Completed locally 16 November 2026. This repairs a demonstrated active calendar-dependency defect from G2. Repository-wide quality and release acceptance remain blocked.

## Reproduction and repair

The native route builder already reads the full current calendar to resolve hotel ranges, transport spans and selected-day routing defaults. The hook, however, subscribed only to the selected day's default transport mode. A calendar-only reorder could therefore leave hotel legs on the map after the selected day left that stay, or omit hotel legs when it moved into the stay. A parent render alone did not fix the missing effect dependency. A pending route also remained owned by the old calendar.

The hook now subscribes to the calendar array and uses it as an effect dependency. It removes the artificial callback dependency on the selected default-mode value. Explicit route commands still read current days directly from the store, so a command captured before an edit uses the latest calendar even before React's next effect. Q31's abort cleanup and late-settlement guards are unchanged.

This deliberately observes calendar replacements, including metadata edits; it does not add a second hand-maintained fingerprint of the fields the native builder reads. An unchanged calendar/input set does not cause another request merely because the parent renders. Existing hotel/walking line splitting, day-order rules, geometry, retries, failure fallback, permissions and native layout are preserved.

## Exact before/after proof

Eleven new cases run the real native route hook, shared/native topology and retry adapter, with only the external routing transport mocked. The **final exact test bytes** were run against the frozen incoming hook: seven failed and four passed. All eleven pass after the repair. The failures cover numbered and positional calendars moving the selected day into/out of a stay, pending success/refusal retirement, and current-provider-failure fallback after a calendar edit. Controls retain selected-day mode updates, unchanged-input parent renders, disabled routing and captured imperative commands.

The first exploratory test version incorrectly assumed hotel approaches always form one polyline. Native TREK may split walking approaches into separate lines. Those assertions were corrected to check hotel endpoints/stops while retaining native line topology, and the entire before/after proof was repeated with identical final test bytes. The exploratory logs remain private; they are not accepted as defect evidence.

## Source and verification

Incoming clean integration/publication HEAD: `b1480d80a66ca7c538eebadb32bf41c33c35834e`. Local implementation: `6992a150cf4819818dcddbf4653648fefa0ef110`. Committed build/qualification source: `55b6f1ac3196c2bb03227812cc478fe973f01898`. Six frozen website paths: one route hook, one regression test, two qualification files and two handoff/checklist documents.

- **287 tests pass across eight files**, including the eleven calendar cases, the prior eight cancellation cases, existing integration routing, Tour topology, via, retry and native planner/controller cases. No failure or pending case. Native controller tests use their existing routing mock; they complement rather than replace the real-hook proof.
- Client typecheck with the established8GB heap, committed local `npm run build:web`, all four actual source guards and source-bound artifact positive/negative controls pass. No new live browser acceptance or database fixture.
- Fresh scoped lint: hook5→4 inherited findings, errors0; new test0 findings. The unnecessary selected-default-mode callback dependency clears. The other four rule occurrences and the existing suppression count remain unchanged. No rule, baseline, suppression, ignore or size-limit expansion.
- Final actual installed warning gate after the build, with source/declaration inputs hash-fixed: errors0; source3555/3455, tests3047/2881, suppressed84/83 (now/baseline). It still fails inherited over-budget/stale rules. The size gate retains the exact same32 failure lines. No overall G2 pass is claimed.

All twelve protected native runtime/layout files retain eleven upstream-byte-exact files plus Q30's one fixed Sidebar type-only derivation. No layout file or planner history edit. Original operations, payload/retry identity, single native Undo, actor/Trip/source/session protections and stored variants remain intact.

## Exact continuation

Q28–Q32 and the eleven older warning-delta locations are closed. Do not repeat their provenance work or re-present these calendar/cancellation tests as another packet. Continue G2 with another bounded group of demonstrated active async/dependency defects from current diagnostics, refreshing scoped lint for modified files. Optional planner loads remain candidates only: normal Costs/Files failures already belong to their slices/cohort. Do not infer an active defect merely from a lint warning.

Keep the [release prerequisites](core-release-prerequisites.md) and [deferred cleanup checkpoint](pre-production-retained-source-cleanup-packet.md). No automatic deletion/refactor queue for retained size findings, dormant ZoomTracker activation, broader type-only overlays, feature activation or new database fixture for client-only warning review.

All370 canonical schema/test sources,151 migrations, C's mixed index,190 prior seals/12379 members,11 auxiliary manifests and three other checkouts remain exact. Hosted compatibility/current protection and independent DB-plus-Storage restoration remain unproved release gates. No hosted SQL/settings/billing, production/preview deployment, main update, remote push, backup/media/ignored ETL or transformation change. The unchanged isolated planner/base-packing profile is used only for the local build; publication is local check-only/unbound.

Private drivers, original source, exact red/green proof and final gate diagnostics: `/private/tmp/trek-core-quality-route-calendar-source-20261116`. Canonical evidence records the final documentation commit and sealed hashes.
