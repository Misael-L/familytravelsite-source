# Q120 — Closed copied Collections stylesheet island retired

Completed source retirement on 18 November 2026. Incoming `3b84a6b6ec4f3d02fe2021bc18632ff5cd41cf01`; implementation `26fb14153156399db490c5dfa89809b484d3a11f`; fixture build `4e1ab46ae2bfc799ed71f2b4b826905fd7263fed`. [Evidence](evidence/retained-stylesheets-20261118/README.md). **Preservation verified; tests and release are not all green.**

## Exact boundary and dependency-driven adjustment

The initial three size-failing CSS files could not be deleted independently: copied `styles/collectionsPage.css` imports old dashboard/collections CSS and copied `pages/CollectionsPage.tsx` imports that wrapper. The initial loader review refused the incomplete boundary. A full audit finds no outside consumer of the owning copied page. Remove exactly those five files as one closed island; retain every shared component, model, store, API, backend dependency, test and native page/style. This bounded closure avoids dangling imports. If any outside consumer had existed, the alternative was preserving the files and splitting styles without changing cascade.

Full14,045-code-source raw runtime/type/export/ImportTypeNode/JSDoc/mock/require review plus actual PostCSS/HTML loaders finds only three internal edges: page to wrapper, wrapper to two stylesheets. Extension-independent tracked text review covers scripts/configuration as well. Current native global/dashboard/Collections CSS has positive entry witnesses and unchanged hashes. The page is an external module without ambient augmentation. Dynamic roots/globs, stylesheet repair/print/theme helpers, classic/recovery/worker entries, and Tailwind/PostCSS cascade configuration are separately reviewed. Actual parser controls detect CSS/HTML loads; synthetic runtime/compiler-root controls detect the page.

All6,091 current runtime nodes/edges/source bytes remain exact. Ordinary compiler roots5,077/sources10,264 and all program source bytes/public export, return-property and parameter contracts of native Collections/Dashboard/Journey/theme and Family controller remain exact. All other18,490 prototype tracked files match incoming bytes. Source history/licenses and original blobs remain recoverable.

## Measured validation and known failures

The unchanged80-suite cohort has **2,315 passed,1 existing failed,38 existing skipped;2,354 total**, identically before/after. Zero new failures/skips. The failure is `THEME-013: the command runs its check whichever way it is started`; the existing theme CLI exits1. All38 pre-existing skipped cases are in JourneyDetailPage; no assertion, fixture, mock, timeout, coverage, skip or test configuration was changed.2,353 raw case identities match; one unchanged source-defined generated-v4UUID label in stayTransport has a narrowly scoped normalization and raw-label/source-hash evidence. This proves preservation, not all-green coverage or browser/hosted feature acceptance.

Fresh ordinary build and direct compiler pass with128 fixed declarations. Four source guards and correct/wrong/missing-source artifact controls pass. All3,793 output paths match; only sourceCommit configuration differs. All other3,792 outputs, including JavaScript/CSS, service-worker/cache and compressed files, are byte-exact. All14 generated stylesheets match despite the removed page's Tailwind content. Native UI, supported Family identity/permissions/session/queue/recovery and stored image variants stay intact.

Actual size findings **3→0**, format0 unlisted failures with unchanged2,134 allowance entries; warnings src3418/3418,tests2859/2859,suppressed83/83,complexity218/218,length130/130. These gates pass without changing rules/baselines/exclusions/suppressions. **G2 remains blocked by the independently discovered theme ownership failure.**

## Reviewable theme correction — not applied

An earlier native phone packing extraction at `dd773ae38e7f53e7af08b553388c395f5e7a6c23` moved13 existing theme findings from MPackingListTab into MPackingItemRow but left all32 allowance entries assigned to the parent. The authoritative theme rule and source-history comparison prove the exact13-match multiset in the extracted row and the remaining19 matches in the parent. Proposed patch: child0→13,parent32→19; global allowance remains3,388. No UI/runtime changes, new findings or suppression changes are proposed.

Automatic approval review rejected editing tracked `client/scripts/theme-baseline.json`: standing instructions prohibit persistent quality-control baseline changes even with an unchanged aggregate allowance. The baseline remains byte-exact; no indirect workaround was applied. [Exact proposed patch](evidence/retained-stylesheets-20261118/proposed-theme-ownership.patch), [source proof](evidence/retained-stylesheets-20261118/theme-budget-ownership-proof.json) and [review block](evidence/retained-stylesheets-20261118/approval-block.json). This requires explicit user approval before application. Until then theme CLI/test failure remains an open release blocker.

## Preservation and operational limits

Only the newly created, fully verified disposable source prototype was retired. Separately, fresh write-isolation probes, full Git/blob/path/byte/mode/owner/mtime/flag/xattr/ACL comparisons permitted APFS COW storage sharing between previously verified source/output snapshots. All logical files remain; independent inodes/ctime can change. No archive/evidence/build/source/backup/ETL/media files were deleted for space. Fresh archive capacity includes temporary tar plus simultaneous extraction and headroom; it is not a restore or archive-acceptance claim.

Canonical151 migrations/370 sources/mixed index/README, previous seals, other checkouts, native layouts and all other tracked application/test/policy bytes remain. The shared backend checkpoint stays8cc0fe3f. Private source checkpointing and check-only archive follow; no main merge, public mirror publication, preview/production deployment, hosted schema/settings/billing, image transformations, backup/ETL operation or iOS work occurs.

## Next packet — approved theme ownership repair, then readiness

1. Ask for explicit approval of only the two-entry ownership correction shown above. Do not run `theme:lint --update`, alter rule/exclusion/suppression budgets, move code to avoid the check, remove THEME-013 or change the38 existing skips.
2. If approved, start from the final private checkpoint and verify the unchanged source/baseline hashes against the sealed proof. Apply only child13,parent19, preserving aggregate3,388 and all other bytes. Add the precise changed-source qualification row and commit source/policy changes separately from evidence. No runtime UI change is required.
3. Run the actual theme CLI from client and scripts directories plus existing theme tests and the same80-suite cohort. Expect2,316 passed and38 unchanged skips only if the approved correction genuinely fixes the sole failure. Compare all test identities; do not fabricate passing outcomes. Re-run qualified-source/presentation guards and source-bound build/artifact controls for any new qualified checkpoint.
4. Record and seal the correction, normal private checkpoint push/remote verification, and clean publication copy. G2 can close only after its complete actual gate set passes; all other release gates remain distinct.
5. Then conduct a fresh supported-core readiness audit: exact selected native source/writer permissions/conflicts/queue paths, current hosted schema/API/engine facts, projection/catalog/publication bindings, protection/recovery and target-specific preview/browser/source acceptance. Read-only facts and isolated DB rehearsals precede any reviewed hosted mutation. This cleanup does not authorize release or independent recovery claims.

Use `/private/tmp/trek-core-retained-stylesheets-20261118/next-baseline-private.json` only after the verified private push. Preserve the active continuation pointer and every earlier seal/complete or failed archive. Do not resume historical completed packets, mass-delete copied dependencies, enable advanced APIs/features or touch main/production/preview/Supabase/billing/backups/media/ignored ETL.
