# Completed-travel statistics — local schema144 correction

15 November2026. The Atlas aggregate preflight found and fixed an actual database defect. This is a local canonical migration/SQL/API qualification, not deployment or final composed-core acceptance. The website application code, native layouts, reader DTO, stored variants, source qualifiers and dependencies are unchanged from `2ec8ec0d1731c07cacd827a7077f6fba3b65eecc`. Exact review commit and canonical hashes are bound by the final evidence receipt.

## Demonstrated problem and correction

On an isolated restored143 database, one completed three-day Trip with three geographic destinations reports9 days in both family_travel_stats and person_travel_stats. The historical query sums Trip duration after joining trip_places. Neither count(distinct trip_id) nor sum(distinct duration) fixes that multiplication correctly: separate equal-length Trips must both contribute.

Migration `20261115122753_correct_completed_travel_statistics_grain.sql` replaces only those two view definitions/comments and contracts their ACLs. Trip counts/days aggregate at the Trip grain; the person view first joins the existing unique(trip_id,person_id) membership. Distinct geographic trip_places destinations aggregate independently, then join the totals. Venue visits, restaurant identity and visited-country marks are not inferred from city destinations. No table, column, function, policy, index, writer or new API is introduced.

Both existing view OIDs, owners, column names/types and security_invoker options are preserved. Completed, unarchived, untrashed Trips qualify; the explicit deleted_at filter agrees with existing authenticated Trip RLS and also excludes Trash in privileged reads. No qualifying Trip means no group, which the accepted reader already interprets as zero. A qualifying Trip without places still contributes once. Shared destinations across Trips count once. Missing dates contribute0 days. Existing UTC civil inclusive date math, per-Trip overlapping-day semantics and independent person membership remain intact; no scheduling/timezone/visit rewrite.

The permission test uncovered inherited default ALL grants to anon/authenticated/service_role on both aggregate views. The migration removes PUBLIC/anon access and non-SELECT rights, retaining SELECT for authenticated and service_role. This is an explicit reduction on exactly two views, not a hidden ACL-preservation claim. All underlying RLS, role configuration, default grants and unrelated object grants remain exact. Anonymous, foreign-family and suspended-member reads are proved denied/empty appropriately through real local GoTrue/PostgREST; reviewer AAL2 and member reads remain valid. No service credential is installed in the website.

## Fresh qualification


-24 SQL regression methods pass on the candidate and independent final replay. The same methods rerun on replay count once, not48 distinct tests. Cases cover0/1/multiple destinations, equal-duration/repeated/overlapping Trips, multiple/different/null travelers, all excluded statuses, Archive/Trash, genuine midnight, UTC civil boundaries/offsets/non-UTC session, missing dates and independent Families.

-10 real GoTrue/PostgREST/RLS methods pass separately. They verify exact totals, person identities, reviewer/member visibility, foreign/anonymous/suspended denial, contracted read-only rights and no invented visited-country marks. The final reused-session run records11 HTTP reads and3 SQL checks; fixture enrollment/bootstrap is separate.

-9 constructor/export/refusal checks pass. Pinned exports, missing/modified/symlink input, target reuse and insufficient disk are refused. The owned target has no network or published ports, a private Mac data bind, exact image/nonce/UID/mount guard and inactive cron/pg_net schedulers.

-Failed transactional DDL/ledger rehearsal rolls back both views. Local historical downgrade reproduces the old9-day result; re-upgrade restores the correct result. Existing143 migration arrays are untouched and only one exact144 ledger row is added. Historical migration SQL files are not edited or repaired in place.

-All362,473 original rows across256 complete COPY projections remain exact on the final replay.676 existing routine definitions/owners/ACLs and all indexes/constraints/policies/triggers/default ACLs/unrelated grants remain exact. The only database contract changes are the two view definitions/comments and their narrower grants. Internal logical-restore OIDs are not claimed identical to the original physical source; within each restored database the view OIDs remain unchanged by migration.

Source copies/tests are under [travel-statistics-grain/source](travel-statistics-grain/source). The canonical migration and three test/support files remain unstaged in the mixed FamilyTravelApp checkout; only reviewed copies/docs are committed on the integration branch. Three owned fixture services are stopped and retained. All153 previous service start/finish/running states and older volume names remain unchanged. This fixture is a logical rehearsal of accepted exports plus the exact143/144 delta; it is not an independent backup-plus-Storage disaster-recovery proof.

No frontend build or browser rerun is claimed for this SQL-only correction. The previous Atlas314-test/10-flow artifact acceptance remains inherited at its exact scope; it was not relabeled as new live schema144 browser proof. The next combined App acceptance must bind the new backend to one supported source/profile.

## Next and operational limits

Continue [the composed-core packet](core-composed-acceptance-packet.md) at the supported-source/profile composition step on144, without reopening the finished Atlas correction. Keep advanced stay/packing/private profiles and unsupported Atlas/Tours/provider actions off; do not widen a source gate or interpret a marker as permission. Review any exact143 fixture admissions explicitly before trying a144 core; view-only migration acceptance is not blanket source activation.

The original143 migrations/351 canonical source hashes, mixed canonical index,132 prior evidence seals/9,184 members,11 auxiliary manifests,12 native layout pins, backend carryover and all unrelated website/worktree bytes remain protected. Four canonical additions make144 migrations/355 source-preservation inputs for the next stage. Source-adoption5.1.2 and global file-size debt remain separate release holds; no baseline or source pin was widened. Clean publication checkout/source archive are local/check-only/unbound/unpublished.

Last hosted observation was88 migrations; if still current, this144 candidate needs56 pending versions, not the older55. Refresh hosted contracts/engine/protection and exact migration hashes before a separately reviewed backend rollout. No hosted schema/SQL/settings/billing, production/preview/main/push, source publication, transformations, backups/media or ignored ETL action occurred. The fixed7November backup, incremental/off-device protection and independent restore remain separate outstanding operational work.

Current design references: [Supabase invoker views and RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgreSQL CREATE OR REPLACE VIEW](https://www.postgresql.org/docs/17/sql-createview.html). Documentation/changelog checked this turn; installed CLI2.109.1 created the new migration file. No CLI upgrade or hosted command was used.
