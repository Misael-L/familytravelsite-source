# Building a later Family web release

Use a reviewed clean commit and the existing sanitized corresponding-source/Cloudflare release procedure. The repository package version identifies upstream TREK; it must not be reused as the only identity for every Family deployment.

For a candidate build, set both `APP_VERSION=family-YYYY.MM.DD.N-rc.K` and `FAMILY_RELEASE_BUILD=1` on the existing `npm run build:web` command. For an approved final build use `APP_VERSION=family-YYYY.MM.DD.N` with the same flag. Replace placeholders with the chosen release ID. The build rejects a missing/invalid Family ID under this flag; local/dev and unit workflows retain their existing defaults. Do not deploy the local loopback fixtures or the acceptance A/B version IDs.

Before deployment, verify the emitted `client/dist/family-build.json`: version equals the approved `APP_VERSION` baked into the bundle; the named entry is present; its decoded file size and SHA-256 match; the descriptor is absent from the worker's precache; `/family-build.json` has no-store headers and is not SPA fallback HTML. Perform the existing artifact credential scan and source publication checks. No additional credential or database configuration is needed for this public file. Cloudflare documents this static-asset `_headers` behavior in its [Workers headers reference](https://developers.cloudflare.com/workers/static-assets/headers/); a later live release must still verify the actual response.

An update-aware active page receives the native new-version notice without an automatic mid-edit reload. The user chooses Reload page. An older page that predates this bridge may need one ordinary reload to receive it. Runtime metadata discovery is not proof that every new feature works, and startup repair is not a database/media restore.

This documentation does not authorize deployment, public source publication, push, main merge, source-pin adoption, production migrations, billing or settings changes. Those steps retain the existing separate release gates and matching-source publication requirements.
