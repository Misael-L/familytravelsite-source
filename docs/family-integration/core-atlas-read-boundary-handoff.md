# Atlas repository read boundary — local acceptance

15November2026, from `15e9d63dc5f5e3af5304d4ec2f44633b77625f01`, branch `codex/trek-v5.1.4-family-reconcile`. Exact final commit, source/artifact hashes and sanitized qualification receipts are in the canonical sealed evidence. This closes the two offline-architecture failures found during composed task acceptance; it is not final supported-core/preview acceptance.

## Repair and retained contracts

`useAtlasReads.ts` and `useAtlasCountryRead.ts` now read through `repo/atlasRead.ts`. The repository owns the existing five section URLs and selected-country GET. It forwards the original AbortSignal and geography-only30-second timeout and preserves Axios errors/responses. Shared `AtlasReadSection`/`CountryDetail` types move below the view layer into `types/atlasRead.ts`; `atlasModel.ts` re-exports them so current native consumers retain the same shapes. The repository imports no view or store. No new response transformation, fallback, cache, writer or permission path is introduced.

Atlas aggregate/detail reads remain explicitly online-only. Unavailable Family bucket/regions/plugin layers/country details remain501/unavailable; retryable errors remain errors. Statistics/geography publish independently. Existing request generation, cancellation, actor/session/source retirement, same-identity A→B→A and current permission checks remain at their original boundaries. No offline empty-success fabrication or stale cross-account cache is added.

## Qualification

- The unmodified `lint:offline` reproduces2 violations before repair and passes afterward:148→146 direct-API view files against the same146-entry baseline. No baseline or suppression changes.
- All314 affected regression cases in14 existing files pass, including real Family reader→handler→Axios→repository→hook/native desktop/phone behavior. Independent failures/retries/unavailable metrics, delayed old replies, logout/actor/source replacement and StrictMode retirement remain covered. These use mocked low-level SDK/HTTP fixtures; they do not prove a new database/Auth/hosted browser session.
- Client typecheck, scoped lint0→0 warnings/errors, ordinary web build, unchanged artifact credential scanner and all8 structural/offline/layer/localization/style gates pass. Existing global size debt and inherited5.1.2 source-adoption hold remain separate, without wider allowances. Full-suite/hosted/storage/recovery/update acceptance is not claimed.
- All1,496 existing non-test client TSX/CSS files retain exact bytes, including all12 protected native layouts. The five product paths are two read hooks, their existing model type re-exports and two new lower-layer modules. Native layout/style, backend carryover, source-qualification implementation, dependencies and baselines remain unchanged.
- Schema144/all355 canonical schema/test/support inputs, mixed canonical index,134 prior seals/9,309 members and unrelated worktrees remain protected. All159 existing local service states remain exact; this packet starts/stops no database, browser or server. Prior task158-case/10-browser-checkpoint and schema144 aggregate/row/security evidence remain inherited at their original scope, not rerun or added to314.

## Next

Resume `core-composed-acceptance-packet.md` step4 with base packing/groups/export on the frozen core profile, then supported Collection reader/writer/recovery and honest global subsets, original retry/retirement and worker update/reload. Reuse current task and aggregate acceptance. Use a newly owned fixture for new real-DB walks; retained stopped targets stay untouched. The seed recipe requires explicit destination bridging after seed; seeded facts alone are not acceptance. Keep advanced profiles off and do not treat missing demo parity as permission to enable unsupported writers.

Explicit source adoption and current hosted backend/engine/time-zone/protection/recovery/source-to-Worker binding are still release prerequisites. Local publication companion/check-only archive are prepared only; production, preview, main, remote source publication, hosted SQL/settings/billing, original backup/media/ignored ETL and transformations remain unchanged.
