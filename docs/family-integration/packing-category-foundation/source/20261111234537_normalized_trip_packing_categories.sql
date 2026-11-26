-- U04-C2a: normalized identity and a strict v1 compatibility bridge. No new authoring API.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
lock table public.trips, family_auth.trip_packing_state, public.packing_items,
 public.packing_category_assignees, public.packing_item_recipients, public.packing_item_contributors in access exclusive mode;
do $pin$begin
if not exists(select 1 from pg_trigger where tgrelid='public.packing_items'::regclass and tgname='aa_trip_aggregate_child' and tgenabled='O'and pg_get_triggerdef(oid)='CREATE TRIGGER aa_trip_aggregate_child BEFORE INSERT OR DELETE OR UPDATE ON public.packing_items FOR EACH ROW EXECUTE FUNCTION family_auth.tg_trip_aggregate_child()')then raise exception 'Reviewed packing trigger baseline drift'using errcode='22023';end if;
if not exists(select 1 from pg_trigger where tgrelid='public.packing_items'::regclass and tgname='ab_packing_v1_version' and tgenabled='O'and pg_get_triggerdef(oid)='CREATE TRIGGER ab_packing_v1_version BEFORE INSERT OR DELETE OR UPDATE ON public.packing_items FOR EACH ROW EXECUTE FUNCTION family_auth.tg_packing_version()')then raise exception 'Reviewed packing trigger baseline drift'using errcode='22023';end if;
if not exists(select 1 from pg_trigger where tgrelid='public.packing_items'::regclass and tgname='ac_packing_v1_owner' and tgenabled='O'and pg_get_triggerdef(oid)='CREATE TRIGGER ac_packing_v1_owner BEFORE INSERT OR UPDATE ON public.packing_items FOR EACH ROW EXECUTE FUNCTION family_auth.tg_packing_person(''owner_person_id'')')then raise exception 'Reviewed packing trigger baseline drift'using errcode='22023';end if;
if not exists(select 1 from pg_trigger where tgrelid='public.packing_items'::regclass and tgname='packing_items_set_updated_at' and tgenabled='O'and pg_get_triggerdef(oid)='CREATE TRIGGER packing_items_set_updated_at BEFORE UPDATE ON public.packing_items FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at()')then raise exception 'Reviewed packing trigger baseline drift'using errcode='22023';end if;
if not exists(select 1 from pg_trigger where tgrelid='public.packing_items'::regclass and tgname='packing_v1_audit' and tgenabled='O'and pg_get_triggerdef(oid)='CREATE TRIGGER packing_v1_audit AFTER INSERT OR UPDATE ON public.packing_items FOR EACH ROW EXECUTE FUNCTION family_auth.tg_packing_audit()')then raise exception 'Reviewed packing trigger baseline drift'using errcode='22023';end if;
if not exists(select 1 from pg_trigger where tgrelid='public.packing_items'::regclass and tgname='packing_v1_collection' and tgenabled='O'and pg_get_triggerdef(oid)='CREATE TRIGGER packing_v1_collection AFTER INSERT OR DELETE OR UPDATE ON public.packing_items FOR EACH ROW EXECUTE FUNCTION family_auth.tg_packing_collection()')then raise exception 'Reviewed packing trigger baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_version()'::regprocedure),'UTF8')),'hex')<>'82994554b80fa87af616520ed2ab0469b131cf19ffd1bb58d4190cd8030ebeaa'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_trip_aggregate_child()'::regprocedure),'UTF8')),'hex')<>'e2430d335cdc74babb3146236b21ffd30f4f895420f42faad8f1d9e2663f80c0'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_collection()'::regprocedure),'UTF8')),'hex')<>'12c5c9bd7504f109798a68b4e8b0073817e26fb6429e7c807573ac1fcc26ccd1'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_audit()'::regprocedure),'UTF8')),'hex')<>'ab4e131593ff483c3cbc0bd47c30369138ea2e13e934be4d8cc72d49c7ecc402'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_person()'::regprocedure),'UTF8')),'hex')<>'9461501d64c5a2c394d75d6ed4d8bfe61b19ac25419a592fd784b238d2211c23'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('tg_set_updated_at()'::regprocedure),'UTF8')),'hex')<>'85ca3c77614156109db1cb47112af58a62ba0def6b39f21c507f3610df2d33a8'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_item_json(packing_items)'::regprocedure),'UTF8')),'hex')<>'194a8f4dbdffd503654a29e3074a0b80284667350ab10c2ed3bc492e637a8661'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_snapshot(uuid)'::regprocedure),'UTF8')),'hex')<>'66714b0a82302e3d6eafe1a41c350b2641bebc9c4ef977d8197bcdf7cef3bccd'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_group_selected(packing_items,jsonb)'::regprocedure),'UTF8')),'hex')<>'bfdbac7c1aa16d9bd588e58cb2279125ec2172c4140c5c049383556586a45b6a'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.packing_execute_entry(uuid,uuid,jsonb,text,uuid,bigint,bigint,jsonb)'::regprocedure),'UTF8')),'hex')<>'4fd068d2cad466fa3168f6641a4880b70ae63ba35e332a2f7a76f964756dc5ad'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('build_family_export_v1(uuid)'::regprocedure),'UTF8')),'hex')<>'35bacc3f767680274e0f34f434a77990f7d53193b07c60e6b73508956cef70ce'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if encode(sha256(convert_to(pg_get_functiondef('family_auth.tg_packing_person_context()'::regprocedure),'UTF8')),'hex')<>'c040d8681d51cb9579df5720be52b831dbe54cfa4e24f16e62ab1ac15899febd'then raise exception 'Reviewed packing function baseline drift'using errcode='22023';end if;
if(select count(*)from pg_trigger where tgrelid='public.packing_items'::regclass and not tgisinternal)<>6 then raise exception 'Unexpected packing triggers require review'using errcode='22023';end if;
end $pin$;
do $$ begin
 if exists(select 1 from public.packing_items i join public.trips t on t.id=i.trip_id left join public.people p on p.id=i.owner_person_id
   where char_length(i.category)>200 or(i.is_private and i.owner_person_id is null)or(i.owner_person_id is not null and(p.id is null or p.family_id<>t.family_id)))
 or exists(select 1 from public.packing_category_assignees a join public.trips t on t.id=a.trip_id left join public.people p on p.id=a.person_id
   where char_length(a.category_name)>200 or p.id is null or p.family_id<>t.family_id) then
  raise exception 'Packing category preflight requires reviewed data correction' using errcode='22023';
 end if;
end $$;
create table public.packing_categories(
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete restrict,
 owner_person_id uuid references public.people(id) on delete restrict,
 name text collate "C" not null check(char_length(name)<=200),
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(trip_id,id),unique nulls not distinct(trip_id,owner_person_id,name)
);
create index packing_categories_owner_idx on public.packing_categories(owner_person_id)where owner_person_id is not null;
create table public.packing_category_assignments(
 trip_id uuid not null,category_id uuid not null,person_id uuid not null references public.people(id) on delete restrict,
 assigned_at timestamptz,assigned_by_person_id uuid references public.people(id)on delete restrict,
 primary key(trip_id,category_id,person_id),
 foreign key(trip_id,category_id)references public.packing_categories(trip_id,id)on delete restrict,
 check((assigned_at is null)=(assigned_by_person_id is null))
);
create index packing_category_assignments_person_idx on public.packing_category_assignments(person_id);
create index packing_category_assignments_actor_idx on public.packing_category_assignments(assigned_by_person_id)where assigned_by_person_id is not null;
alter table public.packing_categories enable row level security;
alter table public.packing_category_assignments enable row level security;
revoke all on public.packing_categories,public.packing_category_assignments from public,anon,authenticated,service_role;
insert into public.packing_categories(trip_id,owner_person_id,name)
 select distinct trip_id,case when is_private then owner_person_id else null end,category from public.packing_items;
insert into public.packing_categories(trip_id,owner_person_id,name)
 select distinct trip_id,null::uuid,category_name from public.packing_category_assignees on conflict(trip_id,owner_person_id,name)do nothing;
insert into public.packing_category_assignments(trip_id,category_id,person_id)
 select a.trip_id,c.id,a.person_id from public.packing_category_assignees a join public.packing_categories c
 on c.trip_id=a.trip_id and c.owner_person_id is null and c.name=a.category_name collate "C";
alter table public.packing_items add column category_id uuid;
-- Only these five UPDATE side effects prevent a relationship-only backfill. Keep the owner check enabled.
alter table public.packing_items disable trigger aa_trip_aggregate_child;
alter table public.packing_items disable trigger ab_packing_v1_version;
alter table public.packing_items disable trigger packing_items_set_updated_at;
alter table public.packing_items disable trigger packing_v1_audit;
alter table public.packing_items disable trigger packing_v1_collection;
update public.packing_items i set category_id=c.id from public.packing_categories c where c.trip_id=i.trip_id
 and c.owner_person_id is not distinct from(case when i.is_private then i.owner_person_id else null end)
 and c.name=i.category collate "C";
alter table public.packing_items enable trigger aa_trip_aggregate_child;
alter table public.packing_items enable trigger ab_packing_v1_version;
alter table public.packing_items enable trigger packing_items_set_updated_at;
alter table public.packing_items enable trigger packing_v1_audit;
alter table public.packing_items enable trigger packing_v1_collection;
alter table public.packing_items alter column category_id set not null,
 add constraint packing_items_category_context_fkey foreign key(trip_id,category_id)references public.packing_categories(trip_id,id)on delete restrict;
create index packing_items_category_idx on public.packing_items(trip_id,category_id);

create function family_auth.tg_packing_category_lock()returns trigger language plpgsql security definer set search_path='' as $$
declare trip uuid:=case when tg_op='DELETE'then old.trip_id else new.trip_id end;
begin
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||trip::text,0));
 perform 1 from public.trips where id=trip for no key update;
 perform 1 from family_auth.trip_packing_state where trip_id=trip for update;
 if not found then raise exception 'Packing scope initialization missing'using errcode='23514';end if;
 return case when tg_op='DELETE'then old else new end;
end $$;
create function family_auth.tg_packing_category_identity()returns trigger language plpgsql security definer set search_path='' as $$
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
end $$;
create function family_auth.packing_category_resolve(p_trip uuid,p_owner uuid,p_name text)returns uuid language plpgsql security definer set search_path='' as $$
declare found_id uuid;
begin
 select id into found_id from public.packing_categories where trip_id=p_trip and owner_person_id is not distinct from p_owner and name=p_name collate "C";
 if found_id is null then
  insert into public.packing_categories(trip_id,owner_person_id,name)values(p_trip,p_owner,p_name)on conflict(trip_id,owner_person_id,name)do nothing returning id into found_id;
  if found_id is null then select id into found_id from public.packing_categories where trip_id=p_trip and owner_person_id is not distinct from p_owner and name=p_name collate "C";end if;
 end if;
 if found_id is null then raise exception 'Category identity resolution failed'using errcode='23514';end if;
 return found_id;
end $$;
create function family_auth.tg_packing_category_link()returns trigger language plpgsql security definer set search_path='' as $$
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
end $$;
create function family_auth.tg_packing_category_assignment()returns trigger language plpgsql security definer set search_path='' as $$
declare c public.packing_categories%rowtype;
begin
 if tg_op='UPDATE'then
  if to_jsonb(new)=to_jsonb(old)then return null;end if;
  raise exception 'Replace category assignments explicitly; provenance is immutable'using errcode='23514';
 end if;
 select * into c from public.packing_categories where id=new.category_id and trip_id=new.trip_id;
 if c.id is null or c.owner_person_id is not null then raise exception 'Assignments require a common category in this Trip'using errcode='23503';end if;
 if new.assigned_by_person_id is not null and not exists(select 1 from public.people p join public.trips t on t.family_id=p.family_id where p.id=new.assigned_by_person_id and t.id=new.trip_id)then
  raise exception 'Assignment actor must belong to this Family'using errcode='23503';end if;
 return new;
end $$;
create function family_auth.tg_packing_category_bridge()returns trigger language plpgsql security definer set search_path='' as $$
declare category uuid;
begin
 if tg_op='UPDATE'and(new.trip_id,new.category_name,new.person_id)is not distinct from(old.trip_id,old.category_name,old.person_id)then return new;end if;
 if tg_op in('DELETE','UPDATE')then
  delete from public.packing_category_assignments a using public.packing_categories c where c.id=a.category_id and c.trip_id=old.trip_id and c.owner_person_id is null and c.name=old.category_name collate "C" and a.person_id=old.person_id;
 end if;
 if tg_op in('INSERT','UPDATE')then
  category:=family_auth.packing_category_resolve(new.trip_id,null,new.category_name);
  if not exists(select 1 from public.packing_category_assignments where trip_id=new.trip_id and category_id=category and person_id=new.person_id)then
   insert into public.packing_category_assignments(trip_id,category_id,person_id)values(new.trip_id,category,new.person_id)on conflict do nothing;
  end if;
 end if;
 return case when tg_op='DELETE'then old else new end;
end $$;
create function family_auth.tg_packing_category_changed()returns trigger language plpgsql security definer set search_path='' as $$
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
end $$;

create trigger a0_packing_category_lock before insert or update or delete on public.packing_categories for each row execute function family_auth.tg_packing_category_lock();
create trigger a1_packing_category_identity before insert or update or delete on public.packing_categories for each row execute function family_auth.tg_packing_category_identity();
create trigger aa_trip_aggregate_child before insert or update or delete on public.packing_categories for each row execute function family_auth.tg_trip_aggregate_child();
create trigger packing_category_changed after update on public.packing_categories for each row execute function family_auth.tg_packing_category_changed();
create trigger a0_packing_category_lock before insert or update or delete on public.packing_category_assignments for each row execute function family_auth.tg_packing_category_lock();
create trigger a1_packing_category_assignment before insert or update on public.packing_category_assignments for each row execute function family_auth.tg_packing_category_assignment();
create trigger aa_trip_aggregate_child before insert or update or delete on public.packing_category_assignments for each row execute function family_auth.tg_trip_aggregate_child();
create trigger ac_packing_category_person before insert or update on public.packing_category_assignments for each row execute function family_auth.tg_packing_person('person_id');
create trigger packing_category_changed after insert or delete on public.packing_category_assignments for each row execute function family_auth.tg_packing_category_changed();
create trigger a0_packing_category_lock before insert or update or delete on public.packing_items for each row execute function family_auth.tg_packing_category_lock();
create trigger aaz_packing_category_link before insert or update on public.packing_items for each row execute function family_auth.tg_packing_category_link();
create trigger a0_packing_category_lock before insert or update or delete on public.packing_category_assignees for each row execute function family_auth.tg_packing_category_lock();
create trigger packing_category_bridge after insert or update or delete on public.packing_category_assignees for each row execute function family_auth.tg_packing_category_bridge();


CREATE OR REPLACE FUNCTION family_auth.packing_item_json(p_item packing_items)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',p_item.id,'trip_id',p_item.trip_id,'name',p_item.name,'checked',p_item.checked,'category',(select name from public.packing_categories where id=p_item.category_id),'sort_order',p_item.sort_order,'quantity',p_item.quantity,'weight_grams',p_item.weight_grams,'bag_id',p_item.bag_id,'is_private',p_item.is_private,'owner_person_id',p_item.owner_person_id,'created_at',p_item.created_at,'updated_at',p_item.updated_at,'packed_quantity',p_item.packed_quantity,'revision',p_item.revision,'deleted_at',p_item.deleted_at,'deleted_by_person_id',p_item.deleted_by_person_id)||jsonb_build_object(
  'recipient_person_ids',coalesce((select jsonb_agg(person_id order by person_id)from public.packing_item_recipients where item_id=p_item.id),'[]'::jsonb),
  'contributor_person_ids',coalesce((select jsonb_agg(person_id order by person_id)from public.packing_item_contributors where item_id=p_item.id),'[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION family_auth.tg_packing_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='DELETE' then raise exception 'Packing requires Trash; permanent purge is unavailable' using errcode='0A000';end if;
 if tg_op='INSERT' then
  if new.deleted_at is not null or new.deleted_by_person_id is not null then raise exception 'New packing items must be active' using errcode='23514';end if;
  new.revision:=1;
 else
  if(new.id,new.trip_id,new.created_at)is distinct from(old.id,old.trip_id,old.created_at)then raise exception 'Packing identity is immutable' using errcode='23514';end if;
  if new.revision<>old.revision then raise exception 'Packing revision is server managed' using errcode='23514';end if;
  if old.deleted_at is not null and (case when new.deleted_at is null and new.category_id=old.category_id and new.category=(select name from public.packing_categories where id=old.category_id)then to_jsonb(new)-'category'else to_jsonb(new)end-array['deleted_at','deleted_by_person_id','updated_at','revision','sort_order'])is distinct from
   (case when new.deleted_at is null and new.category_id=old.category_id and new.category=(select name from public.packing_categories where id=old.category_id)then to_jsonb(old)-'category'else to_jsonb(old)end-array['deleted_at','deleted_by_person_id','updated_at','revision','sort_order'])then raise exception 'Restore packing before editing it' using errcode='PT409';end if;
  if old.deleted_at is not null and new.deleted_at is not null and(new.deleted_at,new.deleted_by_person_id,new.sort_order)is distinct from(old.deleted_at,old.deleted_by_person_id,old.sort_order)then
   raise exception 'Packing Trash is immutable' using errcode='PT409';end if;
  new.revision:=old.revision+1;
 end if;
 return new;
end;$function$;

CREATE OR REPLACE FUNCTION family_auth.tg_packing_collection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare trip uuid;item uuid;
begin
 if tg_table_name='packing_category_assignees'then return case when tg_op='DELETE'then old else new end;end if;
 trip:=case when tg_op='DELETE' then old.trip_id else new.trip_id end;
 if tg_table_name in('packing_item_recipients','packing_item_contributors')then
  item:=case when tg_op='DELETE'then old.item_id else new.item_id end;
  update public.packing_items set updated_at=clock_timestamp()where id=item;
 end if;
 update family_auth.trip_packing_state set collection_revision=collection_revision+1 where trip_id=trip;
 if not found then raise exception 'Packing scope initialization missing' using errcode='23514';end if;
 return case when tg_op='DELETE' then old else new end;
end;$function$;

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
end;$function$;

CREATE OR REPLACE FUNCTION family_auth.packing_group_selected(p_item packing_items, p_selector jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p_item.deleted_at is null
  and p_item.is_private=(p_selector->>'view'='personal')
  and case p_selector->>'status' when 'open' then not p_item.checked when 'done' then p_item.checked else true end
  and (p_selector->'categories'='null'::jsonb or p_selector->'categories' @> to_jsonb(array[(select name from public.packing_categories where id=p_item.category_id)]));
$function$;

CREATE OR REPLACE FUNCTION family_auth.packing_execute_entry(p_trip uuid, p_operation uuid, p_scope jsonb, p_action text, p_target uuid, p_expected_revision bigint, p_expected_collection_revision bigint, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.trips%rowtype;i public.packing_items%rowtype;r family_auth.packing_command_receipts%rowtype;
 actor uuid;bag uuid;revision bigint;intent bytea;ordered uuid[];complete uuid[];visible uuid[];position integer;count_value integer;next_quantity integer;private boolean;
 before_state jsonb;after_state jsonb;result jsonb;
begin
 if p_trip is null or p_operation is null or p_action is null or p_action not in('create','update','packed-state','reorder','trash','restore')or jsonb_typeof(p_scope)is distinct from'object'or octet_length(p_scope::text)>4096 then raise exception 'Complete observed packing command required'using errcode='22023';end if;
 perform family_auth.validate_packing_values(p_action,p_values);
 if p_action='reorder'then
  if p_target is not null or p_expected_revision is not null or p_expected_collection_revision is null or p_expected_collection_revision<0 then raise exception 'Observed packing collection required'using errcode='22023';end if;
 elsif p_action='create'then
  if p_target is null or p_expected_revision is not null or p_expected_collection_revision is not null then raise exception 'New canonical packing UUID required'using errcode='22023';end if;
 else
  if p_target is null or p_expected_revision is null or p_expected_revision<1 or p_expected_collection_revision is not null then raise exception 'Observed packing row revision required'using errcode='22023';end if;
 end if;
 perform family_auth.packing_require(p_trip,true);
 perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||p_trip::text,0));
 perform 1 from public.trips where id=p_trip for no key update;
 t:=family_auth.packing_require(p_trip,true);actor:=family_auth.actor_person_id(t.family_id);
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip for update;
 if revision is null then raise exception 'Packing scope initialization missing'using errcode='23514';end if;
 if p_scope is distinct from family_auth.packing_scope(p_trip)then raise exception 'Original packing scope or Trip lifecycle changed'using errcode='PT409';end if;
 intent:=sha256(convert_to(jsonb_build_array(p_scope,p_action,p_target,p_expected_revision,p_expected_collection_revision,p_values)::text,'UTF8'));
 select * into r from family_auth.packing_command_receipts where trip_id=p_trip and actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.request_sha256<>intent then raise exception 'Packing operation reused with changed intent'using errcode='PT409';end if;
  if not family_auth.packing_result_visible(r.result)then raise exception 'Original packing result is no longer visible; reconcile its receipt'using errcode='42501';end if;
  return r.result;
 end if;
 if p_action='reorder'then
  if revision<>p_expected_collection_revision then raise exception 'Packing collection changed'using errcode='PT409';end if;
  begin select coalesce(array_agg(value::uuid order by ordinality),'{}'::uuid[])into ordered from jsonb_array_elements_text(p_values->'ids')with ordinality;
  exception when invalid_text_representation then raise exception 'Packing order must contain UUIDs'using errcode='22023';end;
  select coalesce(array_agg(id order by sort_order,id),'{}'::uuid[])into visible from public.packing_items where trip_id=p_trip and deleted_at is null and family_auth.packing_can_read(id,false);
  if cardinality(ordered)<>cardinality(visible)or cardinality(ordered)<>(select count(distinct x)from unnest(ordered)x)or not(ordered<@visible)then raise exception 'Order must name every visible active packing item exactly once'using errcode='PT409';end if;
  perform 1 from public.packing_items where trip_id=p_trip and deleted_at is null order by id for update;
  select coalesce(array_agg(id order by sort_order,id),'{}'::uuid[])into complete from public.packing_items where trip_id=p_trip and deleted_at is null;
 else
  select * into i from public.packing_items where id=p_target and trip_id=p_trip for update;
  if p_action='create'then
   if i.id is not null or exists(select 1 from public.packing_items where id=p_target)then raise exception 'Packing identity already exists'using errcode='PT409';end if;
  elsif i.id is null or not family_auth.packing_can_read(i.id,true)then raise exception 'Packing item unavailable in this Trip'using errcode='42501';
  elsif i.revision<>p_expected_revision then raise exception 'Packing item changed'using errcode='PT409';
  elsif(p_action='restore')<>(i.deleted_at is not null)then raise exception 'Packing lifecycle changed'using errcode='PT409';end if;
 end if;
 if p_values?'bag_id'then
  begin bag:=(p_values->>'bag_id')::uuid;exception when invalid_text_representation then raise exception 'Bag must be UUID or null'using errcode='22023';end;
  if bag is not null and not exists(select 1 from public.packing_bags where id=bag and trip_id=p_trip)then raise exception 'Bag does not belong to this Trip'using errcode='23503';end if;
 end if;
 before_state:=case when p_action='reorder'then jsonb_build_object('items',(select coalesce(jsonb_agg((to_jsonb(x)-'category_id')order by x.sort_order,x.id),'[]'::jsonb)from public.packing_items x where x.trip_id=p_trip and x.deleted_at is null),'collection_revision',revision)
  else jsonb_build_object('item',case when p_action='create'then null else family_auth.packing_item_json(i)end,'collection_revision',revision)end;
 if p_action in('create','restore')then
  if(select count(*)from public.packing_items where trip_id=p_trip and deleted_at is null)>=2000 then raise exception 'Active packing count exceeds bound'using errcode='54000';end if;
  select max(sort_order)into position from public.packing_items where trip_id=p_trip and deleted_at is null;
  if position=2147483647 then raise exception 'Reorder packing before appending beyond its rank bound'using errcode='54000';end if;
  position:=coalesce(position,-1)+1;
 end if;
 if p_action='create'then
  private:=coalesce(p_values->>'visibility','common')='personal';
  next_quantity:=coalesce((p_values->>'quantity')::integer,1);count_value:=coalesce((p_values->>'packed_quantity')::integer,0);
  if count_value>next_quantity then raise exception 'Packed count exceeds quantity'using errcode='22023';end if;
  insert into public.packing_items(id,trip_id,name,category,quantity,weight_grams,bag_id,is_private,owner_person_id,sort_order,checked,packed_quantity)
   values(p_target,p_trip,btrim(p_values->>'name'),coalesce(p_values->>'category',''),coalesce((p_values->>'quantity')::integer,1),(p_values->>'weight_grams')::integer,bag,private,case when private then actor else null end,position,case when p_values?'packed_quantity'then count_value=next_quantity else coalesce((p_values->>'checked')::boolean,false)end,case when count_value>0 and count_value<next_quantity then count_value else null end)returning * into i;
 end if;
 if p_action in('create','update','packed-state')then
  next_quantity:=case when p_values?'quantity'then(p_values->>'quantity')::integer else i.quantity end;
  if p_values?'packed_quantity'then
   count_value:=coalesce((p_values->>'packed_quantity')::integer,0);
   if count_value>next_quantity then raise exception 'Packed count exceeds quantity'using errcode='22023';end if;
   i.checked:=count_value=next_quantity;i.packed_quantity:=case when count_value>0 and count_value<next_quantity then count_value else null end;
  elsif p_values?'checked'then i.checked:=(p_values->>'checked')::boolean;i.packed_quantity:=null;
  elsif i.packed_quantity>=next_quantity then i.checked:=true;i.packed_quantity:=null;
  end if;
  -- Creation inserted its complete packed state atomically with initial revision one.
  if p_action<>'create'then
   update public.packing_items set name=case when p_values?'name'then btrim(p_values->>'name')else name end,
    category=case when p_values?'category'then p_values->>'category'else category end,quantity=next_quantity,
    weight_grams=case when p_values?'weight_grams'then(p_values->>'weight_grams')::integer else weight_grams end,
    bag_id=case when p_values?'bag_id'then bag else bag_id end,checked=i.checked,packed_quantity=i.packed_quantity where id=i.id returning * into i;
  end if;
 elsif p_action='trash'then update public.packing_items set deleted_at=clock_timestamp(),deleted_by_person_id=actor where id=i.id returning * into i;
 elsif p_action='restore'then update public.packing_items set deleted_at=null,deleted_by_person_id=null,sort_order=position where id=i.id returning * into i;
 else
  -- An unchanged visible order is a true no-op, including an empty private-filtered view.
  if ordered is distinct from visible then
  -- Preserve hidden logical slots; normalize ranks only within this observed command, never during migration.
  position:=1;
  for slot in 1..cardinality(complete)loop
   if complete[slot]=any(visible)then complete[slot]:=ordered[position];position:=position+1;end if;
  end loop;
  update public.packing_items z set sort_order=x.rank::integer-1 from unnest(complete)with ordinality x(id,rank)where z.id=x.id and z.trip_id=p_trip and z.sort_order<>x.rank-1;
  end if;
 end if;
 perform family_auth.packing_snapshot(p_trip);
 select collection_revision into revision from family_auth.trip_packing_state where trip_id=p_trip;
 after_state:=case when p_action='reorder'then jsonb_build_object('items',(select coalesce(jsonb_agg((to_jsonb(x)-'category_id')order by x.sort_order,x.id),'[]'::jsonb)from public.packing_items x where x.trip_id=p_trip and x.deleted_at is null),'collection_revision',revision)
  else jsonb_build_object('item',family_auth.packing_item_json(i),'collection_revision',revision)end;
 if octet_length(before_state::text)+octet_length(after_state::text)>16777216 then raise exception 'Packing command history exceeds bound'using errcode='54000';end if;
 result:=jsonb_build_object('version',1,'trip_id',p_trip,'operation_id',p_operation,'scope',p_scope,'action',p_action,'target_id',p_target,'collection_revision',revision,
  'item',case when p_action='reorder'then null else family_auth.packing_item_json(i)end,'ordered_ids',case when p_action='reorder'then to_jsonb(ordered)else null end);
 insert into family_auth.packing_command_receipts(trip_id,actor_user_id,actor_person_id,operation_id,action,target_id,request_sha256,before_state,after_state,result)
  values(p_trip,auth.uid(),actor,p_operation,p_action,p_target,intent,before_state,after_state,result);
 return result;
end;$function$;

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
end;$function$;

CREATE OR REPLACE FUNCTION public.build_family_export_v1(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.family_export_jobs%rowtype;
  v_family uuid;
  v_person uuid;
  v_user uuid;
  v_trip_ids uuid[];
  v_list_ids uuid[];
  v_file_ids uuid[];
  v_tables jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_put jsonb;
  v_rows jsonb;
  v_inventory jsonb;
  v_snapshot jsonb;
  v_secrets text[] := array[
    'recovery_xid', 'calendar_feed_token', 'storage_path', 'apns_token', 'device_token',
    'push_token', 'feed_token', 'public_url', 'mapbox_public_token', 'carto_api_key'
  ];
begin
  perform family_auth.require_export_service();
  if p_job_id is null then
    raise exception 'job_id required' using errcode = '23502';
  end if;

  select * into v_job from public.family_export_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_job.schema_version is distinct from 1 then
    raise exception 'unsupported_schema_version' using errcode = '22023';
  end if;

  v_family := v_job.family_id;
  v_person := v_job.requested_by_person_id;
  v_user := v_job.requested_by_user_id;
  if not exists(select 1 from public.people p join public.family_members m on m.family_id=p.family_id and m.user_id=p.user_id
    where p.id=v_person and p.family_id=v_family and p.user_id=v_user and p.archived_at is null and m.status='active')then
   raise exception 'Export requester is no longer active in this Family'using errcode='42501';end if;

  select coalesce(array_agg(t.id), '{}')
    into v_trip_ids
  from public.trips t
  where t.family_id = v_family and t.deleted_at is null;

  -- Family / roster
  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.families r where r.id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'families', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.family_branches r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_branches', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.people r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'people', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.family_members r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_members', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.branch_id, r.person_id), '[]'::jsonb)
    into v_rows
  from public.branch_people r
  join public.family_branches b on b.id = r.branch_id
  where b.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'branch_people', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.access_requests r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'access_requests', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.family_person_relationships r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_person_relationships', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.family_person_soft_relationships r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_person_soft_relationships', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  -- Family-visible trips + subgraphs
  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trips r where r.family_id = v_family and r.deleted_at is null;
  v_put := family_auth.export_put(v_tables, v_counts, 'trips', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.trip_id, r.country_id), '[]'::jsonb)
    into v_rows from public.trip_countries r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_countries', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_travelers r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_travelers', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.trip_id, r.place_id), '[]'::jsonb)
    into v_rows from public.trip_places r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_places', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_days r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_days', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.day_notes r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'day_notes', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.schedule_items r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'schedule_items', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_reservations r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_reservations', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';
  -- P04o independent booking dates follow the same active-Trip export allowlist.
  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.reservation_id), '[]'::jsonb)
    into v_rows from public.trip_reservation_calendar_dates r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_reservation_calendar_dates', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';


  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_reservation_endpoints r
    where r.reservation_id in (select id from public.trip_reservations where trip_id = any (v_trip_ids));
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_reservation_endpoints', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_reservation_legs r
    where r.reservation_id in (select id from public.trip_reservations where trip_id = any (v_trip_ids));
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_reservation_legs', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.budget_items r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'budget_items', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_expenses r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_expenses', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.expense_id, r.person_id), '[]'::jsonb)
    into v_rows from public.trip_expense_shares r
    where r.expense_id in (select id from public.trip_expenses where trip_id = any (v_trip_ids));
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_expense_shares', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.expense_id, r.person_id), '[]'::jsonb)
    into v_rows from public.trip_expense_payers r
    where r.expense_id in (select id from public.trip_expenses where trip_id = any (v_trip_ids));
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_expense_payers', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_expense_settlements r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_expense_settlements', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.packing_bags r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'packing_bags', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows
  from public.packing_items r
  where r.trip_id = any (v_trip_ids)
    and family_auth.packing_visible_to(r.id, v_person);
  v_put := family_auth.export_put(v_tables, v_counts, 'packing_items', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.item_id, r.person_id), '[]'::jsonb)
    into v_rows
  from public.packing_item_recipients r
  where r.trip_id = any (v_trip_ids)
    and r.item_id in (
      select (elem->>'id')::uuid
      from jsonb_array_elements(v_tables -> 'packing_items') elem
    );
  v_put := family_auth.export_put(v_tables, v_counts, 'packing_item_recipients', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.item_id, r.person_id), '[]'::jsonb)
    into v_rows from public.packing_item_contributors r where r.trip_id = any (v_trip_ids) and r.item_id in (select (elem->>'id')::uuid from jsonb_array_elements(v_tables -> 'packing_items') elem);
  v_put := family_auth.export_put(v_tables, v_counts, 'packing_item_contributors', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.trip_id, r.bag_id, r.person_id), '[]'::jsonb)
    into v_rows from public.packing_bag_members r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'packing_bag_members', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.trip_id, r.category_name, r.person_id), '[]'::jsonb)
    into v_rows from public.packing_category_assignees r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'packing_category_assignees', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';
  select coalesce(jsonb_agg(to_jsonb(c)order by c.id),'[]'::jsonb)into v_rows from public.packing_categories c
   where c.trip_id=any(v_trip_ids)and(c.owner_person_id is null or c.owner_person_id=v_person or c.id in(select (i->>'category_id')::uuid from jsonb_array_elements(v_tables->'packing_items')i));
  v_put:=family_auth.export_put(v_tables,v_counts,'packing_categories',v_rows);v_tables:=v_put->'tables';v_counts:=v_put->'counts';
  select coalesce(jsonb_agg(to_jsonb(a)order by a.trip_id,a.category_id,a.person_id),'[]'::jsonb)into v_rows from public.packing_category_assignments a
   where a.trip_id=any(v_trip_ids)and a.category_id in(select(c->>'id')::uuid from jsonb_array_elements(v_tables->'packing_categories')c);
  v_put:=family_auth.export_put(v_tables,v_counts,'packing_category_assignments',v_rows);v_tables:=v_put->'tables';v_counts:=v_put->'counts';


  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.todo_items r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'todo_items', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.trip_id, r.category_name, r.person_id), '[]'::jsonb)
    into v_rows from public.todo_category_assignees r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'todo_category_assignees', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_tracks r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_tracks', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_track_waypoints r
    where r.track_id in (select id from public.trip_tracks where trip_id = any (v_trip_ids));
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_track_waypoints', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.itineraries r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'itineraries', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.itinerary_trips r
    where r.itinerary_id in (select id from public.itineraries where family_id = v_family);
  v_put := family_auth.export_put(v_tables, v_counts, 'itinerary_trips', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.proposals r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'proposals', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.proposal_votes r
    where r.proposal_id in (select id from public.proposals where family_id = v_family);
  v_put := family_auth.export_put(v_tables, v_counts, 'proposal_votes', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.proposal_comments r
    where r.proposal_id in (select id from public.proposals where family_id = v_family);
  v_put := family_auth.export_put(v_tables, v_counts, 'proposal_comments', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_change_requests r where r.trip_id = any (v_trip_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_change_requests', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_change_request_ops r
    where r.request_id in (select id from public.trip_change_requests where trip_id = any (v_trip_ids));
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_change_request_ops', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  -- Family collections + config
  select coalesce(array_agg(l.id), '{}')
    into v_list_ids
  from public.lists l
  where l.family_id = v_family
    and (l.visibility = 'family' or l.owner_person_id = v_person);

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.lists r where r.id = any (v_list_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'lists', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.list_items r where r.list_id = any (v_list_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'list_items', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.packing_templates r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'packing_templates', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.packing_template_items r
    where r.template_id in (select id from public.packing_templates where family_id = v_family);
  v_put := family_auth.export_put(v_tables, v_counts, 'packing_template_items', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.family_place_categories r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_place_categories', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.family_id), '[]'::jsonb)
    into v_rows from public.family_preference_defaults r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_preference_defaults', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';


  select coalesce(jsonb_agg(jsonb_build_object(
      'family_id', r.family_id,
      'enabled_option_ids', r.enabled_option_ids,
      'default_option_id', r.default_option_id,
      'mapbox_configured', r.mapbox_public_token is not null,
      'carto_configured', r.carto_api_key is not null,
      'credential_revision', r.credential_revision,
      'updated_at', r.updated_at
    ) order by r.family_id), '[]'::jsonb)
    into v_rows from public.family_map_settings r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_map_settings', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';


  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.capability_key), '[]'::jsonb)
    into v_rows from public.family_permission_policies r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_permission_policies', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.feature_key), '[]'::jsonb)
    into v_rows from public.family_feature_overrides r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_feature_overrides', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.event_key), '[]'::jsonb)
    into v_rows from public.family_notification_defaults r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_notification_defaults', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.created_at, r.id), '[]'::jsonb)
    into v_rows from public.family_audit_events r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_audit_events', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.family_id), '[]'::jsonb)
    into v_rows from public.family_calendar_settings r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_calendar_settings', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.family_blocked_dates r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_blocked_dates', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.family_holiday_calendars r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_holiday_calendars', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.game_categories r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'game_categories', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.game_questions r where r.family_id = v_family;
  v_put := family_auth.export_put(v_tables, v_counts, 'game_questions', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  -- Requester-owned private rows
  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.person_id), '[]'::jsonb)
    into v_rows from public.family_member_preferences r
    where r.family_id = v_family and r.person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_member_preferences', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';


  select coalesce(jsonb_agg(jsonb_build_object(
      'family_id', r.family_id,
      'person_id', r.person_id,
      'selected_option_id', r.selected_option_id,
      'updated_at', r.updated_at
    ) order by r.person_id), '[]'::jsonb)
    into v_rows from public.family_member_map_preferences r
    where r.family_id = v_family and r.person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_member_map_preferences', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';


  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.event_key), '[]'::jsonb)
    into v_rows from public.notification_preferences r
    where r.family_id = v_family and r.person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'notification_preferences', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.created_at, r.id), '[]'::jsonb)
    into v_rows from public.notifications r
    where r.family_id = v_family and r.recipient_person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'notifications', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_change_drafts r
    where r.trip_id = any (v_trip_ids) and r.owner_person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_change_drafts', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_change_draft_ops r
    where r.draft_id in (
      select id from public.trip_change_drafts
      where trip_id = any (v_trip_ids) and owner_person_id = v_person
    );
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_change_draft_ops', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.person_catalog_saves r
    where r.family_id = v_family and r.person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'person_catalog_saves', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.user_country_marks r where r.user_id = v_user;
  v_put := family_auth.export_put(v_tables, v_counts, 'user_country_marks', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.user_place_marks r where r.user_id = v_user;
  v_put := family_auth.export_put(v_tables, v_counts, 'user_place_marks', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.viewer_person_id, r.target_person_id), '[]'::jsonb)
    into v_rows from public.person_vacay_overlay_people r where r.viewer_person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'person_vacay_overlay_people', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.viewer_person_id, r.branch_id), '[]'::jsonb)
    into v_rows from public.person_vacay_overlay_branches r where r.viewer_person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'person_vacay_overlay_branches', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.family_calendar_entries r
    where r.family_id = v_family and r.person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_calendar_entries', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.person_id, r.year), '[]'::jsonb)
    into v_rows from public.family_pto_years r
    where r.family_id = v_family and r.person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'family_pto_years', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.game_sessions r
    where r.family_id = v_family and r.person_id = v_person;
  v_put := family_auth.export_put(v_tables, v_counts, 'game_sessions', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  -- File inventory (no storage_path, no trashed objects)
  select coalesce(array_agg(f.id), '{}')
    into v_file_ids
  from public.trip_files f
  where f.trip_id = any (v_trip_ids)
    and f.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'trip_id', f.trip_id,
    'original_name', f.original_name,
    'mime_type', f.mime_type,
    'size_bytes', f.size_bytes,
    'uploaded_by', f.uploaded_by,
    'starred', f.starred,
    'description', f.description,
    'created_at', f.created_at
  ) order by f.id), '[]'::jsonb)
    into v_inventory
  from public.trip_files f
  where f.id = any (v_file_ids);

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows from public.trip_file_links r where r.file_id = any (v_file_ids);
  v_put := family_auth.export_put(v_tables, v_counts, 'trip_file_links', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  select coalesce(jsonb_agg(family_auth.jsonb_omit(to_jsonb(r), v_secrets) order by r.id), '[]'::jsonb)
    into v_rows
  from public.media_assets r
  where r.family_id = v_family
    and r.bucket = 'family'
    and r.visibility = 'family';
  v_put := family_auth.export_put(v_tables, v_counts, 'media_assets', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';

  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'exported_at', now(),
    'family_id', v_family,
    'requester_person_id', v_person,
    'requester_user_id', v_user,
    'tables', v_tables,
    'file_inventory', coalesce(v_inventory, '[]'::jsonb)
  );

  if octet_length(v_snapshot::text) > 8388608 then
    raise exception 'artifact_too_large' using errcode = '54000';
  end if;

  return jsonb_build_object(
    'snapshot', v_snapshot,
    'row_counts', v_counts,
    'byte_size', octet_length(v_snapshot::text)
  );
end;
$function$;

create function family_auth.packing_category_can_read(p_category uuid)returns boolean language plpgsql stable security definer set search_path='' as $$
declare c public.packing_categories%rowtype;
begin
 if auth.uid()is null then return false;end if;
 select * into c from public.packing_categories where id=p_category;if not found then return false;end if;
 begin perform family_auth.packing_require(c.trip_id,false);exception when insufficient_privilege then return false;end;
 return c.owner_person_id is null or c.owner_person_id=family_auth.actor_person_id((select family_id from public.trips where id=c.trip_id))
  or exists(select 1 from public.packing_items i where i.category_id=c.id and family_auth.packing_can_read(i.id,true));
end $$;
create policy packing_category_read on public.packing_categories for select to authenticated using(family_auth.packing_category_can_read(id));
create policy packing_category_assignment_read on public.packing_category_assignments for select to authenticated using(family_auth.packing_category_can_read(category_id));
create policy trip_aggregate_active on public.packing_categories as restrictive for select to authenticated using(family_auth.trip_is_active(trip_id));
create policy trip_aggregate_active on public.packing_category_assignments as restrictive for select to authenticated using(family_auth.trip_is_active(trip_id));
create function family_auth.packing_category_json(p_category public.packing_categories)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p_category.id,'trip_id',p_category.trip_id,'owner_person_id',p_category.owner_person_id,'name',p_category.name,'revision',p_category.revision,'created_at',p_category.created_at,'updated_at',p_category.updated_at)||jsonb_build_object('assignments',coalesce((select jsonb_agg(jsonb_build_object('person_id',a.person_id,'assigned_at',a.assigned_at,'assigned_by_person_id',a.assigned_by_person_id)order by a.person_id)from public.packing_category_assignments a where a.trip_id=p_category.trip_id and a.category_id=p_category.id),'[]'::jsonb));
$$;
create function family_auth.packing_with_categories_entry(p_trip uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform family_auth.packing_require(p_trip,false);
 with packet as materialized(select family_auth.packing_snapshot(p_trip)p),
 items as materialized(select i.id,i.category_id from public.packing_items i where i.trip_id=p_trip and i.deleted_at is null and family_auth.packing_can_read(i.id,false)),
 categories as materialized(select c.* from public.packing_categories c where c.trip_id=p_trip and c.id in(select category_id from items)),
 persons as(select owner_person_id id from categories where owner_person_id is not null union select a.person_id from public.packing_category_assignments a where a.trip_id=p_trip and a.category_id in(select id from categories)union select a.assigned_by_person_id from public.packing_category_assignments a where a.trip_id=p_trip and a.category_id in(select id from categories)and a.assigned_by_person_id is not null)
 select jsonb_build_object('version',1,'scope',p->'scope','collection_revision',p->'collection_revision','packing',p,
  'categories',coalesce((select jsonb_agg(family_auth.packing_category_json(c::public.packing_categories)order by c.id)from categories c),'[]'::jsonb),
  'item_categories',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'category_id',i.category_id)order by i.id)from items i),'[]'::jsonb),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',person.id,'display_name',person.display_name,'is_guest',person.user_id is null,'eligible',
   person.archived_at is null and exists(select 1 from public.trip_travelers v where v.trip_id=p_trip and v.person_id=person.id)and(person.user_id is null or exists(select 1 from public.family_members m where m.family_id=person.family_id and m.user_id=person.user_id and m.status='active')))order by person.id)
   from public.people person join public.trips t on t.family_id=person.family_id where t.id=p_trip and person.id in(select id from persons)),'[]'::jsonb))into result from packet;
 if octet_length(result::text)>8388608 then raise exception 'Packing category response exceeds byte bound'using errcode='54000';end if;
 return result;
end $$;
create function public.get_family_trip_packing_with_categories_v1(p_trip_id uuid)returns jsonb language sql stable security invoker set search_path='' as $$select family_auth.packing_with_categories_entry(p_trip_id);$$;
revoke all on function family_auth.tg_packing_category_lock(),family_auth.tg_packing_category_identity(),family_auth.packing_category_resolve(uuid,uuid,text),family_auth.tg_packing_category_link(),family_auth.tg_packing_category_assignment(),family_auth.tg_packing_category_bridge(),family_auth.tg_packing_category_changed(),family_auth.packing_category_can_read(uuid),family_auth.packing_category_json(public.packing_categories),family_auth.packing_with_categories_entry(uuid),public.get_family_trip_packing_with_categories_v1(uuid)from public,anon,authenticated,service_role;
grant execute on function family_auth.packing_category_can_read(uuid),family_auth.packing_with_categories_entry(uuid),public.get_family_trip_packing_with_categories_v1(uuid)to authenticated;
comment on table public.packing_categories is 'Stable common/personal category identity. Raw client DML and physical deletion are unavailable.';
comment on column public.packing_items.category is 'Temporary v1 compatibility text; category_id is authoritative. Trashed rows retain historical text until an actual Restore.';
comment on table public.packing_category_assignments is 'Common-category responsibility only; assignment does not grant access. NULL provenance is preserved legacy history.';
comment on function public.get_family_trip_packing_with_categories_v1(uuid)is 'Authorized single-snapshot packing/category identities; preserves the nested strict packing v1 packet. No category authoring capability.';
notify pgrst,'reload schema';
commit;
