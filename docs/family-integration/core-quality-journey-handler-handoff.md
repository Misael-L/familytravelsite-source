# Q89 — Complete Journey request-flow decomposition

Completed locally 17 November 2026. Both selected handleJourney complexity/function-length findings are closed; the Journey module is lint-clean. Native UI, backend permissions and feature admission are unchanged.

## Change and measurements

Only client/src/integrations/family/journeyHandler.ts changes at runtime. Original context closures move into createJourneyContext. Lazy immutable route predicates and synchronous field/payload/cursor/share helpers copy existing expressions. Three complete async entry/record/detail groups keep related operations together. No generic dispatcher, eager request, new package/public API, cast or suppression.

- handleJourney complexity116→14, counted length233→54, two parameters.
- Entry group20/63/2, record7/30/2, detail20/60/4 (complexity/lines/parameters).
- Every new callable/constructor satisfies unchanged20/120/5/depth limits. Wrapped source314→450, below1000; formatted/unlisted.
- Scoped ordinary findings2→0, zero errors. No finding moved to a helper; suppressions exact.

journeyView, registry-scoped entryOwners WeakMap, public handleFamilyJourney error wrapper, imports and all other original module statements remain byte-exact. Scoped setup stays before URL admission/NOT_HANDLED, followed by sequential session/views. UUID conversion/error translation, revisions, paired recovery cursors, optional/null/String/Boolean/spread handling, native media/source IDs, owner cache priming/lookups and route precedence remain intact.

The repeated PATCH draft/stats refusal remains a separate check after the original field refusal. Original FormData guards stay at upload call sites, preserving short-circuit order and compiler narrowing. The private compiler caught lost narrowing when those guards were in predicate methods; this was corrected before application. Sequential file loops, owner refusal before upload, File/FormData iteration, rereads/cover selection and previous-entry comparisons are preserved. Whole-Journey deletion and other disabled controls are not newly enabled; existing backend/recovery contracts and Q28–Q88 stay closed.

All34 original await sites remain, without a new await between business operations. Complete async group extraction adds terminal promise adoption. Ten controlled timing profiles preserve business-operation observer ticks; completion is observed0–3 ticks later.360 independent retirement schedules enforce the final request fence in each variant and refuse subsequent operations under a retired owner. Retirement after an already completed fence remains a caller lifecycle responsibility. These fixtures are not universal latency/settlement guarantees.

## Validation and limits

93 unchanged tests in nine suites pass before and after, with identical source bytes/names/assertions/occurrences: journeyRecovery, journeyAggregateRecovery, applicationHandler, applicationHandler.nav, repository, repositoryContext, requestContext, transport and listHandler. These exercise actual native/HTTP/recovery/RPC adapters under mocked SDK boundaries. No product tests/mock contracts added; live suites excluded.

811 complete original/candidate request-sequence comparisons pass:134 scenarios/677 injected failures. Actual identity registry, request/operation scoping, captureContext, Journey view/cache and public error wrapper execute. Backend/recovery/denial/host/media boundaries are controlled. Cases cover primed/unprimed/replaced-registry ownership; root/detail/entry CRUD; recovery/history/revision/restore/version edges; available trips/suggestions/source mappings; metadata/roles/preferences/links/reorders/share/unsupported routes; malformed/numeric IDs; changing getters; sequential synthetic photo uploads/cover selection; backend-code translation, errors and retirement. Scope/receiver/getter/argument/order/results/errors/controlled effects match. Bodies remain unchanged; injected error identity matches; helper-dependent stacks are excluded.

Synthetic Files/FormData are small in-memory fixtures, never sent to Storage. The private proof controls legacy/recovery module boundaries; unchanged regression suites execute those actual adapters against mocks. Neither establishes live DB/RLS/RPC/Storage/queue/browser/hosted authorization.

Clean committed-source fixture-only build, installed compiler, four source guards and bound/wrong/missing-source artifact controls pass with128 fixed post-build declarations. Actual full gate: errors0, source3426/3419, tests2859/2859, suppressed83/83. Complexity220→219 against218 leaves1 excess; length137→136 against130 leaves6 excess. The identical32 size failure lines remain. G2 remains blocked. Observation-only inventory preserves ordinary arguments/results/exit decisions; policies/baselines/allowances/suppressions and old closures remain exact.

Incoming integration/publication 5e6a6c4f5931dc4fc46cd19ed432dab02092ba8c; implementation c6246051745fdaeecfb99670af336fc723ed68a0; clean build 6de1516e033fb986660d63e399edbbf0f560dca6. Scope: exactly five website paths (one runtime adapter, two provenance files, this handoff and release prerequisites). Documentation does not relabel the build. Source archive/publication stay local, check-only/unbound; no push/deployment.

## Exact continuation

Next bounded review: client/src/integrations/family/applicationHandler.ts, the complete private createFamilyApplicationHandler factory and its returned async callback: factory684 counted lines, callback678 lines/complexity217. These form one coordinated boundary. Q28–Q89 accepted scopes stay closed, including the lint-clean Journey module. Existing helpers and public scopedApplicationHandler/export alias are preserved boundaries.

The file is973 wrapped units, unlisted and below1000. Prototype the whole factory/callback decomposition and every helper/module before applying. Focused precisely typed internal modules/ports and complete domain route groups are permitted when necessary for size. Keep unchanged20/120/5/depth/format/file limits and dependency warning groups. No generic dispatcher, mutable global actor, excessive parameter list, new cast, allowance or suppression. If the complete boundary cannot be safely qualified, retain read-only diagnostics and a concrete design handoff; do not apply a partial warning move.

Read the whole factory, public wrapper, actorContext/requestContext/native-source ownership, composed reader/writer/queue admission and actual application/nav/auth/file/provider/core tests. Preserve familyReadHandler(repo) construction, factory defaults/signature and scoped public alias. Public-sharing refusal remains before actor capture or reads. Keep MFA-transition actor capture and auth-scoped versus default request-context selection for operation ports. Scoped-function creation must not start operations eagerly; preserve setup/getter order before pathname/method/body parsing.

Keep auth ownership transitions exact: app-config/releaseVersion optional callback/signal, login/MFA/reset/logout store calls, repo.clear order, profile/avatar operations and source/actor retirement. Preserve private-file observation, fetch/AbortSignal/Blob/Response and observation.perform byte fencing. Use synthetic bytes and controlled fetch only; no actual Storage.

Preserve route precedence, payload/default conversions, native UUID/view identities, operation IDs/revisions/idempotency envelopes, statuses/errors and unavailable/no-op responses. Keep /addons global-navigation metadata and Family permissions; do not enable Tours, Collab or other disabled features. Global Journey/Collections/Vacay/Atlas/notifications/catalog delegates and NOT_HANDLED checks retain order/ownership. Trip selectors/header/legacy aggregate refusals, supported observed/typed reader-writer profiles and modern task/packing/stay command/recovery/queue gates remain authoritative. No legacy alternative writes.

Preserve Trip special-case ordering, observed booking import, budget/file/list/plan/resource delegates, direct/propose/deny outcomes, staging messages, row order, callbacks, final rereads and follow-up writes. Do not remove apparent redundancy as cleanup. Necessary complete async group extraction must retain business-operation ordering and separately qualify completion/error/retirement/cancellation. Q88/Q89 timing receipts are patterns, not evidence for this larger boundary.

Select unchanged mocked before/after suites by actual coverage. Exclude live suites; trap real SDK/RPC/fetch/Storage/provider/browser dispatch. Use actual scoping/actor/native-owner/identity logic where practical with controlled stores and ports. Cover every moved branch: public/unsupported routes, auth transitions, global metadata, file bytes/refusals, valid/invalid Trip selectors and supported-core delegates. Compare exact receiver/argument/getter/permission/order/result/error/effect traces, inject failures, and retire/abort/hide context around each new async boundary. Add product tests only for a demonstrated gap. No mock qualifies live authorization, TLS or hosted behavior.

Run committed-source fixture-only build, installed compiler, four source guards/artifact controls and one ordinary full warning/size gate after fixed post-build declarations. Preserve all policies/baselines/suppressions/prior closures, native layouts, canonical schema/index/seals, publication ancestry and other checkouts. Local source/publication/provenance/handoff work only. No schema/settings/billing/push/deploy/actual DB/RPC/queue/Storage/browser/provider/backup/media/ignored ETL/transformation/deferred cleanup. Independent recovery, incremental protection, current hosted facts and real preview/source binding remain separate gates.


Retain [release prerequisites](core-release-prerequisites.md) and [deferred cleanup](pre-production-retained-source-cleanup-packet.md). Incremental protection, independent matched database/files recovery, current hosted contracts/engine facts and actual preview/source binding remain separate unproved gates.

All370 canonical schema/test sources,151 migrations, mixed canonical index,247 prior seals/15,535 members,11 auxiliary manifests, three other checkouts and12 protected native files remain exact (11 upstream-byte-exact plus fixed Sidebar return-type derivation). Production/preview/settings/billing/backups/media/ignored ETL/transformations unchanged.

Private reproduction receipts: /private/tmp/trek-core-quality-journey-handler-source-20261117. Canonical evidence records final documentation commit and hashes.
