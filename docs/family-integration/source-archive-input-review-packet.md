# U04-F4a — review and qualify archive scanner inputs

## Result — 14 November

Resolved in `406103324005aaee4020921f7b7103e041168843`:1,073 affected tests,120 publisher assertions, typecheck/lint and the real pre/post-manifest archive scans pass. All114 original findings have reviewed resolutions; archive source completeness and the single private-plan policy remain. See [handoff](source-archive-input-review-handoff.md). Resume [F5 catalog/availability](core-catalog-availability-packet.md). Source adoption, hosted rollout and any remote publication/deployment remain gated.

## Original entry and scope

Continue on the current clean `codex/trek-v5.1.4-family-reconcile` successor of publisher commit `80b4b254545d52db41b7483347001806088c905c`. Read the source-publication hygiene handoff and its sealed evidence. Preserve all completed Family work. F4's tooling tests pass, but real-source publication is blocked by 114 scanner findings in 56 files; do not label F4 release acceptance complete.

Start with the exact sanitized finding path/line inventory, not a repository-wide ignored-directory scan. Reproduce on the exact committed tree. Classify each occurrence as an intentional synthetic test fixture, official documentation domain substring, intentionally private operational metadata, actual endpoint or actual credential. Do not print token bodies in logs or evidence. Record classification, per-path provenance and a content hash where useful. Check whether upstream 5.1.4 already owns a test before changing it. The original private plan's single reviewed archive omission is unchanged.

## Decisions and implementation

Choose the narrowest source-complete correction. Official documentation links should not require removing useful documentation merely because a host substring lacks a domain boundary. A classifier adjustment, if proposed, must retain production endpoint/credential rejection and have positive/negative boundary tests. Intentional fixture allowances must be exact and context/path-qualified, or replace fixtures with reserved non-production examples while preserving their tested semantics. Do not exempt all tests, Markdown, JSON, domains or directories. Do not apply a generic text replacement to runtime consumers or alter native layouts. Existing explicit negative corpora remain tested. A genuine credential requires separate handling; do not copy it to new artifacts.

Before editing outside the publisher's existing permitted files, produce the concrete affected-source/provenance review. Upstream-derived test or classifier modifications need an explicit source-qualification scope, not an adoption-pin change to silence a check. Keep runtime entry roots, native presentation, dependencies, backend/schema sources and the private plan byte-exact. Do not change any deployment origin, backend permission, image transformation or release capability.

## Acceptance

- Every original finding has an exact reviewed resolution; no unreviewed scanner finding is waived.
- Real archive source completeness and private-plan omission still pass.
- Artifact scanner rejects genuine endpoint/token negatives, malformed inputs and archive/dist identity mistakes; new boundary/fixture cases prove narrow behavior.
- Full local-only publisher regression suite still passes, including atomic rejected-tag and stale-main cases, separate build output and metadata checks.
- Relevant changed fixture/classifier tests pass; original native/upstream provenance is preserved or explicitly qualified per path.
- Run the real check-only publisher on the exact final committed candidate with the preview origin and no invented Worker identity. Record the actual exit code; do not count a stub build as an application build.
- Fast-forward only the owned clean local publication checkout, recheck guards/history/cleanliness and preservation evidence. No remote push or deployment.

After a clean archive, resume F5 supported catalog/availability, then default-profile/source adoption. The three known adoption holds are separate; this packet cannot erase them. No hosted SQL, migrations/settings/billing, OAuth, preview/production deploy, main update, PR, mirror push, backup/media mutation or ETL scan. Heavy processes remain for the user's Terminal when actually required.
