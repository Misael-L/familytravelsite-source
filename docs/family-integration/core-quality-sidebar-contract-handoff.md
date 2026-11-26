# Q30 — truthful Sidebar reorder callback contract

Completed locally 16 November 2026. Both identified Sidebar callback warnings clear. Together with [Q29's nine-location repair](core-quality-warning-provenance-handoff.md), all eleven recent warning-delta locations are resolved. Global inherited quality debt remains; this is not release acceptance.

## Source and fixed scope

Incoming clean integration/publication HEAD: `a95f9208f46f542af4b1b5c4b7e051b9a39c3756`. Implementation/guard commit: `ad7a5626ce0546083f92caf02abf15b87fcc66d5`. Clean committed build/qualification metadata: `5a01a6c8492d66a0766dc09de6967741081bc41d`. Branch: `codex/trek-v5.1.4-family-reconcile`. Eleven frozen website paths contain one client declaration edit, five guard/test scripts, the presentation manifest, two source-qualification files and two handoff/checklist documents. No database or browser fixture.

`DayPlanSidebarProps.onReorder` now returns `void | Promise<void>`. Native Sidebar already awaits this callback at both save sites. Its runtime, event handlers, permission logic, JSX, styles and Undo are unchanged. The real Family save Promise is preserved; no fake `void` cast, swallowed failure, new request or duplicate history entry is introduced. Both synchronous native writers and the Promise-returning Family writer retain their real contracts.

## Preservation contract: eleven exact files plus one exact derivation

All twelve native runtime/layout files remain protected. **Eleven are upstream-byte-exact.** The Sidebar has exactly one version-bound type-only overlay. Do not describe all twelve as unchanged raw files anymore.

The only permitted replacement is the single `onReorder` return type. The full TREK5.1.4 Sidebar base is SHA256 `fdbb934b0ebe02190b3b68b8cf7c4eec526ad6d387970e44ec7b3e634a94340d`; the exactly derived file is `fc9f3da5c00e543afea019aee34e44c116bd6b2814ce9d6ef67347de9f3a26f2`. The verifier requires the pinned commit, exact base bytes, a single declaration occurrence, exact derived bytes and an exact manifest. It accepts no arbitrary paths, replacement text, hashes, wildcard/ignore fields or mutable CLI overrides. A later TREK adoption must explicitly retire/review this5.1.4-specific overlay.

Both native-presentation and Git/release entry points call the same strict verifier. Source qualification independently binds the committed Sidebar exception. A private preservation driver independently derives the one-field edit from the original twelve-file list; it does not trust the new manifest to drop a protected file. The prior guard rejected this edit before the reviewed contract update; it was not bypassed.

## Verification

- 394 application tests pass across six files, including actual native Sidebar cases and existing pending save, refusal, phone lifecycle and original-bound single-Undo cases. No application test or other client file is edited.
- 94 Node guard/release/source tests pass. They reject removed/duplicate files and overlays, wrong identities/hashes, arbitrary replacement/ignore fields, upstream retargeting, layout changes, discarded awaiting, altered Undo, unrelated types, imports and even comment-only Sidebar drift. Both mutable CLI control cases refuse.
- Full-component type erasure emits byte-identical JavaScript before/after (SHA256 `12be2d85ead90f5a36dda6d8aa0e70399635800958525cff736ec739d4fddefa`). All other Sidebar bytes are exact. Typecheck, local `npm run build:web`, four source guards and source-bound artifact positive/negative controls pass. No new live browser walk is claimed.
- Fresh scoped lint removes precisely the two warnings at incoming native TripPlannerPage line350/column29 and line610/column471. Its other findings are identical and its errors stay0. The caller's source remains exact.
- Final actual installed warning gate, after the build and with the client/declaration inputs hash-fixed: errors0; source3557/3455, tests3047/2881, suppressed84/83 (now/baseline). This restores the Q22a aggregate counts; it does not clear inherited over-budget/stale rules. Size still fails on the same32 lines. No baseline, rule, ignore, suppression or size limit changes.

## Exact next action

The Q28 measurement, Q29 provenance/mobile repair and Q30 type-contract packets are closed. Do not repeat the eleven-location investigation or the completed native/browser packets.

Continue G2 with one demonstrated **active** defect behind the remaining warnings. Use retained structured diagnostics only where source hashes still match, and refresh scoped locations for changed files. Reproduce the defect through its real native handler/adapter boundary before changing code, then test the repair. Unhandled optional planner loads in `useTripPlanner.ts` are candidates for review; they are not newly proved defects in this packet. Prioritize actual stale-state/rejection behavior over automatic file-size refactors. No new database fixture is needed just to inspect a client warning.

The two remaining ordinary-entry size witnesses and thirty retained findings are not a blanket deletion/refactor queue. Keep the [pre-production cleanup checkpoint](pre-production-retained-source-cleanup-packet.md) deferred. Dormant ZoomTracker remains untouched. The type-only derivation is not permission for later runtime/UI drift; any different native change needs its own explicit source review and preservation proof. Keep [release prerequisites](core-release-prerequisites.md) as the release order.

## Preservation and limits

All370 canonical schema/test sources,151 migrations, C's mixed index,188 prior seals/12313 members,11 auxiliary manifests, three other checkouts and original carryover/history remain exact. No hosted SQL/settings/billing, production/preview deployment, main update, remote push, backup/media/ignored ETL or transformation change. Advanced feature flags and the isolated planner/base-packing profile remain unchanged. Local publication is check-only/unbound. Earlier browser receipts remain historical; hosted compatibility, current protection and independent DB-plus-Storage restoration remain unproved release gates.

Drivers, original source, red/negative controls, complete test logs, compiled bytes and final quality diagnostics are retained at `/private/tmp/trek-core-quality-sidebar-contract-source-20261116`. The canonical handoff/evidence index supplies the final documentation commit and sealed hashes.
