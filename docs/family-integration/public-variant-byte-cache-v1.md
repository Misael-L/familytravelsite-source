# Public stored-variant byte cache v1

U03-D16f introduced `client/src/integrations/family/publicVariantCache.ts` as a standalone reusable primitive. U03-D16g now connects its read operation to explicitly qualified saved Plan image consumers; see [display lease contract](saved-trip-public-image-leases.md). Settings downloads, worker routes, private documents, hosted cold reads and whole-Trip readiness remain disabled. Historical qualification below describes D16f, before that consumer cutover.

## Identity and policy

The factory accepts only the two explicit qualified sources, `http://127.0.0.1:55331` and `http://localhost:55331`. Hosted activation needs separate policy/release acceptance. The caller supplies that trusted source independently of the descriptor URL. A descriptor has exactly `source`, UUID `mediaAssetId`, recipe `v1`, role `thumb|hero`, and the exact ordinary `/storage/v1/object/public/catalog/variants/v1/…webp` URL.

The raw URL must already be canonical. Query/fragment/userinfo, alternate origin/port, encoded path characters, traversal, separators, empty segments, originals, arbitrary buckets, private/signing URLs and transformations refuse before storage or network. This intentionally accepts a narrower object-name alphabet than arbitrary Storage paths. The legacy substring helper is not used.

CacheStorage namespace `family-public-variants.v1:<encoded exact source>` and the full public URL identify the byte entry. Each entry's receipt binds asset, role and recipe too; another asset/role cannot relabel an existing entry. Canonical/localhost caches are separate. Entries contain no Auth/Family/Person/Trip identity or private file route. Public-byte sharing within one exact source does not grant membership or a Trip association. No native IDB database, complete generation, owner marker, command/import store or private cache is read or written by this module.

## API and receipts

`createPublicVariantCache(dependencies)` returns `capture(descriptor, context, {refresh?})`, `read(descriptor, context)`, `remove(descriptor, context)` and `clearSource(context)`.

`capture` returns `{status:'ready',receipt,blob}` only after awaiting persistence and independently validating the stored entry. A valid existing hit avoids network and renewal unless refresh is explicit. `read` returns the same ready shape or `{status:'miss'}` without fetching. It does not delete or reinterpret unknown/corrupt/expired entries. `remove` requires matching understood metadata; `clearSource` refuses unknown entries before deleting its one understood namespace. Other cache versions/namespaces remain untouched.

Failures reject as `PublicVariantCacheError` with a bounded code: descriptor/source refusal, cancellation, clock rollback, locks/storage unavailable, invalid response, conflicting/unknown entry, or underlying failure. No failure becomes a successful receipt. The error message contains no URL, original response body, token or private identity. A local SHA-256 detects changed stored bytes; it is not a server signature or independent source-authenticity proof.

The receipt is strict `family.public-variant.v1` metadata in the same cached Response as its body: source/path, asset/role/recipe, MIME, actual bytes, SHA-256, dimensions, capture/expiry and a random write ID. A write ID distinguishes cleanup from a newer replacement; it is not an actor identity or domain operation. Unknown receipt fields/versions are not accepted as a current format.

## Bounds, cancellation and consistency

Hard caps are 4 MiB per image, 64 MiB/128 entries per source and seven days of public bytes. Optional injected limits can only tighten them; instances sharing a source must use the same receipt lifetime policy. This retention never extends the private complete Trip's existing fifteen-minute deadline. A future time/rollback, expiry during validation, damaged receipt/body/digest or missing bytes does not establish readiness.

Fetch uses the exact admitted URL, omitted credentials, redirect refusal, no Auth headers and the caller AbortSignal. The whole streamed body is bounded even when Content-Length is absent or misleading; chunks are copied without a realm-specific `instanceof` assumption. Status/MIME/size/RIFF/chunk structure, static frame/canvas agreement and dimensions are checked before real decoding. Static frames must match the canvas and fit 4096×4096. Animation is refused. A decoder must independently agree with the parsed dimensions. Empty/truncated/opaque/redirected/non-image responses fail. A 1200-pixel catalog hero does not require a transformation request.

The caller's immutable operation generation and AbortSignal are checked across asynchronous fetch/body/decode/hash/lock/storage boundaries. An A→B→A return must use a new caller generation; this primitive neither synthesizes nor revives authorization. A signal cancels a pending reader. A cancellation/storage failure is observed explicitly, not swallowed as success.

Mutations hold one real browser Web Lock for the exact source, including fetch, validation, deterministic insertion-order eviction, put, reread and rollback. Without locks, checked reads work and mutations refuse. Cached bodies count toward bounds after verification. Unknown/corrupt unrelated entries prevent a new write instead of being silently reinterpreted or cleared. Refresh protects the prior valid target from eviction. Failed refresh preserves its previous valid entry; a new-write failure after eviction may leave fewer public entries but never claims the missing new item is ready.

If an unavoidable put finishes after retirement, cleanup stays inside the source lock and restores/removes only the exact operation receipt. A newer different receipt is left intact. A cleanup storage failure remains a failure and may leave unacknowledged **public** bytes; it cannot create a private Trip receipt or revive the operation. No cache is a durable backup, and browser eviction may remove it.

## Verification boundaries

Focused tests cover valid/reopened bytes, role/path/source identity, forbidden URLs, malformed responses, stream bounds, cancellation at fetch/decode/hash/put/reread, source generations, real failure results, expiry/rollback, unknown metadata, budgets/eviction and refresh/retry. The synthetic fixture is a browser-generated 2×3 WebP, not user media.

The separate test consumer is built explicitly from the actual module and a tiny export entry, without App/Auth/SDK/Dexie/queue imports or a product Vite entry/config change. Real desktop and phone-layout Chromium profiles capture bytes, restart the browser, disconnect network, reopen/independently decode and verify the digest without fetching. Real cross-tab Web Locks, source negatives and injected quota refusal over real storage are exercised. Seeded synthetic native-shaped original command/import/File/owner/complete/private-file fixtures remain exact; they are preservation fixtures, not evidence of accepted server bootstrap or production authority. Synthetic intercepted local object responses prove browser byte behavior, not Supabase bucket/RLS behavior. Physical disk exhaustion and physical iOS/Safari are not claimed.

Fresh ordinary/qualified/source-alias application builds remain separate from the consumer build. The primitive and its consumer are absent from product bundles. Actual App/SDK/worker controls and full-preparation refusal must remain proved on the qualified build, alongside ordinary-build negatives and the existing source/native/schema/domain/audit/Storage guards. The measured handoff records accepted results and distinguishes diagnostic/superseded runs.

References: [Supabase Storage downloads](https://supabase.com/docs/guides/storage/serving/downloads), [Web Locks request](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request), [Cache put](https://developer.mozilla.org/en-US/docs/Web/API/Cache/put). These platform contracts do not prove product integration or private offline permission.
