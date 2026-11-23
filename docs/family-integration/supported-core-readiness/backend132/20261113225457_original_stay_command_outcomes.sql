-- U05-B2b3a: original stay outcome inspection and terminal cancellation, no stay mutation.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table family_auth.stay_command_cancellations (
  trip_id uuid not null,
  family_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_person_id uuid not null,
  operation_id uuid not null,
  stay_id uuid not null, -- May be a never-created identity; deliberately no stay FK.
  original_session_id uuid not null,
  cancelled_in_session_id uuid not null, -- Sessions are ephemeral, not content ownership.
  request_sha256 bytea not null check(octet_length(request_sha256)=32),
  cancelled_at timestamptz not null default clock_timestamp(),
  primary key(trip_id,actor_user_id,operation_id),
  foreign key(trip_id,family_id) references public.trips(id,family_id) on delete restrict,
  foreign key(actor_person_id,family_id) references public.people(id,family_id) on delete restrict
);
create index stay_cancellation_actor_idx on family_auth.stay_command_cancellations(actor_user_id);
create index stay_cancellation_person_idx on family_auth.stay_command_cancellations(actor_person_id,family_id);
create index stay_cancellation_family_idx on family_auth.stay_command_cancellations(family_id);
alter table family_auth.stay_command_cancellations enable row level security;
revoke all on family_auth.stay_command_cancellations from public,anon,authenticated,service_role;
create trigger immutable_stay_command_cancellations before update or delete on family_auth.stay_command_cancellations
  for each row execute function family_auth.tg_immutable_visit_classification();

create function family_auth.stay_outcome_access(p_trip uuid,p_scope jsonb,p_link boolean) returns public.trips
language plpgsql volatile security definer set search_path='' as $$
declare t public.trips%rowtype; sid uuid;
begin
  t:=family_auth.require_trip_location_access(p_trip,false);
  if family_auth.stay_session_current() is distinct from true or
    not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid()
      and(not_after is null or not_after>clock_timestamp())) or
    public.can_trip_action_direct(t.id,'trip.schedule.manage') is distinct from true or
    (p_link and public.can_trip_action_direct(t.id,'trip.reservations.manage') is distinct from true) then
    raise exception 'Current original-operation authority required' using errcode='42501';
  end if;
  begin sid:=(p_scope->>'session_id')::uuid;
  exception when invalid_text_representation then raise exception 'Original session UUID required' using errcode='22023';end;
  if sid is null or jsonb_typeof(p_scope->'session_id') is distinct from 'string' then
    raise exception 'Original session UUID required' using errcode='22023';
  end if;
  if p_scope-'session_id' is distinct from family_auth.stay_command_scope(t)-'session_id' then
    raise exception 'Original operation belongs to another actor or Trip' using errcode='PT409';
  end if;
  return t;
end;
$$;

create function family_auth.stay_original_outcome(p_trip uuid,p_stay uuid,p_operation uuid,p_scope jsonb,
  p_observation jsonb,p_action text,p_changes jsonb,p_booking uuid,p_cancel boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare t public.trips%rowtype; digest bytea; r family_auth.stay_command_receipts%rowtype;
  c family_auth.stay_command_cancellations%rowtype; status text; result jsonb;
begin
  if p_trip is null or p_stay is null or p_operation is null or p_action is null or
    p_action not in('save','link','trash','restore') or p_cancel is null or
    jsonb_typeof(p_scope) is distinct from 'object' or jsonb_typeof(p_observation) is distinct from 'object' or
    not(p_scope ?& array['version','layer','trip_id','family_id','user_id','person_id','session_id']) or
    p_scope-array['version','layer','trip_id','family_id','user_id','person_id','session_id']<>'{}'::jsonb or
    p_scope->'version' is distinct from '1'::jsonb or
    not(p_observation ?& array['trip_revision','stay','candidate_location','candidate_booking']) or
    p_observation-array['trip_revision','stay','candidate_location','candidate_booking']<>'{}'::jsonb or
    jsonb_typeof(p_observation->'trip_revision') is distinct from 'number' or
    octet_length(p_scope::text)+octet_length(p_observation::text)+octet_length(coalesce(p_changes,'null')::text)>1048576 then
    raise exception 'Exact bounded original stay operation required' using errcode='22023';
  end if;
  perform family_auth.validate_stay_patch(p_changes);
  if(p_action<>'save' and p_changes<>'{}'::jsonb)or(p_action<>'link' and p_booking is not null)then
    raise exception 'Unexpected original action fields' using errcode='22023';
  end if;
  if p_scope->>'layer' is distinct from 'published' then
    raise exception 'Private original operation has no published fallback' using errcode='0A000';
  end if;
  if p_cancel then
    perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
    perform 1 from public.trips where id=p_trip for no key update;
  end if;
  t:=family_auth.stay_outcome_access(p_trip,p_scope,p_action='link');
  if p_cancel then
    perform 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid()
      and(not_after is null or not_after>clock_timestamp()) for share;
    if not found then raise exception 'Current Auth session required' using errcode='42501';end if;
    perform 1 from public.family_members fm where fm.family_id=t.family_id and fm.user_id=auth.uid()and fm.status='active'for share;
    if not found then raise exception 'Current Family membership required' using errcode='42501';end if;
    t:=family_auth.stay_outcome_access(p_trip,p_scope,p_action='link');
  end if;
  digest:=sha256(convert_to(jsonb_build_array('stay_command_v1',p_stay,p_scope,p_observation,p_action,p_changes,p_booking)::text,'UTF8'));
  select * into r from family_auth.stay_command_receipts where trip_id=t.id and actor_user_id=auth.uid()and operation_id=p_operation;
  select * into c from family_auth.stay_command_cancellations where trip_id=t.id and actor_user_id=auth.uid()and operation_id=p_operation;
  if(r.operation_id is not null and(r.stay_id<>p_stay or r.request_sha256<>digest))or
    (c.operation_id is not null and(c.stay_id<>p_stay or c.request_sha256<>digest))then
    raise exception 'Original operation UUID reused for another body' using errcode='PT409';
  end if;
  if r.operation_id is not null and c.operation_id is not null then
    raise exception 'Contradictory terminal operation decisions' using errcode='23514';
  end if;
  if r.operation_id is not null then status:='committed';
  elsif c.operation_id is not null then status:='cancelled';
  elsif p_cancel then
    insert into family_auth.stay_command_cancellations(trip_id,family_id,actor_user_id,actor_person_id,operation_id,
      stay_id,original_session_id,cancelled_in_session_id,request_sha256)
      values(t.id,t.family_id,auth.uid(),family_auth.actor_person_id(t.family_id),p_operation,p_stay,
        (p_scope->>'session_id')::uuid,(auth.jwt()->>'session_id')::uuid,digest) returning * into c;
    status:='cancelled';
  else status:='unknown';end if;
  result:=jsonb_build_object('version',1,'trip_id',t.id,'stay_id',p_stay,'operation_id',p_operation,
    'current_scope',family_auth.stay_command_scope(t),'original_session_id',p_scope->>'session_id',
    'status',status,'acknowledgement',case when status='committed'then r.result end,
    'cancelled_at',case when status='cancelled'then c.cancelled_at end);
  if octet_length(result::text)>32768 then raise exception 'Outcome exceeds32KiB'using errcode='54000';end if;
  return result;
end;
$$;

create function public.get_family_stay_command_outcome_v1(p_trip_id uuid,p_stay_id uuid,p_operation_id uuid,
  p_scope jsonb,p_observation jsonb,p_action text,p_changes jsonb,p_reservation_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select family_auth.stay_original_outcome(p_trip_id,p_stay_id,p_operation_id,p_scope,p_observation,p_action,p_changes,p_reservation_id,false);
$$;
create function public.cancel_family_stay_command_v1(p_trip_id uuid,p_stay_id uuid,p_operation_id uuid,
  p_scope jsonb,p_observation jsonb,p_action text,p_changes jsonb,p_reservation_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select family_auth.stay_original_outcome(p_trip_id,p_stay_id,p_operation_id,p_scope,p_observation,p_action,p_changes,p_reservation_id,true);
$$;
revoke all on function family_auth.stay_outcome_access(uuid,jsonb,boolean),family_auth.stay_original_outcome(uuid,uuid,uuid,jsonb,jsonb,text,jsonb,uuid,boolean),
  public.get_family_stay_command_outcome_v1(uuid,uuid,uuid,jsonb,jsonb,text,jsonb,uuid),
  public.cancel_family_stay_command_v1(uuid,uuid,uuid,jsonb,jsonb,text,jsonb,uuid)from public,anon,authenticated,service_role;
grant execute on function public.get_family_stay_command_outcome_v1(uuid,uuid,uuid,jsonb,jsonb,text,jsonb,uuid),
  public.cancel_family_stay_command_v1(uuid,uuid,uuid,jsonb,jsonb,text,jsonb,uuid)to authenticated;

-- Replace only the proved131 executor, retaining its exact original body except the shared terminal guard.
do $executor$
declare definition text;needle text;addition text;
begin
  select pg_get_functiondef('family_auth.execute_stay_command(uuid,uuid,uuid,jsonb,jsonb,text,jsonb,uuid)'::regprocedure)into definition;
  if encode(sha256(convert_to(definition,'UTF8')),'hex')<>'6fc68cf0341713e2eefc6dc978c81cc4b5fef4336e6195d891cd19bab2e569a5'then
    raise exception 'Qualified131 executor definition drift'using errcode='22023';end if;
  needle:=$n$  select * into receipt from family_auth.stay_command_receipts$n$;
  if(length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
    raise exception 'Exact terminal guard insertion point required'using errcode='22023';end if;
  addition:=$a$  if exists(select 1 from family_auth.stay_command_cancellations c
    where c.trip_id=t.id and c.actor_user_id=auth.uid()and c.operation_id=p_operation)then
    raise exception 'Original stay operation is terminally cancelled'using errcode='PT409';
  end if;
$a$;
  execute replace(definition,needle,addition||needle);
end;
$executor$;
-- Operational cancellations contain no personal content and are not portable Family history.
-- Their restrictive ownership and immutable rows remain in whole-database SQL backup/restore.
notify pgrst,'reload schema';
commit;
