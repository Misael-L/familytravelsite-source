-- U04-C3a: empty-category retention, observed lifecycle and strict versioned reads.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
lock table public.trips, family_auth.trip_packing_state, public.packing_categories,
 public.packing_category_assignments, public.packing_items, public.packing_category_assignees,
 family_auth.packing_command_receipts in access exclusive mode;
do $pin$begin
if(select count(*)from supabase_migrations.schema_migrations)<>122 then raise exception 'Expected reviewed122 migration ledger'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_person_context()'::regprocedure), 'UTF8')),'hex')<>'93dd081198b60c272fb114e53315547bcb2ab87d86a35be658b3e988cdd9fdaa'then raise exception 'Reviewed122 function drift: tg_packing_person_context'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_category_identity()'::regprocedure), 'UTF8')),'hex')<>'f5a449bdf489126d5a6b198ca876bfbd61f0c08804e948e7055d6e6d481f0272'then raise exception 'Reviewed122 function drift: tg_packing_category_identity'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_category_resolve(uuid,uuid,text)'::regprocedure), 'UTF8')),'hex')<>'f7cad2c66be3b41e0ec96a9e43e8b2c425fa4a80b86f790710de6f27b3059bd8'then raise exception 'Reviewed122 function drift: packing_category_resolve'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_category_link()'::regprocedure), 'UTF8')),'hex')<>'9174d57d9193288c83b16bbdc8f678439e145300904fea98a2a1f0d690c80c45'then raise exception 'Reviewed122 function drift: tg_packing_category_link'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_category_changed()'::regprocedure), 'UTF8')),'hex')<>'c8500e51b51c4da6a87d2a3c1c1992d9d390ef71c0d295e62037e64be3d6fcb9'then raise exception 'Reviewed122 function drift: tg_packing_category_changed'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_snapshot(uuid)'::regprocedure), 'UTF8')),'hex')<>'46ab55c3ed762dcbc51bd6b2a391ddb99f49c0f773d3752745c07aea401feebe'then raise exception 'Reviewed122 function drift: packing_snapshot'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_category_execute_entry(uuid,uuid,jsonb,text,bigint,jsonb,jsonb)'::regprocedure), 'UTF8')),'hex')<>'d196d971b089aa5bbfdf790822e41c51de033ab9a8cf504105eae72033a31daa'then raise exception 'Reviewed122 function drift: packing_category_execute_entry'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_category_receipt_entry(uuid,uuid)'::regprocedure), 'UTF8')),'hex')<>'6f9d7b6272e9e5a4d9558b7c62f3b987fde7fb9fa034505fdb6448df4032d804'then raise exception 'Reviewed122 function drift: packing_category_receipt_entry'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_receipt_entry(uuid,uuid)'::regprocedure), 'UTF8')),'hex')<>'fac478f3ddc1d8d324a04347c107e3a0cc0ab229aaa49d59177ca4d8df2a8c0b'then raise exception 'Reviewed122 function drift: packing_receipt_entry'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_result_visible(jsonb)'::regprocedure), 'UTF8')),'hex')<>'dfd7aeb814a1cfb54b656a3bd31e2588e282e8e8647e7bd3a11369232c016f91'then raise exception 'Reviewed122 function drift: packing_result_visible'using errcode='22023';end if;
end $pin$;
alter table public.packing_categories
 add column retained_when_empty boolean not null default true,
 add column sort_order bigint not null default 0 check(sort_order between 0 and 9007199254740991),
 add column deleted_at timestamptz,
 add column deleted_by_person_id uuid references public.people(id)on delete restrict,
 add constraint packing_category_deletion_pair check((deleted_at is null)=(deleted_by_person_id is null));
-- Initialize metadata only. No old identity, revision, timestamp, item or audit is rewritten.
alter table public.packing_categories disable trigger a1_packing_category_identity;
alter table public.packing_categories disable trigger aa_trip_aggregate_child;
alter table public.packing_categories disable trigger packing_category_changed;
with ranked as(
 select c.id,a.id is not null retained,row_number()over(partition by c.trip_id,c.owner_person_id
 order by case when a.id is not null then 0 when h.id is not null then 1 else 2 end,
 coalesce(a.sort_order,h.sort_order),coalesce(a.id,h.id),c.created_at,c.id)-1 position
 from public.packing_categories c
 left join lateral(select i.id,i.sort_order from public.packing_items i where i.category_id=c.id and i.deleted_at is null order by i.sort_order,i.id limit 1)a on true
 left join lateral(select i.id,i.sort_order from public.packing_items i where i.category_id=c.id order by i.sort_order,i.id limit 1)h on true)
update public.packing_categories c set retained_when_empty=r.retained,sort_order=r.position from ranked r where r.id=c.id;
alter table public.packing_categories enable trigger a1_packing_category_identity;
alter table public.packing_categories enable trigger aa_trip_aggregate_child;
alter table public.packing_categories enable trigger packing_category_changed;
create index packing_categories_active_order_idx on public.packing_categories(trip_id,owner_person_id,sort_order,id)where deleted_at is null;
create index packing_categories_deleted_actor_idx on public.packing_categories(deleted_by_person_id)where deleted_by_person_id is not null;
create index packing_categories_trash_idx on public.packing_categories(trip_id,deleted_at desc,id desc)where deleted_at is not null;

create or replace function family_auth.tg_packing_category_identity()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE'then raise exception 'Packing category permanent deletion is unavailable'using errcode='0A000';end if;
 if new.owner_person_id is not null and not exists(select 1 from public.people p join public.trips t on t.family_id=p.family_id where p.id=new.owner_person_id and t.id=new.trip_id)then
  raise exception 'Category owner must belong to this Family'using errcode='23503';end if;
 if new.deleted_by_person_id is not null and not exists(select 1 from public.people p join public.trips t on t.family_id=p.family_id where p.id=new.deleted_by_person_id and t.id=new.trip_id)then
  raise exception 'Category lifecycle actor must belong to this Family'using errcode='23503';end if;
 if new.deleted_at is not null and not isfinite(new.deleted_at)then raise exception 'Finite lifecycle timestamp required'using errcode='22023';end if;
 if new.deleted_at is not null and exists(select 1 from public.packing_items where category_id=new.id and deleted_at is null)then
  raise exception 'Category still contains active items'using errcode='PT409';end if;
 if tg_op='INSERT'then new.revision:=1;
 else
  if(new.id,new.trip_id,new.owner_person_id,new.created_at)is distinct from(old.id,old.trip_id,old.owner_person_id,old.created_at)then raise exception 'Category identity is immutable'using errcode='23514';end if;
  if new.revision<>old.revision then raise exception 'Category revision is server managed'using errcode='23514';end if;
  if(new.name,new.retained_when_empty,new.sort_order,new.deleted_at,new.deleted_by_person_id)is not distinct from(old.name,old.retained_when_empty,old.sort_order,old.deleted_at,old.deleted_by_person_id)then return null;end if;
  if old.revision>=9007199254740991 then raise exception 'Category revision exceeds bound'using errcode='54000';end if;
  new.revision:=old.revision+1;new.updated_at:=clock_timestamp();
 end if;
 return new;
end $$;

create function family_auth.packing_category_next_order(p_trip uuid,p_owner uuid)returns bigint
language plpgsql volatile security definer set search_path='' as $$
declare position bigint;
begin
 -- Entry commands take these locks before any child row. Legacy callers already hold them.
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
 perform 1 from public.trips where id=p_trip for no key update;
 perform 1 from family_auth.trip_packing_state where trip_id=p_trip for update;
 if not found then raise exception 'Packing scope initialization missing'using errcode='23514';end if;
 select coalesce(max(sort_order),-1)+1 into position from public.packing_categories where trip_id=p_trip and owner_person_id is not distinct from p_owner;
 if position>9007199254740991 then raise exception 'Category order exceeds bound'using errcode='54000';end if;
 return position;
end $$;
create or replace function family_auth.packing_category_resolve(p_trip uuid,p_owner uuid,p_name text)returns uuid language plpgsql security definer set search_path='' as $$
declare c public.packing_categories%rowtype;position bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
 perform 1 from public.trips where id=p_trip for no key update;
 perform 1 from family_auth.trip_packing_state where trip_id=p_trip for update;
 select * into c from public.packing_categories where trip_id=p_trip and owner_person_id is not distinct from p_owner and name=p_name collate "C" for update;
 if found then
  if c.deleted_at is not null then raise exception 'Restore the original category before adding items'using errcode='PT409';end if;
  return c.id;
 end if;
 position:=family_auth.packing_category_next_order(p_trip,p_owner);
 insert into public.packing_categories(trip_id,owner_person_id,name,sort_order)values(p_trip,p_owner,p_name,position)returning * into c;
 return c.id;
end $$;
create or replace function family_auth.tg_packing_category_link()returns trigger language plpgsql security definer set search_path='' as $$
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
end $$;
CREATE OR REPLACE FUNCTION family_auth.tg_packing_category_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 -- Category identity survives a name change; immutable Trash rows retain their historical compatibility text.
 if tg_table_name='packing_categories'then
  if tg_op='UPDATE'then
   if new.name is distinct from old.name collate "C"then
  update public.packing_items set category=new.name where category_id=new.id and deleted_at is null and category is distinct from new.name collate "C";
  if new.owner_person_id is null then update public.packing_category_assignees set category_name=new.name where trip_id=new.trip_id and category_name=old.name collate "C";end if;
   end if;
  end if;
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
  'category_assignees',coalesce((select jsonb_object_agg(category_name,people)from(select category_name,jsonb_agg(person_id order by person_id)people from(select c.name category_name,a.person_id from public.packing_category_assignments a join public.packing_categories c on c.id=a.category_id and c.trip_id=a.trip_id where a.trip_id=p_trip and c.deleted_at is null)cq group by category_name)x),'{}'::jsonb),
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
 if c.deleted_at is not null then raise exception 'Restore the original category before metadata editing'using errcode='PT409';end if;
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
  if r.action not in('category-rename','category-assignees')then raise exception 'Use the original packing receipt domain'using errcode='22023';end if;
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


drop trigger packing_category_changed on public.packing_categories;
create trigger packing_category_changed after insert or update on public.packing_categories for each row execute function family_auth.tg_packing_category_changed();
alter table family_auth.packing_command_receipts
 drop constraint packing_command_receipts_action_check,
 add constraint packing_command_receipts_action_check check(action in('create','update','packed-state','reorder','trash','restore','group-packed-state','group-trash','clear-completed','category-rename','category-assignees','category-create','category-retain','category-dismiss-empty','category-restore-empty')),
 drop constraint packing_receipt_category_domain,
 add constraint packing_receipt_category_domain check(case when action in('category-rename','category-assignees','category-create','category-retain','category-dismiss-empty','category-restore-empty')then category_id is not null and target_id=category_id else category_id is null end);

-- Auth-issued JWTs carry session_id. Recheck it so a still-valid revoked JWT cannot write/read the new lifecycle APIs.
-- Trusted SQL role rehearsals without an Auth session claim retain their existing explicit role/assurance contract.
create function family_auth.packing_category_require_v2(p_trip uuid,p_write boolean,p_checked_at timestamptz)returns public.trips
language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype;session_text text:=auth.jwt()->>'session_id';session_id uuid;
begin
 t:=family_auth.packing_require(p_trip,p_write);
 if session_text is not null then
  begin session_id:=session_text::uuid;
  exception when invalid_text_representation then raise exception 'Current Auth session required'using errcode='42501';end;
  if not exists(select 1 from auth.sessions s where s.id=session_id and s.user_id=auth.uid()and(s.not_after is null or s.not_after>p_checked_at))then raise exception 'Current Auth session required'using errcode='42501';end if;
 end if;
 return t;
end $$;
create function family_auth.packing_category_json_v2(p_category public.packing_categories)returns jsonb
language sql stable security definer set search_path='' as $$
 select family_auth.packing_category_json(p_category)||jsonb_build_object('retained_when_empty',p_category.retained_when_empty,'sort_order',p_category.sort_order,'deleted_at',p_category.deleted_at,'deleted_by_person_id',p_category.deleted_by_person_id);
$$;
create function family_auth.packing_categories_bound_v2(p_result jsonb)returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if octet_length(p_result::text)>8388608 or coalesce(jsonb_array_length(p_result->'categories'),0)>2000 or coalesce(jsonb_array_length(p_result->'people'),0)>2000
 or exists(select 1 from jsonb_array_elements(coalesce(p_result->'categories','[]'::jsonb))c where jsonb_array_length(c->'assignments')>2000)
 or coalesce(jsonb_array_length(p_result->'category'->'assignments'),0)>2000 then raise exception 'Packing category response exceeds bound'using errcode='54000';end if;
 return p_result;
end $$;
create function family_auth.packing_with_categories_v2_entry(p_trip uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;actor uuid;t public.trips%rowtype;
begin
 t:=family_auth.packing_category_require_v2(p_trip,false,statement_timestamp());actor:=family_auth.actor_person_id(t.family_id);
 with packet as materialized(select family_auth.packing_snapshot(p_trip)p),
 items as materialized(select i.id,i.category_id from public.packing_items i where i.trip_id=p_trip and i.deleted_at is null and family_auth.packing_can_read(i.id,false)),
 categories as materialized(select c.* from public.packing_categories c where c.trip_id=p_trip and c.deleted_at is null and(c.id in(select category_id from items)or(c.retained_when_empty and(c.owner_person_id is null or c.owner_person_id=actor)))),
 persons as(select owner_person_id id from categories where owner_person_id is not null union select a.person_id from public.packing_category_assignments a where a.trip_id=p_trip and a.category_id in(select id from categories)union select a.assigned_by_person_id from public.packing_category_assignments a where a.trip_id=p_trip and a.category_id in(select id from categories)and a.assigned_by_person_id is not null union select deleted_by_person_id from categories where deleted_by_person_id is not null)
 select jsonb_build_object('version',2,'scope',p->'scope','collection_revision',p->'collection_revision','packing',p,
 'categories',coalesce((select jsonb_agg(family_auth.packing_category_json_v2(c::public.packing_categories)order by c.owner_person_id nulls first,c.sort_order,c.id)from categories c),'[]'::jsonb),
 'item_categories',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'category_id',i.category_id)order by i.id)from items i),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',person.id,'display_name',person.display_name,'is_guest',person.user_id is null,'eligible',
 person.archived_at is null and exists(select 1 from public.trip_travelers v where v.trip_id=p_trip and v.person_id=person.id)and(person.user_id is null or exists(select 1 from public.family_members m where m.family_id=person.family_id and m.user_id=person.user_id and m.status='active')))order by person.id)
 from public.people person where person.family_id=t.family_id and person.id in(select id from persons)),'[]'::jsonb))into result from packet;
 return family_auth.packing_categories_bound_v2(result);
end $$;
create function family_auth.packing_category_lookup_v2_entry(p_trip uuid,p_visibility text,p_name text)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype;c public.packing_categories%rowtype;actor uuid;
begin
 t:=family_auth.packing_category_require_v2(p_trip,true,statement_timestamp());actor:=family_auth.actor_person_id(t.family_id);
 if p_visibility is null or p_visibility not in('common','personal')or p_name is null or char_length(p_name)>200 then raise exception 'Exact category lane and bounded raw name required'using errcode='22023';end if;
 select * into c from public.packing_categories where trip_id=p_trip and owner_person_id is not distinct from(case when p_visibility='personal'then actor else null end)and name=p_name collate "C";
 return family_auth.packing_categories_bound_v2(jsonb_build_object('version',2,'scope',family_auth.packing_scope(p_trip),'collection_revision',(select collection_revision from family_auth.trip_packing_state where trip_id=p_trip),'category',case when c.id is null then null else family_auth.packing_category_json_v2(c)end));
end $$;
create function family_auth.packing_category_trash_v2_entry(p_trip uuid,p_limit integer,p_before_deleted_at timestamptz,p_before_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype;actor uuid;rows jsonb;cursor jsonb;
begin
 t:=family_auth.packing_category_require_v2(p_trip,true,statement_timestamp());actor:=family_auth.actor_person_id(t.family_id);
 if p_limit is null or p_limit not between 1 and 100 or(p_before_deleted_at is null)<>(p_before_id is null)or(p_before_deleted_at is not null and not isfinite(p_before_deleted_at))then raise exception 'Bounded page with paired finite cursor required'using errcode='22023';end if;
 with candidates as materialized(select c.* from public.packing_categories c where c.trip_id=p_trip and c.deleted_at is not null and(c.owner_person_id is null or c.owner_person_id=actor)
 and(p_before_deleted_at is null or(c.deleted_at,c.id)<(p_before_deleted_at,p_before_id))order by c.deleted_at desc,c.id desc limit p_limit+1),
 page as materialized(select * from candidates order by deleted_at desc,id desc limit p_limit)
 select coalesce((select jsonb_agg(family_auth.packing_category_json_v2(c::public.packing_categories)order by c.deleted_at desc,c.id desc)from page c),'[]'::jsonb),
 case when(select count(*)from candidates)>p_limit then(select jsonb_build_object('deleted_at',deleted_at,'id',id)from page order by deleted_at,id limit 1)else null end into rows,cursor;
 return family_auth.packing_categories_bound_v2(jsonb_build_object('version',2,'kind','packing-category-trash','scope',family_auth.packing_scope(p_trip),'collection_revision',(select collection_revision from family_auth.trip_packing_state where trip_id=p_trip),'categories',rows,'next_cursor',cursor));
end $$;

create function family_auth.validate_packing_category_lifecycle_v2(p_action text,p_observed jsonb,p_values jsonb)returns void
language plpgsql stable set search_path='' as $$
declare stamp timestamptz;ident uuid;
begin
 if p_action is null or p_action not in('category-create','category-retain','category-dismiss-empty','category-restore-empty')or jsonb_typeof(p_values)is distinct from'object'then raise exception 'Exact lifecycle action and values required'using errcode='22023';end if;
 if octet_length(p_values::text)>262144 or coalesce(octet_length(p_observed::text),0)>262144 then raise exception 'Lifecycle request exceeds bound'using errcode='54000';end if;
 if p_action='category-create'then
  if(p_observed is not null and p_observed<>'null'::jsonb)or p_values-array['name','visibility']<>'{}'::jsonb or not(p_values ?& array['name','visibility'])or jsonb_typeof(p_values->'name')is distinct from'string'
  or char_length(p_values->>'name')not between 1 and 200 or btrim(p_values->>'name')=''or p_values->>'visibility'not in('common','personal')or jsonb_typeof(p_values->'visibility')is distinct from'string'then raise exception 'Exact bounded new category name and lane required'using errcode='22023';end if;
 else
  if p_values<>'{}'::jsonb or jsonb_typeof(p_observed)is distinct from'object'or not(p_observed ?& array['retained_when_empty','sort_order','deleted_at','deleted_by_person_id'])
  or jsonb_typeof(p_observed->'retained_when_empty')is distinct from'boolean'or jsonb_typeof(p_observed->'sort_order')is distinct from'number'or(p_observed->>'sort_order')!~'^(0|[1-9][0-9]{0,15})$'then raise exception 'Exact original lifecycle category required'using errcode='22023';end if;
  if(p_observed->>'sort_order')::numeric>9007199254740991 then raise exception 'Safe original category order required'using errcode='22023';end if;
  perform family_auth.validate_packing_category_request('category-rename',p_observed-array['retained_when_empty','sort_order','deleted_at','deleted_by_person_id'],jsonb_build_object('name','validation-only'));
  if(p_observed->'deleted_at'='null'::jsonb)<>(p_observed->'deleted_by_person_id'='null'::jsonb)then raise exception 'Paired original lifecycle facts required'using errcode='22023';end if;
  if p_observed->'deleted_at'<>'null'::jsonb then
   if jsonb_typeof(p_observed->'deleted_at')is distinct from'string'or jsonb_typeof(p_observed->'deleted_by_person_id')is distinct from'string'then raise exception 'Original lifecycle facts required'using errcode='22023';end if;
   begin stamp:=(p_observed->>'deleted_at')::timestamptz;ident:=(p_observed->>'deleted_by_person_id')::uuid;
   exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'Valid lifecycle facts required'using errcode='22023';end;
   if not isfinite(stamp)or ident::text<>p_observed->>'deleted_by_person_id'then raise exception 'Canonical finite lifecycle facts required'using errcode='22023';end if;
  end if;
 end if;
end $$;
create function family_auth.packing_category_lifecycle_v2_entry(p_trip uuid,p_operation uuid,p_scope jsonb,p_action text,p_target uuid,p_expected_collection_revision bigint,p_observed_category jsonb,p_values jsonb)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare t public.trips%rowtype;c public.packing_categories%rowtype;r family_auth.packing_command_receipts%rowtype;actor uuid;owner uuid;revision bigint;intent bytea;before_category jsonb;after_category jsonb;result jsonb;changed boolean:=false;position bigint;
begin
 if p_trip is null or p_operation is null or p_target is null or jsonb_typeof(p_scope)is distinct from'object'or octet_length(p_scope::text)>4096 or p_expected_collection_revision is null or p_expected_collection_revision not between 0 and 9007199254740991 then raise exception 'Complete observed lifecycle command required'using errcode='22023';end if;
 perform family_auth.validate_packing_category_lifecycle_v2(p_action,p_observed_category,p_values);
 perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
 perform 1 from public.trips where id=p_trip for no key update;
 t:=family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());actor:=family_auth.actor_person_id(t.family_id);
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip for update;
 if revision is null then raise exception 'Packing initialization missing'using errcode='23514';end if;
 if p_scope is distinct from family_auth.packing_scope(p_trip)then raise exception 'Original packing scope or lifecycle changed'using errcode='PT409';end if;
 intent:=sha256(convert_to(jsonb_build_array('packing-category-lifecycle-v2',p_scope,p_action,p_target,p_expected_collection_revision,p_observed_category,p_values)::text,'UTF8'));
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.action not in('category-create','category-retain','category-dismiss-empty','category-restore-empty')or r.request_sha256<>intent then raise exception 'Packing operation reused with changed domain or intent'using errcode='PT409';end if;
  if not family_auth.packing_result_visible(r.result)then raise exception 'Original packing result no longer visible; reconcile its receipt'using errcode='42501';end if;
  return r.result;
 end if;
 if revision<>p_expected_collection_revision then raise exception 'Packing observation changed'using errcode='PT409';end if;
 if p_action='category-create'then
  owner:=case when p_values->>'visibility'='personal'then actor else null end;
  if exists(select 1 from public.packing_categories where id=p_target or(trip_id=p_trip and owner_person_id is not distinct from owner and name=p_values->>'name'collate "C"))then raise exception 'Category identity or name is occupied; explicitly retain or restore it'using errcode='PT409';end if;
  position:=family_auth.packing_category_next_order(p_trip,owner);
  begin
   insert into public.packing_categories(id,trip_id,owner_person_id,name,sort_order,retained_when_empty)values(p_target,p_trip,owner,p_values->>'name',position,true)returning * into c;
  exception when unique_violation then raise exception 'Category identity or name is occupied'using errcode='PT409';end;
  changed:=true;
 else
  select * into c from public.packing_categories where id=p_target and trip_id=p_trip for update;
  if not found or(c.owner_person_id is not null and c.owner_person_id<>actor)then raise exception 'Category is unavailable in this authoring scope'using errcode='42501';end if;
  perform 1 from public.packing_items where trip_id=p_trip and category_id=c.id and deleted_at is null order by id for update;
  perform 1 from public.packing_category_assignments where trip_id=p_trip and category_id=c.id order by person_id for update;
  perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
  before_category:=family_auth.packing_category_json_v2(c);
  if before_category is distinct from p_observed_category then raise exception 'Original category or provenance changed'using errcode='PT409';end if;
  if exists(select 1 from public.packing_items where category_id=c.id and deleted_at is null)then raise exception 'Category still contains active items'using errcode='PT409';end if;
  if p_action='category-restore-empty'then
   if c.deleted_at is null then raise exception 'Original category is not in Trash'using errcode='PT409';end if;
   update public.packing_categories set deleted_at=null,deleted_by_person_id=null,retained_when_empty=true where id=c.id returning * into c;changed:=true;
  else
   if c.deleted_at is not null then raise exception 'Restore the original category first'using errcode='PT409';end if;
   if p_action='category-dismiss-empty'then
    update public.packing_categories set deleted_at=clock_timestamp(),deleted_by_person_id=actor where id=c.id returning * into c;changed:=true;
   elsif not c.retained_when_empty then
    update public.packing_categories set retained_when_empty=true where id=c.id returning * into c;changed:=true;
   end if;
  end if;
 end if;
 perform family_auth.packing_category_require_v2(p_trip,true,clock_timestamp());
 perform family_auth.packing_with_categories_v2_entry(p_trip);
 after_category:=family_auth.packing_category_json_v2(c);
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip;
 result:=family_auth.packing_categories_bound_v2(jsonb_build_object('version',2,'kind','packing-category-lifecycle','trip_id',p_trip,'operation_id',p_operation,'scope',p_scope,'action',p_action,'values',p_values,'collection_revision',revision,'category',after_category,'changed',changed));
 insert into family_auth.packing_command_receipts(trip_id,actor_user_id,actor_person_id,operation_id,action,target_id,category_id,request_sha256,before_state,after_state,result)
 values(p_trip,auth.uid(),actor,p_operation,p_action,c.id,c.id,intent,jsonb_build_object('category',before_category,'collection_revision',p_expected_collection_revision),jsonb_build_object('category',after_category,'collection_revision',revision),result);
 return result;
end $$;
create function family_auth.packing_category_lifecycle_receipt_v2_entry(p_trip uuid,p_operation uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r family_auth.packing_command_receipts%rowtype;scope jsonb;redacted boolean;
begin
 perform family_auth.packing_category_require_v2(p_trip,true,statement_timestamp());
 if p_operation is null then raise exception 'Original operation UUID required'using errcode='22023';end if;
 scope:=family_auth.packing_scope(p_trip);
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.action not in('category-create','category-retain','category-dismiss-empty','category-restore-empty')then raise exception 'Use the original packing receipt domain'using errcode='22023';end if;
  if r.result->'scope'->'person_id'is distinct from scope->'person_id'then raise exception 'Receipt belongs to another Person context'using errcode='PT409';end if;
 end if;
 redacted:=r.operation_id is not null and not family_auth.packing_result_visible(r.result);
 return jsonb_build_object('version',2,'kind','packing-category-lifecycle','trip_id',p_trip,'operation_id',p_operation,'scope',scope,'status',case when r.operation_id is null then'unknown'else'committed'end,'result_redacted',redacted,'result',case when redacted then null else r.result end);
end $$;
create function public.get_family_trip_packing_with_categories_v2(p_trip_id uuid)returns jsonb language sql stable security invoker set search_path='' as $$select family_auth.packing_with_categories_v2_entry(p_trip_id);$$;
create function public.lookup_family_trip_packing_category_v2(p_trip_id uuid,p_visibility text,p_name text)returns jsonb language sql stable security invoker set search_path='' as $$select family_auth.packing_category_lookup_v2_entry(p_trip_id,p_visibility,p_name);$$;
create function public.list_family_trip_packing_category_trash_v2(p_trip_id uuid,p_limit integer default 50,p_before_deleted_at timestamptz default null,p_before_id uuid default null)returns jsonb language sql stable security invoker set search_path='' as $$select family_auth.packing_category_trash_v2_entry(p_trip_id,p_limit,p_before_deleted_at,p_before_id);$$;
create function public.execute_family_trip_packing_category_lifecycle_v2(p_trip_id uuid,p_operation_id uuid,p_scope jsonb,p_action text,p_target_id uuid,p_expected_collection_revision bigint,p_observed_category jsonb,p_values jsonb)returns jsonb language sql volatile security invoker set search_path='' as $$select family_auth.packing_category_lifecycle_v2_entry(p_trip_id,p_operation_id,p_scope,p_action,p_target_id,p_expected_collection_revision,p_observed_category,p_values);$$;
create function public.get_family_trip_packing_category_lifecycle_receipt_v2(p_trip_id uuid,p_operation_id uuid)returns jsonb language sql stable security invoker set search_path='' as $$select family_auth.packing_category_lifecycle_receipt_v2_entry(p_trip_id,p_operation_id);$$;
revoke all on function family_auth.packing_category_require_v2(uuid,boolean,timestamp with time zone),family_auth.packing_category_next_order(uuid,uuid),family_auth.packing_category_json_v2(public.packing_categories),family_auth.packing_categories_bound_v2(jsonb),family_auth.validate_packing_category_lifecycle_v2(text,jsonb,jsonb),family_auth.packing_with_categories_v2_entry(uuid),family_auth.packing_category_lookup_v2_entry(uuid,text,text),family_auth.packing_category_trash_v2_entry(uuid,integer,timestamp with time zone,uuid),family_auth.packing_category_lifecycle_v2_entry(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb),family_auth.packing_category_lifecycle_receipt_v2_entry(uuid,uuid),public.get_family_trip_packing_with_categories_v2(uuid),public.lookup_family_trip_packing_category_v2(uuid,text,text),public.list_family_trip_packing_category_trash_v2(uuid,integer,timestamp with time zone,uuid),public.execute_family_trip_packing_category_lifecycle_v2(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb),public.get_family_trip_packing_category_lifecycle_receipt_v2(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function family_auth.packing_with_categories_v2_entry(uuid),family_auth.packing_category_lookup_v2_entry(uuid,text,text),family_auth.packing_category_trash_v2_entry(uuid,integer,timestamp with time zone,uuid),family_auth.packing_category_lifecycle_v2_entry(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb),family_auth.packing_category_lifecycle_receipt_v2_entry(uuid,uuid),public.get_family_trip_packing_with_categories_v2(uuid),public.lookup_family_trip_packing_category_v2(uuid,text,text),public.list_family_trip_packing_category_trash_v2(uuid,integer,timestamp with time zone,uuid),public.execute_family_trip_packing_category_lifecycle_v2(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb),public.get_family_trip_packing_category_lifecycle_receipt_v2(uuid,uuid) to authenticated;
comment on column public.packing_categories.retained_when_empty is 'Explicit active empty-card retention; independent of any placeholder/content item.';
comment on column public.packing_categories.sort_order is 'Owner-lane sort key with UUID tie break; not a unique ordinal.';
notify pgrst,'reload schema';
commit;
