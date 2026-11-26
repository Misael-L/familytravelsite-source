# Q124 — Native phone packing registration and metadata lineage

18 November 2026. Incoming `14ff5f7f8c5eabdbf153fb6776bdb046f5574008`; registration implementation `a8b698f4eb075be727bb5b8bbefa85df799b57c1`. [Packet handoff](../../core-packing-registration-handoff.md). **Registration is verified. Five quality gates and release acceptance remain blocked.**

## Applied change

`client/scripts/feature-pairs.json` now lists the existing `MPackingItemRow.tsx` in the existing “Packing list: packingListModel” shared pair. That row already imports and uses the shared model. The unchanged checker now enforces this dependency. Shared feature count143 and phone-only count83 remain unchanged; no phone-only exception, new feature, runtime hook or allowance is added. No UI, save command, permission, original operation, queue, recovery or image path changes.

The real pair CLI fails before registration and passes after it from both client and scripts working directories. All15 existing guard tests pass, with no test changes or skips. A small fixture copies the real model, three desktop consumers and four phone consumers; the actual guard rejects a missing value import, a type-only replacement and removal of the registration. Original source files remain untouched. The initial relative-bin launch failed before running tests; the actual hoisted runner then passed15. Temporary verifier assertion mistakes were corrected before accepting proofs; no product or guard assertion was weakened.

## Runtime evidence and quality status

Every other incoming tracked file was byte-exact before qualification. Exhaustive tracked references and the preserved literal-glob owner audit establish that this registry is tooling metadata, not a runtime import or emitted asset. All3793 retained build outputs and128 declarations remain byte-exact. Q123's2529 disjoint passes/38 historical skips and build/compiler/artifact/size/format/warning receipts are reused at their original source scope; they were not rerun or relabelled as a Q124 build. The retained build source is `a7033ef64e9ff42fe59e3413d1584645dbbd2310`.

Four source guards freshly pass after the precise manifest source exception and qualification pointer update; all previous qualification rows remain intact. Only the pair command is reexecuted among the nine additional quality commands. The other eight scanner and relevant source inputs remain exact, so their previous statuses are retained: pages/layers/pairs/skips pass; strict/RTL/offline/dup/i18n fail. Strict remains636 diagnostics,467 allowance,172 excess across59files and2 stale entries. Duplication remains17619 lines across285files against zero allowance. Baselines, thresholds, suppressions, scanner code and exclusions are unchanged. This does not claim all CI, source-bound current-head build, browser, backend, writer or release acceptance.

## Two-file ownership proposal — not applied

The [combined patch](proposed-metadata-ownership.patch) changes only `client/scripts/rtl-baseline.json` and `client/scripts/i18n-keys.mjs`:

1. RTL: the prior local extraction at `c8875044399f8433a1c9571bf2c31887cc154351` moved the exact16 starfield matches from LoginPage into pages/login/starfield.ts, leaving7 in the parent. Move only that16 allowance:23 parent becomes7 parent plus16 child. Aggregate273 and the disable baseline remain unchanged. No class, geometry or layout changes. The extraction is not an ancestor of pinned upstream; do not describe it as an upstream regression.
2. i18n: `066f615055b3be74d6664a260358f9cd6a8f1a37` moved the same PermLabel implementation into the retained PluginBadges file. Its original/current fixed PERM_KEYS list has58 translated permissions and a raw unknown-code fallback. Native TREK separately has66 generated permissions; none is added to the retained list. Move only the existing retained dynamic-template allow-site to its actual owner, with an accurate separate rationale. The two native entries, total site count, implicit limit30 and every other scanner byte/allowance remain exact. Parsing/inverse-byte checks prove this scope without importing or executing the proposed scanner.

The combined patch passes `git apply --check`, but neither proposed file is applied. Their original/proposed hashes and source/AST/domain proofs are sealed. These are ownership corrections, not a current RTL/i18n pass; execute the real guards and their appropriate contracts only after approved application. Before applying, verify both original input hashes still match and re-review any intervening source changes.

**Why approval is still needed:** Q120's [automatic-review restriction](../retained-stylesheets-20261118/approval-block.json) rejected persistent quality-baseline changes even with unchanged aggregate allowance. Q121's later user approval covered the exact theme correction only. Q123 explicitly carries that boundary forward. This packet has no new automatic rejection; the new RTL/i18n proposal remains separate, concrete and unapplied pending specific approval. The registry change does not alter allowances and is already qualified.

## Collection sharing boundary — next implementation after ownership review

The available-users read moved from useCollectionSharing to collectionSharingState in `547c927cd5b22da8af25033d2f1a4177c2e9c09c`. That commit also adds intentional original-view/session/epoch/action locks, so reverting the whole extraction would discard repairs. A native collectionStore exists for authorized writes, but there is no current collectionRepo interface for this reader. Prefer moving only this online read behind a proper data-layer interface while preserving owner/open-collection/session/current-reply fences in the hook. Do not persist or reuse an invitable-person roster across accounts. No endpoint/schema change or new direct-API view exemption is proposed. Prove slow replies, account/collection switches, closure and save ownership before removing the old stale baseline entry. This read-only review is not an implementation or offline pass.

## Preservation, checkpoint and continuation

Preserve canonical151 migrations/370 source files/mixed index/README, all prior evidence seals, other checkouts and every logical snapshot/archive. No physical-sharing operation, backup/media/ETL access, runtime build, live database fixture, hosted CI, deployment, public mirror, transformation or production/settings/billing change is performed by Q124. iOS remains deferred; shared backend checkpoint remains8cc0fe3f.

After the bounded evidence commit, create the strict check-only source archive, then perform a normal private integration checkpoint push and verify remote integration/main/older branch heads. A check-only unbound archive proves source preservation, not deployment or overall quality acceptance. The publication copy may only fast-forward to the verified checkpoint. Save the new private baseline after verification.

The incoming temporary continuation pointer still names Q122 although Q123's actual next gate correctly says Q124. This packet followed Q123's latest handoff; correct both active continuation pointers to this document only after verified push. Do not edit the sealed Q123 history or repeat its completed runtime repair.

Next: obtain specific approval for the exact two-file ownership proposal, apply/qualify it with real guards if approved, then the bounded Collection data-layer repair. Remaining strict/duplication and target-specific backend/protection/source/preview gates stay open. Do not waive rules, increase budgets, drop tests or perform broad legacy-directory exclusions/deletions. Rebuild or broaden tests only if actual runtime/input changes or new unresolved failures justify it.

## Replay limits

Detailed raw local test output and full before snapshots remain in `/private/tmp/trek-core-packing-registration-20261118`. Review helpers require the recorded Git objects and installed toolchain, fixed original policy hashes, fresh staging directories and prior Q123 artifact evidence. Some are proposal/fixture preparation tools; do not execute mutation helpers inside sealed evidence. Source manifests and original UI can be recovered from the incoming Git pin. The sealed patch is review material until approved, not a production migration or executable release instruction.
