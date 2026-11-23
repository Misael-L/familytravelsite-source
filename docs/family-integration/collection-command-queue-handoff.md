# Historical foundation — C5b2b3 recovery qualification is current

The cancellation and recovery prerequisites are accepted locally; see [current recovery handoff](collection-recovery-qualification-handoff.md). Next is coordinated ordinary native binding and final-artifact browser/PWA acceptance. The original acceptance history follows.

# Historical C5b2b1 foundation — C5b2b2 cancellation repair is current

The never-prepared cancellation gap described below is repaired locally; see [current cancellation acceptance](collection-request-cancellation-handoff.md). The original foundation acceptance remains recorded here. Next is full recovery qualification, then coordinated ordinary native activation.

# C5b2b1 — durable Collection queue/recovery foundation

Implemented: exact persisted preparation requests and server originals, an explicit Collection command coordinator, generic replay/discard protection and a shared Family recovery boundary. Complete C5b2b acceptance and ordinary activation remain blocked by the demonstrated never-prepared cancellation gap. Do not describe this as a complete native cutover.

## Final validation

- 353 affected client tests, including36 new mocked command/device/recovery cases and8 real SDK/Auth/REST cases. The latter cover manual saves, actual lost prepare/execute replies, fresh-session prepared cancellation, reference/materialize/edit/status/order, item identity/history-preserving Trash/Restore and root Restore through the mounted recovery component. One test explicitly demonstrates safe unknown retention for an old unprepared request; it is a diagnosed API gap, not cancellation acceptance.
- 182 retained real database cases (31 library plus151 recovery/content/read/authoring),9 fixture guards and63 unchanged backend carryover guards. Total607 behavioral/source checks; seven publication guards are separate.
- Both typechecks and ordinary web build, scoped formatting and lint (zero errors/three advisories, no rule changes). Only two literal guard lines change in the inherited shared queue files; their pre-existing whole-file formatting is not rewritten.
- A fresh pristine restore preserves362,462 rows/255 COPY projections/142 ledger arrays,672 routine definitions/owners/ACLs and checked schema/grant facts.33 role/config and22 membership-option records match; internal OIDs differ after logical restore. Canonical347 sources/mixed index,124 earlier seals/8,663 members,12 protected layouts and all unrelated website bytes remain exact.
- Three owned services stopped, all138 earlier service states and93 previous volume names preserved. No new migration/API, hosted SQL/settings/billing, preview/production deployment, main/remote push, backup/media/ETL or transformation change. Ordinary native handlers/forms/removal remain gated.

Test isolation note: database authorization regressions intentionally revoke fixture sessions/membership. The final SDK run uses a fresh synthetic Family/account AFTER those regressions; the earlier overlapping attempt's transient403 results were not counted as acceptance. Seed titles are unique for repeatable airline fixtures. Private JWTs/configuration/dumps/source rows are not included in evidence.

## Next required repair

Read collection-command-queue-contract.md and execute collection-unprepared-cancellation-packet.md (C5b2b2) before activation. Add a database-authoritative exact-request cancellation/tombstone for a retained request that never prepared. It must fence a delayed prepare under the same actor/operation lock and truthfully return cancellation or the actual winning commit. A fresh session cannot safely invent an original or replay preparation under its predecessor's identity. The current coordinator records cancel and preserves unknown work; it never lies about cancellation or discards that intent.

After the repair, finish recovery paging/history/lifetime acceptance and C5b2c coordinated binding of native reads, BOTH membership consumers, forms/status/order/removal/Restore. Preserve nullable-owner compatibility states, actual Family permission flags, stored hero/thumbnail variants and final-artifact desktop/phone/PWA checks. Source-adoption and hosted-readiness holds remain closed; independent DB-plus-Storage disaster recovery remains unproved.
