-- C3c1 pre-authoring local rehearsal rollback only. Not a hosted rollback procedure.
begin;
set local lock_timeout='5s';
lock table public.trips,family_auth.trip_packing_state,public.packing_categories,public.packing_items,family_auth.packing_command_receipts,family_auth.packing_category_batches,family_auth.packing_category_batch_items in access exclusive mode;
do $$begin
 if current_setting('server_version')<>'17.11' or exists(select 1 from public.families where id='0ea04851-1ad5-428d-9460-f086a4e94aa6') then raise exception 'Synthetic local rehearsal required'using errcode='22023';end if;
 if exists(select 1 from family_auth.packing_command_receipts where action in('category-reorder','category-trash-batch','category-restore-batch'))or exists(select 1 from family_auth.packing_category_batches)or exists(select 1 from family_auth.packing_category_batch_items)then raise exception 'Category aggregate authoring exists; restore a rehearsal backup instead'using errcode='0A000';end if;
end $$;
drop trigger packing_category_batch_identity on family_auth.packing_category_batches;
drop trigger packing_category_batch_complete on family_auth.packing_category_batches;
drop trigger packing_category_batch_member_immutable on family_auth.packing_category_batch_items;
drop trigger packing_category_batch_member_complete on family_auth.packing_category_batch_items;
drop trigger packing_category_pending_batch on public.packing_categories;
drop trigger packing_category_assignment_pending_batch on public.packing_category_assignments;
drop trigger packing_item_pending_batch on public.packing_items;
drop trigger packing_recipient_pending_batch on public.packing_item_recipients;
drop trigger packing_contributor_pending_batch on public.packing_item_contributors;
drop function get_family_trip_packing_category_aggregate_receipt_v3(uuid,uuid);
drop function execute_family_trip_packing_category_aggregate_v3(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb);
drop function list_family_trip_packing_category_batches_v3(uuid,integer,timestamp with time zone,uuid);
drop function get_family_trip_packing_category_aggregate_v3(uuid,uuid,boolean);
drop function get_family_trip_packing_category_lane_v3(uuid,text);
drop function family_auth.packing_category_aggregate_receipt_v3_entry(uuid,uuid);
drop function family_auth.packing_category_aggregate_execute_v3_entry(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb);
drop function family_auth.validate_packing_aggregate_request(text,uuid,jsonb,jsonb);
drop function family_auth.tg_packing_batch_guard();
drop function family_auth.tg_packing_batch_identity();
drop function family_auth.packing_batch_assert(uuid,uuid,uuid);
drop function family_auth.packing_batch_assert_category(uuid,uuid);
drop function family_auth.packing_batch_assert_item(uuid,uuid);
drop function family_auth.packing_category_batches_v3_entry(uuid,integer,timestamp with time zone,uuid);
drop function family_auth.packing_category_aggregate_v3_entry(uuid,uuid,boolean);
drop function family_auth.packing_category_lane_v3_entry(uuid,text);
drop function family_auth.packing_aggregate_bound(jsonb);
drop function family_auth.packing_batch_key(uuid,uuid,uuid);
drop function family_auth.packing_batch_item_state(packing_items);
drop table family_auth.packing_category_batch_items;
drop table family_auth.packing_category_batches;
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
alter table family_auth.packing_command_receipts drop constraint packing_receipt_aggregate_domain;
alter table family_auth.packing_command_receipts drop constraint packing_command_receipts_check,add constraint packing_command_receipts_check CHECK (((action = ANY (ARRAY['reorder'::text, 'group-packed-state'::text, 'group-trash'::text, 'clear-completed'::text])) = (target_id IS NULL)));
alter table family_auth.packing_command_receipts drop constraint packing_receipt_category_domain,add constraint packing_receipt_category_domain CHECK (
CASE
    WHEN (action = ANY (ARRAY['category-rename'::text, 'category-assignees'::text, 'category-create'::text, 'category-retain'::text, 'category-dismiss-empty'::text, 'category-restore-empty'::text])) THEN ((category_id IS NOT NULL) AND (target_id = category_id))
    WHEN (action = ANY (ARRAY['category-item-create'::text, 'category-item-move'::text])) THEN ((category_id IS NOT NULL) AND (target_id IS NOT NULL))
    ELSE (category_id IS NULL)
END);
alter table family_auth.packing_command_receipts drop constraint packing_command_receipts_action_check,add constraint packing_command_receipts_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'packed-state'::text, 'reorder'::text, 'trash'::text, 'restore'::text, 'group-packed-state'::text, 'group-trash'::text, 'clear-completed'::text, 'category-rename'::text, 'category-assignees'::text, 'category-create'::text, 'category-retain'::text, 'category-dismiss-empty'::text, 'category-restore-empty'::text, 'category-item-create'::text, 'category-item-move'::text])));
notify pgrst,'reload schema';
commit;
