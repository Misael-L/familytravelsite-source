# Q34 — native same-opening search ownership

Completed locally 16 November 2026. Q33's overlap candidate is now reproduced and repaired. This is a functional async-ordering repair, not a claim that inherited G2 warning debt has decreased or release acceptance has passed.

## Proof through actual controls

Three new tests mount the **unmodified native desktop PlaceFormModal**, use the real maps API wrapper with delayed MSW HTTP responses, and interact through its real input/result-row handlers. They assert that the Search button is disabled while its input remains enabled, then press Enter for the next lookup. No disabled control is forced. The cases prove that a late old reply could replace newer results, an old completion could release a newer lookup's busy state, and an enabled visible result pick could leave the old lookup able to reopen its result list. Enter never submits/saves the place in these cases.

Those three control cases failed on incoming source. The complete final new test file produced **21 failures and5 passing controls out of26** on frozen source; all26 now pass. Desktop/phone hook-boundary cases also cover old success/refusal before and after a newer lookup, stale details/fallback work, nearby-to-full-search ordering, ranked visible picks versus pending map links, phone coordinate choices, empty/no-pin no-ops and in-memory session completion.

## Resulting behavior

The existing in-memory epoch now orders explicit searches/selections as well as close/unmount. A meaningful full/nearby search or suggestion pick starts a new owner; a direct result or phone-coordinate choice retires pending work and finishes its busy state. Old replies, errors and finally blocks cannot replace results, apply a map link/pick, launch a fallback or clear a newer owner's busy state.

Only the current full search finishes its native phone search session; an old completion cannot end a newer session. Desktop full searches retain their original session behavior. Ranked picks keep the query/provider/rank of the displayed list, Google retry keeps the displayed query rather than an edited field, current details fallback and error reports remain live, and empty input/missing pins do not retire a valid lookup. Mere typing/autocomplete is not a new explicit decision. No server-side cancellation is claimed for APIs without AbortSignal.

Q33's unmount cleanup and aborted-autocomplete guards remain in place. No markup, layout, enabled/disabled control policy, provider settings, backend contract, permission or write-operation changes. No new feature activation.

## Source and verification

Incoming clean integration/publication HEAD: `1714f930dd470e3d9dd588cf82579f0fa942c908`. Implementation: `70ce62851c62877452feff1286b7c29a98ec630c`. Committed build/qualification source: `4bdb693b369a2b4a72a4100cd3fb0f68ecf904c4`. Nine reviewed website paths: one search hook, one new test, three prior regression tests admitted for formatter-only repair, two qualification files and two handoff/checklist documents. The explicit format amendment was frozen before touching those three files.

- **275 tests pass across nine files**, including26 new cases, Q33's22 lifecycle cases,19 routing lifecycle/calendar cases and the existing search/desktop/phone form suites. No failed or pending case. Exact final test bytes are bound to the before/after source hashes. The native-control cases use actual API/cache wrappers with mocked HTTP; other hook cases mock provider methods. No live browser/hosted acceptance is claimed.
- Client typecheck with the established8GB heap, committed local `npm run build:web`, four actual source guards and source-bound artifact positive/negative controls pass. No database fixture or TypeScript configuration change.
- Scoped lint remains8 inherited hook findings, errors0; new test0 findings. The same eight rule occurrences and suppression count remain. This packet fixes the demonstrated behavior; it does not claim a warning-count reduction. No baseline, rule, suppression, ignore or size-limit expansion.
- Final actual installed post-build warning gate, with source/declaration inputs hash-fixed: errors0; source3554/3455, tests3047/2881, suppressed84/83 (now/baseline), unchanged from Q33. Size retains the exact same32 failure lines. Global G2 remains blocked.

The project formatter check found four recently introduced out-of-baseline test files unformatted, including this packet's new file and three preceding regression files. They are now formatted with the actual existing project configuration. Normalized non-import ASTs and assertions are exact before/after (expression/type parentheses normalized); affected tests exercise reordered imports. The formatter configuration and baseline hashes are unchanged. This closes four scoped new-file formatting failures; no global formatting pass or debt count is claimed. Runtime routing and native markup were not reformatted.

All twelve protected native runtime/layout files retain eleven upstream-byte-exact files plus Q30's fixed Sidebar type-only derivation. The native modal's exact bytes are included in the control proof. Q31/Q32 routing, history, actor/Trip/source/session boundaries, original operation/payload/retry identity, native single Undo and stored variants remain exact.

## Exact continuation

Q28–Q34 and all previously identified warning-delta, lifecycle and search-overlap groups are closed. Do not repeat their diagnosis or re-present these tests as another packet.

**Next bounded candidate: active test callback/Promise contracts.** Start with `client/src/hooks/useElementRect.test.ts`: its native window-resize dispatch callback currently returns the synchronous boolean from `dispatchEvent` to React `act`. Refresh scoped lint/current hashes and confirm the actual return contract before changing it; batch comparable active test cases rather than starting a fixture or changing runtime layout logic. Preserve genuine awaited Promises—do not use `void` or casts to hide async work. This is a test-contract lead, not a claim that the live observer is broken. Leave inactive Roadtrip/Tours behavior gated. If this lead is already resolved, use current structured diagnostics to select another finite active G2 group.

Before qualifying any further client source/test edit, use the actual `client/.prettierrc` with its installed plugins and check the explicit changed paths through the project formatter. Run formatting from the client directory; temporary-file formatter defaults are not equivalent. Keep rules/baselines unchanged and avoid reformatting unrelated legacy runtime files.

Normal optional Costs/Files failures are already owned. Keep the [release prerequisites](core-release-prerequisites.md) and [deferred cleanup checkpoint](pre-production-retained-source-cleanup-packet.md); no automatic size-refactor/deletion queue, dormant ZoomTracker activation, broader native overlays or feature activation.

All370 canonical schema/test sources,151 migrations, C's mixed index,192 prior seals/12445 members,11 auxiliary manifests and three other checkouts remain exact. Hosted compatibility/current protection and independent DB-plus-Storage restoration remain unproved release gates. No hosted SQL/settings/billing, production/preview deployment, main update, remote push, backup/media/ignored ETL or transformation change. The unchanged isolated planner/base-packing profile is used only for the local build; publication is local check-only/unbound.

Private drivers, original source, exact red/green and native-control proofs and final diagnostics: `/private/tmp/trek-core-quality-place-search-ordering-source-20261116`. Canonical evidence records the final documentation commit and sealed hashes.
