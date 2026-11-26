-- Sum duration at the Trip grain, never at the joined destination grain.
-- Keep existing view names/column types/OIDs and invoker RLS; narrow legacy grants.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace view public.family_travel_stats
with (security_invoker = true)
as
with eligible_trips as (
  select t.id, t.family_id,
    case when t.start_at is not null and t.end_at is not null
      then ((t.end_at at time zone 'utc')::date - (t.start_at at time zone 'utc')::date) + 1
      else 0 end as days
  from public.trips t
  where t.status = 'completed' and t.archived_at is null and t.deleted_at is null
), totals as (
  select family_id, count(*)::bigint as total_trips,
    coalesce(sum(days), 0)::bigint as total_days
  from eligible_trips
  group by family_id
), destinations as (
  select t.family_id, count(distinct tp.place_id)::bigint as total_places
  from eligible_trips t
  join public.trip_places tp on tp.trip_id = t.id
  group by t.family_id
)
select t.family_id, t.total_trips, t.total_days,
  coalesce(d.total_places, 0)::bigint as total_places
from totals t
left join destinations d on d.family_id = t.family_id;

comment on view public.family_travel_stats is
  'Per-family completed-travel aggregates: each active unarchived Trip contributes UTC civil inclusive days once; distinct geographic trip_places destinations across those Trips. No group when none qualify. Invoker RLS applies.';

create or replace view public.person_travel_stats
with (security_invoker = true)
as
with eligible_trips as (
  select t.id, t.family_id, tt.person_id,
    case when t.start_at is not null and t.end_at is not null
      then ((t.end_at at time zone 'utc')::date - (t.start_at at time zone 'utc')::date) + 1
      else 0 end as days
  from public.trips t
  join public.trip_travelers tt on tt.trip_id = t.id and tt.person_id is not null
  where t.status = 'completed' and t.archived_at is null and t.deleted_at is null
), totals as (
  -- trip_travelers has UNIQUE(trip_id, person_id): one row per person's Trip.
  select family_id, person_id, count(*)::bigint as total_trips,
    coalesce(sum(days), 0)::bigint as total_days
  from eligible_trips
  group by family_id, person_id
), destinations as (
  select t.family_id, t.person_id, count(distinct tp.place_id)::bigint as total_places
  from eligible_trips t
  join public.trip_places tp on tp.trip_id = t.id
  group by t.family_id, t.person_id
)
select t.family_id, t.person_id, t.total_trips, t.total_days,
  coalesce(d.total_places, 0)::bigint as total_places
from totals t
left join destinations d on d.family_id = t.family_id and d.person_id = t.person_id;

comment on view public.person_travel_stats is
  'Per-person completed-travel aggregates via trip_travelers. Each active unarchived Trip contributes UTC civil inclusive days once for that person; distinct geographic trip_places destinations. Invoker RLS applies.';

-- These aggregate views are read-only. Legacy default privileges granted more
-- than SELECT (including to anon); contract only those two view ACLs.
revoke all on public.family_travel_stats, public.person_travel_stats
  from public, anon, authenticated, service_role;
grant select on public.family_travel_stats, public.person_travel_stats
  to authenticated, service_role;
commit;
