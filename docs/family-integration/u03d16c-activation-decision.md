# U03-D16c activation decision — 11 November 2026

> Historical D16c decision. D16d implemented the explicit recovery action; [D16e reviews the current runtime and media boundary](u03d16e-activation-decision.md). The missing-action observation below applies to the earlier artifact.

**Review complete; broader activation refused.** Runtime remains `b01b039a050f826f68e97372cbe3a62e64a1f77a`, documentation parent `0930bc812c4662d5a5a591464cfd20ced0cd2791`, on `codex/trek-v5.1.2-family-reconcile`. This review adds only an actual-browser observation and documentation. It does not implement legacy recovery or enable ordinary/hosted behavior.

## What the actual app proves

On desktop and phone, the compiled App, actual SDK password/TOTP and generated worker first select the verified source-owned database. A synthetic older `trek-offline-u<person-key>` database then contains a pending original command and an imported File, without an owner marker. Its numeric person key matches the current account. Settings shows no retained-work export action for those originals. Restart preserves all legacy stores/bytes exactly; it neither selects nor stamps them.

For a positive control, the verified current-source database receives an import with the **same compound key** but different bytes. The actual Settings export action appears. Its browser download independently decodes as v3 with the current immutable source owner and only the current import. It does not contain, recover or acknowledge the legacy command/File. Actual SDK logout preserves both stores' original fields and bytes and the owned marker.

These are **16 passing review observations, eight per profile, two actual zero exits**. Two earlier pre-format runs are diagnostic/repetition only, excluded from the acceptance count. The assertion that recovery is unavailable passes because it observes a blocker, not because recovery has been implemented. `activation_permitted=false`; `legacy_recovery_complete=false`.

## Selector and lifecycle audit

1. `offlineTripQualification.ts` still requires exact `local-v1` and `http://127.0.0.1:55331`. It gates the recent published read path and its guards. No arbitrary URL, environment alias, remembered account or UI setting enables hosted cold reads.
2. `nativeSourceOwnership.ts` accepts only explicit canonical/localhost qualification endpoints. The alias exercises source isolation, not cold-read activation. The policy is installed during Family bootstrap. New ownership is initialized only after actual accepted bootstrap/hydration; cached locators may identify an existing owner but cannot initialize it or authorize a write.
3. `sourceDatabase.ts` binds source, Auth user, Family, Person and native key into a namespace and immutable key-0 marker. Reads/writes verify it; mismatches, implicit unverified creation and future schemas refuse. Pause key -1 holds command IDs without rewriting original command status/schema/attempt fields. The source-owner regression suite and earlier actual source/worker/Person/Family cases remain associated with their exact qualified artifacts.
4. `queueStatus.ts`, `originalWorkExport.ts` and native Settings inspect the selected database. Their v3 exporter has current connection/epoch/private-lifetime checks and durable ownership. This is appropriate for owned work but is **not a legacy discovery or device recovery selector**. Import-only owned work is covered; current numeric identity never proves ownership of the legacy namespace.
5. Ordinary legacy `reopenForUser`/pause maintenance is unsuitable for a raw recovery tool: it can rewrite supported legacy commands. Do not call it to inspect or export unattributed originals. Do not temporarily disable the owner policy, copy legacy rows into an owned DB, infer their source from cached trips, or interpret a same-person key as authority.
6. Logout and source/actor return preserve originals and retire saved-read authority as qualified. Current SDK session retrieval alone is not fresh membership/MFA authorization; no change to that distinction is proposed. Native observers continue to use the selected owned database rather than silently merging namespaces.

## Evidence and honest coverage

- Fresh focused gate tests: **40 passed, zero failed, actual zero exit** across the export-enabled, database-guard and source-owner test files. No test source was edited.
- **11,601 runtime/unit/shared/public inputs remain exact** against the source-owner full run: **28,876 passed, zero failed/unhandled, 93 existing pending**. That full result and its 21 new regressions are inherited, not a new full-suite run in this review.
- All prior driver bodies remain byte-exact after removing the additive helper/dispatch. Three actual standard/ordinary/alias artifacts are independently hash-verified, not rebuilt. Thirteen prior evidence sets/1,117 files verify against their existing manifests. Prior 151 browser checks qualify their recorded source-owner artifacts; they are not counted among this review's 16 fresh checks.
- Fresh scoped lint has zero errors or warning-category increases; all seven unchanged format/layer/offline/RTL/theme/skip/i18n gates pass. The review helper's initial formatting failure was corrected and both browser profiles rerun on the final driver. No baseline expansion or runtime change was used.
- Twelve protected native layouts remain upstream-exact, fifteen baselines unchanged, 120 backend carryover files and 119 migrations preserved. The original mixed source's 15,129 hashes/HEAD/index are unchanged. Marked-local domain rows, original audit history and Storage bytes remain exact. The two previously recorded synthetic membership audit appends are retained; this review adds no domain mutation or fixture reset.

Allowlisted receipts, final browser inventories, source hashes and manifests are in canonical `evidence/u03d16c-activation-review-2026-11-11`. Credentials, raw downloaded originals, profiles and private baseline bodies are excluded. Passing receipts do not establish independent database-plus-files restoration or off-device backup.

## Required repair and activation boundaries

Implement [explicit device recovery](unattributed-device-recovery-packet.md) next, initially under the same bounded local qualification. It exports deliberately selected unmarked work as **unattributed**, without introducing source identity, server authority, migration, replay, acknowledgement or deletion. The existing v1/v2/v3 contracts remain unchanged. A downloaded plaintext archive is not an encrypted backup or proof of restore.

There is **no widened selector proposed for immediate application**. Before a later activation packet: the exact compiled source and capability version must be explicit; the accepted owner/bootstrap, database guards, read TTL/privacy, export and queue contracts must be reviewed together; unsupported/missing/changed metadata must refuse while preserving originals; ordinary/hosted negatives and same-origin actual worker/SDK boundary tests must pass. Runtime/localStorage/query-string opt-ins cannot bypass that gate. A legitimate new source starts its own empty verified namespace and cannot adopt old work.

Rollback must preserve all old/new original-work namespaces and v3 downloads. Return only to a reviewed owner-aware build, or disable new capture/admission while keeping an explicitly qualified recovery path. Rolling back to pre-owner selection or clearing browser storage is not a recovery plan. Revalidate the original source/actor before fresh complete capture; do not revive a retired body or extend its read deadline from cached identity. A changed account/source cannot reuse a pending recovery selection.

## Remaining acceptance, in order

1. U03-D16d explicit unattributed local recovery/export and its actual desktop/phone worker tests; then revisit this activation refusal.
2. Complete native multi-day download/media/privacy and remaining whole-version/worker compatibility acceptance. Old artifact-specific observations do not cover new runtime changes automatically.
3. Review source-pin adoption (still 5.0.1 despite the full 5.1.2 source merge), then resume qualified packing authoring and preview/main release through their separate packets.
4. Independent database-plus-files restore and incremental backup automation remain separate protection work. The verified existing backup, media and ignored ETL directory were untouched.

No push, merge, production/preview deployment, hosted SQL/schema/settings/billing, SDK/CLI upgrade, backfill, transformation job or original backup/media/ETL operation occurred.

Primary references: [Supabase getSession](https://supabase.com/docs/reference/javascript/auth-getsession) explains cached session retrieval versus identity validation; [IndexedDB open](https://developer.mozilla.org/en-US/docs/Web/API/IDBFactory/open) and [transaction abort](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/abort) support the missing-database noncreation protocol in the next packet. These references are API behavior, not evidence that a recovery feature exists here.
