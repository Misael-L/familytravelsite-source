-- U04-C2b: observed atomic category metadata commands, one existing operation namespace.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $pin$begin
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_result_visible(jsonb)'::regprocedure),'UTF8')),'hex')<>'b4a51dc0f69df225d1a7fedc6fc1cd614cf4917f5f6b35328c18f111b89ed457'then raise exception 'Reviewed packing receipt baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_receipt_entry(uuid,uuid)'::regprocedure),'UTF8')),'hex')<>'fa6ac0f81b0b4fd0d345f06a386b0e7c1259b875265745a1855b3379c9119486'then raise exception 'Reviewed packing receipt baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_group_receipt_entry(uuid,uuid)'::regprocedure),'UTF8')),'hex')<>'efb364ab6ff9dd02cd018522a98829e8c0b0bc68050af59dc5eaca403ec6138c'then raise exception 'Reviewed packing receipt baseline drift'using errcode='22023';end if;
end $pin$;

alter table family_auth.packing_command_receipts
 add column category_id uuid,
 add constraint packing_receipt_category_context foreign key(trip_id,category_id) references public.packing_categories(trip_id,id) on delete restrict,
 drop constraint packing_command_receipts_action_check,
 add constraint packing_command_receipts_action_check check(action in
 ('create','update','packed-state','reorder','trash','restore','group-packed-state','group-trash','clear-completed','category-rename','category-assignees')),
 add constraint packing_receipt_category_domain check(
  case when action in('category-rename','category-assignees') then category_id is not null and target_id=category_id
   else category_id is null end);
create index packing_receipt_category_idx on family_auth.packing_command_receipts(category_id) where category_id is not null;

create function family_auth.validate_packing_category_request(p_action text,p_observed jsonb,p_values jsonb)
returns void language plpgsql stable set search_path='' as $$
declare x jsonb; key text; ident uuid; previous uuid; stamp timestamptz;
begin
 if p_action is null or p_action not in('category-rename','category-assignees')
  or jsonb_typeof(p_observed)is distinct from'object' or jsonb_typeof(p_values)is distinct from'object' then
  raise exception 'Complete observed category command required' using errcode='22023';end if;
 if octet_length(p_observed::text)>262144 or octet_length(p_values::text)>262144 then
  raise exception 'Category request exceeds byte bound'using errcode='54000';end if;
 if p_observed-array['id','trip_id','owner_person_id','name','revision','created_at','updated_at','assignments']<>'{}'::jsonb
  or not(p_observed ?& array['id','trip_id','owner_person_id','name','revision','created_at','updated_at','assignments'])
  or jsonb_typeof(p_observed->'name')is distinct from'string' or char_length(p_observed->>'name')>200
  or jsonb_typeof(p_observed->'revision')is distinct from'number' or(p_observed->>'revision')!~'^[1-9][0-9]{0,15}$'
  or(p_observed->>'revision')::numeric>9007199254740991 or jsonb_typeof(p_observed->'assignments')is distinct from'array' then
  raise exception 'Exact original category required'using errcode='22023';end if;
 foreach key in array array['id','trip_id','owner_person_id']loop
  if key='owner_person_id'and p_observed->key='null'::jsonb then continue;end if;
  if jsonb_typeof(p_observed->key)is distinct from'string' then raise exception 'Canonical category UUID required'using errcode='22023';end if;
  begin ident:=(p_observed->>key)::uuid;
  exception when invalid_text_representation then raise exception 'Canonical category UUID required'using errcode='22023';end;
  if ident::text<>p_observed->>key then raise exception 'Canonical category UUID required'using errcode='22023';end if;
 end loop;
 foreach key in array array['created_at','updated_at']loop
  if jsonb_typeof(p_observed->key)is distinct from'string'then raise exception 'Original timestamps required'using errcode='22023';end if;
  begin stamp:=(p_observed->>key)::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Original timestamps required'using errcode='22023';end;
  if not isfinite(stamp)then raise exception 'Finite timestamps required'using errcode='22023';end if;
 end loop;
 if jsonb_array_length(p_observed->'assignments')>2000 then raise exception 'Category assignment bound exceeded'using errcode='54000';end if;
 for x in select value from jsonb_array_elements(p_observed->'assignments')loop
  if jsonb_typeof(x)is distinct from'object' or x-array['person_id','assigned_at','assigned_by_person_id']<>'{}'::jsonb
   or not(x ?& array['person_id','assigned_at','assigned_by_person_id'])
   or jsonb_typeof(x->'person_id')is distinct from'string'
   or(x->'assigned_at'='null'::jsonb)is distinct from(x->'assigned_by_person_id'='null'::jsonb)then
   raise exception 'Exact assignment provenance required'using errcode='22023';end if;
  foreach key in array array['person_id','assigned_by_person_id']loop
   if key='assigned_by_person_id'and x->key='null'::jsonb then continue;end if;
   if jsonb_typeof(x->key)is distinct from'string'then raise exception 'Canonical Person UUID required'using errcode='22023';end if;
   begin ident:=(x->>key)::uuid;
   exception when invalid_text_representation then raise exception 'Canonical Person UUID required'using errcode='22023';end;
   if ident::text<>x->>key then raise exception 'Canonical Person UUID required'using errcode='22023';end if;
   if key='person_id'then
    if previous is not null and ident<=previous then raise exception 'Assignments require sorted unique UUIDs'using errcode='22023';end if;
    previous:=ident;
   end if;
  end loop;
  if x->'assigned_at'<>'null'::jsonb then
   if jsonb_typeof(x->'assigned_at')is distinct from'string'then raise exception 'Original assignment timestamp required'using errcode='22023';end if;
   begin stamp:=(x->>'assigned_at')::timestamptz;
   exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Original assignment timestamp required'using errcode='22023';end;
   if not isfinite(stamp)then raise exception 'Finite assignment timestamp required'using errcode='22023';end if;
  end if;
 end loop;
 if p_action='category-rename'then
  if p_values-array['name']<>'{}'::jsonb or jsonb_typeof(p_values->'name')is distinct from'string'
   or char_length(p_values->>'name')not between 1 and 200 then raise exception 'Exact bounded category name required'using errcode='22023';end if;
 else
  if p_values-array['person_ids']<>'{}'::jsonb or jsonb_typeof(p_values->'person_ids')is distinct from'array'then
   raise exception 'Exact responsibility set required'using errcode='22023';end if;
  if jsonb_array_length(p_values->'person_ids')>2000 then raise exception 'Category assignment bound exceeded'using errcode='54000';end if;
  previous:=null;
  for x in select value from jsonb_array_elements(p_values->'person_ids')loop
   if jsonb_typeof(x)is distinct from'string'then raise exception 'Canonical Person UUID required'using errcode='22023';end if;
   begin ident:=(x#>>'{}')::uuid;
   exception when invalid_text_representation then raise exception 'Canonical Person UUID required'using errcode='22023';end;
   if ident::text<>x#>>'{}'or(previous is not null and ident<=previous)then raise exception 'Sorted unique canonical Person UUIDs required'using errcode='22023';end if;
   previous:=ident;
  end loop;
 end if;
end $$;

create function family_auth.packing_category_execute_entry(p_trip uuid,p_operation uuid,p_scope jsonb,p_action text,
 p_expected_collection_revision bigint,p_observed_category jsonb,p_values jsonb)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare t public.trips%rowtype; c public.packing_categories%rowtype; r family_auth.packing_command_receipts%rowtype;
 actor uuid; revision bigint; intent bytea; before_category jsonb; after_category jsonb; changed jsonb:='[]'::jsonb; result jsonb;
 desired uuid[]; additions uuid[]; affected uuid[]; assignment_time timestamptz;
begin
 if p_trip is null or p_operation is null or jsonb_typeof(p_scope)is distinct from'object'
  or octet_length(p_scope::text)>4096 or p_expected_collection_revision is null
  or p_expected_collection_revision not between 0 and 9007199254740991 then
  raise exception 'Complete observed category command required'using errcode='22023';end if;
 perform family_auth.validate_packing_category_request(p_action,p_observed_category,p_values);
 perform family_auth.packing_require(p_trip,true);
 -- Take the aggregate mutex BEFORE category/item/assignment row locks, never inside an inverted row-lock path.
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
 perform 1 from public.trips where id=p_trip for no key update;
 t:=family_auth.packing_require(p_trip,true);actor:=family_auth.actor_person_id(t.family_id);
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip for update;
 if revision is null then raise exception 'Packing initialization missing'using errcode='23514';end if;
 if p_scope is distinct from family_auth.packing_scope(p_trip)then raise exception 'Original packing scope or lifecycle changed'using errcode='PT409';end if;
 intent:=sha256(convert_to(jsonb_build_array('packing-category-v1',p_scope,p_action,p_expected_collection_revision,p_observed_category,p_values)::text,'UTF8'));
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.category_id is null or r.request_sha256<>intent then raise exception 'Packing operation reused with changed domain or intent'using errcode='PT409';end if;
  if not family_auth.packing_result_visible(r.result)then raise exception 'Original packing result no longer visible; reconcile its receipt'using errcode='42501';end if;
  return r.result;
 end if;
 select * into c from public.packing_categories where id=(p_observed_category->>'id')::uuid and trip_id=p_trip for update;
 if not found then raise exception 'Category is unavailable in this scope'using errcode='42501';end if;
 if c.owner_person_id is not null and c.owner_person_id<>actor then raise exception 'Foreign personal category authority is unavailable'using errcode='42501';end if;
 if p_action='category-assignees'and c.owner_person_id is not null then raise exception 'Personal category assignments are unsupported'using errcode='0A000';end if;
 perform 1 from public.packing_category_assignments where trip_id=p_trip and category_id=c.id order by person_id for update;
 perform 1 from public.packing_items where trip_id=p_trip and category_id=c.id and deleted_at is null order by id for update;
 perform family_auth.packing_require(p_trip,true);
 if p_scope is distinct from family_auth.packing_scope(p_trip)or revision<>p_expected_collection_revision then raise exception 'Packing observation changed'using errcode='PT409';end if;
 before_category:=family_auth.packing_category_json(c);
 if before_category is distinct from p_observed_category then raise exception 'Original category or provenance changed'using errcode='PT409';end if;
 select coalesce(array_agg(i.id order by i.id),'{}'::uuid[])into affected from public.packing_items i
  where i.trip_id=p_trip and i.category_id=c.id and i.deleted_at is null;
 if cardinality(affected)>2000 then raise exception 'Category live item bound exceeded'using errcode='54000';end if;
 if p_action='category-rename'then
  if c.name is distinct from p_values->>'name'collate "C"then
   if exists(select 1 from public.packing_categories x where x.trip_id=p_trip and x.owner_person_id is not distinct from c.owner_person_id and x.name=p_values->>'name'collate "C"and x.id<>c.id)then
    raise exception 'Category name conflicts in this scope'using errcode='PT409';end if;
   begin update public.packing_categories set name=p_values->>'name'where id=c.id returning * into c;
   exception when unique_violation then raise exception 'Category name conflicts in this scope'using errcode='PT409';end;
   select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'revision',i.revision)order by i.id),'[]'::jsonb)into changed
    from public.packing_items i where i.id=any(affected)and family_auth.packing_can_read(i.id,false);
  end if;
 else
  select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[])into desired from jsonb_array_elements_text(p_values->'person_ids');
  select coalesce(array_agg(person order by person),'{}'::uuid[])into additions from unnest(desired)person
   where not exists(select 1 from public.packing_category_assignments a where a.category_id=c.id and a.person_id=person);
  if exists(select 1 from unnest(additions)person where not exists(select 1 from public.people p join public.trip_travelers v on v.person_id=p.id and v.trip_id=p_trip
   where p.id=person and p.family_id=t.family_id and p.archived_at is null and(p.user_id is null or exists(select 1 from public.family_members m where m.family_id=t.family_id and m.user_id=p.user_id and m.status='active'))))then
   raise exception 'New responsibility requires an eligible Trip traveler'using errcode='22023';end if;
  delete from public.packing_category_assignments where trip_id=p_trip and category_id=c.id and not(person_id=any(desired));
  assignment_time:=clock_timestamp();
  insert into public.packing_category_assignments(trip_id,category_id,person_id,assigned_at,assigned_by_person_id)
   select p_trip,c.id,person,assignment_time,actor from unnest(additions)person order by person;
 end if;
 -- Size/version failure aborts the entire metadata/legacy bridge/audit/receipt transaction.
 perform family_auth.packing_with_categories_entry(p_trip);
 after_category:=family_auth.packing_category_json(c);
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip;
 if revision>9007199254740991 then raise exception 'Packing collection exceeds safe bound'using errcode='54000';end if;
 if octet_length(before_category::text)+octet_length(after_category::text)>16777216 then raise exception 'Category history exceeds byte bound'using errcode='54000';end if;
 result:=jsonb_build_object('version',1,'kind','packing-category','trip_id',p_trip,'operation_id',p_operation,'scope',p_scope,
  'action',p_action,'values',p_values,'collection_revision',revision,'category',after_category,'changed_item_revisions',changed);
 if octet_length(result::text)>8388608 then raise exception 'Category result exceeds byte bound'using errcode='54000';end if;
 insert into family_auth.packing_command_receipts(trip_id,actor_user_id,actor_person_id,operation_id,action,target_id,category_id,request_sha256,before_state,after_state,result)
  values(p_trip,auth.uid(),actor,p_operation,p_action,c.id,c.id,intent,jsonb_build_object('category',before_category,'collection_revision',p_expected_collection_revision),
   jsonb_build_object('category',after_category,'collection_revision',revision),result);
 return result;
end $$;

create function family_auth.packing_category_receipt_entry(p_trip uuid,p_operation uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r family_auth.packing_command_receipts%rowtype; scope jsonb; redacted boolean;
begin
 perform family_auth.packing_require(p_trip,true);
 if p_operation is null then raise exception 'Original operation UUID required'using errcode='22023';end if;
 scope:=family_auth.packing_scope(p_trip);
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.category_id is null then raise exception 'Use the original packing receipt domain'using errcode='22023';end if;
  if r.result->'scope'->'person_id'is distinct from scope->'person_id'then raise exception 'Receipt belongs to another Person context'using errcode='PT409';end if;
 end if;
 redacted:=r.operation_id is not null and not family_auth.packing_result_visible(r.result);
 return jsonb_build_object('version',1,'kind','packing-category','trip_id',p_trip,'operation_id',p_operation,'scope',scope,
  'status',case when r.operation_id is null then'unknown'else'committed'end,'result_redacted',redacted,'result',case when redacted then null else r.result end);
end $$;

create function public.execute_family_trip_packing_category_v1(p_trip_id uuid,p_operation_id uuid,p_scope jsonb,p_action text,
 p_expected_collection_revision bigint,p_observed_category jsonb,p_values jsonb)returns jsonb
language sql volatile security invoker set search_path='' as $$
 select family_auth.packing_category_execute_entry(p_trip_id,p_operation_id,p_scope,p_action,p_expected_collection_revision,p_observed_category,p_values);
$$;
create function public.get_family_trip_packing_category_receipt_v1(p_trip_id uuid,p_operation_id uuid)returns jsonb
language sql stable security invoker set search_path='' as $$select family_auth.packing_category_receipt_entry(p_trip_id,p_operation_id);$$;
revoke all on function family_auth.validate_packing_category_request(text,jsonb,jsonb),
 family_auth.packing_category_execute_entry(uuid,uuid,jsonb,text,bigint,jsonb,jsonb),family_auth.packing_category_receipt_entry(uuid,uuid),
 public.execute_family_trip_packing_category_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb),public.get_family_trip_packing_category_receipt_v1(uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function family_auth.packing_category_execute_entry(uuid,uuid,jsonb,text,bigint,jsonb,jsonb),family_auth.packing_category_receipt_entry(uuid,uuid),
 public.execute_family_trip_packing_category_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb),public.get_family_trip_packing_category_receipt_v1(uuid,uuid)to authenticated;
comment on function public.execute_family_trip_packing_category_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb)is
 'Observed common/own-category rename and common responsibility replacement. No client or native feature activation.';

CREATE OR REPLACE FUNCTION family_auth.packing_result_visible(p_result jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case
  when p_result->>'kind'='packing-category' then family_auth.packing_category_can_read((p_result->'category'->>'id')::uuid)
  when p_result->>'action' in('group-packed-state','group-trash','clear-completed') then
   not exists(select 1 from jsonb_array_elements(p_result->'items') x where not family_auth.packing_can_read((x->>'id')::uuid,true))
  when p_result->>'action'='reorder' then
   not exists(select 1 from jsonb_array_elements_text(p_result->'ordered_ids')x where not family_auth.packing_can_read(x::uuid,true))
  else family_auth.packing_can_read((p_result->>'target_id')::uuid,true) end;
$function$
;
CREATE OR REPLACE FUNCTION family_auth.packing_receipt_entry(p_trip uuid, p_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r family_auth.packing_command_receipts%rowtype;scope jsonb;redacted boolean;
begin
 perform family_auth.packing_require(p_trip,true);
 if p_operation is null then raise exception 'Original operation UUID required'using errcode='22023';end if;
 scope:=family_auth.packing_scope(p_trip);
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found and r.action in('group-packed-state','group-trash','clear-completed','category-rename','category-assignees') then
  raise exception 'Use the original packing receipt domain' using errcode='22023';end if;
 if found and r.result->'scope'->'person_id'is distinct from scope->'person_id'then raise exception 'Receipt belongs to another Person context'using errcode='PT409';end if;
 redacted:=r.operation_id is not null and not family_auth.packing_result_visible(r.result);
 return jsonb_build_object('version',1,'trip_id',p_trip,'operation_id',p_operation,'scope',scope,'status',case when r.operation_id is null then'unknown'else'committed'end,
  'result_redacted',redacted,'result',case when redacted then null else r.result end);
end;$function$
;
notify pgrst,'reload schema';
commit;
