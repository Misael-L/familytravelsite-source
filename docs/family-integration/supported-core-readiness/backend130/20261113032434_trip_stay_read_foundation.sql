-- U05-B2b1: recoverable planned stays and bounded reads; commands remain disabled.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- NULL preserves unclassified legacy intent without UPDATEs to original rows/audits.
alter table public.trip_reservations add column timing_kind text, add column time_zone text;
alter table public.trip_reservations add constraint booking_timing_classification check(case
 when timing_kind is null then time_zone is null
 when timing_kind='legacy_unclassified' then time_zone is null
 when timing_kind='untimed' then starts_at is null and ends_at is null and time_zone is null
 when timing_kind='timed' then type in('hotel','restaurant','event','tour','other')and time_zone is not null
  and num_nonnulls(starts_at,ends_at)>0 and(starts_at is null or isfinite(starts_at))and(ends_at is null or isfinite(ends_at))
 else false end);

comment on column public.trip_reservations.timing_kind is 'NULL/legacy_unclassified retain legacy instants without guessing intent. Named-zone timing commands are not activated by this migration.';

create table public.trip_stays(
 id uuid primary key default gen_random_uuid(), trip_id uuid not null, family_id uuid not null, location_id uuid not null,
 arrival_date date not null check(isfinite(arrival_date)), departure_date date not null check(isfinite(departure_date)),
 check_in_time time(0),check_in_window_end time(0),check_out_time time(0),
 check_in_window_end_day_offset smallint not null default 0,time_zone text,
 notes text check(notes is null or octet_length(notes)<=20000),
 created_by_person_id uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 revision bigint not null default 1 check(revision>0),deleted_at timestamptz,deleted_by_person_id uuid,
 unique(id,trip_id),
 foreign key(trip_id,family_id)references public.trips(id,family_id)on delete restrict,
 foreign key(location_id,trip_id)references public.trip_plan_locations(id,trip_id)on delete restrict,
 foreign key(created_by_person_id,family_id)references public.people(id,family_id)on delete restrict,
 foreign key(deleted_by_person_id,family_id)references public.people(id,family_id)on delete restrict,
 check(departure_date>=arrival_date),check((deleted_at is null)=(deleted_by_person_id is null)),
 check(check_in_time is null or check_in_time<time '24:00'),check(check_out_time is null or check_out_time<time '24:00'),
 check(check_in_window_end is null or check_in_window_end<time '24:00'),
 check(check_in_window_end_day_offset in(0,1)),
 check((check_in_window_end is null and check_in_window_end_day_offset=0)or
  (check_in_window_end is not null and check_in_time is not null and
   ((check_in_window_end_day_offset=0 and check_in_window_end>=check_in_time)or
    (check_in_window_end_day_offset=1 and check_in_window_end<check_in_time))))
);
create index trip_stays_active_idx on public.trip_stays(trip_id,arrival_date,id)where deleted_at is null;
create index trip_stays_trash_idx on public.trip_stays(trip_id,deleted_at,id)where deleted_at is not null;
create index trip_stays_location_idx on public.trip_stays(location_id,trip_id);
create index trip_stays_trip_idx on public.trip_stays(trip_id,family_id);
create index trip_stays_family_idx on public.trip_stays(family_id);
create index trip_stays_creator_idx on public.trip_stays(created_by_person_id,family_id);
create index trip_stays_delete_actor_idx on public.trip_stays(deleted_by_person_id,family_id)where deleted_by_person_id is not null;
create table public.trip_stay_booking_links(
 reservation_id uuid primary key,stay_id uuid not null unique,trip_id uuid not null,
 foreign key(reservation_id,trip_id)references public.trip_reservations(id,trip_id)on delete restrict,
 foreign key(stay_id,trip_id)references public.trip_stays(id,trip_id)on delete restrict
);
create index trip_stay_booking_trip_idx on public.trip_stay_booking_links(trip_id,reservation_id);
alter table public.trip_stays enable row level security;
alter table public.trip_stay_booking_links enable row level security;
revoke all on public.trip_stays,public.trip_stay_booking_links from public,anon,authenticated,service_role;
grant select on public.trip_stays,public.trip_stay_booking_links to authenticated;

create function family_auth.stay_session_current()returns boolean
language plpgsql stable security definer set search_path='' as $$
declare sid uuid;session_text text:=auth.jwt()->>'session_id';
begin
 if auth.uid()is null or session_text is null then return false;end if;
 begin sid:=session_text::uuid;exception when invalid_text_representation then return false;end;
 return exists(select 1 from auth.sessions s where s.id=sid and s.user_id=auth.uid()
  and(s.not_after is null or s.not_after>statement_timestamp()));
end;$$;
revoke all on function family_auth.stay_session_current()from public,anon,authenticated,service_role;

create function family_auth.stay_read_allowed(p_trip uuid,p_family uuid,p_location uuid)returns boolean
language sql stable security definer set search_path='' as $$
 select family_auth.stay_session_current()and public.is_active_member_of(p_family)
 and public.session_meets_trip_assurance(p_trip) and exists(select 1 from public.people p
  where p.family_id=p_family and p.user_id=auth.uid()and p.archived_at is null)
 and exists(select 1 from public.trips t join public.trip_plan_locations l on l.trip_id=t.id
  where t.id=p_trip and t.family_id=p_family and t.deleted_at is null and l.id=p_location and l.family_id=p_family
   and l.deleted_at is null and(l.catalog_hotel_id is not null or num_nonnulls(l.catalog_place_id,l.catalog_food_id,l.catalog_hotel_id,l.catalog_experience_id)=0));
$$;
revoke all on function family_auth.stay_read_allowed(uuid,uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function family_auth.stay_read_allowed(uuid,uuid,uuid)to authenticated;
create policy stays_read on public.trip_stays for select to authenticated
 using(deleted_at is null and family_auth.stay_read_allowed(trip_id,family_id,location_id));
create policy links_read on public.trip_stay_booking_links for select to authenticated
 using(exists(select 1 from public.trip_stays s where s.id=stay_id and s.trip_id=trip_stay_booking_links.trip_id));
create policy trip_aggregate_active on public.trip_stays as restrictive for select to authenticated using(family_auth.trip_is_active(trip_id));
create policy trip_aggregate_active on public.trip_stay_booking_links as restrictive for select to authenticated using(family_auth.trip_is_active(trip_id));
create trigger aa_trip_aggregate_child before insert or update or delete on public.trip_stays for each row execute function family_auth.tg_trip_aggregate_child();
create trigger aa_trip_aggregate_child before insert or update or delete on public.trip_stay_booking_links for each row execute function family_auth.tg_trip_aggregate_child();

create function family_auth.tg_stay_guard()returns trigger language plpgsql security definer set search_path='' as $$
declare l public.trip_plan_locations%rowtype;material boolean;
begin
 if tg_op='DELETE'then raise exception 'Stay requires Trash; purge is not installed'using errcode='0A000';end if;
 select * into l from public.trip_plan_locations where id=new.location_id and trip_id=new.trip_id for update;
 if l.id is null or l.family_id is distinct from new.family_id then raise exception 'Same-Trip lodging location required'using errcode='23503';end if;
 if l.catalog_hotel_id is null and num_nonnulls(l.catalog_place_id,l.catalog_food_id,l.catalog_hotel_id,l.catalog_experience_id)<>0 then
  raise exception 'A city/country/food/experience is not a lodging identity'using errcode='23514';end if;
 if new.deleted_at is null and l.deleted_at is not null then raise exception 'Restore the lodging location first'using errcode='23514';end if;
 if exists(select 1 from public.trip_stay_booking_links b join public.trip_reservations r on r.id=b.reservation_id and r.trip_id=b.trip_id
  where b.stay_id=new.id and b.trip_id=new.trip_id and r.hotel_id is not null and r.hotel_id is distinct from l.catalog_hotel_id)then
  raise exception 'Linked booking and lodging must identify the same catalog hotel'using errcode='23514';end if;
 if new.time_zone is not null then perform family_auth.validate_named_visit_zone(new.time_zone);end if;
 if tg_op='INSERT'then
  if new.deleted_at is not null then raise exception 'New stay must be active'using errcode='23514';end if;
  new.revision:=1;
 else
  if(new.id,new.trip_id,new.family_id,new.created_at,new.created_by_person_id)is distinct from(old.id,old.trip_id,old.family_id,old.created_at,old.created_by_person_id)then
   raise exception 'Stay identity is immutable'using errcode='23514';end if;
  if old.deleted_at is not null and new.deleted_at is not null then raise exception 'Restore the stay before editing it'using errcode='40001';end if;
  material:=(to_jsonb(new)-array['updated_at','revision'])is distinct from(to_jsonb(old)-array['updated_at','revision'])or new.revision is distinct from old.revision;
  new.revision:=old.revision+case when material then 1 else 0 end;
 end if;
 new.updated_at:=clock_timestamp();return new;
end;$$;
revoke all on function family_auth.tg_stay_guard()from public,anon,authenticated,service_role;
create trigger ab_stay_guard before insert or update or delete on public.trip_stays for each row execute function family_auth.tg_stay_guard();

create function family_auth.tg_stay_location_guard()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.trip_stays s where s.location_id=old.id and s.trip_id=old.trip_id and s.deleted_at is null)
  and(new.deleted_at is not null or(new.catalog_hotel_id is null and num_nonnulls(new.catalog_place_id,new.catalog_food_id,new.catalog_hotel_id,new.catalog_experience_id)<>0))then
  raise exception 'Active stays retain their lodging location; Trash stays first'using errcode='0A000';end if;
 return new;
end;$$;
revoke all on function family_auth.tg_stay_location_guard()from public,anon,authenticated,service_role;
create trigger ac_stay_location_guard before update on public.trip_plan_locations for each row execute function family_auth.tg_stay_location_guard();

create function family_auth.tg_stay_booking_guard()returns trigger language plpgsql security definer set search_path='' as $$
declare s public.trip_stays%rowtype;r public.trip_reservations%rowtype;
begin
 if tg_op='DELETE'then return old;end if;
 if tg_op='UPDATE'and(new.reservation_id,new.trip_id)is distinct from(old.reservation_id,old.trip_id)then raise exception 'Link identity is immutable; use explicit unlink/link'using errcode='23514';end if;
 select * into s from public.trip_stays where id=new.stay_id and trip_id=new.trip_id for update;
 select * into r from public.trip_reservations where id=new.reservation_id and trip_id=new.trip_id for update;
 if s.id is null or r.id is null then raise exception 'Same-Trip stay and booking required'using errcode='23503';end if;
 if s.deleted_at is not null or r.type<>'hotel'then raise exception 'Active stay and hotel booking required'using errcode='23514';end if;
 if r.hotel_id is not null and not exists(select 1 from public.trip_plan_locations l
  where l.id=s.location_id and l.trip_id=s.trip_id and l.catalog_hotel_id=r.hotel_id)then
  raise exception 'Booking hotel does not match the planned lodging identity'using errcode='23514';end if;
 return new;
end;$$;
create function family_auth.tg_stay_link_revision()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op in('DELETE','UPDATE')then update public.trip_stays set revision=revision+1 where id=old.stay_id and trip_id=old.trip_id;end if;
 if tg_op='INSERT'or(tg_op='UPDATE'and new.stay_id is distinct from old.stay_id)then update public.trip_stays set revision=revision+1 where id=new.stay_id and trip_id=new.trip_id;end if;
 return null;
end;$$;
revoke all on function family_auth.tg_stay_booking_guard(),family_auth.tg_stay_link_revision()from public,anon,authenticated,service_role;
create trigger ab_stay_booking_guard before insert or update or delete on public.trip_stay_booking_links for each row execute function family_auth.tg_stay_booking_guard();
create trigger stay_link_revision after insert or update or delete on public.trip_stay_booking_links for each row execute function family_auth.tg_stay_link_revision();

create function family_auth.tg_booking_timing_foundation()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT'then
  if new.timing_kind is null then
   new.timing_kind:=case when new.type in('hotel','restaurant','event','tour','other')and new.starts_at is null and new.ends_at is null then 'untimed'else 'legacy_unclassified'end;
  end if;
 else
  if(new.timing_kind,new.time_zone)is distinct from(old.timing_kind,old.time_zone)
   or(old.timing_kind in('untimed','timed')and(new.starts_at,new.ends_at,new.type)is distinct from(old.starts_at,old.ends_at,old.type))then
   raise exception 'Classified booking timing requires its qualified observed command'using errcode='0A000';end if;
  if new.type<>'hotel'and exists(select 1 from public.trip_stay_booking_links l where l.reservation_id=old.id)then
   raise exception 'Linked stay requires its hotel booking identity'using errcode='23514';end if;
  if new.hotel_id is not null and exists(select 1 from public.trip_stay_booking_links b
   join public.trip_stays s on s.id=b.stay_id and s.trip_id=b.trip_id
   join public.trip_plan_locations l on l.id=s.location_id and l.trip_id=s.trip_id
   where b.reservation_id=old.id and new.hotel_id is distinct from l.catalog_hotel_id)then
   raise exception 'Booking hotel must retain the linked lodging identity'using errcode='23514';end if;
 end if;
 if new.time_zone is not null then perform family_auth.validate_named_visit_zone(new.time_zone);end if;
 return new;
end;$$;
revoke all on function family_auth.tg_booking_timing_foundation()from public,anon,authenticated,service_role;
create trigger ab_booking_timing_foundation before insert or update on public.trip_reservations for each row execute function family_auth.tg_booking_timing_foundation();

create function family_auth.stay_projection(s public.trip_stays)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('stay',to_jsonb(s),'location',family_auth.trip_location_projection(l),
  'arrival_day_id',(select d.id from public.trip_days d where d.trip_id=s.trip_id and d.civil_day=s.arrival_date),
  'departure_day_id',(select d.id from public.trip_days d where d.trip_id=s.trip_id and d.civil_day=s.departure_date),
  'link',to_jsonb(b),'booking',case when b.reservation_id is not null then family_auth.booking_detail_state(s.trip_id,b.reservation_id)end)
 from public.trip_plan_locations l left join public.trip_stay_booking_links b on b.stay_id=s.id and b.trip_id=s.trip_id
 where l.id=s.location_id and l.trip_id=s.trip_id;
$$;
revoke all on function family_auth.stay_projection(public.trip_stays)from public,anon,authenticated,service_role;
create function public.get_family_trip_stay_view_v1(p_trip_id uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype;rows jsonb;result jsonb;
begin
 t:=family_auth.require_trip_location_access(p_trip_id,false);
 if family_auth.stay_session_current()is distinct from true then raise exception 'Current Auth session required'using errcode='42501';end if;
 if(select count(*)from public.trip_stays where trip_id=t.id and deleted_at is null)>2000 then raise exception 'Stay read exceeds2000 rows'using errcode='54000';end if;
 if exists(select 1 from public.trip_stays s left join public.trip_plan_locations l on l.id=s.location_id and l.trip_id=s.trip_id
  where s.trip_id=t.id and s.deleted_at is null and(l.id is null or l.family_id<>t.family_id or l.deleted_at is not null or
   (l.catalog_hotel_id is null and num_nonnulls(l.catalog_place_id,l.catalog_food_id,l.catalog_hotel_id,l.catalog_experience_id)<>0)))then
  raise exception 'Stay snapshot contains an unavailable lodging identity'using errcode='23514';end if;
 select coalesce(jsonb_agg(family_auth.stay_projection(s)order by s.arrival_date,s.id),'[]')into rows from public.trip_stays s where s.trip_id=t.id and s.deleted_at is null;
 result:=jsonb_build_object('version',1,'trip_id',t.id,'family_id',t.family_id,'user_id',auth.uid(),'person_id',family_auth.actor_person_id(t.family_id),
  'trip_revision',t.revision,'completeness','complete','stays',rows,'capabilities',jsonb_build_object('read',true,'commands',false));
 if octet_length(result::text)>8388608 then raise exception 'Stay snapshot exceeds8MiB'using errcode='54000';end if;
 return result;
end;$$;
create function public.get_family_stay_editor_v1(p_trip_id uuid,p_stay_id uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.trips%rowtype;s public.trip_stays%rowtype;result jsonb;
begin
 t:=family_auth.require_trip_location_access(p_trip_id,false);
 if family_auth.stay_session_current()is distinct from true then raise exception 'Current Auth session required'using errcode='42501';end if;
 select * into s from public.trip_stays where id=p_stay_id and trip_id=t.id and family_id=t.family_id;
 if s.id is null or(s.deleted_at is not null and public.can_trip_action_direct(t.id,'trip.schedule.manage')is distinct from true)then raise exception 'Stay editor is not authorized'using errcode='42501';end if;
 result:=jsonb_build_object('version',1,'trip_id',t.id,'family_id',t.family_id,'user_id',auth.uid(),'person_id',family_auth.actor_person_id(t.family_id),
  'trip_revision',t.revision,'state',case when s.deleted_at is null then 'active'else 'trash'end,'observation',family_auth.stay_projection(s),
  'capabilities',jsonb_build_object('read',true,'commands',false));
 if octet_length(result::text)>262144 then raise exception 'Stay editor exceeds256KiB'using errcode='54000';end if;
 return result;
end;$$;
revoke all on function public.get_family_trip_stay_view_v1(uuid),public.get_family_stay_editor_v1(uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.get_family_trip_stay_view_v1(uuid),public.get_family_stay_editor_v1(uuid,uuid)to authenticated;

-- Preserve exporter scope/ACL and insert only two explicit same-Trip table projections.
do $export$ declare definition text;needle text;addition text;begin
 select pg_get_functiondef('public.build_family_export_v1(uuid)'::regprocedure)into definition;
 if encode(sha256(convert_to(definition,'UTF8')),'hex')<>'4eab5b0f00abfdd74009537e912cbc2a60db9741e75dc334d7759822288eaeb4'then raise exception 'Qualified129 export definition drift'using errcode='22023';end if;
 needle:=$n$  v_put := family_auth.export_put(v_tables, v_counts, 'trip_reservations', v_rows);
  v_tables := v_put -> 'tables'; v_counts := v_put -> 'counts';$n$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Exact export insertion point required'using errcode='22023';end if;
 addition:=$a$
  select coalesce(jsonb_agg(to_jsonb(s)order by s.id),'[]'::jsonb)into v_rows from public.trip_stays s where s.trip_id=any(v_trip_ids);
  v_put:=family_auth.export_put(v_tables,v_counts,'trip_stays',v_rows);v_tables:=v_put->'tables';v_counts:=v_put->'counts';
  select coalesce(jsonb_agg(to_jsonb(l)order by l.reservation_id),'[]'::jsonb)into v_rows from public.trip_stay_booking_links l where l.trip_id=any(v_trip_ids);
  v_put:=family_auth.export_put(v_tables,v_counts,'trip_stay_booking_links',v_rows);v_tables:=v_put->'tables';v_counts:=v_put->'counts';
$a$;
 execute replace(definition,needle,needle||addition);
end;$export$;
notify pgrst,'reload schema';
commit;
