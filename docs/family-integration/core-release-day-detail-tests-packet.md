# Q8 / T2: bounded DayDetailPanel test decomposition

**Completed locally15November2026.** [Acceptance](core-quality-day-detail-tests-handoff.md): all126 original cases retained;743 selected tests/typecheck pass, size43→42 and exact stale allowance removals. Next [planner-hook test split](core-release-planner-hook-tests-packet.md); do not repeat this completed packet.

Prerequisites: [Q7 retention decision](core-legacy-entry-review.md) and [handoff](core-quality-legacy-entry-handoff.md); clean active5.1.4 integration/publication checkouts, current source/preservation baseline. Keep all completed Family packets and the126-case DayDetail inventory from Q6. Retained legacy separation remains unapproved and outside this packet.

## Target and allowlist

`client/src/components/Planner/DayDetailPanel.test.tsx`:2,339 wrapped lines, current allowance2,333, default test limit2,000. Fresh Q6 execution126 passed/zero failed or pending; its bytes and tested dependencies are unchanged in Q7. Capture current blob/mode and full expanded-case inventory before editing; reuse the sealed Q6 run at this exact scope.

Permitted implementation paths:

- Existing `client/src/components/Planner/DayDetailPanel.test.tsx`, keeping its original main describe block.
- New `client/src/components/Planner/DayDetailPanel.bookings.test.tsx`, for the remaining branch/time/booking/privacy/accommodation/weather groups. The eight whole describe blocks currently format to1,770 lines for the main block and311/211/54/94/111/91/131 for the seven others, before common setup/imports. This supports two suites under2,000 without splitting a describe. Check final wrapped counts with the actual gate.
- New typed fixtures under `client/tests/helpers/dayDetailPanel/`, using `fixtures.ts` unless JSX actually requires `.tsx`. No file past1,000 wrapped lines. Neither planned new path/folder exists at Q7; refuse a collision rather than overwrite it.
- Only this original suite's2,333 entry removed from `client/scripts/size-baseline.json` after it meets2,000; only its listed entry removed from `client/scripts/format-baseline.json` after actual formatting. Expected format2,136→2,135. All other entries/rules remain exact; no bulk update/expansion.
- Exact reviewed changed/new source qualification rows and qualification commit after acceptance, plus bounded continuation/handoff/evidence Markdown. No unrelated source row, native pin, backend inventory or source-admission policy change.

Do not edit DayDetailPanel.tsx, useDayDetail, stores/repositories/queues/backend/shared contracts or existing neighboring tests, native JSX/CSS, permissions, source gates, schema or dependencies. Do not fix an unrelated stale test by weakening its assertion or adding runtime capability. Document a demonstrated new problem separately if one appears.

## Implementation and semantic proof

Move whole describe blocks, retaining all126 full names, parameterized rows, original assertions/awaits, HTTP fixtures, plugin/member/booking data, native writer refusals, true-midnight/date behavior and nested setup/cleanup. Keep the main describe's original name and all seven secondary describe names; no duplicated case, skip/todo, weaker matcher, coverage or timeout change.

The original reset hook order is: invalidateTripReads, invalidateOfflineSession, await resetOfflineTestDatabase, resetAllStores, vi.clearAllMocks, install weather-error/accommodations-empty handlers, seed admin, seed trip1, then seed24h/celsius/blur-false settings. Preserve this exact sequence for both suites. `day=buildDay(...)` and defaultProps (including its vi.fn callbacks) are eager initialized fixtures; preserve factory arguments, mock identity/lifetime/reset and original module evaluation order. Do not hoist them ahead of imported module effects or accidentally share mutable fixture instances across worker sandboxes. Preserve the pickStayCategory helper exactly. Nested hooks and reservation/accommodation fixtures remain under their original describe scope.

Use installed filepath-aware Prettier; the existing import-order preservation directives are available if plugins would otherwise change module evaluation. Do not add ESLint suppressions or new unsafe casts. Existing test-only any/non-null/window references may move only with identical semantic occurrences and no increase in the actual tests/rule warning budget; Q6 demonstrated that this installed budget is per category/rule, not filename. Preserve the entire ESLint baseline. Compare normalized typed ASTs for all original describe/fixture/reset statements and import order, in addition to executed-case multiplicities. Formatting-only parentheses/exports/relocated module paths must be explicitly normalized, not arbitrary changed test bodies.

## Commands and completion

Use the pinned Node24.22.2 first on PATH and installed dependencies. From `client/`:

```sh
../node_modules/.bin/vitest run src/components/Planner/DayDetailPanel.test.tsx src/components/Planner/DayDetailPanel.bookings.test.tsx src/components/Planner/DayDetailPanel.dateFirst.test.tsx src/components/Planner/useDayDetail.test.ts src/components/Planner/dayDetailModel.test.ts --maxWorkers=3 --reporter=json
../node_modules/.bin/vitest run src/components/Budget/CostsPanel.test.tsx src/components/Budget/CostsPanel.ledger.test.tsx src/components/Budget/CostsPanel.overview.test.tsx src/pages/tripPlanner/useTripPlanner.test.tsx src/integrations/family/plannerCohort.test.tsx src/integrations/family/plannerCohort.creation.test.tsx src/integrations/family/plannerCohort.arrangement.test.tsx src/integrations/family/plannerCohort.calendarRecovery.test.tsx src/integrations/family/plannerCohort.contentRecovery.test.tsx --maxWorkers=3
npm run typecheck
npm run lint:format
npm run lint:size
```

All126 DayDetail cases execute once and pass; all116 Costs and292 planner-cohort cases stay preserved. Neighbor suites must pass without edits. Scoped ESLint errors0/no warning growth or suppression; exact two baseline contractions only. Both suites≤2,000/helper≤1,000. Expected size43→42, with every other failure unchanged; format passes at2,135 entries. Do not claim a globally passing size gate.

Commit the tested implementation, then adopt only its exact source rows and two justified baseline reductions using the existing separate metadata workflow. All four actual source/native/Git/backend guards pass. Build the ordinary source-bound profile with unsupported qualification flags empty and compare complete runtime bytes to Q6; only the public source-binding receipt may differ. Reuse browser/reader evidence only within unchanged runtime scope, without another DB/browser/service run. Finish clean local publication/retained-source check-only archive and sanitized sealed evidence/continuation. Next is the remaining planner-hook test slice or a separately bounded active-source repair, not an automatic source-retirement implementation.

No production/preview/main/push, hosted SQL/settings/billing/schema/dependencies, feature/source-policy change, native layout, media transformations or backup/ETL/media work. Independent restoration and other operational release holds remain separate; heavy backup processes stay in the user's Terminal.
