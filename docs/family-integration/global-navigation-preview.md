# Family global navigation preview repair — 31 October 2026

The v5 integration checkout is `/Users/Misael/Downloads/FamilyTravelSite`, branch `codex/trek-v5-family-integration`. Repair commit `b3091ae07248a456c5df9471df74470e2fff7783` follows stored-image port `925cbb0976faf9a128d5714a16d80d453d244369`. These commits remain local; this pass did not push the integration branch or promote it to main.

## Behavior and scope

The authenticated Family `/addons` handler used to label every enabled add-on `core`. Native `Navbar`, `BottomNav` and the v5 dock all require `global` for global page links. Atlas, Vacay, Collections and Journey now have the correct type and icons. Vacay, Collections and Journey retain their existing Family feature checks; Atlas retains its existing availability. Packing, Budget and Documents stay trip tools. Tours, Roadtrip and Collab remain unavailable. No feature flag, schema, backend persistence module, image reader, image-transformation setting, billing setting or production deployment was changed.

Cursor had already deployed an uncommitted version of the same runtime metadata patch before this repair continued. That preview version was `861a9c34-36f2-4daf-8fc9-55c38c5753c2`. This pass preserves the patch in Git and replaces the initial helper-only tests with the real handler-to-navigation contract.

## Validation

Node v24.22.2, existing locked dependencies:

```bash
cd /Users/Misael/Downloads/FamilyTravelSite/client
node ../node_modules/vitest/vitest.mjs run \
  src/integrations/family/applicationHandler.nav.test.ts \
  src/integrations/family/applicationHandler.test.ts \
  src/components/Layout/Navbar.test.tsx \
  src/components/Layout/BottomNav.test.tsx \
  src/mobile/components/MBottomNav.test.tsx

cd /Users/Misael/Downloads/FamilyTravelSite
NODE_OPTIONS=--max-old-space-size=8192 npm exec --workspace=@trek/client -- tsc --noEmit
npm run build:web
node --experimental-strip-types client/tests/unit/family/secretScan.ts \
  --mode=artifact --repo=FamilyTravelSite --kind=dist --root=client/dist
./node_modules/.bin/wrangler deploy \
  --name familytravelsite-integration-preview --dry-run --env-file /dev/null
bash scripts/publish-corresponding-source.sh --check --commit b3091ae07248a456c5df9471df74470e2fff7783
git diff --check
```

All five focused files passed: **86 tests**, including five new regressions. The new tests send a request through the real Family application handler, Axios adapter and native add-on store into the rendered desktop navbar, phone bottom navigation and v5 phone dock. They assert global metadata, trip-tool separation, absent Tours, disabled Family features, actual routing and removal of disabled links after reloading add-ons. Unrelated notification/help/assistant widgets are mocked. The handler, transport, store and navigation components are not mocked. Temporarily restoring the original handler caused four of the five new tests to fail; restoring the repair made all five pass.

Client typecheck exited 0 with the documented 8 GB heap. The initial default 4 GB Node heap attempt aborted with an out-of-memory error; that failed attempt is not counted as passing. Web build passed, with the existing large-chunk warning. Wrangler dry-run passed (4,004 assets, no bindings). Dist secret scan passed (579 text files), as did the tracked source archive scan (12,973 text files). Source publication was check-only: no public mirror push or new published source tag. The existing client `.env.local` supplied only the approved public Supabase build variables. No credentials or environment files were committed.

## Actual preview deployment

Only the existing integration preview was updated using Wrangler 4.125.0:

```bash
./node_modules/.bin/wrangler deploy \
  --name familytravelsite-integration-preview \
  --env-file /dev/null --keep-vars \
  --message 'Family global navigation b3091ae07'
```

- URL: https://familytravelsite-integration-preview.lmisael0721.workers.dev
- Version: `d08eb5ec-1fe1-4fff-a61a-d4fe1c647e3b`, at 100%.
- Deployment: `f10725cd-e40a-45ae-be30-406f8c86f740`, created `2026-10-31T22:23:58.162494Z`.
- Entry: `/assets/index-Cb3eV4Nk.js`, independently matched between the built and live HTML.
- Previous preview version: `861a9c34-36f2-4daf-8fc9-55c38c5753c2`, deployment `b5323ec9-7a8a-40d7-b481-2b34bc89d68b`.
- Wrangler reported no changed assets to upload: the validated runtime patch matches Cursor's earlier partial preview deployment.

Before/after read-only status checks show production is unchanged: Worker `familytravelsite`, version `a5814c29-fe0c-446c-bd89-146e549a4be4`, deployment `5026f14c-4323-4405-aa8e-a20c30ad7cb3`.

## Signed-in browser checks and limits

The signed-in Chrome session displayed all four global links. They opened:

- Atlas: country map, search, Stats and Bucket List controls, and the current empty travel-stats state.
- Vacay: the 2026 calendar, member/shared-calendar controls and entitlement display.
- Collections: the existing lists, `Mexico`, and its saved Ciudad De Mexico place.
- Journey: existing Journeys and an existing Journey's entry/timeline.

An existing Journey also shows unavailable plan, recorded-day and entry-stay map layers. The current Family Journey handler has no `/journeys/:id/map-layers` implementation and returns an unavailable-feature error. That integration gap is not repaired by changing navigation metadata. No claim is made that all Journey, Atlas or calendar actions are implemented. No live create/edit/delete operations were performed. No live phone-device smoke, full application suite, hosted Actions, or production smoke was run in this bounded repair; the three menu contracts were tested locally. Tours remains disabled until its backend is implemented.

Temporary local evidence is under `/private/tmp/family-global-nav-repair/`: `regression-before.log`, `typecheck.log`, `build.log`, `source-check.log`, `wrangler-dry-run.log`, `preview-deploy.log`, and `preview-before.json` / `preview-after.json` / `production-before.json` / `production-after.json`. This directory is temporary, not an off-device backup. The scoped repair and regression tests are preserved in the integration branch's Git history; untracked Cursor plan files were left alone.

Next operator action is to reload the integration preview and use the restored links. This is not a main/production release decision. No backfill, full verification, sync, SQL or billing operation is needed for this navigation repair.
