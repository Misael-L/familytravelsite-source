# Q78 — Archive-weather decomposition

Completed locally 17 November 2026. The archive-weather function meets its existing complexity limit. This packet preserves weather behavior and adds no hosted acceptance or feature admission.

## Change and measurements

Only `client/src/integrations/family/upstream/weatherService.ts` changes at runtime. Two private synchronous helpers contain the original archive hourly projection and sunrise/sunset selection blocks. The existing archive JSDoc stays attached to its function. No imports, exports, casts, defaults, provider calls or async wrappers are added.

- `detailedFromArchive`: complexity **36 → 18**, length **40**, five parameters.
- `archiveWeatherHours`: complexity **13**, length **20**, one parameter.
- `archiveWeatherTimes`: complexity **7**, length **7**, two parameters.
- All selected functions meet unchanged limits of complexity20, length120 and parameters5. The formatted file is unlisted and measures **797 → 807**, below1000. Scoped lint is **24 → 23 warnings**,0 errors; every other23 finding remains unchanged. No policy, baseline, allowance or suppression changed.

The parent is token-exact outside the two helper calls. Original helper-body tokens and every other module statement remain exact, including Q77's detailed-forecast function/helpers, daily weather, exported entry points, WMO maps, interfaces, coordinate validation, ApiError, cache/TTL/inFlight, fetch and real capped JSON reader.

Archive semantics remain distinct from forecast semantics: null temperatures are skipped; humidity keeps its fractional value; weather/precipitation/wind/humidity series remain optional; precipitation probability stays0. Date/getHours, hCode, short-circuit, field evaluation and array order remain exact. Sunrise/sunset keep null initialization and original conditional split/slice behavior, including undefined or refused malformed values. Final average/temperature/wind rounding, precipitation rounding to tenths, condition/description fallback and hourly-array identity are preserved.

Provider URL/query/timezone, sequential fetch/parse, status/reason fallbacks, daily-data refusal/null return, original local captures and all await/cache boundaries stay intact. Forecast/archive/climate date thresholds, reference-year adjustment, archive-miss forecast fallthrough, negative-result noncaching, TTL, coalescing and retry cleanup are unchanged.

## Validation and limits

**62 unchanged tests in four suites pass before and after**, with identical file bytes, names, assertions and occurrences: weatherForecast, applicationHandler, transport and serviceCompatibility. No product tests, mock contracts or live fixtures added. Existing weatherForecast tests primarily cover getWeather; private actual detailed-entry comparisons cover the changed archive route.

**642 exact original/candidate comparisons pass through exported getDetailedWeather:**210 scenarios and432 injected read/operation faults. The actual complete original/current module, cache/error helpers and real readCappedJson run against native Response/ReadableStream objects and explicit local recording fetch/signal/clock fixtures. No provider, DB/RPC/browser or hosted connection.

Comparisons cover complete results, raw/API errors and sentinel identity, input descriptors, Date/property reads, full URL/options, real body-cap cancellation/reader release, cache/inFlight traces and result/hourly/cache reference identities. Archive-specific cases verify fractional humidity, negative/fractional precipitation/wind, null-temperature gaps, optional series, unknown codes and missing/malformed/short/midnight sunrise/sunset values. Prior forecast/climate/coordinate/locale/threshold/cache/TTL/coalescing/retry/refusal cases remain covered. Faults include nested archive hourly/daily reads and time selection.

Both1MiB declared and streamed overflows are refused; native reader locks release. The service still requests an8000ms signal deadline. Timeout/abort failures are injected immediately by the local fixture, so no live-provider or actual eight-second timing acceptance is claimed. In-flight entries clear in ordinary cases. Stack frames naturally differ after extraction and are not compared.

The clean committed fixture-only build, direct installed compiler, four source guards and bound/wrong/missing-source artifact controls pass using128 fixed post-build declaration inputs. Actual full gate: **0 errors**, source **3440/3419**, tests **2859/2859**, suppressed **83/83**. Complexity **229 → 228 against218**, leaving10 excess; length **141/130**, leaving11 excess. The same32 size failure lines remain. Policies and all prior gate closures are exact. **G2 remains blocked.** Observation-only inventory leaves ordinary lint rules, arguments, results and exit decisions unchanged.

Incoming integration/publication `ac88c0fbef7c9c63050e2fbc0348912100479a25`; implementation `a10350917e5a8b91966886f56f0bc7eadc711502`; clean qualified build `df091b0b0860c36908195f34e7e84a23b7821bd3`. Website scope is exactly five paths: one runtime file, two source-provenance files and two documents. Later documentation does not relabel the compiled artifact. Corresponding-source archive and publication checkout stay local and check-only/unbound; no push or deployment.

## Exact continuation

Next bounded review: `client/src/integrations/family/upstream/weatherService.ts`, private async `_getWeatherImpl`, with ordinary complexity71 and length166 against unchanged20/120. Both warnings belong to the same function. Q28–Q78 accepted scopes are closed; the Q77 detailed-forecast and Q78 archive-hour/time helpers, their parent functions and all exported wrappers remain byte-exact.

Start with the original function and actual callers, not a guessed rewrite. Inventory five behaviors separately: dated forward forecast; recent-past forecast before the archive lag; past archive with optional hourly lookup then daily fallback; far-future five-day climate statistics; undated current weather. Preserve the exact -1/+16 and recent -5-day boundaries, local-Date and reference-year rules, forecast-miss/recent-past fallthrough, valid/invalid/midnight time parsing, optional hourly URL fields, hourly-vs-daily precedence, null sample skipping, zero/null/truthy fallbacks, WMO/estimateCondition differences, all TTLs and negative-result noncaching. Earlier recent-past forecast fixes are accepted and must not be corrected or bypassed under a quality refactor.

First investigate private synchronous response-error checks, source-specific projections and original climate accumulation; retain exact local captures and property/read/evaluation order. Do not reuse the detailed hourly projection or archive time helper for this different result contract. The current inline hourly type assertion is part of the original source, not permission for additional casts. No broad context bag, new defaults/imports/exports/dependencies or changed API shape. Measure the whole candidate before applying: selected parent and every new helper must meet complexity20/length120/parameters5/depth/format/file limits. Do not apply a partial extraction that leaves the selected function over budget. If clean synchronous boundaries cannot meet all limits without a semantic change, document that demonstrated limit and choose the next bounded review rather than adding unproved async layers or weakening policy.

All existing awaits, sequential provider calls, original cache admission, same-key coalescing/Promise identity, rejection cleanup,8s deadline and real streamed1MiB read cap remain in their original order. Avoid new async wrappers because extra Promise turns may alter observable cache/in-flight timing. Preserve exported getWeather/getDetailedWeather wrappers and signatures, coord/hourIndexFromTime/getCached/setCache/fetchRecentPastForecast/fetchOpenMeteo, maps/types/ApiError and all Q77/Q78 code. No weather behavior correction, new provider or feature admission.

Run the unchanged weatherForecast/application/transport/serviceCompatibility suites before and after. The existing weatherForecast suite exercises actual getWeather behavior, including recent-past and hourly behavior; inspect its assertions. Adapt the Q78 real-module differential harness to invoke actual exported getWeather with its fifth optional time argument. Keep the real capped JSON reader/native Response streams and recording local fetch/signal/clock/cache fixtures. Add current and all dated branches, all requested query fields and provider fallback order, time values, malformed/short/null series, climate accumulation, status/reason/default failures, coordinate/locale/date boundaries,1MiB header and streamed caps, cancellation/body release, TTL edges, cache identity, overlapping calls and retry cleanup. Inject faults through actual selected reads; compare full outputs/errors/reference/state/input descriptors/Date/property/URL/options/cache/in-flight traces. Existing tests and assertions must remain unchanged. Immediate fixture timeout/abort is not live8s/provider timing acceptance; stack frames may differ after extraction.

Preserve all policy/baseline/suppression bytes, native layouts, schema/index/prior seals/other checkouts. No real DB/RPC/provider/browser/hosted qualification, push/deploy/settings/billing/backup/media/ignored ETL/transformation or deferred cleanup. Local weather quality qualification does not activate another integration or modify deployment settings.


Retain [release prerequisites](core-release-prerequisites.md) and [deferred cleanup](pre-production-retained-source-cleanup-packet.md). Incremental protection, independent matched database-plus-files recovery, current hosted contracts/engine facts and actual preview/source binding remain separate unproved release gates.

All370 canonical schema/test sources,151 migrations, the mixed canonical index,236 prior seals/14,850 members,11 auxiliary manifests, three other checkouts and12 protected native files remain exact (11 upstream-byte-exact plus the fixed Sidebar return-type derivation). Production/preview, hosted settings/billing, backup/media/ignored ETL and transformations are unchanged.

Private reproduction receipts: `/private/tmp/trek-core-quality-archive-weather-source-20261117`. Canonical evidence records final documentation commit and hashes.
