# Paste this into Cursor in the new FamilyTravelSite project

Implement the existing Family backend integration in `/Users/Misael/Downloads/FamilyTravelSite` on `codex/trek-v5-family-integration`.

Read `docs/family-integration/context.md`, `docs/family-integration/source-inventory.json`, and `.cursor/plans/existing-family-backend-integration.plan.md`. Then execute its six to-dos; do not start another planning round. Resume from `docs/family-integration/progress.md` if work is already underway.

Reuse the bridge, startup/realtime hooks, compatibility modules, maps and tests already present in the read-only reference worktree. Its working files contain uncommitted implementation, so do not substitute its git HEAD. Reuse `@family/backend` and keep its 120 frozen source files unchanged; keep a single active client/auth/realtime owner.

Scope is ONLY Family functionality we already have. Additional TREK features/database integration comes later. Preserve the complete TREK 5.0.1 frontend/assets and existing Family map functionality. Port necessary connection hooks; do not recreate screens or overwrite the frontend with the older worktree.

Use fake data and installed tooling for tests. No production access, SQL/schema/provider/credential changes, image jobs or edits to the protected Desktop checkout. Record checkpoints, native frontend patches and fresh validation results in the plan's receipt files. Fix in-scope failures, commit/push validated work to the integration branch and keep PR #1 draft. No main merge or deployment. Report genuine blockers precisely and continue independent work.
