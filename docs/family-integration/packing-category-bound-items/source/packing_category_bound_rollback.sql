-- C3b1 local pre-authoring rehearsal downgrade only. Never run on hosted or retained stacks.
begin;
set local lock_timeout='5s';
lock table public.trips,family_auth.trip_packing_state,public.packing_categories,public.packing_items,family_auth.packing_command_receipts in access exclusive mode;
do $$begin
 if current_setting('server_version')<>'17.11'or exists(select 1 from public.families where id='0ea04851-1ad5-428d-9460-f086a4e94aa6')then raise exception 'Marked local rehearsal required'using errcode='22023';end if;
 if exists(select 1 from family_auth.packing_command_receipts where action in('category-item-create','category-item-move'))then raise exception 'Category-bound authoring exists; restore a rehearsal backup instead'using errcode='0A000';end if;
end $$;
drop function execute_family_trip_packing_category_item_v2(uuid,uuid,jsonb,text,uuid,bigint,bigint,uuid,jsonb,jsonb);
drop function family_auth.packing_category_item_receipt_v2_entry(uuid,uuid);
drop function family_auth.packing_category_item_v2_entry(uuid,uuid,jsonb,text,uuid,bigint,bigint,uuid,jsonb,jsonb);
drop function family_auth.validate_category_bound_packing_request(text,jsonb,jsonb);
drop function get_family_trip_packing_category_item_receipt_v2(uuid,uuid);
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
 if found and r.action in('group-packed-state','group-trash','clear-completed','category-rename','category-assignees','category-create','category-retain','category-dismiss-empty','category-restore-empty') then
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
  when p_result->>'kind'='packing-category-lifecycle' then exists(select 1 from public.packing_categories c join public.trips t on t.id=c.trip_id where c.id=(p_result->'category'->>'id')::uuid and family_auth.packing_category_can_read(c.id)and(c.owner_person_id is null or c.owner_person_id=family_auth.actor_person_id(t.family_id)))
  when p_result->>'kind'='packing-category' then family_auth.packing_category_can_read((p_result->'category'->>'id')::uuid)
  when p_result->>'action' in('group-packed-state','group-trash','clear-completed') then
   not exists(select 1 from jsonb_array_elements(p_result->'items') x where not family_auth.packing_can_read((x->>'id')::uuid,true))
  when p_result->>'action'='reorder' then
   not exists(select 1 from jsonb_array_elements_text(p_result->'ordered_ids')x where not family_auth.packing_can_read(x::uuid,true))
  else family_auth.packing_can_read((p_result->>'target_id')::uuid,true) end;
$function$
;
alter table family_auth.packing_command_receipts drop constraint packing_receipt_bound_item_result,drop constraint packing_receipt_bound_item_context;
drop index family_auth.packing_receipt_bound_item_idx;
alter table family_auth.packing_command_receipts drop column category_bound_item_id;
alter table family_auth.packing_command_receipts drop constraint packing_command_receipts_action_check,add constraint packing_command_receipts_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'packed-state'::text, 'reorder'::text, 'trash'::text, 'restore'::text, 'group-packed-state'::text, 'group-trash'::text, 'clear-completed'::text, 'category-rename'::text, 'category-assignees'::text, 'category-create'::text, 'category-retain'::text, 'category-dismiss-empty'::text, 'category-restore-empty'::text])));
alter table family_auth.packing_command_receipts drop constraint packing_receipt_category_domain,add constraint packing_receipt_category_domain CHECK (
CASE
    WHEN (action = ANY (ARRAY['category-rename'::text, 'category-assignees'::text, 'category-create'::text, 'category-retain'::text, 'category-dismiss-empty'::text, 'category-restore-empty'::text])) THEN ((category_id IS NOT NULL) AND (target_id = category_id))
    ELSE (category_id IS NULL)
END);
notify pgrst,'reload schema';
commit;
