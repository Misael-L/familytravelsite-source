# Q122 — Remaining CI quality inventory and type-only refusal-helper repair

18 November 2026. Incoming `d7bd79fa7c7e7d76a3e4d4ba887d7af3200c76f5`; five-line implementation `76984b74d9d34207bd1be57088a14e3f1fbbda91`; source-bound fixture build `f99266c7205668c58ecd934627ba110512f7dadf`. [Packet handoff](../../core-ci-quality-handoff.md). **The bounded repair passes preservation checks; full quality and release acceptance remain blocked.**

## What the nine real checks found

All nine installed commands were executed in check mode, with unchanged scripts, policies, thresholds, exclusions, suppressions and128 fixed declarations. Page pattern, layering and skip discipline pass. Strict typing, RTL, offline access, duplication, desktop/phone pairs and i18n keys fail. Rechecking after the repair preserves all eight other commands' failure output exactly. These are measured results, not missing checks inferred from a screenshot.

- Strict:701→637 total diagnostics against unchanged467 allowance. The repaired group removes64 diagnostics with no new strict failures. Remaining per-file excess is173 across60 files; two stale baseline entries account for3 unused allowance. Existing backend diagnostics and test-fixture typing remain explicit. Do not add frozen diagnostics to the exemption list or hide them through ambient declarations/assertions.
- RTL: the extracted native Login starfield has16 physical-side findings while the parent retains23 allowance for7 current findings; total273/273 and12 marked lines remain unchanged. This appears to be ownership metadata left behind by extraction; prove source history before proposing its exact correction. No baseline edit was applied.
- Offline: collectionSharingState imports the API while useCollectionSharing retains the old list entry. Both146/146 totals match, but ownership and the appropriate repo/store boundary need review. Prefer a proper data-layer boundary over granting a new view bypass; do not reintroduce unused API imports to satisfy the old entry.
- Pairs: extracted native MPackingItemRow has no registration. Audit its shared packing hooks and parent pairing before declaring it a new pair or phone-only fragment; do not add a blanket exemption merely to silence the check.
- i18n: the plugin-permission template moved into retained PluginBadges, while the bounded dynamic-key record still names AdminPluginsPanel. The template reaches58 catalog keys against the ordinary30 limit. Prove the same bounded permission domain before relocating metadata; do not broaden wildcard acceptance or the limit.
- Duplication:17,619 reported lines across285 files, with zero allowance.323 unique copied-block pairs comprise201 crossing the retained-copy path boundary,77 within it and45 outside it. This is a path-prefix classification, **not proof that any file is unused**. Audit real runtime/type/test/tool ownership before choosing removal or shared-code extraction. Do not start285 independent edits, mass-delete the retained copy, delete tests, exclude a directory or expand a duplication budget.

The branch's hosted workflow is manual workflow_dispatch; it was not invoked. These local client commands apply to code changes under the workflow's classifier. Server/shared/coverage/end-to-end and hosted branch-protection acceptance remain separate; there is no fabricated ci-ok or hosted pass.

## The completed repair

Five existing private throwing helpers now have explicit callable variable types. TypeScript consequently recognizes terminating calls when narrowing checked values. Function bodies, statement order, exceptions, caps, locks, identities, session fences, queue/recovery behavior and all other runtime source remain intact:

- creationTerminalSettlement:7→0 strict diagnostics.
- packingBagDependency:23→0.
- packingDependencyPair:5→0.
- privateFileMemory:9→0.
- publicVariantCache:21→1. Its remaining response.body issue crosses the existing responseLength validation boundary; it is not solved with a non-null assertion or a fake type promise.

Each before/after module transpiles to identical JavaScript with the installed compiler. All209 existing focused mocked cases match exactly before/after. The separate unchanged80-suite cohort retains2316passes/0failures/38historical skips, totaling2525 disjoint passed cases. No tests, assertions, fixtures, mocks, timeouts, coverage or skip declarations change. The one existing source-generated UUID test title is narrowly checked; other identities/outcomes/multiplicities stay exact. The35 skipped declaration sites counted by lint:skips expand into38 skipped cases in this cohort; neither figure is a new skip or a claim that those scenarios are covered.

Fresh ordinary compiler and build pass. Four source guards and correct/wrong/missing-source artifact controls pass. All3793 output paths match Q121; only sourceCommit configuration changes. All other3792 files, including all JS/CSS, service-worker/cache and compressed assets, are byte-exact. Size0, format0 unlisted failures with2134 allowance entries, warnings src3418/3418,tests2859/2859,suppressed83/83,complexity218/218,length130/130. **Those passing gates do not waive the six failing additional gates.**

The temporary verification helper initially refused one stale historical formatted-source hash before launching any quality command. That pin was advanced only to this exact qualified type-only file hash, with the same11 source plus128 declaration inputs; the actual gate implementation/rules/baselines were untouched. The adjustment and failed-precondition reason are retained.

## Preservation and checkpoint

Only five type annotations and their existing source-provenance rows change application source. All policies/baselines, all native presentation and tests, canonical151 migrations/370 sources/mixed index/README and earlier seals remain. Q122 deletes no source. A fresh isolated APFS probe plus full Git/blob/path/byte/mode/owner/mtime/flag/xattr/ACL checks allowed physical sharing between the verified Q120/Q121 archive trees; all logical files remain, with only physical inode/ctime changes permitted. No backup, media, ETL, evidence, source or archive was discarded.

Strict check-only archive and the normal private integration checkpoint follow. No main merge, preview/production deployment, hosted Supabase schema/settings/billing, public source publication, image transformation, backup or ignored ETL action occurs. iOS remains deferred; shared backend source checkpoint stays8cc0fe3f. A preserved source archive is not quality/release acceptance or an independent database restore.

## Next bounded packet — strict public-image response contract

Start from the final verified private checkpoint and `/private/tmp/trek-core-ci-quality-20261118/next-baseline-private.json` after the push. Preserve all prior receipts, source archives and canonical mixed source/index.

1. Inspect publicVariantCache's responseLength/body boundary and its remaining TS18047. Keep the existing HTTP/status/type/length/body validation, source/recipe/role/byte/dimension caps, locking, cancellation and retirement behavior. Use a validated reader/stream value whose type reflects the actual check; no non-null assertion, any, ignore directive, new policy exception, transformation fallback or added provider path.
2. Permitted application boundary is publicVariantCache plus its existing mocked test only if a meaningful new case is needed, with their precise provenance rows. Do not mix in other runtime, native layout, frozen backend or governance changes. A changed runtime emission requires explicit before/after behavior and generated-artifact review rather than a false byte-identity claim.
3. Run the existing209 focused and2316 core regressions, retaining38 historical skips; compare case identities/outcomes. Run ordinary and strict compiler checks plus source/build/artifact and relevant size/format/warning checks. Completion means this module has zero strict diagnostics, with no new diagnostics elsewhere and no runtime admission change. The remaining gate findings stay explicit.
4. Then review the relocation/registration lineage for RTL/offline/pairs/i18n and prepare exact bounded fixes. Any further persistent quality-baseline edit exceeds Q121's narrow theme approval and needs its own concrete reviewed scope; do not treat that approval as permission for budget expansion or scanner weakening.
5. Before undertaking broad duplicate-code refactors, audit reported pairs against actual entry/type/test/tool consumers and current native/Family contracts. Prefer verified obsolete-island retirement or a coherent shared boundary; preserve every supported feature, native layout, media variant and effective permission/session/queue contract. Architecture decisions precede bulk edits. Keep hosted protection/schema/source/browser readiness as separate release gates.

## Evidence and replay limits

Raw before/after compiler and detector logs remain in `/private/tmp/trek-core-ci-quality-20261118`; the evidence stores counts, pins, hashes and bounded receipts without copying full compiler diagnostics containing fixture literals. Re-run the installed commands using run_quality.py in a **fresh** staging directory, adapting its website path and capturing fixed policy/declaration inputs first. Expected current result is three passing and six failing commands; do not rewrite expected failures into green statuses. For the focused case comparison use run_rehearsal.py with focused-suite-paths.json and its source pins; do not execute mutation helpers inside sealed evidence. Synthetic build origin/key remain external inputs, not credentials.
