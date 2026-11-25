# U04-C3b2 — category identity SDK and retained queue contract

This packet connects the qualified C3a/C3b1 v2 database protocols to the website SDK. It does not activate native authoring or alter saved packages. No migration or hosted operation belongs to this packet. The database target remains marked local124 (`family-modernization-20261112-c3b1`, API55631/DB55632), PostgreSQL17.11 and pinned CLI2.109.1. The accepted C3a/C3b1 database contracts remain authoritative.

## Explicit boundary and formats

`family-backend/src/data/supabase/packingCategoryV2Rpc.ts` permits exactly seven endpoints: coupled active read, exact raw-name/owner-lane lookup, bounded category Trash read, lifecycle execute/receipt, and bound item execute/receipt. There is no raw table or name-based fallback. Existing v1 boundary files/parsers are unchanged. Nested items use the exact v1 item parser; v2 category metadata contains twelve facts. A v2 response never passes through an old response cast.

`packingCategoryV2Contract.ts` separates active snapshots, point lookups and Trash pages. Active rows are ordered common first, then owner UUID, category rank and category UUID. Empty cards must be explicitly retained and common or owned by the current actor. Foreign empty metadata and duplicate owner/raw-name lanes are invalid. Every actual item has exactly one valid category link. Raw `''`, literal `Other`, Unicode variants and same-label different owner lanes remain distinct. People are the exact sorted set referenced by category owners/assignments/provenance, with historical eligibility kept separate from current selection authority. Empty common cards must also match the v1 assignment compatibility map.

Lookup preserves the exact raw label, including `''`, and does not erase unretained or trashed identities. Trash preserves complete original observations, common/own authority and descending microsecond timestamp/UUID cursors; limit1..100, default50. These are not coupled snapshots and cannot be substituted for one. Responses are bounded8MiB; category observations and lifecycle values262144 bytes; actual item-create values retain the qualified v1 limit65536 bytes. Counters are safe integers, booleans are not coerced, UUIDs/timestamps remain strict, extra fields are refused, and PostgreSQL space-only trimming is preserved.

## Original command envelopes

Both envelope kinds use `version:2`, exact `source_url`, `view_layer:'published'` and a strict `command`. Scope remains the existing version1 published actor/Family/Trip/lifecycle scope.

Lifecycle kind `packing-category-lifecycle`: original operation UUID, target category UUID, action, original collection revision, full observed category or null for create, and exact values. Create accepts only raw name/visibility and an unused client category UUID. Retain/dismiss-empty/restore-empty use an original complete observation and `{}`. Visibility/owner comes from the selected category, never independent overrides. Empty-category server preconditions are not inferred from a filtered UI.

Bound kind `packing-category-item`: same original ownership, target item UUID, original revision or null for create, original collection, target category UUID/full observation and exact values. Its envelope additionally retains `original_item` and `original_category_id`: both null for create, both exact original facts for move. These two facts are local proof inputs, not extra RPC parameters. A move keeps values `{}`, identity/content/rank/bag/recipients/contributors/provenance and privacy lane. Cross-owner/privacy conversion is refused. New item values are name and the qualified optional quantity/grams/bag/packed-state fields, without category/name-resolution/privacy/owner overrides. A literal stored item named `...` remains real content.

Tagged `packing-category:<UUID>` and `packing-item:<UUID>` keys cannot collide. Virtual keys fail UUID validation before persistence or effects. Presentation allocation and explicit virtual-placeholder tags remain C3b3 work.

## Queue, ownership and acknowledgement

SDK routes are `/trips/<canonical-trip-UUID>/family/packing/category-lifecycle-v2` and `.../category-items-v2`. A route/body kind mismatch is invalid. Require the original operation in `X-Idempotency-Key`, no query/base-update extras, current source/account/Family/person, published layer and opening Trip. Both handlers join the normal planner composition, but no existing native control calls them yet.

`PackingCategoryV2CommandSession` captures the original scope/source/lifetime before any await, clones the parsed envelope, coalesces a pending submit, and retains the unchanged body under an exclusive queue lease before dispatch. The existing queue ownership policy name `family-original-v1` and mutation schema2 are retained: that policy identifies original-intent protection, not the command-body version. Existing v1 queue bodies are neither translated nor rewritten. One shared operation namespace rejects changed intent/domain. Context changes never generate another operation or rebase an observation.

Background queue replay holds every category-prefixed protocol, including unknown future versions. Only explicit owned recovery can submit a supported retained operation. An expired session, network loss or malformed reply leaves uncertainty retained; definitive authority/conflict refusals park the same body. Original queue-row comparisons include metadata, preventing a delayed callback from deleting a newer row. Startup recovery is receipt-first; `unknown` retains work and only explicit Retry submits the original. Current-authority visible and redacted commitments acknowledge history without replay; redacted results are never reconstructed.

Acknowledgements bind version/kind/action, exact actor/scope/operation/values, target/item/category identities, derived fields and allowed revisions/no-op behavior. Historical receipts may have a newer current root lifecycle scope while retaining the original result scope. They never become current snapshots. `PackingCategoryV2Cohort` exposes SDK-only load/lookup/Trash and submission; canonical publication comes from a fresh coupled read under the still-owning generation. A slow old read or submit cannot replace a newer cohort. Native/Dexie item publication and saved-package formats remain unchanged. Existing native packing reconciliation can recognize a retained v2 command, validate its own receipt and refresh current native state without casting it to an old item command.

## Acceptance and limits

See the adjacent acceptance handoff for actual counts, commands, commits and preservation evidence. Tests distinguish mocked protocol/queue behavior from real local Auth/TOTP/PostgREST. No browser acceptance, native create/fill/dismiss activation, category drag order, nonempty-category Trash/batch restore, saved-format migration, production schema change or deployment is claimed here. C3b3 and C3c remain prerequisites for those features.
