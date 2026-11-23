-- U04-F5c2. Storage/history only; no public authoring or native activation.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

alter table public.list_items drop constraint list_items_exactly_one_target;
alter table public.list_items add constraint list_items_exactly_one_target check(
 num_nonnulls(country_id,place_id,food_id,hotel_id,experience_id,airport_id,airline_id,guide_id)=case when item_kind='manual'then 0 else 1 end);
alter table public.list_items drop constraint list_items_kind_matches_fk;
alter table public.list_items add constraint list_items_kind_matches_fk check(
 (item_kind='manual'and num_nonnulls(country_id,place_id,food_id,hotel_id,experience_id,airport_id,airline_id,guide_id)=0)
 or(item_kind='country'and country_id is not null)or(item_kind='place'and place_id is not null)
 or(item_kind='food'and food_id is not null)or(item_kind='hotel'and hotel_id is not null)
 or(item_kind='experience'and experience_id is not null)or(item_kind='airport'and airport_id is not null)
 or(item_kind='airline'and airline_id is not null)or(item_kind='guide'and guide_id is not null));

-- This deliberately conservative canonical ASCII HTTP(S) storage grammar does
-- not rewrite URLs. Future observed commands must serialize with a URL parser
-- before observation; empty text is an explicit empty snapshot.
create function family_auth.collection_location_website_valid(p_value text)returns boolean
language plpgsql immutable set search_path=''as $$
declare parts text[];hostpart text;portpart text;scheme text;pathpart text;address inet;
begin
 if p_value is null or p_value=''then return true;end if;
 if char_length(p_value)>2048 or p_value!~'^[!-~]+$'or p_value~'["<>`{}\\]'or p_value~'%(?![0-9a-fA-F]{2})'then return false;end if;
 parts:=regexp_match(p_value,'^(https?)://(\[[0-9a-f:]+\]|[a-z0-9.-]+)(:([1-9][0-9]{0,4}))?(/.*)$');
 if parts is null then return false;end if;
 scheme:=parts[1];hostpart:=parts[2];portpart:=parts[4];pathpart:=parts[5];
 if portpart is not null and(portpart::integer>65535 or(scheme='http'and portpart='80')or(scheme='https'and portpart='443'))then return false;end if;
 if hostpart like '[%'then
  begin address:=substring(hostpart,2,char_length(hostpart)-2)::inet;exception when invalid_text_representation then return false;end;
  if family(address)<>6 or '['||host(address)||']'<>hostpart then return false;end if;
 elsif hostpart~'^[0-9.]+$'then
  begin address:=hostpart::inet;exception when invalid_text_representation then return false;end;
  if family(address)<>4 or host(address)<>hostpart then return false;end if;
 else
  if char_length(hostpart)>253 or hostpart!~'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.?$'then return false;end if;
 end if;
 if pathpart~*'(^|/)(\.|%2e){1,2}(/|$|\?|#)'then return false;end if;
 return true;
end;$$;

create table public.list_item_locations(
 item_id uuid primary key,list_id uuid not null,family_id uuid not null,
 description text check(description is null or char_length(description)<=20000),
 latitude numeric(10,8),longitude numeric(11,8),
 address text check(address is null or char_length(address)<=2000),
 website text check(family_auth.collection_location_website_valid(website)),
 phone text check(phone is null or char_length(phone)<=100),
 family_place_category_id uuid,cover_media_id uuid references public.media_assets(id)on delete restrict,
 foreign key(item_id,list_id)references public.list_items(id,list_id)on delete restrict,
 foreign key(list_id,family_id)references public.lists(id,family_id)on delete restrict,
 foreign key(family_place_category_id,family_id)references public.family_place_categories(id,family_id)on delete restrict,
 constraint list_item_locations_coordinate_pair check((latitude is null)=(longitude is null)),
 constraint list_item_locations_latitude_range check(latitude is null or latitude between -90 and 90),
 constraint list_item_locations_longitude_range check(longitude is null or longitude between -180 and 180)
);
-- The unique item PK already bounds the composite item/list FK probe to one row.
create index list_item_locations_list_family_idx on public.list_item_locations(list_id,family_id);
create index list_item_locations_category_family_idx on public.list_item_locations(family_place_category_id,family_id)where family_place_category_id is not null;
create index list_item_locations_cover_idx on public.list_item_locations(cover_media_id)where cover_media_id is not null;
alter table public.list_item_locations enable row level security;
revoke all on public.list_item_locations from public,anon,authenticated,service_role;
grant select on public.list_item_locations to authenticated;
create policy list_item_locations_active_read on public.list_item_locations for select to authenticated using(
 public.can_view_family_list(list_id)and exists(select 1 from public.list_items i where i.id=item_id and i.list_id=list_item_locations.list_id and i.deleted_at is null));
create policy list_item_locations_aal_restrict on public.list_item_locations as restrictive for all to authenticated
 using(exists(select 1 from public.lists l where l.id=list_id and l.family_id=list_item_locations.family_id
  and public.session_meets_private_assurance(l.family_id)))with check(false);
insert into family_auth.rls_aal_coverage(table_schema,table_name,classification,policy_kind,policy_name)
 values('public','list_item_locations','joined_child','join_lists','list_item_locations_aal_restrict');

create table family_auth.collection_content_permits(
 transaction_id xid8 not null,item_id uuid not null,list_id uuid not null,
 primary key(transaction_id,item_id)
);
alter table family_auth.collection_content_permits enable row level security;
revoke all on family_auth.collection_content_permits from public,anon,authenticated,service_role;
create trigger collection_content_no_truncate before truncate on family_auth.collection_content_permits for each statement execute function family_auth.collection_immutable();

create function family_auth.collection_location_parent_valid(p_name text,p_notes text)returns boolean
language sql immutable set search_path=''as $$
 select p_name is not null and p_name=btrim(p_name)and char_length(p_name)between 1 and 500
 and(p_notes is null or char_length(p_notes)<=20000);
$$;

create function family_auth.collection_location_parent_guard()returns trigger
language plpgsql volatile security definer set search_path=''as $$
begin
 if(new.item_kind='manual'or exists(select 1 from public.list_item_locations where item_id=new.id))
  and family_auth.collection_location_parent_valid(new.name,new.notes)is distinct from true then
  raise exception 'Snapshot/manual Collection item requires a trimmed name and bounded notes'using errcode='23514';
 end if;return new;
end;$$;
create trigger ac_collection_location_parent before insert or update on public.list_items for each row execute function family_auth.collection_location_parent_guard();

create function family_auth.collection_location_consistent()returns trigger
language plpgsql volatile security definer set search_path=''as $$
declare i public.list_items%rowtype;item uuid;
begin
 if tg_table_name='list_items'then item:=new.id;else item:=new.item_id;end if;
 select *into i from public.list_items where id=item;
 if i.item_kind='manual'and not exists(select 1 from public.list_item_locations where item_id=i.id)then
  raise exception 'Manual Collection item requires its scoped location content'using errcode='23514';end if;
 if exists(select 1 from public.list_item_locations where item_id=i.id)and
  (i.item_kind not in('place','food','hotel','experience','manual')or family_auth.collection_location_parent_valid(i.name,i.notes)is distinct from true)then
  raise exception 'Invalid materialized Collection location'using errcode='23514';end if;
 return null;
end;$$;
create constraint trigger collection_location_complete after insert or update on public.list_items deferrable initially deferred for each row execute function family_auth.collection_location_consistent();
create constraint trigger collection_location_complete after insert or update on public.list_item_locations deferrable initially deferred for each row execute function family_auth.collection_location_consistent();

create function family_auth.collection_location_guard()returns trigger
language plpgsql volatile security definer set search_path=''as $$
declare l public.lists%rowtype;i public.list_items%rowtype;m public.media_assets%rowtype;media uuid;unchanged boolean:=false;
begin
 if tg_op in('DELETE','TRUNCATE')then raise exception 'Retained Collection location content cannot be physically removed'using errcode='0A000';end if;
 if tg_op='UPDATE'then
  if(new.item_id,new.list_id,new.family_id)is distinct from(old.item_id,old.list_id,old.family_id)then raise exception 'Collection location identity is immutable'using errcode='23514';end if;
  unchanged:=to_jsonb(new)is not distinct from to_jsonb(old);
 end if;
 if auth.uid()is null then
  if current_setting('role')in('anon','authenticated','service_role')then raise exception 'Current Collection actor required'using errcode='42501';end if;
  select *into l from public.lists where id=new.list_id for no key update;
 else l:=family_auth.collection_require(new.list_id,'items',true);end if;
 if l.id is null or l.family_id is distinct from new.family_id then raise exception 'Same-Family Collection required'using errcode='23514';end if;
 if l.deleted_at is not null or l.archived_at is not null then raise exception 'Restore and unarchive Collection first'using errcode='PT409';end if;
 select *into i from public.list_items where id=new.item_id and list_id=new.list_id for update;
 if i.id is null then raise exception 'Scoped Collection item required'using errcode='23503';end if;
 if i.deleted_at is not null then raise exception 'Restore Collection item first'using errcode='PT409';end if;
 if i.item_kind not in('place','food','hotel','experience','manual')or family_auth.collection_location_parent_valid(i.name,i.notes)is distinct from true then
  raise exception 'Valid typed location name/notes required'using errcode='23514';end if;
 if unchanged then return new;end if;
 if new.family_place_category_id is not null then
  perform 1 from public.family_place_categories where id=new.family_place_category_id and family_id=new.family_id for share;
  if not found then raise exception 'Same-Family category required'using errcode='23503';end if;
 end if;
 for media in select distinct x from unnest(array[new.cover_media_id,case when tg_op='UPDATE'then old.cover_media_id else null end])x where x is not null order by x loop
  perform family_auth.collection_media_hold(media);
  select *into m from public.media_assets where id=media;
  if m.id is null or not(m.visibility='public_catalog'or(m.visibility='family'and m.family_id=new.family_id and m.bucket='family'))then
   raise exception 'Collection media is not representable under this Family authority'using errcode='42501';end if;
 end loop;
 insert into family_auth.collection_content_permits values(pg_current_xact_id(),i.id,i.list_id);
 -- Before the child changes, the parent guard captures its old committed child.
 update public.list_items set name=name where id=i.id;
 delete from family_auth.collection_content_permits where transaction_id=pg_current_xact_id()and item_id=i.id;
 return new;
end;$$;
create trigger aa_collection_location_guard before insert or update or delete on public.list_item_locations for each row execute function family_auth.collection_location_guard();
create trigger aa_collection_location_no_truncate before truncate on public.list_item_locations for each statement execute function family_auth.collection_location_guard();

create function family_auth.collection_location_capture_final()returns trigger
language plpgsql volatile security definer set search_path=''as $$
declare i public.list_items%rowtype;
begin
 select *into i from public.list_items where id=new.item_id;
 if i.recovery_xid=pg_current_xact_id()then perform family_auth.collection_capture_snapshot('item',to_jsonb(i));end if;
 return null;
end;$$;
create constraint trigger collection_location_capture_commit after insert or update on public.list_item_locations deferrable initially deferred for each row execute function family_auth.collection_location_capture_final();

alter table public.list_items drop constraint list_items_airline_id_fkey;
alter table public.list_items add constraint list_items_airline_id_fkey FOREIGN KEY (airline_id) REFERENCES airlines(id) ON DELETE RESTRICT;

alter table public.list_items drop constraint list_items_airport_id_fkey;
alter table public.list_items add constraint list_items_airport_id_fkey FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE RESTRICT;

alter table public.list_items drop constraint list_items_country_id_fkey;
alter table public.list_items add constraint list_items_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE RESTRICT;

alter table public.list_items drop constraint list_items_experience_id_fkey;
alter table public.list_items add constraint list_items_experience_id_fkey FOREIGN KEY (experience_id) REFERENCES experiences(id) ON DELETE RESTRICT;

alter table public.list_items drop constraint list_items_food_id_fkey;
alter table public.list_items add constraint list_items_food_id_fkey FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE RESTRICT;

alter table public.list_items drop constraint list_items_guide_id_fkey;
alter table public.list_items add constraint list_items_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE RESTRICT;

alter table public.list_items drop constraint list_items_hotel_id_fkey;
alter table public.list_items add constraint list_items_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE RESTRICT;

alter table public.list_items drop constraint list_items_place_id_fkey;
alter table public.list_items add constraint list_items_place_id_fkey FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION family_auth.collection_row_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare root_row public.lists%rowtype;material boolean;detaching boolean:=false;permit_action text;old_body jsonb;new_body jsonb;media_id uuid;
begin
 if tg_op in('DELETE','TRUNCATE')then raise exception 'Collection content requires recoverable Trash; purge unavailable'using errcode='0A000';end if;
 if tg_op='UPDATE'then
  if(new.revision,new.recovery_xid)is distinct from(old.revision,old.recovery_xid)then raise exception 'Collection revisions are server managed'using errcode='22023';end if;
  if tg_table_name='lists'then
   if(new.id,new.family_id,new.owner_person_id,new.owner_party_id,new.owner_branch_id,new.owner_council_id,new.created_at)is distinct from(old.id,old.family_id,old.owner_person_id,old.owner_party_id,old.owner_branch_id,old.owner_council_id,old.created_at)then raise exception 'Collection identity immutable'using errcode='23514';end if;
   if new.lifecycle_revision<>old.lifecycle_revision then raise exception 'Collection lifecycle is server managed'using errcode='22023';end if;
  else
   if(new.id,new.list_id,new.item_kind,new.country_id,new.place_id,new.food_id,new.hotel_id,new.experience_id,new.airport_id,new.airline_id,new.guide_id,new.added_at,new.added_by_person_id)
    is distinct from(old.id,old.list_id,old.item_kind,old.country_id,old.place_id,old.food_id,old.hotel_id,old.experience_id,old.airport_id,old.airline_id,old.guide_id,old.added_at,old.added_by_person_id)then raise exception 'Collection item identity immutable'using errcode='23514';end if;
   detaching:=old.source_trip_id is not null and new.source_trip_id is null and
    (to_jsonb(new)-'source_trip_id')is not distinct from(to_jsonb(old)-'source_trip_id');
  end if;
  old_body:=to_jsonb(old)-array['updated_at','revision','recovery_xid','lifecycle_revision'];
  new_body:=to_jsonb(new)-array['updated_at','revision','recovery_xid','lifecycle_revision'];
  material:=old_body is distinct from new_body;
  if tg_table_name='list_items'then material:=material or exists(select 1 from family_auth.collection_content_permits where transaction_id=pg_current_xact_id()and item_id=new.id and list_id=new.list_id);end if;
  if not material then return new;end if;
 else
  if new.revision<>1 or new.recovery_xid is not null or new.deleted_at is not null or new.deleted_by_user_id is not null then raise exception 'New Collection content must be active and unversioned'using errcode='22023';end if;
  if tg_table_name='lists'then
   if new.lifecycle_revision<>0 then raise exception 'New Collection lifecycle must be zero'using errcode='22023';end if;
  end if;
 end if;
 if tg_table_name='list_items'then
  select *into root_row from public.lists where id=new.list_id for no key update;
  if not detaching and(root_row.deleted_at is not null or root_row.archived_at is not null)then raise exception 'Restore and unarchive Collection first'using errcode='PT409';end if;
  if not detaching and auth.uid()is not null then
   perform family_auth.collection_pin_authority(root_row.family_id);
   if not family_auth.collection_allowed(root_row.id,'items')then raise exception 'Collection item authority required'using errcode='42501';end if;
  end if;
 else
  if auth.uid()is not null then
   perform family_auth.collection_pin_authority(new.family_id);
   if tg_op='UPDATE'and not family_auth.collection_allowed(new.id,'recovery_root')then raise exception 'Collection administration required'using errcode='42501';end if;
   if new.visibility='family'and not(public.is_super_admin()or public.can_review_access(new.family_id))and(tg_op='INSERT'or new.visibility is distinct from old.visibility)then raise exception 'Family visibility requires reviewer'using errcode='42501';end if;
  end if;
 end if;
 if auth.uid()is null and current_setting('role')in('anon','authenticated','service_role')then raise exception 'Current actor required'using errcode='42501';end if;
 if tg_op='UPDATE'then
  if(new.deleted_at,new.deleted_by_user_id)is distinct from(old.deleted_at,old.deleted_by_user_id)then
   permit_action:=case when new.deleted_at is null then 'restore'else'trash'end;
   if not exists(select 1 from family_auth.collection_lifecycle_permits p where p.transaction_id=pg_current_xact_id()
    and p.collection_id=case when tg_table_name='lists'then new.id else root_row.id end and p.target_id=new.id
    and p.target_kind=case when tg_table_name='lists'then'collection'else'item'end
    and p.actor_user_id=auth.uid()and p.action=permit_action)then raise exception 'Observed Collection lifecycle command required'using errcode='42501';end if;
  elsif old.deleted_at is not null and not detaching then raise exception 'Restore Collection content before editing'using errcode='PT409';end if;
  if tg_table_name='lists'then
   for media_id in select distinct x from unnest(array[old.cover_media_id,new.cover_media_id])x where x is not null order by x loop
    perform family_auth.collection_media_hold(media_id);
   end loop;
  end if;
  if old.recovery_xid is distinct from pg_current_xact_id()then perform family_auth.collection_capture_snapshot(case when tg_table_name='lists'then'root'else'item'end,to_jsonb(old));end if;
  new.revision:=old.revision+case when old.recovery_xid=pg_current_xact_id()then 0 else 1 end;
  if tg_table_name='lists'then new.lifecycle_revision:=old.lifecycle_revision+case when(new.deleted_at,new.archived_at)is distinct from(old.deleted_at,old.archived_at)then 1 else 0 end;end if;
 end if;
 new.recovery_xid:=pg_current_xact_id();return new;
end;$function$;

CREATE OR REPLACE FUNCTION family_auth.private_media_is_referenced(p_media_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$select (select (select p_media_id is not null and (
    exists (select 1 from public.people pe where pe.avatar_media_id = p_media_id)
    or exists (select 1 from public.lists l where l.cover_media_id = p_media_id)
    or exists (select 1 from public.journeys j where j.cover_media_id = p_media_id)
    or exists (select 1 from public.journey_media x where x.media_id = p_media_id)
    or exists (select 1 from public.person_media x where x.media_id = p_media_id)
    or exists (select 1 from public.trip_media x where x.media_id = p_media_id)
    or exists (select 1 from public.itinerary_media x where x.media_id = p_media_id)
    or exists (select 1 from public.country_media x where x.media_id = p_media_id)
    or exists (select 1 from public.place_media x where x.media_id = p_media_id)
    or exists (select 1 from public.experience_media x where x.media_id = p_media_id)
    or exists (select 1 from public.food_media x where x.media_id = p_media_id)
    or exists (select 1 from public.hotel_media x where x.media_id = p_media_id)
    or exists (select 1 from public.guide_media x where x.media_id = p_media_id)
    or exists (select 1 from public.airport_media x where x.media_id = p_media_id)
    or exists (select 1 from public.airline_media x where x.media_id = p_media_id)
    or exists (select 1 from public.hotels x where x.cover_media_id = p_media_id)
    or exists (select 1 from public.foods x where x.cover_media_id = p_media_id)
    or exists (select 1 from public.experiences x where x.cover_media_id = p_media_id)
    or exists (select 1 from public.places x where x.cover_media_id = p_media_id)
  )) or exists(select 1 from family_auth.collection_root_version_media where media_asset_id=p_media_id) or exists(select 1 from family_auth.collection_item_version_media where media_asset_id=p_media_id))or exists(select 1 from public.list_item_locations where cover_media_id=p_media_id);$function$;

CREATE OR REPLACE FUNCTION family_auth.collection_media_identity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if(new.bucket,new.storage_path,new.content_hash,new.family_id,new.visibility)is distinct from(old.bucket,old.storage_path,old.content_hash,old.family_id,old.visibility)
  and(exists(select 1 from public.lists where cover_media_id=old.id) or exists(select 1 from public.list_item_locations where cover_media_id=old.id)
   or exists(select 1 from family_auth.collection_root_version_media where media_asset_id=old.id)
   or exists(select 1 from family_auth.collection_item_version_media where media_asset_id=old.id))then
  raise exception 'Retained Collection media originals are immutable'using errcode='0A000';
 end if;return new;
end;$function$;

create or replace function family_auth.collection_capture_snapshot(p_kind text,p_snapshot jsonb)returns void
language plpgsql volatile security definer set search_path=''as $$
declare cover uuid;loc jsonb;category_snapshot jsonb;existing_snapshot jsonb;existing_location jsonb;row public.list_item_locations%rowtype;
begin
 if p_kind='root'then
  cover:=(p_snapshot->>'cover_media_id')::uuid;perform family_auth.collection_media_hold(cover);
  insert into family_auth.collection_root_versions(collection_id,revision,actor_user_id,snapshot)
   values((p_snapshot->>'id')::uuid,(p_snapshot->>'revision')::bigint,auth.uid(),p_snapshot-'recovery_xid')on conflict do nothing;
  select snapshot into existing_snapshot from family_auth.collection_root_versions where collection_id=(p_snapshot->>'id')::uuid and revision=(p_snapshot->>'revision')::bigint;
  if existing_snapshot-'updated_at'is distinct from p_snapshot-array['recovery_xid','updated_at']then
   raise exception 'Collection revision is already sealed; finish in a new transaction'using errcode='PT409';end if;
  if cover is not null then insert into family_auth.collection_root_version_media values((p_snapshot->>'id')::uuid,(p_snapshot->>'revision')::bigint,cover)on conflict do nothing;end if;
 elsif p_kind='item'then
  select *into row from public.list_item_locations where item_id=(p_snapshot->>'id')::uuid and list_id=(p_snapshot->>'list_id')::uuid;
  if found then
   loc:=to_jsonb(row);cover:=row.cover_media_id;
   if row.family_place_category_id is not null then
    select jsonb_build_object('id',id,'name',name,'color_hex',color_hex,'icon_key',icon_key)into category_snapshot
     from public.family_place_categories where id=row.family_place_category_id and family_id=row.family_id for share;
    loc:=loc||jsonb_build_object('category_snapshot',category_snapshot);
   end if;
   perform family_auth.collection_media_hold(cover);
  end if;
  insert into family_auth.collection_item_versions(collection_id,item_id,revision,actor_user_id,snapshot,location_snapshot)
   values((p_snapshot->>'list_id')::uuid,(p_snapshot->>'id')::uuid,(p_snapshot->>'revision')::bigint,auth.uid(),p_snapshot-'recovery_xid',loc)on conflict do nothing;
  select snapshot,location_snapshot into existing_snapshot,existing_location from family_auth.collection_item_versions
   where collection_id=(p_snapshot->>'list_id')::uuid and item_id=(p_snapshot->>'id')::uuid and revision=(p_snapshot->>'revision')::bigint;
  if existing_snapshot is distinct from p_snapshot-'recovery_xid'or
   existing_location-'category_snapshot'is distinct from loc-'category_snapshot'then
   raise exception 'Collection item revision is already sealed; finish in a new transaction'using errcode='PT409';end if;
  if cover is not null then insert into family_auth.collection_item_version_media values((p_snapshot->>'list_id')::uuid,(p_snapshot->>'id')::uuid,(p_snapshot->>'revision')::bigint,cover)on conflict do nothing;end if;
 else raise exception 'Unknown Collection snapshot kind'using errcode='22023';end if;
end;$$;


alter table public.list_item_locations owner to postgres;
alter table family_auth.collection_content_permits owner to postgres;
create or replace trigger collection_media_original_immutable before update of bucket,storage_path,content_hash,family_id,visibility on public.media_assets
 for each row execute function family_auth.collection_media_identity_guard();
do $private$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='family_auth'and p.proname like 'collection_location_%'loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn);
  execute format('alter function %s owner to postgres',fn);
 end loop;
end;$private$;
comment on table public.list_item_locations is 'Independent typed Collection location snapshot. Absence is reference mode; NULL/empty fields in an existing child do not inherit. No native authoring/transfer activation.';
comment on table family_auth.collection_content_permits is 'Unchecked caller-inaccessible transaction capability for one parent revision touch before a typed child change; never a client-set GUC.';
commit;
