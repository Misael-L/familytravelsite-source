-- U04-D2a: observed Trip-owned bag commands; no client or native activation.
begin;
set local lock_timeout='5s';set local statement_timeout='60s';
do $pin$begin
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_snapshot(uuid)'::regprocedure),'UTF8')),'hex')<>'57497c64f20967473ceabb3650fbd45fc8a2de422b86c484819366f684a2d61e'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_result_visible(jsonb)'::regprocedure),'UTF8')),'hex')<>'0d09df6a686141725fc6713472e94a89825ed66321225fa448437510815f7d5c'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_receipt_entry(uuid,uuid)'::regprocedure),'UTF8')),'hex')<>'991acee8a3059d0bb92c19c1ab27f624ab99684a3f7991dc41cbc8463317e2eb'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_person_context()'::regprocedure),'UTF8')),'hex')<>'574c68ac38dc4610d319f13b60303e1ed8fe433849e2369265ca5b534e72fd8c'then raise exception 'Reviewed packing baseline drift'using errcode='22023';end if;
end $pin$;

do $preflight$begin
 if exists(select 1 from public.packing_bags where sort_order<0)then raise exception 'Negative bag ranks require reviewed correction'using errcode='23514';end if;
 if exists(select 1 from public.packing_bags group by trip_id having count(*)>2000)then raise exception 'Bag active quota requires reviewed correction'using errcode='54000';end if;
end $preflight$;
alter table public.packing_bags
 add column revision bigint not null default 1 check(revision>0),
 add column deleted_at timestamptz,
 add column deleted_by_person_id uuid references public.people(id)on delete restrict,
 add constraint packing_bag_trash_pair check((deleted_at is null)=(deleted_by_person_id is null)and(deleted_at is null or isfinite(deleted_at))),
 add constraint packing_bag_nonnegative_rank check(sort_order>=0);
create index packing_bag_trash_page_idx on public.packing_bags(trip_id,deleted_at desc,id desc)where deleted_at is not null;
create index packing_bag_deleted_actor_idx on public.packing_bags(deleted_by_person_id)where deleted_by_person_id is not null;

create function family_auth.packing_bag_can_read(p_bag uuid,p_include_deleted boolean default false)returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid()is not null and exists(select 1 from public.packing_bags b join public.trips t on t.id=b.trip_id
 where b.id=p_bag and t.deleted_at is null and(p_include_deleted or b.deleted_at is null)
 and public.session_meets_trip_assurance(t.id)and(public.is_super_admin()or public.is_active_member_of(t.family_id)));
$$;
create policy packing_bag_active on public.packing_bags as restrictive for select to authenticated using(deleted_at is null);
create policy packing_bag_member_active on public.packing_bag_members as restrictive for select to authenticated using(family_auth.packing_bag_can_read(bag_id,false));

create function family_auth.tg_packing_bag_version()returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE'then raise exception 'Bag requires recoverable Trash; permanent purge is unavailable'using errcode='0A000';end if;
 if tg_op='INSERT'then
  if new.deleted_at is not null or new.deleted_by_person_id is not null then raise exception 'New bag must be active'using errcode='23514';end if;
  new.revision:=1;
 else
  if(new.id,new.trip_id,new.created_at)is distinct from(old.id,old.trip_id,old.created_at)then raise exception 'Bag identity is immutable'using errcode='23514';end if;
  if new.revision is distinct from old.revision then raise exception 'Bag revision is server managed'using errcode='23514';end if;
  if old.deleted_at is not null and(to_jsonb(new)-array['deleted_at','deleted_by_person_id','revision','updated_at'])is distinct from(to_jsonb(old)-array['deleted_at','deleted_by_person_id','revision','updated_at'])then raise exception 'Restore bag before editing it'using errcode='PT409';end if;
  if old.deleted_at is not null and new.deleted_at is not null and(new.deleted_at,new.deleted_by_person_id)is distinct from(old.deleted_at,old.deleted_by_person_id)then raise exception 'Bag Trash provenance is immutable'using errcode='PT409';end if;
  new.revision:=old.revision+1;
 end if;
 if tg_op='INSERT'or new.name is distinct from old.name then
  if new.name is null or new.name<>btrim(new.name)or char_length(new.name)not between 1 and 500 then raise exception 'New bag name must be trimmed and bounded'using errcode='22023';end if;
 end if;
 if(tg_op='INSERT'or new.color is distinct from old.color)and new.color is not null and new.color!~'^#[0-9A-Fa-f]{6}$'then raise exception 'New bag color must be six-digit hex'using errcode='22023';end if;
 if new.deleted_by_person_id is not null and not exists(select 1 from public.people p join public.trips t on t.family_id=p.family_id where p.id=new.deleted_by_person_id and t.id=new.trip_id)then raise exception 'Bag Trash actor must belong to its Family'using errcode='23514';end if;
 if new.deleted_at is not null and exists(select 1 from public.packing_items i where i.trip_id=new.trip_id and i.bag_id=new.id and i.deleted_at is null)then raise exception 'Bag has live dependencies; remove them before Trash'using errcode='PT409';end if;
 if new.deleted_at is null and(tg_op='INSERT'or old.deleted_at is not null)and(select count(*)from public.packing_bags b where b.trip_id=new.trip_id and b.id<>new.id and b.deleted_at is null)>=2000 then raise exception 'Active bag quota exceeded'using errcode='54000';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create function family_auth.tg_packing_bag_member()returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.packing_bags%rowtype;
begin
 if tg_op='UPDATE'and(new.bag_id,new.trip_id,new.person_id)is distinct from(old.bag_id,old.trip_id,old.person_id)then raise exception 'Carrier identity is immutable; replace membership explicitly'using errcode='23514';end if;
 select * into b from public.packing_bags where id=case when tg_op='DELETE'then old.bag_id else new.bag_id end for update;
 if b.deleted_at is not null then raise exception 'Bag Trash retains carrier history'using errcode='PT409';end if;
 return case when tg_op='DELETE'then old else new end;
end $$;
create function family_auth.tg_packing_bag_member_revision()returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.packing_bags set updated_at=clock_timestamp()where id=case when tg_op='DELETE'then old.bag_id else new.bag_id end;
 return null;
end $$;
create function family_auth.tg_packing_item_active_bag()returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.packing_bags%rowtype;
begin
 -- Deleted item references remain historical; every assignment and revival is checked.
 if new.bag_id is not null and(new.deleted_at is null or tg_op='INSERT'or new.bag_id is distinct from old.bag_id)then
  select * into b from public.packing_bags where(trip_id,id)=(new.trip_id,new.bag_id)for update;
  if b.id is null then raise exception 'Packing bag must belong to the same Trip'using errcode='23503';end if;
  if b.deleted_at is not null then raise exception 'Restore the referenced bag before assigning or restoring this item'using errcode='PT409';end if;
 end if;
 return new;
end $$;
-- Reuse the existing root/advisory/collection locking discipline at all bag mutation boundaries.
create trigger aa_packing_bag_lock before insert or update or delete on public.packing_bags for each row execute function family_auth.tg_packing_category_lock();
create trigger ab_packing_bag_version before insert or update or delete on public.packing_bags for each row execute function family_auth.tg_packing_bag_version();
create trigger aa_packing_bag_member_lock before insert or update or delete on public.packing_bag_members for each row execute function family_auth.tg_packing_category_lock();
create trigger ab_packing_bag_member before insert or update or delete on public.packing_bag_members for each row execute function family_auth.tg_packing_bag_member();
create trigger packing_bag_member_revision after insert or delete on public.packing_bag_members for each row execute function family_auth.tg_packing_bag_member_revision();
create trigger ad_packing_item_active_bag before insert or update on public.packing_items for each row execute function family_auth.tg_packing_item_active_bag();

create function family_auth.packing_bag_json(p_bag public.packing_bags)returns jsonb
language sql stable security definer set search_path=''as $$select jsonb_build_object('id',p_bag.id,'trip_id',p_bag.trip_id,'name',p_bag.name,'color',p_bag.color,'sort_order',p_bag.sort_order,'weight_limit_grams',p_bag.weight_limit_grams,'created_at',p_bag.created_at,'updated_at',p_bag.updated_at,'revision',p_bag.revision,'deleted_at',p_bag.deleted_at,'deleted_by_person_id',p_bag.deleted_by_person_id);$$;
create function family_auth.packing_bag_members_json(p_bag uuid)returns jsonb
language sql stable security definer set search_path=''as $$select coalesce(jsonb_agg(person_id order by person_id),'[]'::jsonb)from public.packing_bag_members where bag_id=p_bag;$$;
create function family_auth.packing_bag_observation(p_trip uuid,p_bag uuid,p_include_deleted boolean)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare b public.packing_bags%rowtype;r jsonb;
begin
 perform family_auth.packing_require(p_trip,false);
 if p_bag is null or p_include_deleted is null then raise exception 'Exact bag identity and lifecycle required'using errcode='22023';end if;
 select * into b from public.packing_bags where trip_id=p_trip and id=p_bag;
 if b.id is null or(b.deleted_at is not null and not p_include_deleted)then raise exception 'Bag is unavailable in this scope'using errcode='42501';end if;
 r:=jsonb_build_object('version',1,'kind','packing-bag-observation','scope',family_auth.packing_scope(p_trip),'collection_revision',(select collection_revision from family_auth.trip_packing_state where trip_id=p_trip),'bag',family_auth.packing_bag_json(b),'member_person_ids',family_auth.packing_bag_members_json(b.id));
 if b.revision>9007199254740991 or(r->>'collection_revision')::numeric>9007199254740991 or octet_length(r::text)>1048576 then raise exception 'Bag observation exceeds safe bound'using errcode='54000';end if;
 return r;
end $$;
create function family_auth.packing_bags_entry(p_trip uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare r jsonb;v jsonb;
begin
 perform family_auth.packing_require(p_trip,false);v:=family_auth.packing_snapshot(p_trip);
 select jsonb_build_object('version',1,'kind','packing-bag-snapshot','scope',v->'scope','collection_revision',v->'collection_revision','packing',v,
 'bags',coalesce((select jsonb_agg(family_auth.packing_bag_observation(p_trip,b.id,false)order by b.sort_order,b.id)from public.packing_bags b where b.trip_id=p_trip and b.deleted_at is null),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'eligible',p.archived_at is null and exists(select 1 from public.trip_travelers v where v.trip_id=p_trip and v.person_id=p.id)and(p.user_id is null or exists(select 1 from public.family_members m where m.family_id=p.family_id and m.user_id=p.user_id and m.status='active')))order by p.id)
 from public.people p join public.trips t on t.family_id=p.family_id where t.id=p_trip and(exists(select 1 from public.trip_travelers v where v.trip_id=t.id and v.person_id=p.id)or exists(select 1 from public.packing_bag_members m join public.packing_bags b on b.id=m.bag_id where b.trip_id=t.id and b.deleted_at is null and m.person_id=p.id))),'[]'::jsonb))into r;
 if octet_length(r::text)>8388608 then raise exception 'Bag snapshot exceeds byte bound'using errcode='54000';end if;return r;
end $$;
create function family_auth.packing_bag_trash_entry(p_trip uuid,p_limit integer,p_before timestamptz,p_before_id uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare rows jsonb;last_row jsonb;more boolean;r jsonb;
begin
 perform family_auth.packing_require(p_trip,false);
 if p_limit is null or p_limit not between 1 and 100 or(p_before is null)<>(p_before_id is null)or(p_before is not null and not isfinite(p_before))then raise exception 'Exact bounded bag Trash cursor required'using errcode='22023';end if;
 select coalesce(jsonb_agg(family_auth.packing_bag_observation(p_trip,b.id,true)order by b.deleted_at desc,b.id desc),'[]'::jsonb)into rows from(select * from public.packing_bags b where b.trip_id=p_trip and b.deleted_at is not null and(p_before is null or(b.deleted_at,b.id)<(p_before,p_before_id))order by b.deleted_at desc,b.id desc limit p_limit+1)b;
 more:=jsonb_array_length(rows)>p_limit;if more then rows:=rows-p_limit;end if;last_row:=rows->(jsonb_array_length(rows)-1)->'bag';
 r:=jsonb_build_object('version',1,'kind','packing-bag-trash','scope',family_auth.packing_scope(p_trip),'collection_revision',(select collection_revision from family_auth.trip_packing_state where trip_id=p_trip),'bags',rows,'next_cursor',case when more then jsonb_build_object('deleted_at',last_row->'deleted_at','id',last_row->'id')else null end);
 if(r->>'collection_revision')::numeric>9007199254740991 or octet_length(r::text)>8388608 then raise exception 'Bag Trash page exceeds safe bound'using errcode='54000';end if;return r;
end $$;

alter table family_auth.packing_command_receipts add constraint packing_receipt_bag_result check(case when action in('bag-create','bag-update','bag-members','bag-trash-empty','bag-restore')then
 ((result->'version'='1'::jsonb and result->>'kind'='packing-bag'and result->>'action'=action and result->>'trip_id'=trip_id::text and result->>'operation_id'=operation_id::text and result->>'target_id'=target_id::text and result->'bag'->>'id'=target_id::text and result->'bag'->>'trip_id'=trip_id::text and category_id is null and category_bound_item_id is null)is true)else true end);
CREATE OR REPLACE FUNCTION family_auth.packing_snapshot(p_trip uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;

begin
 if(select count(*)from public.packing_items where trip_id=p_trip and deleted_at is null)>2000 then raise exception 'Packing list exceeds bounded v1 contract' using errcode='54000';end if;
 if(select count(*)from public.packing_bags where trip_id=p_trip and deleted_at is null)>2000 or(select collection_revision from family_auth.trip_packing_state where trip_id=p_trip)>9007199254740991 then raise exception 'Bag collection exceeds safe bound'using errcode='54000';end if;
 select jsonb_build_object('version',1,'scope',family_auth.packing_scope(p_trip),
  'collection_revision',(select collection_revision from family_auth.trip_packing_state where trip_id=p_trip),
  'items',coalesce((select jsonb_agg(family_auth.packing_item_json(i)order by i.sort_order,i.id)from public.packing_items i where i.trip_id=p_trip and i.deleted_at is null and family_auth.packing_can_read(i.id,false)),'[]'::jsonb),
  'bags',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'trip_id',b.trip_id,'name',b.name,'color',b.color,'sort_order',b.sort_order,'weight_limit_grams',b.weight_limit_grams,'created_at',b.created_at,'updated_at',b.updated_at)||jsonb_build_object('member_person_ids',coalesce((select jsonb_agg(person_id order by person_id)from public.packing_bag_members where bag_id=b.id),'[]'::jsonb),
    'total_weight_grams',(select coalesce(sum(coalesce(weight_grams,0)::bigint*quantity),0)from public.packing_items where trip_id=p_trip and bag_id=b.id and deleted_at is null))order by b.sort_order,b.id)from public.packing_bags b where b.trip_id=p_trip and b.deleted_at is null),'[]'::jsonb),
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
  when p_result->>'kind'='packing-bag' then family_auth.packing_bag_can_read((p_result->>'target_id')::uuid,true) and p_result->'scope' is not distinct from family_auth.packing_scope((p_result->>'trip_id')::uuid)
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
 if found and r.action in('bag-create','bag-update','bag-members','bag-trash-empty','bag-restore','group-packed-state','group-trash','clear-completed','category-rename','category-assignees','category-create','category-retain','category-dismiss-empty','category-restore-empty','category-item-create','category-item-move','category-reorder','category-trash-batch','category-restore-batch') then
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
  or exists(select 1 from public.packing_bags where deleted_by_person_id=old.id)
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
alter table family_auth.packing_command_receipts drop constraint packing_command_receipts_action_check,add constraint packing_command_receipts_action_check check(((action = ANY (ARRAY['create'::text, 'update'::text, 'packed-state'::text, 'reorder'::text, 'trash'::text, 'restore'::text, 'group-packed-state'::text, 'group-trash'::text, 'clear-completed'::text, 'category-rename'::text, 'category-assignees'::text, 'category-create'::text, 'category-retain'::text, 'category-dismiss-empty'::text, 'category-restore-empty'::text, 'category-item-create'::text, 'category-item-move'::text, 'category-reorder'::text, 'category-trash-batch'::text, 'category-restore-batch'::text])))or action in('bag-create','bag-update','bag-members','bag-trash-empty','bag-restore'));
create function family_auth.validate_packing_bag_request(p_action text,p_values jsonb)returns void
language plpgsql immutable set search_path=''as $$
declare k text;x jsonb;person uuid;prior uuid;
begin
 if p_action is null or p_action not in('bag-create','bag-update','bag-members','bag-trash-empty','bag-restore')or jsonb_typeof(p_values)is distinct from'object'then raise exception 'Exact bag action and values required'using errcode='22023';end if;
 if octet_length(p_values::text)>1048576 then raise exception 'Bag values exceed byte bound'using errcode='54000';end if;
 if p_action in('bag-create','bag-update')then
  if p_values-array['name','color','weight_limit_grams']<>'{}'::jsonb or(p_action='bag-create'and not(p_values?'name'))or(p_action='bag-update'and p_values='{}'::jsonb)then raise exception 'Exact bag content fields required'using errcode='22023';end if;
  if p_values?'name'and(jsonb_typeof(p_values->'name')is distinct from'string'or char_length(p_values->>'name')not between 1 and 500 or p_values->>'name'<>btrim(p_values->>'name'))then raise exception 'New bag name must be trimmed and bounded'using errcode='22023';end if;
  if p_values?'color'and p_values->'color'<>'null'::jsonb and(jsonb_typeof(p_values->'color')is distinct from'string'or p_values->>'color'!~'^#[0-9A-Fa-f]{6}$')then raise exception 'Bag color must be null or hex'using errcode='22023';end if;
  if p_values?'weight_limit_grams'and p_values->'weight_limit_grams'<>'null'::jsonb and(jsonb_typeof(p_values->'weight_limit_grams')is distinct from'number'or p_values->>'weight_limit_grams'!~'^[0-9]{1,8}$')then raise exception 'Bag limit must be integer grams'using errcode='22023';end if;
  if p_values?'weight_limit_grams'and p_values->'weight_limit_grams'<>'null'::jsonb and(p_values->>'weight_limit_grams')::bigint not between 1 and 10000000 then raise exception 'Bag limit exceeds range'using errcode='22023';end if;
 elsif p_action='bag-members'then
  if p_values-array['person_ids']<>'{}'::jsonb or jsonb_typeof(p_values->'person_ids')is distinct from'array'then raise exception 'Exact carrier set required'using errcode='22023';end if;
  if jsonb_array_length(p_values->'person_ids')>2000 then raise exception 'Carrier set exceeds bound'using errcode='54000';end if;
  for x in select value from jsonb_array_elements(p_values->'person_ids')loop
   if jsonb_typeof(x)is distinct from'string'then raise exception 'Canonical Person UUID required'using errcode='22023';end if;
   begin person:=(x#>>'{}')::uuid;exception when invalid_text_representation then raise exception 'Canonical Person UUID required'using errcode='22023';end;
   if person::text<>x#>>'{}'or(prior is not null and person<=prior)then raise exception 'Sorted unique canonical Person UUIDs required'using errcode='22023';end if;prior:=person;
  end loop;
 elsif p_values<>'{}'::jsonb then raise exception 'Bag lifecycle action takes no values'using errcode='22023';end if;
end $$;
create function family_auth.packing_bag_execute_entry(p_trip uuid,p_operation uuid,p_scope jsonb,p_action text,p_target uuid,p_expected_revision bigint,p_expected_collection_revision bigint,p_observed jsonb,p_values jsonb)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare t public.trips%rowtype;b public.packing_bags%rowtype;receipt family_auth.packing_command_receipts%rowtype;
 actor uuid;collection bigint;intent bytea;before_bag jsonb;after_bag jsonb;desired uuid[];additions uuid[];r jsonb;changed boolean:=false;next_rank bigint;
begin
 if p_trip is null or p_operation is null or p_target is null or jsonb_typeof(p_scope)is distinct from'object'or octet_length(p_scope::text)>4096 or p_expected_collection_revision is null or p_expected_collection_revision not between 0 and 9007199254740991 then raise exception 'Complete observed bag command required'using errcode='22023';end if;
 perform family_auth.validate_packing_bag_request(p_action,p_values);
 if p_action='bag-create'then
  if p_expected_revision is not null or p_observed is not null then raise exception 'Create requires a fresh bag identity without observation'using errcode='22023';end if;
 else
  if p_expected_revision is null or p_expected_revision not between 1 and 9007199254740991 or jsonb_typeof(p_observed)is distinct from'object'or not(p_observed ?& array['version','kind','scope','collection_revision','bag','member_person_ids'])or p_observed-array['version','kind','scope','collection_revision','bag','member_person_ids']<>'{}'::jsonb then raise exception 'Original complete bag observation required'using errcode='22023';end if;
  if octet_length(p_observed::text)>1048576 then raise exception 'Bag observation exceeds bound'using errcode='54000';end if;
 end if;
 if octet_length(jsonb_build_array(p_trip,p_operation,p_scope,p_action,p_target,p_expected_revision,p_expected_collection_revision,p_observed,p_values)::text)>1048576 then raise exception 'Bag command exceeds bound'using errcode='54000';end if;
 perform family_auth.packing_require(p_trip,true);
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
 perform 1 from public.trips where id=p_trip for no key update;
 t:=family_auth.packing_require(p_trip,true);actor:=family_auth.actor_person_id(t.family_id);
 select collection_revision into collection from family_auth.trip_packing_state where trip_id=p_trip for update;
 if collection is null then raise exception 'Packing initialization missing'using errcode='23514';end if;
 if p_scope is distinct from family_auth.packing_scope(p_trip)then raise exception 'Original packing scope or Trip lifecycle changed'using errcode='PT409';end if;
 intent:=sha256(convert_to(jsonb_build_array('packing-bag-v1',p_scope,p_action,p_target,p_expected_revision,p_expected_collection_revision,p_observed,p_values)::text,'UTF8'));
 select * into receipt from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if receipt.action not in('bag-create','bag-update','bag-members','bag-trash-empty','bag-restore')or receipt.request_sha256<>intent then raise exception 'Packing operation reused with changed domain or intent'using errcode='PT409';end if;
  if not family_auth.packing_result_visible(receipt.result)then raise exception 'Original bag result no longer visible; reconcile receipt'using errcode='42501';end if;return receipt.result;
 end if;
 if collection<>p_expected_collection_revision then raise exception 'Packing collection changed'using errcode='PT409';end if;
 select * into b from public.packing_bags where id=p_target for update;
 if p_action='bag-create'then
  if b.id is not null then raise exception 'Bag identity already exists'using errcode='PT409';end if;
  before_bag:=null;
  select coalesce(max(sort_order)::bigint,-1)+1 into next_rank from public.packing_bags where trip_id=p_trip and deleted_at is null;
  if next_rank>2147483647 then raise exception 'Bag order exceeds safe bound'using errcode='54000';end if;
  insert into public.packing_bags(id,trip_id,name,color,weight_limit_grams,sort_order)values(p_target,p_trip,p_values->>'name',p_values->>'color',(p_values->>'weight_limit_grams')::integer,next_rank::integer)returning * into b;changed:=true;
 else
  if b.id is null or b.trip_id<>p_trip then raise exception 'Bag unavailable in this Trip'using errcode='42501';end if;
  if(p_action='bag-restore')<>(b.deleted_at is not null)then raise exception 'Bag lifecycle changed'using errcode='PT409';end if;
  perform 1 from public.packing_bag_members where bag_id=b.id order by person_id for update;
  before_bag:=family_auth.packing_bag_observation(p_trip,p_target,true);
  if b.revision<>p_expected_revision or before_bag is distinct from p_observed then raise exception 'Original bag observation changed'using errcode='PT409';end if;
  case p_action
  when'bag-update'then
   changed:=(p_values?'name'and b.name is distinct from p_values->>'name')or(p_values?'color'and b.color is distinct from p_values->>'color')or(p_values?'weight_limit_grams'and b.weight_limit_grams is distinct from(p_values->>'weight_limit_grams')::integer);
   if changed then update public.packing_bags set name=case when p_values?'name'then p_values->>'name'else name end,color=case when p_values?'color'then p_values->>'color'else color end,weight_limit_grams=case when p_values?'weight_limit_grams'then(p_values->>'weight_limit_grams')::integer else weight_limit_grams end where id=b.id;end if;
  when'bag-members'then
   select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[])into desired from jsonb_array_elements_text(p_values->'person_ids');
   select coalesce(array_agg(p order by p),'{}'::uuid[])into additions from unnest(desired)p where not exists(select 1 from public.packing_bag_members m where m.bag_id=b.id and m.person_id=p);
   if exists(select 1 from unnest(additions)person where not exists(select 1 from public.people p join public.trip_travelers v on v.person_id=p.id and v.trip_id=p_trip where p.id=person and p.family_id=t.family_id and p.archived_at is null and(p.user_id is null or exists(select 1 from public.family_members m where m.family_id=t.family_id and m.user_id=p.user_id and m.status='active'))))then raise exception 'New carrier requires an eligible Trip traveler'using errcode='22023';end if;
   changed:=to_jsonb(desired)is distinct from before_bag->'member_person_ids';
   if changed then
    delete from public.packing_bag_members where bag_id=b.id and not(person_id=any(desired));
    insert into public.packing_bag_members(trip_id,bag_id,person_id)select p_trip,b.id,person from unnest(additions)person order by person;
   end if;
  when'bag-trash-empty'then
   perform 1 from public.packing_items where trip_id=p_trip and bag_id=b.id order by id for update;
   if exists(select 1 from public.packing_items where trip_id=p_trip and bag_id=b.id and deleted_at is null)then raise exception 'Bag has live dependencies; remove them before Trash'using errcode='PT409';end if;
   update public.packing_bags set deleted_at=clock_timestamp(),deleted_by_person_id=actor where id=b.id;changed:=true;
  when'bag-restore'then update public.packing_bags set deleted_at=null,deleted_by_person_id=null where id=b.id;changed:=true;
  end case;
 end if;
 perform family_auth.packing_require(p_trip,true);
 perform family_auth.packing_bags_entry(p_trip);
 after_bag:=family_auth.packing_bag_observation(p_trip,p_target,true);
 select collection_revision into collection from family_auth.trip_packing_state where trip_id=p_trip;
 r:=jsonb_build_object('version',1,'kind','packing-bag','trip_id',p_trip,'operation_id',p_operation,'scope',p_scope,'action',p_action,'target_id',p_target,'values',p_values,'collection_revision',collection,'changed',changed,'bag',after_bag->'bag','member_person_ids',after_bag->'member_person_ids');
 if octet_length(r::text)>1048576 then raise exception 'Bag receipt exceeds byte bound'using errcode='54000';end if;
 insert into family_auth.packing_command_receipts(trip_id,actor_user_id,actor_person_id,operation_id,action,target_id,category_id,request_sha256,before_state,after_state,result)values(p_trip,auth.uid(),actor,p_operation,p_action,p_target,null,intent,jsonb_build_object('bag',before_bag),jsonb_build_object('bag',after_bag),r)returning * into receipt;
 if octet_length(to_jsonb(receipt)::text)>1048576 then raise exception 'Complete bag receipt exceeds byte bound'using errcode='54000';end if;
 return r;
end $$;
create function family_auth.packing_bag_receipt_entry(p_trip uuid,p_operation uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare r family_auth.packing_command_receipts%rowtype;scope jsonb;redacted boolean;
begin
 perform family_auth.packing_require(p_trip,true);
 if p_operation is null then raise exception 'Original operation UUID required'using errcode='22023';end if;
 scope:=family_auth.packing_scope(p_trip);
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.action not in('bag-create','bag-update','bag-members','bag-trash-empty','bag-restore')then raise exception 'Use the original packing receipt domain'using errcode='22023';end if;
  if r.result->'scope'->'person_id'is distinct from scope->'person_id'then raise exception 'Receipt belongs to another Person context'using errcode='PT409';end if;
 end if;
 redacted:=r.operation_id is not null and not family_auth.packing_result_visible(r.result);
 return jsonb_build_object('version',1,'kind','packing-bag','trip_id',p_trip,'operation_id',p_operation,'scope',scope,'status',case when r.operation_id is null then'unknown'else'committed'end,'result_redacted',redacted,'result',case when redacted then null else r.result end);
end $$;
create function public.get_family_trip_packing_bags_v1(p_trip_id uuid)returns jsonb language sql stable security invoker set search_path=''as $$select family_auth.packing_bags_entry(p_trip_id);$$;
create function public.get_family_trip_packing_bag_v1(p_trip_id uuid,p_bag_id uuid,p_include_deleted boolean default false)returns jsonb language sql stable security invoker set search_path=''as $$select family_auth.packing_bag_observation(p_trip_id,p_bag_id,p_include_deleted);$$;
create function public.list_family_trip_packing_bag_trash_v1(p_trip_id uuid,p_limit integer default 50,p_before_deleted_at timestamptz default null,p_before_id uuid default null)returns jsonb language sql stable security invoker set search_path=''as $$select family_auth.packing_bag_trash_entry(p_trip_id,p_limit,p_before_deleted_at,p_before_id);$$;
create function public.execute_family_trip_packing_bag_v1(p_trip_id uuid,p_operation_id uuid,p_scope jsonb,p_action text,p_target_id uuid,p_expected_revision bigint,p_expected_collection_revision bigint,p_observed jsonb,p_values jsonb)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.packing_bag_execute_entry(p_trip_id,p_operation_id,p_scope,p_action,p_target_id,p_expected_revision,p_expected_collection_revision,p_observed,p_values);$$;
create function public.get_family_trip_packing_bag_receipt_v1(p_trip_id uuid,p_operation_id uuid)returns jsonb language sql stable security invoker set search_path=''as $$select family_auth.packing_bag_receipt_entry(p_trip_id,p_operation_id);$$;
-- Explicit ACLs for newly introduced objects only; existing grants stay unchanged.
do $acl$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p where p.prokind='f'and p.pronamespace in('public'::regnamespace,'family_auth'::regnamespace)and p.proname in(
 'packing_bag_can_read','tg_packing_bag_version','tg_packing_bag_member','tg_packing_bag_member_revision','tg_packing_item_active_bag','packing_bag_json','packing_bag_members_json','packing_bag_observation','packing_bags_entry','packing_bag_trash_entry','validate_packing_bag_request','packing_bag_execute_entry','packing_bag_receipt_entry',
 'get_family_trip_packing_bags_v1','get_family_trip_packing_bag_v1','list_family_trip_packing_bag_trash_v1','execute_family_trip_packing_bag_v1','get_family_trip_packing_bag_receipt_v1')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname in('packing_bag_can_read','packing_bag_observation','packing_bags_entry','packing_bag_trash_entry','packing_bag_execute_entry','packing_bag_receipt_entry','get_family_trip_packing_bags_v1','get_family_trip_packing_bag_v1','list_family_trip_packing_bag_trash_v1','execute_family_trip_packing_bag_v1','get_family_trip_packing_bag_receipt_v1')then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end $acl$;
comment on function public.execute_family_trip_packing_bag_v1(uuid,uuid,jsonb,text,uuid,bigint,bigint,jsonb,jsonb)is 'Observed Trip-owned bags, differential carriers and empty-only recoverable Trash; no native activation.';
notify pgrst,'reload schema';
commit;
