# U04-D1 — bag ownership/writer audit accepted locally

12 November2026. Separate branch `codex/trek-v5.1.2-family-reconcile`, checkout `/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2`. Application remains `2564275101e0af45d5909c2cf46f3f4fcabd2a52`, preceding acceptance `762fea5af3e44ebf987915ca0f193f6223c62eb9`; upstream pinned TREK5.1.2. This packet changes documentation/audit harnesses only. Native bag management stays gated.

## Findings and decision

Reuse existing normalized Trip bags, carrier memberships, item bag references and the shared packing receipt table. Carriers are not privacy grants. Current typed item moves already work under existing visibility plus direct permission; a carrier cannot move a hidden personal item. Keep private-inclusive authoritative totals as intentional aggregate disclosure without exposing hidden item content.

Bag management lacks observed revisions, a supported bag command/receipt domain and recoverable lifecycle. Disabled legacy raw writes are denied by current grants; the old members adapter also has a response-shape mismatch and non-atomic replacement. Existing RESTRICT references deliberately retain previously trashed items. The selected next foundation adds bag revision/Trash metadata and transactional typed commands; no second public bag model or parallel receipt store is needed.

First qualify create/edit, differential carrier sets, Trash with no live item references and explicit bag restore. Nonempty removal is a separate aggregate contract, so it cannot silently unassign another person's hidden items. Preserve historical links; restore an inactive bag before its dependent item, and never revive items as a side effect of bag restore.

Protect compatibility before adding columns: the old snapshot serializes entire bag rows, and existing strict parsers reject the extra lifecycle fields. Keep its explicit old shape and add separate writer observations. Preserve existing saved v1/v2/v3 bytes and native presentation. Six oversized local legacy/test bag names must survive unchanged; apply new-value bounds without destructive cleanup. Hosted data was not inspected.

## Actual fresh proof

- **28** actual marked125 SQL-role witnesses, using a newly issued synthetic Auth AAL2 claim set. All witness changes rolled back; before/after hashes match across all185 public/private application-history tables.
- **19** temporary relational/lifecycle model cases, rolled back. These demonstrate proposed constraints, parent restore ordering and unchanged legacy-value preservation; they do not prove a future migration, RPC/RLS, HTTP or concurrency implementation.
- **14** actual native hook/desktop/phone bag-surface probes with mocked qualified publications, including management refusal, authoritative totals, saved read-only gates, retired callbacks and old-parser compatibility.
- **71** relevant existing regressions passed. Shared dependencies were built before native tests. Repeated harness verification is not added to these counts.

The final audit harness is reproduced from a fresh output directory using its private synthetic fixture. It rejects hosted/unmarked endpoints, symlinks and output overwrite, and retains the exact125 guard. No runtime source, native markup/style, dependency or schema changed. Current full client/type/build/browser and80 adversarial source-guard acceptance are inherited unchanged, not recounted as fresh. The fresh source/native/Git/carryover guards and full preservation report are in the sealed evidence.

Superseded fixture/import/test-assumption faults are excluded. The actual SQL showed visible shared items with direct permission can move; the accepted witnesses follow that existing policy rather than assuming owner-only editing. The native late-callback probe distinguishes forbidden writes from a legitimate ordinary read fallback after owner release.

## Continue

Read [audit](packing-bag-ownership-audit.md), [exact contract](packing-bag-writer-contract.md), then [D2a local database/read foundation](packing-bag-foundation-packet.md). D2a is the new handoff. It must use a new guarded126 target without repointing125; only after database acceptance should SDK/queue and native browser activation follow.

Preservation verifies all pre-existing125 rows across185 tables, retained120/122/123/124, all64 prior seals/4,762 sealed members and7,874 evidence files. The canonical mixed Git index is exact; the new synthetic fixture is intentional.

No push/main merge/deploy, hosted SQL/settings/billing, dependency/image upgrade, transformation/backfill, backup rewrite or ignored ETL work. Independent full-project database-plus-files/off-device restoration and incremental backups remain separate unproved work. Production and preview are unchanged.
