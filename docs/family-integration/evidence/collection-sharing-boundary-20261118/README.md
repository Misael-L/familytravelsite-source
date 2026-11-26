# Q126 — Collection sharing online data boundary

18 November 2026. Incoming `e6a7ec30760530b37212386daddfd4503014a9f0`; implementation `84e722d1c5a760bfca263f0c69fea3d568550eff`; local runtime build `b5164ce88b736dffe20ae5c46a22869e64187f96`. [Packet handoff](../../core-collection-sharing-boundary-handoff.md). **The bounded read-layer repair is verified. Three quality gates and full release acceptance remain blocked.**

## Runtime behavior and preserved ownership

The Collection sharing state hook now reads invitees through `client/src/repo/collectionSharingRepo.ts`, using the existing available-users GET endpoint. The repository explicitly requires an online connection and checks the original read session before sending and before returning a successful result. It stores no roster in Dexie or module memory, has no offline cache fallback, queues nothing and changes no endpoint/payload/identity. Every fresh read goes to the current endpoint; permission/network failures propagate rather than using a previous roster.

The hook changes only its import, existing formatter import ordering and the call receiver. Inverting exactly those changes restores its entire original source byte-for-byte. Collection/account/open/owner/view/epoch/current-session checks, effect cancellation, synchronous write locks, stale callback/error handling, selections and desktop/phone behavior remain. Existing useCollectionSharing, API module, native store, Family handler, session/queue sources and all markup remain exact. The existing Family store/handler continues to refuse unsupported sharing; this repair does not enable invitations or other unsupported features.

Two intentional protective changes: a newly requested lookup while forced offline refuses before reaching the API, and a successful response after its original read session ends is refused at the repository boundary. The existing hook catches current read failures as an empty list and discards retired replies. No new UI, schema, durable roster or writer authority is introduced.

## Fresh verification

All154 existing sharing/native consumer/store/Family gate/offline-scanner cases remain unchanged and pass. Thirteen new cases cover the real repository GET route, fresh uncached reads, offline refusal, permission/network errors, original-session retirement, late responses across close/reopen/collection/account roundtrips/session changes, old failed refreshes and owner permission loss. Total167 pass,0 fail,0 skip. The new forced-offline hook case fails on the original implementation and passes after the repair; the other six new hook cases already pass on the original guards. No earlier test/assertion/skip was removed or altered.

Layers, pairs and size freshly pass. All four scoped runtime/test files are formatted and produce0 ESLint errors/warnings/suppressions under the existing configuration; the original hook's diagnostics are unchanged. The ordinary installed compiler passes with128 fixed declaration inputs. The real strict checker is also rerun: all four scoped paths have0 strict diagnostics, global636 and every existing scored per-file count remain identical; the global strict gate still fails. No strict baseline, exception or compiler policy changes occur.

Four source guards pass after the one existing source-addition update and three precise new additions. The committed-source local build passes using the same synthetic isolated planner/base-packing public configuration and no advanced qualifications. Correct-source artifact scan passes; wrong/missing source controls refuse. All3793 generated files are retained in a verified separate-inode copy after a fresh COW probe and full paths/bytes/modes/owners/mtime/flags comparison. The14 raw CSS files and all5 public configuration slot context/policy/pair values remain exact. JavaScript and content-addressed build metadata legitimately change with the new repository; no whole-bundle byte-identity, new browser or hosted writer/deployment acceptance is claimed.

The prior retained runtime build and every earlier logical source/output/archive remain. Native layouts, permissions, data identities, original operations and stored variants are preserved. Backups, media and ignored ETL are untouched; no transform is generated. Canonical151 migrations/370 sources/mixed index/README and all prior evidence seals/other checkouts remain exact. Shared backend source checkpoint stays8cc0fe3f; iOS is deferred.

## Remaining offline gate — one-line proposal, not applied

The real offline checker now reports0 new view/API bypasses. The repaired collectionSharingState import is gone from its offender set. The only remaining failure is the stale `src/components/Collections/useCollectionSharing.ts` exemption, left from the earlier extraction. There are145 actual view bypasses under the existing146-entry debt baseline. The [one-line proposal](proposed-offline-ownership.patch) deletes only that obsolete entry, reducing146 to145 and preserving all other bytes/order. It adds no exception or weaker rule.

The real offline command is still run against the unchanged tracked baseline and exits1 on that sole stale entry. The proposal is not applied or supplied as an alternate baseline to manufacture a passing status. Existing scanner tests confirm stale entries must fail until removed. Its input/proposed hashes and actual fresh/stale sets are recorded.

**Approval boundary:** the earlier [automatic-review restriction](../retained-stylesheets-20261118/approval-block.json) rejected persistent quality-baseline mutations without specific approval. Q125's user approval covered the exact RTL/i18n corrections only. The new offline-baseline deletion is separate and awaits specific approval. No new automatic rejection occurred in Q126. The authorized runtime implementation, testing, qualification, build and private checkpoint are completed before requesting that approval.

## Remaining quality and release work

Strict and offline are freshly measured failures as above. Duplication remains an unresolved gate; its last measured inventory is17619 lines across285files and is not rerun or described as a new Q126 measurement. Earlier pages/RTL/i18n/skips/warning/format receipts remain dated at their qualified scope; this packet does not claim all CI or a complete quality pass. Relevant scoped source/tests/architecture/format/type checks are fresh, and all quality policy/baseline bytes remain exact.

After the bounded evidence commit, run the unchanged strict check-only source archive and normally push only the private integration branch, verifying the exact remote checkpoint and unchanged main/older integration heads. Fast-forward only the clean local publication checkout. A check-only unbound archive proves source preservation, not publication/deployment. Save the new private baseline after verification. Production, preview, hosted Supabase, billing/settings and the public source mirror remain unchanged.

## Next bounded packet

1. Start from this packet's verified private checkpoint and `/private/tmp/trek-core-collection-sharing-20261118/next-baseline-private.json`. Do not repeat the completed data-layer repair or earlier registration/metadata work.
2. Obtain specific approval for the exact one-line stale offline exemption deletion. Recheck current baseline hash and actual offender/stale sets; if unchanged and approved, apply only that line, run the real offline command from both supported working directories and its existing contracts, preserve source provenance and checkpoint it. No runtime rebuild is needed for a metadata-only deletion after proving runtime/build inputs exact. If intervening changes affect ownership, re-review rather than applying blindly.
3. Continue actual strict typing/duplication repairs from measured diagnostics and dependency witnesses. This packet's complete strict file-count map matches Q123; preserve that source of evidence. Do not increase allowances, add casts/non-null assertions/any to hide errors, drop tests, blanket-exclude legacy source or delete by filename alone. The duplication inventory needs a fresh scoped dependency review before code retirement or sharing.
4. Preserve all earlier source/proofs/backups and separate hosted schema/API/protection/source/preview admission gates. The supported-core preview and production/main are not authorized by this local build or private source push.

## Replay limits

Raw before/current strict diagnostics, test logs, generated output, fixed declaration hashes and preformat observations stay under `/private/tmp/trek-core-collection-sharing-20261118`. Original runtime/tests are recoverable from the recorded incoming Git pin. Scope helpers expect the implementation stage before qualification/docs edits, fixed installed dependencies and fresh temporary paths; do not execute mutation helpers inside sealed evidence. Historical receipts are not fresh runs. The build needs externally supplied synthetic fixture values matching the recorded public-pair hashes, not production credentials. No live private Storage, browser, provider, current hosted schema or independent database-plus-files restore is proved here.
