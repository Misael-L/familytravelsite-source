# FamilyTravelSite GitHub and release workflow

This repository adopts the complete TREK application as its baseline, then connects the Family backend and preserves existing Family maps and governance. The migration is isolated from production until complete workflows pass validation.

## Repositories and remotes

- `origin`: `https://github.com/Misael-L/FamilyTravelSite.git`. This is the working repository for Family commits and pull requests.
- `upstream`: `https://github.com/liketrek/TREK`. Fetch reference releases here. Local pushes to this remote are disabled.
- `Misael-L/familytravelsite-source`: the existing public corresponding-source mirror. Publish a sanitized snapshot for an actual release; do not mirror every private development branch or push upstream history wholesale to this mirror.
- `Misael-L/FamilyTravelApp`: canonical Family database migrations and the iOS application. Backend changes that affect shared persistence belong there and must remain compatible with deployed clients.

## Branches

`main` remains the production line. The active local reconciliation line is `codex/trek-v5.1.2-family-reconcile`, continuing the preserved Family work from `codex/trek-v5-family-integration`. The older branch is retained; neither branch was renamed or deleted. Current packets authorize local commits only. Any later push/PR/release requires the applicable authorization and checks; keep an incomplete migration PR in draft. Small `codex/*` topic branches may target the integration branch. No separate permanent dev branch is needed.

For a GitHub-connected publication clone, main/integration should track their intended origin branches. The current isolated bundle-derived candidate has local bundle remotes; those were deliberately not reconfigured in D16n. Standard source/history guards pass; publication-clone `--local` mode is not claimed here. A later authorized publication must verify remotes, required immutable reference tags and the pre-push hook first. The hook rejects direct pushes to main and unexpected repositories. Enable it in each new publication clone:

```bash
git config core.hooksPath .githooks
git config remote.pushDefault origin
git config push.default simple
git config push.followTags false
```

Local hooks supplement GitHub rules; they do not enforce policy for other clients. GitHub main protection should require pull requests, successful `Family migration guard` and `ci-ok` checks, resolved conversations, and no force-push/deletion. Zero mandatory human approvals permits a solo maintainer to merge after checks; the PR itself is still required. GitHub accepted these rules on 29 October 2026; `docs/family-github-setup.json` records the setup result.

## Historical joined history and exact initial upstream import

The original import baseline was TREK 5.0.1, commit `a0943f8226269bc192c1cda992fbac33333337a1`. The import commit has the existing Family production commit as its first parent and the TREK commit as its second parent. Its tracked tree is exactly TREK's tree: no recreated frontend or backend integration was mixed into that import.

This deliberate join gives GitHub a common ancestor with production and retains TREK ancestry for later upstream merges. Keep merge commits when promoting this migration. Squashing or rebasing this migration would discard the ancestry connection needed for straightforward future upstream merges.

Fixed tags:

- `trek-v5.0.1`: the exact unmodified upstream starting point.
- `family-before-trek-v5-20261029`: Family production at `247b76ea94942e511a663f3f840c81821c556fc5`, before the migration.

Neither tag is a new deployed release. Do not move these tags. Schema-2 `.github/family-release.json` preserves them under immutable `initialImport`; its separate `baseline` now adopts TREK 5.1.2 (`5cfc7a602a21598039668387f749f5a419e69bc9`) and the latest accepted application snapshot. Local `trek-v5.1.2` is verified against the upstream target, not a Family deployment tag. D16n created only missing local reference tags; it did not publish or rewrite them. See [source contract](family-integration/qualified-source-contract.md) and [handoff](family-integration/source-pin-adoption-handoff.md).

## Versions and future TREK updates

Keep upstream package versions intact while establishing the baseline. Track Family deployments independently using calendar-version tags `family-YYYY.MM.DD.N`, where N starts at 1 each day. A release candidate appends `-rc.K`. For example, `family-2026.10.29.1-rc.1` is a naming example, not a release created by this setup.

Record the Family commit, upstream release/commit, public source tag, deployment version and compatible database migration IDs in each release receipt. Existing public source tags keep the `source-YYYYMMDD-SHORTSHA` convention.

Fetch new TREK releases from upstream, create a `codex/*` update branch from the active Family integration line (main after the migration ships), and merge the pinned upstream release there. Review all conflicts and run the applicable workflows before merging the update. Never replace the Family branch with upstream or blindly overwrite resolved Family backend and map integrations. Push only the intended branch and Family-owned tags; do not use `git push --mirror` or `git push --tags`.

## CI and deployment

As of 30 October 2026, every checked-in GitHub Actions workflow is manual-only (`workflow_dispatch`). Pushes, pull-request updates, schedules and issue activity do not start imported TREK automation from this integration revision. This stops hosted Nest/Postgres/S3 tests, Docker/image checks, Sonar, security scans, shared lint and upstream maintenance/publishing automation from consuming Actions minutes automatically. Existing Docker publishing workflows were already manual and keep their upstream repository guards.

The tests and build commands remain available for local validation; relevant TREK frontend checks still protect the adopted frontend. Family adapters, identity, permissions, writes, maps and browser flows are validated locally. The Family migration workflow remains available by explicit manual dispatch and retains its ancestry, source-integrity, typecheck and backend tests. Manual hosted runs require an explicit decision to spend Actions quota. No application tests or source-integrity checks were deleted.

Production branch protections remain unchanged. In particular, the existing required `ci-ok` check has not been removed or replaced with a passing placeholder. This draft migration PR may remain blocked until an applicable Family validation policy is approved and its required checks are satisfied. Disabling automatic imported workflows does not authorize a merge or deployment.

The Family Cloudflare Workers Static Assets recipe is restored in root `wrangler.jsonc`: Worker `familytravelsite`, assets from `./client/dist`, and `single-page-application` fallback. `npm run build:web` builds `@family/shared-compat`, then `@trek/shared`, then the TREK client; it does not build or start Nest. Root `.node-version` and `.nvmrc` both select Node 24, and Wrangler is locked to the production recipe's version, `4.125.0`. After building, `npm run check:cloudflare` validates the deployment package locally with Wrangler's dry-run mode.

The existing Workers Builds recipe is repository root, production branch `main`, build command `npm run build:web`, and deploy command `npx wrangler deploy`. Preserve the existing public Supabase build variables and Supabase data plane. Non-production branch deployment stays off unless a separate preview is explicitly authorized. These repository changes do not modify Cloudflare dashboard settings, credentials or the running site. Local build/dry-run checks do not prove live Supabase workflows.

This setup adds no deployment workflow, production credentials or preview service. Integration work must use local fixtures or a separately configured isolated preview. Verify that the external production build connection targets main before the final release. A branch push and a draft PR are not production-release approval.

Before promoting to main, validate the connected backend, Family roles and drafts, private files, saved picks, Studio/Tours/Collab where included, mobile/desktop interactions, loading/errors, and preserved map behavior. Check actual persistence after reload, not only rendered buttons.

Publish and verify corresponding source for the release commit before exposing the release to users. Promote with a merge commit, create the Family release tag, verify the main-only production deployment, and record its source/deployment mapping. Database rollouts are tracked separately in FamilyTravelApp; merging this frontend repository must not apply production SQL implicitly.

## Existing work and rollback

The older Desktop checkout and its uncommitted image work remain separate. The earlier full-frontend worktree is retained for selective backend/map code recovery, not copied wholesale over the new TREK baseline. Neither working tree is staged, reset or cleaned by this setup.

While migration is in progress, production stays on its independently deployed release; verify its actual version during any authorized release rather than inferring it from local Git metadata. After promotion, rollback uses a reviewed revert or a deployment of a previously verified release; it does not force-reset main or assume newer database migrations can be reversed by reverting frontend files.
