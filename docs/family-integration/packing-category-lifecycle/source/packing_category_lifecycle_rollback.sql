-- Local C3a rehearsal rollback only, before lifecycle authoring. Never apply to a hosted project.
begin;
set local lock_timeout='5s';
lock table public.trips,family_auth.trip_packing_state,public.packing_categories,public.packing_category_assignments,public.packing_items,public.packing_category_assignees,family_auth.packing_command_receipts in access exclusive mode;
do $$begin
 if exists(select 1 from public.families where id='0ea04851-1ad5-428d-9460-f086a4e94aa6')or current_setting('server_version')<>'17.11'then raise exception 'Local rehearsal fingerprint required'using errcode='22023';end if;
 if exists(select 1 from family_auth.packing_command_receipts where action in('category-create','category-retain','category-dismiss-empty','category-restore-empty'))or exists(select 1 from public.packing_categories c where deleted_at is not null or retained_when_empty<>(exists(select 1 from public.packing_items i where i.category_id=c.id and i.deleted_at is null)))then raise exception 'Lifecycle authoring exists; restore a rehearsal backup instead'using errcode='0A000';end if;
end $$;
drop function execute_family_trip_packing_category_lifecycle_v2(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb);
drop function family_auth.packing_categories_bound_v2(jsonb);
drop function family_auth.packing_category_json_v2(packing_categories);
drop function family_auth.packing_category_lifecycle_receipt_v2_entry(uuid,uuid);
drop function family_auth.packing_category_lifecycle_v2_entry(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb);
drop function family_auth.packing_category_lookup_v2_entry(uuid,text,text);
drop function family_auth.packing_category_next_order(uuid,uuid);
drop function family_auth.packing_category_require_v2(uuid,boolean,timestamp with time zone);
drop function family_auth.packing_category_trash_v2_entry(uuid,integer,timestamp with time zone,uuid);
drop function family_auth.packing_with_categories_v2_entry(uuid);
drop function family_auth.validate_packing_category_lifecycle_v2(text,jsonb,jsonb);
drop function get_family_trip_packing_category_lifecycle_receipt_v2(uuid,uuid);
drop function get_family_trip_packing_with_categories_v2(uuid);
drop function list_family_trip_packing_category_trash_v2(uuid,integer,timestamp with time zone,uuid);
drop function lookup_family_trip_packing_category_v2(uuid,text,text);
drop trigger packing_category_changed on public.packing_categories;
create trigger packing_category_changed after update on public.packing_categories for each row execute function family_auth.tg_packing_category_changed();
CREATE OR REPLACE FUNCTION family_auth.tg_packing_person_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.family_id is distinct from old.family_id and(
  exists(select 1 from public.packing_categories where owner_person_id=old.id)
  or exists(select 1 from public.packing_category_assignments where person_id=old.id or assigned_by_person_id=old.id)
  or exists(select 1 from public.packing_items where owner_person_id=old.id or deleted_by_person_id=old.id)
  or exists(select 1 from public.packing_bag_members where person_id=old.id)
  or exists(select 1 from public.packing_category_assignees where person_id=old.id)
  or exists(select 1 from public.packing_item_recipients where person_id=old.id)
  or exists(select 1 from public.packing_item_contributors where person_id=old.id)
  or exists(select 1 from family_auth.packing_command_receipts where actor_person_id=old.id))then
  raise exception 'Packing history prevents moving this Person to another Family'using errcode='23514';end if;
 return new;
end;$function$
;
CREATE OR REPLACE FUNCTION family_auth.tg_packing_category_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='DELETE'then raise exception 'Packing category permanent deletion is unavailable'using errcode='0A000';end if;
 if new.owner_person_id is not null and not exists(select 1 from public.people p join public.trips t on t.family_id=p.family_id where p.id=new.owner_person_id and t.id=new.trip_id)then
  raise exception 'Category owner must belong to this Family'using errcode='23503';end if;
 if tg_op='INSERT'then new.revision:=1;
 else
  if(new.id,new.trip_id,new.owner_person_id,new.created_at)is distinct from(old.id,old.trip_id,old.owner_person_id,old.created_at)then raise exception 'Category identity is immutable'using errcode='23514';end if;
  if new.revision<>old.revision then raise exception 'Category revision is server managed'using errcode='23514';end if;
  if new.name=old.name collate "C"then return null;end if;
  if old.revision>=9007199254740991 then raise exception 'Category revision exceeds bound'using errcode='54000';end if;
  new.revision:=old.revision+1;new.updated_at:=clock_timestamp();
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION family_auth.packing_category_resolve(p_trip uuid, p_owner uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare found_id uuid;
begin
 select id into found_id from public.packing_categories where trip_id=p_trip and owner_person_id is not distinct from p_owner and name=p_name collate "C";
 if found_id is null then
  insert into public.packing_categories(trip_id,owner_person_id,name)values(p_trip,p_owner,p_name)on conflict(trip_id,owner_person_id,name)do nothing returning id into found_id;
  if found_id is null then select id into found_id from public.packing_categories where trip_id=p_trip and owner_person_id is not distinct from p_owner and name=p_name collate "C";end if;
 end if;
 if found_id is null then raise exception 'Category identity resolution failed'using errcode='23514';end if;
 return found_id;
end $function$
;
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
  if new.deleted_at is null then select * into c from public.packing_categories where id=old.category_id;new.category:=c.name;end if;
  return new;
 end if;
 if tg_op='INSERT'and new.category_id is null then new.category_id:=family_auth.packing_category_resolve(new.trip_id,owner,new.category);
 elsif tg_op='UPDATE'and(new.category,new.is_private,new.owner_person_id)is distinct from(old.category,old.is_private,old.owner_person_id)then
  new.category_id:=family_auth.packing_category_resolve(new.trip_id,owner,new.category);
 end if;
 select * into c from public.packing_categories where id=new.category_id;
 if c.id is null or c.trip_id<>new.trip_id or c.owner_person_id is distinct from owner or c.name is distinct from new.category collate "C"then
  raise exception 'Packing category context mismatch'using errcode='23503';end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION family_auth.tg_packing_category_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 -- Category identity survives a name change; immutable Trash rows retain their historical compatibility text.
 if tg_table_name='packing_categories'then
  update public.packing_items set category=new.name where category_id=new.id and deleted_at is null and category is distinct from new.name collate "C";
  if new.owner_person_id is null then update public.packing_category_assignees set category_name=new.name where trip_id=new.trip_id and category_name=old.name collate "C";end if;
 end if;
 if tg_table_name='packing_category_assignments'then
  if tg_op='INSERT'then
   if not exists(select 1 from public.packing_category_assignees where trip_id=new.trip_id and category_name=(select name from public.packing_categories where id=new.category_id)collate "C" and person_id=new.person_id)then
    insert into public.packing_category_assignees(trip_id,category_name,person_id)select new.trip_id,name,new.person_id from public.packing_categories where id=new.category_id;
   end if;
  elsif tg_op='DELETE'then
   delete from public.packing_category_assignees where trip_id=old.trip_id and category_name=(select name from public.packing_categories where id=old.category_id)collate "C" and person_id=old.person_id;
  end if;
 end if;
 update family_auth.trip_packing_state set collection_revision=collection_revision+1 where trip_id=case when tg_op='DELETE'then old.trip_id else new.trip_id end;
 if not found then raise exception 'Packing scope initialization missing'using errcode='23514';end if;
 if exists(select 1 from family_auth.trip_packing_state where trip_id=case when tg_op='DELETE'then old.trip_id else new.trip_id end and collection_revision>9007199254740991)then raise exception 'Packing collection exceeds bound'using errcode='54000';end if;
 perform family_auth.append_audit((select family_id from public.trips where id=case when tg_op='DELETE'then old.trip_id else new.trip_id end),
  case when tg_op='DELETE'then old.trip_id else new.trip_id end,'trip.packing.manage','direct','packing',
  (case when tg_op='DELETE'then old.trip_id else new.trip_id end)::text,lower(tg_op),jsonb_build_object('table',tg_table_name));
 return case when tg_op='DELETE'then old else new end;
end $function$
;
CREATE OR REPLACE FUNCTION family_auth.packing_snapshot(p_trip uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if(select count(*)from public.packing_items where trip_id=p_trip and deleted_at is null)>2000 then raise exception 'Packing list exceeds bounded v1 contract' using errcode='54000';end if;
 select jsonb_build_object('version',1,'scope',family_auth.packing_scope(p_trip),
  'collection_revision',(select collection_revision from family_auth.trip_packing_state where trip_id=p_trip),
  'items',coalesce((select jsonb_agg(family_auth.packing_item_json(i)order by i.sort_order,i.id)from public.packing_items i where i.trip_id=p_trip and i.deleted_at is null and family_auth.packing_can_read(i.id,false)),'[]'::jsonb),
  'bags',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('member_person_ids',coalesce((select jsonb_agg(person_id order by person_id)from public.packing_bag_members where bag_id=b.id),'[]'::jsonb),
    'total_weight_grams',(select coalesce(sum(coalesce(weight_grams,0)::bigint*quantity),0)from public.packing_items where trip_id=p_trip and bag_id=b.id and deleted_at is null))order by b.sort_order,b.id)from public.packing_bags b where b.trip_id=p_trip),'[]'::jsonb),
  'category_assignees',coalesce((select jsonb_object_agg(category_name,people)from(select category_name,jsonb_agg(person_id order by person_id)people from(select c.name category_name,a.person_id from public.packing_category_assignments a join public.packing_categories c on c.id=a.category_id and c.trip_id=a.trip_id where a.trip_id=p_trip)cq group by category_name)x),'{}'::jsonb),
  'unassigned_weight_grams',(select coalesce(sum(coalesce(weight_grams,0)::bigint*quantity),0)from public.packing_items where trip_id=p_trip and bag_id is null and deleted_at is null),
  'trash_count',(select count(*)from public.packing_items i where i.trip_id=p_trip and i.deleted_at is not null and family_auth.packing_can_read(i.id,true)))into result;
 if octet_length(result::text)>8388608 then raise exception 'Packing snapshot exceeds byte bound' using errcode='54000';end if;
 return result;
end;$function$
;
CREATE OR REPLACE FUNCTION family_auth.packing_category_execute_entry(p_trip uuid, p_operation uuid, p_scope jsonb, p_action text, p_expected_collection_revision bigint, p_observed_category jsonb, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION family_auth.packing_category_receipt_entry(p_trip uuid, p_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if found and r.action in('group-packed-state','group-trash','clear-completed','category-rename','category-assignees') then
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
  when p_result->>'kind'='packing-category' then family_auth.packing_category_can_read((p_result->'category'->>'id')::uuid)
  when p_result->>'action' in('group-packed-state','group-trash','clear-completed') then
   not exists(select 1 from jsonb_array_elements(p_result->'items') x where not family_auth.packing_can_read((x->>'id')::uuid,true))
  when p_result->>'action'='reorder' then
   not exists(select 1 from jsonb_array_elements_text(p_result->'ordered_ids')x where not family_auth.packing_can_read(x::uuid,true))
  else family_auth.packing_can_read((p_result->>'target_id')::uuid,true) end;
$function$
;
alter table family_auth.packing_command_receipts drop constraint packing_command_receipts_action_check,
 add constraint packing_command_receipts_action_check check(action in('create','update','packed-state','reorder','trash','restore','group-packed-state','group-trash','clear-completed','category-rename','category-assignees')),
 drop constraint packing_receipt_category_domain,
 add constraint packing_receipt_category_domain check(case when action in('category-rename','category-assignees')then category_id is not null and target_id=category_id else category_id is null end);
alter table public.packing_categories drop column retained_when_empty,drop column sort_order,drop column deleted_at,drop column deleted_by_person_id;
notify pgrst,'reload schema';
commit;
