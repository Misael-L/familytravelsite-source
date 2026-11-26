# U04-D2a — observed bag database/read foundation

Prerequisites: [D1 audit](packing-bag-ownership-audit.md), [exact proposed contract](packing-bag-writer-contract.md), [D1 acceptance](packing-bag-ownership-audit-handoff.md), current qualification and unchanged strict125 guard. This is the next concrete implementation packet. It authorizes a new guarded local rehearsal, not hosted migration or native activation.

## Sources and permitted work

Continue the isolated web checkout `/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2`, branch `codex/trek-v5.1.2-family-reconcile`. Runtime remains application `2564275101e0af45d5909c2cf46f3f4fcabd2a52`. Canonical SQL/tests are under `/Users/Misael/Desktop/FamilyTravelApp/supabase/{migrations,tests}`; do not add web `supabase/migrations`. Keep the canonical mixed Git index exact. Web work in this phase is supporting documentation/evidence only; runtime, native layouts, SDK/queue parsers, image paths and activation flags remain exact.

Read current migration119 item commands,122 categories,123 category lifecycle,124 category-bound items and125 category aggregates. Inspect live definitions on the marked125 stack, existing private shared receipts/result-visibility/typed dispatch and all item create/move/restore paths. Capture sources and existing bag/receipt facts before creating a new target. Use the current files as requirements, not as a reason to copy unsafe legacy raw writers.

Retain CLI2.109.1 and PostgreSQL image17.11.0.003. Discover actual CLI command syntax with `--help`. Create the canonical additive migration with the CLI's `migration new` workflow; do not invent a timestamp or edit any of the125 prefix migrations. Use a fresh, unlinked, marked126 project/stage with unused ports (planned55831/55832 only if free). Refuse occupied ports; never reset, relink, upgrade or repoint retained120/122/123/124/125. Establish the new marker/ledger/function/schema/security guard before testing and never weaken the old125 guard.

## Coherent implementation

1. Add bag revision and paired recoverable Trash fields, conditional new-value validation and lifecycle/identity protection. Preserve existing public bag/member/item relationships and eligible-traveler semantics. Backfill only the new metadata defaults. Prove every old bag column and old receipt is preserved on upgrade. Oversized legacy/test names must survive; no truncation, invisible differentiation or forced cleanup.
2. Add the five strict read/observation/Trash-page/execute/receipt functions named in the contract. Reuse the shared packing receipt table and namespace; add bag action/result constraints with no old-row rewrite. Maintain current permission, MFA, root-lock, result-visibility and cross-domain idempotency semantics. Validate full carrier sets then apply differences in one transaction. No direct table DML grant or service-key browser bypass.
3. Fix the old snapshot's bag whole-row projection before columns can reach old readers. Keep exact old bag keys and active-only selection. New bag snapshots/observations carry writer metadata separately. Add active-parent RLS/lookup protections without recursive policies. Preserve existing v1/v2 coupled parsers and all saved-format bytes.
4. Support create, metadata update, exact carrier replacement, Trash when no live items remain and explicit bag restore. Nonempty removal stays unsupported. Preserve historical carrier/item references and never change private item ownership/ACLs through a bag action. A restored bag does not revive items.
5. Update every relevant existing item/category create, move and restore path to reject assignment or revival into an inactive bag. Test independent item Trash plus bag Trash/restore ordering, and category-batch restore when a referenced bag was trashed meanwhile. Keep original typed receipts and old active-bag behavior. Do not silently clear/reassign a bag to make restore succeed.

## Required proof

- Clean126 install and upgrade from the exact125 prefix with representative existing data, including a deliberately oversized legacy name, duplicate names/ranks, private/shared/common items and existing receipts. Old columns must compare exactly after subtracting only the new bag metadata fields.
- Actual Auth/TOTP AAL2 and lower-assurance/outsider/removed-member/propose-only witnesses. Shared carrier membership must not become access authority. Hidden item content never appears in a bag command/receipt; private-inclusive weights remain intentionally authorized aggregates.
- Valid/invalid field bounds and omission/null semantics; active quota versus paginated history; archived/removed/guest carriers; differential replacement; no-op; stale bag/collection/root/source/Person; same-Trip constraints; all assignment/restore entry paths; nonempty refusal and dependency errors.
- Transaction rollback on carrier failure, shared-root lock races with item moves/membership changes/Trip recovery, exact retries and changed-domain UUID collisions across every existing packing API. Genuine committed reply loss followed by typed receipt recovery; unknown is not success and redaction grants no authority.
- Exact old JSON-key/strict-parser witnesses, coupled canonical reads, row/security/grant/receipt preservation and source hashes. The D1 temporary model is guidance, not a substitute for actual126 SQL/RLS/concurrency proofs.
- Preserve every pre-existing125 row and all older stacks/evidence; only fresh synthetic126 fixtures may change. Do not count draft/repeated tests twice. No full client/App/browser rebuild is needed for this DB-only phase when all runtime inputs stay exact.

Completion: reviewed canonical migration, strict126 guard and exact source/schema/API contract; passing real local database/upgrade/security/concurrency/recovery tests; immutable sanitized evidence; unchanged application source/native activation and canonical mixed index. Then produce D2b typed SDK/cohort/retained-queue/read-only compatibility work, followed by native desktop/phone activation and actual App/worker browser qualification. No UI enablement from this database packet alone.

No push/main merge/deploy, hosted SQL/settings/billing, dependency/image upgrade, transformations/backfill, backup rewrite or ignored ETL work. Independent full-project database-plus-files/off-device recovery and incremental backups remain separate outstanding operations.

## Accepted local outcome —12 November2026

D2a is complete locally on guarded126. Read [accepted handoff](packing-bag-foundation-handoff.md) and [exact implemented contract](packing-bag-foundation-contract.md). The next handoff is [D2b SDK/publication/retained queue](packing-bag-sdk-packet.md). Application/native management, hosted schema and live sites remain unchanged. Original packet requirements above remain the review record.
