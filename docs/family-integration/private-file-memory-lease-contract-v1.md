# U03-D16j — private-file memory lease contract

Status: locally qualified; see the sealed D16j handoff/evidence for full process receipts. No deployment or hosted activation.

## Admission and ownership

`completePreparationAdmission.ts` extracts the existing public-image online admission, preserving its strict published/visible Trip, actual SDK and Family identity, database/source, repository context, queue/import and stored owner/head/body checks. The real RLS-protected Trip header is read before admission. Private preparation must use this adapter; supplying a file manifest is not membership evidence. The older image controller retains its strict online checks and refusal class.

The preparation owner captures original source, user/person/Family, Trip, database/read/context generations, layer, complete generation, digest, verification time and expiry. Owner checks allow the legitimate saved projection's temporary null native Trip only while offline, with the same independently checked offline identity. A different non-null Trip refuses. Reconnect after going offline retires the private preparation owner; a new online attempt requires new admission. Actor/source/Trip/layer/provider retirement, original work/import changes, changed stored generation and expiry cancel pending work and drop owned references.

## Acquisition, budgets and retries

No download occurs on opening the component. `prepare('user-request', fileId, options)` is explicit. Selection and acquisition reuse D16i's strict file binding, actual repository metadata and signer, authorized exact object address, before/after metadata checks, decoded MIME/declared size, streamed byte ceiling and original deadline/cancellation. The actual repository file list is obtained inside the acquisition-owned deadline. The strict network request adds `cache: 'no-store'`; the ordinary online preview's established body policy remains unchanged.

Maximum RAM reservations: **64 MiB / four entries**, including pending acquisitions; **50 MiB per file** remains the individual ceiling. An entry that cannot fit is refused before changing older entries. There is no automatic budget eviction, bulk download, hidden background capture or increased limit. An identical pending request with the same caller signal and refresh intent shares its result; differing pending intent/signal refuses as busy. An explicit retry of a completed slot reuses its observed bytes. That is not fresh server membership or proof of current server contents.

An explicit refresh first retires that slot's previous bytes and URLs. A failed refresh cannot fall back to old good bytes. Slot identity fences late cancellation/completion/cleanup from deleting a replacement slot. An online preview failure can retire only the private pool it originally observed, not a later replacement pool. No automatic retry of private Storage access occurs while saved/offline.

The receipt is token-free, format `family.private-file-acquisition.v1`, bound to the original generation/digest/owner and the selected ID/path/created-at/MIME/size. SHA-256 describes the bytes observed. **Server content version remains `unversioned`**: matching metadata and a hash are not an immutable server version, historical retention guarantee or durable authorization grant.

## Native saved preview

Completed bytes remain only in JavaScript memory. A separate actual `openCompleteTripRead` must admit the saved view under the exact original source/scope/owner/generation/digest and file binding. Its verification is repeated before borrowing. A caller or view retirement settles a stalled saved verification without minting a URL. Returned Blob URLs are owned by that slot and saved view, not by the file record.

Warm screens deliberately preserve typed work during an outage. A file-only qualified saved-preview route is installed inside that same document; it does not restart the planner, adopt the saved Trip into native caches or replace native rendering. The existing desktop Files thumbnail and phone Files row/lightbox use the existing preview port/hook. Publication has a route epoch, allowing a previously unavailable file to retry after admission while original actor/source/Trip ownership still matches. Retired props cannot rebind to another owner. Slot/view/provider retirement revokes owned URLs and clears rendered previews. A retired warm route retains a no-data refusal entry so it cannot fall back to legacy native blobs.

The cold saved controller also installs a generation-checked file-only route. A fresh document has **no RAM bytes**, so existing metadata can load but its unprepared preview stays unavailable. Missing bytes never cause a private redownload, legacy blob adoption or original-image transformation. There is no native layout edit.

## Persistence and limits

No private IndexedDB/CacheStorage rows, signed URL persistence, native Trip/file/blob cache replacement, complete-media flag or snapshot mutation is introduced. Public variant caching remains independent. JavaScript can release its own references and URLs; it cannot erase caller-held copies, guarantee RAM zeroization, or revoke previously issued server signatures.

The component is reached explicitly through the guarded local browser driver for qualification. Ordinary/hosted activation and native whole-Trip preparation remain gated. A public-image component receipt and a private warm-memory receipt cannot together promise all files will survive a browser restart. Persistent encrypted private storage, longer offline authority, map/whole-Trip readiness and release require separate decisions and proofs.

## Qualification

The separate marked disposable desktop/phone graphs add one correctly declared tiny private WebP each. The older declared-size/MIME-mismatched PDF remains unchanged and must refuse. Actual App/SDK/password/TOTP/worker/Storage and native previews are exercised without substituting the SDK, renderer or native rows. Each private browser run proves seven observations: explicit guarded admission; old mismatch refusal/preservation; exact positive bytes and retry reuse; warm native decode without requests/store adoption; URL retirement/no fallback; cold metadata without bytes; no private persistent cache/transformation/domain-command or caught app error.

Unit tests additionally cover original-owner changes/ABA, stored generation replacement, deadlines, malformed receipts, reservations, cancellation, stalled verification, refresh denial and late old cleanup. Existing full-suite assertion identities/statuses, native layouts, quality baselines, carried backend files, source/schema and original disposable domain/audit/Storage data must remain intact. The handoff/evidence give actual process receipts and limitations; a Chrome phone viewport does not prove physical iOS/Safari behavior.
