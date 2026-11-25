# U04-C2a — category foundation implementation contract

This is the local database foundation for stable packing categories. It implements storage, v1 compatibility, a coupled reader and recovery/export retention. It exposes **no category authoring API**. Rename/assignee controls remain gated. The C2 category command/receipt design still applies to the next packet.

## Qualified environments and source

The original marked project `family-modernization-20261104-q8ichzv` remains on120 at55331/55332. Its intentionally oversized audit labels remain intact. The new migration refuses those values; it neither truncates nor repairs them. All original public/family-auth table hashes,8 group functions, prior populated graphs/audits and original Storage bytes are checked unchanged.

A separate project, `family-modernization-20261111-c2a`, is the qualified121 rehearsal target at55431/55432, database `postgres`. Its state is `/private/tmp/trek-u04c2a-packing-category-foundation-20261111/rehearsal-state.json`. Strict guards bind project/container/ports/marker, reject the production Family fingerprint, require PostgreSQL17.11,120 exact prior migration files, the exact new migration/history entry,19 reviewed/new function hashes and table/column/constraint/index/RLS/trigger fingerprints. Historical guards do not accept this new project. No linked/hosted target is used.

The installed CLI is2.109.1; it was not upgraded. Its fresh stack initially selected17.6. The new rehearsal's engine was matched to the already cached accepted `public.ecr.aws/supabase/postgres:17.11.0.003`, retaining volumes and the stopped original engine container. Do not start that retained engine while the current database uses its volume. Use the guard rather than an unqualified start/reset. Other replay databases in this isolated container are SQL-only test witnesses, not API targets.

New CLI-created migration: `20261111234537_normalized_trip_packing_categories.sql`. No earlier migration is edited. The migration is recorded once on the isolated target after iterative SQL qualification and final-source replay; draft iterations are distinguished from final121 acceptance. The candidate application runtime remains at qualified application `42484c0a1ae7430a61087f3d006f83d23069c314`.

## Relations and exact identity

`packing_categories` stores UUID identity, immutable Trip/personal-owner context, exact C-collated name, managed positive safe-integer revision and timestamps. NULL owner is common; a Person owner is personal. `UNIQUE NULLS NOT DISTINCT(trip_id,owner_person_id,name)` separates ownership scopes while enforcing uniqueness within each. Empty/raw default, literal Other, case, whitespace, composed/decomposed Unicode and reserved JavaScript names remain distinct. Names are bounded to200 PostgreSQL characters, not UTF-8 bytes.

`packing_items.category_id` is non-null and uses a composite Trip/category FK with RESTRICT deletion. A guard enforces common→common and personal→same owner. Historical non-null owners on common items stay intact; `is_private` determines scope. `packing_category_assignments` stores common-category responsibility with a Trip/category FK, unique Person links and optional paired assignment-time/author provenance. Unknown historical provenance remains NULL; no actor/time is invented. Responsibility does not grant visibility or sharing.

FK lookup indexes cover item category, category owner, assignment Person and assignment author. Category physical deletion is unavailable. All exposed new tables have RLS and explicit raw privilege revocation for PUBLIC/anon/authenticated/service_role. The public coupled read is an invoker wrapper over a validating non-exposed definer entry. Function search paths and execute privileges are explicit.

## Classified migration and immutability

The preflight checks all item statuses and legacy assignment labels, length and Family/Person context. Unresolved values refuse the whole transaction. Categories are classified by `(Trip, is_private ? owner : NULL, raw label)`. Global legacy assignment labels map once to a common category, including assignment-only labels; they are never copied into private scopes.

Five exact item triggers are suspended only under bounded exclusive locks for relationship-only backfill: aggregate-child touch/freeze, item version, updated-at, audit and collection. The unchanged owner eligibility trigger stays enabled. All old trigger definitions/states and relevant function definitions are pinned first, every suspended trigger is restored before commit, and no blanket trigger/RLS disable or persistent bypass is introduced. The migration preserves old item columns, immutable Trash, Trip timestamps/revisions, audit/receipt bytes and every other old row. Final-source tests prove invalid-preflight and deliberately late failures roll back the entire schema/data/function/grant/trigger change.

The Person-history guard now includes empty category ownership and assignment-author references. A referenced Person cannot move to another Family and invalidate the new relations. Trip Family identity was already immutable and is preserved.

## Compatibility and transaction boundaries

V1 item/group writers keep their signatures and operation/receipt behavior. An item link trigger resolves the exact scoped category, retaining the existing Trip packing mutex. Existing item and category packet JSON fields are explicitly enumerated so future columns cannot silently leak into these strict contracts. Old receipts/digests are not rewritten. New private reorder history omits the new relationship field from the old row-image shape.

Normalized assignments are authoritative. The legacy label-keyed table is a derived compatibility mirror with a transactional write bridge in both directions. Unchanged links/provenance are preserved; effective additions require current eligible Trip travelers. Existing archived/ineligible responsibility can remain and be removed; a fresh addition cannot bypass eligibility. The legacy collection trigger defers to the normalized assignment change so the bridge does not duplicate its effects recursively.

A trusted category name change keeps category identity and assignments, updates only active compatibility labels/revisions, and synchronizes the common legacy assignment key. Trashed item facts remain unchanged. Actual Restore uses the original category ID, derives its current name before the version guard and returns the final row/revision. Same-scope collisions refuse atomically. No-op metadata changes do not churn rows/revisions/audits/root state.

Metadata tests deliberately use trusted rehearsal SQL with the planned mutex order, **not an enabled user save endpoint**. PostgreSQL obtains UPDATE row locks before row triggers; the next command must acquire the aggregate advisory lock, Trip row and packing-state row **before issuing any category/assignment UPDATE or DELETE**. Trigger acquisition alone is not a substitute. A demonstrated group/metadata wait proves the compatible order; the future authoring API still needs full original-observation, permission, conflict and receipt tests.

## Coupled authorized read

`get_family_trip_packing_with_categories_v1(uuid)` returns exactly `version,scope,collection_revision,packing,categories,item_categories,people`. Nested `packing` is the existing strict v1 packet. Authorized live item mappings and referenced category metadata are captured in the same stable statement snapshot. Arrays have deterministic UUID order. Category entries contain exact identity/name/revision/timestamp fields and assignment provenance. Person facts are limited to the referenced records, with contextual eligibility and guest status. No empty/hidden peer category dictionary, hidden sibling count or global Person enumeration is added.

The existing2,000 live-item bound and8MiB packet limits remain enforced. Current Family/Trip access, role-dependent MFA, revoked membership and lifecycle checks apply. RLS proof temporarily grants SELECT only inside a rolled-back test transaction; permanent raw access remains revoked. A recipient may see a category needed by an authorized shared item without gaining ownership or access to other personal categories.

## Recovery and exports

Root Trip Trash/restore retains category identity, assignment provenance and all item relationships; new relations freeze under a trashed Trip. Permanent category/Trip purges remain unavailable. Shared Person/catalog records and independent Journey stories are not cascaded away.

Family export now includes the normalized categories and assignments needed by its authorized item graph, including current empty common/own metadata and referenced visible personal categories. Hidden peer categories remain excluded. Historical compatibility text may differ from the current category name on a trashed row; its category ID plus category table preserve the exact relationship and history. Storage bytes are independently verified unchanged; the database migration does not transform, download or rewrite media.

## Qualification limits

Final server acceptance runs the76 existing assertions/cases and34 new category cases through real PostgreSQL roles and real local Auth/TOTP/PostgREST, plus concurrency and row/receipt/file preservation. The separate clean replay uses exact120 DDL with original owners/grants and only the static capability catalog; all user/domain rows are newly synthetic. Its SQL-role checks are not relabelled as real HTTP/MFA tests.

Existing function-lint/advisor warnings are compared with the original120 baseline; no new findings are accepted. Application/client/backend source and existing quality baselines remain unchanged, so their C2 proof is inherited explicitly, not reported as a fresh29,546-test/browser run. UI/SDK authoring and category receipts remain C2b/C2c work. No push/main merge, preview/production deployment, hosted migration/settings/billing, dependency upgrade, transformation/backfill, backup rewrite or ignored ETL work occurs here.

The PostgreSQL17 [ALTER TABLE trigger controls](https://www.postgresql.org/docs/17/sql-altertable.html), [constraints](https://www.postgresql.org/docs/17/ddl-constraints.html), Supabase [function security](https://supabase.com/docs/guides/database/functions) and [grants/RLS](https://supabase.com/docs/guides/api/securing-your-api) informed the implementation. The actual guarded receipts and source snapshots govern acceptance.

Function verification also pins execute ACLs, ownership, security mode, volatility and configuration for all19 functions; transactional privilege-drift detection is proved without persisting a grant.
