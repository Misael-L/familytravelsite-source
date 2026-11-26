# U04-C1a packing group database prerequisite — accepted locally

11 November2026. Continue on `codex/trek-v5.1.2-family-reconcile` at `/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2`. The accepted application remains `4700baace306159598b4d390c93a3abce12e6fb3`, pinned by `ce687d1865701ef18a50b016a2e93966b5bc9f15`; this packet changes no application/runtime/build/permission-control source. It completes the database part of U04-C1, not the whole native group cutover.

The local database now supports one atomic command for category explicit checked/un-checked state, category Trash, and clear-completed from the selected native view. Commands retain the exact original scope, collection, raw categories/status/visibility and complete UUID/revision/checked set. Hidden peer items are neither changed nor returned. Rows, partial counts, private-safe audits, state and one shared immutable operation receipt commit or roll back together. No-op groups preserve rows/versions. Exact retries cannot overwrite later edits; changed intent, stale sets, revocation and old parent lifecycles refuse. Existing individual Restore retains the same item/relationships after group Trash. Whole-group Restore, rename/assignees and other packing group domains remain separate.

Migration120 is `20261111201637_observed_trip_packing_groups.sql`, SHA-256 `99dcc3aa50af153ff245d70283e5b1ac0f6e7af97325cb3eb08bb485e79e09a6`. Reused existing facts/state/receipt history; no business table/column, RLS policy, index or new permission capability. Six functions were added; only the existing result-visibility and item-receipt dispatcher implementations were deliberately extended. All original function ACLs remain unchanged. The public wrappers are invokers; privileged private entry points repeat actual authorization. Item and group operations share the same original operation namespace and have separate typed receipt endpoints.

Validation:

- **76 actual local database cases pass**: all53 original packing item cases plus23 group cases. The installed reusable runner also completed with actual exit0. Real password/Auth/TOTP/PostgREST, role-dependent MFA refusal, direct/propose/deny and membership behavior, hidden-private sets, defaults/status selectors, stale/incomplete sets, no-op/exact retries, shared operation collisions, redacted receipts, second-row rollback, concurrent requests, parent recovery and demonstrated lock waits pass. A full2000-item group passes; oversized observations and unservable versions fail atomically.
- A forced late migration failure rolls back; the successful upgrade preserves all181 public/family_auth business-table row digests. All119 earlier migration sources remain byte-exact. The same existing marked local project is now recorded at120; iterative DDL was actually applied and verified before the local CLI history repair registered the reviewed source. No historical stack reset/downgrade occurred.
- Local database lint reports no errors or issues in the eight added/changed routines. Its16 unrelated warning-bearing routines retain their original definitions; none were suppressed or rewritten for this packet.
- Original populated desktop/phone fixture domain/audit graphs and retained file bytes verify unchanged. Every one of the11,815 prior tested application/runtime/unit inputs remains exact. The prior29,401-pass application qualification is retained; that unchanged suite and the old browser walk were **not rerun or claimed as fresh group UI acceptance**.
- Candidate source/native/history/carryover guards pass. Prior46 evidence seals/3,388 files remain verified. The final evidence includes exact canonical sources, original helper dependencies and process receipts, with no private keys/tokens, browser profiles or database row contents.

Repeat the **already-applied** database contract on a new output path:

```sh
python3 /Users/Misael/Desktop/FamilyTravelApp/supabase/tests/rehearse_packing_groups.py \
  --output /private/tmp/packing-group-recheck-UNIQUE
```

It verifies the reviewed120-migration chain/function identities before creating a new synthetic Family. It never applies, repairs, resets or downgrades SQL. Older119-only acceptance harnesses must continue refusing this newer chain; adapt a new scoped harness in the next packet rather than modifying sealed evidence. Raw canonical migration/test sources remain in the mixed FamilyTravelApp checkout alongside the earlier uncommitted modernization sources; this packet does not sweep them into a production-branch commit. The reviewed copies under `packing-group-database/` and their sealed hashes preserve this packet's complete new source in the scoped website documentation commit.

Read `packing-group-database-contract.md` for the complete RPC/selector/receipt rules. **Next: U04-C1b strict SDK, handler and retained group queue/recovery**, in `packing-group-writer-next-packet.md`; then U04-C1c actual native desktop/phone consumers and browser acceptance. Do not enable the legacy global group gate: rename, assignees, bags, sharing/contributors/clone and import/templates remain unqualified. Three database commands do not qualify every packing control.

No push/main merge, production/preview deployment, hosted schema/settings/billing/dependency change, image transformation/backfill, original backup/media or ignored ETL operation occurred. SQL mutations were limited to reviewed local DDL/history plus new guarded synthetic fixtures. Independent full/off-device restoration and incremental backup remain separate/unproved.
