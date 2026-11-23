# Q80 — Packing Trash expression extraction

Completed locally 17 November 2026. The Packing Trash component meets its existing complexity limit. This packet preserves its UI and restore behavior; it admits no new writer or hosted feature.

## Change and measurements

Only `client/src/integrations/family/FamilyPackingTrash.tsx` changes at runtime. Three private synchronous helpers contain the original owned-bag-page expression, empty-listing condition and opaque last-bag cursor read. They execute at the same original points. No hook or asynchronous callback is extracted or changed.

- `FamilyPackingTrash`: complexity **27 → 20**, length265, zero parameters.
- `ownedBagPages`: complexity4, length3, three parameters.
- `packingTrashIsEmpty`: complexity4, length12, three parameters.
- `packingTrashBagCursor`: complexity2, length3, one parameter.

The inherited handoff quoted a generic120-line function limit. The actual unchanged ESLint configuration gives `.ts` logic120 and `.tsx` functions300 lines. The component meets300; all helpers also meet the stricter120. Complexity20, parameters5, depth, format and file limits are unchanged. No allowance or policy expanded.

The first two-expression candidate remained at complexity21 and was never applied. Including the original cursor expression produces the complete compliant candidate. The component is formatted/unlisted, with wrapped file size **312 → 330**, below1000. Scoped lint is **1 → 0 warnings**,0 errors. No baseline, policy or suppression changed.

The parent is token-exact outside the three helper calls; each helper returns the exact original expression tokens. Ownership comparisons and original bag-page array identity remain intact. Empty-state short-circuit order stays exact, including the category-observation test and item/bag emptiness checks. The cursor remains its original value/reference, with no Boolean conversion, default or early evaluation. All other module statements and the component JSDoc are byte-exact.

All hook calls, their order/dependencies/initialization and every async function body remain byte-exact. Admission, read-only/permission/session/port/trip ownership, generation/flight guards, useEffect/load/run/refresh, pending callbacks, original page/row/index restore observations, category grouping/incomplete hiding, pagination, messages and command boundaries are unchanged. No new cast/default/import/export/API/dependency/async wrapper or behavior correction. Native desktop/phone callers, Modal/Pending/snapshot/port sources and Q28–Q79 work remain exact.

## Validation and limits

**66 unchanged tests in four suites pass before and after**, with identical bytes, names, assertions and occurrences: nativePackingControls, packingAggregateTrash, packingRecoveryActions and packingNativeRecoveryActions. This includes real native Trash item restore and exact second-page restoration, plus the applicable aggregate/recovery contracts. No product tests or mock contracts added; no live suites run.

**25 original/candidate React UI flows match**, using actual React hooks, ReactDOM and jsdom: **93 DOM snapshots per implementation** and ordered port-call transcripts are identical. The actual original/current component bodies run against controlled external store, snapshot, permission, translation, Modal and Pending fixtures. This is component acceptance with mocked boundaries, not a new browser/full-native-host, actual Pending-engine, database/RPC/queue or hosted qualification.

Flows cover absent trip/port/view, denied/read-only admission, empty listings, item/category/bag restoration and original observation identities, item/bag/category pagination, grouped/incomplete-category visibility, committed/unknown/absent reconciliation, errors and retry, pending refresh, closing during a load, permission pause/resume, late original load/restore settlement and trip/port mismatch while the next load is pending. Exact page/row/index identity is asserted at each restore fixture. The stale restore test also checks duplicate clicks and that the retired port is not refreshed afterward. No lifecycle repair is claimed beyond preserving the existing behavior.

Source proof separately verifies the expression tokens, all hook calls and async bodies. The React fixtures are not presented as an adversarial getter test or proof of an external service. Full native host files and all other website bytes are independently preserved.

The clean committed fixture-only build, installed compiler, four source guards and bound/wrong/missing-source artifact controls pass with128 fixed post-build declaration inputs. Actual full gate: **0 errors**, source **3437/3419**, tests **2859/2859**, suppressed **83/83**. Complexity **227 → 226 against218**, leaving8 excess; length **140/130**, leaving10 excess. The same32 size failure lines remain. Policies and prior closures are exact. **G2 remains blocked.** Observation-only inventory preserves ordinary lint rules, arguments, results and exit decisions.

Incoming integration/publication `98149c67028b5d03b43bb0490bf262e12428ebb3`; implementation `92e28a0c71e48af530e9143f026afc368d2f94be`; clean qualified build `851ae2baffdb7ad4bcb4b871ea72fa2458d62c1f`. Website scope is exactly five paths: one runtime file, two provenance files and two documents. Later documentation does not relabel the build. Corresponding-source archive/publication stay local and check-only/unbound; no push/deployment.

## Exact continuation

Next bounded review: `client/src/integrations/family/listHandler.ts`, the `() => p.upsertPackingItem(tripId, {...})` callback in the POST/PUT packing branch (ordinary complexity24, currently line232/column30). This is a legacy/native-list field projection, not permission to enable another writer. The outer handleFamilyList complexity67/length247 findings remain separate. Q28–Q80 accepted scopes are closed, including every weather change and the Packing Trash expressions/UI/async restore paths.

First measure private synchronous helpers for the original weightGrams and bagId field expressions, keeping their calls inside the same original object literal and authorized write closure. Preserve original property order (id/name/category/checked/quantity/weightGrams/bagId/privacy/owner/sort), repeated body/old-row property reads, unset-versus-null semantics, exact num/text defaults and UUID translation/refusal behavior. Passing a pre-read field value can change getter/read order; retain the original body/old-record access sequence. Use existing FamilyPackingItem and body/identity types without extra casts or a broad context bag. Do not eagerly translate an ID, read an old field or evaluate a default before repo.write admits the original callback. Measure a complete candidate so this callback and every helper meet unchanged20/120/5/depth/format/file limits before applying; no partial overbudget extraction.

Keep original callback Promise/result behavior, call receiver, tripId, actual upsert method and awaited write boundary. No new async wrapper, writer/queue/RPC/API/schema/feature admission, changed permission outcome, new export/default/import/dependency/cycle or correction to old data mapping. Leave the outer handler, request parsing, method/path/suffix dispatch, NOT_HANDLED marker, assertPackingFields, repo.views/session/roster load, scopeFamilyOperations and write fencing, identity registry, privacy/owner/sharing/contributor behavior, clone/readback, todo/bag/category handlers, read/write/pagination and error messages otherwise exact. Never route the legacy path around qualified native packing commands.

Inspect and run unchanged listHandler/applicationHandler/transport/serviceCompatibility tests and applicable planner/packing bridge tests, using local mocks only. Inspect which actual operations the suites cover rather than inferring from filenames. Private full-handler original/candidate comparisons should exercise allowed/refused POST/PUT, missing/stale identity, absent/null/zero/negative/nonfinite/wrongly typed weight and bag fields, old-row defaults, UUID failures, getter side effects/faults, privacy/sharing preservation and readback. Record actual authorization/callback/field/UUID/upsert/read/await/error order and exact request/result/reference shapes. Mock actual repo/request/identity boundaries, not a fabricated new API. No real database/RPC/queue/browser/hosted write or permission qualification. Preserve all existing tests/assertions; add product tests only for a demonstrated meaningful uncovered contract.

Preserve all policies/baselines/suppressions, native layout bytes, schema/index/seals and other checkouts. No push/deploy/settings/billing/backup/media/ignored ETL/transformation or deferred cleanup. If pure field extraction cannot meet all limits without an observable change, document that measured limit and choose the next bounded target; do not weaken protection.


Retain [release prerequisites](core-release-prerequisites.md) and [deferred cleanup](pre-production-retained-source-cleanup-packet.md). Incremental protection, independent matched database-plus-files recovery, current hosted contracts/engine facts and actual preview/source binding remain separate unproved release gates.

All370 canonical schema/test sources,151 migrations, mixed canonical index,238 prior seals/14,972 members,11 auxiliary manifests, three other checkouts and12 native files remain exact (11 upstream-byte-exact plus the fixed Sidebar return-type derivation). Production/preview, hosted settings/billing, backup/media/ignored ETL and transformations unchanged.

Private reproduction receipts: `/private/tmp/trek-core-quality-packing-trash-source-20261117`. Canonical evidence records final documentation commit and hashes.
