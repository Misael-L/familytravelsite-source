# Explicit public-image preparation component v1

U03-D16h. This component captures public location-cover variants for one admitted, visible, published Trip in the explicit canonical-loopback qualification build. It neither enables the native whole-Trip download action nor extends the private complete-generation lifetime.

## Native boundary decision

`tripSyncManager.prepareForOffline` returns only `done/trips` or a skipped reason. Its progress has trips/files/tiles/done phases. Desktop `OfflineTab` and phone settings interpret done as whole-Trip success; the installed Family planner deliberately returns `planner-scope`. `PlannerReadPort` has no component-preparation/result slot. Mapping an image-only result into that callback would misstate readiness. This packet therefore implements the component and a narrow online admission adapter, tested through an explicit application test entry. Native controls/markup/layouts and the generic gate remain untouched. A component-aware presentation contract is a separate prerequisite before user-facing activation.

## Admission and facts

`openPublicImagePreparation(trip, repo=familyFrontend)` requires the actual authenticated native/Family account, SDK read epoch, exact configured source, published layer, identity registry and visible native Trip to agree. A real RLS-protected Trip header read confirms access at opening. The adapter selects and parses the existing complete v2 generation under the existing queue/import/source guards. It does not create, refresh, edit or extend a snapshot. Both monotonic and calendar deadlines remain bounded by that original private view.

Online admission uses the database already selected by the authenticated session and checks its native user/source ownership; it never invokes the offline-only startup selector.

Its verification operation reacquires short read-only guards and compares the complete owner/head/row observation exactly. No database transaction or queue lock is held across public HTTP, hashing, decoding or CacheStorage writes. Actor/private-session end, offline transition, Trip/layer/context changes and observed local-work/generation changes cancel the component. Raw out-of-band IndexedDB writes have no continuous-notification promise: every operation and final receipt still reverify the actual stored generation. Any admission/verification failure ends that preparation handle without changing the native viewer's access state. It is not a synthesized membership denial, a private write or automatic retry.

## Explicit action and bounds

Creating the component does not capture bytes. `prepare('user-request', {signal?,refresh?,offset?})` is the only action. Other intents refuse; concurrent runs on one handle refuse as busy. The handle may be explicitly retried while its original generation/context remains current. Dispose is idempotent and cancels pending work. No initialization, background sync, native generic-preparation callback or saved-view read starts a download.

Selection is deterministic: distinct non-null cover asset IDs of the accepted Plan locations, sorted by ID; thumb then hero for each asset. Repeated visits do not duplicate captures. Unrelated gallery assets, canonical originals, files, arbitrary inputs and provider lookups are not candidates. A missing/non-v1 role is counted unavailable and stays a placeholder. The existing public-cache validator rejects unsafe/foreign/transform/signing URLs before network or storage.

A run attempts at most 32 descriptors sequentially, from an explicit nonnegative bounded offset. The receipt reports the next offset, if any, tied to this generation. Prior receipts are not accepted as authority or resumable input. An offset chooses another batch; it never proves earlier batches remain stored. Each image retains the existing 4 MiB and dimension bounds; accepted network bodies are at most 128 MiB per batch. Source storage remains 64 MiB/128 entries with seven-day public retention. Callers cannot expand those limits. Default capture reuses a valid receipt; explicit refresh may fetch again. A failed refresh is still reported failed even if older public bytes survive.

## Result and future eviction

`family.public-image-preparation.v1` is an in-memory component observation: exact source, private scope, complete generation/digest/ownership, observation time, batch selection, counts and selected descriptor outcomes. Ready items include the independently checked public-byte receipt; failed items contain bounded error codes, not response bodies or credentials. No Blob URL, private file body, command or auth token is included. This packet persists no new receipt store and accepts no historical receipt/version as input.

Every successful capture is reread after the batch, because a later capture or another tab may have evicted it. Missing/corrupt/expired bytes become missing; cache failure stays failed. Any current-context failure rejects the entire observation instead of producing partial success. `complete` means all eligible roles fit this batch and were checked present at that observation, with no unavailable/deferred/failed/missing roles. Reads form a finite verification window ending at `observedAt`; they are not a group-atomic cache snapshot, and another tab may evict an already-checked entry. `partial` reports every shortfall. `empty` means no eligible or unavailable cover roles exist; it is not a download success. Locations without a cover are counted separately. Larger batches remain partial even if an earlier receipt once covered other entries.

Receipts cannot guarantee future residency. Native saved-image consumers always call the existing checked cache read again; later eviction, corruption or expiry yields their existing placeholder. The receipt neither changes complete-envelope v2 flags (`mediaBytes=false`) nor renews fifteen-minute private authority. Public bytes can survive cancellation/logout independently; an unreported or cancelled capture does not establish a Trip association or prepared status. No original cache/queue/import/File record is replayed, adopted, mutated or deleted.

## Acceptance

Test selection/deduplication, offsets/bounds, partial/empty/error results, malformed identity, explicit refresh/retry, overlapping runs, cancellation and ABA, expiry during awaited work, changed generation/descriptors, post-capture eviction and later saved placeholders. Use actual cache response/stream validation in the compiled application with real SDK/TOTP/worker and desktop/phone consumers. Test-only entry exports are absent from standard/ordinary/source-alias application artifacts. Synthetic local WebP HTTP responses demonstrate integration, not hosted Storage bucket/RLS or physical iOS. Preserve every earlier driver body and full-suite assertion/status; run final source-frozen tests, types/lint/gates and native/source/schema/domain/audit/file-byte checks.

No hosted schema/settings/billing/dependency, production/preview/main/push/deploy, backfill/transformation, original backup/media or ignored ETL operation. Ordinary Supabase public objects use [direct object URLs](https://supabase.com/docs/guides/storage/serving/downloads). The reviewed current changelog does not require a CLI/SDK upgrade for this bounded browser component.
