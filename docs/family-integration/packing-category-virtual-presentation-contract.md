# U04-C3b3 — packing category identity presentation and saved v3

Scope: the isolated `codex/trek-v5.1.2-family-reconcile` application. This packet changes no database migration, hosted environment or deployment. The strict marked124 database retains its exact functions, security and migration chain. Normal and hosted builds keep their existing activation behavior.

## Identity and native presentation

A category is a persisted `packing_categories` identity, not its name and not a packing item. The v2 coupled snapshot remains authoritative for categories, links, complete item facts, People, responsibility, historical provenance and collection revision. Projection attaches `family_packing.category_id` to genuine items and derives a separate `categoryViews` list. Native grouping, React keys, collapsed state, menu/composer observations and color order use `packing-category:<category UUID>`. The heading remains the exact stored raw label, or the native localized default for raw empty text. Raw empty and literal `Other`, Unicode spellings and same-label personal owners keep distinct keys. Ordinary TREK and old Family v1 projections preserve their previous grouping and placeholder conventions.

An empty retained card carries `{kind:'virtual-category',key:'virtual-packing-category:<category UUID>'}` only as presentation metadata. It is never inserted into `packingItems`, a store/cache table, a saved item array, a command or a queue. View/count/weight/export helpers and the repository/store effect boundaries reject untyped virtual values. A literal item named `...` is a real editable/countable/exportable item in the v2 identity projection. No fake row, invisible label suffix or thumbnail/image transformation is used to retain the category. Existing raw display text is not trimmed into a different category identity.

Empty cards appear in All/Open, not Done. Status-hidden real items do not turn a nonempty category into an empty one. Personal foreign categories can be read but not authored. Saved sessions hide authoring even if a caller supplies an edit permission. Item-only alphabetical sorting preserves category metadata order; category drag stays gated.

## Original commands and permissions

The existing qualified v2 SDK, retained intent and receipt machinery sends category lifecycle/create and category-ID-bound item commands. A composer captures the original source, Trip/Family/account/Person, layer/lifetime, category facts, complete collection revision, target and operation at opening. Concurrent submits share one pending operation. An uncertain retry must be identical; changing its name cannot rebase an unresolved intent. Closing, logout, source/view/root changes or loss of authority prevent a delayed result from publishing into a new view. A known confirmed fill can open a distinct next composer for a deliberate second item.

Native Add list creates metadata with `execute_family_trip_packing_category_lifecycle_v2` and no item. Fill creates one real item with `execute_family_trip_packing_category_item_v2`, the original category ID/full observation and null original-item/move facts. Empty dismissal uses lifecycle `category-dismiss-empty` and its original complete metadata/collection; it never issues a child-item delete loop. Existing rename/responsibility commands retain their v1 eight-fact observation from the exact selected category identity. Eligible People and historical removal-only responsibility retain the existing behavior.

Nonempty category Trash, operation-bound category batch restore, category complete-lane order and implicit merges are not connected by this packet. They remain gated for C3c. Existing qualified group packed-state is offered only where its complete v1 raw selector identifies exactly the same category-linked set; a same-label owner collision cannot silently enlarge that set. Menus that only support rename do not bind a nonexistent group transaction. Unsupported templates/import/sharing/category relocation retain their existing gates.

## Explicit saved package v3

`family.offline-trip.v3` / `family-web/complete-trip-v3` is a separate strict envelope/data schema. It requires `packing_categories_v2`, including the full checked coupled v2 snapshot, and forbids legacy `packing_categories`. Its embedded packing must exactly equal the main packing component. Canonical digest, manifests, revision vector, relationships and deterministic `packingCategory` bindings cover the whole metadata packet and referenced People, including historical assignment authors. Category and item UUID namespaces cannot collide.

Capture requires explicit `packingFormat:'category-identity-v2'` and read-only admission. Cold admission retains the same source/account/Family/Person/Trip/layer ownership, freshness, expiry and lease/lifetime checks. Projection derives virtual cards after validation; the saved reader exposes an immutable historical read, never a writer. V1/v2 schemas and byte fingerprints remain unchanged. Old packages do not invent v2 category identities or gain writes. Unknown formats and malformed/mismatched snapshots are rejected.

Normal bootstrap uses the new coupled reader only with the exact local flag `VITE_FAMILY_PACKING_IDENTITY_QUALIFICATION=local-v2` and source `http://127.0.0.1:55631`. Cold reading additionally requires the existing `VITE_FAMILY_OFFLINE_READ_QUALIFICATION=local-v1`. V3 preparation explicitly admits that local source; old v2 preparation scopes are unchanged. Public variant cache access to55631 additionally requires the identity qualification flag. No hosted endpoint or ordinary build receives this qualification implicitly.

## Acceptance and limits

See the sibling handoff for actual commands, counts, commits, browser findings and immutable evidence. New tests exercise strict legacy bytes, v3 round trips, ID namespaces, mocked original commands, duplicates/foreign/read-only/filtered views, genuine ellipsis items, real native consumers and effect-boundary refusal. Actual acceptance must use fresh synthetic Trips and real Auth/TOTP against the strict124 guard, ordinary App entry and generated worker at desktop and phone widths, with HTTP/CONNECT/WS proxy rejection of hosted traffic and `/render/image/` before delivery.

A local acceptance or service-worker cache test does not establish hosted rollout, offline authoring, complete travel-feature onboarding, independent backup/restore, incremental backup scheduling or all possible upstream compatibility. Those claims require their own evidence and release work.
