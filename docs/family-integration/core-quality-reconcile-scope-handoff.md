# Q85 — Retained packing scope predicate extraction

Completed locally 17 November 2026. The selected reconcile method now meets its existing complexity limit. The awaited intent inspection and every recovery boundary retain their original order.

## Change and measurements

Runtime scope is `client/src/integrations/family/plannerCohortPacking.ts` and the new pure internal `packingRetainedScope.ts`. The helper retainedPackingScopeMismatch contains the exact original source/layer/trip/user/person/family inequality prefix. The caller passes the existing parsed p, already-bound scope and capture c references. It neither projects properties eagerly nor re-reads p.command.scope. The original awaited inspectPackingIntent(c.owner,p,c.native) remains last in the caller's OR expression and is skipped after a mismatch.

The new module has only type imports from existing packing contracts/queue types, one internal exported synchronous function and no runtime dependency or state. Its input types describe only the envelope source/layer, original scope and required capture source/layer/packet-scope facts. No cast, coercion/default, async wrapper, permissive parser, public HTTP/RPC/schema API or new package.

- `reconcile`: complexity **22 → 17**, length **114 → 106**, zero parameters.
- `retainedPackingScopeMismatch`: complexity6, length14, three parameters.
- Planner wrapped size **996 → 989**; helper16, both below1000 and formatted/unlisted.

Selected functions meet unchanged20/120/5 limits. Scoped warnings **2 → 1**,0 errors; helper0. The separate refresh22 warning remains exact and open. All other class members and original module statements/imports are byte-exact. Caller is token-exact except the one predicate call and required relative import; helper prefix tokens match the original. No policy, baseline, allowance or suppression changed.

Before applying, preflight measurements used a private TypeScript program with the proposed new module supplied virtually, under the installed rules. This avoids writing an unproved helper into the checkout merely for module resolution. Ordinary post-application lint runs without that program override and confirms the same finding closure. The final full gate uses the ordinary installed command/configuration and fixed post-build declarations.

Original capture, offline refusal, terminal-first result, dependency-pair path, lock and release-finally, row filtering/cardinality, parsing and all fences/checks remain intact. Receipt dispatch, visible/redacted/unknown handling, acknowledgement, aggregate confirmation, refresh and return timing remain intact. All original async/await boundaries and receiver/argument identities remain exact. Q28–Q84 and native layouts preserved. No new writer/queue/permission/RPC/hosted feature admission or cleanup.

## Validation and limits

**442 unchanged tests in nine suites pass before and after**, with identical source bytes, names, assertions and occurrences: plannerCohortPacking, packingCommandSession, packingGroupSession, packingCategorySession, packingCategoryV2Session, packingCategoryAggregateSession, packingBagSession, plannerPackingRecovery and packingRetainedReceipt. They include actual planner reconciliation and the qualified packing protocols under mocked SDK/RPC and fake IndexedDB boundaries. No product tests/mock contracts added; no live suites or real DB/RPC/queue operations.

**1,228 exact original/candidate complete-reconcile comparisons pass:**163 scenarios and1,065 injected failures. Actual retained-envelope Zod parsers, canonical packet/ack fixtures, retained receipt dispatcher, acknowledgement validators and the original changed error method execute. Backend RPC attempts are0; imported RPC boundaries are blocked stubs. Capture/owner/queue/lock/terminal/dependency/readers/ack/refresh are controlled fixtures, not a live RLS, database, RPC or queue qualification.

Cases cover all ten retained packet variants with visible/redacted/unknown receipts, source/layer/trip/user/person/family mismatches, false/throwing intent inspection, malformed protocols, invalid acknowledgements, zero/two/extra/unsupported/colliding/unrelated/changing rows, native mismatch, offline/lock refusal, terminal/dependency precedence, fence/session retirement, repeated source/scope getters, reader/ack/refresh/release errors and every exit's release behavior. Complete reference/getter/short-circuit/terminal/dependency/lock/fence/parse/inspection/receipt/ack/refresh/release/result/error traces match. Earlier scope mismatch never reaches intent inspection. Original input envelopes remain unchanged. Exception names/messages/status/codes and injected exception identity are compared, not helper-dependent stacks.

Clean committed fixture-only build, installed compiler, four source guards and bound/wrong/missing-source artifact controls pass with128 fixed post-build declarations. Actual full gate: **0 errors**, source **3432/3419**, tests **2859/2859**, suppressed **83/83**. Complexity **224 → 223 against218**, leaving5 excess; length **138/130**, leaving8 excess. The identical32 size failure lines remain. **G2 remains blocked.** The location inventory only observes the ordinary lint command; arguments/results/exit decisions, all policy bytes and prior closures remain exact.

Incoming integration/publication `7b30e67713c1d8a5530840fc1be0e560c17a98b0`; implementation `7a14b71cada4a7b498b71fbd7d466ee2ed84eb91`; clean qualified build `34558b5dba8b6c4e9165564ed7c6bacf70c9700c`. Website scope is exactly six paths: two runtime files, two provenance files and two documents. Later documentation does not relabel the build. Source archive/publication remain local, check-only/unbound; no push/deployment.

## Exact continuation

Next bounded review: `client/src/integrations/family/plannerCohortPacking.ts`, the private `refresh` method's **complexity22** finding against20. Reconcile17 and the retainedPackingScopeMismatch helper6 are closed Q85 scopes; do not reopen them. The planner source is989 wrapped units against1000, so measure the complete candidate and every affected file before applying.

First inspect only the original needRoster expression: item owner/recipient/contributor facts, bag membership and category assignees. Investigate a small pure Family-internal predicate receiving the existing packet reference and returning the exact original expression. A separate focused internal module/import is permitted to avoid file overflow; reuse an existing identical helper only if its full semantics and property-read order match. Do not add roster policy to the unrelated retained-scope module just to avoid a file. Use existing PackingList types. Preserve .some/Object.values receivers, repeated reads, array order, short-circuit behavior and the original callback return values. No eager projection, flattening, normalization, Boolean coercion, casts/defaults, new package or public API.

Keep the call at the original needRoster initializer, after the original category/bag/base reads, fence and check. Keep the subsequent needRoster ? await listTripTravelers(packet.scope.trip_id) : [] in the original method, with identical scope argument, skipped-query behavior and await timing. Do not make the helper async or allow it to load data. Keep all category-version/forceCategories/bag feature branches, packing identity equality, lifecycle check, fences, projectPacking people/category inputs, transaction call and callback, pending queue/publication/store identity refusals, synchronous publish/store-set/notify order and final check/return exact.

Measure refresh/helper and all nested functions under unchanged20/120/5/depth/format/file limits. The file must remain below1000 without baseline expansion. If extracting only this genuine predicate does not close the complete selected boundary, record the demonstrated limit and choose another target rather than moving async boundaries or weakening policy.

Inspect existing mocked planner/cohort/packing-bag/category/session suites for actual refresh and roster coverage before selecting unchanged before/after runs. Exclude live suites. Differential comparisons should execute the original complete refresh method and candidate with actual packing projections/category-person helpers where practical and controlled read/session/roster/store/transaction/publication boundaries. Cover absent/present/ineligible references, empty arrays, category labels including special keys, getter/fault order and early .some exits, roster called/skipped, source feature branches, category/bag identity mismatch, lifecycle refusal, owner/visibility/publication/store retirement, pending queue conflicts, transaction errors and exact publish/set/notify order/results. Preserve existing test bytes/assertions; add a product regression only for a meaningful demonstrated missing contract. No live database/RLS/RPC/queue/browser or feature qualification is implied by mocks.

Re-run committed-source build, installed compiler, source guards/artifact controls and one full warning/size scan with fixed post-build declarations. Preserve all policies/baselines/suppressions, Q28–Q85 accepted scopes, native layouts, canonical schema/index/seals and other checkouts. No schema/settings/billing/push/deploy/real DB/RPC/queue/browser/provider/backup/media/ignored ETL/transformation/deferred cleanup. Independent matched recovery, incremental protection, hosted facts and actual preview/source binding remain separate release gates.


Retain [release prerequisites](core-release-prerequisites.md) and [deferred cleanup](pre-production-retained-source-cleanup-packet.md). Incremental protection, independent matched database-plus-files recovery, current hosted contracts/engine facts and actual preview/source binding remain separate unproved release gates.

All370 canonical schema/test sources,151 migrations, mixed canonical index,243 prior seals/15,280 members,11 auxiliary manifests, three other checkouts and12 protected native files remain exact (11 upstream-byte-exact plus the fixed Sidebar return-type derivation). Production/preview, hosted settings/billing, backups/media/ignored ETL and transformations unchanged.

Private reproduction receipts: `/private/tmp/trek-core-quality-reconcile-scope-source-20261117`. Canonical evidence records final documentation commit and hashes.
