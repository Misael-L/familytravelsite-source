# U04-D2 — proposed observed bag writer contract

Status: this proposed contract is historical; its database/read implementation is accepted locally as [D2a](packing-bag-foundation-handoff.md). Use the [exact implemented126 contract](packing-bag-foundation-contract.md) for payloads and bounds; SDK/native activation remains pending. Existing125 item/category APIs, receipt bodies and saved formats are compatibility requirements. Read the [audit](packing-bag-ownership-audit.md) for actual evidence and tradeoffs.

## Relational changes

Retain `public.packing_bags`, `public.packing_bag_members`, `public.packing_items.bag_id` and `family_auth.packing_command_receipts`. Do not add a second bag, bag-ownership, carrier-weight or receipt table. Bags are Trip-owned; item privacy remains independent.

Add to `packing_bags`:

- `revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0)`, server managed.
- `deleted_at timestamptz NULL` and `deleted_by_person_id uuid NULL REFERENCES public.people(id) ON DELETE RESTRICT`, paired and finite.
- Nonnegative rank protection after a non-mutating preflight. Ties remain valid and deterministic under `(sort_order,id)`; names are not unique identities.

Identity, Trip and creation timestamp are immutable. Transition triggers must also reject bag Trash with live child references and live item assignment/restore into an inactive bag, including privileged direct DML; these cross-table rules belong in validated triggers, not CHECK subqueries. A new Trash actor must belong to the same Family, with current authority checked by the command. Bag and member mutations advance bag revision monotonically and the existing collection revision. A real no-op performs no business DML/audit/counter increment, while retaining its idempotent operation receipt. Do not require increments to equal one when several existing triggers legitimately touch the collection or parent.

For new/changed content, names are trimmed, nonempty and at most500 Unicode characters; color is null or six-digit `#RRGGBB`. Omitted content preserves the old value, null clears nullable content only. Do not impose a new table-wide maximum/color CHECK that makes untouched legacy names or colors unmodifiable. Use conditional new-value validation, and retain existing weight-limit constraint `NULL OR 1..10,000,000` integer grams. Reject invalid values rather than clamp/truncate/normalize identities.

Keep composite `(trip_id,bag_id)` references and carrier eligibility triggers. Add indexed Trash pagination `(trip_id,deleted_at DESC,id DESC) WHERE deleted_at IS NOT NULL` and a partial actor-reference index. The existing bag Trip/rank, item bag FK and member PK/person/Trip indexes should be reused; do not duplicate them. Active bag rows are bounded at2,000 per Trip, a full snapshot at8 MiB and a bag observation/command/receipt at1 MiB. Preflight legacy over-bound Trips; refuse unsafe reads/writes without data loss. Trash history is paginated and does not consume the active quota.

No direct bag/member DML grants are restored. Add restrictive active-bag selection and active-parent member selection without RLS recursion; authorized Trash RPCs bypass only those filters through private, restricted helpers that repeat authentication/Family/Trip/MFA checks. Existing Trip Trash/restore must retain independently trashed bag state. Live print/search/list exports exclude Trash; private full recovery exports retain authorized history and its identities deliberately.

## Versioned reads

All functions return strict JSON objects, validate UUIDs and byte bounds, refuse non-exact/unsafe JSON numeric counters or totals with54000 before committing, and use the existing published `PackingScope` (User, Person, Family, Trip and root lifecycle).

`get_family_trip_packing_bags_v1(p_trip_id uuid)` returns `{version:1, kind:'packing-bag-snapshot', scope, collection_revision, packing, bags, people}`. `packing` is the exact existing packing-list-v1 shape, with only active bags and old bag fields. Extended `bags` contains each corresponding bag's revision/lifecycle facts and sorted carrier IDs; `people` resolves referenced current/historical People and explicit eligibility. These facts come from one database snapshot.

`get_family_trip_packing_bag_v1(p_trip_id uuid, p_bag_id uuid, p_include_deleted boolean DEFAULT false)` returns `{version:1, kind:'packing-bag-observation', scope, collection_revision, bag, member_person_ids}`. `bag` contains the existing stored bag columns plus the three new lifecycle/revision fields; carrier IDs are exact, distinct and UUID-sorted. No private child item identities, counts or names are exposed. Wrong lifecycle or unavailable bag is a refusal, not an empty successful observation.

`list_family_trip_packing_bag_trash_v1(p_trip_id uuid, p_limit integer DEFAULT 50, p_before_deleted_at timestamptz DEFAULT NULL, p_before_id uuid DEFAULT NULL)` returns scoped/revisioned `{version:1,kind:'packing-bag-trash',bags,next_cursor}`. Limit1..100, descending `(deleted_at,id)` keyset order, exact microsecond timestamps and paired cursor fields. Each row is an original bag observation; copied/torn/cross-publication pages cannot become restore authority.

Before adding columns, replace `packing_snapshot`'s whole-row bag serialization with the exact legacy field projection: id, trip_id, name, color, sort_order, weight_limit_grams, created_at, updated_at, member_person_ids, total_weight_grams. No new keys enter old validators, v1/v2 coupled payloads or saved v1/v2/v3 bodies. The new bag domain can be coupled with existing category reads only when complete scopes/collection revisions match; never partially publish a new generation.

## Commands and exact retry

`execute_family_trip_packing_bag_v1(p_trip_id uuid, p_operation_id uuid, p_scope jsonb, p_action text, p_target_id uuid, p_expected_revision bigint, p_expected_collection_revision bigint, p_observed jsonb, p_values jsonb)`.

The client envelope is `{version:1,source_url,view_layer:'published',command:{version:1,kind:'packing-bag',operation_id,scope,action,target_id,expected_revision,expected_collection_revision,observed,values}}`. Bag target UUID is always present. Original scope and complete expected collection are mandatory. Changed JSON or domain under an existing operation UUID yields409; exact retry returns its original receipt before applying current revision checks, after current authorization/context and request-identity checks. No generic queue fallback, automatic retry with newer facts or automatic interpretation of unknown receipts.

- `bag-create`: fresh target UUID, expected revision/observation null; values `{name,color?,weight_limit_grams?}`. Rank is assigned at the end under lock, not accepted from a stale client count; initial carriers empty. Duplicate names are valid distinct bags.
- `bag-update`: original active observation/revision; nonempty subset of `{name,color,weight_limit_grams}`. Omission preserves; explicit null clears nullable fields. No carrier IDs, privacy, owner, raw revision or reorder in this action.
- `bag-members`: original active observation/revision; values `{person_ids:[...]}`. Validate the entire exact sorted desired set before DML, retain unchanged historical IDs, require current eligibility only for additions, and apply differences atomically. No item field is changed. Invalid/duplicate/foreign/off-roster additions refuse the whole operation, not a silently filtered set.
- `bag-trash-empty`: original active observation/revision and `{}`. Refuse if any live item references the bag, including hidden items. Preserve all previous item Trash and carrier links; set the bag's Trash actor/time. Do not unassign anything. Nonempty bag removal is explicitly unsupported.
- `bag-restore`: original deleted observation/revision and `{}`. Current direct authority may restore another actor's shared Trip bag. Preserve stable identity/content/carriers, including historical People; restore no item automatically. No name conflict merging or automatic overwrite.

Every item-assignment/restore path must reject an inactive destination bag, including existing v1 item create/update/restore and v2 category-bound item/move/batch restore paths. Preserve a previously trashed item's historical inactive parent reference, but return409 requiring explicit parent restore before reviving that item. Do not introduce a new item-move implementation or silently change an item's owner/ACL. The native cutover must make this dependency actionable before bag Trash is enabled.

A result is `{version:1,kind:'packing-bag',trip_id,operation_id,scope,action,target_id,values,collection_revision,changed,bag,member_person_ids}`. Check exact request facts, bag identity/lifecycle/content, sorted members and server-managed revision/collection changes. This is proof of the operation, not a current publication: follow it with a fresh coherent read.

## Authorization, locking and receipts

Reads reuse current `packing_require` authorization; writes additionally require current direct `trip.packing.manage`, effective session assurance, active account/Person/Family membership and an active matching Trip. Propose/deny does not become direct write. Published bag state is independent of itinerary draft display; no implicit My Plan write alias. Carrier membership gives no permission. Preserve the existing visible-item-plus-direct policy for item moves.

Use the same Trip-recovery advisory lock as current writers, then `trip_packing_state FOR UPDATE`, then bag rows in UUID order, then carrier/item dependencies in deterministic order. Validate full observations and dependencies under those locks. Content, memberships, collection counters, audit and receipt succeed or roll back together; no external HTTP/file calls inside the transaction.

Extend the existing shared receipt action/result constraints with the five bag actions. Bag `target_id` is its UUID and `category_id` stays null. Record intent hash, full before/after bag/carrier facts and bounded result in the same immutable receipt table. No old receipt is rewritten. Existing item/group/category executors and typed receipt readers must refuse bag-domain collisions, and vice versa.

`get_family_trip_packing_bag_receipt_v1(p_trip_id uuid,p_operation_id uuid)` repeats the accepted packing receipt access/Person/root-lifecycle rules and returns `{version:1,kind:'packing-bag',trip_id,operation_id,scope,status:'unknown'|'committed',result_redacted,result}`. Wrong stored domain is22023; a changed original Person context is409. Unknown is never success. A known but currently unshareable result is committed/redacted with null result; it grants no write authority. Full Trip/Family/session denial remains denied. Results never expose hidden item content.

Public wrappers are `SECURITY INVOKER`, empty fixed search path, EXECUTE only for the intended authenticated role. Necessary private definers use empty search path, fully qualified names, internal authorization and restricted execution; no trusted identity comes from user-editable JWT metadata. User-facing actions use the existing native controls with per-action ports, original opening observations and retained UUIDs. No unrelated group gate opens.

## Acceptance boundary

Database clean install and upgrade from125, preserving all old bag columns and every old receipt; exact old-parser roundtrips; valid/invalid content and bounds; current/guest/historical carrier rules; hidden weights without hidden content; atomic failure/concurrent member edits; stale scope/root/revision; every item assignment/restore path; nonempty refusal; independent Trash survival; cross-domain UUID reuse; no-op/retry; receipt loss/redaction and direct/propose/deny/MFA must pass before SDK/native activation. No hosted change is part of this specification.
