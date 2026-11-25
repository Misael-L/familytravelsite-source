# Original-work archive v2

This archive preserves the active account's unsent/retained native queue and imported source files. It is an explicit local download, not a Supabase database backup, server permission, restore endpoint or instruction to replay commands. Ordinary builds keep the existing `family.retained-work.v1` action. The v2 Settings action requires the existing explicit loopback qualification flag, exact marked local API and active Family frontend.

The producer requires a currently authenticated, already-open positive numeric account database. It never enumerates another account, opens a missing database, upgrades a schema or treats remembered data as current server authority. Capture pins the concrete database and its native connection, offline authentication epoch and private-consumer lifetime. Logout, same-account ABA, another account, a closed/reopened connection or a known private-context/source retirement invalidates preparation and the final download. An already-closed future schema remains a refusal, with its opaque records intact.

## Capture and resource bounds

One read-only IndexedDB transaction captures all rows and primary keys from `mutationQueue` and `importFiles`, including later dependencies and orphaned import originals. It does not select cached Trip data, auth/session storage or downloaded catalog media. Queue rows are never reinterpreted according to their command version. Compound import keys are exactly `[jobId,fileName]`.

Blob reads and hashing happen after the transaction, against the captured immutable values, with ownership rechecked after awaits. The file represents that capture point; unrelated later queue changes are not folded into it. Source records are never acknowledged, updated, discarded or removed following a successful or failed download. A handed-off browser download cannot be remotely erased later.

Limits are 5,000 combined source rows, 100,000 graph nodes, depth 100, array length 100,000, 16 MiB combined decoded binary bytes and 32 MiB final archive size. Exceeding any bound refuses the whole operation without truncation or a partial archive. Getter properties, symbols, unsupported prototypes, Map/Set/RegExp and typed-array views refuse rather than silently losing information. Recognized credential-shaped keys/text, signed-token query parameters and credential-looking binary text also refuse. This is a conservative signature check, not a general secret-classification guarantee or encryption. Archives can contain private notes/documents and are plaintext.

## Import-only preservation

Family cache clearing and logout preserve imported sources even when their last queue command is absent. Clear cache refuses while these originals remain; logout clears disposable read caches but retains the sources in their original account database. This uses the existing Family/cohort retention policy and changes no ordinary native TREK retention policy. It does not grant access to another account or imply server permission.

On the explicitly qualified local Family build, the existing native Settings export action counts imported sources as well as protected commands, so import-only work remains exportable. Other build modes retain the existing v1 action and default queue-only badge calculation. Import-only retention does not turn on v2 export in those modes; v1 remains unable to carry binary imports. A successful download never clears the originals automatically.

## Envelope

The downloaded `family-original-work-v2.json` is UTF-8 JSON with:

- `format`: exactly `family.original-work.v2`.
- `payload`: the exact JSON string described below.
- `sha256`: lowercase SHA-256 of the UTF-8 payload string, before the outer JSON escaping.

Readers first verify that digest, then parse `payload`. Keeping the payload as an exact string avoids cross-language property-order/number-format differences when verifying the outer checksum. Checksums detect corruption; they do not authenticate the producer or grant authority to restore/replay.

The payload contains `database`, `native_version`, `captured_at`, `automatic_replay:false`, `counts:{queue,imports}` and `graph`. `native_version` is the source App's declared Dexie schema version (currently 14, represented as native IndexedDB version 140); it is provenance, not an instruction to downgrade or open an unsupported database. `graph.root` decodes to `{queue:[{key,row}],imports:[{key,row}]}`. Keys and every row field are preserved, including unknown fields, opaque revisions, operation IDs, status/attempts, retention metadata and imported-file metadata.

## Tagged graph

Values are tuples: `['null']`, `['undefined']`, `['boolean',value]`, `['string',value]`, `['number',value]`, `['bigint',decimalString]` or `['ref',nodeIndex]`. Finite ordinary numbers remain JSON numbers; negative zero and nonfinite values use `'-0'`, `'NaN'`, `'Infinity'`, `'-Infinity'`. A reference points into `graph.nodes` and preserves cycles and shared identity.

Node forms are:

- `object`: `prototype` is `object` or `null`; `entries` is an array of `[ownStringKey,encodedValue]` pairs.
- `array`: original `length` and its own enumerable `entries`, excluding the intrinsic length property. Missing indices remain holes, distinct from an explicit undefined value.
- `date`: `milliseconds` is an encoded number, including an invalid date's NaN.
- `blob`, `file`, `array-buffer`: exact standard base64 `bytes`, decoded `size` and decoded-byte `sha256`. Blob/File nodes preserve `type`; File also preserves `name` and `lastModified`.

`graph.binary_bytes` is the sum of the unique binary-node byte lengths. A reader validates limits, references, kinds, counts and byte checksums. It allocates node identities before attaching entries. It must define own properties safely, including a literal `__proto__` key, rather than merging untrusted entries into application objects. Unknown archive formats or node kinds refuse.

The independent test reader is `client/tests/browser/family-offline-lifecycle/original-work-reader.mjs`. Unit and actual browser tests decode generated downloads independently of the producer and compare original command/file data. There is deliberately no production restore/replay API in this packet.

## Verification references

Snapshot consistency relies on a single [read-only IndexedDB transaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction). Source values follow the browser's [structured-clone semantics](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone); the exporter cannot recover information a producer or browser already discarded before storage. The existing native schema admission and account/Family authorization mechanisms remain separate.
