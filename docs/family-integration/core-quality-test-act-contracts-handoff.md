# Q35 — synchronous React act contracts in active tests

Completed locally 16 November 2026. This closes Q34's test callback/Promise continuation. It is a test-contract correction, not a change to the website or a newly reproduced runtime failure.

## What changed and why

Sixteen expression-bodied callbacks returned values from synchronous helpers to React `act`: a boolean from resize `dispatchEvent`, the chainable Vitest timer utility, and the Leaflet map returned by `setView`. The installed React typings therefore selected the Promise-returning overload rather than its synchronous void contract. The callbacks now call the same actions in explicit block bodies and return nothing.

The five files are `useElementRect.test.ts` (one callback), `useToastQueue.test.ts` (six), `useTripSplashBeats.test.ts` (six), `useDashboardTimezones.test.ts` (two) and `MapView.leaflet.test.tsx` (one). No genuine asynchronous operation is discarded, cast or hidden with `void`. Installed-project TypeScript before/after proofs establish synchronous underlying action types and the resulting `act` type changing from Promise to void.

Reversing only those sixteen wrappers reconstructs every original test file byte for byte. Actions, arguments, timings, assertions, imports and all other test content remain exact. Runtime hooks, MapView, native controls and every other application file are unchanged. This does not claim the live resize observer was broken. Dormant ZoomTracker and gated Roadtrip/Tours remain untouched.

## Validation and bounded ratchet tightening

- The same43 existing tests pass across five files before and after; no failed/pending case or new test. Their names/statuses are identical. These are component/hook and actual Leaflet tests, not a fresh live browser or hosted acceptance test.
- Scoped ESLint removes exactly16 `@typescript-eslint/no-floating-promises` warnings. The13 existing `trek/no-window-globals` and five non-null warnings remain exact, with0 errors; there are no new findings or suppressions.
- The actual project formatter accepts the same three formatted files. The other two keep their existing grandfathered states/membership. No whole-file legacy reformat or formatter policy/baseline change.
- Client typecheck, committed local `npm run build:web`, all four actual source guards, correct-source artifact scan and wrong/missing-source rejection controls pass. Tests/typecheck/typed lint finish before the workspace build; global lint runs afterward with128 declaration outputs and changed client inputs hash-fixed.
- Only `client/scripts/eslint-baseline.json` → `tests` → `@typescript-eslint/no-floating-promises` decreases from33 to28. All other entries and original bytes are preserved. This is the frozen monotonic ratchet exception, not a policy expansion. The actual installed final gate reports neither an over-budget nor a stale entry for that rule, proving its count equals28. Current global tests fall3047→3031; the test allowance falls2881→2876.
- G2 remains blocked: actual final totals are errors0, source3554/3455, tests3031/2876, suppressed84/83 (now/baseline). Size keeps the exact same32 failures. This packet does not clear inherited debt or update unrelated stale allowance entries.

Incoming clean integration/publication HEAD: `1c3c0a6b678d8b55a6fa9ed5e65da336471963e9`. Test/budget implementation: `356f00470fa80e8e674f6983445a2e9877d39d1b`. Qualified local build source: `729f160465021f352573dc881c8e3c18ad187da0`. Ten website paths are reviewed: five tests, the one lowered budget, two provenance files and these handoff/checklist documents. The later documentation commit does not relabel the build.

## Preservation and next

All12 protected native runtime/layout files retain11 upstream-byte-exact files and the fixed Sidebar type-only identity. Q31–Q34 routing/search behavior, backend carryover, original operation/payload/retry IDs, actor/Trip/source/session boundaries, permissions, Undo and stored image variants remain exact. All370 canonical schema/test sources,151 migrations, C's mixed index,193 prior seals/12483 members,11 auxiliary manifests and three other checkouts are preserved.

**Next bounded G2 candidate: remaining active test Promise callbacks**, beginning with the retained warnings around save callbacks in `client/src/components/Packing/useBagCardEditor.test.ts` in the current unchanged source. Refresh scoped lint and original hashes before editing; distinguish synchronous utility returns from genuine async save/queue work. Await genuine Promises and preserve operation/revision/retry identities and slow-save/conflict tests. Do not apply the synchronous wrapper pattern blindly. Batch only a verified finite group; if the lead no longer exists, select another current active G2 group rather than repeating Q28–Q35. Existing source floating-Promise allowances are an inherited separate scope, not authority for a bulk baseline rewrite.

Keep the [release checklist](core-release-prerequisites.md) and [deferred cleanup checkpoint](pre-production-retained-source-cleanup-packet.md). Current protection/incremental capture, independent DB-plus-Storage restoration, hosted compatibility/engine facts and target-specific preview/source acceptance remain open release gates. No feature activation, database/browser fixture, hosted SQL/settings/billing, production/preview deployment, main update, remote push, backup/media/ignored ETL or transformation changes. The unchanged isolated planner/base-packing profile is used only for the local build; local publication remains check-only/unbound.

Private originals, drivers, typed before/after contracts, byte reconstruction, formatter acceptance, regression and final diagnostic receipts: `/private/tmp/trek-core-quality-test-act-contracts-source-20261116`. Canonical evidence records the final local documentation commit and sealed hashes.
