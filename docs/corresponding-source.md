# Corresponding-source publication

The private development repository is `Misael-L/FamilyTravelSite`. The public AGPL corresponding-source mirror is `Misael-L/familytravelsite-source`. A local archive is preparation; it is not a public source offer or proof that a Worker was deployed.

## Inspect an immutable candidate

Use a clean private checkout and resolve the candidate to a full commit ID. Each invocation needs a fresh output directory. A check can run before deployment without inventing a Worker identity:

```bash
unset WORKERS_VERSION_ID WORKERS_BUILD_UUID
bash scripts/publish-corresponding-source.sh --commit HEAD --check \
  --origin https://familytravelsite-integration-preview.lmisael0721.workers.dev
```

The default origin remains `https://familytravelsite.lmisael0721.workers.dev` for production compatibility. Only these two exact HTTPS origins are accepted; paths, trailing slashes, credentials, ports, queries and fragments are rejected. Check-only metadata without a Worker version says `check-only-unbound`. It must not be described as deployed correspondence.

The publisher verifies every archived file against its immutable Git blob and executable bit, and requires the complete tracked source set. It rejects links/gitlinks, traversal/nonregular paths and `export-ignore`/`export-subst` mutations. The sole reviewed omission is `.cursor/plans/existing-family-backend-integration.plan.md`, with SHA-256 `c4677c13b949e3f714fe3f07f58f10c0a54af72a23537d7bb43e356240512449`. This private operational plan is not an application/build input. Its source bytes and history remain untouched; only the archive copy omits it. Its path, hash, size and reason are recorded in `RELEASE_MANIFEST.json` and the external `source-archive.json` receipt. Changed plan bytes/mode or any other private plan refuse publication.

Environment/credential files, `.wrangler`, dependencies and dist artifacts remain forbidden source inputs. Example environment files remain subject to the strict scanner. The artifact scanner is unchanged and runs before and after metadata generation. The manifest uses the archived Node version and an immutable `privateSourceCommit`; `privateProductionCommit` is retained as a legacy alias even for preview archives. It records the exact origin, source tag and optional UUIDs. Remote credentials and signed query strings are refused.

`--verify-build` copies the clean source to a separate `build/` directory, runs `npm ci` and `npm run build:web` there, and scans that dist. Generated dependencies and assets never enter `extract/` or the mirror. This option is a real clean build when normal npm is used. Publisher regression tests substitute npm in their build-sequencing fixtures only; those cases are not application-build evidence.

## Later coordinated deployment and publication

This procedure does not authorize a deployment or push by itself. Release acceptance, default-profile/source adoption, database/API readiness and the required branch checks must pass first. Use the exact accepted commit and retain rollback Worker/source identities. Capture the current public mirror `main` immediately before publication, rather than relying on a historical revision in notes.

After a deployment has produced its actual Worker version, set `WORKERS_VERSION_ID` to that canonical UUID. Set `WORKERS_BUILD_UUID` only when the deployment actually has one; direct Wrangler deployments have no Workers Build UUID. The publisher validates UUID syntax; the operator must verify correspondence against the deployment receipt. It does not query Cloudflare or assert that a supplied UUID belongs to the commit.

```bash
# Environment contains the actual deployment identity, never an API credential.
# CANDIDATE_COMMIT is the reviewed full commit; MIRROR_MAIN is the freshly read OID.
bash scripts/publish-corresponding-source.sh --commit "$CANDIDATE_COMMIT" \
  --origin https://familytravelsite-integration-preview.lmisael0721.workers.dev \
  --expected-main-oid "$MIRROR_MAIN" --push
```

Publication requires the actual Worker version and atomically updates mirror `main` plus a new annotated `source-YYYYMMDD-SHORTSHA` tag. Normal publication preserves mirror history. `--orphan` is an explicit history replacement and still requires a known-main lease; it is not the normal release procedure. Empty remotes use an expected-empty lease. An inaccessible remote, stale lease or rejected tag fails without a partial ref update. Never use plain force, bypass branch protection or retag a production snapshot. A preview snapshot may advance mirror `main`; the existing production tag must remain available.

After publication, independently clone the exact public tag, check its manifest against the deployment and perform the approved clone-build verification. Record the source tag/commit, origin, Worker version, mirror-main transition and rollback companion. Preserve the app's existing public source-offer URL. Do not claim public availability or live acceptance from local regression tests.

## Reviewed archive input policy

Intentional test origins use reserved invalid hosts and existing exact token fixtures. Operational readiness documents mark withheld project/host identifiers explicitly; unredacted originals remain in private Git history. Public-source snapshots must not be represented as untouched hosted responses. The archive scanner recognizes canonical official documentation links only in the reviewed Markdown context; it continues to scan adjacent URLs/tokens and refuses unreviewed endpoint, credential, query and fragment forms. Per-occurrence provenance and regression proof are in `docs/family-integration/source-archive-input-review/`. This is source qualification, not a new blanket exclusion or a source-adoption repin.

## Regression checks

Run `bash scripts/publish-corresponding-source.test.sh` with the repository's supported Node version on PATH. All pushes in this suite target fresh local bare repositories. The exact private-plan positive/mutation cases require the private qualification checkout; the sanitized public mirror reports those cases as skipped because their input is deliberately absent. The suite tests real Git archives, strict scans, metadata/refusals, source/build isolation and atomic/stale-lease behavior. It never uses an operator remote or deploys a Worker.
