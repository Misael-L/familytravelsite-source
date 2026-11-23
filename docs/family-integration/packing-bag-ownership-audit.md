# U04-D1 — packing bag ownership and writer audit

Audited 12 November 2026 against application `2564275101e0af45d5909c2cf46f3f4fcabd2a52`, acceptance `762fea5af3e44ebf987915ca0f193f6223c62eb9`, upstream TREK5.1.2 `5cfc7a602a21598039668387f749f5a419e69bc9`, and the unchanged marked PostgreSQL17.11/Supabase schema125. This is an audit and a proposed implementation contract; no migration or runtime activation occurred.

## Existing model and actual authority

A bag is a Trip-owned physical container. `public.packing_items.bag_id` gives an item at most one current bag. `public.packing_bag_members` is the normalized set of People carrying that bag, not an item ACL. Neither Family nor native TREK has separate common/personal/shared bag ownership columns. Those privacy tiers belong to items. Adding another bag table or copying item privacy onto bags would introduce a second model without a witnessed requirement.

Current composite foreign keys already require items and bag members to reference a bag in the same Trip. Person assignment triggers require an active eligible Trip traveler, including eligible guests. Existing historical assignments remain references to their original People. Carrier changes must never change item owner, recipients, contributors, or item category.

The actual item writer uses current direct packing permission plus item visibility. A carrier alone cannot see or move a hidden personal item. A visible shared item with direct packing permission can currently be moved without changing its owner. Do not replace that policy with an invented owner-only rule or expand native controls to new rights without their own contract.

Private-inclusive bag and unassigned totals are intentionally shared aggregates, matching native TREK. This is an explicit aggregate disclosure, not a promise of statistical inference resistance: a one-item bag may reveal its aggregate weight. Do not return hidden item names, item IDs, unit weights, counts, or content through bag membership/command/receipt payloads. A stronger aggregate privacy policy would be a separate product decision.

## Native-to-Family trace

- `client/src/components/Packing/usePackingBags.ts` is shared by desktop and phone. Qualified reads use the stable packing publication, including authoritative bag and unassigned totals. Its four legacy management callbacks refuse before HTTP when a Family/saved owner is installed.
- Desktop `PackingListPanelBagSidebar.tsx` and `PackingListPanelBagModal.tsx` derive management availability from the separate group gate. Phone `MPackingListTab.tsx` passes that same gate to `MBagsSheet.tsx`. `useBagCardEditor.ts` converts kg input into integer grams; omission preserves a limit and explicit null clears it. Native markup and styles need no redesign.
- Existing native item editors can move an authorized visible item between existing bags through the accepted typed item command. New bag creation within those selectors remains gated. Bag CRUD is not necessary to make an existing-bag item move work.
- The disabled legacy `listHandler.ts:141` bag branch calls `family-backend/src/data/supabase/packing.ts` direct table helpers. Upsert/delete carry no original revision or operation UUID; member replacement is two requests, delete then insert. The members route returns `{bag}`, while the legacy native hook expects `{members}`. Those paths are not a qualified management implementation.
- Marked125 has revoked direct bag/member INSERT/UPDATE/DELETE, including service-role table grants. Current item RPC rejects `bag-create`. Existing tables/readers therefore do not provide an executable bag writer merely because controls exist.
- Native Nest `packing.service.ts:655` uses physical bag deletion; its original SQLite migration uses item `ON DELETE SET NULL`. Family deliberately strengthened those references to `RESTRICT`. Copying that server operation would discard Family recovery semantics. Carrier replacement in Nest is transactional, unlike the disabled Family two-request helper.

## Witnessed gaps and selected design

Keep the existing public tables and shared `family_auth.packing_command_receipts`. The latter already hosts typed item, group and category domains under one `(Trip, actor User, operation UUID)` namespace; creating a parallel receipt table would weaken cross-domain collision protection. Bag actions can reuse `target_id` with `category_id = null`, with additive action/result constraints and typed receipt dispatch. Historical receipt bodies remain immutable.

Add server-managed bag revision and paired Trash timestamp/Person. Preserve bag rows, carrier links and historical item references. Permanent purge stays unavailable. Initially refuse bag Trash if any live item references it, including a hidden one; return a generic dependency conflict without a hidden count or identity. Existing independent item Trash may continue referencing that inactive bag. Restore the bag before restoring such an item; bag restore does not revive items. Nonempty bag removal/unassignment and automatic reattachment need their own complete, authorized manifest contract, not a child loop or a hidden-owner rewrite.

Native membership is a carrier set, so there is no reason to delete/reinsert unchanged rows. Validate the entire requested set first; insert/remove only actual differences atomically. Newly added People must be current eligible travelers. Explicitly retained historical assignments need not be recreated or silently dropped. A carrier edit updates attributable load summaries, not stored item ownership or privacy.

A critical compatibility requirement is the current `family_auth.packing_snapshot(uuid)` use of `to_jsonb(b)`. New bag columns would leak into strict v1 bag objects and break v1/v2-coupled readers and saved formats. Replace that whole-row projection with the exact existing explicit fields; add a separate versioned bag observation/snapshot. Preserve current active-bag payloads and all stored v1/v2/v3 bytes. New write metadata is unnecessary for cold read-only packages, so this alone does not require a saved-format v4.

Local preflight found28 bags at audit time, including6 deliberately oversized legacy/test names; no empty names, negative ranks or non-hex colors. Hosted data was not inspected. Do not truncate, rename or discard those records to satisfy a new global maximum. Enforce new/changed names/colors conditionally and keep untouched legacy values; existing byte bounds still refuse oversized reads honestly. A hosted release requires its own non-mutating preflight and explicit handling of outliers.

## Proof and limits

Fresh marked125 SQL-role witnesses:28, using a newly issued synthetic Auth AAL2 claim set. They cover privacy/aggregate separation, raw-write refusal, existing typed moves/retries, same-Trip and eligible-carrier relationships, collection invalidation, historical item references and current recovery gaps. The privileged two-step replacement witness is an intentionally rolled-back structural hazard in a disabled path, not an enabled user exploit. All185 public/private application-history table hashes are exact before/after the witnesses.

Temporary relational/lifecycle model:19 cases, entirely rolled back. These prove proposed constraint/restore-order behavior, conditional legacy-value preservation and stale revisions; they do not qualify future production SQL/RLS/RPCs. Actual native hooks and desktop/phone bag surfaces:14 mocked cases, including saved read-only gates, retired callbacks/publications, aggregate weights and the strict-reader compatibility trap. Existing targeted regressions:71 passed. No actual bag HTTP/browser writer acceptance, full client rerun, new App/worker build or activation is claimed.

Read [the exact proposed contract](packing-bag-writer-contract.md), then [the database-only implementation packet](packing-bag-foundation-packet.md). The existing F15/S25 onboarding work remains the source of the bag backlog. Sharing/clone/templates/imports and Tours remain separate.

## Engineering references

Use database constraints for same-Trip identity and referential integrity; do not implement cross-table lifecycle predicates as CHECK queries. See [PostgreSQL17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html). Keep a single lock order and short transactions with no external calls; see [PostgreSQL17 locking](https://www.postgresql.org/docs/17/explicit-locking.html).

RLS and grants are separate controls. New private helpers must repeat current authorization and use restricted execution/search paths; authenticated public wrappers remain invokers. See [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database functions](https://supabase.com/docs/guides/database/functions). The [CLI v3 change](https://supabase.com/changelog/supabase-cli-v3) does not authorize an upgrade: this rehearsal retains CLI2.109.1 and PostgreSQL image17.11.0.003.
