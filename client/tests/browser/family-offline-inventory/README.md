# Offline Trip cache acceptance — D14

This harness runs the real application, installed SDK and generated worker against the positively marked disposable loopback fixture. It now requires actual completed logout to remove known retired planner snapshots, with native read/HTTP cache cleanup, static worker-cache preservation, cold offline recovery and current-access reconnect intact. The second synthetic account has no active Family membership and must reach the actual Family access refusal.

D13's former retained-row assertion was a reproduction of a bug, not desired behavior. D14 fixes that retention and adds persistent actor/per-Trip generations. Complete offline Trip reading is still disabled: persisted content remains the checked planner view and variant descriptors, not all Trip companions or downloaded media bytes.

Prerequisites:

- A private mode-0600 synthetic fixture under `/private/tmp/trek-u03d12-*` prepared with the existing guarded local fixture helper.
- A final real artifact under a `/private/tmp/trek-u03d14-*` build directory. The expected layout is `build-qualified/actual-dist` with its adjacent `actual-build.json`; no SDK replacement or test-only app entrypoint.
- A fresh `local-current.json` from the canonical D14 evidence `verify-current.py`. It verifies the disposable marker/project/config/container/ports, no production Family fingerprint, 119 migrations, frozen source inputs, artifact hashes and unchanged original Trip/task/file/visit rows. Never point this at a hosted project.
- Node24.22.2, root-installed Playwright and the existing local Google Chrome.

Run from the candidate repository root after producing the guard:

```sh
FAMILY_OFFLINE_INVENTORY_FIXTURE=/private/tmp/trek-u03d12-20261110/desktop-fixture/private-fixture.json \
FAMILY_OFFLINE_INVENTORY_DIST=/private/tmp/trek-u03d14-final-20261110/build-qualified/actual-dist \
FAMILY_OFFLINE_INVENTORY_LOCAL_PROOF=/private/tmp/trek-u03d14-20261110/local-current.json \
FAMILY_OFFLINE_INVENTORY_OUTPUT=/private/tmp/trek-u03d14-20261110/new-desktop-run \
node client/tests/browser/family-offline-inventory/run.mjs
```

The output folder must not already exist. Repeat sequentially with a new folder and `FAMILY_OFFLINE_INVENTORY_PROFILE=phone`; do not race actual logout in two browsers using the same account. Add `FAMILY_OFFLINE_INVENTORY_SEED_LEGACY=1` to exercise an actual IndexedDB v1-to-v2 upgrade. That optional branch uses a blank storage-setup document to create a known synthetic legacy row before loading the unchanged real main/App/SDK/worker. It does not replace an app/SDK/RPC answer. The old row must disappear and the owner store must exist after normal bootstrap/login.

The HTTP/CONNECT/WebSocket proxy covers worker and page traffic and permits only the local artifact origin and exact `http://127.0.0.1:55331`. Connection resets are recorded separately and never converted to successful responses. `inventory.json` contains synthetic scope identifiers, field names, counts, hashes and paths/statuses, not cached payloads or auth headers/passwords/TOTP/SDK tokens. Review failure screenshots before publishing. No Trip/task/file/visit command is executed by this inventory; the separate native task harness qualifies original writes/retry/recovery on an isolated fixture.

This does not prove every cross-Family scenario, cryptographic erasure, multi-day offline availability or a backup restore. Unknown future read-cache formats remain inaccessible rather than triggering a database-wide purge. Retained original commands/import files are separate protected data and survive intentional signout according to the qualified recovery policy.
