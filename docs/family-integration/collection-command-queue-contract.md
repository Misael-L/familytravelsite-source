# C5b2b1 — durable Collection originals and recovery boundary

Prerequisites: local schema142, C4 observed authoring, C1 lifecycle, strict Collection transport and C5b2a native reads. This packet adds no Supabase migration/API. It qualifies command persistence and the shared recovery component; ordinary handlers and native write/removal controls remain gated. The complete C5b2b cohort is not accepted while the unprepared cancellation gap below remains.

## Durable wire and device ownership

The account/source-owned Dexie mutationQueue stores a dedicated format3 envelope. Generic replay's supported ceiling remains2; Collection originals are explicitly held by the /family/collections/ locator even if a malformed older stamp appears. This requires no IndexedDB table/index migration. tripId=0 is the existing non-Trip/global storage sentinel, never a Collection masquerading as a Trip. The UUID parent is explicit in the locator and body. Do not interpret the locator as a fetch endpoint.

Exact content envelope: version1, source_url, operation_id, scope (Family/Collection/user/person/session identity), kind:content, decision:execute|cancel, before_state:active, after_state:active, preparation (scope including lifecycle revision, operation UUID, normalized action/body, exact observation), original:null|the validated server original. Lifecycle envelopes replace preparation with the exact C1 original and retain before/after root states for fresh reads. Root restore preserves its archived state; item lifecycle preserves the parent state.

Construction requires a verified source-owned account database, matching persisted owner marker and source/user/Family/person identity, writable lifetime and linked person. Nullable-person global reads remain supported separately; this writable device format refuses an unlinked person. Database session/MFA/permissions remain authoritative. JWTs, passwords and service credentials never enter envelopes.

Normalize before observing. Persist a new request BEFORE calling preparation. Compare-and-swap the exact queue row when saving the returned original, and persist that original BEFORE execution. Only original adoption and one-way execute→cancel are permitted body transitions; source, scope, UUID, request, observation and known original cannot be rewritten. A failed insert sends no prepare; a failed original save sends no execute. One unresolved original per Collection, with independent parents kept distinct.

Every dispatch holds the existing account-wide cross-tab lock. Generic replay never sends, rebases, marks syncing, rewrites or discards Collection originals. Offline/lock/read-only/quota/owner/refusal errors retain the request. RPC replies have a bounded30s deadline: a timeout is an unknown result, never evidence that the server rolled back. Late replies do not resume abandoned callbacks. Same operation/request/original is used on recovery; no automatic re-observation or replacement UUID.

## Outcome and settlement

Check only discovers. Retry performs the retained decision. Cancel persists its one-way decision before contacting the server. Current-session execution is required; a new session for the same source/account/Family/person/Collection may discover/cancel prepared work but cannot execute an old original. Lost preparation replies recover the server original; lost execution replies discover the receipt. Commit winning against cancellation is reported as committed.

Receipts are historical facts. The coordinator obtains fresh active/archived content or a checked Trash context and verifies receipt revision floors before calling the synchronous publication port. The complete queue row is rechecked after remote waits and before acknowledgement. Async/failed/stale publication retains the original. Successful publication/acknowledgement removes only its own row and pause-marker entry; other originals and source data remain intact. Explicit read-state override changes only the fresh read target, never the retained intent.

The existing logout protection, source-owned original-work export and unknown-version preservation apply. Sign-out may leave format3 rows paused by the source owner metadata; fresh authorized recovery is explicit, never automatic replay.

## Recovery boundary

FamilyCollectionRecovery is a shared desktop/phone boundary supplied with one qualified command session. It exposes retained Check/Retry/Cancel, bounded root/item Trash paging and observed Restore. Root rows are restricted to that session's Collection; an unrelated root must never reuse its restore action. Session/generation checks discard stale local callbacks. Item/root identities and history remain available through the session. This component is qualified through mounted tests and real local Auth/REST; it is not installed in ordinary website navigation yet. The C5b2c host must mount it and the complete native controls together after all prerequisites qualify, preserving native layouts and explicit permissions/unsupported states.

## Never-prepared requests — C5b2b2 repair

The exact retained preparation is now resolved through V2 discovery/cancellation, with an immutable database cancellation fence for requests never prepared. A fresh authorized session can settle that intent without inventing an original or item. A delayed prepare is refused under the shared actor/op lock; an earlier commit remains committed. Lost replies/read/publication failures keep the same row until the terminal receipt and canonical view are confirmed. Prepared requests retain their existing original protocol. See [exact V2 contract](collection-request-cancellation-contract.md). Full recovery qualification and ordinary activation remain pending.

## Completed recovery qualification — C5b2b3

[Recovery contract](collection-recovery-qualification-contract.md) adds bounded Trash/history traversal, owner-lifetime isolation and selected-deletion Restore binding. A changed deletion conflicts before a new original is retained; successful terminal settlement refreshes the visible recovery pages. Initial pending reads fence both late results and errors. C5b2b is accepted locally; ordinary native activation remains for [C5b2c](collection-native-cutover-packet.md).

## C5b2c1 — keep displayed observations and scope editor lifetime

[Displayed-edit contract](collection-native-edits-contract.md) closes the submit-time observation gap. Existing-content mutations require the exact shown selection. Scoped command children fence every later stage when an editor retires; the parent retains recovery ownership. The request/original wire, queue format and database APIs are unchanged. Ordinary native activation remains held for the complete C5b2c cohort.
