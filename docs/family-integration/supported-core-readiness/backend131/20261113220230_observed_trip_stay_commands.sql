-- U05-B2b2: observed planned-stay commands; native and confirmed-timing cutovers remain gated.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- One immutable ledger is both the operation receipt and retained before/after history.
create table family_auth.stay_command_receipts (
  trip_id uuid not null,
  family_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_person_id uuid not null,
  session_id uuid not null, -- No FK: revoking/expiring a session must not delete its history.
  operation_id uuid not null,
  stay_id uuid not null,
  sequence bigint generated always as identity unique,
  action text not null check (action in ('create','edit','link','trash','restore')),
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  before_state jsonb not null check (jsonb_typeof(before_state) in ('object','null')),
  after_state jsonb not null check (jsonb_typeof(after_state) = 'object'),
  changed boolean not null,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  recorded_at timestamptz not null,
  primary key (trip_id, actor_user_id, operation_id),
  foreign key (trip_id, family_id) references public.trips(id,family_id) on delete restrict,
  foreign key (stay_id, trip_id) references public.trip_stays(id,trip_id) on delete restrict,
  foreign key (actor_person_id, family_id) references public.people(id,family_id) on delete restrict
);
create index stay_command_history_idx on family_auth.stay_command_receipts(stay_id,trip_id,sequence desc);
create index stay_command_family_idx on family_auth.stay_command_receipts(family_id);
create index stay_command_actor_idx on family_auth.stay_command_receipts(actor_user_id);
create index stay_command_person_idx on family_auth.stay_command_receipts(actor_person_id,family_id);
alter table family_auth.stay_command_receipts enable row level security;
revoke all on family_auth.stay_command_receipts from public,anon,authenticated,service_role;
revoke all on sequence family_auth.stay_command_receipts_sequence_seq from public,anon,authenticated,service_role;
create trigger immutable_stay_command_receipts before update or delete on family_auth.stay_command_receipts
  for each row execute function family_auth.tg_immutable_visit_classification();

create function family_auth.stay_command_scope(t public.trips) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('version',1,'layer','published','trip_id',t.id,'family_id',t.family_id,
    'user_id',auth.uid(),'person_id',family_auth.actor_person_id(t.family_id),'session_id',auth.jwt()->>'session_id');
$$;

create function family_auth.stay_command_observation(p_trip uuid,p_stay uuid,p_location uuid,p_booking uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.trips%rowtype; s public.trip_stays%rowtype; l public.trip_plan_locations%rowtype;
  r public.trip_reservations%rowtype; candidate_location jsonb; candidate_booking jsonb;
begin
  select * into t from public.trips where id=p_trip;
  select * into s from public.trip_stays where id=p_stay and trip_id=p_trip;
  if p_location is not null then
    select * into l from public.trip_plan_locations where id=p_location and trip_id=p_trip and family_id=t.family_id;
    if l.id is null or l.deleted_at is not null or
      (l.catalog_hotel_id is null and (num_nonnulls(l.catalog_place_id,l.catalog_food_id,l.catalog_experience_id)<>0
        or nullif(btrim(l.label),'') is null)) then
      raise exception 'Active same-Trip catalog hotel or named manual lodging required' using errcode='23514';
    end if;
    candidate_location := family_auth.trip_location_projection(l);
    if candidate_location is null or candidate_location->'source_archived'='true'::jsonb then
      raise exception 'Lodging source is unavailable' using errcode='23514';
    end if;
  end if;
  if p_booking is not null then
    select * into r from public.trip_reservations where id=p_booking and trip_id=p_trip;
    if r.id is null or r.type<>'hotel' then raise exception 'Same-Trip hotel booking required' using errcode='23514'; end if;
    candidate_booking := family_auth.booking_detail_state(p_trip,p_booking);
  end if;
  return jsonb_build_object('trip_revision',t.revision,
    'stay',case when s.id is not null then family_auth.stay_projection(s) end,
    'candidate_location',candidate_location,'candidate_booking',candidate_booking);
end;
$$;

create function public.get_family_stay_command_context_v1(p_trip_id uuid,p_stay_id uuid,
  p_location_id uuid default null,p_reservation_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.trips%rowtype; s public.trip_stays%rowtype; result jsonb; direct_schedule boolean;
begin
  if p_stay_id is null then raise exception 'Original stay UUID required' using errcode='22023'; end if;
  t := family_auth.require_trip_location_access(p_trip_id,false);
  if family_auth.stay_session_current() is distinct from true then
    raise exception 'Current Auth session required' using errcode='42501';
  end if;
  select * into s from public.trip_stays where id=p_stay_id;
  direct_schedule := public.can_trip_action_direct(t.id,'trip.schedule.manage');
  if s.id is not null and (s.trip_id<>t.id or s.family_id<>t.family_id or
    (s.deleted_at is not null and direct_schedule is distinct from true)) then
    raise exception 'Stay is unavailable to this edit session' using errcode='42501';
  end if;
  if s.id is null and p_location_id is null then raise exception 'Select lodging for the new stay' using errcode='22023'; end if;
  result := jsonb_build_object('version',1,'scope',family_auth.stay_command_scope(t),
    'state',case when s.id is null then 'absent' when s.deleted_at is null then 'active' else 'trash' end,
    'observation',family_auth.stay_command_observation(t.id,p_stay_id,coalesce(p_location_id,s.location_id),p_reservation_id),
    'admission',jsonb_build_object('save',direct_schedule,'trash',direct_schedule,'restore',direct_schedule,
      'link',direct_schedule and public.can_trip_action_direct(t.id,'trip.reservations.manage')),
    'native_controls',false);
  if octet_length(result::text)>524288 then raise exception 'Stay command context exceeds512KiB' using errcode='54000'; end if;
  return result;
end;
$$;

create function family_auth.validate_stay_patch(p_changes jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare k text; v jsonb; text_value text;
begin
  if jsonb_typeof(p_changes) is distinct from 'object' or p_changes-array['location_id','arrival_date','departure_date',
    'check_in_time','check_in_window_end','check_out_time','check_in_window_end_day_offset','time_zone','notes']<>'{}'::jsonb then
    raise exception 'Exact stay field patch required' using errcode='22023';
  end if;
  for k,v in select key,value from jsonb_each(p_changes) loop
    if k='check_in_window_end_day_offset' then
      if jsonb_typeof(v)<>'number' or (v#>>'{}') not in ('0','1') then
        raise exception 'Window offset must be0 or1' using errcode='22023';
      end if;
      continue;
    end if;
    if k in ('location_id','arrival_date','departure_date') and jsonb_typeof(v)<>'string' then
      raise exception 'Identity and dates cannot be cleared' using errcode='22023';
    elsif v='null'::jsonb then continue;
    elsif jsonb_typeof(v)<>'string' then raise exception 'Stay fields require typed text or explicit null' using errcode='22023';
    end if;
    text_value := v#>>'{}';
    if k='location_id' then perform text_value::uuid;
    elsif k in ('arrival_date','departure_date') then
      if text_value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or text_value::date not between date '0001-01-01' and date '9999-12-31' then
        raise exception 'Use a finite ISO civil date' using errcode='22023';
      end if;
    elsif k in ('check_in_time','check_in_window_end','check_out_time') and
      text_value!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
      raise exception 'Use a local clock without offset or fractional precision' using errcode='22023';
    elsif k='time_zone' then
      if octet_length(text_value)>128 then raise exception 'Zone exceeds its bound' using errcode='22023'; end if;
      perform family_auth.validate_named_visit_zone(text_value);
    elsif k='notes' and octet_length(text_value)>20000 then raise exception 'Notes exceed20000 UTF8 bytes' using errcode='22023';
    end if;
  end loop;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid typed stay field' using errcode='22023';
end;
$$;

create function family_auth.stay_command_require(p_trip uuid,p_scope jsonb,p_link boolean)
returns public.trips language plpgsql volatile security definer set search_path='' as $$
declare t public.trips%rowtype;
begin
  t:=family_auth.require_trip_location_access(p_trip,false);
  if family_auth.stay_session_current() is distinct from true or
    not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid()
      and(not_after is null or not_after>clock_timestamp())) or
    public.can_trip_action_direct(t.id,'trip.schedule.manage') is distinct from true or
    (p_link and public.can_trip_action_direct(t.id,'trip.reservations.manage') is distinct from true) then
    raise exception 'Current Direct stay command authority required' using errcode='42501';
  end if;
  if p_scope is distinct from family_auth.stay_command_scope(t) then
    raise exception 'Original stay edit session changed' using errcode='PT409';
  end if;
  return t;
end;
$$;

create function family_auth.execute_stay_command(p_trip uuid,p_stay uuid,p_operation uuid,p_scope jsonb,
  p_observation jsonb,p_action text,p_changes jsonb,p_booking uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare t public.trips%rowtype; s public.trip_stays%rowtype; n public.trip_stays%rowtype;
  actor uuid; session_uuid uuid; candidate_location uuid; before_observation jsonb; before_state jsonb; after_state jsonb;
  receipt family_auth.stay_command_receipts%rowtype; digest bytea; result jsonb; changed boolean:=false;
  event_action text; event_sequence bigint; recorded timestamptz; old_booking uuid; linked_booking public.trip_reservations%rowtype;
begin
  if p_trip is null or p_stay is null or p_operation is null or p_action not in ('save','link','trash','restore') or
    jsonb_typeof(p_scope) is distinct from 'object' or jsonb_typeof(p_observation) is distinct from 'object' or
    not(p_scope ?& array['version','layer','trip_id','family_id','user_id','person_id','session_id']) or
    p_scope-array['version','layer','trip_id','family_id','user_id','person_id','session_id']<>'{}'::jsonb or
    p_scope->'version' is distinct from '1'::jsonb or
    not(p_observation ?& array['trip_revision','stay','candidate_location','candidate_booking']) or
    p_observation-array['trip_revision','stay','candidate_location','candidate_booking']<>'{}'::jsonb or
    jsonb_typeof(p_observation->'trip_revision') is distinct from 'number' or
    octet_length(p_scope::text)+octet_length(p_observation::text)+octet_length(coalesce(p_changes,'null')::text)>1048576 then
    raise exception 'Exact bounded original stay request required' using errcode='22023';
  end if;
  perform family_auth.validate_stay_patch(p_changes);
  if p_action<>'save' and p_changes<>'{}'::jsonb then raise exception 'Unexpected stay patch' using errcode='22023'; end if;
  if p_scope->>'layer' is distinct from 'published' then
    raise exception 'Private stay writing has no published fallback' using errcode='0A000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
  perform 1 from public.trips where id=p_trip for no key update;
  t := family_auth.require_trip_location_access(p_trip,false);
  actor := family_auth.actor_person_id(t.family_id);
  if family_auth.stay_session_current() is distinct from true or
    public.can_trip_action_direct(t.id,'trip.schedule.manage') is distinct from true or
    (p_action='link' and public.can_trip_action_direct(t.id,'trip.reservations.manage') is distinct from true) then
    raise exception 'Current Direct stay command authority required' using errcode='42501';
  end if;
  if p_scope is distinct from family_auth.stay_command_scope(t) then
    raise exception 'Original stay edit session changed' using errcode='PT409';
  end if;
  session_uuid := (auth.jwt()->>'session_id')::uuid;
  perform 1 from auth.sessions where id=session_uuid and user_id=auth.uid()
    and (not_after is null or not_after>clock_timestamp()) for share;
  if not found then raise exception 'Current Auth session required' using errcode='42501'; end if;
  perform 1 from public.family_members where family_id=t.family_id and user_id=auth.uid() and status='active' for share;
  if not found then raise exception 'Current Family membership required' using errcode='42501'; end if;
  -- Recheck authority under the session/membership locks before returning any receipt.
  t:=family_auth.stay_command_require(p_trip,p_scope,p_action='link');
  digest := sha256(convert_to(jsonb_build_array('stay_command_v1',p_stay,p_scope,p_observation,p_action,p_changes,p_booking)::text,'UTF8'));
  select * into receipt from family_auth.stay_command_receipts
    where trip_id=t.id and actor_user_id=auth.uid() and operation_id=p_operation;
  if found then
    if receipt.stay_id<>p_stay or receipt.request_sha256<>digest then
      raise exception 'Stay operation UUID reused for another intent' using errcode='PT409';
    end if;
    return receipt.result; -- Historical acknowledgement only, never replacement content.
  end if;
  select * into s from public.trip_stays where id=p_stay for update;
  if s.id is not null and (s.trip_id<>t.id or s.family_id<>t.family_id) then
    raise exception 'Stay is unavailable to this command' using errcode='42501';
  end if;
  if s.id is null and (p_action<>'save' or not(p_changes ?& array['location_id','arrival_date','departure_date'])) then
    raise exception 'New stay requires explicit lodging and civil dates' using errcode='22023';
  end if;
  candidate_location := case when p_action='save' and p_changes ? 'location_id' then (p_changes->>'location_id')::uuid else s.location_id end;
  perform 1 from public.trip_plan_locations where trip_id=t.id and id in (s.location_id,candidate_location) order by id for update;
  select reservation_id into old_booking from public.trip_stay_booking_links where stay_id=p_stay and trip_id=t.id;
  perform 1 from public.trip_reservations where trip_id=t.id and id in(old_booking,p_booking) order by id for update;
  perform 1 from public.trip_reservation_calendar_dates where trip_id=t.id and reservation_id in(old_booking,p_booking) order by reservation_id for update;
  -- A child lock may have waited while policy, person or session facts changed.
  t:=family_auth.stay_command_require(p_trip,p_scope,p_action='link');
  before_observation := family_auth.stay_command_observation(t.id,p_stay,candidate_location,case when p_action='link' then p_booking end);
  if before_observation is distinct from p_observation then
    raise exception 'Stay, Trip, lodging or booking observation changed' using errcode='PT409';
  end if;
  before_state := before_observation->'stay';
  if s.id is not null and s.deleted_at is not null and p_action not in ('restore','trash') then
    raise exception 'Restore this stay before editing it' using errcode='0A000';
  end if;
  if p_action='save' then
    if s.id is null then
      n := jsonb_populate_record(null::public.trip_stays,p_changes);
      if (select count(*) from public.trip_stays where trip_id=t.id and deleted_at is null)>=2000 then
        raise exception 'Active stay limit reached' using errcode='54000';
      end if;
      insert into public.trip_stays(id,trip_id,family_id,location_id,arrival_date,departure_date,
        check_in_time,check_in_window_end,check_out_time,check_in_window_end_day_offset,time_zone,notes,created_by_person_id)
      values(p_stay,t.id,t.family_id,n.location_id,n.arrival_date,n.departure_date,n.check_in_time,n.check_in_window_end,
        n.check_out_time,coalesce(n.check_in_window_end_day_offset,0),n.time_zone,n.notes,actor);
      changed:=true; event_action:='create';
    else
      n := jsonb_populate_record(s,p_changes); event_action:='edit';
      changed := (n.location_id,n.arrival_date,n.departure_date,n.check_in_time,n.check_in_window_end,n.check_out_time,
        n.check_in_window_end_day_offset,n.time_zone,n.notes) is distinct from
        (s.location_id,s.arrival_date,s.departure_date,s.check_in_time,s.check_in_window_end,s.check_out_time,
        s.check_in_window_end_day_offset,s.time_zone,s.notes);
      if changed then
        update public.trip_stays set location_id=n.location_id,arrival_date=n.arrival_date,departure_date=n.departure_date,
          check_in_time=n.check_in_time,check_in_window_end=n.check_in_window_end,check_out_time=n.check_out_time,
          check_in_window_end_day_offset=n.check_in_window_end_day_offset,time_zone=n.time_zone,notes=n.notes where id=s.id;
      end if;
    end if;
  elsif p_action='link' then
    changed := old_booking is distinct from p_booking; event_action:='link';
    if changed then
      if exists(select 1 from public.trip_change_draft_ops o join public.trip_change_drafts d on d.id=o.draft_id where d.trip_id=t.id and o.module='reservation') or
        exists(select 1 from public.trip_change_request_ops o join public.trip_change_requests q on q.id=o.request_id where q.trip_id=t.id and q.status in('submitted','partially_applied') and o.status='pending' and o.module='reservation') then
        raise exception 'Resolve retained booking proposals before changing the association' using errcode='0A000';
      end if;
      delete from public.trip_stay_booking_links where stay_id=s.id and trip_id=t.id;
      if p_booking is not null then insert into public.trip_stay_booking_links(reservation_id,stay_id,trip_id) values(p_booking,s.id,t.id); end if;
    end if;
  elsif p_action='trash' then
    event_action:='trash'; changed:=s.deleted_at is null;
    if changed then update public.trip_stays set deleted_at=clock_timestamp(),deleted_by_person_id=actor where id=s.id; end if;
  else
    event_action:='restore'; changed:=s.deleted_at is not null;
    if old_booking is not null then
      select * into linked_booking from public.trip_reservations where id=old_booking and trip_id=t.id;
      if linked_booking.id is null or linked_booking.type<>'hotel' then
        raise exception 'Restore requires the original hotel booking' using errcode='23514';
      end if;
    end if;
    if changed then
      if (select count(*) from public.trip_stays where trip_id=t.id and deleted_at is null)>=2000 then
        raise exception 'Active stay limit reached' using errcode='54000';
      end if;
      update public.trip_stays set deleted_at=null,deleted_by_person_id=null where id=s.id;
    end if;
  end if;
  if changed then perform public.get_family_trip_stay_view_v1(t.id); end if; -- Keep the admitted aggregate readable.
  select * into s from public.trip_stays where id=p_stay and trip_id=t.id;
  after_state := family_auth.stay_projection(s);
  select * into t from public.trips where id=t.id;
  event_sequence := nextval('family_auth.stay_command_receipts_sequence_seq'::regclass);
  recorded := clock_timestamp();
  result := jsonb_build_object('version',1,'state','published','acknowledgement',true,'read_current_required',true,
    'trip_id',t.id,'stay_id',s.id,'operation_id',p_operation,'action',event_action,'changed',changed,
    'stay_revision_after',s.revision,'trip_revision_after',t.revision,'event_sequence',event_sequence,'recorded_at',recorded);
  insert into family_auth.stay_command_receipts(trip_id,family_id,actor_user_id,actor_person_id,session_id,
    operation_id,stay_id,sequence,action,request_sha256,before_state,after_state,changed,result,recorded_at)
    overriding system value values(t.id,t.family_id,auth.uid(),actor,session_uuid,p_operation,s.id,event_sequence,
      event_action,digest,before_state,after_state,changed,result,recorded);
  return result;
exception when unique_violation or serialization_failure or deadlock_detected then
  raise exception 'Concurrent stay change; reload the original context' using errcode='PT409';
end;
$$;

create function public.save_family_stay_v1(p_trip_id uuid,p_stay_id uuid,p_operation_id uuid,p_scope jsonb,p_observation jsonb,p_changes jsonb)
returns jsonb language sql volatile security definer set search_path='' as $$
  select family_auth.execute_stay_command(p_trip_id,p_stay_id,p_operation_id,p_scope,p_observation,'save',p_changes,null);
$$;
create function public.set_family_stay_booking_link_v1(p_trip_id uuid,p_stay_id uuid,p_operation_id uuid,p_scope jsonb,p_observation jsonb,p_reservation_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$
  select family_auth.execute_stay_command(p_trip_id,p_stay_id,p_operation_id,p_scope,p_observation,'link','{}',p_reservation_id);
$$;
create function public.trash_family_stay_v1(p_trip_id uuid,p_stay_id uuid,p_operation_id uuid,p_scope jsonb,p_observation jsonb)
returns jsonb language sql volatile security definer set search_path='' as $$
  select family_auth.execute_stay_command(p_trip_id,p_stay_id,p_operation_id,p_scope,p_observation,'trash','{}',null);
$$;
create function public.restore_family_stay_v1(p_trip_id uuid,p_stay_id uuid,p_operation_id uuid,p_scope jsonb,p_observation jsonb)
returns jsonb language sql volatile security definer set search_path='' as $$
  select family_auth.execute_stay_command(p_trip_id,p_stay_id,p_operation_id,p_scope,p_observation,'restore','{}',null);
$$;

create function public.get_family_stay_history_v1(p_trip_id uuid,p_stay_id uuid,p_before_sequence bigint default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype; s public.trip_stays%rowtype; rows jsonb; result jsonb; more boolean; next_cursor bigint;
begin
  t:=family_auth.require_trip_location_access(p_trip_id,false);
  if family_auth.stay_session_current() is distinct from true then raise exception 'Current Auth session required' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 or (p_before_sequence is not null and p_before_sequence<1) then
    raise exception 'Bounded history page required' using errcode='22023';
  end if;
  select * into s from public.trip_stays where id=p_stay_id and trip_id=t.id and family_id=t.family_id;
  if s.id is null or (s.deleted_at is not null and public.can_trip_action_direct(t.id,'trip.schedule.manage') is distinct from true) then
    raise exception 'Stay history is not authorized' using errcode='42501';
  end if;
  with page as(select r.* from family_auth.stay_command_receipts r where r.trip_id=t.id and r.stay_id=s.id
    and (p_before_sequence is null or r.sequence<p_before_sequence) order by r.sequence desc limit p_limit+1),
  visible as(select * from page order by sequence desc limit p_limit)
  select coalesce(jsonb_agg(jsonb_build_object('sequence',sequence,'operation_id',operation_id,'action',action,
    'actor_person_id',actor_person_id,'recorded_at',recorded_at,'changed',changed,'before',before_state,'after',after_state) order by sequence desc),'[]'),
    (select count(*)>p_limit from page),min(sequence) into rows,more,next_cursor from visible;
  result:=jsonb_build_object('version',1,'trip_id',t.id,'stay_id',s.id,'events',rows,'has_more',more,
    'next_before_sequence',case when more then next_cursor end);
  if octet_length(result::text)>8388608 then raise exception 'History page exceeds8MiB; use a smaller page' using errcode='54000'; end if;
  return result;
end;
$$;

revoke all on function family_auth.stay_command_scope(public.trips),family_auth.stay_command_observation(uuid,uuid,uuid,uuid),
  family_auth.stay_command_require(uuid,jsonb,boolean),family_auth.validate_stay_patch(jsonb),family_auth.execute_stay_command(uuid,uuid,uuid,jsonb,jsonb,text,jsonb,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.get_family_stay_command_context_v1(uuid,uuid,uuid,uuid),
  public.save_family_stay_v1(uuid,uuid,uuid,jsonb,jsonb,jsonb),public.set_family_stay_booking_link_v1(uuid,uuid,uuid,jsonb,jsonb,uuid),
  public.trash_family_stay_v1(uuid,uuid,uuid,jsonb,jsonb),public.restore_family_stay_v1(uuid,uuid,uuid,jsonb,jsonb),
  public.get_family_stay_history_v1(uuid,uuid,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_family_stay_command_context_v1(uuid,uuid,uuid,uuid),
  public.save_family_stay_v1(uuid,uuid,uuid,jsonb,jsonb,jsonb),public.set_family_stay_booking_link_v1(uuid,uuid,uuid,jsonb,jsonb,uuid),
  public.trash_family_stay_v1(uuid,uuid,uuid,jsonb,jsonb),public.restore_family_stay_v1(uuid,uuid,uuid,jsonb,jsonb),
  public.get_family_stay_history_v1(uuid,uuid,bigint,integer) to authenticated;

-- Portable content export includes history, not ephemeral session bindings or internal receipt digests.
do $export$
declare definition text; needle text; addition text;
begin
  select pg_get_functiondef('public.build_family_export_v1(uuid)'::regprocedure) into definition;
  if encode(sha256(convert_to(definition,'UTF8')),'hex')<>'2cd1a9b2d6af48e7a0484cf1703fb61deb041f6c5fde6bb8ffbcfaa40affc6a3' then
    raise exception 'Qualified130 export definition drift' using errcode='22023';
  end if;
  needle:=$n$  v_put:=family_auth.export_put(v_tables,v_counts,'trip_stay_booking_links',v_rows);v_tables:=v_put->'tables';v_counts:=v_put->'counts';$n$;
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
    raise exception 'Exact130 export insertion point required' using errcode='22023';
  end if;
  addition:=$a$
  select coalesce(jsonb_agg(jsonb_build_object('trip_id',r.trip_id,'stay_id',r.stay_id,'sequence',r.sequence,
    'operation_id',r.operation_id,'actor_person_id',r.actor_person_id,'action',r.action,'recorded_at',r.recorded_at,
    'changed',r.changed,'before',r.before_state,'after',r.after_state)order by r.sequence),'[]'::jsonb)
    into v_rows from family_auth.stay_command_receipts r where r.trip_id=any(v_trip_ids);
  v_put:=family_auth.export_put(v_tables,v_counts,'trip_stay_history',v_rows);v_tables:=v_put->'tables';v_counts:=v_put->'counts';
$a$;
  execute replace(definition,needle,needle||addition);
end;
$export$;
notify pgrst,'reload schema';
commit;
