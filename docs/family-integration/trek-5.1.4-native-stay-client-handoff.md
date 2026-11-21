# U05-B2b3c5 — native stay client contract and complete-read checkpoint

The C5 client packet's first phase is locally qualified. The scoped source commit follows `2434e4156f0b59cefc72ceb9ad9e1e4956c18c7e` on `codex/trek-v5.1.4-family-reconcile`. This is an intermediate checkpoint within the same native lodging milestone. Native Add/removal and the new native-operation queue remain gated; no current preview behavior is implied.

## Implemented client boundary

A separate six-RPC SDK allowlist and strict native command/context/acknowledgement/outcome/Trash contracts call the existing schema-135 APIs. The retained shape contains the complete original inner command, fixed IDs, source, actor/session scope and ordered arrival observation. Unknown/non-JSON/oversize or mismatched facts are refused. Only the outer operation executes; the client does not sequence independent stay/booking/visit writes. Historical acknowledgements are validated against original IDs/action/revision; actual no-op saves may retain the same revision. Fresh sessions can inspect/cancel without rewriting the original command session. These are transport/service primitives, not an installed offline replay path.

Trash pages retain unavailable lodging labels and restoration availability. Request/page bounds, keyset order, duplicates, original Trip and final cursor are checked. Cursor comparison retains PostgreSQL microseconds rather than collapsing to JavaScript milliseconds. The service does not turn permission/server errors into an empty list or success.

The default booking/stay v2 read remains strict and rejects the new ownership field. A separately selected, tagged native reader uses the same original actor/session/source/Trip/layer/registry/abort fences and admits one complete core only. Ownership is validated against the actual stay, saved lodging and arrival day, with unique same-Trip untimed active visits. It is never guessed from matching venue/date and never substitutes country/city identity for lodging identity.

Complete v4 offline data can carry explicit `native_stay_format: family.native-stay-view.v1` provenance with the single canonical core. Existing v4 data stays compatible and native capabilities remain false. The producer must select the tagged reader; an ancillary loader cannot inject or replace its core/provenance. Validation, hashes, manifests and revision vectors preserve the ownership field. The projection registers the explicit stay UUID and sets the corresponding native assignment's accommodation identity. Independent same-venue visits stay independent. Source/session retirement and original complete-generation ownership remain required for both warm and actual IndexedDB cold reopen. A provenance marker is data validation, not authorization to enable controls.

Published accommodation cohorts now retain both original array identity and cloned array/core contents, including a truly empty cohort for the first Add. Getters return defensive copies and retain the original asynchronous scope fence. Cold saved snapshots do not manufacture a live write observation. The next writer must compare the actual published array/row contents to the witness and call its fence before retention; merely fetching a new server context must never replace what the user originally saw.

## Actual verification and limitations

- 1,040 affected client regressions in 35 files pass, including old stay/bundle/queue/native consumers and the new read/contract/cache cases.
- 30 backend SDK adapter cases in three files pass.
- Nine enabled installed SDK/PostgREST/RLS cases pass on the explicitly requalified retained schema-135 candidate: whole native create, exact concurrent retry, genuinely lost committed reply followed by inspection, fresh-session inspect/cancel plus old-session write refusal, discoverable confirmed Trash/same-ID restore preserving booking facts, no-op acknowledgement, actual fenced reader and a real native core/cache/projection round trip. The browser-client accessor supplies a real installed SDK with synthetic signed identities. This is not GoTrue, native form, full browser or native offline-queue acceptance.
- Final typechecks, scoped lint with zero added diagnostics, supplemental backend lint, 99 source tests, seven unchanged quality gates, final ordinary local build/secret scan and generated JavaScript syntax/descriptor verification pass. Three preexisting source/native/history adoption holds remain; source adoption is still 5.1.2. No baseline was expanded.
- One intermediate verification run raced the shared-package build's generated-output cleanup. The resulting import failures were not accepted. Final tests were rerun sequentially after the build completed with stable generated artifacts.
- Canonical135/314 migration-test sources and mixed index, original row projections, the 12 protected upstream 5.1.4 layouts, previous evidence seals and old5.1.2 checkout remain preserved. Only scoped website client/SDK/test/carryover/documentation work is committed locally. The final seal binds exact sources, local commit and row/source preservation receipts.

The retained local candidate was checked against its exact previous stopped IDs/images/nonces/bootstrap/volumes before restart. No arbitrary running stack or hosted URL was adopted. Only that candidate's database/HTTP/loopback relay is stopped after testing, with volumes/restart order retained and prior services unchanged. Original backups, media bytes and ignored ETL are outside this packet. Independent full database-plus-file recovery remains unproved.

## Same milestone continuation

Continue sections 2–4 of the existing native stay client packet. Build the whole-command original queue/session and cold outcome-first recovery; then connect native Add/edit/Trash/restore/keepStop with reachable cross-device confirmed-Trash restoration. Wire the explicitly qualified reader into the real complete ancillary/native cohort only after those paths are proved together. Existing readiness refusals for unsupported date/second/overnight presentation remain intentional until the actual native consumer contract is qualified. Do not enable controls based on this read/transport checkpoint.

No new migration, hosted schema/settings/billing, deployment/preview/main/push/publication, native layout/style change, dependency/source pin change or image transformation occurred. The build uses only a synthetic loopback URL/public anon key and was not deployed. Browser zero-transformation acceptance remains part of the native UI phase; this checkpoint introduces no image requests.

Implementation notes: Supabase RPC invocation follows the [official JavaScript RPC API](https://supabase.com/docs/reference/javascript/rpc); package versions/locks were preserved. The exact implemented SQL contract and original C5 packet remain the source for RPC argument/response names and authorization boundaries.

[Continue the same native stay client packet](trek-5.1.4-native-stay-client-packet.md).
