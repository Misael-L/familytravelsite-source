# Q81 — Packing-save field extraction

Completed locally 17 November 2026. The selected packing-save callback meets its existing complexity limit. This packet preserves the legacy field mapping and authorized write boundary; it enables no additional writer or hosted feature.

## Change and measurements

Only `client/src/integrations/family/listHandler.ts` changes at runtime. Two private synchronous helpers contain the original weightGrams and bagId expressions in the POST/PUT packing upsert object. Their calls stay at the same field positions inside the existing repo.write callback.

- Packing-save callback: complexity **24 → 18**, length17→16, zero parameters.
- `packingDraftWeightGrams`: complexity4, length3, two parameters.
- `packingDraftBagId`: complexity4, length7, three parameters.

Every selected function meets unchanged20/120/5 limits. The surrounding handleFamilyList retains complexity67; its length drops **247 → 246** from formatting the shorter field expression, so its two separate findings remain open. Scoped lint is **10 → 9 warnings**,0 errors: the selected arrow warning closes; other warning counts remain unchanged, with only that related length message changing by one line. The file stays formatted/unlisted, with wrapped size **310 → 321**, below1000. No policy, baseline, allowance or suppression changed.

The parent is token-exact outside the two field-expression calls. Each helper returns the original expression tokens, including repeated property reads and undefined/null tests. Selected body and old-row fields are not eagerly read before write authorization. Original name/category/checked/quantity/weight/bag/privacy/owner/order evaluation stays intact. num defaults, old-value fallback, UUID translation and its refusal/receiver behavior remain unchanged; the helper's UUID parameter needs only the existing packingBag kind.

All other module statements, imports, exports, JSDoc, request/method/path dispatch, NOT_HANDLED marker, partial-count refusal, session/views/roster load, scopeFamilyOperations, write fencing, privacy/sharing/contributors, readback and awaits remain exact. Repository, errors, identity, request context and backend operation-context source bytes are unchanged. No new cast/default/import/export/API/dependency/async wrapper, mapping correction, queue path, permission outcome or feature admission. Q28–Q80 and native UI remain exact.

## Validation and limits

**116 unchanged tests in six suites pass before and after**, with identical bytes, names, assertions and occurrences: listHandler, applicationHandler, transport, serviceCompatibility, packingBridgeContract and plannerViews. They cover the actual repository's privacy/permission handling, copied-list behavior and qualified bridge contracts. No product tests or mock contracts added; no live suites run.

**362 exact original/candidate full-handler comparisons pass:**230 scenarios and132 injected failures. The actual full handler, error/identity/request-scope/backend operation-scope modules and the exact extracted repository.write method run with controlled repo views/session/tripContext/mode/readers/owner fixtures. This is not a new database, hosted permission or writer qualification.

Comparisons cover complete drafts/results/errors, identity bindings, call receivers and property/getter/context/authorization/UUID/upsert/readback order. Cases include POST/PUT, create/update, weight and bag fields absent/null/zero/negative/nonfinite/wrongly typed, native/string/canonical/invalid identity values, repeated-read getter sequences, old-row getters/defaults, private/personal/shared rows, sharing readback, stale/missing/cross-kind identity, partial-count refusal and read/session/write failures. Input descriptors remain unchanged. Denied/nudge/draft/session-refused/retired-before-write paths never evaluate weight or bag fields. Retirement during persistence keeps the original post-operation refusal behavior.

The scope proxy and write method preserve their actual await/assert/receiver logic. Their fixture dependencies do not prove full repository policy loading or real Supabase RLS. Existing real-repository mocked tests provide the applicable additional contract coverage. Stack frames change after helper extraction and are not compared; names/messages/status/codes and injected exception identity are compared. The actual Supabase integration guidance was checked; no CLI, dependency, API, schema, grant, Auth or RLS configuration change was needed or performed.

The clean committed fixture-only build, installed compiler, four source guards and bound/wrong/missing-source artifact controls pass with128 fixed post-build declaration inputs. Actual full gate: **0 errors**, source **3436/3419**, tests **2859/2859**, suppressed **83/83**. Complexity **226 → 225 against218**, leaving7 excess; length **140/130**, leaving10 excess. The same32 size failure lines remain. Policies and prior closures stay exact. **G2 remains blocked.** Observation-only inventory preserves ordinary lint rules, arguments, results and exit decisions.

Incoming integration/publication `34ec573ca0713193dd1baef01277b7189cf0fda0`; implementation `9c429d04077914956efec73269969d091f85f70d`; clean qualified build `1835b9ae87ae68cc33934a01f8e0d9d62cd6e70a`. Website scope is exactly five paths: one runtime file, two provenance files and two documents. Later documentation does not relabel the build. Corresponding-source archive/publication remain local and check-only/unbound; no push/deployment.

## Exact continuation

Next bounded review: `client/src/integrations/family/plannerPackingRecovery.ts`, the async object method `inspect` returned by createPlannerPackingRecovery (ordinary complexity28 against20). The outer factory length161 finding is separate. Q28–Q81 accepted scopes are closed, including all weather, Packing Trash UI/restore and packing-save field work. Do not reopen qualified writer/queue/terminal/recovery behavior or earlier bug repairs.

First investigate a private synchronous helper for the original retained-row validation prefix: parse success, schema version, retention policy, method, native trip, operation ID, intent URL, status and allowed row keys. Leave the original belongsToSession check after that prefix at its existing short-circuit position. Preserve every comparison/read order and malformed-result refusal. Retain correct safeParse result narrowing using existing types or a precise type predicate, without a new cast, coercion/default, reordered validation, permissive parser or broad context bag. Pass only the existing row, parse result and native trip identity if sufficient. Measure a complete candidate before applying: selected method/all helpers must meet unchanged20/120/5/depth/format/file limits. The unchanged outer factory may become shorter but is not automatically accepted/closed.

Keep settlement creation/pending, terminal-first return, dependency-pair path, rows filtering/cardinality, owner fence/check/visible admission and all async awaits unchanged. Keep original structuredClone boundaries, exact packet/saved row references, name/action projections, terminal/parent feature conditions including existing loopback qualifier, controls/candidate/prepare callbacks, check/retry calls and argument order, export, original envelope/source/session/domain checks and every capture/write/queue/RPC/ack/retention boundary exact. Do not add another async wrapper or turn recovery discovery into a write. No live feature admission, DB/schema/API/RPC/queue/browser qualification, or cleanup of apparently redundant checks.

Inspect existing plannerPackingRecovery.test.tsx, relevant group/category/category-v2/category-aggregate/bag session and dependency/terminal tests; select appropriate mocked suites, excluding live suites. Run unchanged before/after and inspect actual coverage. Full original/candidate inspect comparisons should exercise terminal/dependency precedence, zero/one/two/extra retained rows, safeParse failures, schema/method/retention/id/trip/url/status/key mismatch, source/layer/user/person/family mismatch, getter/fault order, visibility/owner retirement around awaits and exact returned cloned observations/callback payloads. Use actual parsers and controlled owner/storage/transport boundaries where possible. Do not claim hosted permissions or submit/check/retry operations against a real queue or database. Preserve existing test bytes/assertions; add product tests only for a demonstrated meaningful uncovered contract.

Keep all source policies/baselines/suppressions, native layouts, canonical schema/index/seals and other checkouts. No push/deploy/settings/billing/backup/media/ignored ETL/transformation or deferred cleanup. If synchronous extraction cannot meet the complete selected boundary without observable changes, document the demonstrated limit and select another bounded target rather than weakening protection.


Retain [release prerequisites](core-release-prerequisites.md) and [deferred cleanup](pre-production-retained-source-cleanup-packet.md). Incremental protection, independent matched database-plus-files recovery, current hosted contracts/engine facts and actual preview/source binding remain separate unproved release gates.

All370 canonical schema/test sources,151 migrations, mixed canonical index,239 prior seals/15,033 members,11 auxiliary manifests, three other checkouts and12 native files remain exact (11 upstream-byte-exact plus the fixed Sidebar return-type derivation). Production/preview, hosted settings/billing, backup/media/ignored ETL and transformations unchanged.

Private reproduction receipts: `/private/tmp/trek-core-quality-packing-save-source-20261117`. Canonical evidence records final documentation commit and hashes.
