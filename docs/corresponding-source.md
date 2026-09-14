# Corresponding-source publication

FamilyTravelSite §39. Repeatable procedure for the sanitized public AGPL mirror.

## Hosts

| Tree | Visibility | Role |
|------|------------|------|
| `Misael-L/FamilyTravelSite` | private | Development + Workers Builds |
| `Misael-L/familytravelsite-source` | public | Corresponding source for the live SPA |

Do not treat the private repo, an untracked zip, or the locks file as the public offer.

## Publish a release snapshot

From a **clean** checkout of the private repo, on the exact commit Workers Builds deployed:

```bash
# Inspect only (archive + secret scan, no push)
npm run source:check -- --commit HEAD

# Archive, scan, optional public clone-build, push tag
SOURCE_MIRROR_REMOTE=https://github.com/Misael-L/familytravelsite-source.git \
  bash scripts/publish-corresponding-source.sh --commit HEAD --verify-build --push
```

The script:

1. Resolves the commit to a full SHA.
2. Builds a `git archive` tree (tracked files only).
3. Refuses `.env*` (except `*.example`), `.wrangler/`, `dist/`, credentials, `service_role`, and `CRON_SECRET`.
4. Writes `RELEASE_MANIFEST.json` into the snapshot (private SHA, Workers Build UUID if provided, public tag, Node 22, `npm run build:web`).
5. Optionally runs `npm ci` + `npm run build:web` and scans `client/dist`.
6. Optionally pushes an orphan commit and tag `source-YYYYMMDD-<shortsha>` to the public remote.

Pass `WORKERS_BUILD_UUID` and `WORKERS_VERSION_ID` as env vars so the manifest matches production.

## After publish

1. Confirm the in-app URL in `client/src/legal/sourceOffer.ts` still points at the public mirror.
2. Clone the public tag in a **second** clean directory and repeat `npm ci` && `npm run build:web`.
3. Record SHA / tag / build UUID in locks §39. Do not mark invitations ready unless every §39 mandatory gate passed.
