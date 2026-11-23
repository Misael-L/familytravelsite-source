# Quality Q4: packing protocol extraction

15 November 2026. Reviewed implementation `9db9f48a898f24963b931dee5610478c23801257` on `codex/trek-v5.1.4-family-reconcile`. Completes the [bounded packing coordinator packet](core-release-packing-size-packet.md).

## Change and invariants

`plannerCohortPacking.ts` falls from 1,029 to 994 wrapped lines. A 67-line `packingRetainedReceipt.ts` helper holds retained receipt dispatch and acknowledgement validation for base items, groups, categories, category lifecycle/item v2, aggregates and bags. It accepts only the existing owned readers' receipt methods and the original packet/scope. It creates no client, service, authorization state or permission.

The helper is synchronous and returns the selected existing Promise; the coordinator awaits it at the original point. The five eager schema parses and their priority, selected reader arguments and acknowledgement validator are unchanged. Reinserting the original dispatch makes the complete coordinator class match its original typed AST. All 53 other class members and the native value conversion match exactly. Permissions, session/source/layer checks, leases, transactions, original command/revision/operation identity, pending work, acknowledgement removal and canonical publication remain in the coordinator. No native JSX/CSS, backend, schema, qualification or scanner policy changes.

## Acceptance

All **2,441 affected regression tests** pass with zero pending cases. This includes 42 new protocol cases through the real transport and acknowledgement validators, with only RPC I/O mocked. They cover seven packet variants, visible/redacted/unknown receipts, wrong operations and contradictory/malformed proofs. Four new actual-coordinator tests retain the original queue row and native state when a pending receipt returns after source replacement, accepted actor A→B→A, layer A→B→A or disposal. Existing lost-reply, retry, permissions and recovery tests pass. All 292 Q3 planner cases still execute exactly once under the same names; their source files and fixtures remain exact.

The actor fixture uses `acceptSession`, the real repository transition API; merely changing its cached provider variable is not a session transition. The initial fixture error was corrected before acceptance, with no product logic change. A proposed browser service name also collided with an existing target. The ownership guard refused it before creating services; a read-only inventory established a unique name. Only the new empty staging data directory was recreated. No prior target was restarted, reset or removed.

Configured client typecheck passes. Scoped lint improves from 3 to 2 warnings, with no new diagnostic. Full formatting passes against the unchanged 2,137-entry baseline. All quality baselines and rules remain unchanged. The full size gate falls from **45 to 44 findings**, with no new failure path. Remaining findings are a release hold.

A fresh ordinary production build is bound to the reviewed source commit. The actual artifact scanner accepts the correct expected source and refuses missing/wrong source identities. Runtime artifacts change, so earlier browser proof is not substituted for a new run. Fresh desktop/phone runs pass 16 ordinary-reader checkpoints through real isolated GoTrue password/TOTP, PostgREST and RLS: startup, canonical Collection selection/reload, independent notes/description, stored 192×128 thumb and 1080×720 hero, and unavailable-cover placeholders. No page/API/gateway error or transformation attempt. Unrelated external attempts are blocked by the loopback proxy and counted in evidence, not claimed absent.

These browser paths test the new bundle's startup/import composition and ordinary readers. They do **not** exercise or qualify live hosted packing writes. Packet/retry behavior is covered by the real coordinator/transport unit consumers with SDK I/O fixtures. All source qualification flags remain empty. Image bytes are tiny synthetic boundary fixtures, not real Storage/CDN or independent backup restoration.

Three new owned service roles are stopped after acceptance. All 177 prior container states and 106 prior volume names remain exact; the final retained inventory is 180 containers and 107 volumes. The new one-shot initializer is auto-removed and only the new restore-bootstrap container is replaced during preparation. Existing source rows, 144 migration records, catalog definitions and 676 routines are preserved in the fresh copied fixture. Canonical 355 source/test inputs, 144 migrations/index, 12 native pins, backend carryover, three other checkouts and 145 earlier seals/9,986 members are unchanged.

Exactly four reviewed source rows are adopted: 376 upstream exceptions and 2,697 Family additions. All other rows and original/upstream history remain exact. Actual source/native/Git/carryover checks and the clean local publication companion/check-only archive must pass before sealing. An archive is not a real Worker/source binding.

## Next

[Remaining size and preservation review](core-release-size-preservation-packet.md). Classify all 44 findings and resolve their scope against preserved upstream, native and legacy contracts before selecting further changes. Do not turn the remaining count into an instruction to rewrite frozen frontend/carryover code.

Hosted ledger/API/engine/timezone/protection checks, independent database-plus-files restoration, real HTTPS writer/retry/retirement qualification and Worker/matching-source binding remain separate release requirements. No production/preview/main/push/remote publication, hosted SQL/settings/billing/schema/dependency change, backup/ETL/media or transformations.
