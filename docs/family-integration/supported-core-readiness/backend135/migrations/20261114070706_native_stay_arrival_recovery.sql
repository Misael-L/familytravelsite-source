-- U05-B2b3c5: atomic native stay arrival ownership and recoverable discovery.
begin;
set local lock_timeout='5s';set local statement_timeout='60s';
alter table public.schedule_items add column owning_stay_id uuid references public.trip_stays(id) on delete restrict;
create unique index visit_owning_stay_uidx on public.schedule_items(owning_stay_id)where owning_stay_id is not null;
comment on column public.schedule_items.owning_stay_id is 'The stay that created this arrival occurrence; NULL for independently planned/released visits. Not catalog identity, visit timing, or reservation ownership.';
create table family_auth.native_stay_context(
 transaction_id xid8 not null,trip_id uuid not null,actor_user_id uuid not null,
 primary key(transaction_id,trip_id)
);
alter table family_auth.native_stay_context enable row level security;
revoke all on family_auth.native_stay_context from public,anon,authenticated,service_role;

create function family_auth.tg_native_stay_visit_guard()returns trigger language plpgsql security definer set search_path=''as $$
declare allowed boolean;s public.trip_stays%rowtype;
begin
 if tg_op='DELETE'then
  if old.owning_stay_id is not null then raise exception 'Owned arrivals require recoverable stay commands'using errcode='0A000';end if;
  return old;
 end if;
 select exists(select 1 from family_auth.native_stay_context c where c.transaction_id=pg_current_xact_id()and c.trip_id=new.trip_id and c.actor_user_id=auth.uid())into allowed;
 if new.owning_stay_id is not null then
  select *into s from public.trip_stays where id=new.owning_stay_id;
  if s.id is null or s.trip_id<>new.trip_id or new.timing_kind<>'untimed'then raise exception 'Same-Trip untimed stay arrival required'using errcode='23514';end if;
 end if;
 if not allowed and((tg_op='INSERT'and new.owning_stay_id is not null)or(tg_op='UPDATE'and(
  new.owning_stay_id is distinct from old.owning_stay_id or(old.owning_stay_id is not null and
  (new.plan_location_id,new.trip_day_id,new.timing_kind,new.starts_at,new.ends_at,new.time_zone,new.deleted_at,new.deleted_by_person_id)
  is distinct from(old.plan_location_id,old.trip_day_id,old.timing_kind,old.starts_at,old.ends_at,old.time_zone,old.deleted_at,old.deleted_by_person_id)))))then
  raise exception 'Use the atomic stay command for its owned arrival'using errcode='0A000';end if;
 return new;
end;$$;
create trigger aaa_native_stay_visit before insert or update or delete on public.schedule_items for each row execute function family_auth.tg_native_stay_visit_guard();
create function family_auth.tg_native_stay_parent_guard()returns trigger language plpgsql security definer set search_path=''as $$
begin
 if(new.location_id,new.arrival_date,new.check_in_time,new.deleted_at)is distinct from(old.location_id,old.arrival_date,old.check_in_time,old.deleted_at)
  and exists(select 1 from public.schedule_items where owning_stay_id=old.id)
  and not exists(select 1 from family_auth.native_stay_context c where c.transaction_id=pg_current_xact_id()and c.trip_id=new.trip_id and c.actor_user_id=auth.uid())then
  raise exception 'Owned arrival changes require the atomic native stay command'using errcode='0A000';end if;
 return new;
end;$$;
create trigger aaa_native_stay_parent before update on public.trip_stays for each row execute function family_auth.tg_native_stay_parent_guard();

create trigger immutable_native_stay_decision before update or delete on family_auth.trip_location_receipts for each row
 when(old.result->>'format'='family.native-stay-decision.v1')execute function family_auth.tg_immutable_visit_classification();

create function family_auth.native_stay_validate(p jsonb)returns void language plpgsql security definer set search_path=''as $$
declare i jsonb;k text;parsed uuid;o jsonb;v jsonb;
begin
 if jsonb_typeof(p)is distinct from'object'or octet_length(p::text)>2097152 or
  not(p?&array['format','operation_id','scope','stay_id','inner','arrival_visit_id','keep_stop','observation'])or
  p-array['format','operation_id','scope','stay_id','inner','arrival_visit_id','keep_stop','observation']<>'{}'::jsonb or
  p->>'format'is distinct from'family.native-stay.v1'or jsonb_typeof(p->'keep_stop')is distinct from'boolean'or jsonb_typeof(p->'observation')is distinct from'object'then
  raise exception 'Exact bounded native stay command required'using errcode='22023';end if;
 i:=p->'inner';o:=p->'observation';
 if octet_length(i::text)>1048576 then raise exception 'Inner stay command exceeds1MiB'using errcode='22023';end if;
 if jsonb_typeof(i)is distinct from'object'or p->'scope'is distinct from i->'scope'or p->'operation_id'is distinct from i->'operation_id'or p->'stay_id'is distinct from i->'stay_id'then
  raise exception 'Native and inner stay identities must agree'using errcode='22023';end if;
 foreach k in array array['operation_id','stay_id','arrival_visit_id']loop
  if jsonb_typeof(p->k)is distinct from'string'then raise exception 'Original UUIDs required'using errcode='22023';end if;parsed:=(p->>k)::uuid;
 end loop;
 if not(o?&array['trip_revision','day_id','location_id','owned_visit','day_visits'])or o-array['trip_revision','day_id','location_id','owned_visit','day_visits']<>'{}'::jsonb or
  jsonb_typeof(o->'trip_revision')is distinct from'number'or(o->>'trip_revision')!~'^[1-9][0-9]*$'or(o->>'trip_revision')::numeric>9007199254740991 or
  o->'trip_revision'is distinct from i#>'{observation,trip_revision}'or jsonb_typeof(o->'day_id')is distinct from'string'or jsonb_typeof(o->'location_id')is distinct from'string'or
  jsonb_typeof(o->'owned_visit')not in('object','null')or jsonb_typeof(o->'day_visits')is distinct from'array'or jsonb_array_length(o->'day_visits')>10000 then
  raise exception 'Complete original arrival observation required'using errcode='22023';end if;
 parsed:=(o->>'day_id')::uuid;parsed:=(o->>'location_id')::uuid;
 for v in select value from jsonb_array_elements(o->'day_visits')loop
  if jsonb_typeof(v)is distinct from'object'or not(v?&array['id','revision','order','location_id','timing_kind','starts_at','time_zone','owning_stay_id'])or
   v-array['id','revision','order','location_id','timing_kind','starts_at','time_zone','owning_stay_id']<>'{}'::jsonb or
   jsonb_typeof(v->'id')is distinct from'string'or jsonb_typeof(v->'revision')is distinct from'number'or(v->>'revision')!~'^[1-9][0-9]*$'or(v->>'revision')::numeric>9007199254740991 or
   jsonb_typeof(v->'order')is distinct from'number'or(v->>'order')!~'^-?[0-9]+$'or jsonb_typeof(v->'location_id')not in('string','null')or
   jsonb_typeof(v->'owning_stay_id')not in('string','null')or jsonb_typeof(v->'starts_at')not in('string','null')or jsonb_typeof(v->'time_zone')not in('string','null')or
   v->>'timing_kind'is null or v->>'timing_kind'not in('untimed','timed')then raise exception 'Exact original ordered visit facts required'using errcode='22023';end if;
  parsed:=(v->>'id')::uuid;parsed:=(v->>'location_id')::uuid;parsed:=(v->>'owning_stay_id')::uuid;
 end loop;
 if p->>'arrival_visit_id'in(p->>'operation_id',p->>'stay_id')then raise exception 'Distinct original arrival UUID required'using errcode='22023';end if;
 if i->>'format'='family.stay-bundle.v1'then
  perform family_auth.validate_stay_bundle_command(i);
  if p->>'arrival_visit_id'=i->>'reservation_id'or p->'keep_stop'<>'false'::jsonb then raise exception 'Invalid creation arrival intent'using errcode='22023';end if;
 else
  if not(i?&array['action','stay_id','operation_id','scope','observation','changes','reservation_id'])or
   i-array['action','stay_id','operation_id','scope','observation','changes','reservation_id']<>'{}'::jsonb or
   i->>'action'is null or i->>'action'not in('save','trash','restore')or i->'reservation_id'is distinct from'null'::jsonb or
   jsonb_typeof(i->'scope')is distinct from'object'or
   not(i->'scope'?&array['version','layer','trip_id','family_id','user_id','person_id','session_id'])or
   (i->'scope')-array['version','layer','trip_id','family_id','user_id','person_id','session_id']<>'{}'::jsonb or
   i#>'{scope,version}'is distinct from'1'::jsonb or i#>>'{scope,layer}'is distinct from'published'or
   jsonb_typeof(i->'observation')is distinct from'object'or
   not(i->'observation'?&array['trip_revision','stay','candidate_location','candidate_booking'])or
   (i->'observation')-array['trip_revision','stay','candidate_location','candidate_booking']<>'{}'::jsonb or
   jsonb_typeof(i#>'{observation,trip_revision}')is distinct from'number'or
   (i#>>'{observation,trip_revision}')!~'^[1-9][0-9]*$'or(i#>>'{observation,trip_revision}')::numeric>9007199254740991 or
   i#>'{observation,stay}'='null'::jsonb or i#>'{observation,candidate_booking}'is distinct from'null'::jsonb then
   raise exception 'Exact existing-stay command required'using errcode='22023';end if;
  perform family_auth.validate_stay_patch(i->'changes');
  if(i->>'action'<>'save'and i->'changes'<>'{}'::jsonb)or(i->>'action'<>'trash'and p->'keep_stop'<>'false'::jsonb)then
   raise exception 'Unexpected native stay fields'using errcode='22023';end if;
  foreach k in array array['trip_id','family_id','user_id','person_id','session_id']loop
   if jsonb_typeof(i->'scope'->k)is distinct from'string'then raise exception 'Typed scope required'using errcode='22023';end if;parsed:=(i->'scope'->>k)::uuid;
  end loop;
 end if;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid native stay field'using errcode='22023';
end;$$;

create function family_auth.native_stay_access(i jsonb,original boolean)returns public.trips language plpgsql security definer set search_path=''as $$
declare t public.trips%rowtype;s jsonb:=i->'scope';create_booking boolean:=i->>'format'='family.stay-bundle.v1';
begin
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||(s->>'trip_id'),0));
 perform 1 from public.trips where id=(s->>'trip_id')::uuid for no key update;
 if not original then s:=jsonb_set(s,'{session_id}',to_jsonb(auth.jwt()->>'session_id'));end if;
 t:=family_auth.stay_command_require((s->>'trip_id')::uuid,s,coalesce(create_booking,false));
 perform 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid()and(not_after is null or not_after>clock_timestamp())for share;
 if not found then raise exception 'Current unexpired session required'using errcode='42501';end if;
 perform 1 from public.family_members where family_id=t.family_id and user_id=auth.uid()and status='active'for share;
 if not found then raise exception 'Current membership required'using errcode='42501';end if;
 perform 1 from public.people where id=family_auth.actor_person_id(t.family_id)and family_id=t.family_id and user_id=auth.uid()and archived_at is null for share;
 if not found then raise exception 'Current person required'using errcode='42501';end if;
 return family_auth.stay_command_require(t.id,s,coalesce(create_booking,false));
end;$$;

create function family_auth.native_stay_observation(i jsonb,p_visit uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare t public.trips%rowtype;s public.trip_stays%rowtype;after_stay public.trip_stays%rowtype;day uuid;owned jsonb;rows jsonb;base jsonb;
begin
 select *into t from public.trips where id=(i#>>'{scope,trip_id}')::uuid;
 if i->>'format'='family.stay-bundle.v1'then
  base:=family_auth.stay_bundle_observation(t.id,(i#>>'{stay,location_id}')::uuid,(i#>>'{observation,arrival_day,id}')::uuid,
   (i#>>'{observation,departure_day,id}')::uuid,(i->>'stay_id')::uuid,(i->>'reservation_id')::uuid);
  after_stay:=jsonb_populate_record(null::public.trip_stays,i->'stay');
 else
  select *into s from public.trip_stays where id=(i->>'stay_id')::uuid and trip_id=t.id;
  if s.id is null then raise exception 'Original stay unavailable'using errcode='PT409';end if;
  base:=family_auth.stay_command_observation(t.id,s.id,coalesce((i#>>'{changes,location_id}')::uuid,s.location_id),null);
  after_stay:=jsonb_populate_record(s,i->'changes');
 end if;
 if base is distinct from i->'observation'then raise exception 'Original stay observation changed'using errcode='PT409';end if;
 select id into day from public.trip_days where trip_id=t.id and civil_day=after_stay.arrival_date;
 if day is null then raise exception 'Native arrival requires an original Trip day'using errcode='0A000';end if;
 select to_jsonb(v)into owned from public.schedule_items v where v.owning_stay_id=(i->>'stay_id')::uuid and v.trip_id=t.id;
 if exists(select 1 from public.schedule_items where id=p_visit)then raise exception 'Proposed arrival identity unavailable'using errcode='PT409';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'revision',v.visit_revision,'order',v.sort_order,
  'location_id',v.plan_location_id,'timing_kind',v.timing_kind,'starts_at',v.starts_at,'time_zone',v.time_zone,
  'owning_stay_id',v.owning_stay_id)order by v.sort_order,v.id),'[]')into rows
 from public.schedule_items v where v.trip_id=t.id and v.trip_day_id=day and v.deleted_at is null;
 if exists(select 1 from jsonb_array_elements(rows)r where r->>'timing_kind'='legacy')then raise exception 'Classify legacy timing before native stay placement'using errcode='0A000';end if;
 return jsonb_build_object('trip_revision',t.revision,'day_id',day,'location_id',after_stay.location_id,'owned_visit',owned,'day_visits',rows);
end;$$;

create function public.get_family_native_stay_context_v1(p_inner jsonb,p_arrival_visit_id uuid,p_keep_stop boolean default false)returns jsonb
language plpgsql security definer set search_path=''as $$
declare p jsonb;t public.trips%rowtype;
begin
 p:=jsonb_build_object('format','family.native-stay.v1','operation_id',p_inner->'operation_id','scope',p_inner->'scope','stay_id',p_inner->'stay_id',
  'inner',p_inner,'arrival_visit_id',p_arrival_visit_id,'keep_stop',p_keep_stop,'observation',jsonb_build_object('trip_revision',p_inner#>'{observation,trip_revision}',
   'day_id','00000000-0000-0000-0000-000000000000','location_id','00000000-0000-0000-0000-000000000000','owned_visit',null,'day_visits','[]'::jsonb));
 perform family_auth.native_stay_validate(p);t:=family_auth.native_stay_access(p_inner,true);
 p:=jsonb_set(p,'{observation}',family_auth.native_stay_observation(p_inner,p_arrival_visit_id));
 if octet_length(p::text)>2097152 then raise exception 'Native stay context exceeds2MiB'using errcode='54000';end if;
 return jsonb_build_object('format','family.native-stay-context.v1','command',p,'native_controls',false);
end;$$;

-- Seat only the owned arrival. Its clock is check-in guidance, not an appointment timestamp.
create function family_auth.native_stay_seat(p_trip uuid,p_day uuid,p_visit uuid,p_stay uuid)returns void language plpgsql security definer set search_path=''as $$
declare ids uuid[];new_ids uuid[];v record;s public.trip_stays%rowtype;at_time time;peer_time time;seat integer:=0;position integer:=0;earlier boolean;
begin
 select *into s from public.trip_stays where id=p_stay and trip_id=p_trip;
 for v in select a.*,b.check_in_time,b.created_at stay_created,b.id stay_id from public.schedule_items a
  left join public.trip_stays b on b.id=a.owning_stay_id and b.trip_id=a.trip_id
  where a.trip_id=p_trip and a.trip_day_id=p_day and a.deleted_at is null and a.id<>p_visit order by a.sort_order,a.id loop
  ids:=array_append(ids,v.id);position:=position+1;
  peer_time:=case when v.owning_stay_id is not null then v.check_in_time when v.timing_kind='timed'then(v.starts_at at time zone v.time_zone)::time end;
  earlier:=v.owning_stay_id is not null and(v.stay_created,v.stay_id)<(s.created_at,s.id);
  if (case when s.check_in_time is null then peer_time is null and earlier
    when peer_time is null then v.owning_stay_id is not null
    when peer_time=s.check_in_time then v.owning_stay_id is null or earlier
    else peer_time<s.check_in_time end)then seat:=position;end if;
 end loop;
 ids:=coalesce(ids,array[]::uuid[]);new_ids:=ids[1:seat]||array[p_visit]||ids[seat+1:cardinality(ids)];
 update public.schedule_items a set sort_order=n.n-1 from unnest(new_ids)with ordinality n(id,n)
  where a.id=n.id and a.trip_id=p_trip and a.sort_order<>n.n-1;
end;$$;

create function family_auth.native_stay_mirror(p_trip uuid,p_stay uuid,p_visit uuid,p_action text,p_keep boolean,p_before jsonb)returns uuid
language plpgsql security definer set search_path=''as $$
declare s public.trip_stays%rowtype;own public.schedule_items%rowtype;other uuid;day uuid;new_id uuid;label text;order_value integer;shared boolean:=false;
begin
 select *into s from public.trip_stays where id=p_stay and trip_id=p_trip;
 select *into own from public.schedule_items where owning_stay_id=s.id and trip_id=p_trip for update;
 if own.id is not null then
  select exists(select 1 from public.trip_stays b join public.trip_days d on d.trip_id=b.trip_id and d.civil_day=b.arrival_date
   where b.trip_id=p_trip and b.id<>s.id and b.deleted_at is null and b.location_id=own.plan_location_id and d.id=own.trip_day_id)into shared;
 end if;
 if p_action='trash'then
  if own.id is not null then
   if p_keep or shared then update public.schedule_items set owning_stay_id=null where id=own.id;
   else update public.schedule_items set deleted_at=clock_timestamp(),deleted_by_person_id=family_auth.actor_person_id(s.family_id)where id=own.id and deleted_at is null;end if;
  end if;
  return case when own.id is not null and(p_keep or shared)then own.id end;
 end if;
 select id into day from public.trip_days where trip_id=p_trip and civil_day=s.arrival_date;
 if day is null then raise exception 'Original arrival day unavailable'using errcode='PT409';end if;
 if own.id is not null and own.deleted_at is null and p_action='save'and
  (s.location_id,s.arrival_date,s.check_in_time)is not distinct from
  ((p_before#>>'{stay,location_id}')::uuid,(p_before#>>'{stay,arrival_date}')::date,(p_before#>>'{stay,check_in_time}')::time)then return own.id;end if;
 if shared and own.id is not null and(own.plan_location_id,own.trip_day_id)is distinct from(s.location_id,day)then
  update public.schedule_items set owning_stay_id=null where id=own.id;own:=null;
 end if;
 select id into other from public.schedule_items where trip_id=p_trip and trip_day_id=day and plan_location_id=s.location_id
  and deleted_at is null and id is distinct from own.id order by sort_order,id limit 1;
 if other is not null then
  if own.id is not null then update public.schedule_items set owning_stay_id=null,deleted_at=coalesce(deleted_at,clock_timestamp()),deleted_by_person_id=coalesce(deleted_by_person_id,family_auth.actor_person_id(s.family_id))where id=own.id;end if;
  return other;
 end if;
 if own.id is null then
  select family_auth.trip_location_projection(l)->>'name'into label from public.trip_plan_locations l where l.id=s.location_id and l.trip_id=p_trip;
  if nullif(btrim(label),'')is null or length(label)>500 then raise exception 'Arrival label exceeds visit contract'using errcode='22023';end if;
  select coalesce(max(sort_order),-1)+1 into order_value from public.schedule_items where trip_id=p_trip and trip_day_id=day and deleted_at is null;
  insert into public.schedule_items(id,trip_id,activity,timing_kind,plan_location_id,trip_day_id,sort_order,owning_stay_id)
   values(p_visit,p_trip,label,'untimed',s.location_id,day,order_value,s.id)returning id into new_id;
 else
  update public.schedule_items set plan_location_id=s.location_id,trip_day_id=day,deleted_at=null,deleted_by_person_id=null where id=own.id returning id into new_id;
 end if;
 perform family_auth.native_stay_seat(p_trip,day,new_id,s.id);return new_id;
end;$$;

create function family_auth.native_stay_inner_outcome(i jsonb,p_cancel boolean)returns jsonb language plpgsql security definer set search_path=''as $$
begin
 if i->>'format'='family.stay-bundle.v1'then return family_auth.stay_bundle_outcome(i,p_cancel);end if;
 return family_auth.stay_original_outcome((i#>>'{scope,trip_id}')::uuid,(i->>'stay_id')::uuid,(i->>'operation_id')::uuid,
  i->'scope',i->'observation',i->>'action',i->'changes',null,p_cancel);
end;$$;

create function public.execute_family_native_stay_v1(p_command jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare i jsonb;t public.trips%rowtype;receipt family_auth.trip_location_receipts%rowtype;digest bytea;inner_ack jsonb;result jsonb;arrived uuid;action text;scope jsonb;before_stay jsonb;
begin
 perform family_auth.native_stay_validate(p_command);i:=p_command->'inner';scope:=i->'scope';t:=family_auth.native_stay_access(i,true);
 digest:=sha256(convert_to(p_command::text,'UTF8'));
 select *into receipt from family_auth.trip_location_receipts where trip_id=t.id and actor_user_id=auth.uid()and operation_id=(i->>'operation_id')::uuid;
 if receipt.operation_id is not null then
  if receipt.request_sha256<>digest or receipt.result->>'format'is distinct from'family.native-stay-decision.v1'then raise exception 'Original native operation reused'using errcode='PT409';end if;
  if receipt.result->>'status'<>'committed'then raise exception 'Original native operation cancelled'using errcode='PT409';end if;
  return receipt.result->'acknowledgement';
 end if;
 if family_auth.native_stay_inner_outcome(i,false)->>'status'<>'unknown'then raise exception 'Original inner operation already decided outside native command'using errcode='PT409';end if;
 perform 1 from public.schedule_items where trip_id=t.id order by id for update;
 t:=family_auth.native_stay_access(i,true);
 if family_auth.native_stay_observation(i,(p_command->>'arrival_visit_id')::uuid)is distinct from p_command->'observation'then raise exception 'Original arrival observation changed'using errcode='PT409';end if;
 insert into family_auth.native_stay_context values(pg_current_xact_id(),t.id,auth.uid());
 insert into family_auth.visit_command_context(transaction_id,trip_id,actor_user_id)values(pg_current_xact_id(),t.id,auth.uid());
 before_stay:=i#>'{observation,stay}';
 if i->>'format'='family.stay-bundle.v1'then inner_ack:=public.create_family_stay_bundle_v1(i);action:='create';
 else action:=i->>'action';inner_ack:=family_auth.execute_stay_command(t.id,(i->>'stay_id')::uuid,(i->>'operation_id')::uuid,scope,i->'observation',action,i->'changes',null);end if;
 arrived:=family_auth.native_stay_mirror(t.id,(i->>'stay_id')::uuid,(p_command->>'arrival_visit_id')::uuid,action,(p_command->>'keep_stop')::boolean,before_stay);
 perform public.get_family_trip_booking_view_v2(t.id);
 t:=family_auth.native_stay_access(i,true);
 if exists(select 1 from public.schedule_items v join public.trip_stays s on s.id=v.owning_stay_id where s.trip_id=t.id and
  (v.trip_id<>s.trip_id or(v.deleted_at is null)<>(s.deleted_at is null)))then raise exception 'Stay arrival lifecycle is inconsistent'using errcode='23514';end if;
 result:=jsonb_build_object('format','family.native-stay-ack.v1','acknowledgement',true,'read_current_required',true,'trip_id',t.id,
  'stay_id',i->'stay_id','operation_id',i->'operation_id','trip_revision_after',t.revision,'arrival_visit_id',arrived,'action',action);
 if t.revision>9007199254740991 then raise exception 'Native acknowledgement exceeds safe range'using errcode='54000';end if;
 insert into family_auth.trip_location_receipts(trip_id,actor_user_id,operation_id,request_sha256,result)
  values(t.id,auth.uid(),(i->>'operation_id')::uuid,digest,jsonb_build_object('format','family.native-stay-decision.v1','status','committed','acknowledgement',result,'cancelled_at',null));
 delete from family_auth.visit_command_context where transaction_id=pg_current_xact_id()and trip_id=t.id;
 delete from family_auth.native_stay_context where transaction_id=pg_current_xact_id()and trip_id=t.id;
 return result;
exception when unique_violation or serialization_failure or deadlock_detected then raise exception 'Concurrent native stay change; retain original intent'using errcode='PT409';
end;$$;

create function family_auth.native_stay_outcome(p jsonb,p_cancel boolean)returns jsonb language plpgsql security definer set search_path=''as $$
declare i jsonb;t public.trips%rowtype;r family_auth.trip_location_receipts%rowtype;digest bytea;decision jsonb;
begin
 perform family_auth.native_stay_validate(p);i:=p->'inner';t:=family_auth.native_stay_access(i,false);digest:=sha256(convert_to(p::text,'UTF8'));
 select *into r from family_auth.trip_location_receipts where trip_id=t.id and actor_user_id=auth.uid()and operation_id=(i->>'operation_id')::uuid;
 if r.operation_id is not null then
  if r.request_sha256<>digest or r.result->>'format'is distinct from'family.native-stay-decision.v1'then raise exception 'Original native operation reused'using errcode='PT409';end if;decision:=r.result;
 else
  if family_auth.native_stay_inner_outcome(i,false)->>'status'<>'unknown'then raise exception 'Original inner operation decided outside native command'using errcode='PT409';end if;
  if p_cancel then
   perform family_auth.native_stay_inner_outcome(i,true);
   decision:=jsonb_build_object('format','family.native-stay-decision.v1','status','cancelled','acknowledgement',null,'cancelled_at',clock_timestamp());
   insert into family_auth.trip_location_receipts(trip_id,actor_user_id,operation_id,request_sha256,result)values(t.id,auth.uid(),(i->>'operation_id')::uuid,digest,decision);
  else decision:=jsonb_build_object('status','unknown','acknowledgement',null,'cancelled_at',null);end if;
 end if;
 return decision||jsonb_build_object('format','family.native-stay-outcome.v1','trip_id',t.id,'stay_id',i->'stay_id','operation_id',i->'operation_id',
  'original_session_id',i#>'{scope,session_id}','current_scope',family_auth.stay_command_scope(t));
end;$$;
create function public.get_family_native_stay_outcome_v1(p_command jsonb)returns jsonb language sql security definer set search_path=''as $$select family_auth.native_stay_outcome(p_command,false);$$;
create function public.cancel_family_native_stay_v1(p_command jsonb)returns jsonb language sql security definer set search_path=''as $$select family_auth.native_stay_outcome(p_command,true);$$;

create function family_auth.native_stay_snapshot(p_trip uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare core jsonb;visits jsonb;
begin
 core:=family_auth.booking_stay_snapshot(p_trip);
 select coalesce(jsonb_agg(case when s.id is not null then v||jsonb_build_object('owning_stay_id',s.id)else v end order by n),'[]')into visits
 from jsonb_array_elements(core#>'{planner,state,visits}')with ordinality a(v,n)
 left join public.schedule_items q on q.id=(v->>'id')::uuid and q.trip_id=p_trip
 left join public.trip_stays s on s.id=q.owning_stay_id and s.trip_id=p_trip and s.deleted_at is null;
 core:=jsonb_set(core,'{planner,state,visits}',visits);
 if octet_length(core::text)>8388608 then raise exception 'Native coherent view exceeds8MiB'using errcode='54000';end if;
 return jsonb_build_object('format','family.native-stay-view.v1','core',core);
end;$$;
create function public.get_family_native_stay_view_v1(p_trip_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare t public.trips%rowtype;after_access public.trips%rowtype;result jsonb;
begin
 t:=family_auth.require_booking_stay_read(p_trip_id);result:=family_auth.native_stay_snapshot(t.id);
 after_access:=family_auth.require_booking_stay_read(t.id);
 if result#>>'{core,trip_id}'is distinct from after_access.id::text or result#>>'{core,family_id}'is distinct from after_access.family_id::text or
  result#>>'{core,user_id}'is distinct from auth.uid()::text or result#>>'{core,person_id}'is distinct from family_auth.actor_person_id(after_access.family_id)::text then
  raise exception 'Original native read authority changed'using errcode='42501';end if;
 return result;
end;$$;
create function family_auth.trashed_stays_snapshot(p_trip uuid,p_after jsonb,p_limit integer)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare rows jsonb;cursor jsonb;more boolean;
begin
 select count(*)>p_limit into more from(select 1 from public.trip_stays s where s.trip_id=p_trip and s.deleted_at is not null and
  (p_after is null or(s.deleted_at,s.id)>((p_after->>'deleted_at')::timestamptz,(p_after->>'id')::uuid))order by s.deleted_at,s.id limit p_limit+1)q;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision,'arrival_date',s.arrival_date,'departure_date',s.departure_date,'deleted_at',s.deleted_at,
  'name',coalesce(family_auth.trip_location_projection(l)->>'name','Unavailable lodging'),
  'restore_available',l.deleted_at is null and family_auth.trip_location_projection(l)->'source_archived'='false'::jsonb)order by s.deleted_at,s.id),'[]')into rows
 from(select *from public.trip_stays s where s.trip_id=p_trip and s.deleted_at is not null and
  (p_after is null or(s.deleted_at,s.id)>((p_after->>'deleted_at')::timestamptz,(p_after->>'id')::uuid))order by s.deleted_at,s.id limit p_limit)s
 join public.trip_plan_locations l on l.id=s.location_id and l.trip_id=s.trip_id;
 if more then cursor:=jsonb_build_object('deleted_at',rows->-1->'deleted_at','id',rows->-1->'id');end if;
 return jsonb_build_object('format','family.stay-trash.v1','trip_id',p_trip,'items',rows,'has_more',more,'next_cursor',cursor);
end;$$;
create function public.list_family_trashed_stays_v1(p_trip_id uuid,p_after jsonb default null,p_limit integer default 25)returns jsonb
language plpgsql security definer set search_path=''as $$
declare t public.trips%rowtype;result jsonb;dummy uuid;stamp timestamptz;original_scope jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Trash page limit1..50 required'using errcode='22023';end if;
 if p_after is not null then
  if octet_length(p_after::text)>512 or jsonb_typeof(p_after)is distinct from'object'or not(p_after?&array['deleted_at','id'])or p_after-array['deleted_at','id']<>'{}'::jsonb or
   jsonb_typeof(p_after->'id')is distinct from'string'or jsonb_typeof(p_after->'deleted_at')is distinct from'string'or p_after->>'deleted_at'!~'^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'then raise exception 'Exact Trash cursor required'using errcode='22023';end if;
  dummy:=(p_after->>'id')::uuid;stamp:=(p_after->>'deleted_at')::timestamptz;
  if not isfinite(stamp)then raise exception 'Finite Trash cursor required'using errcode='22023';end if;
 end if;
 t:=family_auth.require_booking_stay_read(p_trip_id);
 if public.can_trip_action_direct(t.id,'trip.schedule.manage')is distinct from true then raise exception 'Current stay recovery permission required'using errcode='42501';end if;
 original_scope:=family_auth.stay_command_scope(t);
 result:=family_auth.trashed_stays_snapshot(t.id,p_after,p_limit);
 t:=family_auth.require_booking_stay_read(t.id);
 if public.can_trip_action_direct(t.id,'trip.schedule.manage')is distinct from true or family_auth.stay_command_scope(t)is distinct from original_scope then raise exception 'Current recovery permission changed'using errcode='42501';end if;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'Invalid Trash cursor'using errcode='22023';
end;$$;

-- No old routine bodies, existing grants or original content rows are rewritten.
do $$declare p record;begin
 for p in select x.oid::regprocedure sig from pg_proc x join pg_namespace n on n.oid=x.pronamespace
  where(n.nspname='family_auth'and(x.proname like'native_stay_%'or x.proname in('tg_native_stay_visit_guard','tg_native_stay_parent_guard','trashed_stays_snapshot')))
   or(n.nspname='public'and x.proname in('get_family_native_stay_context_v1','execute_family_native_stay_v1','get_family_native_stay_outcome_v1','cancel_family_native_stay_v1','get_family_native_stay_view_v1','list_family_trashed_stays_v1'))loop
  execute format('alter function %s owner to postgres',p.sig);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',p.sig);
 end loop;
end;$$;
grant execute on function public.get_family_native_stay_context_v1(jsonb,uuid,boolean),public.execute_family_native_stay_v1(jsonb),
 public.get_family_native_stay_outcome_v1(jsonb),public.cancel_family_native_stay_v1(jsonb),public.get_family_native_stay_view_v1(uuid),public.list_family_trashed_stays_v1(uuid,jsonb,integer)to authenticated;
alter table family_auth.native_stay_context owner to postgres;
notify pgrst,'reload schema';
commit;
