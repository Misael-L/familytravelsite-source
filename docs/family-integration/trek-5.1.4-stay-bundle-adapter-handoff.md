# U05-B2b3c4 — original atomic stay-bundle service and queue

Locally qualified on `codex/trek-v5.1.4-family-reconcile`, from `38131e4072c90f12dbfb0e61fa54e7a90bd3fede`. Canonical and disposable database schema remains 134. No new SQL, dependency, native layout or source-adoption change is part of this packet.

## Implemented behavior

A separate strict contract and four-RPC browser SDK port handle the schema-134 stay/new-hotel-booking bundle. The old stay command/outcome dialect remains separate. Original observations preserve nested location/source facts; operation, stay and reservation identities remain fixed. Validate the 1 MiB command bound, UTF-8 field limits, real civil dates, unknown versus midnight clocks, second precision, valid overnight windows and independent stay/booking notes. Normalize empty confirmation codes to NULL only before retaining the original request.

One complete original-operation queue item holds the bundle. Explicit retry inspects the server outcome first; identical intent cannot become several browser-side create/link requests. Fresh login may inspect or cancel the old intent but cannot rebind its write. Exact retained-row comparison preserves metadata presence, unknown ownership, competing Trip work, packing dependencies and in-flight session/source/account/Family/person/Trip/layer/registry replacements. A deleted or altered retained row is not silently recreated by the same channel.

A genuine committed response lost in transport is reconciled without another create. If the confirming read fails, the retained operation remains available and the next attempt refreshes current content. A receipt is not current content. The service returns a validated fresh coherent v2 booking/stay core, including a newer server edit, only after its fences and exact queue acknowledgement succeed.

**No native/cache publication occurs in this service port.** It does not install handler routes, connect native Add or publish an incomplete saved generation. Step 4's ancillary/publication requirement remains an activation prerequisite: the later native consumer must use the already guarded complete cohort and authorized ancillary loaders after confirmed original work is cleared. That existing cohort correctly refuses unresolved queued work; its guard was not weakened to make this packet pass.

The old stay queue now shares the exact ownership kernel, without sharing a response dialect. Regression tests preserve existing edit behavior. Tests also demonstrated that generic replay would dispatch the new URL and reset held `syncing` metadata. Two targeted changes in `mutationQueue.ts` hold the bundle protocol and preserve held-protocol metadata. The upstream file was not reformatted. The carryover manifest records only the two new backend files and exact hashes; old import/revision/patch/source pins are unchanged. Its count assertion changes from 25 to 27 additions; the existing loop adds two real tamper/refusal cases.

## Fresh acceptance

- 915 client stay/native-consumer/cache/recovery/offline-queue regressions in 30 files, including 77 new mocked bundle contract/session cases.
- 22 backend SDK tests in two files, including six new bundle cases.
- 15 enabled installed-SDK/PostgREST/RLS/IndexedDB cases, with zero skips: atomic creation, persistence/reopen, lost replies, failed confirming reads and cold recovery, distinct repeated stays, stale competing edits, current permissions, fresh-session inspect/cancel, AAL1/expired-session refusal, changed retained metadata, newer content, source change and logout.
- Client/backend typechecks, changed-client lint with zero diagnostic growth, supplemental recommended TypeScript lint for the two new backend files, seven unchanged website quality gates and 97 source-guard tests.
- Default web build with a synthetic loopback/public-anon environment, secret scan and final JavaScript/descriptor checks. No native qualification flag or deployment.
- All 324,419 original rows across 240 COPY projections preserved; all 587 pre-bundle functions preserve bodies/owners/ACLs/configuration; eight schema-134 bundle routines retain narrowly scoped non-superuser ownership. All 134 migrations and 311 canonical migration/test sources, the canonical mixed Git index, 12 native layouts and 93 earlier evidence seals/6,835 members remain exact.

Auth/session/factor metadata in this new candidate is synthetic; signed SDK/PostgREST/RLS and database behavior are real. This does not establish GoTrue login/refresh/enrollment, Storage recovery, independent backup restore, native creation/browser acceptance or a new full-repository test run. The three existing source/native/history adoption guards still intentionally hold under the 5.1.2 metadata until full 5.1.4 release qualification; no pins were moved to hide them.

Safe receipts and exact final source hashes are sealed separately from private fixture tokens and raw restored data. The candidate is `/private/tmp/trek-u05b2b3c4-adapter-20261114`; only this packet's new PostgreSQL, PostgREST and loopback relay are stopped after final checks, with containers/volumes and ordered restart instructions retained. Previously accepted candidates remain stopped and unchanged.

## Remaining native milestone

Native stay Add and recoverable removal are still gated. Upstream Add also creates an arrival-stop/visit; the schema-134 bundle intentionally does not. The next packet must reconcile that single user action transactionally and provide reachable confirmed-Trash discovery/restoration. Do not hide a second browser request behind a successful first save or expose Remove without a restoration path. Core/ancillary hydration, current permissions and original queue recovery must be tested together before exposing these controls.

Production, preview, main, hosted SQL/settings/billing, push/publication, image transformations and original backup/media/ignored ETL remain unchanged.

[Implemented SQL contract](trek-5.1.4-atomic-stay-create-contract.md). [Next native milestone](trek-5.1.4-native-stay-cutover-packet.md).
