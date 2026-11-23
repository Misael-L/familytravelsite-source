# Built native planner rehearsal

This test-only entrypoint reuses `planner-availability/fixture.mjs`: actual Family handlers, planner cohort, navigation/Trip recovery boundaries, native desktop/phone screens, stores and repositories. The SDK/notification/weather/category/header responses are synthetic. Unknown backend contracts fail. It does not replace the application bootstrap or prove the full application's sign-in flow.

`demo.mjs` adapts the Barcelona scenario from `liketrek/TREK` commit `dc36c21c08f681fd2806764fad8e17b270f6f175`, `server/src/demo/demo-seed.ts` (AGPL-3.0; see the repository LICENSE). The local TREK checkout was at `95d62b7a02f3209d927504f5d21b3efe5065d2bc`; its seed file was checked identical to that pinned reference. Eight names, four dates, the nine original location/day assignments and one day-note scenario are adapted. There is an additional second restaurant visit, a genuine local midnight and an evening clock. Descriptions, addresses, coordinates, UUIDs and image bytes are synthetic. No upstream seed/reset command runs.


`productionFixture.mjs` builds both fixture HTML entrypoints using the application's unchanged production Vite config, React compiler, Tailwind paths, target and chunk settings. It writes into a fresh evidence directory and serves only that built output on loopback. The normal `client/dist`, hosted sites and schema are untouched. The native shared fixture supplies task/packing RPC packets required by the complete bundle; the older partial response allowlist is retired. Both Axios and fetch go through the actual Family handler.

The profiles are desktop (1440×1000), phone (390×844) and tablet browser (1024×1366, native desktop web layout). A native iPad app's wide touch shell is not claimed tested. The test checks eight locations, four days, ten visits, distinct repeated restaurant visits/notes, disabled Tours/Road trip, actual inspector fields and decoded variant/gallery objects. Local generated WebP files distinguish 192×128 thumbnails from 1200×800 heroes; the gallery must decode the hero at its full dimensions. Tiles are synthetic. This proves native consumption, URL selection and decoding, not production photo availability or quality.

The fixture has real qualified permission/recovery controls rather than an absent controller. This suite interacts only with read surfaces; native supported writers are exercised separately in the availability suite. A synthetic provider route response is fulfilled locally and recorded separately. All other nonlocal requests and every `/render/image/` attempt are blocked and fail the run. Service workers are blocked so they cannot bypass interception; PWA lifecycle acceptance remains separate. No actual SQL/RLS/Auth/Storage behavior is claimed by these synthetic screens.

From the checkout's `client` directory, using Node 24:

```sh
P04AS_OUTPUT=/private/tmp/native-browser-NEW node tests/browser/planner-native/run.mjs
```

Use a fresh absolute output directory. The runner builds locally, starts isolated headless Chrome, captures timeline/inspector/gallery screenshots plus decoded dimensions and diagnostics, and closes browser/server. `production-build.json` records the build kind, version, unchanged Vite configuration hash and emitted artifact hashes. The Mac Chrome application path is configured in the runner. Do not deploy these fixtures or their built output.
