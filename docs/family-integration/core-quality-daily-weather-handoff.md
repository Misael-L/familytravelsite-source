# Q79 — Daily-weather decomposition

Completed locally 17 November 2026. Both selected daily-weather complexity and length findings are resolved. This packet preserves behavior and adds no hosted acceptance or feature admission.

## Change and measurements

Only `client/src/integrations/family/upstream/weatherService.ts` changes at runtime. Five private synchronous helpers contain the original provider validation and forecast/archive/climate/current result and cache blocks. Requests, awaits, date routing, recent-past fallback and exported wrappers remain in place.

- `_getWeatherImpl`: complexity **71 → 19**, length **166 → 69**, five parameters.
- `checkWeatherResultResponse`: complexity5, length5, three parameters.
- `datedForecastWeather`: complexity8, length24, four parameters.
- `archivedWeatherResult`: complexity20, length40, four parameters.
- `climateWeatherResult`: complexity9, length36, two parameters.
- `currentWeatherResult`: complexity4, length12, three parameters.

Every selected function meets unchanged20/120/5 limits. The formatted file is unlisted and measures **807 → 832**, below1000. Scoped lint is **23 → 21 warnings**,0 errors: both selected findings close; all21 non-null findings are unchanged. No policies, baselines, allowances or suppressions changed.

The parent is token-exact outside the declared synchronous-block calls and return handshakes. Helper statement tokens match their original blocks. The response helper receives each original error-message literal explicitly; it preserves status/reason short-circuit order. The forward mapping returns undefined internally on its existing miss path, and the parent uses that only to continue the original fallthrough. This adds no public response default or cache admission. Original result construction and setCache calls stay together, synchronously, with no added Promise turn.

All other module statements remain byte-exact, including Q77/Q78, maps/interfaces, coord/hourIndexFromTime, ApiError, cache/TTL/inFlight, fetchRecentPastForecast, fetchOpenMeteo, the real capped reader and both public wrappers. The original inline hourly type assertion is retained; no new cast, import, export, dependency, provider endpoint or async wrapper was added.

## Behavior preserved

Forward forecast still selects the matching date. A location-local today/yesterday missing from that window still tries recent-past forecast; untimed dates inside the archive lag still try that window before archive. Exact -1/+16 and recent -5-day boundaries remain unchanged. A valid historical hour still takes precedence over daily averages. Midnight, invalid, optional and malformed times keep their original behavior and optional hourly query field. Archive misses still return the original uncached no_forecast envelope.

Climate keeps its five-day reference window and year adjustment, null-temperature filtering, accumulation/read order, precipitation/condition rules and rounding, including negative zero. Undated requests still use current data. Every provider URL/query/timezone, status/error/reason fallback, coordinate/locale/date rule, sequential request/await, TTL, time-specific cache key, result identity, coalescing and rejection cleanup remains intact. No weather correction or new fallback/retry was introduced.

## Validation and limits

**62 unchanged tests in four suites pass before and after** with identical bytes, names, assertions and occurrences: weatherForecast, applicationHandler, transport and serviceCompatibility. No product tests, mock contracts or live fixtures added. Review of weatherForecast confirms coverage of forward/recent-past selection, misses, cache and refusals; that suite alone does not prove all hourly/current/climate branches.

**845 exact original/candidate comparisons pass through actual exported getWeather:**350 scenarios and495 injected read/operation faults. The complete original/current module, cache/error helpers and actual readCappedJson use native Response/ReadableStream objects and explicit local recording fetch/signal/clock fixtures. No real provider, database/RPC, browser or hosted operation.

Comparisons preserve complete outputs and raw/API errors, sentinel identity, input descriptors, Date/property reads, full URL/options, real cap/cancellation/reader release, Map/cache/inFlight traces and result/cache reference identities. Explicit assertions cover all five primary paths, historical hourly precedence, recent/forward miss ordering, climate null filtering and negative-zero rounding, time-specific cache separation, all TTL edges, same-key sharing, retries and negative-result noncaching. Provider/body/parse/refusal failures, invalid coordinates/dates/times and malformed/null/short/zero/negative series are compared. Faults cover the actual nested current/daily/hourly reads and selected Date/fetch/cap boundaries.

Both1MiB declared and streamed overflows are refused; reader locks release. The service still requests an8000ms deadline. Timeout/abort failures are injected immediately in the local fixture, so no real elapsed-time/provider acceptance is claimed. Ordinary-case in-flight entries clear. Stack frames differ after extraction and are not compared.

The clean committed fixture-only build, direct installed compiler, four source guards and bound/wrong/missing-source artifact controls pass with128 fixed post-build declaration inputs. Actual full gate: **0 errors**, source **3438/3419**, tests **2859/2859**, suppressed **83/83**. Complexity **228 → 227 against218**, leaving9 excess; length **141 → 140 against130**, leaving10 excess. The same32 size failure lines remain. Policies and prior closures stay exact. **G2 remains blocked.** Observation-only inventory preserves ordinary lint rules, arguments, results and exit decisions.

Incoming integration/publication `d6b399b5b7092b1aa16fafac17a4a97e1ac9f0fa`; implementation `4155a399a09b9311bbe75ee29167d7d1c7e0895d`; clean qualified build `8f438ae723ea7879716e4ff7851335d450575c30`. Website scope is exactly five paths: one runtime file, two provenance files and two documents. Later documentation does not relabel the build. Corresponding-source archive and publication checkout remain local and check-only/unbound, with no push/deployment.

## Exact continuation

Next bounded review: `client/src/integrations/family/FamilyPackingTrash.tsx`, exported component `FamilyPackingTrash`, complexity27 against unchanged20 in the ordinary gate. It is mounted by native desktop ListsContainer and phone MPackingListTab. Q28–Q79 accepted scopes are closed, including every weather function/helper completed in Q77–Q79. Do not reopen weather behavior, accepted packing writer/queue/terminal recovery or previous async page-test repairs.

First measure extracting only the original owned-bag-page expression and empty-listing boolean condition into private synchronous helpers using the existing OwnedPages/page/port types. Preserve all original comparisons and short-circuit/property/read order, return the same owned page array, and retain exactly where each expression executes. Do not unify page ownership helpers under a broad context bag, precompute optional getters earlier, or invent a different empty-state rule. Measure a complete candidate before applying: parent/all helpers must meet unchanged complexity20/length120/parameters5/depth/format/file limits. No partial overbudget extraction or new cast/default/import/export/API/dependency/async wrapper. Keep existing component export/interface and every hook's order, arguments/dependencies and initialization intact.

Do not edit native callers, JSX layout/text/classes/keys, Modal contract, permission/read-only admission, snapshot/port/trip ownership, generations, flight lock, useEffect callbacks, run/refresh/load, pending-recovery callbacks, restore or pagination command boundaries. Keep original page/row/index observations for bag, category and item restoration; grouped filtering and incomplete-category hiding must not be approximated. Retain all early returns, matching references, status/error messages, cache/queue and lost-reply/refusal/retention behavior. Do not fix a suspected lifecycle issue under a quality-only extraction; document separately if demonstrated.

Inspect and run existing `nativePackingControls.test.tsx` and the applicable packing pending/recovery suites unchanged before/after. Inspect actual test coverage rather than assuming a suite proves every branch. Use actual component renders with mocked snapshot/ports and native desktop/phone host consumers where covered. Compare original/candidate real component entry behavior and extracted synchronous expressions across absent/mismatched port/trip/owned pages, read-only/denied admission, empty/nonempty/incomplete category/item/bag pages, original array identity and property/short-circuit order. Include open/close, loading/error/retry, bag/category/item restore, pagination, reconcile outcomes and in-flight trip/session/port changes where applicable, preserving exactly the existing async boundaries and ignored stale settlements. Add meaningful tests only for an identified uncovered contract; no trivial tests mirroring implementation. Do not admit actual DB/RPC/queue/browser/provider/hosted execution.

Preserve every native layout byte, policy/baseline/suppression, schema/index/seal and other checkout. No push/deploy/settings/billing/backup/media/ignored ETL/transformation or deferred cleanup. Source-only quality qualification is not hosted feature acceptance.


Retain [release prerequisites](core-release-prerequisites.md) and [deferred cleanup](pre-production-retained-source-cleanup-packet.md). Incremental protection, independent matched database-plus-files recovery, current hosted contracts/engine facts and actual preview/source binding remain separate unproved release gates.

All370 canonical schema/test sources,151 migrations, mixed canonical index,237 prior seals/14,911 members,11 auxiliary manifests, three other checkouts and12 native files remain exact (11 upstream-byte-exact plus the fixed Sidebar return-type derivation). Production/preview, hosted settings/billing, backup/media/ignored ETL and transformations unchanged.

Private reproduction receipts: `/private/tmp/trek-core-quality-daily-weather-source-20261117`. Canonical evidence records final documentation commit and hashes.
