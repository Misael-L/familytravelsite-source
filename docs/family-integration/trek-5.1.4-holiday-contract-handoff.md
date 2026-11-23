# U05-B1 — Family holiday provider/handler reconciliation

Completed 13 November 2026 UTC, on `codex/trek-v5.1.4-family-reconcile` in `/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4`. Application commit `7e3b342a45d123d918b66585dc23eec0f2b4519e`, parent `385c8f620cefbbd964c7ca3a13026f86660e410f`. Full upstream 5.1.4 merge and every prior Family packet remain in ancestry. **B1 is locally qualified; B2 booking/stay contracts are next. U05 and release acceptance remain incomplete.**

## Implemented contract

The actual Family backend reader now calls the documented [Nager.Holidays v4](https://nagerholidays.com/api), through the unchanged legacy re-export and the real Axios/application/Vacay handler. The unused Nest service was not substituted as proof. Countries use `/api/v4/Countries/Available`, holidays `/api/v4/Holidays/{CC}/{year}`. Existing output/saved calendars retain IDs, region, settings and English `name` fallback; nationalHoliday maps to global and subdivisionCodes to counties.

Country/year, full row/date/year/country/region/type shapes and response counts are validated. A 1 MiB streamed body bound and 10-second header/body deadline apply. Credentials/referrer are omitted, redirects refused, no uncontrolled retries occur, and failures cannot become a successful empty calendar. A genuinely empty array remains valid. Caller cancellation and original user/person/Family/source retirement abort work, cancel stalled/late bodies and prevent late publication; an unrelated Trip refresh does not cancel this global lookup. Whole-day writes, partial-day refusal and calendar-administration permissions retain their existing behavior.

Exactly eight application/support paths changed, individually hashed and explained in `runtime-scope.json`. The actual carryover verifier still reconstructs 120 original/revised files (eight approved revisions), now nine per-file patches and 21 additions. Original 120 entries, first seven patches and 21 additions are unchanged. Two new exact patches and four corruption tests were added; actual guard rules and quality baselines were not relaxed. All twelve native layouts remain byte-exact to pinned upstream 5.1.4. No native layout, package/lock, accepted source pin or SQL change occurred.

## Fresh validation and limits

- 58 backend provider tests and 70 client tests passed, zero failed/pending: 128 final methods, including 25 new real-handler cases and 45 existing calendar/navigation/request regressions. Intermediate reruns are not extra coverage.
- 90 adversarial source/history/inspector/carryover cases passed; the actual carryover check passed. Configured backend/client typechecks and all seven existing quality gates passed. Scoped ESLint has zero errors, no new warning category and no warning in the new handler test. Its two pre-existing handler warnings remain; complexity decreased 54 to 49. Format baseline remains 2137, unchanged.
- The ordinary committed-source Family production build passed under Node 24.22.2 with only the earlier loopback public anon fixture; no qualification activation or hosted secret. All 3474 generated files were hashed. Only public anon JWTs were found; private/secret-key matches zero. Bundled v4 provider is present and old v3 URL absent. The 33,631-byte native worker retains skipWaiting/clientsClaim. This artifact is a local fixture build, **not a deployable target selection**.
- Two public API probes were unavailable (`HTTPError`; HTTP code not retained). Live availability/CORS/browser lookup is therefore **unverified**, not diagnosed as a provider failure. Unit tests mock public fetch. No real database/Auth/TOTP/Storage or native browser proof was acquired in this packet. Earlier U05-A 856-client and schema 129 acceptance remain separate inherited receipts.

The first typecheck rejected incomplete fixtures/untyped cleanup spies; they were corrected to real required fields/typed callbacks, without casts or compiler-rule changes. The first lint found a new handler-length warning; extracting route validation removed it. Diagnostic notes and final logs are retained.

## Preservation and next

Canonical 129 migrations and 296 migration/test sources, canonical mixed index, old 5.1.2 worktree/16,885 tracked hashes at `60b1e092a`, 81 prior evidence seals/5,973 members and 26 original-backup nonmedia hashes verify unchanged. Original media/ignored ETL were not scanned or written. No hosted DB/settings/billing, preview/production/main/push/publication or media transformation occurred.

Proceed with [U05-B2 booking/stay contracts](trek-5.1.4-booking-stay-contract-packet.md). Keep timing writes refused until their actual timezone/identity contract is proved. Native stay fields require genuine canonical links, not guessed hotel/time matches. Final provider and browser acceptance remains in U05-C/F3c. F4 publication hygiene/F5 typed catalog and explicit accepted-source adoption remain held; strict source/native/history gates still describe qualified 5.1.2 and are expected to reject this unadopted candidate. Do not weaken or repin them early. Independent/off-device restore and incremental backup remain separate work.

Private stage: `/private/tmp/trek-u05b-contracts-20261113`. Sealed canonical evidence: `evidence/u05b1-holiday-contract-2026-11-13`.
