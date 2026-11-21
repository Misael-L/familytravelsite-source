-- U04-D2c1b: immutable terminal cancellation in the shared packing operation namespace.
begin;
set local lock_timeout='5s';set local statement_timeout='60s';
do $pin$begin
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_bag_execute_entry(uuid,uuid,jsonb,text,uuid,bigint,bigint,jsonb,jsonb)'::regprocedure),'UTF8')),'hex')<>'a31c521b25c52d496fccbaac05c39a1cf0dbb0c975a17f3f12190f4bba7c48e1'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_category_aggregate_execute_v3_entry(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb)'::regprocedure),'UTF8')),'hex')<>'3ee317c1d10472be7f12ebaa31ff385a6a16fb24dd8de92571565b096619d588'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_category_execute_entry(uuid,uuid,jsonb,text,bigint,jsonb,jsonb)'::regprocedure),'UTF8')),'hex')<>'9a37e11fcd467b90fb1470a58a6817dde11150e626e611eb77e7f1dacafc3d06'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_category_item_v2_entry(uuid,uuid,jsonb,text,uuid,bigint,bigint,uuid,jsonb,jsonb)'::regprocedure),'UTF8')),'hex')<>'2c94dbf441ed8c19b06dc6d6a0f58610ed2c32ab84ab8276a25759b61ffcc480'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_category_lifecycle_v2_entry(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb)'::regprocedure),'UTF8')),'hex')<>'05450e11ea427f91384164941d5baed2edc2986d923ef4e765ab37096ac58b90'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_category_require_v2(uuid,boolean,timestamp with time zone)'::regprocedure),'UTF8')),'hex')<>'e4d7c7494e751c88b531580b046d8ec59e660efda974312f21232717545382ec'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_execute_entry(uuid,uuid,jsonb,text,uuid,bigint,bigint,jsonb)'::regprocedure),'UTF8')),'hex')<>'7f941fae496fd6696c695ba36dc28358bc5c5757cda1576188d29a57531fa1e0'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_group_execute_entry(uuid,uuid,jsonb,text,bigint,jsonb,jsonb,jsonb)'::regprocedure),'UTF8')),'hex')<>'c2eae658fe6a50b2421b0c6387b14b6b218014fc898e3dfd96c1eba183ea0c50'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
end $pin$;
create table family_auth.packing_command_cancellations(
 trip_id uuid not null references public.trips(id)on delete restrict,
 actor_user_id uuid not null references auth.users(id)on delete restrict,
 actor_person_id uuid not null references public.people(id)on delete restrict,
 operation_id uuid not null,
 protocol text not null,
 action text not null,
 target_id uuid not null,
 original_trip_lifecycle_revision bigint not null check(original_trip_lifecycle_revision between 0 and 9007199254740991),
 request_sha256 bytea not null check(octet_length(request_sha256)=32),
 cancelled_at timestamptz not null default clock_timestamp()check(isfinite(cancelled_at)),
 primary key(trip_id,actor_user_id,operation_id),
 check((protocol='packing-item-v1'and action='restore')or(protocol='packing-category-aggregate-v3'and action='category-restore-batch')or(protocol='packing-bag-v1'and action='bag-restore'))
);
create index packing_cancel_actor_idx on family_auth.packing_command_cancellations(actor_user_id);
create index packing_cancel_person_idx on family_auth.packing_command_cancellations(actor_person_id);
alter table family_auth.packing_command_cancellations enable row level security;
revoke all on family_auth.packing_command_cancellations from public,anon,authenticated,service_role;
create trigger packing_cancel_immutable before update or delete on family_auth.packing_command_cancellations
 for each row execute function family_auth.tg_immutable_visit_classification();

-- Both terminal outcomes use the exact same advisory/root/collection order as every packing executor.
create function family_auth.tg_packing_terminal_exclusion()returns trigger
language plpgsql security definer set search_path=''as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||new.trip_id::text,0));
 perform 1 from public.trips where id=new.trip_id for no key update;
 perform 1 from family_auth.trip_packing_state where trip_id=new.trip_id for update;
 if tg_table_name='packing_command_receipts'then
  if exists(select 1 from family_auth.packing_command_cancellations where(trip_id,actor_user_id,operation_id)=(new.trip_id,new.actor_user_id,new.operation_id))then
   raise exception 'Packing operation has terminal cancellation'using errcode='PT409';end if;
 else
  if exists(select 1 from family_auth.packing_command_receipts where(trip_id,actor_user_id,operation_id)=(new.trip_id,new.actor_user_id,new.operation_id))then
   raise exception 'Packing operation already committed'using errcode='PT409';end if;
  -- Retain the Person link across commit, including concurrent RPC-only user unlink.
  perform 1 from public.people p join public.trips t on t.family_id=p.family_id where p.id=new.actor_person_id and p.user_id=new.actor_user_id and t.id=new.trip_id for share of p;
  if not found then
   raise exception 'Cancellation actor must belong to this Trip Family'using errcode='23514';end if;
  if(select count(*)from(select 1 from family_auth.packing_command_cancellations where trip_id=new.trip_id and actor_user_id=new.actor_user_id limit 10000)c)>=10000 then
   raise exception 'Cancellation history quota exceeded'using errcode='54000';end if;
 end if;
 return new;
end $$;
create trigger aa_packing_terminal_exclusion before insert on family_auth.packing_command_receipts for each row execute function family_auth.tg_packing_terminal_exclusion();
create trigger aa_packing_cancel_exclusion before insert on family_auth.packing_command_cancellations for each row execute function family_auth.tg_packing_terminal_exclusion();
create function family_auth.tg_packing_cancel_person_identity()returns trigger
language plpgsql security definer set search_path=''as $$
begin
 if(new.family_id,new.user_id)is distinct from(old.family_id,old.user_id)and exists(select 1 from family_auth.packing_command_cancellations where actor_person_id=old.id)then
  raise exception 'Cancellation history preserves Person identity'using errcode='23514';end if;
 return new;
end $$;
create trigger packing_cancel_person_identity before update of family_id,user_id on public.people for each row execute function family_auth.tg_packing_cancel_person_identity();
create function family_auth.tg_packing_cancel_trip_identity()returns trigger
language plpgsql security definer set search_path=''as $$
begin
 if new.family_id is distinct from old.family_id and exists(select 1 from family_auth.packing_command_cancellations where trip_id=old.id)then
  raise exception 'Cancellation history preserves Trip identity'using errcode='23514';end if;
 return new;
end $$;
create trigger packing_cancel_trip_identity before update of family_id on public.trips for each row execute function family_auth.tg_packing_cancel_trip_identity();

-- Validation/digest uses original typed SQL arguments, never a browser-supplied checksum.
create function family_auth.packing_restore_original_request(p_trip uuid,p_operation uuid,p_protocol text,p_args jsonb)returns jsonb
language plpgsql stable set search_path=''as $$
declare keys text[];s jsonb;o jsonb;expected_action text;target uuid;rev bigint;collection bigint;intent bytea;k text;n numeric;limit_bytes integer;
begin
 if p_trip is null or p_operation is null or p_protocol is null or jsonb_typeof(p_args)is distinct from'object'then raise exception 'Complete original restore arguments required'using errcode='22023';end if;
 if p_protocol='packing-item-v1'then
  keys:=array['p_trip_id','p_operation_id','p_scope','p_action','p_target_id','p_expected_revision','p_expected_collection_revision','p_values'];expected_action:='restore';limit_bytes:=131072;
 elsif p_protocol='packing-category-aggregate-v3'then
  keys:=array['p_trip_id','p_operation_id','p_scope','p_action','p_target_id','p_expected_collection_revision','p_observed','p_values'];expected_action:='category-restore-batch';limit_bytes:=8388608;
 elsif p_protocol='packing-bag-v1'then
  keys:=array['p_trip_id','p_operation_id','p_scope','p_action','p_target_id','p_expected_revision','p_expected_collection_revision','p_observed','p_values'];expected_action:='bag-restore';limit_bytes:=1048576;
 else raise exception 'Unsupported restore protocol'using errcode='22023';end if;
 if octet_length(p_args::text)>limit_bytes then raise exception 'Original restore request exceeds bound'using errcode='54000';end if;
 if not(p_args ?& keys)or p_args-keys<>'{}'::jsonb or p_args->'p_trip_id'is distinct from to_jsonb(p_trip::text)or p_args->'p_operation_id'is distinct from to_jsonb(p_operation::text)
 or p_args->'p_action'is distinct from to_jsonb(expected_action)or p_args->'p_values'is distinct from'{}'::jsonb or jsonb_typeof(p_args->'p_target_id')is distinct from'string'
 or(p_args->>'p_target_id')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'then raise exception 'Exact original restore arguments required'using errcode='22023';end if;
 target:=(p_args->>'p_target_id')::uuid;s:=p_args->'p_scope';
 if jsonb_typeof(s)is distinct from'object'or octet_length(s::text)>4096 or not(s ?& array['version','trip_id','family_id','user_id','person_id','layer','trip_lifecycle_revision'])
 or s-array['version','trip_id','family_id','user_id','person_id','layer','trip_lifecycle_revision']<>'{}'::jsonb or s->'version'is distinct from'1'::jsonb or s->'layer'is distinct from'"published"'::jsonb or s->'trip_id'is distinct from to_jsonb(p_trip::text)then raise exception 'Exact original scope required'using errcode='22023';end if;
 foreach k in array array['family_id','user_id','person_id']loop
  if jsonb_typeof(s->k)is distinct from'string'or(s->>k)!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'then raise exception 'Canonical scope identity required'using errcode='22023';end if;
 end loop;
 if jsonb_typeof(s->'trip_lifecycle_revision')is distinct from'number'then raise exception 'Original lifecycle required'using errcode='22023';end if;
 n:=(s->>'trip_lifecycle_revision')::numeric;if n<>trunc(n)or n not between 0 and 9007199254740991 then raise exception 'Lifecycle exceeds safe range'using errcode='22023';end if;
 if p_protocol<>'packing-category-aggregate-v3'then
  if jsonb_typeof(p_args->'p_expected_revision')is distinct from'number'then raise exception 'Original row revision required'using errcode='22023';end if;
  n:=(p_args->>'p_expected_revision')::numeric;if n<>trunc(n)or n not between 1 and 9007199254740991 then raise exception 'Revision exceeds safe range'using errcode='22023';end if;rev:=n::bigint;
 end if;
 if p_protocol='packing-item-v1'then
  if p_args->'p_expected_collection_revision'is distinct from'null'::jsonb then raise exception 'Item restore has no collection revision'using errcode='22023';end if;
  intent:=sha256(convert_to(jsonb_build_array(s,expected_action,target,rev,null::bigint,p_args->'p_values')::text,'UTF8'));
 else
  if jsonb_typeof(p_args->'p_expected_collection_revision')is distinct from'number'then raise exception 'Original collection revision required'using errcode='22023';end if;
  n:=(p_args->>'p_expected_collection_revision')::numeric;if n<>trunc(n)or n not between 0 and 9007199254740991 then raise exception 'Collection exceeds safe range'using errcode='22023';end if;collection:=n::bigint;o:=p_args->'p_observed';
  if p_protocol='packing-category-aggregate-v3'then
   perform family_auth.validate_packing_aggregate_request(expected_action,target,o,p_args->'p_values');
   if o->'scope'is distinct from s or o->'collection_revision'is distinct from to_jsonb(collection)or o->'category'->'id'is distinct from to_jsonb(target::text)or jsonb_typeof(o->'batch')is distinct from'object'or o->'category'->>'deleted_at'is null then raise exception 'Complete original deleted batch required'using errcode='22023';end if;
   intent:=sha256(convert_to(jsonb_build_array('packing-category-aggregate-v3',s,expected_action,target,collection,o,p_args->'p_values')::text,'UTF8'));
  else
   perform family_auth.validate_packing_bag_request(expected_action,p_args->'p_values');
   if jsonb_typeof(o)is distinct from'object'or not(o ?& array['version','kind','scope','collection_revision','bag','member_person_ids'])or o-array['version','kind','scope','collection_revision','bag','member_person_ids']<>'{}'::jsonb
   or o->'version'is distinct from'1'::jsonb or o->>'kind'is distinct from'packing-bag-observation'or o->'scope'is distinct from s or o->'collection_revision'is distinct from to_jsonb(collection)
   or jsonb_typeof(o->'bag')is distinct from'object'or not((o->'bag')?&array['id','trip_id','name','color','sort_order','weight_limit_grams','created_at','updated_at','revision','deleted_at','deleted_by_person_id'])
   or(o->'bag')-array['id','trip_id','name','color','sort_order','weight_limit_grams','created_at','updated_at','revision','deleted_at','deleted_by_person_id']<>'{}'::jsonb
   or o->'bag'->'id'is distinct from to_jsonb(target::text)or o->'bag'->'trip_id'is distinct from to_jsonb(p_trip::text)or o->'bag'->'revision'is distinct from to_jsonb(rev)or o->'bag'->>'deleted_at'is null
   or jsonb_typeof(o->'member_person_ids')is distinct from'array'then raise exception 'Complete original deleted bag required'using errcode='22023';end if;
   intent:=sha256(convert_to(jsonb_build_array('packing-bag-v1',s,expected_action,target,rev,collection,o,p_args->'p_values')::text,'UTF8'));
  end if;
 end if;
 return jsonb_build_object('scope',s,'action',expected_action,'target_id',target,'request_sha256',encode(intent,'hex'));
end $$;

create function family_auth.packing_restore_cancellation_context(p_trip uuid,p_original_scope jsonb)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare scope jsonb;
begin
 perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());scope:=family_auth.packing_scope(p_trip);
 if(scope-'trip_lifecycle_revision')is distinct from(p_original_scope-'trip_lifecycle_revision')or(p_original_scope->>'trip_lifecycle_revision')::numeric>(scope->>'trip_lifecycle_revision')::numeric then
  raise exception 'Original restore belongs to another context'using errcode='PT409';end if;
 return scope;
end $$;
create function family_auth.packing_restore_cancellation_read_entry(p_trip uuid,p_operation uuid,p_protocol text,p_original_args jsonb)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare original jsonb;scope jsonb;r family_auth.packing_command_receipts%rowtype;c family_auth.packing_command_cancellations%rowtype;redacted boolean:=false;result jsonb;outcome text;response jsonb;
begin
 perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
 original:=family_auth.packing_restore_original_request(p_trip,p_operation,p_protocol,p_original_args);scope:=family_auth.packing_restore_cancellation_context(p_trip,original->'scope');
 select * into r from family_auth.packing_command_receipts where(trip_id,actor_user_id,operation_id)=(p_trip,auth.uid(),p_operation);
 if found then
  if r.action is distinct from original->>'action'or r.target_id is distinct from(original->>'target_id')::uuid or encode(r.request_sha256,'hex')is distinct from original->>'request_sha256'or r.actor_person_id::text is distinct from scope->>'person_id'then raise exception 'Operation reused with changed restore intent'using errcode='PT409';end if;
  outcome:='committed';redacted:=not family_auth.packing_result_visible(r.result);result:=case when redacted then null else r.result end;
 else
  select * into c from family_auth.packing_command_cancellations where(trip_id,actor_user_id,operation_id)=(p_trip,auth.uid(),p_operation);
  if found then
   if c.protocol is distinct from p_protocol or c.action is distinct from original->>'action'or c.target_id is distinct from(original->>'target_id')::uuid or encode(c.request_sha256,'hex')is distinct from original->>'request_sha256'or c.actor_person_id::text is distinct from scope->>'person_id'then raise exception 'Cancellation reused with changed restore intent'using errcode='PT409';end if;
   outcome:='cancelled';
  else outcome:='unknown';end if;
 end if;
 response:=jsonb_build_object('version',1,'kind','packing-restore-terminal','trip_id',p_trip,'operation_id',p_operation,'protocol',p_protocol,'action',original->'action','target_id',original->'target_id','scope',scope,'request_sha256',original->'request_sha256','status',outcome,'cancelled_at',c.cancelled_at,'result_redacted',redacted,'result',result);
 if octet_length(response::text)>8388608 then response:=jsonb_set(jsonb_set(response,'{result}','null'::jsonb),'{result_redacted}','true'::jsonb);end if;
 return response;
end $$;
create function family_auth.packing_restore_cancel_entry(p_trip uuid,p_operation uuid,p_protocol text,p_original_args jsonb)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare original jsonb;scope jsonb;proof jsonb;actor uuid;
begin
 perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
 original:=family_auth.packing_restore_original_request(p_trip,p_operation,p_protocol,p_original_args);
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
 perform 1 from public.trips where id=p_trip for no key update;
 perform 1 from family_auth.trip_packing_state where trip_id=p_trip for update;
 scope:=family_auth.packing_restore_cancellation_context(p_trip,original->'scope');actor:=(scope->>'person_id')::uuid;
 proof:=family_auth.packing_restore_cancellation_read_entry(p_trip,p_operation,p_protocol,p_original_args);
 if proof->>'status'<>'unknown'then return proof;end if;
 insert into family_auth.packing_command_cancellations(trip_id,actor_user_id,actor_person_id,operation_id,protocol,action,target_id,original_trip_lifecycle_revision,request_sha256)
 values(p_trip,auth.uid(),actor,p_operation,p_protocol,original->>'action',(original->>'target_id')::uuid,(original->'scope'->>'trip_lifecycle_revision')::numeric::bigint,decode(original->>'request_sha256','hex'));
 insert into public.family_audit_events(family_id,trip_id,actor_person_id,capability_key,outcome,resource_type,resource_id,operation,context)
 values((scope->>'family_id')::uuid,p_trip,actor,'trip.packing.manage','direct','packing_command_cancellations',p_operation::text,'restore-cancel',jsonb_build_object('protocol',p_protocol,'action',original->'action','request_sha256',original->'request_sha256'));
 return family_auth.packing_restore_cancellation_read_entry(p_trip,p_operation,p_protocol,p_original_args);
end $$;

create function public.cancel_family_trip_packing_restore_v1(p_trip_id uuid,p_operation_id uuid,p_protocol text,p_original_args jsonb)returns jsonb
language sql volatile security invoker set search_path=''as $$select family_auth.packing_restore_cancel_entry(p_trip_id,p_operation_id,p_protocol,p_original_args);$$;
create function public.get_family_trip_packing_restore_cancellation_v1(p_trip_id uuid,p_operation_id uuid,p_protocol text,p_original_args jsonb)returns jsonb
language sql volatile security invoker set search_path=''as $$select family_auth.packing_restore_cancellation_read_entry(p_trip_id,p_operation_id,p_protocol,p_original_args);$$;
revoke all on function family_auth.tg_packing_terminal_exclusion(),family_auth.tg_packing_cancel_person_identity(),family_auth.tg_packing_cancel_trip_identity(),family_auth.packing_restore_original_request(uuid,uuid,text,jsonb),family_auth.packing_restore_cancellation_context(uuid,jsonb),family_auth.packing_restore_cancellation_read_entry(uuid,uuid,text,jsonb),family_auth.packing_restore_cancel_entry(uuid,uuid,text,jsonb),public.cancel_family_trip_packing_restore_v1(uuid,uuid,text,jsonb),public.get_family_trip_packing_restore_cancellation_v1(uuid,uuid,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function family_auth.packing_restore_cancellation_read_entry(uuid,uuid,text,jsonb),family_auth.packing_restore_cancel_entry(uuid,uuid,text,jsonb),public.cancel_family_trip_packing_restore_v1(uuid,uuid,text,jsonb),public.get_family_trip_packing_restore_cancellation_v1(uuid,uuid,text,jsonb)to authenticated;
comment on table family_auth.packing_command_cancellations is 'Immutable terminal cancellation for one actor/Trip/operation. Exact original SQL request digest; never a new write authority. Existing committed receipt JSON remains unchanged.';
notify pgrst,'reload schema';
commit;
