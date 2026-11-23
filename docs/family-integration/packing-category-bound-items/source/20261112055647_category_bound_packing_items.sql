-- U04-C3b1: identity-bound item create/move, one existing operation namespace.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
lock table public.trips,family_auth.trip_packing_state,public.packing_categories,public.packing_items,
 public.packing_category_assignments,public.packing_item_recipients,public.packing_item_contributors,
 family_auth.packing_command_receipts in access exclusive mode;
do $pin$begin
if(select count(*)from supabase_migrations.schema_migrations)<>123 then raise exception 'Reviewed123 ledger required'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_category_link()'::regprocedure),'UTF8')),'hex')<>'8aecf82b8b10bbdd639d4062edbecfd29db8c38789547d3e36a94c0a81ba80d3'then raise exception 'Reviewed123 function drift: tg_packing_category_link'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_receipt_entry(uuid,uuid)'::regprocedure),'UTF8')),'hex')<>'2284ea2e59571a3c16d36096ecf5fec9e83f0405e2523c3c39745bd0b8ea864f'then raise exception 'Reviewed123 function drift: packing_receipt_entry'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_result_visible(jsonb)'::regprocedure),'UTF8')),'hex')<>'d50ad783e51f02fbd288df006cb7215de38ea6bb9bea99901ecb000fcc12001d'then raise exception 'Reviewed123 function drift: packing_result_visible'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.validate_packing_values(text,jsonb)'::regprocedure),'UTF8')),'hex')<>'02977d84982190ac4d57a8ea849d4ef5c96021cdb0c7f3542e1aad7307af5f06'then raise exception 'Reviewed123 function drift: validate_packing_values'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.validate_packing_category_lifecycle_v2(text,jsonb,jsonb)'::regprocedure),'UTF8')),'hex')<>'e6f0808f52956f711df203efeb989a9673a77819f7b0aa67a055b0f736bb4257'then raise exception 'Reviewed123 function drift: validate_packing_category_lifecycle_v2'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_category_require_v2(uuid,boolean,timestamp with time zone)'::regprocedure),'UTF8')),'hex')<>'e4d7c7494e751c88b531580b046d8ec59e660efda974312f21232717545382ec'then raise exception 'Reviewed123 function drift: packing_category_require_v2'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_item_json(packing_items)'::regprocedure),'UTF8')),'hex')<>'3a6de62fdb69b38b007163db89f145c4792e1a65169d9bc6dddacf0afd8b24d5'then raise exception 'Reviewed123 function drift: packing_item_json'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_version()'::regprocedure),'UTF8')),'hex')<>'c46cecd8441701bf69463c08ae2982de726f0470ca858f81b4e446ae40b9acd0'then raise exception 'Reviewed123 function drift: tg_packing_version'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_category_resolve(uuid,uuid,text)'::regprocedure),'UTF8')),'hex')<>'9b6ad47157de167a885caa5e27c784a8f56ab44aecbba70a31018ccb5185cebc'then raise exception 'Reviewed123 function drift: packing_category_resolve'using errcode='22023';end if;
end $pin$;
alter table family_auth.packing_command_receipts
 drop constraint packing_command_receipts_action_check,
 add constraint packing_command_receipts_action_check check(action in('create','update','packed-state','reorder','trash','restore','group-packed-state','group-trash','clear-completed','category-rename','category-assignees','category-create','category-retain','category-dismiss-empty','category-restore-empty','category-item-create','category-item-move')),
 drop constraint packing_receipt_category_domain,
 add constraint packing_receipt_category_domain check(case
 when action in('category-rename','category-assignees','category-create','category-retain','category-dismiss-empty','category-restore-empty')then category_id is not null and target_id=category_id
 when action in('category-item-create','category-item-move')then category_id is not null and target_id is not null
 else category_id is null end),
 add column category_bound_item_id uuid generated always as(case when action in('category-item-create','category-item-move')then target_id else null end)stored,
 add constraint packing_receipt_bound_item_context foreign key(trip_id,category_bound_item_id)references public.packing_items(trip_id,id)on delete restrict,
 add constraint packing_receipt_bound_item_result check(case when action in('category-item-create','category-item-move')then(
 result->>'kind'='packing-category-item'and result->'version'='2'::jsonb and result->>'action'=action
 and result->>'trip_id'=trip_id::text and result->>'operation_id'=operation_id::text
 and result->>'target_id'=target_id::text and result->'item'->>'id'=target_id::text
 and result->'item'->>'trip_id'=trip_id::text and result->'category'->>'id'=category_id::text
 and result->'category'->>'trip_id'=trip_id::text)is true else true end);
create index packing_receipt_bound_item_idx on family_auth.packing_command_receipts(trip_id,category_bound_item_id)where category_bound_item_id is not null;
CREATE OR REPLACE FUNCTION family_auth.tg_packing_category_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.packing_categories%rowtype;owner uuid:=case when new.is_private then new.owner_person_id else null end;
begin
 if tg_op='UPDATE'and old.deleted_at is not null then
  if new.category_id is distinct from old.category_id then raise exception 'Packing Trash category identity is immutable'using errcode='PT409';end if;
  if new.deleted_at is not null then return new;end if;
  select * into c from public.packing_categories where id=old.category_id for update;new.category:=c.name;
 else
  if tg_op='INSERT'and new.category_id is null then new.category_id:=family_auth.packing_category_resolve(new.trip_id,owner,new.category);
  elsif tg_op='UPDATE'and new.category_id is distinct from old.category_id then
   -- Explicit identity changes are validated below; never resolve them by display label.
   null;
  elsif tg_op='UPDATE'and(new.category,new.is_private,new.owner_person_id)is distinct from(old.category,old.is_private,old.owner_person_id)then
   new.category_id:=family_auth.packing_category_resolve(new.trip_id,owner,new.category);
  end if;
  select * into c from public.packing_categories where id=new.category_id for update;
 end if;
 if c.id is null or c.trip_id<>new.trip_id or c.owner_person_id is distinct from owner or c.name is distinct from new.category collate "C"then
  raise exception 'Packing category context mismatch'using errcode='23503';end if;
 if new.deleted_at is null then
  if c.deleted_at is not null then raise exception 'Restore the original category before restoring or adding items'using errcode='PT409';end if;
  if not c.retained_when_empty then update public.packing_categories set retained_when_empty=true where id=c.id;end if;
 end if;
 return new;
end $function$
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
 if found and r.action in('group-packed-state','group-trash','clear-completed','category-rename','category-assignees','category-create','category-retain','category-dismiss-empty','category-restore-empty','category-item-create','category-item-move') then
  raise exception 'Use the original packing receipt domain' using errcode='22023';end if;
 if found and r.result->'scope'->'person_id'is distinct from scope->'person_id'then raise exception 'Receipt belongs to another Person context'using errcode='PT409';end if;
 redacted:=r.operation_id is not null and not family_auth.packing_result_visible(r.result);
 return jsonb_build_object('version',1,'trip_id',p_trip,'operation_id',p_operation,'scope',scope,'status',case when r.operation_id is null then'unknown'else'committed'end,
  'result_redacted',redacted,'result',case when redacted then null else r.result end);
end;$function$
;

CREATE OR REPLACE FUNCTION family_auth.packing_result_visible(p_result jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case
  when p_result->>'kind'='packing-category-item' then family_auth.packing_can_read((p_result->>'target_id')::uuid,true)and family_auth.packing_category_can_read((p_result->'category'->>'id')::uuid)
  when p_result->>'kind'='packing-category-lifecycle' then exists(select 1 from public.packing_categories c join public.trips t on t.id=c.trip_id where c.id=(p_result->'category'->>'id')::uuid and family_auth.packing_category_can_read(c.id)and(c.owner_person_id is null or c.owner_person_id=family_auth.actor_person_id(t.family_id)))
  when p_result->>'kind'='packing-category' then family_auth.packing_category_can_read((p_result->'category'->>'id')::uuid)
  when p_result->>'action' in('group-packed-state','group-trash','clear-completed') then
   not exists(select 1 from jsonb_array_elements(p_result->'items') x where not family_auth.packing_can_read((x->>'id')::uuid,true))
  when p_result->>'action'='reorder' then
   not exists(select 1 from jsonb_array_elements_text(p_result->'ordered_ids')x where not family_auth.packing_can_read(x::uuid,true))
  else family_auth.packing_can_read((p_result->>'target_id')::uuid,true) end;
$function$
;


create function family_auth.validate_category_bound_packing_request(p_action text,p_observed jsonb,p_values jsonb)returns void
language plpgsql stable set search_path='' as $$
begin
 if p_action is null or p_action not in('category-item-create','category-item-move')or jsonb_typeof(p_values)is distinct from'object'then raise exception 'Exact category-bound item action and values required'using errcode='22023';end if;
 -- Reuse the qualified complete twelve-fact observation validator, never relax v1 or accept partial categories.
 perform family_auth.validate_packing_category_lifecycle_v2('category-retain',p_observed,'{}'::jsonb);
 if p_action='category-item-create'then
  if p_values?'category'or p_values?'visibility'then raise exception 'Category identity derives label, owner and privacy'using errcode='22023';end if;
  perform family_auth.validate_packing_values('create',p_values);
 elsif p_values<>'{}'::jsonb then raise exception 'Move changes only the category binding'using errcode='22023';end if;
end $$;

create function family_auth.packing_category_item_v2_entry(p_trip uuid,p_operation uuid,p_scope jsonb,p_action text,p_target uuid,
 p_expected_revision bigint,p_expected_collection_revision bigint,p_category uuid,p_observed_category jsonb,p_values jsonb)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare t public.trips%rowtype;c public.packing_categories%rowtype;i public.packing_items%rowtype;r family_auth.packing_command_receipts%rowtype;
 actor uuid;revision bigint;intent bytea;bag uuid;position integer;next_quantity integer;packed integer;
 before_state jsonb;after_state jsonb;result jsonb;changed boolean:=false;
begin
 if p_trip is null or p_operation is null or p_target is null or p_category is null or jsonb_typeof(p_scope)is distinct from'object'
 or octet_length(p_scope::text)>4096 or p_expected_collection_revision is null or p_expected_collection_revision not between 0 and 9007199254740991 then
  raise exception 'Complete original category-bound item command required'using errcode='22023';end if;
 perform family_auth.validate_category_bound_packing_request(p_action,p_observed_category,p_values);
 if(p_action='category-item-create'and p_expected_revision is not null)or(p_action='category-item-move'and(p_expected_revision is null or p_expected_revision not between 1 and 9007199254740991))then raise exception 'Original item revision or new identity required'using errcode='22023';end if;
 perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
 perform 1 from public.trips where id=p_trip for no key update;
 t:=family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());actor:=family_auth.actor_person_id(t.family_id);
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip for update;
 if revision is null then raise exception 'Packing initialization missing'using errcode='23514';end if;
 if p_scope is distinct from family_auth.packing_scope(p_trip)then raise exception 'Original packing scope or lifecycle changed'using errcode='PT409';end if;
 intent:=sha256(convert_to(jsonb_build_array('packing-category-item-v2',p_scope,p_action,p_target,p_expected_revision,p_expected_collection_revision,p_category,p_observed_category,p_values)::text,'UTF8'));
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.action not in('category-item-create','category-item-move')or r.request_sha256<>intent then raise exception 'Packing operation reused with changed domain or intent'using errcode='PT409';end if;
  if not family_auth.packing_result_visible(r.result)then raise exception 'Original packing result no longer visible; reconcile its receipt'using errcode='42501';end if;
  return r.result;
 end if;
 if revision<>p_expected_collection_revision then raise exception 'Packing collection changed'using errcode='PT409';end if;
 -- Peek under the Trip mutex, then lock both category identities in UUID order before the item.
 select * into i from public.packing_items where id=p_target and trip_id=p_trip;
 if p_action='category-item-create'then
  if i.id is not null or exists(select 1 from public.packing_items where id=p_target)then raise exception 'Packing identity already exists'using errcode='PT409';end if;
 elsif i.id is null or not family_auth.packing_can_read(i.id,true)then raise exception 'Packing item unavailable in this Trip'using errcode='42501';end if;
 perform 1 from public.packing_categories where trip_id=p_trip and(id=p_category or id=i.category_id)order by id for update;
 select * into c from public.packing_categories where id=p_category and trip_id=p_trip;
 if c.id is null or(c.owner_person_id is not null and c.owner_person_id<>actor)then raise exception 'Category unavailable in this authoring scope'using errcode='42501';end if;
 if c.deleted_at is not null then raise exception 'Restore the original category before adding or moving items'using errcode='PT409';end if;
 if p_action='category-item-move'then
  select * into i from public.packing_items where id=p_target and trip_id=p_trip for update;
  if i.deleted_at is not null or i.revision<>p_expected_revision then raise exception 'Original active item changed'using errcode='PT409';end if;
  if i.is_private and i.owner_person_id is distinct from actor then raise exception 'Read sharing does not grant foreign-owner move authority'using errcode='42501';end if;
  if i.is_private is distinct from(c.owner_person_id is not null)then raise exception 'Cross-privacy moves require a separate sharing contract'using errcode='0A000';end if;
  perform 1 from public.packing_item_recipients where trip_id=p_trip and item_id=i.id order by person_id for update;
  perform 1 from public.packing_item_contributors where trip_id=p_trip and item_id=i.id order by person_id for update;
 end if;
 perform 1 from public.packing_category_assignments where trip_id=p_trip and category_id=c.id order by person_id for update;
 perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
 if p_scope is distinct from family_auth.packing_scope(p_trip)or family_auth.packing_category_json_v2(c)is distinct from p_observed_category then raise exception 'Original category or provenance changed'using errcode='PT409';end if;
 before_state:=jsonb_build_object('item',case when p_action='category-item-create'then null else family_auth.packing_item_json(i)end,
 'category_id',case when p_action='category-item-create'then null else i.category_id end,'target_category',family_auth.packing_category_json_v2(c),'collection_revision',revision);
 if p_action='category-item-create'then
  if(select count(*)from public.packing_items where trip_id=p_trip and deleted_at is null)>=2000 then raise exception 'Active packing count exceeds bound'using errcode='54000';end if;
  select max(sort_order)into position from public.packing_items where trip_id=p_trip and deleted_at is null;
  if position=2147483647 then raise exception 'Reorder packing before appending beyond its rank bound'using errcode='54000';end if;
  position:=coalesce(position,-1)+1;
  begin bag:=(p_values->>'bag_id')::uuid;exception when invalid_text_representation then raise exception 'Bag must be UUID or null'using errcode='22023';end;
  if bag is not null and not exists(select 1 from public.packing_bags where id=bag and trip_id=p_trip)then raise exception 'Bag does not belong to this Trip'using errcode='23503';end if;
  next_quantity:=coalesce((p_values->>'quantity')::integer,1);packed:=coalesce((p_values->>'packed_quantity')::integer,0);
  if packed>next_quantity then raise exception 'Packed count exceeds quantity'using errcode='22023';end if;
  insert into public.packing_items(id,trip_id,category_id,category,name,quantity,weight_grams,bag_id,is_private,owner_person_id,sort_order,checked,packed_quantity)
  values(p_target,p_trip,c.id,c.name,btrim(p_values->>'name'),next_quantity,(p_values->>'weight_grams')::integer,bag,c.owner_person_id is not null,c.owner_person_id,position,
   case when p_values?'packed_quantity'then packed=next_quantity else coalesce((p_values->>'checked')::boolean,false)end,
   case when packed>0 and packed<next_quantity then packed else null end)returning * into i;
  changed:=true;
 elsif i.category_id<>c.id then
  if i.revision>=9007199254740991 then raise exception 'Packing item revision exceeds bound'using errcode='54000';end if;
  -- Label is a compatibility projection of the explicitly locked target, never a name resolver input.
  update public.packing_items set category_id=c.id,category=c.name where id=i.id returning * into i;changed:=true;
 end if;
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip;
 if revision not between 0 and 9007199254740991 or i.revision not between 1 and 9007199254740991 then raise exception 'Packing counter exceeds safe bound'using errcode='54000';end if;
 perform family_auth.packing_with_categories_v2_entry(p_trip);
 perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
 select * into c from public.packing_categories where id=p_category;
 after_state:=jsonb_build_object('item',family_auth.packing_item_json(i),'category_id',c.id,'category',family_auth.packing_category_json_v2(c),'collection_revision',revision);
 if octet_length(before_state::text)+octet_length(after_state::text)>16777216 then raise exception 'Packing history exceeds byte bound'using errcode='54000';end if;
 result:=family_auth.packing_categories_bound_v2(jsonb_build_object('version',2,'kind','packing-category-item','trip_id',p_trip,'operation_id',p_operation,'scope',p_scope,
 'action',p_action,'target_id',p_target,'values',p_values,'collection_revision',revision,'item',family_auth.packing_item_json(i),'category',family_auth.packing_category_json_v2(c),'changed',changed));
 insert into family_auth.packing_command_receipts(trip_id,actor_user_id,actor_person_id,operation_id,action,target_id,category_id,request_sha256,before_state,after_state,result)
 values(p_trip,auth.uid(),actor,p_operation,p_action,i.id,c.id,intent,before_state,after_state,result);
 return result;
end $$;

create function family_auth.packing_category_item_receipt_v2_entry(p_trip uuid,p_operation uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r family_auth.packing_command_receipts%rowtype;scope jsonb;redacted boolean;
begin
 perform family_auth.packing_category_require_v2(p_trip,true,statement_timestamp());
 if p_operation is null then raise exception 'Original operation UUID required'using errcode='22023';end if;
 scope:=family_auth.packing_scope(p_trip);
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.action not in('category-item-create','category-item-move')then raise exception 'Use the original packing receipt domain'using errcode='22023';end if;
  if r.result->'scope'->'person_id'is distinct from scope->'person_id'then raise exception 'Receipt belongs to another Person context'using errcode='PT409';end if;
 end if;
 redacted:=r.operation_id is not null and not family_auth.packing_result_visible(r.result);
 return jsonb_build_object('version',2,'kind','packing-category-item','trip_id',p_trip,'operation_id',p_operation,'scope',scope,'status',case when r.operation_id is null then'unknown'else'committed'end,'result_redacted',redacted,'result',case when redacted then null else r.result end);
end $$;
create function public.execute_family_trip_packing_category_item_v2(p_trip_id uuid,p_operation_id uuid,p_scope jsonb,p_action text,p_target_id uuid,
 p_expected_revision bigint,p_expected_collection_revision bigint,p_category_id uuid,p_observed_category jsonb,p_values jsonb)returns jsonb
language sql volatile security invoker set search_path='' as $$select family_auth.packing_category_item_v2_entry(p_trip_id,p_operation_id,p_scope,p_action,p_target_id,p_expected_revision,p_expected_collection_revision,p_category_id,p_observed_category,p_values);$$;
create function public.get_family_trip_packing_category_item_receipt_v2(p_trip_id uuid,p_operation_id uuid)returns jsonb
language sql stable security invoker set search_path='' as $$select family_auth.packing_category_item_receipt_v2_entry(p_trip_id,p_operation_id);$$;
revoke all on function family_auth.validate_category_bound_packing_request(text,jsonb,jsonb),
 family_auth.packing_category_item_v2_entry(uuid,uuid,jsonb,text,uuid,bigint,bigint,uuid,jsonb,jsonb),family_auth.packing_category_item_receipt_v2_entry(uuid,uuid),
 public.execute_family_trip_packing_category_item_v2(uuid,uuid,jsonb,text,uuid,bigint,bigint,uuid,jsonb,jsonb),public.get_family_trip_packing_category_item_receipt_v2(uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function family_auth.packing_category_item_v2_entry(uuid,uuid,jsonb,text,uuid,bigint,bigint,uuid,jsonb,jsonb),family_auth.packing_category_item_receipt_v2_entry(uuid,uuid),
 public.execute_family_trip_packing_category_item_v2(uuid,uuid,jsonb,text,uuid,bigint,bigint,uuid,jsonb,jsonb),public.get_family_trip_packing_category_item_receipt_v2(uuid,uuid)to authenticated;
comment on column family_auth.packing_command_receipts.category_bound_item_id is 'Derived typed link only for category-bound item v2 receipts; existing history remains null and unrewritten.';
comment on function public.execute_family_trip_packing_category_item_v2(uuid,uuid,jsonb,text,uuid,bigint,bigint,uuid,jsonb,jsonb)is 'Observed identity-bound create/move within common or own-personal scope. No name fallback, privacy conversion, category activation or frontend writer cutover.';
notify pgrst,'reload schema';
commit;
