# Native original-work source owner v1

Implemented only in explicitly qualified local Family builds. Ordinary builds and hosted endpoints retain their existing behavior. The accepted online Family bootstrap establishes an owner containing format `family.native-owner.v1`, the exact normalized configured source URL, Auth UUID, Family UUID, person UUID and native person identity. HTTP localhost and numeric loopback are distinct sources even if the server returns identical identities.

`trek-offline-f1-<SHA256(fixed-order-owner)>-u<native-person>` selects a database. A matching filename, cached UI identity, SDK storage token or local locator grants no initialization, write or export authority. The accepted actor may initialize one immutable `syncMeta` record at key 0, only during creation. Existing and upgraded databases are never stamped. Native store declarations/version 14 are unchanged. Future schemas refuse before an unversioned fallback.

A core transaction queues its raw owner read before caller requests; owner mismatch aborts the transaction. Read results and subsequent writes recheck the captured source/actor lifetime. The owner row cannot be replaced or deleted through native table APIs, including cross-type key ranges. A rejected selection leaves the previous connection and original records safe, without falling back to another account/source.

Source-aware locators only locate an existing, matching owner for a qualified saved read. They cannot create it, establish fresh access or turn a read into authenticated queue replay. Every initialized namespace is selected after current Family validation. Same-actor revalidation preserves the live binding; identity, Family, known refusal and source changes retire it. Returning to A after B selects A again from its accepted bootstrap, rather than adopting B because numeric identities match.

## Original retention and recovery

Reopening a namespace and logout pause queued IDs in metadata key -1. Original command IDs, revisions, schemas, statuses, attempts, dependency fields and imported File/Blob bytes remain unchanged. Captured maintenance verifies the immutable owner inside one raw IndexedDB transaction before changing only pause metadata and caches. It provides no global cleanup privilege and never changes original queue/import stores. Clearing caches preserves the owner marker and refuses while original work exists. Import-only originals remain protected.

Replay excludes paused IDs, including interruption recovery and raw-native parking. Native status projections may present held rows as conflicts without modifying stored originals. A compatible explicit retry releases only its own ID atomically with the intended queue transition; the command must still pass its existing Family source/scope/permission protocol. Unknown formats remain opaque. Direct Family recovery continues to verify its original source and observations.

Legacy/unmarked databases are deliberately left untouched and unattributed. They are neither searched nor silently copied/stamped/opened as current-source work. Their bytes remain available for deliberate device-level recovery; no account-facing legacy adoption or replay selector is enabled. Existing v1/v2 archives are unchanged. A new owner marker must never be invented from their filenames, timestamps or matching identities.

## Version 3 export

Qualified owned databases use `family.original-work.v3`, filename `family-original-work-v3.json`. It retains the v2 bounded lossless graph/checksum contract and adds `source_owner` to the checksummed payload. One readonly transaction captures original queue/import data and verifies durable ownership. Delayed byte reads/download completion recheck the originating connection, authentication epoch and private lifetime. Export never removes, acknowledges or replays records. Ordinary v1 and unowned v2 behavior remain intact; previously emitted archives are not reinterpreted.

This is a bounded plaintext device export with existing signature refusal, not encryption, a production import/restore command, a database backup, or a media backup. Provenance and checksums establish archive consistency; they are not server authorization.

## Qualification

Real Dexie/IndexedDB regressions cover identical-identity sources, account/person/Family changes, creation aborts, immutable markers/ranges, preexisting unmarked/future storage, logout, import-only retention, delayed exports and explicit retry. The actual compiled App/SDK/worker browser test requires separate alias password/TOTP validation, checks B's empty originals and missing export action, returns to A and independently decodes an explicit v3 download with A's exact original fields and bytes. The alias is a bounded local source test; it does not claim testing two hosted projects.

Fresh acceptance receipts and limits are recorded in the canonical U03-D16c handoff. Broader activation, full native download/media/privacy acceptance, source-pin adoption, packing authoring, preview/main release, independent restore and incremental backup scheduling remain separate work.

## Refused-context rendering

Native import/stay lifecycle hooks distinguish context identity from current permission. A newly captured refused context must remain stable; recreating it on every render caused React's render-loop protection to stop the screen. `contextCurrent` only tracks the original connection/authentication epoch and Trip lifetime; it never authorizes an action or publishes private state. `current`, guarded database transactions, `perform`, `effect` and draft publication continue to require source/actor validity. The old condition is reproduced by a failing focused regression; the repair keeps refused callbacks blocked and passes actual desktop/phone refusal and logout flows. Native layout files remain unchanged.
