-- U05-B2b3b1: single-MVCC read foundation; native/cache/shared activation remains gated.
begin;
set local lock_timeout='5s';set local statement_timeout='60s';
create function family_auth.require_booking_stay_read(p_trip uuid)returns public.trips
language plpgsql volatile security definer set search_path=''as $$
declare t public.trips%rowtype;sid uuid;
begin
 t:=family_auth.require_trip_location_access(p_trip,false);
 if family_auth.stay_session_current()is distinct from true then raise exception 'Current Auth session required'using errcode='42501';end if;
 begin sid:=(auth.jwt()->>'session_id')::uuid;exception when invalid_text_representation then raise exception 'Current Auth session required'using errcode='42501';end;
 if not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid()and(not_after is null or not_after>clock_timestamp()))then
  raise exception 'Current unexpired Auth session required'using errcode='42501';end if;
 return t;
end;$$;

-- STABLE establishes one content snapshot across all nested canonical readers.
create function family_auth.booking_stay_snapshot(p_trip uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare t public.trips%rowtype;planner jsonb;bookings jsonb;stays jsonb;rows jsonb;result jsonb;
begin
 t:=family_auth.require_trip_location_access(p_trip,false);
 if family_auth.stay_session_current()is distinct from true then raise exception 'Current Auth session required'using errcode='42501';end if;
 planner:=public.get_family_trip_planner_view_v1(t.id,'published');
 bookings:=public.get_family_trip_booking_view_v1(t.id);
 stays:=public.get_family_trip_stay_view_v1(t.id);
 if planner#>>'{state,trip_revision}'is distinct from t.revision::text or bookings->>'trip_revision'is distinct from t.revision::text
  or stays->>'trip_revision'is distinct from t.revision::text then raise exception 'Coherent Trip revisions required'using errcode='23514';end if;
 if exists(select 1 from public.trip_stay_booking_links l left join public.trip_stays s on(s.id,s.trip_id)=(l.stay_id,l.trip_id)
   where l.trip_id=t.id and(s.id is null or s.family_id<>t.family_id))then raise exception 'Retained stay identity is unavailable'using errcode='23514';end if;
 select coalesce(jsonb_agg(b||jsonb_build_object(
  'stay_link',case when l.stay_id is not null then jsonb_build_object('id',l.stay_id,'state',case when s.deleted_at is null then 'active'else 'retained'end)end,
  'timing_state',case when b#>>'{record,timing_kind}'='timed'then 'timed'when b#>>'{record,timing_kind}'='untimed'then 'untimed'else 'unclassified'end)
  order by n),'[]'::jsonb)into rows
 from jsonb_array_elements(bookings->'bookings')with ordinality a(b,n)
 left join public.trip_stay_booking_links l on l.trip_id=t.id and l.reservation_id::text=b#>>'{record,id}'
 left join public.trip_stays s on(s.id,s.trip_id)=(l.stay_id,l.trip_id);
 result:=(bookings-'version')||jsonb_build_object('version',2,'completeness','complete',
  'planner',planner,'bookings',rows,'stays',stays->'stays',
  'capabilities',jsonb_build_object('read',true,'native_read',false,'native_write',false,'confirmed_timing_write',false));
 if octet_length(result::text)>8388608 then raise exception 'Coherent booking/stay read exceeds8MiB'using errcode='54000';end if;
 return result;
end;$$;

-- VOLATILE is for fresh authority before/after the STABLE content snapshot, never for data writes.
create function public.get_family_trip_booking_view_v2(p_trip_id uuid)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare before_access public.trips%rowtype;after_access public.trips%rowtype;result jsonb;
begin
 before_access:=family_auth.require_booking_stay_read(p_trip_id);
 result:=family_auth.booking_stay_snapshot(before_access.id);
 after_access:=family_auth.require_booking_stay_read(p_trip_id);
 if result->>'trip_id'is distinct from after_access.id::text or result->>'family_id'is distinct from after_access.family_id::text
  or result->>'user_id'is distinct from auth.uid()::text or result->>'person_id'is distinct from family_auth.actor_person_id(after_access.family_id)::text then
  raise exception 'Original read authority changed'using errcode='42501';end if;
 return result;
end;$$;
revoke all on function family_auth.require_booking_stay_read(uuid),family_auth.booking_stay_snapshot(uuid),public.get_family_trip_booking_view_v2(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.get_family_trip_booking_view_v2(uuid)to authenticated;
comment on function public.get_family_trip_booking_view_v2(uuid)is
 'Private complete published planner/booking/stay v2 read. One STABLE content snapshot; fresh current-session/Family/person/Trip assurance before and after. No writes, history, receipts, inferred times or native/saved/shared activation.';
notify pgrst,'reload schema';
commit;
