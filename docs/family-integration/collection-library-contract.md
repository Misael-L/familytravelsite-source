# U04-F5c5a — bounded Collection library prerequisite

This closes the root-index gap found during the C5 native inventory. It adds one read API and an **unwired** strict backend reader/SDK gateway. It does not activate the native handler, old item writers, transfers, removal, sharing, root authoring or queue. Accepted schema141 routines and all existing table/policy/grant facts remain unchanged.

## Database boundary

`get_family_collection_library_v1(p_family_id uuid,p_state text DEFAULT 'active',p_limit integer DEFAULT 50,p_cursor jsonb DEFAULT NULL) RETURNS jsonb` is a public invoker wrapper over a checked private definer. Explicit empty search paths, current Auth session, existing Family/person/MFA policy and pinned authority apply even to an empty result. Anonymous/service/PUBLIC execution is refused. Only the private entry is executable by authenticated users; its observation helper remains private. There are no new tables, write endpoints, triggers, policies or indexes.

State is exactly active or archived; NULL/unknown state and NULL/out-of-range limit refuse22023. Limit1..100, maximum1000 **visible** roots in that state and maximum2MiB per response. The root-set observation reads at most1001 visible root descriptors and rejects overflow54000 rather than hiding additional roots. Existing Family-scoped list ordering/indexes remain in force; a dedicated index/epoch structure can be considered if measured library scale warrants it. This bound is explicit, not claimed to support unlimited libraries.

Return exactly `{version:1,scope,state,library_digest,total_count,offset,collections,next_cursor}`. Scope is `{version:1,family_id,user_id,person_id,session_id}`; a legitimate global reader may have NULL person. Do not invent an owner. Collections are sorted `(sort_order,id)` with deterministic UUID ties. Each entry contains:

- `collection`: C3 root metadata/display/media object, including identity, visibility, revision/lifecycle, explicit archive state, name, description, color, order and checked cover.
- `content_revision`, `active_item_count`: all active typed items, including nonlocation references and manual snapshots. This count is not permission to turn a country/airline/guide into a map location.
- `can_edit_items`, `can_admin`, `is_owner`: current database decisions, not inferred from native labels or the existence of an owner.
- `created_at`, `updated_at`: existing root timestamps.

Private roots belonging to other people are absent; their names and edits do not affect the visible digest. Archived roots are returned only when the existing archived-view authority allows it; editing items remains false. Trashed roots are excluded and survive in C1 recovery storage. Archive and Trash are distinct.

Cursor exactly `{version:1,scope,state,library_digest,sort_order,id}`. It must reference an existing visible root in the current observation. It binds Family, actor, person, session, state, full visible root metadata and content revisions. Insert, deletion, archive, visibility, metadata/order or item-content changes invalidate subsequent pages with PT409. A fresh session must restart the read. Limit may change between pages. Unknown/missing keys, invalid numbers/UUIDs or an absent cursor row refuse22023. Response offset is calculated from the actual observed cursor, not trusted input.

The root descriptors are collected in one query; every returned root is re-authorized and compared with its observation, and the complete visible descriptor set is re-observed before return. A concurrent difference refuses; the reader does not silently combine pages. This is a consistency fence, not a historical snapshot of external media/catalog services. Cover-variant readiness may evolve independently. Private byte delivery remains unimplemented.

## Backend contract and current limits

`family-backend/src/data/supabase/collectionLibrary.ts` validates exact DTO keys, version/state, scoped canonical UUIDs, complete lengths/offsets, unique ordered roots, next-cursor identity, bounds and safe JavaScript integers. Unsafe bigint JSON numbers refuse rather than being rounded or compared approximately. Parsed results and cursor/request scope are immutable. Timestamps, owner facts and archive/edit flags are checked; absent values do not fabricate native member/label/provider/currency facts.

`createCollectionLibraryReader(rpc,sourceUrl).page(request,assertCurrent)` performs one checked page. `all({scope,state},assertCurrent)` uses100-root pages, at most10 requests/1000 roots, and returns only after completeness/continuity is proven. No partial library escapes after a later failure. The caller **must** supply its original source/account/Family/session lifetime fence. It is checked before/after every await, after failures and before complete return. This module does not itself subscribe to auth stores or activate a native controller.

Only same-source ordinary public `catalog/variants/v1/...webp` cover URLs are accepted. Original images, transformations, signed/private paths and another project’s URLs refuse. Private covers retain an ID and explicit unavailable status, never fabricated bytes.

`collectionLibraryRpc.ts` allows exactly this named authenticated SDK call, propagates errors and has no raw-table fallback. Its HTTP transport is mocked in unit tests; actual GoTrue/PostgREST responses are separately decoded and completely assembled. Native browser/queue proof and an actual final SDK-to-native flow remain C5b work, not an inferred pass from these tests.

## Required native continuation

Replace the unbounded `loadFamilyCollections` reader only as part of the coordinated C5 cohort. Resolve native numeric IDs through the existing account-owned registry. Preserve typed source identity, use C3 detail/membership plus C4 context/preparation/original/outcome/cancel APIs, and C1 reachable Trash/Restore. Do not fake sharing/labels/root-cover authoring, reactivate versionless item writers or reopen the four transfer routes. Both native membership consumers must retain errors/unavailable state instead of saved=false. Manual creation needs its own qualified Family command path; generic POST `/addons/collections/places` remains a transfer refusal. Preserve native layouts and complete the ordinary desktop/phone/browser proof before activation.
