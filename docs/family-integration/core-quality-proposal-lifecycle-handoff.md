# Q43 — proposal opening read lifecycle

Completed locally 17 November 2026. The active Family proposal dialog now uses the latest committed UI completion callbacks and stops a retired opening before it dispatches its next query. Original query identity, typed edits, child markup, submit events and backend writers remain intact.

## Demonstrated failures and repair

Fresh discovery found source dependency warnings 116/114 and suppressed dependency warnings 46/45. This discovery used only the installed dependency rule without typed services; it was not release acceptance. Full typed lint then verified the selected component and new test. `TripFormModal` calls `FamilyProposalDialog` on the Family path; this is an active consumer.

The same final 17 new cases reproduce nine failures on the frozen incoming runtime: two stale close-callback completions, two stale translations, and five follow-on queries dispatched after close, unmount, Trip, Family or person retirement. The four related existing suites pass on the incoming component. With the repair all **181 cases pass**, including 164 existing cases and the 17 new ones. Original/fixed runs use identical final tests; fixed source is restored in a finally block during the incoming-source proof.

React Effect Events separate two completion notifications from the reactive read identity. They read the latest committed `onClose`, translation and toast without resubscribing to the read or rebasing typed edits. The primary dependencies remain open, scalar Trip ID, Family ID and person ID. An alive check before `listOpenTripProposals` prevents a retired UUID lookup from launching another query. The existing post-result and error guards remain. An already-running query is not aborted by this patch; its retired completion is ignored.

The dialog's original child JSX and complete submission-event body are byte-exact. The provider wrapper, non-React import order, proposal selector, backend query arguments and persistence calls remain unchanged. Tests retain local edit-field state across callback/language updates, keep proposal/Trip identity, verify create and vote modes, and ignore retired results. These are component lifecycle tests with mocked read boundaries, not hosted Auth/RLS or production acceptance.

Installed React is 19.3.1 and the same Effect Event API is already used in qualified Family components. [React's Effect Event reference](https://react.dev/reference/react/useEffectEvent) was checked; primary reactive data stays in the effect dependencies. Supabase skill/security guidance and changelog were checked for this adapter-only scope. No SDK, CLI, dependency, schema, query shape, grant, RLS, authentication or writer change.

## Validation and release limits

- All 181 selected cases pass after the fix; the same tests demonstrate exactly nine incoming failures and eight already-passing new controls. No existing test is weakened. An initial result-reader mismatch with the installed Vitest report format was corrected, initial reports retained, and the exact suites rerun with valid receipt checks.
- Full typed scoped runtime warnings fall 4→3; only the dependency finding disappears. The new test has zero warnings/errors. Existing synchronous state-reset, window-event-bus and non-null findings remain unchanged. Both source files pass the unchanged project formatter.
- Clean committed local web build, direct installed client compiler, all four source guards and correct/wrong/missing-source artifact controls pass. Tests/scoped lint complete before building; compiler runs afterward without npm's rebuilding precheck. Compiler and final actual installed warning gate share 128 fixed declaration inputs; no cross-build declaration identity is presumed.
- Actual global source warnings fall 3550→3549 against unchanged 3424. Source dependency warnings are now **115/114**; suppressed dependencies stay **46/45**. Tests remain 2859/2859, suppressed totals 84/83, zero errors and no stale allowances. Every other over-budget rule metric stays exact. **G2 remains blocked.**
- All warning/size/format budgets, configurations, rules, ignores and suppressions remain byte-exact. The same 32 size failure lines remain; no line packing, policy expansion or native overlay change.

Incoming clean integration/publication HEAD: `2db971c8bfff2af364502b225a26063fd39fa62f`. Runtime/test implementation: `5d5dcbb40ac5bd5860922fa6eca6dcf242fb5edd`. Qualified clean local build source: `df907dfe700f40e61138839bb3a917f29942daba`. Six reviewed website paths: one runtime component, one new regression file, two provenance files and two documents. The later documentation commit does not relabel the build. Publication remains local check-only/unbound, with no remote push or Worker deployment.

## Exact next packet

Q28–Q43 and this proposal lifecycle group are closed at their accepted scope. Preserve the complete test-warning, unused-assignment and unused-variable gate closures. Do not repeat the finished routing/search cases or automatically clean compliant warnings.

Next bounded candidate: inspect `LocationSelect`'s remaining location-bias dependency warning. First verify a current supported Family consumer and inspect the Q34 search-ordering cases. A location-bias-only change with unchanged query is a distinct potential input transition, not a reason to repeat or undo the closed text/order repair. Prove whether the old request remains authoritative or current results are missed before changing behavior. Preserve query/language/pick ordering, current owner, cancellation and honest provider availability; use stable semantic bias inputs rather than a newly allocated object dependency. If the consumer is unavailable or no distinct defect is demonstrated, leave it and select another actual G2 concern. Source dependency overage remains one; suppressed dependency overage remains one.

The generic Family map bridge and tab helper have no current static native caller in this audit; keep them for the existing deferred-cleanup review, without activation or deletion. `usePlannerBookingForm` deliberately snapshots opening-time options to preserve original commands and typed edits; no defect was demonstrated there and its suppression is not removed just to reach a count. Family `useCanDo` reads the live controller, so no Family authority bypass is claimed from its callers' omitted checker dependency.

Keep the [release prerequisites](core-release-prerequisites.md) and [deferred pre-production cleanup](pre-production-retained-source-cleanup-packet.md). All 12 protected native runtime/layout files retain 11 upstream-byte-exact files plus the fixed Sidebar type-only identity. No ZoomTracker activation/deletion, native layout expansion or unsupported feature activation.

All 370 canonical schema/test sources, 151 migrations, the mixed canonical index, 201 prior seals/12858 members, 11 auxiliary manifests and three other checkouts remain exact. No database/browser fixture, hosted SQL/settings/billing, production/preview/main/push, backup/media/ignored ETL or image-transformation change. Stored variants and all existing original-command/retry/Undo contracts stay intact. Incremental protection, independent matched DB-plus-files restoration, current hosted compatibility/engine facts and real preview/source binding remain open gates.

Private originals, candidate exclusions, exact final-test incoming/fixed proof, typed diagnostics and fixed-input receipts: `/private/tmp/trek-core-quality-active-dependencies-source-20261117`. Canonical sealed evidence records the final local documentation commit.
