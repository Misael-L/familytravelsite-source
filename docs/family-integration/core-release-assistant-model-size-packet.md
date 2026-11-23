# Q10: bounded non-rendering assistant value-model extraction

**Completed locally15November2026.** [Acceptance](core-quality-assistant-model-handoff.md): original five functions/two constants and remaining58 store statements exact;1713 tests/typecheck/format pass, scoped lint0, size41→40. Fresh16 ordinary local HTTPS reader checks pass; AI disabled. Next [bounded Costs day-grouping extraction](core-release-costs-day-groups-size-packet.md). Do not repeat this completed repair; the requirements below are retained history.

Prerequisites: [Q9 acceptance](core-quality-planner-hook-tests-handoff.md), clean current5.1.4 integration/publication checkouts and preservation baseline. The three oversized-test repairs are complete. Forty-one size findings remain, including30 retained legacy paths that Q7 keeps in place. Work on this one ordinary-build module, without enabling any unsupported feature.

## Target and allowed implementation

`client/src/store/assistantStore.ts` is1,053 wrapped lines with no size allowance and is already outside the format baseline. It is an individually qualified upstream exception, not one of the twelve exact native-presentation pins or backend carryover files. The Q5 inventory and actual ordinary graph establish that it is emitted; emission does not qualify the Family AI feature.

Move **only** these original declarations into new `client/src/store/assistantConversationModel.ts`: `httpStatus`, `sentMentions`, `lastQuestion`, `backToAfter`, `sameFocus`, `MAX_MENTIONS` and `MAX_MENTION_LABEL`. Those seven declarations total65 wrapped lines with their comments. A read-only illustrative extraction with one import measures the store996; this is a planning estimate, not acceptance. Verify actual formatter/wrapped counts; do not compress code if the estimate changes. The new model path does not exist at Q9. Keep functions/arguments/return types/bodies/constants exact apart from necessary exports/imports. Do not create a duplicate implementation of an existing helper.

Permitted runtime files are only assistantStore.ts and the new model. Optional new `assistantConversationModel.test.ts` may cover a meaningful uncovered boundary; do not add tests merely mirroring the extraction. Existing assistant/neighbor tests stay byte-exact. Relevant docs and exact source-qualification rows may change after acceptance. No size/format/ESLint/other baseline or rule change is needed or allowed by this packet: store≤1,000, model≤1,000, optional tests≤2,000, all formatted and no new warning. Expected size41→40, with all other40 failure lines unchanged; format baseline2,134 remains exact.

## Behavior and architecture boundaries

The model performs value calculations only. It must not instantiate a store, client, ownership/session controller, timer, stream, provider or network request. Use type-only imports of existing AssistantMentionItem/AssistantTripChat/AssistantState and shared focus/message contracts when needed, rather than hand-mirroring shapes. Type dependencies may refer to the existing public store types; ensure they erase and create **no runtime import cycle back to the store**. Keep public store exports and every consumer contract intact. The new module's constant initialization must have no new side effects.

Do not move/change errorCodeOf, KNOWN_CODES or error-class handling, frameBatcher/clientContext, runTurn/send/attach/finish, source/actor capture, ownership, holds, abort/retirement, undo, route/map/camera actions, event batching, Zustand creation/reset or policy subscriptions. AI/addon/managed-install admission and default availability remain exact. No native markup/CSS, backend/API, queue, schema, booking, permissions, stored-image variant or transformation change. No live provider/API requests or additional feature/source qualification flag.

Preserve the five function ASTs and two constants exactly; all remaining non-import store statements must match their original typed AST and order. Prove store calls invoke the imported original functions at the same points. For the value contracts: httpStatus keeps its original optional property access; sentMentions filters by literal @label, excludes current focus, retains order, caps10 and truncates labels120; lastQuestion keeps its exact latest-user/first-text/null behavior; backToAfter preserves input immutability and identity sharing for unchanged chats; sameFocus compares exactly the same null/trip/ref/source/sample/distance fields. Do not add normalization, fallback, authorization or copying behavior during extraction. New tests, only if needed, should exercise those domain boundaries rather than duplicate the source algorithm.

## Validation

Capture current source/blob/mode and before-result/typed lint on the affected assistant tests before editing. Reuse the existing finite release/preservation baseline; do not rerun old source merges or recovery migrations. Use Node24.22.2 and installed dependencies. Serialize compatibility rebuild/typecheck, tests and ordinary build: never clean generated shared output while another consumer is running.

From client, run installed targeted Vitest suites with maxWorkers3/JSON output:

```sh
../node_modules/.bin/vitest run src/store/assistantStore.test.ts src/store/assistantStore.cards.test.ts src/store/assistantStore.studio.test.ts src/store/assistantStore.map.test.ts src/store/assistantStore.journey.test.ts src/store/assistantStore.home.test.ts src/store/assistantMessages.test.ts src/store/assistantRouteModel.test.ts --maxWorkers=3 --reporter=json
npm run typecheck
npm run lint:format
npm run lint:size
```

Run typecheck (which rebuilds compatibility output) separately before the final tests; include any justified new model test explicitly. Add the existing actual ownership/retirement/admission consumers selected by resolved imports, preserve the187 hook/126 DayDetail/116 Costs/292 cohort inventories and run only the genuinely affected neighbor scope. Capture before/after typed ESLint per existing rule budget; new model introduces zero warnings, no unsafe cast or suppression. All seven declarations and remaining store ASTs are checked, with the old1,053→new≤1,000 counts and exact other40 size failures. No baseline expansion or source-policy waiver.

Commit tested implementation, then adopt only exact reviewed source rows through the existing separate metadata workflow. Preserve all unrelated qualification rows, native12, full backend inventory, source history and prior seals/canonical355 inputs/144 migrations/mixed index/worktrees/services. Run all four actual source/native/Git/backend guards.

Unlike Q9, this changes runtime source. Build the ordinary source-bound profile with all unsupported qualifications empty and run correct/wrong/missing-source scanners. Compare full runtime hashes to Q9. If every executable file is exact, reuse earlier browser evidence only within that exact scope. If emitted output changes, perform fresh ordinary desktop/phone startup/import and supported reader acceptance through the maintained real local App harness, with image transformations/provider egress blocked and only synthetic local objects. Keep AI disabled; no AI/provider or hosted writer claim. Use a unique owned local fixture target if services are required; never restart/reset/remove protected historical targets and restore only newly owned service roles to stopped state. Record data/source/service preservation at the existing scope. Do not mislabel unit fixtures as live Auth/RLS or synthetic image bytes as independent recovery.

Finish with clean local publication companion, full retained-source check-only archive, sanitized sealed evidence and next bounded source-size packet. Archive stays unbound until actual release acceptance. No production/preview/main/push/hosted SQL/settings/billing/schema/dependencies, media/backups/ignored ETL or transformations. Independent database-plus-files recovery and hosted/engine/protection/original-writer/Worker-binding holds remain separate; heavy backup processes stay in the user's Terminal.
