begin;
set local lock_timeout='5s';
do $refuse$begin
 if exists(select 1 from family_auth.packing_command_receipts where action like 'bag-%')or exists(select 1 from public.packing_bags where revision<>1 or deleted_at is not null or deleted_by_person_id is not null)then raise exception 'Bag authoring requires forward recovery; downgrade unavailable'using errcode='0A000';end if;
end $refuse$;
drop trigger aa_packing_bag_lock on public.packing_bags;
drop trigger ab_packing_bag_version on public.packing_bags;
drop trigger aa_packing_bag_member_lock on public.packing_bag_members;
drop trigger ab_packing_bag_member on public.packing_bag_members;
drop trigger packing_bag_member_revision on public.packing_bag_members;
drop trigger ad_packing_item_active_bag on public.packing_items;
drop policy packing_bag_active on public.packing_bags;drop policy packing_bag_member_active on public.packing_bag_members;
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
  'category_assignees',coalesce((select jsonb_object_agg(category_name,people)from(select category_name,jsonb_agg(person_id order by person_id)people from(select c.name category_name,a.person_id from public.packing_category_assignments a join public.packing_categories c on c.id=a.category_id and c.trip_id=a.trip_id where a.trip_id=p_trip and c.deleted_at is null)cq group by category_name)x),'{}'::jsonb),
  'unassigned_weight_grams',(select coalesce(sum(coalesce(weight_grams,0)::bigint*quantity),0)from public.packing_items where trip_id=p_trip and bag_id is null and deleted_at is null),
  'trash_count',(select count(*)from public.packing_items i where i.trip_id=p_trip and i.deleted_at is not null and family_auth.packing_can_read(i.id,true)))into result;
 if octet_length(result::text)>8388608 then raise exception 'Packing snapshot exceeds byte bound' using errcode='54000';end if;
 return result;
end;$function$
;
CREATE OR REPLACE FUNCTION family_auth.packing_result_visible(p_result jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case
  when p_result->>'kind'='packing-category-aggregate' then case when p_result->>'action'='category-reorder'then
   not exists(select 1 from jsonb_array_elements(p_result->'categories')x left join public.packing_categories c on c.id=(x->>'id')::uuid left join public.trips t on t.id=c.trip_id
    where c.id is null or not family_auth.packing_category_can_read(c.id)or(c.owner_person_id is not null and c.owner_person_id is distinct from family_auth.actor_person_id(t.family_id)))
   else exists(select 1 from public.packing_categories c join public.trips t on t.id=c.trip_id where c.id=(p_result->'category'->>'id')::uuid
    and family_auth.packing_category_can_read(c.id)and(c.owner_person_id is null or c.owner_person_id=family_auth.actor_person_id(t.family_id)))
    and not exists(select 1 from jsonb_array_elements(p_result->'items')x where not family_auth.packing_can_read((x->>'id')::uuid,true))end
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
 if found and r.action in('group-packed-state','group-trash','clear-completed','category-rename','category-assignees','category-create','category-retain','category-dismiss-empty','category-restore-empty','category-item-create','category-item-move','category-reorder','category-trash-batch','category-restore-batch') then
  raise exception 'Use the original packing receipt domain' using errcode='22023';end if;
 if found and r.result->'scope'->'person_id'is distinct from scope->'person_id'then raise exception 'Receipt belongs to another Person context'using errcode='PT409';end if;
 redacted:=r.operation_id is not null and not family_auth.packing_result_visible(r.result);
 return jsonb_build_object('version',1,'trip_id',p_trip,'operation_id',p_operation,'scope',scope,'status',case when r.operation_id is null then'unknown'else'committed'end,
  'result_redacted',redacted,'result',case when redacted then null else r.result end);
end;$function$
;
CREATE OR REPLACE FUNCTION family_auth.tg_packing_person_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.family_id is distinct from old.family_id and(
  exists(select 1 from public.packing_categories where owner_person_id=old.id or deleted_by_person_id=old.id)
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
drop function execute_family_trip_packing_bag_v1(uuid,uuid,jsonb,text,uuid,bigint,bigint,jsonb,jsonb);
drop function family_auth.packing_bag_can_read(uuid,boolean);
drop function family_auth.packing_bag_execute_entry(uuid,uuid,jsonb,text,uuid,bigint,bigint,jsonb,jsonb);
drop function family_auth.packing_bag_json(packing_bags);
drop function family_auth.packing_bag_members_json(uuid);
drop function family_auth.packing_bag_observation(uuid,uuid,boolean);
drop function family_auth.packing_bag_receipt_entry(uuid,uuid);
drop function family_auth.packing_bag_trash_entry(uuid,integer,timestamp with time zone,uuid);
drop function family_auth.packing_bags_entry(uuid);
drop function family_auth.tg_packing_bag_member();
drop function family_auth.tg_packing_bag_member_revision();
drop function family_auth.tg_packing_bag_version();
drop function family_auth.tg_packing_item_active_bag();
drop function family_auth.validate_packing_bag_request(text,jsonb);
drop function get_family_trip_packing_bag_receipt_v1(uuid,uuid);
drop function get_family_trip_packing_bag_v1(uuid,uuid,boolean);
drop function get_family_trip_packing_bags_v1(uuid);
drop function list_family_trip_packing_bag_trash_v1(uuid,integer,timestamp with time zone,uuid);
alter table family_auth.packing_command_receipts drop constraint packing_receipt_bag_result,drop constraint packing_command_receipts_action_check,add constraint packing_command_receipts_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'packed-state'::text, 'reorder'::text, 'trash'::text, 'restore'::text, 'group-packed-state'::text, 'group-trash'::text, 'clear-completed'::text, 'category-rename'::text, 'category-assignees'::text, 'category-create'::text, 'category-retain'::text, 'category-dismiss-empty'::text, 'category-restore-empty'::text, 'category-item-create'::text, 'category-item-move'::text, 'category-reorder'::text, 'category-trash-batch'::text, 'category-restore-batch'::text])));
alter table public.packing_bags drop column revision,drop column deleted_at,drop column deleted_by_person_id,drop constraint packing_bag_nonnegative_rank;
delete from supabase_migrations.schema_migrations where version='20261112112956';notify pgrst,'reload schema';commit;
