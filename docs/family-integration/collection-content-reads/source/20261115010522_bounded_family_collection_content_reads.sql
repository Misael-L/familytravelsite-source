-- U04-F5c3. Bounded reads/observations only; no native or authoring activation.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create function family_auth.collection_read_catalog(p_kind text,p_id uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare relation_name text;raw jsonb;projection jsonb;loc public.trip_plan_locations;
begin
 if public.is_active_member_any()is distinct from true and public.can_edit_catalog()is distinct from true then
  raise exception 'Catalog read authority required'using errcode='42501';end if;
 relation_name:=case p_kind when'place'then'places'when'food'then'foods'when'hotel'then'hotels'when'experience'then'experiences'
  when'country'then'countries'when'airport'then'airports'when'airline'then'airlines'when'guide'then'guides'else null end;
 if relation_name is null or p_id is null then raise exception 'Typed catalog source required'using errcode='22023';end if;
 execute format('select to_jsonb(s)from public.%I s where s.id=$1',relation_name)into raw using p_id;
 if raw is null then raise exception 'Collection catalog source unavailable'using errcode='42501';end if;
 if p_kind in('place','food','hotel','experience')then
  loc.catalog_place_id:=case when p_kind='place'then p_id end;loc.catalog_food_id:=case when p_kind='food'then p_id end;
  loc.catalog_hotel_id:=case when p_kind='hotel'then p_id end;loc.catalog_experience_id:=case when p_kind='experience'then p_id end;
  projection:=family_auth.trip_location_projection(loc)-array['id','trip_id','revision','deleted_at','overrides','created_at','updated_at','notes','category'];
 else
  projection:=jsonb_build_object('source',jsonb_build_object('kind',p_kind,'id',p_id),'name',raw->'name','description',raw->'notes',
   'latitude',raw->'latitude','longitude',raw->'longitude','address',null,'website',raw->'website','phone',raw->'telephone',
   'cover_media_id',null,'source_archived',raw->>'archived_at'is not null,'context_place_id',raw->'place_id','country_id',case when p_kind='country'then to_jsonb(p_id)else raw->'country_id'end);
 end if;
 return projection||jsonb_build_object('updated_at',raw->'updated_at','digest',encode(sha256(convert_to(jsonb_build_object('row',raw,'projection',projection)::text,'UTF8')),'hex'));
end;$$;

create function family_auth.collection_read_media(p_media uuid,p_family uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare m public.media_assets%rowtype;thumb text;hero text;v record;
begin
 if p_media is null then return jsonb_build_object('id',null,'availability','absent','thumb_url',null,'hero_url',null);end if;
 select *into m from public.media_assets where id=p_media;
 if m.id is null or m.kind<>'image'or(m.visibility<>'public_catalog'and(m.visibility<>'family'or m.family_id is distinct from p_family))then
  return jsonb_build_object('id',null,'availability','unavailable','thumb_url',null,'hero_url',null);end if;
 if m.visibility='family'then return jsonb_build_object('id',m.id,'availability','private_unavailable','thumb_url',null,'hero_url',null);end if;
 select *into v from public.catalog_media_variants_for_assets(array[m.id],'v1');
 if v.thumb_url~'^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/catalog/variants/v1/[A-Za-z0-9/_-]+\.webp$'then thumb:=v.thumb_url;end if;
 if v.hero_url~'^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/catalog/variants/v1/[A-Za-z0-9/_-]+\.webp$'then hero:=v.hero_url;end if;
 return jsonb_build_object('id',m.id,'availability',case when thumb is not null or hero is not null then'ready_variants'else'placeholder'end,'thumb_url',thumb,'hero_url',hero);
end;$$;

create function family_auth.collection_read_item(p_item public.list_items,p_family uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare child public.list_item_locations%rowtype;source jsonb;content jsonb;category jsonb;source_id uuid;cover uuid;mode text;
begin
 select *into child from public.list_item_locations where item_id=p_item.id;
 mode:=case when child.item_id is null then'reference'else'snapshot'end;
 source_id:=coalesce(p_item.country_id,p_item.place_id,p_item.food_id,p_item.hotel_id,p_item.experience_id,p_item.airport_id,p_item.airline_id,p_item.guide_id);
 if p_item.item_kind<>'manual'then source:=family_auth.collection_read_catalog(p_item.item_kind::text,source_id);end if;
 if mode='snapshot'then
  content:=jsonb_build_object('name',p_item.name,'description',child.description,'latitude',child.latitude,'longitude',child.longitude,
   'address',child.address,'website',child.website,'phone',child.phone);cover:=child.cover_media_id;
  select jsonb_build_object('id',c.id,'name',c.name,'color',c.color_hex,'icon',c.icon_key)into category
   from public.family_place_categories c where c.id=child.family_place_category_id and c.family_id=p_family;
 else
  content:=jsonb_build_object('name',coalesce(to_jsonb(p_item.name),source->'name'),'description',source->'description',
   'latitude',source->'latitude','longitude',source->'longitude','address',source->'address','website',source->'website','phone',source->'phone');
  cover:=(source->>'cover_media_id')::uuid;
 end if;
 return family_auth.collection_bound(family_auth.collection_item_metadata(p_item)||jsonb_build_object(
  'content_mode',mode,'content',content,'notes',p_item.notes,'category',category,
  'geography',case when source is null then null else jsonb_build_object('context_place_id',source->'context_place_id','context_place_name',source->'context_place_name',
   'country_id',source->'country_id','country_name',source->'country_name','country_code',source->'country_code','time_zone',source->'time_zone','source_type_label',source->'source_type_label')end,
  'source_observation',case when source is null then null else jsonb_build_object('kind',p_item.item_kind,'id',source_id,'updated_at',source->'updated_at','digest',source->'digest','archived',source->'source_archived')end,
  'cover',family_auth.collection_read_media(cover,p_family),'native_location_compatible',p_item.item_kind in('place','food','hotel','experience','manual'),
  'added_at',p_item.added_at),262144);
end;$$;

create function family_auth.collection_read_root(p_list public.lists)returns jsonb
language sql stable security definer set search_path=''as $$
 select family_auth.collection_root_metadata(p_list)||jsonb_build_object('name',p_list.name,'description',p_list.description,
 'color',p_list.color,'sort_order',p_list.sort_order,'cover',family_auth.collection_read_media(p_list.cover_media_id,p_list.family_id));
$$;

create function family_auth.collection_read_entry(p_entry text,p_args jsonb)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
<<reader>>
declare l public.lists%rowtype;i public.list_items%rowtype;loc public.trip_plan_locations;t public.trips%rowtype;r record;
 collection_id uuid;item_id uuid;family_id uuid;source_id uuid;source_kind text;source jsonb;source_observation jsonb;identity jsonb;manual_item uuid;
 keys text[];state text;lim integer;cursor jsonb;after_order integer;after_id uuid;content_revision bigint;
 result jsonb;items jsonb:='[]';projected jsonb;next_cursor jsonb;num integer:=0;
begin
 keys:=case p_entry when'page'then array['collection_id','state','limit','cursor']when'editor'then array['collection_id','item_id','state']when'membership'then array['family_id','identity']else null end;
 if keys is null or jsonb_typeof(p_args)is distinct from'object'or not(p_args?&keys)or p_args-keys<>'{}'::jsonb or octet_length(p_args::text)>8192 then
  raise exception 'Exact bounded read arguments required'using errcode='22023';end if;
 if family_auth.collection_session_current()is distinct from true then raise exception 'Current Collection session required'using errcode='42501';end if;
 if p_entry='membership'then
  family_id:=(p_args->>'family_id')::uuid;identity:=p_args->'identity';
  if jsonb_typeof(identity)is distinct from'object'or octet_length(identity::text)>1024 then raise exception 'Exact identity required'using errcode='22023';end if;
  if family_auth.collection_family_allowed(family_id)is distinct from true then raise exception 'Current source Family authority required'using errcode='42501';end if;
  perform family_auth.collection_pin_authority(family_id);
  if identity?&array['kind','id']and identity-array['kind','id']='{}'::jsonb then
   if identity->>'kind'not in('place','food','hotel','experience')or jsonb_typeof(identity->'kind')is distinct from'string'or jsonb_typeof(identity->'id')is distinct from'string'then raise exception 'Typed catalog identity required'using errcode='22023';end if;
   source_kind:=identity->>'kind';source_id:=(identity->>'id')::uuid;source:=family_auth.collection_read_catalog(source_kind,source_id);
   source_observation:=jsonb_build_object('kind',source_kind,'id',source_id,'digest',source->'digest');
  elsif identity?&array['trip_id','location_id']and identity-array['trip_id','location_id']='{}'::jsonb then
   if jsonb_typeof(identity->'trip_id')is distinct from'string'or jsonb_typeof(identity->'location_id')is distinct from'string'then raise exception 'Saved Trip identity required'using errcode='22023';end if;
   t:=family_auth.require_trip_location_access((identity->>'trip_id')::uuid,false);
   if t.family_id is distinct from family_id then raise exception 'Source Family mismatch'using errcode='42501';end if;
   select *into loc from public.trip_plan_locations x where x.id=(identity->>'location_id')::uuid and x.trip_id=t.id and x.family_id=reader.family_id and x.deleted_at is null;
   if loc.id is null then raise exception 'Saved source unavailable'using errcode='42501';end if;
   source_id:=coalesce(loc.catalog_place_id,loc.catalog_food_id,loc.catalog_hotel_id,loc.catalog_experience_id);
   source_kind:=case when loc.catalog_place_id is not null then'place'when loc.catalog_food_id is not null then'food'when loc.catalog_hotel_id is not null then'hotel'when loc.catalog_experience_id is not null then'experience'end;
   if source_kind is null then raise exception 'Manual Trip-to-Collection provenance not implemented'using errcode='0A000';end if;
   source:=family_auth.collection_read_catalog(source_kind,source_id);
   source_observation:=jsonb_build_object('trip_id',t.id,'location_id',loc.id,'location_revision',loc.revision,'kind',source_kind,'id',source_id,'digest',source->'digest');
  elsif identity?&array['collection_id','item_id']and identity-array['collection_id','item_id']='{}'::jsonb then
   if jsonb_typeof(identity->'collection_id')is distinct from'string'or jsonb_typeof(identity->'item_id')is distinct from'string'then raise exception 'Owned manual identity required'using errcode='22023';end if;
   l:=family_auth.collection_require((identity->>'collection_id')::uuid,'view');
   if l.family_id is distinct from family_id or l.owner_person_id is null or l.owner_person_id is distinct from public.viewer_person_id_for_family(family_id)then raise exception 'Owned manual origin required'using errcode='42501';end if;
   select *into i from public.list_items x where x.id=(identity->>'item_id')::uuid and x.list_id=l.id and x.item_kind='manual'and x.deleted_at is null;
   if i.id is null then raise exception 'Owned manual origin unavailable'using errcode='42501';end if;
   manual_item:=i.id;source_observation:=jsonb_build_object('collection_id',l.id,'item_id',i.id,'item_revision',i.revision);
  else raise exception 'Identity has missing or unknown fields'using errcode='22023';end if;
  for r in select x.id collection_id,x.name,x.color,x.sort_order,x.archived_at,j.id item_id,j.status,
   public.can_edit_family_list_items(x.id)can_edit from public.lists x join public.list_items j on j.list_id=x.id
   where x.family_id=reader.family_id and x.deleted_at is null and j.deleted_at is null and family_auth.collection_allowed(x.id,'view')
   and(case when manual_item is not null then j.id=manual_item else j.item_kind::text=source_kind and
    coalesce(j.place_id,j.food_id,j.hotel_id,j.experience_id)=source_id end)
   order by x.sort_order,x.id,j.id limit 201
  loop
   num:=num+1;if num>200 then raise exception 'Complete membership exceeds 200 lists'using errcode='54000';end if;
   items:=items||jsonb_build_array(to_jsonb(r)-'sort_order');
  end loop;
  if t.id is not null then perform family_auth.require_trip_location_access(t.id,false);end if;
  if family_auth.collection_family_allowed(family_id)is distinct from true then raise exception 'Current source authority changed'using errcode='42501';end if;
  return family_auth.collection_bound(jsonb_build_object('version',1,'identity',identity,'source_observation',source_observation,'saved',num>0,'lists',items),2097152);
 end if;
 collection_id:=(p_args->>'collection_id')::uuid;item_id:=(p_args->>'item_id')::uuid;state:=p_args->>'state';
 if state is null or state not in('active','archived')then raise exception 'Explicit Collection state required'using errcode='22023';end if;
 l:=family_auth.collection_require(collection_id,'view',true);
 if(l.archived_at is null)is distinct from(state='active')then raise exception 'Collection state changed'using errcode='PT409';end if;
 select s.content_revision into content_revision from family_auth.collection_state s where s.list_id=l.id;
 content_revision:=coalesce(content_revision,0);
 result:=jsonb_build_object('version',1,'scope',family_auth.collection_scope(l),'collection',family_auth.collection_read_root(l),'content_revision',content_revision);
 if p_entry='editor'then
  select *into i from public.list_items x where x.id=item_id and x.list_id=l.id and x.deleted_at is null;
  if i.id is null then raise exception 'Collection item unavailable'using errcode='42501';end if;
  projected:=family_auth.collection_read_item(i,l.family_id);
  result:=result||jsonb_build_object('item',projected,'observation',jsonb_build_object('version',1,'collection_revision',l.revision,'content_revision',content_revision,
   'lifecycle_revision',l.lifecycle_revision,'item_revision',i.revision,'item_digest',encode(sha256(convert_to(projected::text,'UTF8')),'hex'),'source_digest',projected->'source_observation'->'digest'));
  perform family_auth.collection_require(l.id,'view');return family_auth.collection_bound(result,262144);
 end if;
 if jsonb_typeof(p_args->'limit')is distinct from'number'or(p_args->>'limit')!~'^[1-9][0-9]{0,2}$'then raise exception 'Finite page limit required'using errcode='22023';end if;
 lim:=(p_args->>'limit')::integer;if lim not between 1 and 100 then raise exception 'Page limit outside 1..100'using errcode='22023';end if;
 cursor:=nullif(p_args->'cursor','null'::jsonb);
 if cursor is not null then
  keys:=array['version','collection_id','state','revision','content_revision','lifecycle_revision','sort_order','id'];
  if jsonb_typeof(cursor)is distinct from'object'or not(cursor?&keys)or cursor-keys<>'{}'::jsonb or cursor->'version'<>'1'::jsonb
   or cursor->>'collection_id'is distinct from l.id::text or cursor->>'state'is distinct from state
   or jsonb_typeof(cursor->'id')is distinct from'string'
   or jsonb_typeof(cursor->'sort_order')is distinct from'number'or(cursor->>'sort_order')!~'^-?[0-9]{1,10}$'
   or jsonb_typeof(cursor->'revision')is distinct from'number'or(cursor->>'revision')!~'^[1-9][0-9]{0,18}$'
   or jsonb_typeof(cursor->'content_revision')is distinct from'number'or(cursor->>'content_revision')!~'^[0-9]{1,19}$'
   or jsonb_typeof(cursor->'lifecycle_revision')is distinct from'number'or(cursor->>'lifecycle_revision')!~'^[0-9]{1,19}$'then raise exception 'Exact root-bound finite cursor required'using errcode='22023';end if;
  if(cursor->>'revision')::bigint<>l.revision or(cursor->>'content_revision')::bigint<>content_revision or(cursor->>'lifecycle_revision')::bigint<>l.lifecycle_revision then
   raise exception 'Collection page changed; restart read'using errcode='PT409';end if;
  after_order:=(cursor->>'sort_order')::integer;after_id:=(cursor->>'id')::uuid;
  if not exists(select 1 from public.list_items x where x.id=after_id and x.list_id=l.id and x.sort_order=after_order and x.deleted_at is null)then raise exception 'Cursor item unavailable'using errcode='22023';end if;
 end if;
 for i in select x.*from public.list_items x where x.list_id=l.id and x.deleted_at is null and(after_id is null or(x.sort_order,x.id)>(after_order,after_id))order by x.sort_order,x.id limit lim+1
 loop
  num:=num+1;if num>lim then exit;end if;
  items:=items||jsonb_build_array(family_auth.collection_read_item(i,l.family_id));
  next_cursor:=jsonb_build_object('version',1,'collection_id',l.id,'state',state,'revision',l.revision,'content_revision',content_revision,'lifecycle_revision',l.lifecycle_revision,'sort_order',i.sort_order,'id',i.id);
 end loop;
 if num<=lim then next_cursor:=null;end if;
 perform family_auth.collection_require(l.id,'view');
 return family_auth.collection_bound(result||jsonb_build_object('items',items,'next_cursor',next_cursor),2097152);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid typed Collection read input'using errcode='22023';
end;$$;

revoke all on function family_auth.collection_read_catalog(text,uuid),family_auth.collection_read_media(uuid,uuid),family_auth.collection_read_item(public.list_items,uuid),family_auth.collection_read_root(public.lists),family_auth.collection_read_entry(text,jsonb)from public,anon,authenticated,service_role;
grant usage on schema family_auth to authenticated;
grant execute on function family_auth.collection_read_entry(text,jsonb)to authenticated;
create function public.get_family_collection_page_v1(p_collection_id uuid,p_state text default'active',p_limit integer default 50,p_cursor jsonb default NULL)returns jsonb
 language sql volatile security invoker set search_path=''as $$select family_auth.collection_read_entry('page',jsonb_build_object('collection_id',p_collection_id,'state',p_state,'limit',p_limit,'cursor',p_cursor));$$;
create function public.get_family_collection_editor_v1(p_collection_id uuid,p_item_id uuid,p_state text default'active')returns jsonb
 language sql volatile security invoker set search_path=''as $$select family_auth.collection_read_entry('editor',jsonb_build_object('collection_id',p_collection_id,'item_id',p_item_id,'state',p_state));$$;
create function public.get_family_collection_membership_v1(p_family_id uuid,p_identity jsonb)returns jsonb
 language sql volatile security invoker set search_path=''as $$select family_auth.collection_read_entry('membership',jsonb_build_object('family_id',p_family_id,'identity',p_identity));$$;
revoke all on function public.get_family_collection_page_v1(uuid,text,integer,jsonb),public.get_family_collection_editor_v1(uuid,uuid,text),public.get_family_collection_membership_v1(uuid,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.get_family_collection_page_v1(uuid,text,integer,jsonb),public.get_family_collection_editor_v1(uuid,uuid,text),public.get_family_collection_membership_v1(uuid,jsonb)to authenticated;
commit;
