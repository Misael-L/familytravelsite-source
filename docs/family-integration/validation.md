# Family integration validation

Node: v22.23.1. Client typecheck uses `NODE_OPTIONS=--max-old-space-size=8192`.

This pass starts at `943bc8485` on `codex/trek-v5-family-integration`. `family-backend/src` has no diff. The 120 frozen files were not edited. No schema, SQL, credentials, or deployment changes.

## Passed locally

- `npm run lint:knip` — 387 findings, baseline allows 387.
- `cd client && NODE_OPTIONS=--max-old-space-size=8192 npm run lint:strict` — exit 0. 482 errors in 155 files, baseline allows 482. No baseline was raised.
- `cd client && npm run build && npm run check:gl-split` — exit 0. Mapbox and MapLibre are in separate chunks (Family v3/v5 and TREK engines). No chunk contains both markers.
- `cd client && npx vitest run` for the bridge, Atlas GL lifecycle, views, application handler, and strict-lint tests — 5 files, 16 tests passed.
- `PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright npx playwright test --config playwright.family.full-frontend.config.ts` — 6 passed. The hub/Atlas test reads the live Leaflet country layers: Mexico geometry is larger than a placeholder, fill opacity is 0.7, and another country is `#e2e8f0` at 0.3. Stats still show 12 days.
- Login spec `e2e/login.public.spec.ts` passed against Nest (`VITE_DATA_PLANE=nest` on the Playwright web server). The password field was visible. This machine does not have Playwright's chromium-1243 shell, so that run used the installed `chromium_headless_shell-1228` executable. CI installs the browser that matches the Playwright package.

## Frozen strict error, not scored

`family-backend/src/data/supabase/personAvatars.ts:307` is `TS2322`: `storage.remove([path])` sees `path` as `string | undefined` under the client's `strictNullChecks`. The assignment before that call is a string, and the file cannot be edited. `lint:strict` prints the error and does not count it. `npm run typecheck:family-backend` uses that package's `strict: false` tsconfig. This is not a client-baseline raise.

## CI order

Client typecheck, lint, bundle, test shards, coverage merge, and end-to-end install `@family/shared-compat` and build it before the client command. Push events for `codex/trek-v5-family-integration` do not start `test.yml`, `family-migration.yml`, or `security.yml`. The pull request still runs those checks. PR #1 stays draft. Do not push again to rerun Actions.

## Not established

`npm run lint:warnings` was not green. A full run still reports totals above `scripts/eslint-baseline.json` (for example `no-non-null-assertion` 439 vs 382) plus the warning rules that were already over baseline on this branch. Edited non-legacy files were checked with `eslint --quiet` and reported no errors. The baseline was not updated.

Local Family tests and this login run do not replace the pull-request checks. GitHub Actions run `41117527052` could not be read (private repo, `gh` is not installed). The failures named from that run were reproduced locally: strict, GL split, Knip, and login.

Playwright still logs a Dexie `DatabaseClosedError` and a Zustand migrate warning. Those lines are ignored. Other page errors fail the spec.

Region and bucket-list Atlas responses stay empty. Family has no tables for them.

## Automatic Actions disabled, 30 October 2026

This checkpoint supersedes the automatic PR-run policy above. All 12 workflow YAML files now have only `workflow_dispatch`; 10 event blocks changed, and the two Docker publishing workflows were already manual-only. The change preserves every job definition, permission and other parsed YAML field. No test suite was deleted and no application code changed.

- Node 24 YAML parse and comparison with `HEAD`: passed for all 12 workflows; only event definitions differ.
- `git diff --check`: passed.
- `node scripts/family/check-backend-carryover.mjs`: passed; all 120 frozen source/test files remain byte-identical.
- No build or browser suite rerun for this trigger/documentation-only change. Existing application failures remain unresolved by this change.
- Live PR runs for `c1d88165a`: Tests & SonarQube `41132541313` completed with failure; Family migration `41132541311`, Security `41132541339`, and Lint & Prettier `41132541428` completed successfully. None of those runs remains active; no rerun requested.
- Production main and its required checks remain unchanged. PR #1 must remain draft; switching workflows to manual does not establish application correctness or satisfy missing required checks.

## Cloudflare hosting configuration restored, 30 October 2026

Parent: `1ea16fe03`. Node v24.22.1, npm 10.9.2, Wrangler 4.125.0. Root `wrangler.jsonc` exactly matches `origin/main` (`247b76ea94942e511a663f3f840c81821c556fc5`): asset-only Worker `familytravelsite`, assets `./client/dist`, SPA fallback. The existing production recipe remains repository-root `npm run build:web` then `npx wrangler deploy` on `main`. Dashboard settings were not inspected or modified in this repair.

- `npm install --ignore-scripts --no-audit --no-fund`: exit 0; restored pinned Wrangler. Semantic comparison of package-lock entries shows no changes to existing dependency records other than root's Wrangler declaration; only Wrangler's dependency closure was added.
- `VITE_DATA_PLANE=supabase VITE_SUPABASE_URL=https://family-cloudflare-check.invalid VITE_SUPABASE_ANON_KEY=family-cloudflare-check-public-key VITE_MAPBOX_ACCESS_TOKEN= npm run build:web`: exit 0. Compatibility/shared builds precede the client. Vite build completed in 15.81s; PWA generated. These are fake public test settings, not a production-ready bundle. No Nest build/start is in this command.
- `WRANGLER_SEND_METRICS=false CI=true npm run check:cloudflare -- --outdir /private/tmp/family-cloudflare-dry-run --env-file /dev/null`: exit 0; Wrangler read 4004 assets and exited in dry-run mode. No upload.
- Temporary `wrangler dev --local` with `/dev/null` env file: `/`, `/login`, `/trips/11111111-1111-4111-8111-111111111111`, and `/reset-password` returned HTTP 200 HTML matching built `index.html`; the JavaScript bootstrap asset returned HTTP 200 JavaScript. The local process was stopped. This checks static hosting and deep-link fallback, not live browser/backend operations.
- `node scripts/family/check-backend-carryover.mjs`: passed, 120 frozen source/test files unchanged.
- `node scripts/family/check-git-structure.mjs`: passed.
- `npm run lint:knip`: 387 findings, unchanged baseline 387. Initial dependency-only restore reported Wrangler unused; the reusable `check:cloudflare` command resolved that finding without changing ignores or baselines.
- All 12 workflow YAML event definitions still contain only `workflow_dispatch`. Node pins agree (`.node-version` and `.nvmrc` both 24). `git diff --check`: passed.

No application/native frontend code, production main, Cloudflare settings, credentials, database or live deployment changed. Restoring deployment tooling does not resolve the previously recorded app/strict/lint failures or establish live authenticated Supabase functionality. PR #1 remains draft.

## Release-readiness repairs

Local only, on `codex/trek-v5-family-integration`. `family-backend/src` was not edited. Nothing was pushed. These results do not satisfy the required pull-request checks.

Passed:

- `npm run build --workspace=@family/shared-compat` and `npm run build --workspace=shared`: exit 0.
- `cd client && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`: exit 0.
- `npm run build:web`: exit 0. Vite built in 15.73s.
- `node scripts/family/check-backend-carryover.mjs`: 120 frozen files match.
- `cd client && NODE_OPTIONS=--max-old-space-size=8192 npm run lint:strict`: exit 0. 482 errors in 155 files, baseline 482. The frozen `personAvatars.ts(307,56)` TS2322 is not scored. The baseline was not raised.
- `npm run lint:knip`: 385 findings, baseline 385. The baseline was lowered from 387 because `scan` in `rtl.mjs` and `theme.mjs` is now imported by the ownership test. It was not raised.
- Family Vitest batch (reset, planner, export, store registry, store isolation, strict-lint, scanner ownership, secret scan, `src/integrations/family`): 34 files, 303 tests passed.
- `PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright npx playwright test --config playwright.family.full-frontend.config.ts`: 12 passed.

Not green, baselines not changed:

- `cd client && node scripts/rtl-lint.mjs`: fails. Reachable copied Family files hold physical sides with baseline 0. The unreachable hosts in `family-scanner-ownership.mjs` are skipped. The baseline was not raised.
- `cd client && node scripts/theme-lint.mjs`: fails. 9122 styling bypasses in 556 files, baseline allows 3499. The baseline was not raised.
- `cd client && node scripts/i18n-keys.mjs`: fails on copied Family keys and templates that are in neither catalog, and on unused-key counts that are now below the baseline. `--update` was not run.

`bash scripts/publish-corresponding-source.test.sh` passed 28 and failed 0 against a disposable local bare repository. No public remote was written.

`npm run source:check -- --verify-build` on `593111feb78d952b3d56a3afa1aaa18b6b0f19a8` archived that SHA, then the secret scan stopped on HIT classifications (`CARTO_KEY` and `MAPBOX_PK`) in existing chart templates and tests. One group is the passkey helper named `pk` (`pk.creds`), which matches the Mapbox pattern. No skip or exclusion was added. The extract's `npm ci` and `npm run build:web` did not run. The scan prints class, path, and line only.

## Snapshot export continuation, 31 October 2026

Product commit `345927283293d17f419498094a5343aa6b7b8d11` on `codex/trek-v5-family-integration`. `family-backend/src` was not edited (carryover: 120 files). Nothing was pushed. PR #1 stays draft.

Passed on that commit's worktree before the commit, and the extract check below is of the commit itself:

- `cd client && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`: exit 0.
- `npm run build --workspace=@family/shared-compat`: exit 0.
- `cd client && node scripts/i18n-keys.mjs`: exit 0. 7618 literals and 355 templates. 729 unused TREK keys, baseline 729. Family files do not count toward that ratchet. `--update` was not run.
- `cd client && npx vitest run` for export, secret scan, i18n keys, and scanner ownership: the i18n and ownership files passed 21 tests after the catalog assertion was updated. The secret-scan and export files passed in the same batch before that assertion change.
- `PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright npx playwright test --config playwright.family.full-frontend.config.ts e2e/family/fullFrontend.release.spec.ts`: 7 passed. A failed `schedule_items` read stays on the trip. PDF and ICS leave the Export dialog open, leave both buttons enabled, and do not call the close that follows `onExported`.

`bash scripts/publish-corresponding-source.sh --check --commit 345927283293d17f419498094a5343aa6b7b8d11 --verify-build` (the `source:check` command) exit 0. Node v22.23.1.

- Archive secret scan: `artifact_scan_ok files=12964`. No HIT. Class, path, and line only.
- Extract `npm ci`: added 1646 packages in 28s.
- Extract `npm run build:web`: Vite built in 21.34s. PWA generated.
- Dist secret scan: `artifact_scan_ok files=579`.
- Check-only. No `--push`.

Still failing, baselines not changed:

- `cd client && node scripts/rtl-lint.mjs`: 1098 physical sides in 294 files, baseline allows 284. Active `FamilyReadStatus` no longer counts. `pages/tripPlanner/PlanMapStage.tsx` still has one physical `right` for the compass, the same measured inset as the line above it. That file's disable entry is already 4. It was not raised.
- `cd client && node scripts/theme-lint.mjs`: 9116 styling bypasses in 553 files, baseline allows 3499. 142 disable marks, baseline allows 141. The remaining extra mark is white text on the danger button in `integrations/family/legacy/components/shared/DialogShell.tsx`. No token stays white on that fill in both schemes. The baseline was not raised.
- `family-shared/scripts/i18n-parity.mjs --strict`: still fails on locale drift that predates these six keys (`admin.ts` and others). The six new keys exist in all 23 locales. `files.toast.tooLarge` and `files.toast.downloadError` are English everywhere because Trek has no translation. The other four keys use the Trek locale strings.

Copied Family legacy modules stay scanned when the member app imports them. The unreachable host list was not widened. A Family file that exists in this client and is not imported from `main.tsx` or `App.tsx` is skipped, because that walk proves it is unreachable.

## Published snapshot from either view, 31 October 2026

Product commit `4356936f9c25052920d677c582754a54a2b1b88b` on `codex/trek-v5-family-integration`. `family-backend/src` was not edited (carryover exit 0, 120 files). Nothing was pushed. PR #1 stays draft.

Passed:

- `cd client && node scripts/rtl-lint.mjs`: exit 0. 284 physical sides in 105 files, baseline 284. 10 disable marks, baseline 10.
- `cd client && node scripts/theme-lint.mjs`: exit 0. 3499 styling bypasses in 310 files, baseline 3499. 141 disable marks, baseline 141. Baselines were not raised.
- `cd client && node scripts/i18n-keys.mjs`: exit 0. 7618 literals, 355 templates, 729 unused TREK keys, baseline 729.
- `cd client && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`: exit 0.
- `cd client && npx vitest run` for secret scan, export, and scanner ownership: 90 tests passed. Secret scan 72, export 15, ownership 3.
- `PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright npx playwright test --config playwright.family.full-frontend.config.ts e2e/family/fullFrontend.release.spec.ts`: exit 0, 7 passed.
- Worktree secret scan of 12965 text files: 0 HIT.

`bash scripts/publish-corresponding-source.sh --check --commit 4356936f9c25052920d677c582754a54a2b1b88b --verify-build` exit 0. Node v22.23.1.

- Archive secret scan: `artifact_scan_ok files=12964`.
- Extract `npm ci`: added 1646 packages in 17s.
- Extract `npm run build:web`: Vite built in 14.83s.
- Dist secret scan: `artifact_scan_ok files=579`.
- Check-only. No `--push`.

## Locale parity, still separate

`family-shared/scripts/i18n-parity.mjs --strict`: exit 1. File parity is OK. Key parity reports 234 domain files with drift, including `admin.ts` and `vacay.loadError`. That debt predates this pass. The six Family keys added earlier remain in all 23 locales. `files.toast.tooLarge` and `files.toast.downloadError` stay English in every locale because Trek has no translation for them.

Re-run on Node v24.22.2 after the placement repair: still exit 1. File parity OK. Key parity still 234 domain files, including `zh-TW/vacay.ts` missing `vacay.loadError`. This debt is not part of the placement repair.

## Category colors and physical placement, 31 October 2026

Product commit `a7864a8fa5df81b3c2da952a8e047e39e3bd83d2` on `codex/trek-v5-family-integration`. Node v24.22.2. `family-backend/src` was not edited (carryover exit 0, 120 files). Nothing was pushed. PR #1 stays draft. CARTO whitespace handling and published-snapshot export are unchanged.

Passed:

- `cd client && npm run lint:rtl`: exit 0. 284 physical sides in 105 files, baseline 284. 10 disable marks, baseline 10.
- `cd client && npm run theme:lint`: exit 0. 3499 styling bypasses in 310 files, baseline 3499. 141 disable marks, baseline 141. Baselines were not raised.
- `cd client && npm run lint:i18n-keys`: exit 0. 7618 literals, 355 templates, 729 unused TREK keys, baseline 729.
- `cd client && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`: exit 0.
- `cd client && npx vitest run` for color mix, export, secret scan, scanner ownership, and the i18n key script: exit 0. 5 files, 109 tests passed (secret scan 72, i18n script 18, export 15, ownership 3, color mix 1).
- `PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright npx playwright test --config playwright.family.full-frontend.config.ts`: exit 0, 17 passed. The phone catalog pin is `[data-marker="explore-poi"][data-poi-category="hotel"]` with computed background `rgb(37, 99, 235)`. Sliding-tab and context-menu placement passed in LTR and RTL, including a scrolled tab strip and a menu opened at the viewport corner.

`bash scripts/publish-corresponding-source.sh --check --commit a7864a8fa5df81b3c2da952a8e047e39e3bd83d2 --verify-build` exit 0. Node v24.22.2.

- Archive secret scan: `artifact_scan_ok files=12968`.
- Extract `npm ci`: added 1637 packages, and audited 1643 packages in 23s.
- Extract `npm run build:web`: Vite built in 16.15s. PWA generated.
- Dist secret scan: `artifact_scan_ok files=579`.
- Check-only. No `--push`. The script printed the mirror URL and stopped.




