# U05-A — complete TREK 5.1.4 source merge

Execution completed 12 November 2026 local time (13 November UTC). **The full source candidate is merged; U05 compatibility and release acceptance remain in progress. Next is U05-B Family contract reconciliation.** No preview/main deployment, hosted SQL, feature activation or corresponding-source publication occurred.

## Exact branch and preserved history

- Successor checkout: `/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4`.
- Branch: `codex/trek-v5.1.4-family-reconcile`.
- Application merge commit: `901f1649df07df53ce208e5e23e0c651e650042f`.
- First parent: latest complete Family branch `60b1e092a9b7ab49ce00c4256ce7e7dffd9f4075`, including the schema129 correction review snapshot and every earlier packet.
- Second parent: immutable upstream 5.1.4 `2bcfc1bfcbbff0affd097c0f789c835396389572`, including 5.1.3 `6fbe10fe6383b18f9cbdb97fe55b8993de951dea`.

This is a real two-parent merge of the full upstream tree and history, including shared/server/test/build/assets/native-app/documentation changes. No subset-copy or version-only upgrade was substituted. The original 5.1.2 branch remains at `60b1e092a` in its original worktree; no branch/tag/history was rewritten. Existing source pins still describe the last accepted 5.1.2 runtime `b93124b2609a614ce67420bab77fa8a8580d154b`. This distinction is deliberate: source adoption waits for the remaining U05/F4/F5/F3c acceptance.

## Source review and exact repairs

The refreshed inspector still finds 406 upstream changed paths, 42 review overlaps and five actual textual conflicts. All upstream-only updates/deletions match the immutable target; the large Atlas asset was fully hashed. All twelve protected native layouts match 5.1.4 exactly, including DayPlanSidebar. No protected list, source guard or arbitrary directory allowance was relaxed.

The five conflicts were resolved deliberately. ReservationModal and TransportModal retain Family's admitted editor session, actor/source/revision fences and retained-file behavior; their native seed inputs now exclude refresh-only days/places/stays/cost arrays as upstream requires. Vite retains Family descriptors, aliases and the independent recovery entry while adopting upstream icon chunking and PWA dependencies. Root packages retain Family workspaces/scripts and exact Wrangler4.125.0 while incorporating upstream dependencies. Every installed package name/version/integrity originates in either the pinned upstream lock or preserved Family lock. Missing cached packages were fetched from npm; install lifecycle scripts were disabled, and no node_modules tree was copied.

Quality checks additionally exposed 17 bounded repair paths, individually inventoried. The export hook now directly uses the existing shared packing view model while preserving its publication/current-owner checks;141 export/session tests first proved that repair. An existing nonexistent `packing.list` label now uses the existing translated `packing.title`. Fifteen exact formatter violations were corrected; their AST code bodies and import-binding multisets remain identical. These are reported quality failures, not a blanket formatting pass. No quality baseline was expanded. Their initial failure logs and final passing results are retained.

## Fresh qualification on the committed candidate

- **856 passed / zero failed / zero pending**,43 client test files, one final combined run. This includes all changed upstream client tests plus Family editor identity and packing export/private-session regressions. Earlier715/141 runs are diagnostic parts, not extra distinct coverage.
- **86 adversarial source/history/inspector/carryover tests passed**.
- Configured client, shared and Family backend typechecks passed. The initial client run exhausted Node's default4GiB heap; the established8GiB setting passed, with no compiler rule changed.
- All seven existing page/layer/offline/pairing/format/localization gates pass. Formatting remains2137 accepted legacy entries, exactly its existing baseline. Actual Family carryover verification passes:120 originals/revisions, seven patches and21 recorded additions.
- The final ordinary Family production build passes using Node24.22.2 and the audited lock. It uses only the earlier loopback public URL/anon fixture and no qualification activation flags. The3474 generated files were hashed; JWTs are anon only and no private/secret key was found. The generated worker is33,631 bytes and retains upstream's direct skipWaiting/clientsClaim autoUpdate behavior. The first scanner expected an older message-based activation marker; the scanner was corrected to the actual unchanged TREK contract, with no runtime worker workaround.

These are source/unit/type/build results. They do not prove real Auth/TOTP/PostgREST/Storage/browser flows, Firefox drag behavior, a hosted upgrade, a final whole-client/server suite or a working advanced feature. No native server or MikroORM migration was started against Supabase. Database129 acceptance is inherited from the sealed prior packet; no database was contacted in this source packet.

## Held release boundaries and next work

Actual source/native/history guards still pass on the untouched old qualified branch. They deliberately refuse this new candidate under unchanged5.1.2 metadata; this is recorded as a held gate, never a passing5.1.4 status. Carryover passes on the candidate. Do not re-pin the complete working tree merely to silence those refusals. U05-C must bind a tested committed runtime and explicit per-path inventory after the remaining compatibility/publication/catalog work settles.

[U05-B](trek-5.1.4-family-contract-packet.md) must reconcile the separate Family holiday adapter (still provider v3), refresh-safe form/session semantics and canonical booking/stay response/saved contracts. The current Family `/accommodations` response is explicitly empty and `projectBooking` exposes no linked-stay fields; upstream optional fields alone do not supply those facts. Reuse genuine canonical data or document a separate bounded schema/read-contract change; do not invent a hotel, coordinates, times or relationships. Bakery/grocery catalog semantics and geographic ownership refine F5. Tours and other unsupported controls remain gated.

After B and F4/F5, perform final F3c/U05-C against the correctly guarded schema129 derivative, including original-row preservation, real native desktop/phone/service flows, zero blocked `/render/image/` attempts, source-pin adoption and publication/build/rollback readiness. Hosted executor authority and R5 engine/time-zone qualification remain release prerequisites. No preview/main change follows from this source commit.

Private execution stage: `/private/tmp/trek-u05-514-20261113`. Sealed receipts live in canonical evidence `u05a-source-5.1.4-2026-11-13`. The old branch/worktree, canonical source/index,129 migrations, prior evidence, original backup/media and ignored ETL are preserved. Independent/off-device recovery and incremental backup remain separate existing work.
