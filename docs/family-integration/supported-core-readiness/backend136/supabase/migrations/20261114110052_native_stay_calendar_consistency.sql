begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';

-- Serialize day/date writes with the existing Trip-scoped lodging/calendar commands.
-- No new caller-controlled context or client execution privilege is introduced.
create function family_auth.tg_native_stay_calendar_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare trip_ids uuid[] := array[old.trip_id]; trip_key uuid;
begin
  if tg_op = 'UPDATE' then
    if (new.trip_id, new.civil_day) is not distinct from (old.trip_id, old.civil_day) then return new; end if;
    trip_ids := array_append(trip_ids, new.trip_id);
  end if;
  for trip_key in select distinct value from pg_catalog.unnest(trip_ids) as t(value) order by value loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('trip-recovery:' || trip_key::text, 0));
    perform 1 from public.trips where id = trip_key for no key update;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Check the final relational state, rather than intermediate day-renumbering steps.
-- Trashed arrivals retain identity; their requested restoration date remains a stay fact.
create function family_auth.tg_native_stay_calendar_consistency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.trip_id, new.civil_day) is not distinct from (old.trip_id, old.civil_day) then return null; end if;
  if exists (
    select 1 from public.schedule_items v
    join public.trip_stays s on s.id = v.owning_stay_id
    left join public.trip_days d on d.id = v.trip_day_id
    where v.trip_day_id = old.id and v.owning_stay_id is not null and v.deleted_at is null
      and (s.deleted_at is not null or v.trip_id is distinct from s.trip_id
        or v.plan_location_id is distinct from s.location_id or v.timing_kind <> 'untimed'
        or d.trip_id is distinct from s.trip_id or d.civil_day is distinct from s.arrival_date)
  ) then
    raise exception 'Calendar change would move a lodging arrival away from its stay; use coordinated lodging commands'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

alter function family_auth.tg_native_stay_calendar_lock() owner to postgres;
alter function family_auth.tg_native_stay_calendar_consistency() owner to postgres;
revoke all on function family_auth.tg_native_stay_calendar_lock(), family_auth.tg_native_stay_calendar_consistency()
  from public, anon, authenticated, service_role;

create trigger aaa_native_stay_calendar_lock
before update of civil_day, trip_id or delete on public.trip_days
for each row execute function family_auth.tg_native_stay_calendar_lock();

create constraint trigger native_stay_calendar_consistency
  after update of civil_day, trip_id or delete on public.trip_days
  deferrable initially deferred for each row
  execute function family_auth.tg_native_stay_calendar_consistency();

-- Refuse a pre-existing inconsistency instead of rewriting any stay, visit or calendar.
do $$ begin
  if exists (
    select 1 from public.schedule_items v
    join public.trip_stays s on s.id = v.owning_stay_id
    left join public.trip_days d on d.id = v.trip_day_id
    where v.owning_stay_id is not null and v.deleted_at is null
      and (s.deleted_at is not null or v.trip_id is distinct from s.trip_id
        or v.plan_location_id is distinct from s.location_id or v.timing_kind <> 'untimed'
        or d.trip_id is distinct from s.trip_id or d.civil_day is distinct from s.arrival_date)
  ) then raise exception 'Repair the explicitly identified lodging arrival inconsistency before this migration' using errcode = '23514'; end if;
end $$;
commit;
