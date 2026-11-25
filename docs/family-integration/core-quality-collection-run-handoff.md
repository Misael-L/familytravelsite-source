# Q65 — shared original-session validation in Collection run

Completed locally 17 November 2026. The remaining Collection command-session finding is closed with one private synchronous check at the two original guard sites.

## Exact source boundary

Only `client/src/integrations/family/collectionCommandSession.ts` changes at runtime. Private `assertOriginalSession(packet)` contains the original comparison and `throw this.oldSession()`. The original unprepared-content branch calls it at the same point before preparation; the execution branch retains `if (packet.decision === 'execute')` before calling it. It reads the same current receiver scope separately at each call, with no captured/cached session, default decision, broad context bag or new API.

The run method is byte-exact outside those two guard replacements, and all other original members/imports/top-level statements remain byte-exact, including Q64 finish and its receipt helper. No awaits, RPC/queue calls, lock boundaries, row/packet assignments or short-circuit decisions move. Constructor/profile admission, timeout, original-operation discovery, durable cancellation, prepared-original matching, exact queue verification, old-session refusal, receipt/view checks, acknowledgment/publication/recovery/media remain unchanged. No runtime import/export, cast, dependency/cycle or async forwarding wrapper.

Installed measurements: callback **complexity 22→20**, helper **2**, unchanged limit **20**. Callback **63 lines**, helper **3**, below unchanged **120**. Scoped lint **1→0 warnings**, **0 errors**. Formatted/unlisted; wrapped size **502→503**, below unchanged **1000**. Policies, allowances, suppressions, size/format bytes and prior closed groups remain exact. No line packing or exemptions.

## Validation and limits

- **209 existing tests in seven suites pass on original and candidate**, with identical test bytes/names/assertions/result occurrences. These include constructor/native/IndexedDB command flows; no product tests or live fixtures added.
- **334 comparisons pass:** 125 direct session-guard cases and 209 actual run cases (158 accepted, 51 refused), including four multi-attempt lost-reply sequences. Guard cases compare equal/different/null/undefined sessions and injected property getter errors, preserving receiver/read/comparison/oldSession/error order.
- Actual original/candidate class run, locked, outcome, contentExecution and finish execute with the real transport, schemas, parser/normalizer, command binding and command-queue logic. RPC, store, owner and lock services are supplied in memory; transactions snapshot/rollback rows. The constructor and live database/browser boundaries are not exercised by this harness; unchanged integrated suites separately cover real constructor/IndexedDB behavior.
- Cases cover all seven content actions; lifecycle; check/retry/cancel; unknown/prepared/committed/cancelled/unprepared outcomes; current/older sessions and retained originals; durable cancellation and original replacement; no lock/wrong owner marker/offline/invalid mode; queue write/row changes; malformed/failing/delayed RPCs; retirement, stale views and publication failure. Lost preparation/execution/cancellation/view replies resume the same retained operation. RPC/queue/transaction/lock release, row/packet/decision/original identity, retained data, execution counts, receiver and Promise/error traces match. No duplicate execution occurs across the four replay sequences. No new writer activation.
- Clean committed fixture-only build, direct installed compiler, four source guards and bound/wrong/missing-source artifact controls pass with **128 fixed declaration inputs**.
- Actual post-build gate: **0 errors**, source **3454/3419**, tests **2859/2859**, suppressed **83/83**. Complexity **241→240 against 218**; 22 excess remain globally. Function length **143/130**; 13 excess. Same **32 size failure lines**. **G2 remains blocked.**

Incoming integration/publication `0fbf425bf87317a403829dd18394dc0426be6ef3`; implementation `602e4a8ad5dd5dd7fc1b35b2ec65e1d75dc1136f`; clean qualified build `cae02b74be2cb75ea897dca93b7f13af9236799f`. Five website paths: one runtime file, two provenance files and two documents. Later documentation does not relabel the compiled artifact. Corresponding-source archive/publication checkout remain local and check-only/unbound; no remote push/deployment.

## Exact continuation

Q28–Q65 accepted scopes are closed. Collection command-session scoped lint is clear.

Next bounded review: `client/src/integrations/family/collectionCommandContract.ts`, `parseCollectionCommand`, **complexity 22 against unchanged 20**. Fresh installed diagnostics found no complexity/function-length finding in collectionCommandQueue. Command session, finish, transport and read session are closed; do not keep extracting their compliant code.

Review the contiguous source-URL construction/admission statements immediately after the existing envelope parse as a possible private synchronous validation helper. Pass the original parsed command rather than caching a source string if doing so would change repeated property reads. Preserve the exact new URL call and original protocol/origin/credential/search/hash conditions, their ordering and errors; do not normalize or repair rejected sources, tighten/relax HTTP/HTTPS admission, or move checks across the parse or content/lifecycle branch. This local schema-level source validator does not grant writer/source authority.

First freeze the selected statements/path and inspect captures/type narrowing. Use the exact existing CollectionCommand type, a private bounded helper, and no new cast/default/export/import/dependency/Promise layer. Retained parser and helper must meet unchanged 20/120/file/format limits. Keep all other statements, including envelope strictness, operation/preparation/scope consistency, normalize-before-comparison, matchesCollectionPreparation, original source-field/body omission behavior, lifecycle before/after states, existing casts and once-parsed frozen return identity exact.

Use existing Collection suites plus direct guard and actual parser comparisons with real schemas/normalizer/JSON/errors. Cover every content action and lifecycle target/action, normalized versus rejected bodies, current/retained sessions, exact operation/scope/original binding, omitted/null/empty values, URL protocol/root/origin/userinfo/query/fragment/encoding cases, and malformed inputs. Preserve getter/read/short-circuit/error precedence and the same single parsed result. No policy/allowance/suppression, schema/API/SDK/permission, feature/writer admission, native UI, live fixture, hosted/push/deploy/billing/backup/media/ETL/transformation or deferred cleanup change.

Retain [release prerequisites](core-release-prerequisites.md) and [deferred cleanup](pre-production-retained-source-cleanup-packet.md). Incremental protection, independent matched DB-plus-files recovery, current hosted contract/engine facts and real preview/source binding remain separate unproved release gates.

All 370 canonical schema/test sources, 151 migrations, mixed canonical index, 223 prior seals/14,046 members, 11 auxiliary manifests, three other checkouts and 12 protected native files remain exact (11 upstream-byte-exact plus fixed Sidebar return-type derivation). Production/preview, hosted settings/billing, backup/media/ignored ETL and transformations unchanged.

Private reproduction receipts: `/private/tmp/trek-core-quality-collection-run-source-20261117`. Canonical evidence records final documentation commit and member hashes.
