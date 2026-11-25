# C5b2b3 — bounded Collection recovery and observed Restore

Schema143 is unchanged. This packet qualifies the shared recovery boundary and closes its demonstrated lifetime/selection gaps. It does not install ordinary Collection navigation, membership or editing controls. Preserve the exact upstream5.1.4 layouts, typed identities, Family permissions, retained originals and stored media variants.

## Verified owner lifetime

Each CollectionCommandSession instance receives its own React owner lifetime, including the first render; a new instance cannot display the predecessor's Trash/history/pending state while waiting for an effect. Retired/unmounted owners cannot publish late successes or errors. Initial pending reads have a monotonically checked request identity, on BOTH resolve and reject. Starting an action supersedes an older pending read. The initial asynchronous read is skipped if its effect has already retired, including StrictMode cleanup. One action runs per mounted owner; duplicate clicks do not begin duplicate Restore commands.

The host remains responsible for retiring old command/read sessions and enforcing repository generation/source/account/Family/person/session/Collection identity at every callback, including A→B→A. Component unmount does not take ownership of unrelated consumers' shared sessions. The command coordinator still enforces source-owned database, current write lifetime, immutable operation, account-wide lock and exact queue CAS before publication/acknowledgement.

## Bounded paging and history

Trash pages use the existing server timestamp-plus-UUID keyset and25-row requests. Timestamps retain microsecond precision; milliseconds are insufficient. Root pages retain the authorized Family cursor but only this Collection's row receives a Restore action in this boundary. Item pages bind the current parent. Never transplant a cursor between targets. Root/item history uses descending revision keysets; each record's immutable snapshot revision must match the outer history revision, as well as the existing parent/source binding.

The mounted boundary appends only unique IDs (Trash) or revisions (history), retaining previous rows on a transport/contract failure. It refuses overflow past1,000 displayed records or the existing16MiB/JSON traversal limits rather than silently truncating. Switching item/root history starts at its own initial cursor. End-of-list is the server's null cursor. A failed request is not successful empty data. Authorization/session refusal clears protected visible pages and reports the refusal; persisted original work remains protected.

History displays the retained name, personal notes and independent location description as escaped text with its revision/time. It does not expose raw database JSON, internal ownership IDs or private file bytes. History viewing does not rewrite current content or automatically restore a version.

## Restore selects a deletion, not a replacement observation

The boundary passes the exact decoded selected Trash metadata to retainLifecycle's optional observed argument. It must be a deleted record belonging to this Collection/Family and the requested target. The coordinator obtains the current authorized recovery context under the existing queue lock, and requires its complete target metadata to equal that selected row before retaining any new original. A changed revision, deletion timestamp, lifecycle, parent or other target fact conflicts409. An active/wrong-parent selection is refused before dispatch. It cannot silently restore a later deletion after another user restored and re-trashed the record.

The retained original still freezes the checked current context, operation UUID and expected revisions. The existing database command rejects subsequent concurrency; retries recover that original rather than refreshing into another intent. An archived/deleted parent produces an explicit state conflict for item Restore; it must be restored/unarchived first. The valid response is still strictly checked, with state-change refusal409 rather than a malformed-contract502.

Successful terminal settlement uses the existing canonical read and synchronous owner publication before acknowledging its exact queue row. The boundary then reloads Trash/history from the first page so a restored item is removed and old cursors are not reused. Failed canonical settlement retains its original. No bulk transactionality or automatic history-version restore is invented.

## Acceptance fixture and scope

The owned cold fixture reconstructs accepted143 from the pinned accepted142 dump plus the exact accepted143 migration/ledger. No new migration or API is introduced. Preserve all362,463 source rows/256 COPY projections/143 historical ledger arrays,676 routine definitions/owners/ACLs,349 prior canonical sources/mixed index,126 prior evidence seals/8,776 members and12 upstream layout files.

Synthetic data contains55 deleted roots,55 deleted items and56 root/item versions. Trusted fixture setup assigns tied timestamps one microsecond apart without disabling policies or triggers; that clock setup is not a public-writer acceptance claim. Actual observed Restore and authorization are exercised through real SDK→GoTrue/PostgREST→database commands. Core command tests and large recovery samples use separate synthetic accounts, since a single-root fixture must not share55 pre-existing deletions. All permission-mutating suites and SDK phases run sequentially with separate account sets.

C5b2b is accepted locally after this recovery qualification. C5b2c must bind the complete ordinary native reader/membership/writer/recovery cohort and prove final-artifact desktop/phone/PWA behavior. Source-adoption/hosted-readiness holds remain closed; no hosted migration/settings/billing/deployment/main/remote push/media/backup/ETL/transformation change occurs here. Independent database-plus-Storage disaster recovery remains unproved.
