# P04av native availability rehearsal

Use Node 24 from the integration client with `P04AV_OUTPUT` pointing to a writable local evidence folder:

    node tests/browser/planner-availability/run.mjs

The actual Family boundary, explicit cohort, native desktop/phone planners, permission hook, Lists/Tasks/Costs/Files screens and application handlers run on loopback. Direct Family grants do not advertise unsupported ancillary saves. Task details remain readable; phone task toggles/fields/save/delete honor the same permission check as other controls. Each native location editor still saves its observed canonical record, reloads it and switches to My Draft. Screenshots, native returned data and availability maps are retained.

SDK rows/session/planner RPCs, header/category reads, notification/weather and media are synthetic. Unknown SDK reads and unhandled external or image-transformation requests fail. Normal phone routing is locally fulfilled and counted separately. No live SQL/RLS/Auth/Storage/Realtime or complete site claim is made. The template and collection-picker fixtures are explicitly empty; raw template/booking repository writes remain refused and are not enabled by this check. Do not deploy the fixture or localhost build.

Known native exception: the unchanged phone shell still renders its unconditional Add expense launcher. It is counted in the evidence; its writer remains refused. The test does not claim every native launcher observes action availability.


## TREK 5.1.2 production-build qualification

The runners now use `../productionFixture.mjs` and the application's production Vite configuration instead of the old custom dev server. Both Axios and fetch requests use the actual Family adapter. Test entrypoints and SDK responses stay synthetic and undeployable; they do not mount the full `App` startup/sign-in flow. Service workers are blocked to preserve request interception.

`run.mjs` exercises the native desktop/phone location editor, My Draft transition, task create/edit/completion/reorder/Trash/restore, ancillary reads and original permissions. Its known unconditional phone Add expense launcher remains reported with its writer disabled. It does not enable packing, booking, expense or file writes.

`run-startup.mjs` covers desktop, phone and tablet browser profiles, each with a held task read/reconnect, one denied task read followed by explicit retry, and an existing retained conflict that must survive retry unchanged. A tablet browser uses the desktop web layout at 1024px; a native iPad app is a separate platform. The nine scenarios check atomic publication, visible recovery, original queue preservation and no legacy task reads.

Run each with a fresh output directory; the generated build cannot overwrite an existing capture:

```sh
P04AV_OUTPUT=/private/tmp/availability-NEW node tests/browser/planner-availability/run.mjs
P04AV_OUTPUT=/private/tmp/startup-NEW node tests/browser/planner-availability/run-startup.mjs
```

The U03-D5 packet also separates native UI auth persistence from the Family auth snapshot. Recognized old native caches are copied without erasing their source; Family snapshot bytes and database/queue names remain intact. Dedicated actual-store and logout/offline regression tests qualify that migration. The browser fixture never substitutes its synthetic session for evidence of real Supabase authentication.
