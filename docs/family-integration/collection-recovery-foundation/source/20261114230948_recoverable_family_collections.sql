-- U04-F5c1: retained Collections; local qualification only. Native writes remain gated.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

alter table public.lists
 add column revision bigint not null default 1 check(revision>0),
 add column recovery_xid xid8,
 add column deleted_at timestamptz check(deleted_at is null or isfinite(deleted_at)),
 add column deleted_by_user_id uuid references auth.users(id) on delete restrict,
 add column lifecycle_revision bigint not null default 0 check(lifecycle_revision>=0),
 add constraint lists_deleted_actor_pair check((deleted_at is null)=(deleted_by_user_id is null)),
 add constraint lists_id_family_recovery_key unique(id,family_id);
alter table public.list_items
 add column revision bigint not null default 1 check(revision>0),
 add column recovery_xid xid8,
 add column deleted_at timestamptz check(deleted_at is null or isfinite(deleted_at)),
 add column deleted_by_user_id uuid references auth.users(id) on delete restrict,
 add constraint list_items_deleted_actor_pair check((deleted_at is null)=(deleted_by_user_id is null)),
 add constraint list_items_id_list_recovery_key unique(id,list_id);
create index lists_trash_recovery_idx on public.lists(family_id,deleted_at desc,id) where deleted_at is not null;
create index list_items_trash_recovery_idx on public.list_items(list_id,deleted_at desc,id) where deleted_at is not null;
create index lists_deleted_user_idx on public.lists(deleted_by_user_id)where deleted_by_user_id is not null;
create index list_items_deleted_user_idx on public.list_items(deleted_by_user_id)where deleted_by_user_id is not null;

create table family_auth.collection_state(
 list_id uuid primary key references public.lists(id)on delete restrict,
 content_revision bigint not null check(content_revision>0)
);
create table family_auth.collection_root_versions(
 collection_id uuid not null references public.lists(id)on delete restrict,
 revision bigint not null check(revision>0),schema_version smallint not null default 1 check(schema_version=1),
 recorded_at timestamptz not null default clock_timestamp(),
 actor_user_id uuid references auth.users(id)on delete restrict,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'and snapshot?&array['id','family_id','revision']),
 primary key(collection_id,revision)
);
create table family_auth.collection_item_versions(
 collection_id uuid not null,item_id uuid not null,revision bigint not null check(revision>0),
 schema_version smallint not null default 1 check(schema_version=1),recorded_at timestamptz not null default clock_timestamp(),
 actor_user_id uuid references auth.users(id)on delete restrict,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'and snapshot?&array['id','list_id','revision']),
 location_snapshot jsonb check(location_snapshot is null or jsonb_typeof(location_snapshot)='object'),
 primary key(collection_id,item_id,revision),
 foreign key(item_id,collection_id)references public.list_items(id,list_id)on delete restrict
);
create index collection_item_versions_item_idx on family_auth.collection_item_versions(item_id,collection_id,revision desc);
create index collection_root_versions_actor_idx on family_auth.collection_root_versions(actor_user_id)where actor_user_id is not null;
create index collection_item_versions_actor_idx on family_auth.collection_item_versions(actor_user_id)where actor_user_id is not null;
create table family_auth.collection_root_version_media(
 collection_id uuid not null,revision bigint not null,media_asset_id uuid not null references public.media_assets(id)on delete restrict,
 primary key(collection_id,revision,media_asset_id),
 foreign key(collection_id,revision)references family_auth.collection_root_versions(collection_id,revision)on delete restrict
);
create table family_auth.collection_item_version_media(
 collection_id uuid not null,item_id uuid not null,revision bigint not null,media_asset_id uuid not null references public.media_assets(id)on delete restrict,
 primary key(collection_id,item_id,revision,media_asset_id),
 foreign key(collection_id,item_id,revision)references family_auth.collection_item_versions(collection_id,item_id,revision)on delete restrict
);
create index collection_root_version_media_asset_idx on family_auth.collection_root_version_media(media_asset_id);
create index collection_item_version_media_asset_idx on family_auth.collection_item_version_media(media_asset_id);
create table family_auth.collection_operation_receipts(
 actor_user_id uuid not null references auth.users(id)on delete restrict,
 operation_id uuid not null,family_id uuid not null,collection_id uuid not null,item_id uuid,
 original_session_id uuid not null,original_person_id uuid,
 action text not null check(action in('trash','restore')),
 request_sha256 bytea not null check(octet_length(request_sha256)=32),
 status text not null check(status in('committed','cancelled')),
 result jsonb not null check(jsonb_typeof(result)='object'),created_at timestamptz not null default clock_timestamp(),
 primary key(actor_user_id,operation_id),
 foreign key(collection_id,family_id)references public.lists(id,family_id)on delete restrict,
 foreign key(item_id,collection_id)references public.list_items(id,list_id)on delete restrict,
 foreign key(original_person_id,family_id)references public.people(id,family_id)on delete restrict
);
create index collection_receipts_list_family_idx on family_auth.collection_operation_receipts(collection_id,family_id);
create index collection_receipts_family_idx on family_auth.collection_operation_receipts(family_id);
create index collection_receipts_item_idx on family_auth.collection_operation_receipts(item_id,collection_id)where item_id is not null;
create index collection_receipts_person_idx on family_auth.collection_operation_receipts(original_person_id,family_id)where original_person_id is not null;

-- Internal, transaction-scoped capabilities, never a caller-controlled GUC.
-- Only the fully checked entry can insert; its row is removed before it returns.
create table family_auth.collection_lifecycle_permits(
 transaction_id xid8 not null,collection_id uuid not null,target_kind text not null check(target_kind in('collection','item')),target_id uuid not null,
 actor_user_id uuid not null,action text not null check(action in('trash','restore')),
 primary key(transaction_id,collection_id,target_kind,target_id)
);

create function family_auth.collection_session_current()returns boolean
language plpgsql volatile security definer set search_path=''as $$
declare sid uuid;
begin
 if auth.uid()is null then return false;end if;
 begin sid:=(auth.jwt()->>'session_id')::uuid;exception when invalid_text_representation then return false;end;
 return exists(select 1 from auth.sessions s where s.id=sid and s.user_id=auth.uid()
  and(s.not_after is null or s.not_after>clock_timestamp()));
end;$$;

create function family_auth.collection_family_allowed(p_family uuid)returns boolean
language sql volatile security definer set search_path=''as $$
 select exists(select 1 from public.families where id=p_family)and family_auth.collection_session_current()and public.session_meets_private_assurance(p_family)
 and(public.is_super_admin()or(public.is_active_member_of(p_family)and exists(
  select 1 from public.people p where p.family_id=p_family and p.user_id=auth.uid()and p.archived_at is null)));
$$;

create function family_auth.collection_allowed(p_list uuid,p_mode text)returns boolean
language plpgsql volatile security definer set search_path=''as $$
declare l public.lists%rowtype;owner_ok boolean;admin_ok boolean;item_ok boolean;
begin
 select *into l from public.lists where id=p_list;
 if l.id is null or family_auth.collection_family_allowed(l.family_id)is distinct from true then return false;end if;
 owner_ok:=l.owner_person_id=public.viewer_person_id_for_family(l.family_id);
 admin_ok:=public.is_super_admin()or coalesce(owner_ok,false)or(l.visibility='family'and public.can_review_access(l.family_id));
 item_ok:=public.is_super_admin()or coalesce(owner_ok,false)or l.visibility='family';
 return case p_mode
 when 'view' then l.deleted_at is null and case when l.archived_at is null then item_ok else admin_ok end
 when 'items' then l.deleted_at is null and l.archived_at is null and item_ok
 when 'admin' then l.deleted_at is null and admin_ok
 when 'recovery_root' then admin_ok
 when 'recovery_item' then case when l.archived_at is not null or l.deleted_at is not null then admin_ok else item_ok end
 else false end;
end;$$;

-- In-place replacement preserves OIDs, policy/Storage bindings and existing ACLs.
create or replace function public.can_view_family_list(p_list_id uuid)returns boolean
language sql volatile security definer set search_path=''as $$select family_auth.collection_allowed(p_list_id,'view');$$;
create or replace function public.can_edit_family_list_items(p_list_id uuid)returns boolean
language sql volatile security definer set search_path=''as $$select family_auth.collection_allowed(p_list_id,'items');$$;
create or replace function public.can_admin_family_list(p_list_id uuid)returns boolean
language sql volatile security definer set search_path=''as $$select family_auth.collection_allowed(p_list_id,'admin');$$;
create policy list_items_recovery_active on public.list_items as restrictive for select to authenticated using(deleted_at is null);

create function family_auth.collection_pin_authority(p_family uuid)returns void
language plpgsql volatile security definer set search_path=''as $$
begin
 if family_auth.collection_family_allowed(p_family)is distinct from true then raise exception 'Current Collection authority required'using errcode='42501';end if;
 perform 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid()for share;
 if not found then raise exception 'Current Auth session required'using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid()for share;
 perform 1 from public.family_members where family_id=p_family and user_id=auth.uid()for share;
 perform 1 from public.people where family_id=p_family and user_id=auth.uid()for share;
 perform 1 from auth.mfa_factors where user_id=auth.uid()for share;
 if family_auth.collection_family_allowed(p_family)is distinct from true then raise exception 'Collection authority changed'using errcode='42501';end if;
end;$$;

create function family_auth.collection_require(p_list uuid,p_mode text,p_lock boolean default false)returns public.lists
language plpgsql volatile security definer set search_path=''as $$
declare l public.lists%rowtype;
begin
 if family_auth.collection_allowed(p_list,p_mode)is distinct from true then raise exception 'Collection unavailable'using errcode='42501';end if;
 -- Do not pin membership while waiting on a root: a committed revocation must
 -- become visible after that wait. Pin/recheck authority before the child/write.
 if p_lock then select *into l from public.lists where id=p_list for no key update;
 else select *into l from public.lists where id=p_list;end if;
 if p_lock then perform family_auth.collection_pin_authority(l.family_id);end if;
 if family_auth.collection_allowed(p_list,p_mode)is distinct from true then raise exception 'Collection authority changed'using errcode='42501';end if;
 return l;
end;$$;

create function family_auth.collection_media_hold(p_media uuid)returns void
language plpgsql volatile security definer set search_path=''as $$
declare m public.media_assets%rowtype;locked_media public.media_assets%rowtype;
begin
 if p_media is null then return;end if;
 select *into m from public.media_assets where id=p_media;
 if m.id is null then raise exception 'Collection media unavailable'using errcode='23503';end if;
 perform pg_advisory_xact_lock(hashtextextended('collection-media:'||m.bucket||':'||m.storage_path,0));
 select *into locked_media from public.media_assets where id=p_media for share;
 if not found or(locked_media.bucket,locked_media.storage_path,locked_media.content_hash)is distinct from(m.bucket,m.storage_path,m.content_hash)then raise exception 'Collection media identity changed while waiting'using errcode='PT409';end if;
 if family_auth.cleanup_delete_armed(m.bucket,m.storage_path)then raise exception 'Collection media deletion already armed'using errcode='55000';end if;
end;$$;

create function family_auth.collection_media_identity_guard()returns trigger
language plpgsql volatile security definer set search_path=''as $$
begin
 if(new.bucket,new.storage_path,new.content_hash)is distinct from(old.bucket,old.storage_path,old.content_hash)
  and(exists(select 1 from public.lists where cover_media_id=old.id)
   or exists(select 1 from family_auth.collection_root_version_media where media_asset_id=old.id)
   or exists(select 1 from family_auth.collection_item_version_media where media_asset_id=old.id))then
  raise exception 'Retained Collection media originals are immutable'using errcode='0A000';
 end if;return new;
end;$$;
create trigger collection_media_original_immutable before update of bucket,storage_path,content_hash on public.media_assets
 for each row execute function family_auth.collection_media_identity_guard();

create function family_auth.collection_capture_snapshot(p_kind text,p_snapshot jsonb)returns void
language plpgsql volatile security definer set search_path=''as $$
declare cover uuid;
begin
 if p_kind='root'then
  cover:=(p_snapshot->>'cover_media_id')::uuid;perform family_auth.collection_media_hold(cover);
  insert into family_auth.collection_root_versions(collection_id,revision,actor_user_id,snapshot)
   values((p_snapshot->>'id')::uuid,(p_snapshot->>'revision')::bigint,auth.uid(),p_snapshot-'recovery_xid')on conflict do nothing;
  if cover is not null then insert into family_auth.collection_root_version_media values((p_snapshot->>'id')::uuid,(p_snapshot->>'revision')::bigint,cover)on conflict do nothing;end if;
 else
  insert into family_auth.collection_item_versions(collection_id,item_id,revision,actor_user_id,snapshot)
   values((p_snapshot->>'list_id')::uuid,(p_snapshot->>'id')::uuid,(p_snapshot->>'revision')::bigint,auth.uid(),p_snapshot-'recovery_xid')on conflict do nothing;
 end if;
end;$$;

create function family_auth.collection_row_guard()returns trigger
language plpgsql volatile security definer set search_path=''as $$
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
end;$$;

create function family_auth.collection_capture_final()returns trigger
language plpgsql volatile security definer set search_path=''as $$
declare snapshot jsonb;
begin
 if tg_table_name='lists'then select to_jsonb(l)into snapshot from public.lists l where id=new.id;
 else select to_jsonb(i)into snapshot from public.list_items i where id=new.id;end if;
 if(snapshot->>'recovery_xid')::xid8=pg_current_xact_id()then perform family_auth.collection_capture_snapshot(case when tg_table_name='lists'then'root'else'item'end,snapshot);end if;
 return null;
end;$$;

-- The old generic touch function is shared; replace only this table's trigger.
drop trigger list_items_touch_list on public.list_items;
create function family_auth.collection_item_touch()returns trigger
language plpgsql volatile security definer set search_path=''as $$
begin
 if tg_op='UPDATE'and to_jsonb(new)is not distinct from to_jsonb(old)then return null;end if;
 insert into family_auth.collection_state values(new.list_id,1)
  on conflict(list_id)do update set content_revision=family_auth.collection_state.content_revision+1;
 update public.lists set updated_at=clock_timestamp()where id=new.list_id;
 return null;
end;$$;
create trigger aa_collection_guard before insert or update or delete on public.lists for each row execute function family_auth.collection_row_guard();
create trigger aa_collection_guard before insert or update or delete on public.list_items for each row execute function family_auth.collection_row_guard();
create trigger aa_collection_no_truncate before truncate on public.lists for each statement execute function family_auth.collection_row_guard();
create trigger aa_collection_no_truncate before truncate on public.list_items for each statement execute function family_auth.collection_row_guard();
create trigger list_items_touch_list after insert or update on public.list_items for each row execute function family_auth.collection_item_touch();
create constraint trigger collection_capture_commit after insert or update on public.lists deferrable initially deferred for each row execute function family_auth.collection_capture_final();
create constraint trigger collection_capture_commit after insert or update on public.list_items deferrable initially deferred for each row execute function family_auth.collection_capture_final();

create function family_auth.collection_immutable()returns trigger language plpgsql security definer set search_path=''as $$
begin raise exception 'Collection history and original outcomes are immutable'using errcode='0A000';end;$$;

CREATE OR REPLACE FUNCTION family_auth.private_media_is_referenced(p_media_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$select (select p_media_id is not null and (
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
  )) or exists(select 1 from family_auth.collection_root_version_media where media_asset_id=p_media_id) or exists(select 1 from family_auth.collection_item_version_media where media_asset_id=p_media_id);$function$;

CREATE OR REPLACE FUNCTION family_auth.tg_refuse_armed_list_cover()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if new.cover_media_id is null or(tg_op='UPDATE'and new.cover_media_id is not distinct from old.cover_media_id)then return new;end if;
 perform family_auth.collection_media_hold(new.cover_media_id);return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revalidate_storage_cleanup_job(p_job_id uuid, p_worker_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare collection_bucket text;collection_path text; v_trip uuid; j public.storage_cleanup_jobs%rowtype;
begin
 select bucket_id,object_path into collection_bucket,collection_path from public.storage_cleanup_jobs where id=p_job_id;
 if collection_bucket='family'then
  perform pg_advisory_xact_lock(hashtextextended('collection-media:'||collection_bucket||':'||collection_path,0));
 end if;

 select coalesce(f.trip_id,c.trip_id) into v_trip from public.storage_cleanup_jobs c
 left join public.trip_files f on c.bucket_id='trip-files' and f.storage_path=c.object_path where c.id=p_job_id;
 if v_trip is not null then
  perform pg_advisory_xact_lock(hashtextextended('trip-recovery:'||v_trip::text,0));
  select * into j from public.storage_cleanup_jobs where id=p_job_id for update;
  if j.status='processing' and j.locked_by is not distinct from p_worker_token and j.bucket_id='trip-files' and exists(select 1 from public.trip_files f join family_auth.trip_day_retained_file_links a on(a.file_id,a.trip_id)=(f.id,f.trip_id) where f.storage_path=j.object_path) then
   if j.delete_armed_at is not null then return jsonb_build_object('ok',false,'action','skip','reason','day_recovery_hold_armed_conflict');end if;
   perform family_auth.finish_cleanup_skip(j.id,p_worker_token,'day_recovery_hold');
   return jsonb_build_object('ok',true,'action','skip','reason','day_recovery_hold');
  end if;
  if not family_auth.trip_is_active(v_trip) and j.status='processing' and j.locked_by is not distinct from p_worker_token and j.delete_armed_at is null then
   perform family_auth.finish_cleanup_skip(j.id,p_worker_token,'trip_recovery_hold');
   return jsonb_build_object('ok',true,'action','skip','reason','trip_recovery_hold');
  end if;
 end if;
 return family_auth.revalidate_storage_cleanup_before_trip_recovery(p_job_id,p_worker_token);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_family_list(p_family_id uuid, p_name text, p_visibility list_visibility DEFAULT 'private'::list_visibility, p_description text DEFAULT NULL::text, p_color text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_person uuid;
  v_name text;
  v_color text;
  v_id uuid;
begin
 perform family_auth.collection_pin_authority(p_family_id);
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_family_id is null then
    raise exception 'family_id required' using errcode = '22023';
  end if;
  if not public.is_active_member_of(p_family_id) and not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_name := nullif(btrim(p_name), '');
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'invalid name' using errcode = '22023';
  end if;

  v_color := nullif(btrim(p_color), '');
  if v_color is not null and v_color !~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' then
    raise exception 'invalid color' using errcode = '22023';
  end if;

  if p_visibility = 'family'
     and not public.can_review_access(p_family_id)
     and not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_person := public.resolve_my_person_id(p_family_id);
  if v_person is null then
    raise exception 'No people row for current user' using errcode = '42501';
  end if;

  insert into public.lists (
    family_id, name, list_kind, owner_person_id, visibility, description, color
  ) values (
    p_family_id,
    v_name,
    'wishlist',
    v_person,
    coalesce(p_visibility, 'private'),
    nullif(btrim(p_description), ''),
    v_color
  )
  returning id into v_id;

  return v_id;
end;
$function$;


create or replace function public.remove_list_item(p_item_id uuid)returns void
language plpgsql security definer set search_path=''as $$
begin raise exception 'Collection item removal requires observed Trash and reachable Restore'using errcode='0A000';end;$$;

create function family_auth.collection_scope(p_list public.lists)returns jsonb
language sql volatile security definer set search_path=''as $$
 select jsonb_build_object('version',1,'family_id',p_list.family_id,'collection_id',p_list.id,'user_id',auth.uid(),
 'person_id',public.viewer_person_id_for_family(p_list.family_id),'session_id',(auth.jwt()->>'session_id')::uuid,'lifecycle_revision',p_list.lifecycle_revision);
$$;
create function family_auth.collection_root_metadata(p_list public.lists)returns jsonb
language sql immutable set search_path=''as $$
 select jsonb_build_object('id',p_list.id,'family_id',p_list.family_id,'owner_person_id',p_list.owner_person_id,
 'visibility',p_list.visibility,'revision',p_list.revision,'lifecycle_revision',p_list.lifecycle_revision,
 'archived_at',p_list.archived_at,'deleted_at',p_list.deleted_at);
$$;
create function family_auth.collection_item_metadata(p_item public.list_items)returns jsonb
language sql immutable set search_path=''as $$
 select jsonb_build_object('id',p_item.id,'collection_id',p_item.list_id,'kind',p_item.item_kind,
 'source',jsonb_build_object('kind',p_item.item_kind,'id',coalesce(p_item.country_id,p_item.place_id,p_item.food_id,p_item.hotel_id,p_item.experience_id,p_item.airport_id,p_item.airline_id,p_item.guide_id)),
 'revision',p_item.revision,'status',p_item.status,'sort_order',p_item.sort_order,'deleted_at',p_item.deleted_at);
$$;
create function family_auth.collection_bound(p_result jsonb,p_limit integer)returns jsonb
language plpgsql immutable set search_path=''as $$
begin if octet_length(p_result::text)>p_limit then raise exception 'Collection response exceeds explicit byte limit'using errcode='54000';end if;return p_result;end;$$;

create function family_auth.collection_validate_original(p_original jsonb)returns void
language plpgsql immutable set search_path=''as $$
declare keys text[];s jsonb;v text;
begin
 keys:=array['target_kind','collection_id','scope','action','expected_revision'];
 if p_original->>'target_kind'='item'then keys:=keys||array['item_id','expected_collection_revision'];
 elsif p_original->>'target_kind'is distinct from'collection'then raise exception 'Collection target kind required'using errcode='22023';end if;
 if jsonb_typeof(p_original)is distinct from'object'or not(p_original?&keys)or p_original-keys<>'{}'::jsonb
  or p_original->>'action'is null or p_original->>'action'not in('trash','restore')or jsonb_typeof(p_original->'action')<>'string'
  or jsonb_typeof(p_original->'collection_id')<>'string'or jsonb_typeof(p_original->'expected_revision')<>'number'
  or(p_original->>'expected_revision')!~'^[1-9][0-9]*$'or(p_original->>'expected_revision')::numeric>9223372036854775807 then
  raise exception 'Exact Collection lifecycle original required'using errcode='22023';end if;
 perform(p_original->>'collection_id')::uuid;
 if p_original->>'target_kind'='item'then
  if jsonb_typeof(p_original->'item_id')<>'string'or jsonb_typeof(p_original->'expected_collection_revision')<>'number'
   or(p_original->>'expected_collection_revision')!~'^(0|[1-9][0-9]*)$'or(p_original->>'expected_collection_revision')::numeric>9223372036854775807 then
   raise exception 'Exact Collection item observations required'using errcode='22023';end if;
  perform(p_original->>'item_id')::uuid;
 end if;
 s:=p_original->'scope';keys:=array['version','family_id','collection_id','user_id','person_id','session_id','lifecycle_revision'];
 if jsonb_typeof(s)is distinct from'object'or not(s?&keys)or s-keys<>'{}'::jsonb or s->'version'is distinct from'1'::jsonb
  or jsonb_typeof(s->'lifecycle_revision')<>'number'or(s->>'lifecycle_revision')!~'^(0|[1-9][0-9]*)$'
  or(s->>'lifecycle_revision')::numeric>9223372036854775807 then raise exception 'Exact original Collection scope required'using errcode='22023';end if;
 foreach v in array array['family_id','collection_id','user_id','session_id']loop
  if jsonb_typeof(s->v)<>'string'then raise exception 'Scope UUID string required'using errcode='22023';end if;perform(s->>v)::uuid;
 end loop;
 if s->'person_id'<>'null'::jsonb then
  if jsonb_typeof(s->'person_id')<>'string'then raise exception 'Scope person UUID required'using errcode='22023';end if;perform(s->>'person_id')::uuid;
 end if;
 if s->'collection_id'is distinct from p_original->'collection_id'then raise exception 'Collection scope mismatch'using errcode='22023';end if;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid Collection original value'using errcode='22023';
end;$$;

create function family_auth.collection_execute(p_operation uuid,p_original jsonb,p_cancel boolean)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare l public.lists%rowtype;i public.list_items%rowtype;r family_auth.collection_operation_receipts%rowtype;
 s jsonb;kind text;action text;target uuid;item_id uuid;digest bytea;result jsonb;changed boolean;content bigint;
begin
 if p_operation is null or p_cancel is null or octet_length(p_original::text)>65536 then raise exception 'Bounded original operation required'using errcode='22023';end if;
 perform family_auth.collection_validate_original(p_original);
 if not family_auth.collection_session_current()then raise exception 'Current Collection session required'using errcode='42501';end if;
 s:=p_original->'scope';kind:=p_original->>'target_kind';action:=p_original->>'action';item_id:=(p_original->>'item_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('collection-operation:'||auth.uid()::text||':'||p_operation::text,0));
 l:=family_auth.collection_require((p_original->>'collection_id')::uuid,case when kind='collection'then'recovery_root'else'recovery_item'end,true);
 if s-array['session_id','lifecycle_revision']is distinct from family_auth.collection_scope(l)-array['session_id','lifecycle_revision']then raise exception 'Collection original belongs to another actor or context'using errcode='PT409';end if;
 if not p_cancel and s->>'session_id'is distinct from auth.jwt()->>'session_id'then raise exception 'Original execution session changed'using errcode='PT409';end if;
 if item_id is not null then
  select *into i from public.list_items where id=item_id and list_id=l.id for update;
  if not found then raise exception 'Collection item unavailable'using errcode='42501';end if;
 end if;
 if not family_auth.collection_allowed(l.id,case when kind='collection'then'recovery_root'else'recovery_item'end)then raise exception 'Collection authority changed'using errcode='42501';end if;
 digest:=sha256(convert_to(p_original::text,'UTF8'));target:=case when kind='collection'then l.id else i.id end;
 select *into r from family_auth.collection_operation_receipts where actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.request_sha256<>digest or r.collection_id<>l.id or r.family_id<>l.family_id then raise exception 'Collection original operation reused'using errcode='PT409';end if;
  return r.result;
 end if;
 if p_cancel then
  result:=jsonb_build_object('version',1,'operation_id',p_operation,'status','cancelled','action',action,'target_kind',kind,'target_id',target);
 else
  select coalesce((select content_revision from family_auth.collection_state where list_id=l.id),0)into content;
  if(s->>'lifecycle_revision')::bigint<>l.lifecycle_revision
   or(p_original->>'expected_revision')::bigint<>(case when kind='collection'then l.revision else i.revision end)
   or(kind='item'and(p_original->>'expected_collection_revision')::bigint<>content)then raise exception 'Collection observation is stale'using errcode='PT409';end if;
  if kind='item'and(l.deleted_at is not null or l.archived_at is not null)then raise exception 'Restore and unarchive parent Collection first'using errcode='PT409';end if;
  changed:=case when kind='collection'then(l.deleted_at is null)else(i.deleted_at is null)end=(action='trash');
  if changed then
   insert into family_auth.collection_lifecycle_permits values(pg_current_xact_id(),l.id,kind,target,auth.uid(),action);
   if kind='collection'then
    update public.lists set deleted_at=case when action='trash'then clock_timestamp()else null end,
     deleted_by_user_id=case when action='trash'then auth.uid()else null end where id=l.id returning *into l;
   else
    update public.list_items set deleted_at=case when action='trash'then clock_timestamp()else null end,
     deleted_by_user_id=case when action='trash'then auth.uid()else null end where id=i.id returning *into i;
   end if;
   delete from family_auth.collection_lifecycle_permits where transaction_id=pg_current_xact_id()and collection_id=l.id and target_kind=kind and target_id=target;
  end if;
  select coalesce((select content_revision from family_auth.collection_state where list_id=l.id),0)into content;
  result:=jsonb_build_object('version',1,'operation_id',p_operation,'status','committed','action',action,'target_kind',kind,'target_id',target,
   'revision',case when kind='collection'then l.revision else i.revision end,'collection_revision',l.revision,'content_revision',content,'changed',changed);
 end if;
 insert into family_auth.collection_operation_receipts(actor_user_id,operation_id,family_id,collection_id,item_id,original_session_id,original_person_id,action,request_sha256,status,result)
 values(auth.uid(),p_operation,l.family_id,l.id,item_id,(s->>'session_id')::uuid,(s->>'person_id')::uuid,action,digest,case when p_cancel then'cancelled'else'committed'end,result);
 -- Deferred history is part of this same transaction; a late failure aborts the
 -- mutation and receipt. PostgREST sends no successful response before COMMIT.
 return result;
end;$$;

create function family_auth.collection_entry(p_entry text,p_args jsonb)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
<<c_entry>>
declare keys text[];l public.lists%rowtype;i public.list_items%rowtype;r record;receipt family_auth.collection_operation_receipts%rowtype;
 list_id uuid;item_id uuid;family_id uuid;operation_id uuid;lim integer;cursor_time timestamptz;cursor_id uuid;cursor_rev bigint;
 result jsonb;items jsonb:='[]';next_cursor jsonb;num integer:=0;content bigint;original jsonb;
begin
 keys:=case p_entry
 when 'context'then array['collection_id','state']when 'item_context'then array['collection_id','item_id']
 when 'trash'then array['family_id','limit','before_deleted_at','before_id']
 when 'item_trash'then array['collection_id','limit','before_deleted_at','before_id']
 when 'versions'then array['collection_id','item_id','limit','before_revision']
 when 'execute'then array['collection_id','operation_id','scope','action','expected_revision']
 when 'execute_item'then array['collection_id','item_id','operation_id','scope','action','expected_revision','expected_collection_revision']
 when 'outcome'then array['family_id','operation_id']when 'cancel'then array['family_id','operation_id','original']else null end;
 if keys is null or jsonb_typeof(p_args)is distinct from'object'or not(p_args?&keys)or p_args-keys<>'{}'::jsonb or octet_length(p_args::text)>65536 then raise exception 'Exact bounded Collection entry arguments required'using errcode='22023';end if;
 if not family_auth.collection_session_current()then raise exception 'Current Collection session required'using errcode='42501';end if;
 list_id:=(p_args->>'collection_id')::uuid;item_id:=(p_args->>'item_id')::uuid;family_id:=(p_args->>'family_id')::uuid;operation_id:=(p_args->>'operation_id')::uuid;
 if p_entry in('execute','execute_item')then
  original:=p_args-'operation_id'||jsonb_build_object('target_kind',case when p_entry='execute'then'collection'else'item'end);
  return family_auth.collection_execute(operation_id,original,false);
 elsif p_entry='cancel'then
  if family_id is null or(p_args->'original'->'scope'->>'family_id')::uuid is distinct from family_id then raise exception 'Original Family scope required'using errcode='22023';end if;
  return family_auth.collection_execute(operation_id,p_args->'original',true);
 elsif p_entry='outcome'then
  if family_id is null or operation_id is null then raise exception 'Family and operation required'using errcode='22023';end if;
  if not family_auth.collection_family_allowed(family_id)then raise exception 'Current Family authority required'using errcode='42501';end if;
  select *into receipt from family_auth.collection_operation_receipts where actor_user_id=auth.uid()and collection_operation_receipts.operation_id=c_entry.operation_id;
  if not found then return jsonb_build_object('version',1,'operation_id',operation_id,'status','unknown');end if;
  if receipt.family_id<>family_id then raise exception 'Original Family conflict'using errcode='PT409';end if;
  perform family_auth.collection_require(receipt.collection_id,case when receipt.item_id is null then'recovery_root'else'recovery_item'end);
  return receipt.result;
 end if;
 if p_entry in('trash','item_trash','versions')then
  if jsonb_typeof(p_args->'limit')is distinct from'number'or(p_args->>'limit')!~'^[1-9][0-9]*$'then raise exception 'Finite page limit required'using errcode='22023';end if;
  lim:=(p_args->>'limit')::integer;if lim not between 1 and 100 then raise exception 'Page limit outside 1..100'using errcode='22023';end if;
  cursor_time:=(p_args->>'before_deleted_at')::timestamptz;cursor_id:=(p_args->>'before_id')::uuid;
  if(cursor_time is null)<>(cursor_id is null)or(cursor_time is not null and not isfinite(cursor_time))then raise exception 'Complete finite Trash cursor required'using errcode='22023';end if;
 end if;
 if p_entry='trash'then
  if not family_auth.collection_family_allowed(family_id)then raise exception 'Current Family authority required'using errcode='42501';end if;
  if cursor_id is not null and not exists(select 1 from public.lists x where x.id=cursor_id and x.family_id=c_entry.family_id and x.deleted_at=cursor_time and family_auth.collection_allowed(x.id,'recovery_root'))then raise exception 'Trash cursor is not in this authorized Family page'using errcode='22023';end if;
  for l in select x.*from public.lists x where x.family_id=c_entry.family_id and x.deleted_at is not null
   and family_auth.collection_allowed(x.id,'recovery_root')and(cursor_time is null or x.deleted_at<cursor_time or(x.deleted_at=cursor_time and x.id>cursor_id))
   order by x.deleted_at desc,x.id limit lim+1 loop
   num:=num+1;if num>lim then exit;end if;
   items:=items||jsonb_build_array(family_auth.collection_root_metadata(l));next_cursor:=jsonb_build_object('before_deleted_at',l.deleted_at,'before_id',l.id);
  end loop;
 elsif p_entry in('context','item_context','item_trash','versions')then
  if p_entry='context'and(p_args->>'state'is null or p_args->>'state'not in('active','archived','trash'))then raise exception 'Explicit Collection state required'using errcode='22023';end if;
  l:=family_auth.collection_require(list_id,case when p_entry='context'and p_args->>'state'='active'then'view'when p_entry='context'then'recovery_root'else'recovery_item'end);
  if p_entry in('context','item_context')then
   if p_entry='context'and(p_args->>'state'is null or p_args->>'state'not in('active','archived','trash')or p_args->>'state'is distinct from case when l.deleted_at is not null then'trash'when l.archived_at is not null then'archived'else'active'end)then raise exception 'Explicit Collection state mismatch'using errcode='PT409';end if;
   select coalesce((select content_revision from family_auth.collection_state where collection_state.list_id=l.id),0)into content;
   result:=jsonb_build_object('version',1,'scope',family_auth.collection_scope(l),'collection',family_auth.collection_root_metadata(l),'collection_revision',l.revision,'content_revision',content,
    'item_counts',(select jsonb_build_object('active',count(*)filter(where deleted_at is null),'trash',count(*)filter(where deleted_at is not null))from public.list_items where list_items.list_id=l.id));
   if p_entry='item_context'then
    select *into i from public.list_items where id=item_id and list_items.list_id=l.id;
    if not found then raise exception 'Scoped Collection item unavailable'using errcode='42501';end if;
    result:=result||jsonb_build_object('item',family_auth.collection_item_metadata(i));
   end if;
   return family_auth.collection_bound(result,65536);
  elsif p_entry='item_trash'then
   if cursor_id is not null and not exists(select 1 from public.list_items x where x.id=cursor_id and x.list_id=l.id and x.deleted_at=cursor_time)then raise exception 'Trash cursor is not in this Collection'using errcode='22023';end if;
   for i in select x.*from public.list_items x where x.list_id=l.id and x.deleted_at is not null
    and(cursor_time is null or x.deleted_at<cursor_time or(x.deleted_at=cursor_time and x.id>cursor_id))order by x.deleted_at desc,x.id limit lim+1 loop
    num:=num+1;if num>lim then exit;end if;
    items:=items||jsonb_build_array(family_auth.collection_item_metadata(i));next_cursor:=jsonb_build_object('before_deleted_at',i.deleted_at,'before_id',i.id);
   end loop;
  else
   if item_id is not null and not exists(select 1 from public.list_items where id=item_id and list_items.list_id=l.id)then raise exception 'Scoped Collection item unavailable'using errcode='42501';end if;
   if p_args->'before_revision'<>'null'::jsonb and(jsonb_typeof(p_args->'before_revision')<>'number'or(p_args->>'before_revision')!~'^[1-9][0-9]*$')then raise exception 'Positive revision cursor required'using errcode='22023';end if;
   cursor_rev:=(p_args->>'before_revision')::bigint;
   for r in select v.revision,v.schema_version,v.recorded_at,v.snapshot,null::jsonb as location_snapshot from family_auth.collection_root_versions v
    where c_entry.item_id is null and v.collection_id=l.id and(cursor_rev is null or v.revision<cursor_rev)
    union all select v.revision,v.schema_version,v.recorded_at,v.snapshot,v.location_snapshot from family_auth.collection_item_versions v
    where c_entry.item_id is not null and v.collection_id=l.id and v.item_id=c_entry.item_id and(cursor_rev is null or v.revision<cursor_rev)
    order by revision desc limit lim+1 loop
    num:=num+1;if num>lim then exit;end if;
    items:=items||jsonb_build_array(jsonb_build_object('revision',r.revision,'schema_version',r.schema_version,'recorded_at',r.recorded_at,'snapshot',r.snapshot-array['recovery_xid','deleted_by_user_id'],'location_snapshot',r.location_snapshot));
    next_cursor:=jsonb_build_object('before_revision',r.revision);
   end loop;
  end if;
 else raise exception 'Collection entry unavailable'using errcode='22023';end if;
 return family_auth.collection_bound(jsonb_build_object('version',1,'items',items,'next_cursor',case when num>lim then next_cursor else null end),8388608);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then raise exception 'Invalid Collection argument value'using errcode='22023';
end;$$;

create function public.get_family_collection_context_v1(p_collection_id uuid,p_state text default 'active')returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_entry('context',jsonb_build_object('collection_id',p_collection_id,'state',p_state));$$;
revoke all on function public.get_family_collection_context_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_family_collection_context_v1(uuid,text) to authenticated;

create function public.get_family_collection_item_context_v1(p_collection_id uuid,p_item_id uuid)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_entry('item_context',jsonb_build_object('collection_id',p_collection_id,'item_id',p_item_id));$$;
revoke all on function public.get_family_collection_item_context_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_family_collection_item_context_v1(uuid,uuid) to authenticated;

create function public.list_family_collection_trash_v1(p_family_id uuid,p_limit integer default 50,p_before_deleted_at timestamptz default NULL,p_before_id uuid default NULL)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_entry('trash',jsonb_build_object('family_id',p_family_id,'limit',p_limit,'before_deleted_at',p_before_deleted_at,'before_id',p_before_id));$$;
revoke all on function public.list_family_collection_trash_v1(uuid,integer,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_family_collection_trash_v1(uuid,integer,timestamptz,uuid) to authenticated;

create function public.list_family_collection_item_trash_v1(p_collection_id uuid,p_limit integer default 50,p_before_deleted_at timestamptz default NULL,p_before_id uuid default NULL)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_entry('item_trash',jsonb_build_object('collection_id',p_collection_id,'limit',p_limit,'before_deleted_at',p_before_deleted_at,'before_id',p_before_id));$$;
revoke all on function public.list_family_collection_item_trash_v1(uuid,integer,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_family_collection_item_trash_v1(uuid,integer,timestamptz,uuid) to authenticated;

create function public.execute_family_collection_lifecycle_v1(p_collection_id uuid,p_operation_id uuid,p_scope jsonb,p_action text,p_expected_revision bigint)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_entry('execute',jsonb_build_object('collection_id',p_collection_id,'operation_id',p_operation_id,'scope',p_scope,'action',p_action,'expected_revision',p_expected_revision));$$;
revoke all on function public.execute_family_collection_lifecycle_v1(uuid,uuid,jsonb,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.execute_family_collection_lifecycle_v1(uuid,uuid,jsonb,text,bigint) to authenticated;

create function public.execute_family_collection_item_lifecycle_v1(p_collection_id uuid,p_item_id uuid,p_operation_id uuid,p_scope jsonb,p_action text,p_expected_revision bigint,p_expected_collection_revision bigint)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_entry('execute_item',jsonb_build_object('collection_id',p_collection_id,'item_id',p_item_id,'operation_id',p_operation_id,'scope',p_scope,'action',p_action,'expected_revision',p_expected_revision,'expected_collection_revision',p_expected_collection_revision));$$;
revoke all on function public.execute_family_collection_item_lifecycle_v1(uuid,uuid,uuid,jsonb,text,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.execute_family_collection_item_lifecycle_v1(uuid,uuid,uuid,jsonb,text,bigint,bigint) to authenticated;

create function public.list_family_collection_versions_v1(p_collection_id uuid,p_item_id uuid default NULL,p_limit integer default 25,p_before_revision bigint default NULL)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_entry('versions',jsonb_build_object('collection_id',p_collection_id,'item_id',p_item_id,'limit',p_limit,'before_revision',p_before_revision));$$;
revoke all on function public.list_family_collection_versions_v1(uuid,uuid,integer,bigint) from public,anon,authenticated,service_role;
grant execute on function public.list_family_collection_versions_v1(uuid,uuid,integer,bigint) to authenticated;

create function public.get_family_collection_operation_v1(p_family_id uuid,p_operation_id uuid)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_entry('outcome',jsonb_build_object('family_id',p_family_id,'operation_id',p_operation_id));$$;
revoke all on function public.get_family_collection_operation_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_family_collection_operation_v1(uuid,uuid) to authenticated;

create function public.cancel_family_collection_operation_v1(p_family_id uuid,p_operation_id uuid,p_original jsonb)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_entry('cancel',jsonb_build_object('family_id',p_family_id,'operation_id',p_operation_id,'original',p_original));$$;
revoke all on function public.cancel_family_collection_operation_v1(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cancel_family_collection_operation_v1(uuid,uuid,jsonb) to authenticated;

alter table family_auth.collection_state enable row level security;
revoke all on family_auth.collection_state from public,anon,authenticated,service_role;

create trigger immutable_collection_truncate before truncate on family_auth.collection_state for each statement execute function family_auth.collection_immutable();

alter table family_auth.collection_root_versions enable row level security;
revoke all on family_auth.collection_root_versions from public,anon,authenticated,service_role;

create trigger immutable_collection_truncate before truncate on family_auth.collection_root_versions for each statement execute function family_auth.collection_immutable();

create trigger immutable_collection_row before update or delete on family_auth.collection_root_versions for each row execute function family_auth.collection_immutable();

create trigger immutable_collection_delete before delete on family_auth.collection_root_versions for each statement execute function family_auth.collection_immutable();

alter table family_auth.collection_item_versions enable row level security;
revoke all on family_auth.collection_item_versions from public,anon,authenticated,service_role;

create trigger immutable_collection_truncate before truncate on family_auth.collection_item_versions for each statement execute function family_auth.collection_immutable();

create trigger immutable_collection_row before update or delete on family_auth.collection_item_versions for each row execute function family_auth.collection_immutable();

create trigger immutable_collection_delete before delete on family_auth.collection_item_versions for each statement execute function family_auth.collection_immutable();

alter table family_auth.collection_root_version_media enable row level security;
revoke all on family_auth.collection_root_version_media from public,anon,authenticated,service_role;

create trigger immutable_collection_truncate before truncate on family_auth.collection_root_version_media for each statement execute function family_auth.collection_immutable();

create trigger immutable_collection_row before update or delete on family_auth.collection_root_version_media for each row execute function family_auth.collection_immutable();

create trigger immutable_collection_delete before delete on family_auth.collection_root_version_media for each statement execute function family_auth.collection_immutable();

alter table family_auth.collection_item_version_media enable row level security;
revoke all on family_auth.collection_item_version_media from public,anon,authenticated,service_role;

create trigger immutable_collection_truncate before truncate on family_auth.collection_item_version_media for each statement execute function family_auth.collection_immutable();

create trigger immutable_collection_row before update or delete on family_auth.collection_item_version_media for each row execute function family_auth.collection_immutable();

create trigger immutable_collection_delete before delete on family_auth.collection_item_version_media for each statement execute function family_auth.collection_immutable();

alter table family_auth.collection_operation_receipts enable row level security;
revoke all on family_auth.collection_operation_receipts from public,anon,authenticated,service_role;

create trigger immutable_collection_truncate before truncate on family_auth.collection_operation_receipts for each statement execute function family_auth.collection_immutable();

create trigger immutable_collection_row before update or delete on family_auth.collection_operation_receipts for each row execute function family_auth.collection_immutable();

create trigger immutable_collection_delete before delete on family_auth.collection_operation_receipts for each statement execute function family_auth.collection_immutable();

alter table family_auth.collection_lifecycle_permits enable row level security;
revoke all on family_auth.collection_lifecycle_permits from public,anon,authenticated,service_role;

create trigger immutable_collection_truncate before truncate on family_auth.collection_lifecycle_permits for each statement execute function family_auth.collection_immutable();


do $acl$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='family_auth'and p.proname like 'collection_%'loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn);
 end loop;
end;$acl$;
grant execute on function family_auth.collection_entry(text,jsonb)to authenticated;
comment on function family_auth.collection_entry(text,jsonb)is 'Checked Collection v1 entry. No transfer/content authoring or native availability activation.';

alter table family_auth.collection_state owner to postgres;
alter table family_auth.collection_root_versions owner to postgres;
alter table family_auth.collection_item_versions owner to postgres;
alter table family_auth.collection_root_version_media owner to postgres;
alter table family_auth.collection_item_version_media owner to postgres;
alter table family_auth.collection_operation_receipts owner to postgres;
alter table family_auth.collection_lifecycle_permits owner to postgres;
do $owners$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where(n.nspname='family_auth'and p.proname like 'collection_%')or(n.nspname='public'and p.proname in(
 'get_family_collection_context_v1','get_family_collection_item_context_v1','list_family_collection_trash_v1','list_family_collection_item_trash_v1',
 'execute_family_collection_lifecycle_v1','execute_family_collection_item_lifecycle_v1','list_family_collection_versions_v1','get_family_collection_operation_v1','cancel_family_collection_operation_v1'))loop
 execute format('alter function %s owner to postgres',fn);
 end loop;
end;$owners$;

commit;
