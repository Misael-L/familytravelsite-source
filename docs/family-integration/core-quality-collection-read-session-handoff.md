# Q63 — bounded Collection read-session helpers

Completed locally 17 November 2026. The coordinated read-session factory now meets its existing function-length limit. Session state and request ordering remain together in the original factory.

## Exact source boundary

Only `client/src/integrations/family/collectionReadSession.ts` changes at runtime. Original root/coherence checks move unchanged to private module constants. Two small private synchronous binders return the original library and gateway functions with their original bodies; they add no Promise layer. `collectionCurrent(fence)` creates the original current-result callback, preserving its inferred name and zero-argument signature, at the four original result construction points.

The factory retains its frozen parsed scope, registry/source/transport setup, retirement flag, sequence and item-parent binding maps, check/begin/identity/bind functions, retire method and operation order. Library and gateway closures capture the same original scope/reader/RPC/check values. No shared context bag, map copies, new cast/default/runtime import/export/dependency/cycle, new application API or async forwarding. Factory tokens outside declared extractions and helper/callback body tokens match the original. Constructor validation stays lazy with no RPC or new owner check at construction.

Installed measurements: factory **174→114 lines**, complexity **3**; current/library/gateway binders **11/14/14 lines**, complexity **1** each. Moved root/coherence arrows **5/7 lines**, complexity **2/3**. All new and retained functions meet unchanged **120/20** limits. Scoped lint **1→0 warnings**, errors **0**. Formatted/unlisted; wrapped size **201→197**, below unchanged **1000**. No allowance, rule, suppression or line-packing changes.

## Validation and limits

- **209 existing tests in seven suites pass on original and candidate**, with identical test bytes/names/assertions/result occurrences. No product tests or live fixtures added. Earlier transport source and sealed proofs remain exact.
- **166 actual-module comparisons pass:** 9 constructor, 96 method/default/archived/input cases, 32 delayed retirement cases, 16 same/different-resource supersession flows, 9 identity/binding cases and 4 independent source/session flows. The real schemas/parser/errors, library reader, transport, native views, identity registry and existing fixture data execute with in-memory RPC only. Unexpected default RPC fails closed.
- Cases preserve public keys/order/descriptors/names/arity/async character/exports, constructor order, raw error identity, microtask traces and frozen view/current callback behavior. They cover local/external/registry/A→B→A retirement; delayed success/rejection; per-resource sequence counters; exact observed parent admission; target and owner mutation; membership-derived bindings; validation of a whole binding batch before any association changes; and separate source/session/registry state. A rejected batch leaves an earlier binding usable and its new first-row identity unobserved. Failure results remain failures, never empty data.
- The fixture's editor reply was corrected privately to omit page-only fields, matching the existing valid editor test; no product contract or test file changed. These comparisons establish local adapter equivalence, not hosted authorization/RLS or browser acceptance.
- Clean committed fixture-only build, direct installed compiler, four source guards and bound/wrong/missing-source artifact controls pass with **128 fixed declaration inputs**.
- Actual post-build gate: **0 errors**, source **3456/3419**, tests **2859/2859**, suppressed **83/83**. Complexity stays **242/218**. Function length **144→143 against 130**; 13 excess remain. Same **32 size failure lines**. Every prior closed group and all policy/config/allowance/suppression/format/size bytes remain exact. **G2 remains blocked.**

Incoming integration/publication `2ba79d1ac59575699c66cc13b132e6996e7f3214`; implementation `d1634e7c932ada8743d3e34007cd4dec6a0d3016`; clean qualified build `49a20a03c615c976d0867c0421f8fe18189c5547`. Five website paths: one runtime file, two provenance files and two documents. Later documentation does not relabel the compiled artifact. Corresponding-source archive/publication checkout stay local and check-only/unbound, with no remote push/deployment.

## Exact continuation

Q28–Q63 accepted scopes are closed. Do not keep extracting compliant read-session or transport helpers.

Next bounded review: `client/src/integrations/family/collectionCommandSession.ts`, private `finish`, **complexity 24 against unchanged 20**. Its `run` callback also measures 22; that is a separate remaining boundary, not part of a blanket rewrite. The read session and transport now have no scoped findings; preserve those closed sources.

For `finish`, inspect the original once-parsed receipt union and the contiguous operation/status/ownership/action/item checks before considering a private synchronous guard extraction. Derive the exact accepted type from the existing schemas/selection; do not broaden status/receipt admission or introduce casts, defaults, duplicate parsing, exported APIs or async forwarding. Keep statement order and short-circuit/property-read/error precedence exact, including collectionCommandBelongs and its scope/source arguments. A helper must pass unchanged complexity/length/file/format limits along with the retained method. First freeze the exact source path and selected statements. If no safe coherent extraction exists, document why and choose another demonstrated finding rather than relax policy.

Preserve network/owner/session checks, prepared-original discovery versus execution, old-session refusal, retained operation/revision/body, exact queue row, current view selection, minimum committed revision, read-before-acknowledgment and the existing publish callback/retirement checks. Do not change the exclusive lock, timeout, acknowledgment, retry/cancel/Undo/recovery, offline-source identity or writer profile admission. Use the existing seven Collection suites and actual-module guard/method comparisons for every accepted receipt kind/status, malformed/mismatched scope/source/operation/action/item, current/older sessions, delayed view loads and publish errors. Verify no queue acknowledgment before a qualified current view and no duplicate execution or swallowed error. This is local quality repair, not native activation or live database/browser qualification.

No schema/API/SDK/permission/feature/writer activation, UI/native change, live fixture, hosted/push/deploy/billing/backup/media/ignored ETL/transformation or deferred cleanup. Preserve canonical sources/index/seals, previous packet guarantees and all policies/allowances/suppressions.

Retain [release prerequisites](core-release-prerequisites.md) and [deferred cleanup](pre-production-retained-source-cleanup-packet.md). Incremental protection, independent matched DB-plus-files recovery, current hosted contract/engine facts and real preview/source binding remain separate unproved release gates.

All 370 canonical schema/test sources, 151 migrations, mixed canonical index, 221 prior seals/13,935 members, 11 auxiliary manifests, three other checkouts and 12 protected native files remain exact (11 upstream-byte-exact plus fixed Sidebar return-type derivation). Main/production/preview, hosted SQL/settings/billing, backup/media/ignored ETL and transformations unchanged.

Private reproduction receipts: `/private/tmp/trek-core-quality-collection-read-session-source-20261117`. Canonical evidence records final documentation commit and member hashes.
