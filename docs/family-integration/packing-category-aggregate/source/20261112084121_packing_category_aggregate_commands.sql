-- U04-C3c: complete category lanes and operation-bound aggregate recovery.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
lock table public.trips,family_auth.trip_packing_state,public.packing_categories,
 public.packing_items,public.packing_category_assignments,public.packing_item_recipients,
 public.packing_item_contributors,family_auth.packing_command_receipts in access exclusive mode;
do $pin$begin
if(select count(*)from supabase_migrations.schema_migrations)<>124 then raise exception 'Reviewed124 ledger required'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_receipt_entry(uuid,uuid)'::regprocedure),'UTF8')),'hex')<>'aec8e3a9850f7b61c4076cbd07e07cf90ae9c0a371d8f935658c7c27ef163093'then raise exception 'Reviewed124 function drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_result_visible(jsonb)'::regprocedure),'UTF8')),'hex')<>'9242f92eb03ebd3419c4df947ae0506964086d6c66c969570f03c0fd652b729b'then raise exception 'Reviewed124 function drift'using errcode='22023';end if;
end $pin$;
alter table family_auth.packing_command_receipts
 drop constraint packing_command_receipts_action_check,
 add constraint packing_command_receipts_action_check check(action in('create','update','packed-state','reorder','trash','restore','group-packed-state','group-trash','clear-completed','category-rename','category-assignees','category-create','category-retain','category-dismiss-empty','category-restore-empty','category-item-create','category-item-move','category-reorder','category-trash-batch','category-restore-batch')),
 drop constraint packing_command_receipts_check,
 add constraint packing_command_receipts_check check((action in('reorder','group-packed-state','group-trash','clear-completed','category-reorder'))=(target_id is null)),
 drop constraint packing_receipt_category_domain,
 add constraint packing_receipt_category_domain check(case
 when action in('category-rename','category-assignees','category-create','category-retain','category-dismiss-empty','category-restore-empty','category-trash-batch','category-restore-batch')then category_id is not null and target_id=category_id
 when action in('category-item-create','category-item-move')then category_id is not null and target_id is not null
 else category_id is null end);
alter table family_auth.packing_command_receipts add constraint packing_receipt_aggregate_domain check(case when action in('category-reorder','category-trash-batch','category-restore-batch')then(
 result->'version'='3'::jsonb and result->>'kind'='packing-category-aggregate'and result->>'action'=action
 and result->>'trip_id'=trip_id::text and result->>'operation_id'=operation_id::text
 and result->'target_id'=coalesce(to_jsonb(target_id),'null'::jsonb))is true else true end);

create table family_auth.packing_category_batches(
 trip_id uuid not null,
 actor_user_id uuid not null,
 operation_id uuid not null,
 category_id uuid not null,
 deleted_at timestamptz not null check(isfinite(deleted_at)),
 category_revision bigint not null check(category_revision between 1 and 9007199254740991),
 restored_at timestamptz check(restored_at is null or isfinite(restored_at)),
 restored_by_user_id uuid,
 restored_operation_id uuid,
 primary key(trip_id,actor_user_id,operation_id),
 foreign key(trip_id,actor_user_id,operation_id)references family_auth.packing_command_receipts(trip_id,actor_user_id,operation_id)on delete restrict deferrable initially deferred,
 foreign key(trip_id,category_id)references public.packing_categories(trip_id,id)on delete restrict,
 foreign key(trip_id,restored_by_user_id,restored_operation_id)references family_auth.packing_command_receipts(trip_id,actor_user_id,operation_id)on delete restrict deferrable initially deferred,
 check((restored_at is null)=(restored_by_user_id is null)and(restored_at is null)=(restored_operation_id is null))
);
create unique index packing_category_batch_unresolved_idx on family_auth.packing_category_batches(trip_id,category_id)where restored_at is null;
create index packing_category_batch_restore_receipt_idx on family_auth.packing_category_batches(trip_id,restored_by_user_id,restored_operation_id)where restored_operation_id is not null;
create table family_auth.packing_category_batch_items(
 trip_id uuid not null,
 actor_user_id uuid not null,
 operation_id uuid not null,
 item_id uuid not null,
 deleted_revision bigint not null check(deleted_revision between 1 and 9007199254740991),
 primary key(trip_id,actor_user_id,operation_id,item_id),
 foreign key(trip_id,actor_user_id,operation_id)references family_auth.packing_category_batches(trip_id,actor_user_id,operation_id)on delete restrict,
 foreign key(trip_id,item_id)references public.packing_items(trip_id,id)on delete restrict
);
create index packing_category_batch_item_history_idx on family_auth.packing_category_batch_items(trip_id,item_id);
alter table family_auth.packing_category_batches enable row level security;
alter table family_auth.packing_category_batches force row level security;
alter table family_auth.packing_category_batch_items enable row level security;
alter table family_auth.packing_category_batch_items force row level security;
revoke all on family_auth.packing_category_batches,family_auth.packing_category_batch_items from public,anon,authenticated,service_role;

create function family_auth.packing_batch_item_state(p_item public.packing_items)returns jsonb
language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('row',to_jsonb(p_item),
 'recipients',coalesce((select jsonb_agg(to_jsonb(r)order by r.person_id)from public.packing_item_recipients r where r.trip_id=p_item.trip_id and r.item_id=p_item.id),'[]'::jsonb),
 'contributors',coalesce((select jsonb_agg(to_jsonb(r)order by r.person_id)from public.packing_item_contributors r where r.trip_id=p_item.trip_id and r.item_id=p_item.id),'[]'::jsonb));
$$;
create function family_auth.packing_batch_key(p_trip uuid,p_user uuid,p_operation uuid)returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('actor_user_id',p_user,'operation_id',p_operation,'item_count',(select count(*)from family_auth.packing_category_batch_items where trip_id=p_trip and actor_user_id=p_user and operation_id=p_operation));
$$;
create function family_auth.packing_aggregate_bound(p_result jsonb)returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if octet_length(p_result::text)>8388608 then raise exception 'Category aggregate exceeds byte bound'using errcode='54000';end if;
 return p_result;
end $$;
create function family_auth.packing_category_lane_v3_entry(p_trip uuid,p_visibility text)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype;owner uuid;result jsonb;
begin
 t:=family_auth.packing_category_require_v2(p_trip,true,statement_timestamp());
 if p_visibility is null or p_visibility not in('common','personal')then raise exception 'Exact category lane required'using errcode='22023';end if;
 owner:=case when p_visibility='personal'then family_auth.actor_person_id(t.family_id)else null end;
 if(select count(*)from public.packing_categories c where c.trip_id=p_trip and c.deleted_at is null and c.owner_person_id is not distinct from owner
 and(c.retained_when_empty or exists(select 1 from public.packing_items i where i.category_id=c.id and i.deleted_at is null)))>2000 then raise exception 'Category lane exceeds bound'using errcode='54000';end if;
 select jsonb_build_object('version',3,'kind','packing-category-lane','scope',family_auth.packing_scope(p_trip),
 'collection_revision',(select collection_revision from family_auth.trip_packing_state where trip_id=p_trip),'lane',p_visibility,'owner_person_id',owner,
 'categories',coalesce(jsonb_agg(family_auth.packing_category_json_v2(c)order by c.sort_order,c.id),'[]'::jsonb))into result
 from public.packing_categories c where c.trip_id=p_trip and c.deleted_at is null and c.owner_person_id is not distinct from owner
 and(c.retained_when_empty or exists(select 1 from public.packing_items i where i.category_id=c.id and i.deleted_at is null));
 return family_auth.packing_aggregate_bound(result);
end $$;
create function family_auth.packing_category_aggregate_v3_entry(p_trip uuid,p_category uuid,p_include_deleted boolean)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype;c public.packing_categories%rowtype;b family_auth.packing_category_batches%rowtype;result jsonb;items jsonb;
begin
 t:=family_auth.packing_category_require_v2(p_trip,true,statement_timestamp());
 if p_category is null or p_include_deleted is null then raise exception 'Category identity and lifecycle selection required'using errcode='22023';end if;
 select * into c from public.packing_categories where trip_id=p_trip and id=p_category;
 if c.id is null or(c.owner_person_id is not null and c.owner_person_id is distinct from family_auth.actor_person_id(t.family_id))then raise exception 'Category unavailable in this authoring scope'using errcode='42501';end if;
 if(c.deleted_at is not null)is distinct from p_include_deleted then raise exception 'Category lifecycle selection changed'using errcode='PT409';end if;
 select * into b from family_auth.packing_category_batches where trip_id=p_trip and category_id=c.id and restored_at is null;
 if p_include_deleted and b.operation_id is not null then
  select coalesce(jsonb_agg(family_auth.packing_item_json(i)order by i.id),'[]'::jsonb)into items from public.packing_items i join family_auth.packing_category_batch_items m on(m.trip_id,m.item_id)=(i.trip_id,i.id)
  where(m.trip_id,m.actor_user_id,m.operation_id)=(b.trip_id,b.actor_user_id,b.operation_id);
 else
  select coalesce(jsonb_agg(family_auth.packing_item_json(i)order by i.id),'[]'::jsonb)into items from public.packing_items i where i.trip_id=p_trip and i.category_id=c.id and i.deleted_at is null;
 end if;
 if jsonb_array_length(items)>2000 then raise exception 'Category members exceed bound'using errcode='54000';end if;
 result:=jsonb_build_object('version',3,'kind','packing-category-observation','scope',family_auth.packing_scope(p_trip),
 'collection_revision',(select collection_revision from family_auth.trip_packing_state where trip_id=p_trip),'category',family_auth.packing_category_json_v2(c),'items',items,
 'batch',case when b.operation_id is null then null else family_auth.packing_batch_key(p_trip,b.actor_user_id,b.operation_id)end);
 return family_auth.packing_aggregate_bound(result);
end $$;
create function family_auth.packing_category_batches_v3_entry(p_trip uuid,p_limit integer,p_before_deleted_at timestamptz,p_before_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype;actor uuid;rows jsonb;cursor jsonb;
begin
 t:=family_auth.packing_category_require_v2(p_trip,true,statement_timestamp());actor:=family_auth.actor_person_id(t.family_id);
 if p_limit is null or p_limit not between 1 and 100 or(p_before_deleted_at is null)<>(p_before_id is null)or(p_before_deleted_at is not null and not isfinite(p_before_deleted_at))then raise exception 'Bounded page and paired finite cursor required'using errcode='22023';end if;
 with candidates as materialized(select c.* from public.packing_categories c where c.trip_id=p_trip and c.deleted_at is not null and(c.owner_person_id is null or c.owner_person_id=actor)
 and(p_before_deleted_at is null or(c.deleted_at,c.id)<(p_before_deleted_at,p_before_id))order by c.deleted_at desc,c.id desc limit p_limit+1),
 page as materialized(select * from candidates order by deleted_at desc,id desc limit p_limit)
 select coalesce((select jsonb_agg(jsonb_build_object('category',family_auth.packing_category_json_v2(c::public.packing_categories),'batch',
 (select family_auth.packing_batch_key(p_trip,b.actor_user_id,b.operation_id)from family_auth.packing_category_batches b where b.trip_id=p_trip and b.category_id=c.id and b.restored_at is null),
 'item_count',(select count(*)from family_auth.packing_category_batch_items m join family_auth.packing_category_batches b using(trip_id,actor_user_id,operation_id)where b.trip_id=p_trip and b.category_id=c.id and b.restored_at is null))order by c.deleted_at desc,c.id desc)from page c),'[]'::jsonb),
 case when(select count(*)from candidates)>p_limit then(select jsonb_build_object('deleted_at',deleted_at,'id',id)from page order by deleted_at,id limit 1)else null end into rows,cursor;
 return family_auth.packing_aggregate_bound(jsonb_build_object('version',3,'kind','packing-category-trash','scope',family_auth.packing_scope(p_trip),
 'collection_revision',(select collection_revision from family_auth.trip_packing_state where trip_id=p_trip),'categories',rows,'next_cursor',cursor));
end $$;
create function family_auth.packing_batch_assert_item(p_trip uuid,p_item uuid)returns void
language plpgsql volatile security definer set search_path='' as $$
declare m record;i public.packing_items%rowtype;expected jsonb;
begin
 for m in select x.*,b.category_id,r.after_state from family_auth.packing_category_batch_items x
 join family_auth.packing_category_batches b using(trip_id,actor_user_id,operation_id)
 join family_auth.packing_command_receipts r using(trip_id,actor_user_id,operation_id)
 where x.trip_id=p_trip and x.item_id=p_item and b.restored_at is null loop
  select * into i from public.packing_items where trip_id=p_trip and id=p_item;
  expected:=m.after_state->'items'->p_item::text;
  if i.id is null or i.deleted_at is null or i.category_id is distinct from m.category_id or i.revision<>m.deleted_revision
  or expected is null or family_auth.packing_batch_item_state(i)is distinct from expected then
   raise exception 'Unresolved category batch requires its exact deleted members'using errcode='PT409';end if;
 end loop;
end $$;
create function family_auth.packing_batch_assert_category(p_trip uuid,p_category uuid)returns void
language plpgsql volatile security definer set search_path='' as $$
declare c public.packing_categories%rowtype;b record;
begin
 select x.*,r.after_state into b from family_auth.packing_category_batches x join family_auth.packing_command_receipts r using(trip_id,actor_user_id,operation_id)
 where x.trip_id=p_trip and x.category_id=p_category and x.restored_at is null;
 if not found then return;end if;
 select * into c from public.packing_categories where trip_id=p_trip and id=p_category;
 if c.id is null or c.deleted_at is distinct from b.deleted_at or c.revision<>b.category_revision
 or family_auth.packing_category_json_v2(c)is distinct from b.after_state->'category'then
  raise exception 'Unresolved category batch requires its exact deleted category and responsibility'using errcode='PT409';end if;
end $$;
create function family_auth.packing_batch_assert(p_trip uuid,p_user uuid,p_operation uuid)returns void
language plpgsql volatile security definer set search_path='' as $$
declare b family_auth.packing_category_batches%rowtype;r family_auth.packing_command_receipts%rowtype;s family_auth.packing_command_receipts%rowtype;
 expected jsonb;restored jsonb;member record;key jsonb;cat jsonb;previous jsonb;
begin
 select * into b from family_auth.packing_category_batches where(trip_id,actor_user_id,operation_id)=(p_trip,p_user,p_operation);
 if not found then raise exception 'Category batch identity missing'using errcode='23514';end if;
 select * into r from family_auth.packing_command_receipts where(trip_id,actor_user_id,operation_id)=(p_trip,p_user,p_operation);
 expected:=r.after_state->'items';cat:=r.after_state->'category';
 if r.operation_id is null or r.action is distinct from'category-trash-batch'or r.category_id is distinct from b.category_id
 or jsonb_typeof(expected)is distinct from'object'or cat->>'id'is distinct from b.category_id::text
 or cat->'revision'is distinct from to_jsonb(b.category_revision)or(cat->>'deleted_at')::timestamptz is distinct from b.deleted_at
 or cat->>'deleted_by_person_id'is distinct from r.actor_person_id::text
 or r.result->'category'is distinct from cat then raise exception 'Category batch requires its typed immutable Trash receipt'using errcode='23514';end if;
 if(select count(*)from family_auth.packing_category_batch_items where(trip_id,actor_user_id,operation_id)=(p_trip,p_user,p_operation))<>(select count(*)from jsonb_object_keys(expected))then
  raise exception 'Category batch membership must be complete'using errcode='23514';end if;
 for member in select * from family_auth.packing_category_batch_items where(trip_id,actor_user_id,operation_id)=(p_trip,p_user,p_operation)loop
  if expected->member.item_id::text->'row'->>'id'is distinct from member.item_id::text
  or expected->member.item_id::text->'row'->>'trip_id'is distinct from p_trip::text
  or expected->member.item_id::text->'row'->>'category_id'is distinct from b.category_id::text
  or expected->member.item_id::text->'row'->'revision'is distinct from to_jsonb(member.deleted_revision)
  or (expected->member.item_id::text->'row'->>'deleted_at')::timestamptz is distinct from b.deleted_at
  or expected->member.item_id::text->'row'->>'deleted_by_person_id' is distinct from r.actor_person_id::text then
   raise exception 'Category batch member is not in its exact Trash manifest'using errcode='23514';end if;
  if b.restored_at is null then perform family_auth.packing_batch_assert_item(p_trip,member.item_id);end if;
 end loop;
 if b.restored_at is null then perform family_auth.packing_batch_assert_category(p_trip,b.category_id);return;end if;
 -- Resolving a header is not an escape hatch: require a complete typed restore proof.
 select * into s from family_auth.packing_command_receipts where(trip_id,actor_user_id,operation_id)=(p_trip,b.restored_by_user_id,b.restored_operation_id);
 key:=family_auth.packing_batch_key(p_trip,p_user,p_operation);restored:=s.after_state->'items';previous:=s.after_state->'category';
 if s.operation_id is null or s.action is distinct from'category-restore-batch'or s.category_id is distinct from b.category_id
 or s.before_state->'batch'is distinct from key or s.before_state->'category'is distinct from cat or s.before_state->'items'is distinct from expected
 or jsonb_typeof(restored)is distinct from'object'or(select count(*)from jsonb_object_keys(restored))<>(select count(*)from jsonb_object_keys(expected))
 or previous->'deleted_at'is distinct from'null'::jsonb or previous->'deleted_by_person_id'is distinct from'null'::jsonb
 or previous->'revision'is distinct from to_jsonb(b.category_revision+1)
 or(previous-array['deleted_at','deleted_by_person_id','revision','updated_at'])is distinct from(cat-array['deleted_at','deleted_by_person_id','revision','updated_at'])
 or s.result->'category'is distinct from previous then raise exception 'Category recovery requires the complete original batch proof'using errcode='23514';end if;
 for member in select * from family_auth.packing_category_batch_items where(trip_id,actor_user_id,operation_id)=(p_trip,p_user,p_operation)loop
  if restored->member.item_id::text is null
  or restored->member.item_id::text->'row'->'deleted_at'is distinct from'null'::jsonb
  or restored->member.item_id::text->'row'->'deleted_by_person_id'is distinct from'null'::jsonb
  or restored->member.item_id::text->'row'->'revision'is distinct from to_jsonb(member.deleted_revision+1)
  or((restored->member.item_id::text->'row')-array['deleted_at','deleted_by_person_id','revision','updated_at'])is distinct from((expected->member.item_id::text->'row')-array['deleted_at','deleted_by_person_id','revision','updated_at'])
  or restored->member.item_id::text->'recipients'is distinct from expected->member.item_id::text->'recipients'
  or restored->member.item_id::text->'contributors'is distinct from expected->member.item_id::text->'contributors'then
   raise exception 'Category recovery cannot omit or overwrite an original member'using errcode='23514';end if;
 end loop;
end $$;
create function family_auth.tg_packing_batch_identity()returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE'then raise exception 'Category batch history is permanent'using errcode='0A000';end if;
 if tg_op='INSERT'then
  if new.restored_at is not null then raise exception 'A new category batch must be unresolved'using errcode='23514';end if;
 else
  if(to_jsonb(new)-array['restored_at','restored_by_user_id','restored_operation_id'])is distinct from(to_jsonb(old)-array['restored_at','restored_by_user_id','restored_operation_id'])then
   raise exception 'Category batch identity and manifest facts are immutable'using errcode='23514';end if;
  if to_jsonb(new)is not distinct from to_jsonb(old)then return null;end if;
  if old.restored_at is not null or new.restored_at is null then raise exception 'Category batch recovery is one irreversible transition'using errcode='PT409';end if;
 end if;
 return new;
end $$;
create function family_auth.tg_packing_batch_guard()returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE'then to_jsonb(old)else to_jsonb(new)end;prior jsonb:=case when tg_op='UPDATE'then to_jsonb(old)else null end;trip uuid:=(row_data->>'trip_id')::uuid;proof record;actual_category jsonb;actual_items jsonb;
begin
 case tg_table_name
 when'packing_category_batches'then perform family_auth.packing_batch_assert(trip,(row_data->>'actor_user_id')::uuid,(row_data->>'operation_id')::uuid);
  -- Check current restored rows once, at the unresolved -> resolved transition.
  -- Completed historical batches must not freeze legitimate later edits.
  if tg_op='UPDATE' and prior->'restored_at'='null'::jsonb and row_data->'restored_at'<>'null'::jsonb then
   select r.after_state,b.category_id into proof from family_auth.packing_category_batches b
    join family_auth.packing_command_receipts r on (r.trip_id,r.actor_user_id,r.operation_id)=(b.trip_id,b.restored_by_user_id,b.restored_operation_id)
    where (b.trip_id,b.actor_user_id,b.operation_id)=(trip,(row_data->>'actor_user_id')::uuid,(row_data->>'operation_id')::uuid);
   select family_auth.packing_category_json_v2(c) into actual_category from public.packing_categories c where c.trip_id=trip and c.id=proof.category_id;
   select coalesce(jsonb_object_agg(i.id::text,family_auth.packing_batch_item_state(i)),'{}'::jsonb) into actual_items
    from family_auth.packing_category_batch_items m join public.packing_items i on(i.trip_id,i.id)=(m.trip_id,m.item_id)
    where(m.trip_id,m.actor_user_id,m.operation_id)=(trip,(row_data->>'actor_user_id')::uuid,(row_data->>'operation_id')::uuid);
   if actual_category is distinct from proof.after_state->'category' or actual_items is distinct from proof.after_state->'items' then
    raise exception 'Category batch resolution must actually restore its complete original rows' using errcode='23514';end if;
  end if;
 when'packing_category_batch_items'then
  if not exists(select 1 from family_auth.packing_command_receipts r where(r.trip_id,r.actor_user_id,r.operation_id)=(trip,(row_data->>'actor_user_id')::uuid,(row_data->>'operation_id')::uuid)
   and r.action='category-trash-batch'and r.after_state->'items'->(row_data->>'item_id')->'row'->'revision'=row_data->'deleted_revision')then
   raise exception 'Category batch member is not receipt-bound'using errcode='23514';end if;
  perform family_auth.packing_batch_assert_item(trip,(row_data->>'item_id')::uuid);
 when'packing_categories'then perform family_auth.packing_batch_assert_category(trip,(row_data->>'id')::uuid);
 when'packing_category_assignments'then
  perform family_auth.packing_batch_assert_category(trip,(row_data->>'category_id')::uuid);
  if prior is not null then perform family_auth.packing_batch_assert_category((prior->>'trip_id')::uuid,(prior->>'category_id')::uuid);end if;
 when'packing_items'then perform family_auth.packing_batch_assert_item(trip,(row_data->>'id')::uuid);
 else
  perform family_auth.packing_batch_assert_item(trip,(row_data->>'item_id')::uuid);
  if prior is not null then perform family_auth.packing_batch_assert_item((prior->>'trip_id')::uuid,(prior->>'item_id')::uuid);end if;
 end case;
 return null;
end $$;
create trigger packing_category_batch_identity before insert or update or delete on family_auth.packing_category_batches for each row execute function family_auth.tg_packing_batch_identity();
create trigger packing_category_batch_member_immutable before update or delete on family_auth.packing_category_batch_items for each row execute function family_auth.tg_immutable_visit_classification();
create constraint trigger packing_category_batch_complete after insert or update on family_auth.packing_category_batches deferrable initially deferred for each row execute function family_auth.tg_packing_batch_guard();
create constraint trigger packing_category_batch_member_complete after insert on family_auth.packing_category_batch_items deferrable initially deferred for each row execute function family_auth.tg_packing_batch_guard();
create constraint trigger packing_category_pending_batch after update or delete on public.packing_categories deferrable initially deferred for each row execute function family_auth.tg_packing_batch_guard();
create constraint trigger packing_category_assignment_pending_batch after insert or update or delete on public.packing_category_assignments deferrable initially deferred for each row execute function family_auth.tg_packing_batch_guard();
create constraint trigger packing_item_pending_batch after update or delete on public.packing_items deferrable initially deferred for each row execute function family_auth.tg_packing_batch_guard();
create constraint trigger packing_recipient_pending_batch after insert or update or delete on public.packing_item_recipients deferrable initially deferred for each row execute function family_auth.tg_packing_batch_guard();
create constraint trigger packing_contributor_pending_batch after insert or update or delete on public.packing_item_contributors deferrable initially deferred for each row execute function family_auth.tg_packing_batch_guard();

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
create function family_auth.validate_packing_aggregate_request(p_action text,p_target uuid,p_observed jsonb,p_values jsonb)returns void
language plpgsql immutable set search_path='' as $$
begin
 if p_action is null or p_action not in('category-reorder','category-trash-batch','category-restore-batch')or jsonb_typeof(p_observed)is distinct from'object'or jsonb_typeof(p_values)is distinct from'object'then
  raise exception 'Exact category aggregate action and observations required'using errcode='22023';end if;
 if octet_length(p_observed::text)>8388608 or octet_length(p_values::text)>262144 then raise exception 'Category aggregate request exceeds byte bound'using errcode='54000';end if;
 if p_observed->'version'is distinct from'3'::jsonb then raise exception 'Original version3 observation required'using errcode='22023';end if;
 if p_action='category-reorder'then
  if p_target is not null or p_observed-array['version','kind','scope','collection_revision','lane','owner_person_id','categories']<>'{}'::jsonb
  or not(p_observed ?& array['version','kind','scope','collection_revision','lane','owner_person_id','categories'])or p_observed->>'kind'is distinct from'packing-category-lane'
  or jsonb_typeof(p_observed->'categories')is distinct from'array'or p_observed->>'lane'not in('common','personal')
  or p_values-array['ordered_ids']<>'{}'::jsonb or jsonb_typeof(p_values->'ordered_ids')is distinct from'array'then raise exception 'Exact complete lane and permutation required'using errcode='22023';end if;
  if jsonb_array_length(p_values->'ordered_ids')>2000 or jsonb_array_length(p_observed->'categories')>2000 then raise exception 'Category lane exceeds count bound'using errcode='54000';end if;
  if exists(select 1 from jsonb_array_elements(p_values->'ordered_ids')x where jsonb_typeof(x)is distinct from'string'or(x#>>'{}')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')then raise exception 'Canonical category UUID permutation required'using errcode='22023';end if;
 else
  if p_target is null or p_values<>'{}'::jsonb or p_observed-array['version','kind','scope','collection_revision','category','items','batch']<>'{}'::jsonb
  or not(p_observed ?& array['version','kind','scope','collection_revision','category','items','batch'])or p_observed->>'kind'is distinct from'packing-category-observation'
  or jsonb_typeof(p_observed->'category')is distinct from'object'or jsonb_typeof(p_observed->'items')is distinct from'array'then raise exception 'Exact original category and full member set required'using errcode='22023';end if;
  if jsonb_array_length(p_observed->'items')>2000 then raise exception 'Category members exceed count bound'using errcode='54000';end if;
 end if;
end $$;
create function family_auth.packing_category_aggregate_execute_v3_entry(p_trip uuid,p_operation uuid,p_scope jsonb,p_action text,p_target uuid,p_expected_collection_revision bigint,p_observed jsonb,p_values jsonb)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare t public.trips%rowtype;c public.packing_categories%rowtype;r family_auth.packing_command_receipts%rowtype;b family_auth.packing_category_batches%rowtype;
 actor uuid;revision bigint;intent bytea;live jsonb;before_state jsonb;after_state jsonb;result jsonb;items jsonb;key jsonb;before_items jsonb;after_items jsonb;
 lane text;ordered uuid[];original_ids uuid[];item_ids uuid[];entry record;stamp timestamptz;changed boolean:=true;
begin
 if p_trip is null or p_operation is null or jsonb_typeof(p_scope)is distinct from'object'or octet_length(p_scope::text)>4096
 or p_expected_collection_revision is null or p_expected_collection_revision not between 0 and 9007199254740991 then raise exception 'Complete original category aggregate command required'using errcode='22023';end if;
 perform family_auth.validate_packing_aggregate_request(p_action,p_target,p_observed,p_values);
 perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
 perform 1 from public.trips where id=p_trip for no key update;
 t:=family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());actor:=family_auth.actor_person_id(t.family_id);
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip for update;
 if revision is null then raise exception 'Packing initialization missing'using errcode='23514';end if;
 if p_scope is distinct from family_auth.packing_scope(p_trip)then raise exception 'Original packing scope or Trip lifecycle changed'using errcode='PT409';end if;
 intent:=sha256(convert_to(jsonb_build_array('packing-category-aggregate-v3',p_scope,p_action,p_target,p_expected_collection_revision,p_observed,p_values)::text,'UTF8'));
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.action not in('category-reorder','category-trash-batch','category-restore-batch')or r.request_sha256<>intent then raise exception 'Packing operation reused with changed domain or intent'using errcode='PT409';end if;
  if not family_auth.packing_result_visible(r.result)then raise exception 'Original packing result no longer visible; reconcile its receipt'using errcode='42501';end if;
  return r.result;
 end if;
 if revision<>p_expected_collection_revision then raise exception 'Packing collection changed'using errcode='PT409';end if;
 if p_action='category-reorder'then
  lane:=p_observed->>'lane';live:=family_auth.packing_category_lane_v3_entry(p_trip,lane);
  perform 1 from public.packing_categories where trip_id=p_trip and id in(select(x->>'id')::uuid from jsonb_array_elements(live->'categories')x)order by id for update;
  perform 1 from public.packing_category_assignments where trip_id=p_trip and category_id in(select(x->>'id')::uuid from jsonb_array_elements(live->'categories')x)order by category_id,person_id for update;
  perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());live:=family_auth.packing_category_lane_v3_entry(p_trip,lane);
  if live is distinct from p_observed then raise exception 'Original complete category lane changed'using errcode='PT409';end if;
  select coalesce(array_agg(x::uuid order by n),'{}'::uuid[])into ordered from jsonb_array_elements_text(p_values->'ordered_ids')with ordinality z(x,n);
  select coalesce(array_agg((x->>'id')::uuid order by n),'{}'::uuid[])into original_ids from jsonb_array_elements(live->'categories')with ordinality z(x,n);
  if cardinality(ordered)<>cardinality(original_ids)or cardinality(ordered)<>(select count(distinct x)from unnest(ordered)x)
  or(select array_agg(x order by x)from unnest(ordered)x)is distinct from(select array_agg(x order by x)from unnest(original_ids)x)then raise exception 'Category order must be an exact full-lane permutation'using errcode='22023';end if;
  changed:=ordered is distinct from original_ids;
  before_state:=jsonb_build_object('lane',lane,'categories',live->'categories','collection_revision',revision);
  if changed then
   for entry in select x,n-1 position from unnest(ordered)with ordinality z(x,n)loop
    update public.packing_categories set sort_order=entry.position where trip_id=p_trip and id=entry.x and sort_order<>entry.position;
   end loop;
  end if;
  live:=family_auth.packing_category_lane_v3_entry(p_trip,lane);select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip;
  after_state:=jsonb_build_object('lane',lane,'categories',live->'categories','collection_revision',revision);
  result:=jsonb_build_object('version',3,'kind','packing-category-aggregate','trip_id',p_trip,'operation_id',p_operation,'scope',p_scope,'action',p_action,'target_id',null,
   'values',p_values,'collection_revision',revision,'changed',changed,'lane',lane,'categories',live->'categories');
 else
  select * into c from public.packing_categories where trip_id=p_trip and id=p_target for update;
  if c.id is null or(c.owner_person_id is not null and c.owner_person_id is distinct from actor)then raise exception 'Category unavailable in this authoring scope'using errcode='42501';end if;
  select * into b from family_auth.packing_category_batches where trip_id=p_trip and category_id=c.id and restored_at is null for update;
  if p_action='category-trash-batch'then
   if c.deleted_at is not null then raise exception 'Category is already in Trash'using errcode='PT409';end if;
   select coalesce(array_agg(id order by id),'{}'::uuid[])into item_ids from public.packing_items where trip_id=p_trip and category_id=c.id and deleted_at is null;
  else
   if c.deleted_at is null then raise exception 'Category is not in Trash'using errcode='PT409';end if;
   if b.operation_id is null then raise exception 'Use the existing empty-category recovery contract'using errcode='0A000';end if;
   select coalesce(array_agg(item_id order by item_id),'{}'::uuid[])into item_ids from family_auth.packing_category_batch_items where(trip_id,actor_user_id,operation_id)=(b.trip_id,b.actor_user_id,b.operation_id);
  end if;
  perform 1 from public.packing_items where trip_id=p_trip and id=any(item_ids)order by id for update;
  perform 1 from public.packing_item_recipients where trip_id=p_trip and item_id=any(item_ids)order by item_id,person_id for update;
  perform 1 from public.packing_item_contributors where trip_id=p_trip and item_id=any(item_ids)order by item_id,person_id for update;
  perform 1 from public.packing_category_assignments where trip_id=p_trip and category_id=c.id order by person_id for update;
  perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
  live:=family_auth.packing_category_aggregate_v3_entry(p_trip,c.id,p_action='category-restore-batch');
  if live is distinct from p_observed then raise exception 'Original category, membership or recovery observation changed'using errcode='PT409';end if;
  if p_action='category-restore-batch'then perform family_auth.packing_batch_assert(p_trip,b.actor_user_id,b.operation_id);end if;
  if c.revision>=9007199254740991 or exists(select 1 from public.packing_items pi where pi.id=any(item_ids)and pi.revision>=9007199254740991)then raise exception 'Packing revision exceeds safe bound'using errcode='54000';end if;
  select coalesce(jsonb_object_agg(i.id::text,family_auth.packing_batch_item_state(i)),'{}'::jsonb)into before_items from public.packing_items i where i.trip_id=p_trip and i.id=any(item_ids);
  key:=case when p_action='category-trash-batch'then jsonb_build_object('actor_user_id',auth.uid(),'operation_id',p_operation,'item_count',cardinality(item_ids))else family_auth.packing_batch_key(p_trip,b.actor_user_id,b.operation_id)end;
  before_state:=jsonb_build_object('category',family_auth.packing_category_json_v2(c),'items',before_items,'batch',case when p_action='category-trash-batch'then null else key end,'collection_revision',revision);
  if p_action='category-trash-batch'then
   stamp:=clock_timestamp();
   for entry in select unnest(item_ids)id loop update public.packing_items set deleted_at=stamp,deleted_by_person_id=actor where id=entry.id;end loop;
   update public.packing_categories set deleted_at=stamp,deleted_by_person_id=actor where id=c.id returning * into c;
   insert into family_auth.packing_category_batches(trip_id,actor_user_id,operation_id,category_id,deleted_at,category_revision)values(p_trip,auth.uid(),p_operation,c.id,c.deleted_at,c.revision);
   insert into family_auth.packing_category_batch_items(trip_id,actor_user_id,operation_id,item_id,deleted_revision)
    select p_trip,auth.uid(),p_operation,pi.id,pi.revision from public.packing_items pi where pi.trip_id=p_trip and pi.id=any(item_ids);
  else
   update public.packing_categories set deleted_at=null,deleted_by_person_id=null where id=c.id returning * into c;
   for entry in select unnest(item_ids)id loop update public.packing_items set deleted_at=null,deleted_by_person_id=null where id=entry.id;end loop;
   update family_auth.packing_category_batches set restored_at=clock_timestamp(),restored_by_user_id=auth.uid(),restored_operation_id=p_operation where(trip_id,actor_user_id,operation_id)=(b.trip_id,b.actor_user_id,b.operation_id);
  end if;
  select coalesce(jsonb_object_agg(i.id::text,family_auth.packing_batch_item_state(i)),'{}'::jsonb),coalesce(jsonb_agg(family_auth.packing_item_json(i)order by i.id),'[]'::jsonb)into after_items,items from public.packing_items i where i.trip_id=p_trip and i.id=any(item_ids);
  if c.revision not between 1 and 9007199254740991 or exists(select 1 from public.packing_items pi where pi.id=any(item_ids)and pi.revision not between 1 and 9007199254740991)then raise exception 'Packing revision exceeds safe bound'using errcode='54000';end if;
  select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip;
  after_state:=jsonb_build_object('category',family_auth.packing_category_json_v2(c),'items',after_items,'batch',key,'collection_revision',revision);
  result:=jsonb_build_object('version',3,'kind','packing-category-aggregate','trip_id',p_trip,'operation_id',p_operation,'scope',p_scope,'action',p_action,'target_id',c.id,
   'values',p_values,'collection_revision',revision,'changed',true,'category',family_auth.packing_category_json_v2(c),'items',items,'batch',key);
 end if;
 perform family_auth.packing_with_categories_v2_entry(p_trip);
 perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
 if revision not between 0 and 9007199254740991 then raise exception 'Packing collection revision exceeds safe bound'using errcode='54000';end if;
 if p_scope is distinct from family_auth.packing_scope(p_trip)then raise exception 'Original packing Person or Trip context changed'using errcode='PT409';end if;
 if octet_length(before_state::text)+octet_length(after_state::text)>16777216 then raise exception 'Category aggregate history exceeds byte bound'using errcode='54000';end if;
 result:=family_auth.packing_aggregate_bound(result);
 insert into family_auth.packing_command_receipts(trip_id,actor_user_id,actor_person_id,operation_id,action,target_id,category_id,request_sha256,before_state,after_state,result)
 values(p_trip,auth.uid(),actor,p_operation,p_action,p_target,case when p_action='category-reorder'then null else p_target end,intent,before_state,after_state,result);
 if p_action='category-trash-batch'then perform family_auth.packing_batch_assert(p_trip,auth.uid(),p_operation);
 elsif p_action='category-restore-batch'then perform family_auth.packing_batch_assert(p_trip,b.actor_user_id,b.operation_id);end if;
 return result;
end $$;
create function family_auth.packing_category_aggregate_receipt_v3_entry(p_trip uuid,p_operation uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r family_auth.packing_command_receipts%rowtype;redacted boolean;
begin
 perform family_auth.packing_category_require_v2(p_trip,true,statement_timestamp());
 if p_operation is null then raise exception 'Original operation UUID required'using errcode='22023';end if;
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found and r.action not in('category-reorder','category-trash-batch','category-restore-batch')then raise exception 'Use the original typed packing receipt'using errcode='22023';end if;
 if r.operation_id is not null and r.result->'scope'->'person_id'is distinct from family_auth.packing_scope(p_trip)->'person_id'then raise exception 'Receipt belongs to another Person context'using errcode='PT409';end if;
 redacted:=r.operation_id is not null and not family_auth.packing_result_visible(r.result);
 return family_auth.packing_aggregate_bound(jsonb_build_object('version',3,'kind','packing-category-aggregate','trip_id',p_trip,'operation_id',p_operation,
 'scope',family_auth.packing_scope(p_trip),'status',case when r.operation_id is null then'unknown'else'committed'end,'result_redacted',redacted,'result',case when redacted then null else r.result end));
end $$;
create function public.get_family_trip_packing_category_lane_v3(p_trip_id uuid,p_visibility text)returns jsonb
language sql stable security invoker set search_path='' as $$select family_auth.packing_category_lane_v3_entry(p_trip_id,p_visibility);$$;
create function public.get_family_trip_packing_category_aggregate_v3(p_trip_id uuid,p_category_id uuid,p_include_deleted boolean default false)returns jsonb
language sql stable security invoker set search_path='' as $$select family_auth.packing_category_aggregate_v3_entry(p_trip_id,p_category_id,p_include_deleted);$$;
create function public.list_family_trip_packing_category_batches_v3(p_trip_id uuid,p_limit integer default 50,p_before_deleted_at timestamptz default null,p_before_id uuid default null)returns jsonb
language sql stable security invoker set search_path='' as $$select family_auth.packing_category_batches_v3_entry(p_trip_id,p_limit,p_before_deleted_at,p_before_id);$$;
create function public.execute_family_trip_packing_category_aggregate_v3(p_trip_id uuid,p_operation_id uuid,p_scope jsonb,p_action text,p_target_id uuid,p_expected_collection_revision bigint,p_observed jsonb,p_values jsonb)returns jsonb
language sql volatile security invoker set search_path='' as $$select family_auth.packing_category_aggregate_execute_v3_entry(p_trip_id,p_operation_id,p_scope,p_action,p_target_id,p_expected_collection_revision,p_observed,p_values);$$;
create function public.get_family_trip_packing_category_aggregate_receipt_v3(p_trip_id uuid,p_operation_id uuid)returns jsonb
language sql stable security invoker set search_path='' as $$select family_auth.packing_category_aggregate_receipt_v3_entry(p_trip_id,p_operation_id);$$;
do $grants$declare f record;begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where(n.nspname='family_auth'and p.proname in('packing_batch_item_state','packing_batch_key','packing_aggregate_bound','packing_category_lane_v3_entry','packing_category_aggregate_v3_entry','packing_category_batches_v3_entry','packing_batch_assert_item','packing_batch_assert_category','packing_batch_assert','tg_packing_batch_identity','tg_packing_batch_guard','validate_packing_aggregate_request','packing_category_aggregate_execute_v3_entry','packing_category_aggregate_receipt_v3_entry'))
 or(n.nspname='public'and p.proname in('get_family_trip_packing_category_lane_v3','get_family_trip_packing_category_aggregate_v3','list_family_trip_packing_category_batches_v3','execute_family_trip_packing_category_aggregate_v3','get_family_trip_packing_category_aggregate_receipt_v3'))loop
  execute format('alter function %s owner to postgres',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.nspname='public'or f.proname in('packing_category_lane_v3_entry','packing_category_aggregate_v3_entry','packing_category_batches_v3_entry','packing_category_aggregate_execute_v3_entry','packing_category_aggregate_receipt_v3_entry')then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end $grants$;
notify pgrst,'reload schema';
commit;
