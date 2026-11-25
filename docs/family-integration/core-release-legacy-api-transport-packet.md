# Q16: separate the retained active Family API transport before endpoint domains

**Completed locally15November2026.** [Acceptance](core-quality-legacy-api-transport-handoff.md):13 typed/12 emitted statements,46 remaining index statements,51 public signatures and singleton/interceptors exact.41 retained baseline cases/5885 regressions/typecheck/final16 local reader checks pass. Explicit typed lint6→6 using unchanged rules despite legacy exclusion; format2134 exact. Index1510→1279/transport240.35 findings remain, all other34 exact. Next [11 planner endpoint objects](core-release-legacy-planner-api-packet.md). Original requirements below are historical; do not repeat this transport move.

Prerequisites: [Q15 local acceptance](core-quality-phone-packing-row-handoff.md), clean integration/publication checkouts and its new sealed preservation baseline. Keep TREK5.1.4 and the current branch.35 oversized legacy files remain:30 retained entry/test/type files and five emitted legacy modules. Preserve every one. Q15 resolves its formatter-induced function warning through a validated plain JSX render helper, with all scoped rule counts unchanged. The separately measured whole-repository warning gate still has inherited over-budget/stale entries and remains a release hold; do not expand its baseline. Remaining release-quality gates stay open.

## One transport, unchanged public API

Target client/src/integrations/family/legacy/api/client.ts, currently1510 wrapped lines. Introduce only co-located transport.ts and focused transport tests if the current legacy transport contracts are not already exercised. This is the transport prerequisite to later endpoint-domain separation. The first slice alone does not finish the API file-size finding: a read-only rehearsal measured transport240 and the original index without transport1279 before import cleanup/re-exports. Keep the remaining size failure honest; do not compress code or add an allowance. A later domain slice will move coherent endpoint objects below the base limit without a runtime cycle through their public index.

Move only these13 original top-level statements before authApi, in their original relative order and with original types/comments/bodies/values:

1. API_DEV.
2. parseInDev.
3. checkInDev.
4. RATE_LIMIT_MESSAGES.
5. translateRateLimit.
6. apiClient and its one axios.create initializer.
7. MUTATING_METHODS.
8. apiClient.interceptors.request.use registration.
9. isAuthPublicPath.
10. unregisterSWAndReload.
11. apiClient.interceptors.response.use registration.
12. UploadOptions.
13. postMultipart.

Export only the existing public bindings plus checkInDev needed internally by the index. Re-export the same original public bindings/types from client.ts; keep its default apiClient identical to the named instance. No wrappers, replacement functions, second Axios instance or copied singleton. checkInDev need not become an additional public index export. Every auth/oauth/trip/planner/packing/task/booking/admin/plugin/map/Journey/notification endpoint object and method stays in client.ts, with its typed API, body, URL, parameters, return and evaluation order unchanged. Do not implement endpoint-domain extraction in this packet.

Move only necessary original dependencies: existing Axios/type imports, type-only z, existing probeNow and getSocketId. Preserve each remaining index binding and dependency order. The new transport must not import its index at runtime. Verify the actual connectivity/auth/env/socket dependency closure before assuming the move is acyclic. Do not copy any alternate current-native client behavior into this distinct retained Family client.

## Immutable request/session behavior

Keep one request and one response interceptor, registered once and in original order. Preserve socket IDs, caller-supplied idempotency keys, exact mutating-method recognition, original random-key fallback, timeout8000/credentials/baseURL/headers and the original multipart timeout0/progress/abort/idempotency behavior. Preserve 401 JSON versus HTML/proxy-wall treatment, offline/probe outcomes, service-worker unregister/reload timing and guard, redirect URL encoding/search/hash, public auth routes/prefixes, MFA redirect, original429 localization and all dev-only parse passthrough semantics. Do not harden, normalize or change these policies during extraction.

Existing Family adapters must continue installing against this exact same instance. Do not create new Auth sessions, providers, billing/service settings, transformations or feature qualifications. Preserve original actor/source retirement, queue and original-operation semantics. No requests to hosted services during tests.

## Prove before changing and finish

Freeze the original source and imports. Trace actual consumers of this legacy module; current-native client tests alone do not prove the retained Family transport. Inspect client/tests/integration/api/client.test.ts, client/tests/unit/api/client.interceptor.test.ts, client/tests/unit/api/authUrl.test.ts and Family adapter tests for their real import targets before selecting the baseline. Run applicable cases before editing; reproduce any failure separately. New tests should exercise the actual legacy module and instance/interceptors using controlled adapters/MSW, not duplicate implementation or assert fabricated endpoint success. Cover named/default singleton identity, no duplicate interceptor registration, caller key retention, JSON/HTML/proxy/offline/MFA paths,429 language/fallback and multipart progress/signal/timeout. Existing cases stay byte-exact; preserve all5689 Q15 cases with original occurrence/order.334 opt-in/live cases remain explicitly unrun unless separately qualified.

Prove all13 typed statement ASTs and every remaining endpoint/public surface exact apart from necessary import/export syntax. Compare actual module resolution and emitted initialization/registration order; type-only imports must erase and no runtime cycle/new authority may appear. Serialize compatibility/typecheck, final tests and ordinary build. New module/tests must pass the configured formatter. Capture scoped typed lint before/after, including any formatter-induced diagnostic; do not waive new logic warnings or expand rules/baselines/suppressions. Run actual format/size gates: only the measured API line count may change; all other34 size findings and existing baselines remain exact. Run the four actual source/native/Git/backend guards and advance only exact reviewed source rows after testing.

Build ordinary source-bound profile with unsupported qualifications empty; run correct/wrong/missing-source scanners and compare Q15 runtime bytes. Changed executable bytes require fresh desktop/phone actual-App local reader acceptance through a new isolated synthetic target, blocking image transformations/provider egress. Readers/synthetic media/test TLS do not grant hosted writer or independent recovery authority. Preserve historical services/volumes, native12, full backend,355 canonical inputs/144 migrations/mixed index/prior seals/unrelated worktrees. Finish local clean publication/check-only source archive, sanitized sealed evidence and the next explicit endpoint-domain packet. No remote push/main/deployment, hosted SQL/settings/billing/schema/dependencies, original backup/media/ignored ETL or transformations. Hosted release, original writers/retries/retirement, independent restoration and Worker/source binding holds remain explicit.
