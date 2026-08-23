# Corresponding source (AGPL-3.0)

This tree is a modified TREK derivative licensed under the GNU Affero General Public License v3.0. See [`LICENSE`](LICENSE) and [`NOTICE.md`](NOTICE.md). This file is a **compliance checklist**, not legal advice.

The Family Travel **member web client** is hosted at `https://familytravelsite.lmisael0721.workers.dev` (Cloudflare Workers Static Assets). Corresponding source for each production release is published as a **sanitized public mirror** of the exact tracked commit that built that release — not the private development repository.

| | |
|--|--|
| **Public mirror** | https://github.com/Misael-L/familytravelsite-source |
| **Private development repo** | https://github.com/Misael-L/FamilyTravelSite (not the public offer) |
| **License** | AGPL-3.0-only (`LICENSE`) |
| **In-app link** | “Source code (AGPL-3.0)” on the public login surface and Settings → About / Help |
| **Publication script** | `scripts/publish-corresponding-source.sh` |
| **Program lock** | [`docs/web-trek-supabase-locks.md`](docs/web-trek-supabase-locks.md) §7 and §39 |

## Reproduce the deployed SPA

Requirements: **Node 22** (see `.node-version`) and npm. Unset `VITE_DATA_PLANE` defaults to `supabase`.

```bash
git clone https://github.com/Misael-L/familytravelsite-source.git
cd familytravelsite-source
git checkout <public-source-tag>
npm ci
cp client/.env.example client/.env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your own project, or
# leave them blank to inspect the build wiring. Never put a service-role key here.
npm run build:web
```

`npm run build:web` builds `@trek/shared` then the Vite client into `client/dist`. Root [`wrangler.jsonc`](wrangler.jsonc) serves that directory as a single-page Worker (`assets.not_found_handling = "single-page-application"`). There is no Worker `main`, no Pages Functions, and no Cloudflare Access in front of member login.

Family data lives in the shared Supabase project used by iOS. Schema/migrations are **not** in this web tree; they live in the sibling FamilyTravelApp repository.

## What the public snapshot must include

`LICENSE`, `NOTICE.md`, this file, package lockfiles, source, build scripts, `wrangler.jsonc`, `.node-version`, and the install/build instructions above.

## What the public snapshot must never include

`.env`, `.env.local`, `.wrangler/`, `.dev.vars`, `node_modules/`, `dist/`, untracked `.cursor/plans`, credentials, service-role keys, `CRON_SECRET`, or family data.
