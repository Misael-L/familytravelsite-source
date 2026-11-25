# U04-E — packing capability and milestone review

12 November2026. Qualified application `b50fbdc2c267249f339ada5e37c340927ed27798`, documentation acceptance `38229193e22b02bcac3590ad7e7fcbd4a9ce2a02`, branch `codex/trek-v5.1.2-family-reconcile`. This is a read-only capability audit. Application/backend source, qualified pin, schema, native layouts and activation flags are unchanged.

## Decision

Repair native packing export ownership and bag labels next. The 25-action [inventory](packing-capability-inventory.json) shows the item/category/bag foundation and named recovery paths are locally accepted, while import/templates/clone/sharing/contributor authoring remain separately blocked. The missing sections are not evidence that their tables are all absent: existing templates, recipients and contributors are present, but the old writers do not satisfy the current operation/privacy/recovery contracts.

The selected [U04-F1 export repair](packing-export-ownership-repair-packet.md) fixes a reachable behavior before expanding the feature set. It needs a read-only connector change and tests, not a new Supabase table. Do not start bulk import or reopen a generic group gate as part of that repair.

## Supported foundation and exact boundaries

The inherited D2c3b evidence qualifies coherent Common/Personal actor-visible reads, authoritative bag weights, explicit common/personal item creates and scalar edits, checked/partial counts, complete item reorder, item Trash/owned-page restore, empty identity categories, names/Family Person assignees, complete category-lane reorder, observed category completion/clear-completed, aggregate list Trash/restore, dedicated bag metadata/carriers and item-bag moves. Empty-only bag Trash is deliberate; deleting a nonempty bag is not implemented by silently unassigning items. Named terminal recovery, preserved originals and separately confirmed restore replacement are accepted locally.

All writable operations keep current session/MFA, Family membership, Person identity, source/Trip/layer/lifecycle and direct `trip.packing.manage` checks. Denied/proposal-only/read-only states cannot borrow another domain’s authority. Saved packing has its existing admitted read leases and v1/v2/v3 formats; the strict128 native qualification does not expand complete saved-trip admission. The generic group gate remains closed under a Family port even when dedicated item/group/category/bag controls are present.

No new browser walkthrough, full client run or live SDK/Auth write suite was executed for this unchanged-runtime audit. The preceding2,520 client/66 backend/32 SDK/28 App observations remain inherited evidence. Read their [sealed handoff](packing-native-recovery-handoff.md) for exact limits rather than treating every feature in this report as globally released.

## Blocked operations and why the old adapters cannot simply be enabled

- **Templates:** native list/apply/save callbacks are gated. Local128 revokes old `apply_packing_template` and `save_packing_template_from_trip`. The old apply handler refuses Personal and returns only a count where the native frontend expects created items. A future command needs current template/version and destination observations, complete result identities, retries and recovery. Template authoring has separate `family.templates.manage` authority.
- **Template administration:** existing Family list/upsert/delete functions remain a separate legacy capability; their internal administrative permissions are not newly qualified here. `packing_templates` has no revision or Trash columns, and its old delete lifecycle must not be presented as modern recoverable storage. Preserve it until a separately designed transition; do not enable Trip template features through it.
- **Bulk import:** text/CSV/Markdown parsing exists. The old Family handler loops raw upserts, can partially succeed, and has no original operation/complete-result contract. An aggregate import requires its own exact SQL/API design; a loop of supported item commands is not an atomic import.
- **Clone:** native TREK copies an item into a personal list. The old Family handler keeps a common source common. A future personal-copy operation must deliberately assign the new owner/category and identity; the current gate prevents that semantic mismatch.
- **Sharing:** recipient relations already exist, but the adapter changes item privacy/owner, deletes recipients and inserts them in separate requests. Those writes are revoked on local128. A future privacy transition needs atomicity, ownership/eligibility, versioned observations, disclosure rules and recoverable intent.
- **Contributors:** responsibility is distinct from visibility. The relation exists, while raw DML and native callbacks remain gated. Self join/leave, changes to another Person, permission boundaries and retry/recovery need an explicit command contract.
- **Defaults:** unobserved `ensure_packing_defaults` is revoked. Explicit list/item creation is available; do not revive silent placeholder/default writes.

The broad cohort intercepts legacy writes before the older list handler with `planner_writer_not_cut_over`; direct legacy packing-handler tests independently retain their narrower refusal. Raw `packing_items`, bags, recipient/contributor and normalized category DML is revoked for authenticated callers. Current typed RPC execute grants are authenticated-only, with business authorization in their checked entries. Catalog inspection proves the effective grants/definitions; it is not a new dynamic RLS/permission rehearsal.

## Reproduced export defects

The actual [native export hook](../../client/src/components/Packing/usePackingExport.ts) reads `useAddonStore.bagTracking` instead of the Family-owned packing publication. Under a qualified Family port, `usePackingBagTracking` reports bags available while that global flag remains false. CSV therefore omits the bag label shown in the UI, online and offline. Print uses the same lookup and can omit its bag metadata too. Ordinary TREK’s intentional optional bag fallback must be preserved outside the Family owner.

The same hook has no originating read-owner fence around output. When CSV/print waits for optional bag lookup and the Trip/session is replaced, lookup rejection is swallowed into `noBag`; the old download/HTML can still finish. Already-open print HTML also remains stored through a Trip replacement. Fresh probes reproduce both delayed CSV/print and retained print state. The delayed probes explicitly enable and hold the native optional bag lookup; the already-open print probe uses the normal global-off state. This is an ownership gap at the output boundary; it does not prove unauthorized server reads, a database mutation or an observed cross-account browser exploit. Treat it as a release blocker until the owner/context transitions are qualified.

Five deliberately labelled current-behavior witnesses reproduce the two missing-label cases and three stale-output cases. Their green audit result records the defect, not desired regression behavior. The repair must replace those expectations with preserved labels and zero stale output, while retaining ordinary TREK’s existing fallback tests. The Common Markdown witness also confirms that an ordinary visible export does not include the personal item supplied in the same publication.

## Fresh proof and preservation

33 actual-module mocked contract probes pass:28 healthy boundary witnesses and5 explicitly reproduced defects. Ten legacy native write routes are refused by the actual composed cohort before legacy writes, RPC or queue effects; native template/import and sharing/clone/contributor callbacks cannot borrow bag or category authority, including retired callbacks. Read-only and ordinary no-Family personal-template call shapes are checked. These are local mocked-module tests, not33 live database/browser cases.

284 relevant existing assertions in13 files pass, including desktop/phone native controls, item/category/group/bag, template/import/native export formatting, store guards and virtual effects. Four actual source/native/history/carryover guards and86 adversarial cases pass. The unchanged qualified runtime keeps its previously configured type/build acceptance; no fresh full type/build claim is needed for this documentation/probe packet.

Actual marked local128 catalog inspection uses explicit read-only transactions:15 packing relations,126 packing routines and20 effective-grant assertions. No Auth account, fixture, business row, grant, function, schema or hosted service was changed. Final preservation rechecks every frozen table digest, application source, canonical sources/index and previous evidence/seals. The final qualification receipt records the actual counts and commit.

Run the saved probes with installed Node24 on PATH:

```sh
python3 docs/family-integration/packing-capability-audit/run.py --output /private/tmp/family-packing-capabilities-repro-20261112
```

The destination must be new. The runner checks the exact qualified source, copies only the external test template/config into its own output folder and runs against actual repository modules. It never resets a database, imports fixtures or writes application source. The current-behavior witnesses intentionally require the accepted pre-repair runtime; they must not be relabelled as post-repair correctness tests.

No SQL/settings/billing, dependencies/images, push/main merge, preview/production deployment, media/transformation, backup or ignored ETL work. Independent full/off-device restore and incremental backup remain separate work. Continue only [U04-F1](packing-export-ownership-repair-packet.md); revisit remaining feature implementation after that repair.
