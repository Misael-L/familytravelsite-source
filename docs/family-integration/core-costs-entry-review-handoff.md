# Q99 — Costs consumer review and cleanup transition

Reviewed 18 November 2026 on the private integration branch, from `2008e3549fbf783201f08d96b1d39024ac5ea70b`. [Evidence and replay](evidence/costs-entry-review-20261118/README.md).

The current integration candidate displays native TREK desktop/phone Costs with Family adapters. The older `legacy/components/Budget/CostsPanelFamily.tsx` belongs to the separately retained legacy main/App/planner/workspace chain. Its absence from the current reviewed entry graph is confirmed independently of existing scanner exclusions. All 30 remaining size failures have no current static or literal lazy-import path. Dynamic retry/cache behavior, tests/tooling and alternative entry support are explicitly separate; this is not blanket deletion proof.

660 existing Costs, canonical expense/FX/payer mapping, permission and session/trip-replacement regressions pass with zero failures or skips. No current functional defect was demonstrated by these cases. The older component has not been rewritten or admitted as a substitute for native Costs. No UI, data, API, schema, queue, permission or stored image behavior changed.

Four source/native/Git/backend guards pass. Size still fails on exactly the same 30 lines; no baseline, exclusion, suppression or rule change. All prior application/configuration/test bytes and 135 fixed Q98 source/declaration inputs remain exact. Q98 build/compiler/warning acceptance is reused at those identical inputs; no fresh execution or hosted acceptance is claimed. Keep G1/G2/G3–G6 open at their real scope.

## Exact next packet — Q100 bounded legacy entry retirement

Start the [planned cleanup checkpoint](pre-production-retained-source-cleanup-packet.md) with these candidate paths only:

- client/src/integrations/family/legacy/main.tsx
- client/src/integrations/family/legacy/App.tsx
- client/src/integrations/family/legacy/pages/TripPlannerPage.tsx
- client/src/integrations/family/legacy/pages/FamilyTripWorkspaceShell.tsx

These are candidates for a retirement prototype, not files already approved by a graph alone. Recheck their complete incoming import/export edges, all literal/nonliteral lazy paths, configured and manual/alternative builds, public/offline/recovery/worker/provider entries, tests, scanner-ownership fixtures and source/license obligations. Current scanner ownership explicitly names legacy main/App/planner; retain meaningful synthetic ownership tests and do not weaken rules to accommodate removal. Clarify whether any alternative legacy entry is an intentional supported deliverable. If so, retain it and report that precise requirement; do not silently remove supported behavior.

Prove native current entries and all Family wrapper/repository/identity/queue/recovery/media contracts keep the same reachable modules and runtime source bytes after the candidate retirement. The current FamilyFrontendController and FamilyAdminPage remain imported; their active compatibility dependencies must remain. Keep shared Family APIs/readers/writers/backend packages, historical migrations, all twelve protected native presentation files and ignored ETL/backups untouched. Do not delete the whole legacy directory or all 30 findings. The old Costs panels remain in place for their own subsequent consumer/export review.

Only if those conditions are proved, remove the bounded island in an isolated prototype and reconcile its exact source provenance rows and pins. The source checker compares committed qualified trees; real deletion requires explicit reviewed source qualification, never merely dropping a row or exempting a path. Preserve original upstream provenance/license and prior deployed corresponding-source archives. Rehearse affected tests and ownership/source scanner controls before applying. Then produce a fresh clean committed-source build/compiler, ordinary warning/format/size gates, artifact binding controls, preservation proof, source archive and normal private push. Report exact removed versus retained findings and the next bounded candidate, with no hidden gate.

If a prerequisite fails, keep the candidate source intact and fix the demonstrated consumer requirement first. Do not resume large inactive-UI decompositions by default. This packet is a targeted cleanup review at the current pre-production quality stage; it does not authorize a deployment or database change.

Use `/private/tmp/trek-core-costs-review-20261118/next-baseline-private.json` after the verified private push. Preserve canonical 151 migrations/370 sources/index/README, all earlier sealed evidence and unrelated checkouts. Shared backend checkpoint remains 8cc0fe3f; website only, iOS deferred. Main, hosted preview/production, Supabase, settings/billing, image transformations, media, independent backup/restore and public mirror remain outside this packet.
