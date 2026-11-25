# Quality Q5: resolve remaining size findings against preservation contracts

**Completed locally, 15 November 2026.** [Q5 acceptance](core-quality-preservation-handoff.md) and [all 44 findings/decisions](core-size-preservation-review.md). No application or policy edits. **Next: [Costs test decomposition](core-release-costs-tests-packet.md)**; do not rerun this completed review.


Prerequisites: [Q4 local acceptance](core-quality-packing-handoff.md), clean integration/publication checkouts and current preservation baseline. Keep the existing TREK 5.1.4 pin and integration branch. Q1–Q4 are complete; do not repeat source merges, implementations or browser/database fixtures.

## Purpose

The full size gate still reports 44 findings, many in retained legacy or upstream/native sources. Earlier packets require preserving native presentation and complete backend carryover. A size failure does not authorize altering those sources. Establish one finite, evidence-backed release-quality plan before more mechanical refactoring.

## Read-only investigation and permitted files

1. Re-run the actual size check and record each finding's path, measured count, limit/baseline and reason. Match the Q4 list; investigate any new difference. Do not use `--update`, change a rule, compress a file, add an exclusion or inflate an allowance.
2. For every finding, check exact current/qualified/upstream identities, native presentation pins and the complete carryover inventory. Distinguish active Family adapters, test-only code, active native/upstream code and retained legacy source. Trace installed imports, aliases, dynamic imports and build reachability before calling code unused. A substring search or absence from one browser walk is insufficient proof.
3. Describe the concrete conflict where preservation and quality requirements overlap. Prefer compatible adapter-only extractions or test-only decomposition when they genuinely fix a finding. For retained/upstream/native code, explain valid options and their tradeoffs without silently changing provenance, UI, preserved source or gate policy. Any proposed adoption/retention-policy change needs a concrete reviewed scope; this packet authorizes a proposal, not its implementation.
4. Group the remaining findings into a small ordered set of coherent execution packets with actual permitted files, prerequisites, representative regression commands and completion criteria. Choose the next compatible repair or identify the exact decision required if none is compatible. Preserve the 292-case planner inventory, packing protocol tests, current source capabilities and operational release holds. Do not promise a zero count by treating old unproved/unreachable code as exempt.

Deliver a concise repository Markdown inventory/decision record plus an executable next packet. Changes are limited to those documents and, if needed, private read-only analysis tools. No application/test/backend/schema/quality baseline/source qualification change is authorized by this review. Preserve all previous hashes/seals/index/other worktrees/services. Run relevant documentation/source/native/Git/carryover checks; update the clean local publication companion/check-only archive if committing repository documentation. No new browser/database services or repeated heavy backup work are needed for a source-only inventory.

## Release boundaries

Remaining size work is only one release requirement. Hosted ledger/API/engine/timezone/protection checks, independent database-plus-files restoration, actual HTTPS original writer/retry/retirement acceptance and real Worker/matching-source publication remain separate. No production/preview/main/push/hosted SQL/settings/billing/schema/dependencies, backups/media/ETL or image transformations. Do not weaken a source or quality contract to make the checklist green.
