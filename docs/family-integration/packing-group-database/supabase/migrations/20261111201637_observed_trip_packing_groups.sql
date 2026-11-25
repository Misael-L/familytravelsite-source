-- U04-C1: bounded, observed, atomic visible packing groups. No UI activation.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- One operation namespace and append-only history for item and group commands.
alter table family_auth.packing_command_receipts
 drop constraint packing_command_receipts_action_check,
 drop constraint packing_command_receipts_check,
 add constraint packing_command_receipts_action_check check(action in
  ('create','update','packed-state','reorder','trash','restore','group-packed-state','group-trash','clear-completed')),
 add constraint packing_command_receipts_check check
  ((action in('reorder','group-packed-state','group-trash','clear-completed')) = (target_id is null));

create or replace function family_auth.validate_packing_group_request(p_action text,p_selector jsonb,p_observed jsonb,p_values jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare x jsonb; prior uuid; current_id uuid;
begin
 if p_action is null or p_action not in('group-packed-state','group-trash','clear-completed')
  or jsonb_typeof(p_selector) is distinct from 'object' or octet_length(p_selector::text)>4096
  or p_selector-array['view','status','categories']<>'{}'::jsonb
  or not(p_selector ?& array['view','status','categories'])
  or jsonb_typeof(p_selector->'view') is distinct from 'string' or p_selector->>'view' not in('common','personal')
  or jsonb_typeof(p_selector->'status') is distinct from 'string' or p_selector->>'status' not in('all','open','done') then
  raise exception 'Explicit packing group selector required' using errcode='22023';
 end if;
 if p_selector->'categories'<>'null'::jsonb then
  if jsonb_typeof(p_selector->'categories') is distinct from 'array' then
   raise exception 'Raw packing category labels required' using errcode='22023';end if;
  if jsonb_array_length(p_selector->'categories') not between 1 and 2 then
   raise exception 'A native category has one raw label or the default-label pair' using errcode='22023';end if;
  for x in select value from jsonb_array_elements(p_selector->'categories') loop
   if jsonb_typeof(x) is distinct from 'string' or length(x#>>'{}')>200 then
    raise exception 'Bounded raw category label required' using errcode='22023';end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(p_selector->'categories'))<>jsonb_array_length(p_selector->'categories') then
   raise exception 'Duplicate category labels are not an observation' using errcode='22023';end if;
 end if;
 if p_action='clear-completed' then
  if p_selector->'categories'<>'null'::jsonb or p_selector->>'status'<>'all' then
   raise exception 'Clear completed names the entire active native view' using errcode='22023';end if;
 elsif p_selector->'categories'='null'::jsonb then
  raise exception 'An explicit category is required for category actions' using errcode='22023';
 end if;
 if jsonb_typeof(p_values) is distinct from 'object' or octet_length(p_values::text)>64 then
  raise exception 'Bounded packing group values required' using errcode='22023';end if;
 if p_action='group-packed-state' then
  if p_values-array['checked']<>'{}'::jsonb or jsonb_typeof(p_values->'checked') is distinct from 'boolean' then
   raise exception 'An explicit checked boolean is required' using errcode='22023';end if;
 elsif p_values<>'{}'::jsonb then
  raise exception 'Trash group values must be empty' using errcode='22023';
 end if;
 if jsonb_typeof(p_observed) is distinct from 'array' or octet_length(p_observed::text)>262144 then
  raise exception 'A bounded complete original group is required' using errcode='22023';end if;
 if jsonb_array_length(p_observed)>2000 then raise exception 'Packing group exceeds item bound' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(p_observed) loop
  if jsonb_typeof(x) is distinct from 'object' or x-array['id','revision','checked']<>'{}'::jsonb
   or not(x ?& array['id','revision','checked']) or jsonb_typeof(x->'id') is distinct from 'string'
   or jsonb_typeof(x->'revision') is distinct from 'number' or (x->>'revision')!~'^[1-9][0-9]{0,15}$'
   or (x->>'revision')::numeric>9007199254740991 or jsonb_typeof(x->'checked') is distinct from 'boolean' then
   raise exception 'An original item id, revision and checked fact are required' using errcode='22023';end if;
  begin current_id:=(x->>'id')::uuid;
  exception when invalid_text_representation then raise exception 'Canonical item UUID required' using errcode='22023';end;
  if current_id::text<>x->>'id' or (prior is not null and current_id<=prior) then
   raise exception 'Original items must have unique canonical UUIDs in ascending order' using errcode='22023';end if;
  prior:=current_id;
 end loop;
end;$$;

create or replace function family_auth.packing_group_selected(p_item public.packing_items,p_selector jsonb)
returns boolean language sql immutable set search_path='' as $$
 select p_item.deleted_at is null
  and p_item.is_private=(p_selector->>'view'='personal')
  and case p_selector->>'status' when 'open' then not p_item.checked when 'done' then p_item.checked else true end
  and (p_selector->'categories'='null'::jsonb or p_selector->'categories' @> to_jsonb(array[p_item.category]));
$$;

create or replace function family_auth.packing_result_visible(p_result jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select case
  when p_result->>'action' in('group-packed-state','group-trash','clear-completed') then
   not exists(select 1 from jsonb_array_elements(p_result->'items') x where not family_auth.packing_can_read((x->>'id')::uuid,true))
  when p_result->>'action'='reorder' then
   not exists(select 1 from jsonb_array_elements_text(p_result->'ordered_ids')x where not family_auth.packing_can_read(x::uuid,true))
  else family_auth.packing_can_read((p_result->>'target_id')::uuid,true) end;
$$;

create or replace function family_auth.packing_group_execute_entry(
 p_trip uuid,p_operation uuid,p_scope jsonb,p_action text,p_expected_collection_revision bigint,
 p_selector jsonb,p_observed jsonb,p_values jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.trips%rowtype; receipt family_auth.packing_command_receipts%rowtype;
 actor uuid; revision bigint; intent bytea; actual jsonb; selected uuid[]; changed uuid[];
 before_rows jsonb; after_rows jsonb; result jsonb; trash_at timestamptz;
begin
 if p_trip is null or p_operation is null or jsonb_typeof(p_scope) is distinct from 'object'
  or octet_length(p_scope::text)>4096 or p_expected_collection_revision is null
  or p_expected_collection_revision not between 0 and 9007199254740991 then
  raise exception 'Complete observed packing group command required' using errcode='22023';end if;
 perform family_auth.validate_packing_group_request(p_action,p_selector,p_observed,p_values);
 perform family_auth.packing_require(p_trip,true);
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
 perform 1 from public.trips where id=p_trip for no key update;
 t:=family_auth.packing_require(p_trip,true); actor:=family_auth.actor_person_id(t.family_id);
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip for update;
 if revision is null then raise exception 'Packing initialization missing' using errcode='23514';end if;
 if p_scope is distinct from family_auth.packing_scope(p_trip) then
  raise exception 'Original packing scope or Trip lifecycle changed' using errcode='PT409';end if;
 intent:=sha256(convert_to(jsonb_build_array('packing-group-v1',p_scope,p_action,p_expected_collection_revision,p_selector,p_observed,p_values)::text,'UTF8'));
 select * into receipt from family_auth.packing_command_receipts
  where trip_id=p_trip and actor_user_id=auth.uid() and operation_id=p_operation;
 if found then
  if receipt.request_sha256<>intent then raise exception 'Packing operation reused with changed intent' using errcode='PT409';end if;
  if not family_auth.packing_result_visible(receipt.result) then
   raise exception 'Original packing result is no longer visible; reconcile its receipt' using errcode='42501';end if;
  return receipt.result;
 end if;
 if revision<>p_expected_collection_revision then raise exception 'Packing collection changed' using errcode='PT409';end if;
 -- Consistent lock order; re-read facts after any row-lock wait.
 perform 1 from public.packing_items i where i.trip_id=p_trip
  and family_auth.packing_group_selected(i,p_selector) and family_auth.packing_can_read(i.id,false) order by i.id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'revision',i.revision,'checked',i.checked) order by i.id),'[]'::jsonb),
  coalesce(array_agg(i.id order by i.id),'{}'::uuid[]) into actual,selected
  from public.packing_items i where i.trip_id=p_trip and family_auth.packing_group_selected(i,p_selector) and family_auth.packing_can_read(i.id,false);
 if actual is distinct from p_observed then raise exception 'Original visible packing group changed' using errcode='PT409';end if;
 select coalesce(jsonb_agg(family_auth.packing_item_json(i) order by i.id),'[]'::jsonb) into before_rows
  from public.packing_items i where i.trip_id=p_trip and i.id=any(selected);
 select coalesce(array_agg(i.id order by i.id),'{}'::uuid[]) into changed from public.packing_items i
  where i.trip_id=p_trip and i.id=any(selected) and case p_action
   when 'group-packed-state' then (i.checked,i.packed_quantity) is distinct from ((p_values->>'checked')::boolean,null::integer)
   when 'clear-completed' then i.checked else true end;
 if p_action='group-packed-state' then
  update public.packing_items set checked=(p_values->>'checked')::boolean,packed_quantity=null where trip_id=p_trip and id=any(changed);
 else
  trash_at:=clock_timestamp();
  update public.packing_items set deleted_at=trash_at,deleted_by_person_id=actor where trip_id=p_trip and id=any(changed);
 end if;
 -- Snapshot and history size failures abort rows, revisions, audits and receipt together.
 perform family_auth.packing_snapshot(p_trip);
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip;
 select coalesce(jsonb_agg(family_auth.packing_item_json(i) order by i.id),'[]'::jsonb) into after_rows
  from public.packing_items i where i.trip_id=p_trip and i.id=any(selected);
 if revision>9007199254740991 or exists(select 1 from public.packing_items i where i.trip_id=p_trip and i.id=any(selected) and i.revision>9007199254740991) then
  raise exception 'Packing group versions exceed the safe protocol bound' using errcode='54000';end if;
 if octet_length(before_rows::text)+octet_length(after_rows::text)>16777216 then
  raise exception 'Packing group history exceeds bound' using errcode='54000';end if;
 result:=jsonb_build_object('version',1,'kind','packing-group','trip_id',p_trip,'operation_id',p_operation,'scope',p_scope,
  'action',p_action,'selector',p_selector,'values',p_values,'collection_revision',revision,'items',after_rows,'changed_ids',to_jsonb(changed));
 if octet_length(result::text)>8388608 then raise exception 'Packing group result exceeds bound' using errcode='54000';end if;
 insert into family_auth.packing_command_receipts(trip_id,actor_user_id,actor_person_id,operation_id,action,target_id,request_sha256,before_state,after_state,result)
  values(p_trip,auth.uid(),actor,p_operation,p_action,null,intent,
   jsonb_build_object('items',before_rows,'collection_revision',p_expected_collection_revision),
   jsonb_build_object('items',after_rows,'collection_revision',revision),result);
 return result;
end;$$;

create or replace function family_auth.packing_group_receipt_entry(p_trip uuid,p_operation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r family_auth.packing_command_receipts%rowtype; scope jsonb; redacted boolean;
begin
 perform family_auth.packing_require(p_trip,true);
 if p_operation is null then raise exception 'Original operation UUID required' using errcode='22023';end if;
 scope:=family_auth.packing_scope(p_trip);
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid() and operation_id=p_operation;
 if found then
  if r.action not in('group-packed-state','group-trash','clear-completed') then
   raise exception 'Use the original item receipt API' using errcode='22023';end if;
  if r.result->'scope'->'person_id' is distinct from scope->'person_id' then
   raise exception 'Receipt belongs to another Person context' using errcode='PT409';end if;
 end if;
 redacted:=r.operation_id is not null and not family_auth.packing_result_visible(r.result);
 return jsonb_build_object('version',1,'kind','packing-group','trip_id',p_trip,'operation_id',p_operation,'scope',scope,
  'status',case when r.operation_id is null then 'unknown' else 'committed' end,
  'result_redacted',redacted,'result',case when redacted then null else r.result end);
end;$$;

-- The original item receipt API must retain its original acknowledgement shape.
create or replace function family_auth.packing_receipt_entry(p_trip uuid,p_operation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r family_auth.packing_command_receipts%rowtype;scope jsonb;redacted boolean;
begin
 perform family_auth.packing_require(p_trip,true);
 if p_operation is null then raise exception 'Original operation UUID required'using errcode='22023';end if;
 scope:=family_auth.packing_scope(p_trip);
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found and r.action in('group-packed-state','group-trash','clear-completed') then
  raise exception 'Use the original group receipt API' using errcode='22023';end if;
 if found and r.result->'scope'->'person_id'is distinct from scope->'person_id'then raise exception 'Receipt belongs to another Person context'using errcode='PT409';end if;
 redacted:=r.operation_id is not null and not family_auth.packing_result_visible(r.result);
 return jsonb_build_object('version',1,'trip_id',p_trip,'operation_id',p_operation,'scope',scope,'status',case when r.operation_id is null then'unknown'else'committed'end,
  'result_redacted',redacted,'result',case when redacted then null else r.result end);
end;$$;

create or replace function public.execute_family_trip_packing_group_v1(
 p_trip_id uuid,p_operation_id uuid,p_scope jsonb,p_action text,p_expected_collection_revision bigint,
 p_selector jsonb,p_observed_items jsonb,p_values jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select family_auth.packing_group_execute_entry(p_trip_id,p_operation_id,p_scope,p_action,p_expected_collection_revision,p_selector,p_observed_items,p_values);
$$;
create or replace function public.get_family_trip_packing_group_receipt_v1(p_trip_id uuid,p_operation_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select family_auth.packing_group_receipt_entry(p_trip_id,p_operation_id);$$;

revoke all on function family_auth.validate_packing_group_request(text,jsonb,jsonb,jsonb),family_auth.packing_group_selected(public.packing_items,jsonb),
 family_auth.packing_group_execute_entry(uuid,uuid,jsonb,text,bigint,jsonb,jsonb,jsonb),family_auth.packing_group_receipt_entry(uuid,uuid),
 public.execute_family_trip_packing_group_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb,jsonb),public.get_family_trip_packing_group_receipt_v1(uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function family_auth.packing_group_execute_entry(uuid,uuid,jsonb,text,bigint,jsonb,jsonb,jsonb),family_auth.packing_group_receipt_entry(uuid,uuid),
 public.execute_family_trip_packing_group_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb,jsonb),public.get_family_trip_packing_group_receipt_v1(uuid,uuid) to authenticated;
comment on function public.execute_family_trip_packing_group_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb,jsonb) is
 'Observed visible native category completion/Trash and view clear-completed only. Atomic rows/audit/receipt; no native UI or generic queue activation.';
notify pgrst,'reload schema';
commit;
