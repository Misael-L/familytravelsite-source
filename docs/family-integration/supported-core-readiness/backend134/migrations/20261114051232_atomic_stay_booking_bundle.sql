-- U05-B2b3c3: atomic planned stay + new hotel booking. Native creation stays gated.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create function family_auth.validate_stay_bundle_command(p jsonb) returns void
language plpgsql stable set search_path='' as $$
declare s jsonb; o jsonb; r jsonb; d jsonb; k text; v jsonb; n public.trip_stays%rowtype;
  ids uuid[]; parsed uuid;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>1048576 or
    not(p ?& array['format','operation_id','scope','stay_id','reservation_id','observation','stay','reservation']) or
    p-array['format','operation_id','scope','stay_id','reservation_id','observation','stay','reservation']<>'{}'::jsonb or
    p->'format' is distinct from '"family.stay-bundle.v1"'::jsonb then
    raise exception 'Exact bounded stay bundle required' using errcode='22023';
  end if;
  foreach k in array array['operation_id','stay_id','reservation_id'] loop
    if jsonb_typeof(p->k) is distinct from 'string' then raise exception 'Original UUIDs required' using errcode='22023';end if;
    parsed:=(p->>k)::uuid;ids:=array_append(ids,parsed);
  end loop;
  if (select count(distinct x)from unnest(ids)x)<>3 then raise exception 'Distinct operation,stay and booking UUIDs required' using errcode='22023';end if;
  s:=p->'scope';o:=p->'observation';r:=p->'reservation';
  if jsonb_typeof(s) is distinct from 'object' or not(s ?& array['version','layer','trip_id','family_id','user_id','person_id','session_id']) or
    s-array['version','layer','trip_id','family_id','user_id','person_id','session_id']<>'{}'::jsonb or s->'version' is distinct from '1'::jsonb then
    raise exception 'Exact original scope required' using errcode='22023';end if;
  if s->>'layer' is distinct from 'published' then raise exception 'Private bundle has no published fallback' using errcode='0A000';end if;
  foreach k in array array['trip_id','family_id','user_id','person_id','session_id'] loop
    if jsonb_typeof(s->k) is distinct from 'string' then raise exception 'Typed scope UUID required' using errcode='22023';end if;
    parsed:=(s->>k)::uuid;
  end loop;
  if jsonb_typeof(o) is distinct from 'object' or
    not(o ?& array['trip_revision','candidate_location','arrival_day','departure_day','stay_absent','reservation_absent']) or
    o-array['trip_revision','candidate_location','arrival_day','departure_day','stay_absent','reservation_absent']<>'{}'::jsonb or
    jsonb_typeof(o->'trip_revision') is distinct from 'number' or (o->>'trip_revision')!~'^[1-9][0-9]*$' or
    (o->>'trip_revision')::numeric>9007199254740991 or
    o->'stay_absent' is distinct from 'true'::jsonb or o->'reservation_absent' is distinct from 'true'::jsonb or
    jsonb_typeof(o->'candidate_location') is distinct from 'object' or
    jsonb_typeof(o->'candidate_location'->'id') is distinct from 'string' then
    raise exception 'Complete original bundle observation required' using errcode='22023';end if;
  parsed:=(o->'candidate_location'->>'id')::uuid;
  foreach k in array array['arrival_day','departure_day'] loop
    d:=o->k;
    if jsonb_typeof(d) is distinct from 'object' or not(d ?& array['id','revision','civil_day','day_index','title']) or
      d-array['id','revision','civil_day','day_index','title']<>'{}'::jsonb or
      jsonb_typeof(d->'id') is distinct from 'string' or jsonb_typeof(d->'revision') is distinct from 'number' or
      (d->>'revision')!~'^[1-9][0-9]*$' or (d->>'revision')::numeric>9007199254740991 or
      jsonb_typeof(d->'civil_day') is distinct from 'string' or
      jsonb_typeof(d->'day_index') is distinct from 'number' or
      jsonb_typeof(d->'title') not in('string','null') then
      raise exception 'Complete original day observation required' using errcode='22023';end if;
    parsed:=(d->>'id')::uuid;
  end loop;
  perform family_auth.validate_stay_patch(p->'stay');
  if not(p->'stay' ?& array['location_id','arrival_date','departure_date']) or
    p->'stay'->>'location_id' is distinct from o->'candidate_location'->>'id' or
    p->'stay'->>'arrival_date' is distinct from o->'arrival_day'->>'civil_day' or
    p->'stay'->>'departure_date' is distinct from o->'departure_day'->>'civil_day' then
    raise exception 'Stay must match the original lodging and days' using errcode='22023';end if;
  n:=jsonb_populate_record(null::public.trip_stays,p->'stay');
  if n.departure_date<n.arrival_date or
    not((n.check_in_window_end is null and coalesce(n.check_in_window_end_day_offset,0)=0)or
      (n.check_in_window_end is not null and n.check_in_time is not null and
       ((coalesce(n.check_in_window_end_day_offset,0)=0 and n.check_in_window_end>=n.check_in_time)or
        (coalesce(n.check_in_window_end_day_offset,0)=1 and n.check_in_window_end<n.check_in_time)))) then
    raise exception 'Invalid stay dates or check-in window' using errcode='22023';end if;
  if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['title','status']) or
    r-array['title','status','confirmation_code','notes','url']<>'{}'::jsonb or
    jsonb_typeof(r->'title') is distinct from 'string' or nullif(btrim(r->>'title'),'') is null or octet_length(r->>'title')>1000 or
    r->>'status' is null or r->>'status' not in('pending','confirmed') then
    raise exception 'Exact hotel reservation fields required' using errcode='22023';end if;
  for k,v in select key,value from jsonb_each(r) loop
    if jsonb_typeof(v) not in('string','null') or(k in('title','status')and v='null'::jsonb) then
      raise exception 'Typed booking fields required' using errcode='22023';end if;
    if k='confirmation_code'and(octet_length(r->>k)>1024 or r->>k='') then
      raise exception 'Retain a bounded nonempty confirmation code or null' using errcode='22023';end if;
    if k='notes'and octet_length(r->>k)>20000 then raise exception 'Booking notes exceed bound' using errcode='22023';end if;
    if k='url'and v<>'null'::jsonb and(octet_length(r->>k)>2048 or r->>k!~*'^https?://[^[:space:]/?#@]+(:[0-9]+)?([/?#][^[:space:]]*)?$') then
      raise exception 'Absolute HTTP(S) booking URL required' using errcode='22023';end if;
  end loop;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'Invalid typed stay bundle field' using errcode='22023';
end;$$;

create function family_auth.stay_bundle_observation(p_trip uuid,p_location uuid,p_arrival uuid,p_departure uuid,p_stay uuid,p_reservation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype;l public.trip_plan_locations%rowtype;a public.trip_days%rowtype;d public.trip_days%rowtype;projection jsonb;
begin
  select * into t from public.trips where id=p_trip;
  select * into l from public.trip_plan_locations where id=p_location and trip_id=t.id and family_id=t.family_id and deleted_at is null;
  if l.id is null or(l.catalog_hotel_id is null and(num_nonnulls(l.catalog_place_id,l.catalog_food_id,l.catalog_experience_id)<>0 or nullif(btrim(l.label),'') is null))then
    raise exception 'Selected lodging is unavailable' using errcode='PT409';end if;
  projection:=family_auth.trip_location_projection(l);
  if projection is null or projection->'source_archived' is distinct from 'false'::jsonb then
    raise exception 'Selected lodging is unavailable' using errcode='PT409';end if;
  select * into a from public.trip_days where id=p_arrival and trip_id=t.id;
  select * into d from public.trip_days where id=p_departure and trip_id=t.id;
  if a.id is null or d.id is null or a.civil_day is null or d.civil_day is null or d.civil_day<a.civil_day or
    t.revision not between 1 and 9007199254740991 or a.revision not between 1 and 9007199254740991 or d.revision not between 1 and 9007199254740991 then
    raise exception 'Selected planning days are unavailable' using errcode='PT409';end if;
  if exists(select 1 from public.trip_stays where id=p_stay)or exists(select 1 from public.trip_reservations where id=p_reservation)then
    raise exception 'Proposed bundle identities are unavailable' using errcode='PT409';end if;
  return jsonb_build_object('trip_revision',t.revision,'candidate_location',projection,
    'arrival_day',jsonb_build_object('id',a.id,'revision',a.revision,'civil_day',a.civil_day,'day_index',a.day_index,'title',a.title),
    'departure_day',jsonb_build_object('id',d.id,'revision',d.revision,'civil_day',d.civil_day,'day_index',d.day_index,'title',d.title),
    'stay_absent',true,'reservation_absent',true);
end;$$;

create function public.get_family_stay_bundle_context_v1(p_trip_id uuid,p_location_id uuid,p_arrival_day_id uuid,p_departure_day_id uuid,p_stay_id uuid,p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype;result jsonb;
begin
  if num_nulls(p_trip_id,p_location_id,p_arrival_day_id,p_departure_day_id,p_stay_id,p_reservation_id)<>0 or p_stay_id=p_reservation_id then
    raise exception 'Explicit bundle identities required' using errcode='22023';end if;
  t:=family_auth.require_trip_location_access(p_trip_id,false);
  if family_auth.stay_session_current() is distinct from true then raise exception 'Current Auth session required' using errcode='42501';end if;
  result:=jsonb_build_object('format','family.stay-bundle-context.v1','scope',family_auth.stay_command_scope(t),
    'observation',family_auth.stay_bundle_observation(t.id,p_location_id,p_arrival_day_id,p_departure_day_id,p_stay_id,p_reservation_id),
    'admission',jsonb_build_object('create',public.can_trip_action_direct(t.id,'trip.schedule.manage')and public.can_trip_action_direct(t.id,'trip.reservations.manage')),
    'native_controls',false);
  if octet_length(result::text)>524288 then raise exception 'Bundle context exceeds512KiB' using errcode='54000';end if;
  return result;
end;$$;

create function family_auth.lock_stay_bundle(p_trip uuid,p_scope jsonb,p_original_session boolean) returns public.trips
language plpgsql volatile security definer set search_path='' as $$
declare t public.trips%rowtype;access_scope jsonb;
begin
  -- Same order as existing stay writers: recovery advisory, Trip, session, membership.
  perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
  perform 1 from public.trips where id=p_trip for no key update;
  -- A fresh session may inspect/cancel, never execute the original write. Only this
  -- authorization comparison uses the current session; the original command/digest is immutable.
  access_scope:=case when p_original_session then p_scope else p_scope||jsonb_build_object('session_id',auth.jwt()->>'session_id')end;
  t:=family_auth.stay_command_require(p_trip,access_scope,true);
  perform 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid()
    and(not_after is null or not_after>clock_timestamp())for share;
  if not found then raise exception 'Current Auth session required' using errcode='42501';end if;
  perform 1 from public.family_members where family_id=t.family_id and user_id=auth.uid()and status='active'for share;
  if not found then raise exception 'Current Family membership required' using errcode='42501';end if;
  perform 1 from public.people where id=family_auth.actor_person_id(t.family_id)and family_id=t.family_id and user_id=auth.uid()and archived_at is null for share;
  if not found then raise exception 'Current linked person required' using errcode='42501';end if;
  return family_auth.stay_command_require(p_trip,access_scope,true);
end;$$;

create function public.create_family_stay_bundle_v1(p_command jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare t public.trips%rowtype;s public.trip_stays%rowtype;l public.trip_plan_locations%rowtype;h public.hotels%rowtype;
  ctx public.places%rowtype;scope jsonb;obs jsonb;r jsonb;current_obs jsonb;after_state jsonb;result jsonb;digest bytea;
  sid uuid;bid uuid;op uuid;arrival uuid;departure uuid;actor uuid;event_seq bigint;recorded timestamptz;
  receipt family_auth.stay_command_receipts%rowtype;cancel family_auth.stay_command_cancellations%rowtype;
begin
  perform family_auth.validate_stay_bundle_command(p_command);
  scope:=p_command->'scope';obs:=p_command->'observation';r:=p_command->'reservation';
  sid:=(p_command->>'stay_id')::uuid;bid:=(p_command->>'reservation_id')::uuid;op:=(p_command->>'operation_id')::uuid;
  arrival:=(obs->'arrival_day'->>'id')::uuid;departure:=(obs->'departure_day'->>'id')::uuid;
  t:=family_auth.lock_stay_bundle((scope->>'trip_id')::uuid,scope,true);
  actor:=family_auth.actor_person_id(t.family_id);
  digest:=sha256(convert_to(jsonb_build_array('family.stay-bundle.v1',p_command)::text,'UTF8'));
  select * into receipt from family_auth.stay_command_receipts where trip_id=t.id and actor_user_id=auth.uid()and operation_id=op;
  select * into cancel from family_auth.stay_command_cancellations where trip_id=t.id and actor_user_id=auth.uid()and operation_id=op;
  if cancel.operation_id is not null then raise exception 'Original operation is terminally cancelled' using errcode='PT409';end if;
  if receipt.operation_id is not null then
    if receipt.stay_id<>sid or receipt.request_sha256<>digest then raise exception 'Original operation UUID reused' using errcode='PT409';end if;
    return receipt.result;
  end if;
  select * into l from public.trip_plan_locations where id=(p_command->'stay'->>'location_id')::uuid and trip_id=t.id for update;
  -- Lock every shared row contributing to the observed hotel projection. Never edit it.
  if l.catalog_hotel_id is not null then
    select * into h from public.hotels where id=l.catalog_hotel_id for share;
    select * into ctx from public.places where id=h.place_id for share;
    perform 1 from public.countries where id=coalesce(h.country_id,ctx.country_id)for share;
  end if;
  perform 1 from public.family_place_categories where id=l.family_place_category_id for share;
  perform 1 from public.trip_days where trip_id=t.id and id in(arrival,departure)order by id for share;
  -- Child/catalog locks may have waited. Refresh all authorization and observations now.
  t:=family_auth.stay_command_require(t.id,scope,true);
  current_obs:=family_auth.stay_bundle_observation(t.id,l.id,arrival,departure,sid,bid);
  if current_obs is distinct from obs then raise exception 'Original bundle observation changed' using errcode='PT409';end if;
  if(select count(*)from public.trip_stays where trip_id=t.id and deleted_at is null)>=2000 or
    (select count(*)from public.trip_reservations where trip_id=t.id)>=2000 then raise exception 'Stay or booking limit reached' using errcode='54000';end if;
  s:=jsonb_populate_record(null::public.trip_stays,p_command->'stay');
  t:=family_auth.stay_command_require(t.id,scope,true);
  insert into public.trip_stays(id,trip_id,family_id,location_id,arrival_date,departure_date,check_in_time,check_in_window_end,check_out_time,
    check_in_window_end_day_offset,time_zone,notes,created_by_person_id)
    values(sid,t.id,t.family_id,l.id,s.arrival_date,s.departure_date,s.check_in_time,s.check_in_window_end,s.check_out_time,
      coalesce(s.check_in_window_end_day_offset,0),s.time_zone,s.notes,actor);
  -- Explicit civil facts; suppress the legacy bridge rather than write a second date version.
  insert into family_auth.booking_calendar_context(reservation_id)values(bid);
  insert into public.trip_reservations(id,trip_id,type,status,title,start_trip_day_id,end_trip_day_id,
    starts_at,ends_at,confirmation_code,notes,url,hotel_id,timing_kind,time_zone)
    values(bid,t.id,'hotel',r->>'status',r->>'title',arrival,departure,null,null,
      r->>'confirmation_code',r->>'notes',r->>'url',l.catalog_hotel_id,'untimed',null);
  insert into public.trip_reservation_calendar_dates(reservation_id,trip_id,start_date,end_date)
    values(bid,t.id,s.arrival_date,s.departure_date);
  delete from family_auth.booking_calendar_context where xid=pg_current_xact_id()and reservation_id=bid;
  insert into public.trip_stay_booking_links(reservation_id,stay_id,trip_id)values(bid,sid,t.id);
  perform family_auth.assert_booking_calendar_dates(bid);
  perform public.get_family_trip_booking_view_v2(t.id); -- Complete aggregate must remain admitted/readable.
  t:=family_auth.stay_command_require(t.id,scope,true);
  select * into s from public.trip_stays where id=sid and trip_id=t.id;
  after_state:=family_auth.stay_projection(s);
  select * into t from public.trips where id=t.id;
  event_seq:=nextval('family_auth.stay_command_receipts_sequence_seq'::regclass);recorded:=clock_timestamp();
  if t.revision>9007199254740991 or s.revision>9007199254740991 or event_seq>9007199254740991 then
    raise exception 'Bundle acknowledgement exceeds safe revision range' using errcode='54000';end if;
  result:=jsonb_build_object('format','family.stay-bundle-ack.v1','state','published','acknowledgement',true,
    'read_current_required',true,'changed',true,'trip_id',t.id,'stay_id',sid,'reservation_id',bid,'operation_id',op,
    'stay_revision_after',s.revision,'trip_revision_after',t.revision,'event_sequence',event_seq,'recorded_at',recorded);
  insert into family_auth.stay_command_receipts(trip_id,family_id,actor_user_id,actor_person_id,session_id,operation_id,stay_id,
    sequence,action,request_sha256,before_state,after_state,changed,result,recorded_at)
    overriding system value values(t.id,t.family_id,auth.uid(),actor,(scope->>'session_id')::uuid,op,sid,event_seq,
      'create',digest,'null'::jsonb,after_state,true,result,recorded);
  return result;
exception when unique_violation or serialization_failure or deadlock_detected then
  raise exception 'Concurrent bundle change; retain original intent' using errcode='PT409';
end;$$;

create function family_auth.stay_bundle_outcome(p_command jsonb,p_cancel boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare t public.trips%rowtype;scope jsonb;sid uuid;bid uuid;op uuid;digest bytea;status text;
  r family_auth.stay_command_receipts%rowtype;c family_auth.stay_command_cancellations%rowtype;
begin
  perform family_auth.validate_stay_bundle_command(p_command);
  scope:=p_command->'scope';sid:=(p_command->>'stay_id')::uuid;bid:=(p_command->>'reservation_id')::uuid;op:=(p_command->>'operation_id')::uuid;
  t:=family_auth.lock_stay_bundle((scope->>'trip_id')::uuid,scope,false);
  digest:=sha256(convert_to(jsonb_build_array('family.stay-bundle.v1',p_command)::text,'UTF8'));
  select * into r from family_auth.stay_command_receipts where trip_id=t.id and actor_user_id=auth.uid()and operation_id=op;
  select * into c from family_auth.stay_command_cancellations where trip_id=t.id and actor_user_id=auth.uid()and operation_id=op;
  if(r.operation_id is not null and(r.stay_id<>sid or r.request_sha256<>digest))or
    (c.operation_id is not null and(c.stay_id<>sid or c.request_sha256<>digest))then
    raise exception 'Original operation UUID reused for another body' using errcode='PT409';end if;
  if r.operation_id is not null and c.operation_id is not null then raise exception 'Contradictory terminal decisions' using errcode='23514';end if;
  if r.operation_id is not null then status:='committed';
  elsif c.operation_id is not null then status:='cancelled';
  elsif p_cancel then
    insert into family_auth.stay_command_cancellations(trip_id,family_id,actor_user_id,actor_person_id,operation_id,stay_id,
      original_session_id,cancelled_in_session_id,request_sha256)
      values(t.id,t.family_id,auth.uid(),family_auth.actor_person_id(t.family_id),op,sid,
        (scope->>'session_id')::uuid,(auth.jwt()->>'session_id')::uuid,digest)returning *into c;
    status:='cancelled';
  else status:='unknown';end if;
  return jsonb_build_object('format','family.stay-bundle-outcome.v1','trip_id',t.id,'stay_id',sid,'reservation_id',bid,'operation_id',op,
    'current_scope',family_auth.stay_command_scope(t),'original_session_id',scope->>'session_id','status',status,
    'acknowledgement',case when status='committed'then r.result end,'cancelled_at',case when status='cancelled'then c.cancelled_at end);
end;$$;

create function public.get_family_stay_bundle_outcome_v1(p_command jsonb)returns jsonb
language sql volatile security definer set search_path=''as $$select family_auth.stay_bundle_outcome(p_command,false);$$;
create function public.cancel_family_stay_bundle_v1(p_command jsonb)returns jsonb
language sql volatile security definer set search_path=''as $$select family_auth.stay_bundle_outcome(p_command,true);$$;

-- Match the existing non-superuser database owner, never a disposable bootstrap operator.
alter function family_auth.validate_stay_bundle_command(jsonb)owner to postgres;
alter function family_auth.stay_bundle_observation(uuid,uuid,uuid,uuid,uuid,uuid)owner to postgres;
alter function family_auth.lock_stay_bundle(uuid,jsonb,boolean)owner to postgres;
alter function family_auth.stay_bundle_outcome(jsonb,boolean)owner to postgres;
alter function public.get_family_stay_bundle_context_v1(uuid,uuid,uuid,uuid,uuid,uuid)owner to postgres;
alter function public.create_family_stay_bundle_v1(jsonb)owner to postgres;
alter function public.get_family_stay_bundle_outcome_v1(jsonb)owner to postgres;
alter function public.cancel_family_stay_bundle_v1(jsonb)owner to postgres;

revoke all on function family_auth.validate_stay_bundle_command(jsonb),family_auth.stay_bundle_observation(uuid,uuid,uuid,uuid,uuid,uuid),
  family_auth.lock_stay_bundle(uuid,jsonb,boolean),family_auth.stay_bundle_outcome(jsonb,boolean),
  public.get_family_stay_bundle_context_v1(uuid,uuid,uuid,uuid,uuid,uuid),public.create_family_stay_bundle_v1(jsonb),
  public.get_family_stay_bundle_outcome_v1(jsonb),public.cancel_family_stay_bundle_v1(jsonb)from public,anon,authenticated,service_role;
grant execute on function public.get_family_stay_bundle_context_v1(uuid,uuid,uuid,uuid,uuid,uuid),public.create_family_stay_bundle_v1(jsonb),
  public.get_family_stay_bundle_outcome_v1(jsonb),public.cancel_family_stay_bundle_v1(jsonb)to authenticated;
notify pgrst,'reload schema';
commit;
