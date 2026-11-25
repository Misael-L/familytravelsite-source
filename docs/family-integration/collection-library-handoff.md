# U04-F5c5a — Collection library prerequisite accepted locally

The C5 inventory found that the native handler still loads the entire legacy library, while the accepted C3 reads start at one Collection. Added the missing bounded root-index API, strict complete-library decoder/assembler and read-only SDK gateway. These are prerequisites; native Collection reader/writer/queue/Restore integration is **not complete** and controls remain gated.

## Validation

- 31 new real GoTrue/PostgREST cases cover complete paging, identical order keys, private/Family/global/archived/trashed visibility, wrong Family, expired/current/MFA sessions, count/content changes, stale/scoped cursors, media unavailability, actual1000-root overflow and response-byte overflow.
- 151 pinned Collection recovery/content/read/authoring business methods pass. Only the owned test support/database and existing declared fixture adaptations change; no assertions are dropped or permissions loosened.
- 43 strict decoder/complete-read/SDK cases and27 preserved input-normalizer tests pass on pinned backend Vitest4.1.11. The SDK HTTP transport is mocked; an additional two actual REST response decodes and one105-root complete-assembler case pass.
- Fresh local schema141→142 rehearsal preserves362,461 original rows across255 complete COPY projections, all141 historical statement arrays and all669 original function OIDs/definitions/owners/ACLs. Only one actual migration ledger row is added. Exactly three new functions: two private helpers and one public read wrapper. Existing indexes/constraints/policies/triggers/table/column/default grants remain exact. Scoped routine-security assertions pass on both tested and fresh copies; no hosted/CLI-advisor pass is claimed.
- Backend typecheck, scoped formatting, carryover command and all57 protection cases pass; the ordinary web build completes. Total312 checks:31 new DB +151 retained DB +70 backend +57 carryover +3 actual-response/complete-assembler checks. Three owned services are stopped, two volumes retained and126 prior service states remain exact. Final source/archive/evidence sealing is recorded in the acceptance receipt.

## Source and runtime

Canonical new migration/test files live under the App `supabase/migrations` and `supabase/tests`; exact review copies are under [collection-library/source](collection-library/source). The canonical App mixed index is preserved. The website checkout is the existing `codex/trek-v5.1.4-family-reconcile` branch. The contract is [collection-library-contract.md](collection-library-contract.md).

Only a new cold, network-none, no-published-port PostgreSQL copy and its owned Auth/REST services are used. Original source/backup/media/ETL bytes and previous service states remain protected. Private dumps, Auth sessions, passwords and API keys are not sealed as evidence. No Storage byte operation, transformation, hosted migration/settings/billing, preview/production deployment, push or main merge is performed.

The inherited qualified-source/native/history adoption holds remain. Do not change5.1.2 metadata pins merely to turn their checks green; native source is still the accepted5.1.4 code.

## Next: U04-F5c5b — coordinated native cohort

Continue [the native packet](collection-native-authoring-packet.md), using this bounded library reader rather than the old unbounded adapter. Finish strict C3/C4/C1 detail/membership/observed command/recovery contracts, native ID mapping, immutable original queue/session recovery and a reachable authorized Restore path together. Keep four transfer refusals and item-removal refusal until their complete flows qualify. Test native manual creation through a separately scoped Family command route, never by reopening the generic transfer route. Root metadata/cover authoring, labels/ratings/sharing, cross-library transfers and private media bytes remain separately scoped. Prove final ordinary built desktop/phone browser/PWA behavior before claiming activation.
