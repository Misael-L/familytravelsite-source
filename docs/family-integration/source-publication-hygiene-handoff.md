# U04-F4 — publisher repair and archive-input review handoff

14 November 2026. Implementation commit `80b4b254545d52db41b7483347001806088c905c` on `codex/trek-v5.1.4-family-reconcile`. **Publisher tooling is repaired; source-release acceptance remains blocked.** Do not update the preview, push the mirror or repin source adoption from these results.

## Completed

The publisher now verifies the exact immutable tracked tree, file bytes and executable modes before accepting an archive. Only the reviewed private operational plan is omitted in the archive copy; its source/history remain unchanged and its path/hash/size/reason are recorded. All other tracked inputs must be retained. Symlinks/gitlinks, archive escapes, export mutations, unexpected plans, sensitive environment files and conflicting tracked release manifests refuse publication. No artifact-scanner allowlist or classifier was changed.

The two approved deployment origins are validated exactly. Generated metadata includes an immutable source commit, tag, archived Node version and optional canonical Worker UUIDs. Push requires a Worker version; a predeployment check without one is truthfully unbound. This syntax check does not establish Cloudflare correspondence: the eventual operator must match the actual deployment receipt. Remote credential/query metadata is rejected. Normal mirror publication preserves history, with atomic main-plus-tag updates and expected-main/expected-empty leases.

Build verification runs in a separate clean copy. Its generated dependencies and dist never enter the scanned source snapshot or mirror. The updated source-publication procedure explains check-only versus deployed correspondence, current leases, preserved production tags and independent public-tag verification.

**120 publisher assertions passed**: 28 atomic/lease/scanner-identity cases plus 92 immutable-archive, metadata, refusal, private-plan and build-isolation cases. These use fresh local repositories and the real artifact scanner. Build-sequencing cases explicitly substitute npm; no fresh application clean build is claimed. The prior accepted runtime build proofs remain inherited because application, dependency and native-layout files did not change.

A new independent checkout is prepared at `/Users/Misael/Downloads/FamilyTravelSite-publication`, using the same immutable candidate and all existing source tags/history. It has no alternates or local-clone hardlinks. Origin is the private Family GitHub repository, upstream push is disabled, and the existing pre-push hook/remote defaults are configured. Seven direct hook allow/refuse cases pass. No GitHub authentication, remote push/PR/merge or hosted CI acceptance is claimed. The actual local structure command exits1 on the existing source-adoption drift (`.github/workflows/docker-dev.yml`); the known 5.1.2 qualified-source/native/history adoption holds remain. Twelve protected native layouts independently remain byte-exact to upstream 5.1.4.

## Demonstrated remaining blocker

The real check-only archive of the implementation commit retained **17,104 of 17,105 tracked files**, omitted only the unchanged 12,372-byte reviewed plan, and verified all retained blob bytes/modes. It then exited1 at the unchanged archive scanner, before a release manifest or public mirror was created.

There are **114 findings across 56 files**: 65 findings in 26 test files, 49 in 30 documentation/metadata files. Classes: 103 `SUPABASE_CO`, eight `PROD_HOST`, two `MAPBOX_PK`, one `CARTO_KEY`. Forty URL-class findings come from a substring matcher also recognizing the official documentation domain. The remaining URL findings include synthetic test endpoints and a documented endpoint; the key-pattern locations are settings/session test fixtures. These are unreviewed classifier findings, not evidence of 114 leaked credentials. Review must still be per occurrence, not a blanket declaration that every test or document is safe.

The first failure was previously masked by the private-plan gate. It is not acceptable to publish a partial runtime source set, delete the tests/docs from the archive, exempt broad directories, suppress the scanner result or mark the archive clean. Repairing these inputs/classifications touches sources outside F4's initial publisher/test/procedure scope, including upstream-derived tests. The next bounded step is the archive-input review packet. Preserve exact native layouts and separately qualify any necessary upstream test/classifier changes. Re-run the full publisher suite and a real check-only archive on the final committed candidate after those repairs.

## Continuation and preservation

Next: **archive-input review**, then F5 supported catalog/availability and default-profile/source adoption. Do not restart completed feature packets or introduce full TREK parity as a preview prerequisite. The hosted catalog SELECT still requires its separate approval; no SQL workaround belongs here.

Schema sources, canonical mixed index, prior sealed evidence, private plan, application/dependency files and protected layouts are preserved. No database/service was started in F4. Previous owned-stop receipts remain authoritative. Production, preview, main, remote refs, Supabase settings/billing, original backups/media, transformations and the ignored ETL directory are untouched.

Sanitized evidence is stored in the canonical modernization evidence directory `u04f4-source-publication-hygiene-2026-11-14`; it contains actual exit codes, local-only test results, finding locations/classes, archive-retention receipts, clone/guard results and preservation hashes. It excludes the private plan body, raw extract, credentials and repository object databases. The exact final documentation successor and final archive outcome are recorded in that evidence receipt.
