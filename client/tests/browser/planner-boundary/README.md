# Family trip boundary rehearsal

Follow-up to `../planner-native/README.md`. Uses its unchanged, attributed Barcelona demo adaptation and synthetic raster bytes. Mounts the **actual FamilyTripBoundary**, UUID/native parameter bridge, native desktop planner or phone shell, checked publication owner, governance reader, and observed location form handler. An explicitly installed cohort selects this path; no default bootstrap is imported or enabled. The copied legacy controller must not mount for that owner. It is still the unchanged default when no cohort has been installed.

The fixture uses a synthetic Family session and SDK responses, not a real signed-in account. Ancillary reads and normal phone routing remain explicit local stubs. Core planner/governance/form requests pass through real client handlers and schemas. Unknown requests fail; nonlocal requests are blocked except the reported routing URL, which Playwright fulfills locally. All `/render/image/` attempts fail. The SDK fixture also fails if any RPC inherits an IndexedDB transaction.

Each screen waits beyond the native splash, verifies four days/eight saved locations/ten visit identities, opens the native inspector and decoded hero gallery, then changes the repeated restaurant's name through its native editor. Desktop uses the dialog's **Update**; phone uses the Places action menu, details sheet and its own **Save** editor on a day without that visit. The observed command must contain the canonical location UUID, original revision/layer and edited name, execute once, reload the changed pool row and leave no queued command. A subsequent checked My Draft switch must reload the boundary and permission context. No native component markup/style is replaced or edited.

Synthetic `saveLocation` is only a test boundary, not a substitute database implementation or a proof of SQL/RLS/idempotency semantics. The fixtures do not exercise the real Auth SDK, actual Storage objects, Realtime driver or every ancillary application adapter. Existing source guards and prior database/command packets cover separate concerns. Legacy plan export refuses this new controller rather than synthesizing legacy city DTOs.

From the integration checkout's `client` folder, with its Node version:

```sh
P04AT_OUTPUT=/private/tmp/p04at-boundary-review node tests/browser/planner-boundary/run.mjs
```

The temporary loopback server and isolated Chrome close on completion. SDK/HTTP/model logs and native timeline, inspector and final screenshots are saved to the specified local evidence folder. The known initial obsolete-scope reservation-read diagnostic is recorded; other console errors fail. Do not deploy the fixture or the localhost-only test build.
