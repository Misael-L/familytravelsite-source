begin;
set local lock_timeout='5s';set local statement_timeout='90s';
create table family_auth.collection_authoring_commands(
 actor_user_id uuid not null references auth.users(id)on delete restrict,operation_id uuid not null,
 collection_id uuid not null,family_id uuid not null,original_session_id uuid not null,original_person_id uuid,
 request_hash bytea not null check(octet_length(request_hash)=32),original jsonb not null check(jsonb_typeof(original)='object'and octet_length(original::text)<=262144),
 created_at timestamptz not null default clock_timestamp(),primary key(actor_user_id,operation_id),
 foreign key(collection_id,family_id)references public.lists(id,family_id)on delete restrict,
 foreign key(original_person_id,family_id)references public.people(id,family_id)on delete restrict
);
create index collection_authoring_commands_list_idx on family_auth.collection_authoring_commands(collection_id,family_id);
create index collection_authoring_commands_person_idx on family_auth.collection_authoring_commands(original_person_id,family_id)where original_person_id is not null;
create table family_auth.collection_authoring_outcomes(
 actor_user_id uuid not null,operation_id uuid not null,status text not null check(status in('committed','cancelled')),
 result jsonb not null check(jsonb_typeof(result)='object'and octet_length(result::text)<=65536),created_at timestamptz not null default clock_timestamp(),
 primary key(actor_user_id,operation_id),foreign key(actor_user_id,operation_id)references family_auth.collection_authoring_commands(actor_user_id,operation_id)on delete restrict
);
create table family_auth.collection_authoring_context(
 transaction_id xid8 not null,collection_id uuid not null,actor_user_id uuid not null,operation_id uuid not null,item_id uuid,
 action text not null,primary key(transaction_id,collection_id),foreign key(actor_user_id,operation_id)references family_auth.collection_authoring_commands(actor_user_id,operation_id)on delete restrict
);
create table family_auth.collection_authoring_media_holds(
 actor_user_id uuid not null,operation_id uuid not null,media_asset_id uuid not null references public.media_assets(id)on delete restrict,
 primary key(actor_user_id,operation_id,media_asset_id),foreign key(actor_user_id,operation_id)references family_auth.collection_authoring_commands(actor_user_id,operation_id)on delete restrict
);
create index collection_authoring_hold_asset_idx on family_auth.collection_authoring_media_holds(media_asset_id);
do $$declare n text;begin
 foreach n in array array['collection_authoring_commands','collection_authoring_outcomes','collection_authoring_context','collection_authoring_media_holds']loop
  execute format('alter table family_auth.%I enable row level security',n);
  execute format('revoke all on family_auth.%I from public,anon,authenticated,service_role',n);
  execute format('create trigger authoring_no_truncate before truncate on family_auth.%I for each statement execute function family_auth.collection_immutable()',n);
 end loop;
 foreach n in array array['collection_authoring_commands','collection_authoring_outcomes']loop
  execute format('create trigger authoring_immutable_row before update or delete on family_auth.%I for each row execute function family_auth.collection_immutable()',n);
  execute format('create trigger authoring_no_delete before delete on family_auth.%I for each statement execute function family_auth.collection_immutable()',n);
 end loop;
end;$$;

create function family_auth.collection_authoring_gate()returns trigger language plpgsql volatile security definer set search_path=''as $$
declare list_id uuid;item uuid;
begin
 -- A trusted database operator remains able to build explicit test/repair
 -- fixtures. Application sessions/roles never acquire that exemption via JWT.
 if session_user<>'authenticator'and current_setting('role')not in('anon','authenticated','service_role')then return new;end if;
 list_id:=new.list_id;if tg_table_name='list_items'then item:=new.id;else item:=new.item_id;end if;
 if exists(select 1 from family_auth.collection_authoring_context c where c.transaction_id=pg_current_xact_id()and c.collection_id=list_id and c.actor_user_id=auth.uid()
  and(c.item_id=item or(c.action='reorder'and c.item_id is null)))then return new;end if;
 if tg_table_name='list_items'and tg_op='UPDATE'then
  if old.source_trip_id is not null and new.source_trip_id is null and(to_jsonb(old)-array['source_trip_id','revision','recovery_xid','updated_at'])is not distinct from(to_jsonb(new)-array['source_trip_id','revision','recovery_xid','updated_at'])then return new;end if;
  if(to_jsonb(old)-array['deleted_at','deleted_by_user_id','revision','recovery_xid','updated_at'])is not distinct from(to_jsonb(new)-array['deleted_at','deleted_by_user_id','revision','recovery_xid','updated_at'])and exists(
   select 1 from family_auth.collection_lifecycle_permits p where p.transaction_id=pg_current_xact_id()and p.collection_id=list_id and p.target_kind='item'and p.target_id=item and p.actor_user_id=auth.uid())then return new;end if;
 end if;
 raise exception 'Observed Collection authoring command required'using errcode='42501';
end;$$;
create trigger ab_collection_authoring_gate before insert or update on public.list_items for each row execute function family_auth.collection_authoring_gate();
create trigger ab_collection_authoring_gate before insert or update on public.list_item_locations for each row execute function family_auth.collection_authoring_gate();

create function family_auth.collection_authoring_lock_source(p_kind text,p_id uuid)returns void language plpgsql volatile security definer set search_path=''as $$
declare tab text;ok uuid;
begin
 tab:=case p_kind when'place'then'places'when'food'then'foods'when'hotel'then'hotels'when'experience'then'experiences'when'country'then'countries'when'airport'then'airports'when'airline'then'airlines'when'guide'then'guides'end;
 if tab is null or p_id is null then raise exception 'Typed source required'using errcode='22023';end if;
 execute format('select id from public.%I where id=$1 for share',tab)into ok using p_id;
 if ok is null then raise exception 'Source unavailable'using errcode='42501';end if;
end;$$;

create function family_auth.collection_authoring_validate(p_changes jsonb,p_full boolean)returns void language plpgsql immutable set search_path=''as $$
declare k text;v jsonb;allowed text[]:=array['name','description','latitude','longitude','address','website','phone','family_place_category_id','cover_media_id'];n numeric;
begin
 if p_full is null or jsonb_typeof(p_changes)is distinct from'object'or p_changes-allowed<>'{}'::jsonb or(p_full and not(p_changes?&allowed))then raise exception 'Exact location fields required'using errcode='22023';end if;
 if(p_changes?'latitude')<>(p_changes?'longitude')then raise exception 'Coordinate pair required'using errcode='22023';end if;
 for k,v in select *from jsonb_each(p_changes)loop
  if k in('latitude','longitude')then
   if v<>'null'::jsonb then
    if jsonb_typeof(v)<>'number'then raise exception 'Numeric coordinate required'using errcode='22023';end if;
    n:=(v#>>'{}')::numeric;if n<>round(n,8)or(k='latitude'and n not between -90 and 90)or(k='longitude'and n not between -180 and 180) then raise exception 'Normalize finite coordinates before observation'using errcode='22023';end if;
   end if;
  elsif v<>'null'::jsonb and jsonb_typeof(v)<>'string'then raise exception 'String or explicit NULL required'using errcode='22023';
  elsif k='name'and(v='null'::jsonb or family_auth.collection_location_parent_valid(v#>>'{}',null)is distinct from true)then raise exception 'Trimmed bounded name required'using errcode='22023';
  elsif k='description'and char_length(v#>>'{}')>20000 then raise exception 'Description exceeds bound'using errcode='22023';
  elsif k='address'and char_length(v#>>'{}')>2000 then raise exception 'Address exceeds bound'using errcode='22023';
  elsif k='phone'and char_length(v#>>'{}')>100 then raise exception 'Phone exceeds bound'using errcode='22023';
  elsif k='website'and family_auth.collection_location_website_valid(v#>>'{}')is distinct from true then raise exception 'Normalize canonical HTTP(S) URL before observation'using errcode='22023';
  elsif k in('family_place_category_id','cover_media_id')and v<>'null'::jsonb then
   if(v#>>'{}')::uuid::text<>v#>>'{}'then raise exception 'Canonical UUID required'using errcode='22023';end if;
  end if;
 end loop;
 if(p_changes?'latitude')and(p_changes->'latitude'='null'::jsonb)<>(p_changes->'longitude'='null'::jsonb)then raise exception 'Nullable coordinate pair required'using errcode='22023';end if;
end;$$;

create function family_auth.collection_authoring_observe(p_list public.lists,p_target jsonb)returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare result jsonb;obs jsonb;i public.list_items%rowtype;editor jsonb;source jsonb;kind text;entity uuid;items jsonb;
begin
 if jsonb_typeof(p_target)is distinct from'object'or octet_length(p_target::text)>2048 then raise exception 'Bounded exact target required'using errcode='22023';end if;
 obs:=jsonb_build_object('version',1,'collection_revision',p_list.revision,'content_revision',coalesce((select content_revision from family_auth.collection_state where list_id=p_list.id),0),
 'lifecycle_revision',p_list.lifecycle_revision,'item_revision',null,'item_digest',null,'source_digest',null);
 result:=jsonb_build_object('version',1,'scope',family_auth.collection_scope(p_list));
 if p_target='{}'::jsonb then
  select jsonb_agg(jsonb_build_object('id',x.id,'revision',x.revision,'sort_order',x.sort_order)order by x.sort_order,x.id)into items from(select id,revision,sort_order from public.list_items where list_id=p_list.id and deleted_at is null order by sort_order,id limit 101)x;
  result:=result||jsonb_build_object('order_complete',jsonb_array_length(coalesce(items,'[]'))<=100,'ordered_items',case when jsonb_array_length(coalesce(items,'[]'))<=100 then coalesce(items,'[]')else null end);
 elsif p_target?&array['item_id']and p_target-'item_id'='{}'::jsonb and jsonb_typeof(p_target->'item_id')='string'then
  editor:=public.get_family_collection_editor_v1(p_list.id,(p_target->>'item_id')::uuid,'active');obs:=editor->'observation';result:=result||jsonb_build_object('item',editor->'item');
 elsif p_target?&array['source']and p_target-'source'='{}'::jsonb and jsonb_typeof(p_target->'source')='object'and(p_target->'source')?&array['kind','id']and(p_target->'source')-array['kind','id']='{}'::jsonb then
  if jsonb_typeof(p_target->'source'->'kind')is distinct from'string'or jsonb_typeof(p_target->'source'->'id')is distinct from'string'then raise exception 'Typed source required'using errcode='22023';end if;
  kind:=p_target->'source'->>'kind';entity:=(p_target->'source'->>'id')::uuid;
  perform family_auth.collection_authoring_lock_source(kind,entity);source:=family_auth.collection_read_catalog(kind,entity);
  obs:=jsonb_set(obs,'{source_digest}',source->'digest');result:=result||jsonb_build_object('source',source);
 else raise exception 'Unknown authoring target fields'using errcode='22023';end if;
 return family_auth.collection_bound(result||jsonb_build_object('observation',obs),262144);
end;$$;

create function family_auth.collection_authoring_snapshot(p_source jsonb,p_name text)returns jsonb language plpgsql immutable set search_path=''as $$
declare c jsonb;lat numeric;lng numeric;
begin
 if coalesce(p_source->>'kind',p_source->'source'->>'kind','')not in('place','food','hotel','experience')then raise exception 'Source is not a location'using errcode='0A000';end if;
 if p_source->>'latitude'is not null and p_source->>'longitude'is not null then lat:=round((p_source->>'latitude')::numeric,8);lng:=round((p_source->>'longitude')::numeric,8);end if;
 c:=jsonb_build_object('name',coalesce(p_name,p_source->>'name'),'description',p_source->'description','latitude',lat,'longitude',lng,'address',p_source->'address','website',p_source->'website','phone',p_source->'phone','family_place_category_id',null,'cover_media_id',p_source->'cover_media_id');
 begin perform family_auth.collection_authoring_validate(c,true);exception when others then raise exception 'Canonical source content is not representable without an explicit edit'using errcode='0A000';end;
 return c;
end;$$;

create function family_auth.collection_authoring_build(p_list public.lists,p_action text,p_body jsonb,p_observed jsonb)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
<<author_build>>
declare keys text[];target jsonb;ctx jsonb;body jsonb:=p_body;changes jsonb;c jsonb;item public.list_items%rowtype;child public.list_item_locations%rowtype;
 source jsonb;kind text;entity uuid;id uuid;media uuid;category uuid;m public.media_assets%rowtype;ids uuid[];n integer;
begin
 keys:=case p_action when'create_reference'then array['source','notes','status']when'create_snapshot'then array['source','notes','status']when'create_manual'then array['content','notes','status']
 when'materialize'then array['item_id']when'edit'then array['item_id','changes']when'status'then array['item_id','status']when'reorder'then array['ordered_ids']end;
 if keys is null or jsonb_typeof(body)is distinct from'object'or not(body?&keys)or body-keys<>'{}'::jsonb or octet_length(body::text)>240000 then raise exception 'Exact bounded authoring body required'using errcode='22023';end if;
 if p_action in('create_reference','create_snapshot','create_manual')and public.viewer_person_id_for_family(p_list.family_id)is null then raise exception 'Recorded same-Family creator required'using errcode='42501';end if;
 if body?'status'and(jsonb_typeof(body->'status')is distinct from'string'or body->>'status'not in('idea','want','visited'))then raise exception 'Exact status required'using errcode='22023';end if;
 if body?'notes'and(body->'notes'<>'null'::jsonb and(jsonb_typeof(body->'notes')<>'string'or char_length(body->>'notes')>20000))then raise exception 'Bounded personal notes required'using errcode='22023';end if;
 if p_action in('create_reference','create_snapshot')then target:=jsonb_build_object('source',body->'source');
 elsif p_action in('materialize','edit','status')then
  if jsonb_typeof(body->'item_id')is distinct from'string'or(body->>'item_id')::uuid::text<>body->>'item_id'then raise exception 'Canonical item UUID required'using errcode='22023';end if;
  id:=(body->>'item_id')::uuid;target:=jsonb_build_object('item_id',id);
 else target:='{}';end if;
 ctx:=family_auth.collection_authoring_observe(p_list,target);
 if p_observed is distinct from ctx->'observation'then raise exception 'Authoring observation changed; re-observe explicitly'using errcode='PT409';end if;
 if p_action in('create_reference','create_snapshot')then
  kind:=body->'source'->>'kind';entity:=(body->'source'->>'id')::uuid;
  if body->'source'->>'id'<>entity::text then raise exception 'Canonical source UUID required'using errcode='22023';end if;
  source:=ctx->'source';id:=gen_random_uuid();
  if exists(select 1 from public.list_items x where x.list_id=p_list.id and x.item_kind::text=kind and coalesce(x.country_id,x.place_id,x.food_id,x.hotel_id,x.experience_id,x.airport_id,x.airline_id,x.guide_id)=entity)then raise exception 'Saved source identity already exists; edit or explicitly restore it'using errcode='PT409';end if;
  if p_action='create_snapshot'then
   if kind not in('place','food','hotel','experience')then raise exception 'Typed source is not a location snapshot'using errcode='0A000';end if;
   c:=family_auth.collection_authoring_snapshot(source,null);body:=body||jsonb_build_object('content',c);
  end if;
 elsif p_action='create_manual'then id:=gen_random_uuid();c:=body->'content';perform family_auth.collection_authoring_validate(c,true);
 elsif p_action in('materialize','edit','status')then
  select *into item from public.list_items where list_id=p_list.id and list_items.id=author_build.id and deleted_at is null for update;
  if item.id is null then raise exception 'Active item required'using errcode='42501';end if;
  select *into child from public.list_item_locations where item_id=item.id;
  if p_action='materialize'then
   if item.item_kind not in('place','food','hotel','experience','manual')then raise exception 'Typed source cannot materialize as a location'using errcode='0A000';end if;
   if child.item_id is null then
    kind:=item.item_kind::text;entity:=coalesce(item.place_id,item.food_id,item.hotel_id,item.experience_id);
    perform family_auth.collection_authoring_lock_source(kind,entity);source:=family_auth.collection_read_catalog(kind,entity);
    if source->'digest'is distinct from p_observed->'source_digest'then raise exception 'Source changed while waiting'using errcode='PT409';end if;
    c:=family_auth.collection_authoring_snapshot(source,item.name);
    if family_auth.collection_location_parent_valid(c->>'name',item.notes)is distinct from true then raise exception 'Existing notes/name cannot materialize without explicit edit'using errcode='0A000';end if;
   end if;
   body:=body||jsonb_build_object('content',c,'already_snapshot',child.item_id is not null);
  elsif p_action='edit'then
   changes:=body->'changes';
   if jsonb_typeof(changes)is distinct from'object'or changes='{}'::jsonb then raise exception 'Nonempty exact changes required'using errcode='22023';end if;
   if changes?'notes'and(changes->'notes'<>'null'::jsonb and(jsonb_typeof(changes->'notes')<>'string'or char_length(changes->>'notes')>20000))then raise exception 'Bounded personal notes required'using errcode='22023';end if;
   if child.item_id is null then
    if changes-array['name','notes']<>'{}'::jsonb then raise exception 'Explicit materialization required before location detail editing'using errcode='0A000';end if;
    if changes?'name'and changes->'name'<>'null'::jsonb then perform family_auth.collection_authoring_validate(jsonb_build_object('name',changes->'name'),false);end if;
   else
    perform family_auth.collection_authoring_validate(changes-'notes',false);
    c:=(to_jsonb(child)-array['item_id','list_id','family_id'])||jsonb_build_object('name',item.name)||(changes-'notes');perform family_auth.collection_authoring_validate(c,true);
   end if;
  end if;
 elsif p_action='reorder'then
  if jsonb_typeof(body->'ordered_ids')is distinct from'array'or jsonb_array_length(body->'ordered_ids')>100 then raise exception 'Bounded complete order required'using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(body->'ordered_ids')v where jsonb_typeof(v)<>'string')then raise exception 'UUID order required'using errcode='22023';end if;
  select coalesce(array_agg(value::uuid),'{}')into ids from jsonb_array_elements_text(body->'ordered_ids');
  if cardinality(ids)<>(select count(distinct x)from unnest(ids)x)or exists(select 1 from unnest(ids)x where x is null)then raise exception 'Unique nonnull order required'using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements_text(body->'ordered_ids')v where v<>v::uuid::text)then raise exception 'Canonical UUID order required'using errcode='22023';end if;
  select count(*)into n from public.list_items where list_id=p_list.id and deleted_at is null;
  if n>100 then raise exception 'Full reorder exceeds 100 active items'using errcode='54000';end if;
  if n<>cardinality(ids)or exists(select 1 from unnest(ids)x where not exists(select 1 from public.list_items i where i.id=x and i.list_id=p_list.id and i.deleted_at is null))then raise exception 'Order must contain every active item in this Collection'using errcode='PT409';end if;
 end if;
 -- Pin category/media only after their actual typed values are validated. Both
 -- prepare and execution follow these same source/category/media lock rules.
 if c is not null then
  category:=(c->>'family_place_category_id')::uuid;media:=(c->>'cover_media_id')::uuid;
  if category is not null then
   perform 1 from public.family_place_categories where family_place_categories.id=category and family_id=p_list.family_id for share;
   if not found then raise exception 'Same-Family category required'using errcode='42501';end if;
  end if;
  for media in select distinct v from unnest(array[media,child.cover_media_id])v where v is not null order by v loop
   perform family_auth.collection_media_hold(media);select *into m from public.media_assets where media_assets.id=media;
   if m.id is null or m.kind<>'image'or not(m.visibility='public_catalog'or(m.visibility='family'and m.family_id=p_list.family_id and m.bucket='family'))then raise exception 'Representable same-Family image required'using errcode='42501';end if;
  end loop;
 end if;
 return family_auth.collection_bound(jsonb_build_object('version',1,'scope',family_auth.collection_scope(p_list),'action',p_action,'target_item_id',id,'body',body,'observed',p_observed),262144);
end;$$;

create function family_auth.collection_authoring_apply(p_list public.lists,p_operation uuid,p_original jsonb)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
<<author_apply>>
declare action text:=p_original->>'action';body jsonb:=p_original->'body';id uuid:=(p_original->>'target_item_id')::uuid;
 i public.list_items%rowtype;old_i public.list_items%rowtype;c jsonb;changes jsonb;child public.list_item_locations%rowtype;next_child public.list_item_locations%rowtype;
 kind text;entity uuid;ids uuid[];media uuid;did_change boolean:=false;before_revision bigint;after_revision bigint;next_order integer;
begin
 insert into family_auth.collection_authoring_context values(pg_current_xact_id(),p_list.id,auth.uid(),p_operation,id,action);
 select coalesce((select content_revision from family_auth.collection_state where list_id=p_list.id),0)into before_revision;
 if action in('create_reference','create_snapshot','create_manual')then
  kind:=case when action='create_manual'then'manual'else body->'source'->>'kind'end;entity:=(body->'source'->>'id')::uuid;c:=body->'content';
  select coalesce(max(sort_order),-1)+1 into next_order from public.list_items where list_id=p_list.id and deleted_at is null;
  insert into public.list_items(id,list_id,item_kind,status,sort_order,name,notes,added_by_person_id,country_id,place_id,food_id,hotel_id,experience_id,airport_id,airline_id,guide_id)
   values(id,p_list.id,kind::public.list_item_kind,(body->>'status')::public.list_item_status,next_order,c->>'name',body->>'notes',public.viewer_person_id_for_family(p_list.family_id),
    case when kind='country'then entity end,case when kind='place'then entity end,case when kind='food'then entity end,case when kind='hotel'then entity end,
    case when kind='experience'then entity end,case when kind='airport'then entity end,case when kind='airline'then entity end,case when kind='guide'then entity end)returning *into i;
  if action<>'create_reference'then
   insert into public.list_item_locations select *from jsonb_populate_record(null::public.list_item_locations,(c-'name')||jsonb_build_object('item_id',id,'list_id',p_list.id,'family_id',p_list.family_id));
  end if;
 elsif action='reorder'then
  select coalesce(array_agg(value::uuid),'{}')into ids from jsonb_array_elements_text(body->'ordered_ids');
  perform 1 from public.list_items where list_id=p_list.id and deleted_at is null order by list_items.id for update;
  update public.list_items x set sort_order=u.ord-1 from unnest(ids)with ordinality u(item_id,ord)where x.id=u.item_id and x.list_id=p_list.id and x.sort_order is distinct from(u.ord-1)::integer;
 else
  select *into i from public.list_items where list_items.id=author_apply.id and list_id=p_list.id and deleted_at is null for update;old_i:=i;
  if action='status'then
   update public.list_items set status=(body->>'status')::public.list_item_status where list_items.id=author_apply.id and status is distinct from(body->>'status')::public.list_item_status returning *into i;
  elsif action='materialize'and(body->>'already_snapshot')::boolean is false then
   c:=body->'content';update public.list_items set name=c->>'name'where list_items.id=author_apply.id and name is distinct from c->>'name';
   insert into public.list_item_locations select *from jsonb_populate_record(null::public.list_item_locations,(c-'name')||jsonb_build_object('item_id',id,'list_id',p_list.id,'family_id',p_list.family_id));
  elsif action='edit'then
   changes:=body->'changes';select *into child from public.list_item_locations where item_id=author_apply.id;
   next_child:=jsonb_populate_record(child,changes-array['name','notes']);
   for media in select distinct m from unnest(array[child.cover_media_id,next_child.cover_media_id])m where m is not null order by m loop perform family_auth.collection_media_hold(media);end loop;
   update public.list_items x set name=case when changes?'name'then changes->>'name'else x.name end,notes=case when changes?'notes'then changes->>'notes'else x.notes end
    where x.id=author_apply.id and(x.name,x.notes)is distinct from(case when changes?'name'then changes->>'name'else x.name end,case when changes?'notes'then changes->>'notes'else x.notes end);
   if child.item_id is not null and to_jsonb(next_child)is distinct from to_jsonb(child)then
    update public.list_item_locations set description=next_child.description,latitude=next_child.latitude,longitude=next_child.longitude,address=next_child.address,website=next_child.website,phone=next_child.phone,family_place_category_id=next_child.family_place_category_id,cover_media_id=next_child.cover_media_id where item_id=author_apply.id;
   end if;
  end if;
  select *into i from public.list_items where list_items.id=author_apply.id;
 end if;
 select coalesce((select content_revision from family_auth.collection_state where list_id=p_list.id),0)into after_revision;did_change:=before_revision<>after_revision;
 delete from family_auth.collection_authoring_context where transaction_id=pg_current_xact_id()and collection_id=p_list.id;
 return jsonb_build_object('version',1,'operation_id',p_operation,'status','committed','action',action,'collection_id',p_list.id,'item_id',id,'item_revision',case when id is not null then i.revision end,'collection_revision',(select revision from public.lists where lists.id=p_list.id),'content_revision',after_revision,'changed',did_change);
end;$$;

create function family_auth.collection_authoring_entry(p_entry text,p_args jsonb)returns jsonb language plpgsql volatile security definer set search_path=''as $$
<<authoring>>
declare l public.lists%rowtype;cmd family_auth.collection_authoring_commands%rowtype;outcome family_auth.collection_authoring_outcomes%rowtype;
 collection_id uuid;op uuid;keys text[];request_hash bytea;original jsonb;fresh jsonb;result jsonb;cover uuid;pending integer;
begin
 keys:=case p_entry when'context'then array['collection_id','target']when'prepare'then array['collection_id','operation_id','action','body','observation']when'execute'then array['collection_id','operation_id','original']when'cancel'then array['collection_id','operation_id','original']when'outcome'then array['collection_id','operation_id']end;
 if keys is null or jsonb_typeof(p_args)is distinct from'object'or not(p_args?&keys)or p_args-keys<>'{}'::jsonb or octet_length(p_args::text)>270000 then raise exception 'Exact bounded authoring entry required'using errcode='22023';end if;
 if family_auth.collection_session_current()is distinct from true then raise exception 'Current Collection session required'using errcode='42501';end if;
 collection_id:=(p_args->>'collection_id')::uuid;op:=(p_args->>'operation_id')::uuid;
 if p_entry='context'then l:=family_auth.collection_require(collection_id,'items',true);return family_auth.collection_authoring_observe(l,p_args->'target');end if;
 if op is null then raise exception 'Original operation ID required'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('collection-operation:'||auth.uid()::text||':'||op::text,0));
 l:=family_auth.collection_require(collection_id,'recovery_item',true);
 if exists(select 1 from family_auth.collection_operation_receipts where actor_user_id=auth.uid()and operation_id=op)then raise exception 'Operation ID belongs to Collection lifecycle'using errcode='PT409';end if;
 select *into cmd from family_auth.collection_authoring_commands x where x.actor_user_id=auth.uid()and x.operation_id=op;
 if cmd.operation_id is not null and cmd.collection_id<>l.id then raise exception 'Original operation belongs to another Collection'using errcode='PT409';end if;
 select *into outcome from family_auth.collection_authoring_outcomes x where x.actor_user_id=auth.uid()and x.operation_id=op;
 if p_entry='outcome'then
  if cmd.operation_id is null then return jsonb_build_object('version',1,'operation_id',op,'status','unknown');end if;
  if outcome.operation_id is not null then return outcome.result;end if;
  return jsonb_build_object('version',1,'operation_id',op,'status','prepared','original',cmd.original);
 elsif p_entry='prepare'then
  request_hash:=sha256(convert_to((p_args-array['collection_id','operation_id'])::text,'UTF8'));
  if cmd.operation_id is not null then
   if cmd.request_hash<>request_hash or cmd.original_session_id::text is distinct from auth.jwt()->>'session_id'then raise exception 'Original preparation request/session changed'using errcode='PT409';end if;
   return jsonb_build_object('version',1,'operation_id',op,'status',coalesce(outcome.status,'prepared'),'original',cmd.original);
  end if;
  if family_auth.collection_allowed(l.id,'items')is distinct from true then raise exception 'Active Collection editing authority required'using errcode='42501';end if;
  original:=family_auth.collection_authoring_build(l,p_args->>'action',p_args->'body',p_args->'observation');
  perform pg_advisory_xact_lock(hashtextextended('collection-authoring-pending:'||auth.uid()::text,0));
  select count(*)into pending from family_auth.collection_authoring_commands x where x.actor_user_id=auth.uid()and not exists(select 1 from family_auth.collection_authoring_outcomes o where(o.actor_user_id,o.operation_id)=(x.actor_user_id,x.operation_id));
  if pending>=200 then raise exception 'Pending authoring operation limit reached; resolve existing originals'using errcode='54000';end if;
  insert into family_auth.collection_authoring_commands(actor_user_id,operation_id,collection_id,family_id,original_session_id,original_person_id,request_hash,original)
   values(auth.uid(),op,l.id,l.family_id,(auth.jwt()->>'session_id')::uuid,public.viewer_person_id_for_family(l.family_id),request_hash,original);
  cover:=coalesce(original->'body'->'content'->>'cover_media_id',original->'body'->'changes'->>'cover_media_id')::uuid;
  if cover is not null then insert into family_auth.collection_authoring_media_holds values(auth.uid(),op,cover);end if;
  return jsonb_build_object('version',1,'operation_id',op,'status','prepared','original',original);
 end if;
 if cmd.operation_id is null then raise exception 'Registered original required; recover preparation first'using errcode='PT409';end if;
 if p_args->'original'is distinct from cmd.original then raise exception 'Exact immutable original required'using errcode='PT409';end if;
 if p_entry='execute'and cmd.original_session_id::text is distinct from auth.jwt()->>'session_id'then raise exception 'Original execution session changed'using errcode='PT409';end if;
 if outcome.operation_id is not null then return outcome.result;end if;
 if p_entry='cancel'then result:=jsonb_build_object('version',1,'operation_id',op,'status','cancelled','collection_id',l.id,'action',cmd.original->'action','item_id',cmd.original->'target_item_id');
 else
  if family_auth.collection_allowed(l.id,'items')is distinct from true then raise exception 'Active Collection editing authority required'using errcode='42501';end if;
  original:=cmd.original;
  -- Derived preparation fields are recomputed from canonical source facts.
  fresh:=family_auth.collection_authoring_build(l,original->>'action',case when original->>'action'='create_snapshot'then (original->'body')-'content'when original->>'action'='materialize'then (original->'body')-array['content','already_snapshot']else original->'body'end,original->'observed');
  if(original->>'action')in('create_reference','create_snapshot','create_manual')then
   if fresh-'target_item_id'is distinct from original-'target_item_id'then raise exception 'Frozen authoring source/body/context changed'using errcode='PT409';end if;
  elsif fresh is distinct from original then raise exception 'Frozen authoring source/body/context changed'using errcode='PT409';end if;
  result:=family_auth.collection_authoring_apply(l,op,original);
 end if;
 insert into family_auth.collection_authoring_outcomes(actor_user_id,operation_id,status,result)values(auth.uid(),op,result->>'status',result);
 delete from family_auth.collection_authoring_media_holds where actor_user_id=auth.uid()and operation_id=op;
 return result;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid canonical authoring input'using errcode='22023';
 when unique_violation then raise exception 'Authoring identity conflict; reload or recover the original'using errcode='PT409';
end;$$;

create function public.get_family_collection_authoring_context_v1(p_collection_id uuid,p_target jsonb default'{}')returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_authoring_entry('context',jsonb_build_object('collection_id',p_collection_id,'target',p_target));$$;
create function public.prepare_family_collection_content_v1(p_collection_id uuid,p_operation_id uuid,p_action text,p_body jsonb,p_observation jsonb)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_authoring_entry('prepare',jsonb_build_object('collection_id',p_collection_id,'operation_id',p_operation_id,'action',p_action,'body',p_body,'observation',p_observation));$$;
create function public.execute_family_collection_content_v1(p_collection_id uuid,p_operation_id uuid,p_original jsonb)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_authoring_entry('execute',jsonb_build_object('collection_id',p_collection_id,'operation_id',p_operation_id,'original',p_original));$$;
create function public.cancel_family_collection_content_v1(p_collection_id uuid,p_operation_id uuid,p_original jsonb)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_authoring_entry('cancel',jsonb_build_object('collection_id',p_collection_id,'operation_id',p_operation_id,'original',p_original));$$;
create function public.get_family_collection_content_operation_v1(p_collection_id uuid,p_operation_id uuid)returns jsonb language sql volatile security invoker set search_path=''as $$select family_auth.collection_authoring_entry('outcome',jsonb_build_object('collection_id',p_collection_id,'operation_id',p_operation_id));$$;

CREATE OR REPLACE FUNCTION family_auth.collection_execute(p_operation uuid, p_original jsonb, p_cancel boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.lists%rowtype;i public.list_items%rowtype;r family_auth.collection_operation_receipts%rowtype;
 s jsonb;kind text;action text;target uuid;item_id uuid;digest bytea;result jsonb;changed boolean;content bigint;
begin
 if p_operation is null or p_cancel is null or octet_length(p_original::text)>65536 then raise exception 'Bounded original operation required'using errcode='22023';end if;
 perform family_auth.collection_validate_original(p_original);
 if not family_auth.collection_session_current()then raise exception 'Current Collection session required'using errcode='42501';end if;
 s:=p_original->'scope';kind:=p_original->>'target_kind';action:=p_original->>'action';item_id:=(p_original->>'item_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('collection-operation:'||auth.uid()::text||':'||p_operation::text,0));
 if exists(select 1 from family_auth.collection_authoring_commands where actor_user_id=auth.uid()and operation_id=p_operation)then raise exception 'Operation ID belongs to Collection content'using errcode='PT409';end if;
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
end;$function$
;

CREATE OR REPLACE FUNCTION family_auth.private_media_is_referenced(p_media_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$select (select (select (select p_media_id is not null and (
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
  )) or exists(select 1 from family_auth.collection_root_version_media where media_asset_id=p_media_id) or exists(select 1 from family_auth.collection_item_version_media where media_asset_id=p_media_id))or exists(select 1 from public.list_item_locations where cover_media_id=p_media_id))or exists(select 1 from family_auth.collection_authoring_media_holds where media_asset_id=p_media_id);
$function$
;

CREATE OR REPLACE FUNCTION family_auth.collection_media_identity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if(new.bucket,new.storage_path,new.content_hash,new.family_id,new.visibility)is distinct from(old.bucket,old.storage_path,old.content_hash,old.family_id,old.visibility)
  and(exists(select 1 from public.lists where cover_media_id=old.id) or exists(select 1 from public.list_item_locations where cover_media_id=old.id)
   or exists(select 1 from family_auth.collection_authoring_media_holds where media_asset_id=old.id)
   or exists(select 1 from family_auth.collection_root_version_media where media_asset_id=old.id)
   or exists(select 1 from family_auth.collection_item_version_media where media_asset_id=old.id))then
  raise exception 'Retained Collection media originals are immutable'using errcode='0A000';
 end if;return new;
end;$function$
;
create or replace function public.add_list_item(p_list_id uuid,p_kind public.list_item_kind,p_entity_id uuid,p_status public.list_item_status DEFAULT 'idea')returns uuid language plpgsql volatile security definer set search_path=''as $$begin raise exception 'Use observed Collection authoring commands'using errcode='0A000';end;$$;
create or replace function public.set_list_item_status(p_item_id uuid,p_status public.list_item_status)returns void language plpgsql volatile security definer set search_path=''as $$begin raise exception 'Use observed Collection authoring commands'using errcode='0A000';end;$$;
create or replace function public.reorder_list_items(p_list_id uuid,p_item_ids uuid[])returns void language plpgsql volatile security definer set search_path=''as $$begin raise exception 'Use observed Collection authoring commands'using errcode='0A000';end;$$;
revoke all on function family_auth.collection_authoring_gate() from public,anon,authenticated,service_role;
revoke all on function family_auth.collection_authoring_lock_source(text,uuid) from public,anon,authenticated,service_role;
revoke all on function family_auth.collection_authoring_validate(jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function family_auth.collection_authoring_observe(public.lists,jsonb) from public,anon,authenticated,service_role;
revoke all on function family_auth.collection_authoring_snapshot(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function family_auth.collection_authoring_build(public.lists,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function family_auth.collection_authoring_apply(public.lists,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function family_auth.collection_authoring_entry(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function family_auth.collection_authoring_entry(text,jsonb) to authenticated;
revoke all on function public.get_family_collection_authoring_context_v1(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_family_collection_authoring_context_v1(uuid,jsonb) to authenticated;
revoke all on function public.prepare_family_collection_content_v1(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.prepare_family_collection_content_v1(uuid,uuid,text,jsonb,jsonb) to authenticated;
revoke all on function public.execute_family_collection_content_v1(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.execute_family_collection_content_v1(uuid,uuid,jsonb) to authenticated;
revoke all on function public.cancel_family_collection_content_v1(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cancel_family_collection_content_v1(uuid,uuid,jsonb) to authenticated;
revoke all on function public.get_family_collection_content_operation_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_family_collection_content_operation_v1(uuid,uuid) to authenticated;
commit;
