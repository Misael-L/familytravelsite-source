# U05-B2b3d — lodging saved/shared/ancillary read audit

Date: 14 November 2026. Parent: `bc158366cf9f03450c319652a8b80fbd4bf681bb` on `codex/trek-v5.1.4-family-reconcile`. This is a bounded reader repair and acceptance record, not a deployment or general feature activation.

## Actual findings and repairs

The installed qualified planner already reads accommodations and reservations from one validated canonical booking/stay observation. The standalone older application handler did not: it claimed success with empty accommodations and could assemble a partial legacy bundle. Both raw GET routes now refuse with `503 family_stays_unavailable` before private ancillary reads. The installed complete-cohort handler remains the authoritative live path and is unchanged.

A valid saved v4 package already contained the lodging projection and supplied it through the native stay read port. The saved HTTP-like accommodations endpoint was missing. It now serves the actual validated projection under the existing generation/owner/Trip lease. A genuinely empty complete v4 core may return an empty list; older packages without lodging completeness explicitly refuse with `503 saved_stays_unavailable`. Filtered saved accommodation/reservation requests refuse just as live complete paired reads do. Saved writes remain refused. The route dictionary now checks its own keys; inherited names such as `constructor`, `toString` and `__proto__` no longer pass its allowlist.

Family public sharing has no implemented link lifecycle or sanitized public backend contract. `/shared/...` and `/trips/:id/share-link` now refuse explicitly before private Trip reads. Direct, Propose, Deny or anonymous test contexts do not enable this feature. No token is echoed in the refusal, no native sharing capability is enabled, and no private DTO is published.

## Supported and unavailable states

- Qualified live paired reads: existing complete-core observation, current database authority and generation fences are unchanged.
- Qualified saved v4 lodging: original-device, original-owner recent read-only access, not fresh online membership. The endpoint, actual Family fetch/Axios transport and native `accommodationRepo` consume the same projection. Private lodging notes and booking confirmation details remain private owner content.
- Old saved formats: historical meaning retained; no relabeling as lodging-complete v4 and no fabricated empty lodging success.
- Other saved ancillary reads: existing validated task, packing, budget, file-metadata and member projections remain unchanged. No new writes or replay paths are admitted.
- V4 image preparation: still unconnected. The saved v4 session deliberately uses placeholders, and the existing preparation admission parses the earlier envelope family. Existing source/format allowlists do not establish v4 preparation support.
- V4 private file preparation/opening: still explicitly unavailable; metadata presence is not byte readiness or file access authority.
- Public sharing: unavailable. A future server-side, allowlisted public projection and link capability lifecycle must precede frontend activation. Do not spread a private complete core into a shared response.

## Measured acceptance and limits

The initial 93-case reproduction had 13 failures. Final focused coverage has 102 passed, zero failed/pending, including 27 new cases against the parent. The synthetic linked-booking fixture preserves equality between both references when inserting private-note sentinels; an intermediate inconsistent fixture was rejected and corrected, without weakening the validator.

The affected regression run passes 1,731 cases across 61 files, zero failed/pending. It covers the real handler/module composition, Family fetch/Axios, strict complete-package parser and fake IndexedDB cold reopening, native lodging repository, old saved formats, sharing refusal, media preparation and native consumers. New endpoint tests retire reads after source, Family, person, logout, reconnect, pending queue, generation, expiry and visible-Trip changes. They refuse foreign Trips, disposed leases, filters, inherited route names and attempted saved writes without fallback or queue execution.

Configured client typecheck, scoped lint without warning growth, seven unchanged quality gates, backend carryover, 88 source/toolchain regression checks, qualified and ordinary builds, descriptor/JavaScript syntax and public-key-only dist scans are recorded in the sealed results. Three existing release holds remain: qualified source, native presentation metadata pin and history pin. No baseline or qualification expansion is an acceptance shortcut.

No new GoTrue, SQL/RLS, service-worker or actual-browser proof is claimed here. Those unchanged dependencies inherit the prior real Auth/PWA checkpoint; the new saved handler boundary is tested through the actual modules with synthetic identity and fake IndexedDB. No services or database instances were started for this packet. No database rows or schema were changed or re-counted; source preservation checks verify all 136 migrations/317 migration-and-test sources, the mixed canonical index, 12 exact upstream layouts, dependencies/qualification pins, and all prior sealed evidence. Original backup, media and ignored ETL are untouched.

## Finite continuation

Next: the v4 preparation packet beside this handoff. Establish the accepted-envelope/media context and connect ready public variants first; retain explicit private-file refusal until its generation-owned lease is proved. Keep public sharing separate. Then refresh release readiness against the actual supported surface rather than assuming every upstream feature works. Source-adoption, hosted migration/API/publication and release gates must be assessed before any preview update. Independent off-device recovery and incremental backups remain separate outstanding work.
