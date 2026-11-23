-- U04-F5c5a. Bounded Collection library reader; no native/write activation.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- A capped observation of the authorized root set, not a materialized library
-- or a cursor over private names. Item content revisions fence count changes.
create function family_auth.collection_library_observation(p_family uuid,p_state text)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare result jsonb;
begin
 if p_state not in('active','archived')or p_state is null then raise exception 'Explicit library state required'using errcode='22023';end if;
 if family_auth.collection_family_allowed(p_family)is distinct from true then raise exception 'Current Collection Family required'using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'sort_order',s.sort_order,
  'row_digest',encode(sha256(convert_to(s.root::text,'UTF8')),'hex'),'content_revision',s.content_revision)
  order by s.sort_order,s.id),'[]'::jsonb)into result
 from(select x.id,x.sort_order,to_jsonb(x)root,coalesce(c.content_revision,0)content_revision
  from public.lists x left join family_auth.collection_state c on c.list_id=x.id
  where x.family_id=p_family and x.deleted_at is null and (x.archived_at is null)=(p_state='active')
   and family_auth.collection_allowed(x.id,'view')
  order by x.sort_order,x.id limit 1001)s;
 if jsonb_array_length(result)>1000 then raise exception 'Complete Collection library exceeds 1000 visible roots'using errcode='54000';end if;
 return result;
end;$$;

create function family_auth.collection_library_entry(p_family uuid,p_state text,p_limit integer,p_cursor jsonb)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare scope jsonb;observation jsonb;digest text;cursor jsonb;keys text[];item jsonb;r record;l public.lists%rowtype;
 entries jsonb:='[]';next_cursor jsonb;total integer;start_at integer:=0;num integer:=0;after_id uuid;after_order integer;count_items bigint;
begin
 if p_family is null or p_state is null or p_state not in('active','archived')or p_limit is null or p_limit not between 1 and 100 then
  raise exception 'Exact Family, explicit state and limit 1..100 required'using errcode='22023';end if;
 if p_cursor is not null and octet_length(p_cursor::text)>8192 then raise exception 'Library cursor exceeds bound'using errcode='22023';end if;
 perform family_auth.collection_pin_authority(p_family);
 scope:=jsonb_build_object('version',1,'family_id',p_family,'user_id',auth.uid(),
  'person_id',public.viewer_person_id_for_family(p_family),'session_id',(auth.jwt()->>'session_id')::uuid);
 observation:=family_auth.collection_library_observation(p_family,p_state);total:=jsonb_array_length(observation);
 digest:=encode(sha256(convert_to(observation::text,'UTF8')),'hex');cursor:=nullif(p_cursor,'null'::jsonb);
 if cursor is not null then
  keys:=array['version','scope','state','library_digest','sort_order','id'];
  if jsonb_typeof(cursor)is distinct from'object'or not(cursor?&keys)or cursor-keys<>'{}'::jsonb
   or cursor->'version'is distinct from'1'::jsonb or jsonb_typeof(cursor->'scope')is distinct from'object'
   or jsonb_typeof(cursor->'state')is distinct from'string'or jsonb_typeof(cursor->'library_digest')is distinct from'string'
   or (cursor->>'library_digest')!~'^[0-9a-f]{64}$'or jsonb_typeof(cursor->'id')is distinct from'string'
   or jsonb_typeof(cursor->'sort_order')is distinct from'number'or(cursor->>'sort_order')!~'^-?[0-9]{1,10}$'then
   raise exception 'Exact scoped library cursor required'using errcode='22023';end if;
  if cursor->'scope'is distinct from scope or cursor->>'state'is distinct from p_state or cursor->>'library_digest'is distinct from digest then
   raise exception 'Collection library changed; restart complete read'using errcode='PT409';end if;
  after_id:=(cursor->>'id')::uuid;after_order:=(cursor->>'sort_order')::integer;
  select ord::integer into start_at from jsonb_array_elements(observation)with ordinality x(value,ord)
   where value->>'id'=after_id::text and(value->>'sort_order')::integer=after_order;
  if start_at is null then raise exception 'Library cursor root unavailable'using errcode='22023';end if;
 end if;
 for r in select value,ord from jsonb_array_elements(observation)with ordinality x(value,ord)
  where ord>start_at and ord<=start_at+p_limit order by ord
 loop
  l:=family_auth.collection_require((r.value->>'id')::uuid,'view');
  if encode(sha256(convert_to(to_jsonb(l)::text,'UTF8')),'hex')is distinct from r.value->>'row_digest'then
   raise exception 'Collection root changed; restart complete read'using errcode='PT409';end if;
  select count(*)into count_items from public.list_items x where x.list_id=l.id and x.deleted_at is null;
  item:=jsonb_build_object('collection',family_auth.collection_read_root(l),'content_revision',r.value->'content_revision',
   'active_item_count',count_items,'can_edit_items',family_auth.collection_allowed(l.id,'items'),
   'can_admin',family_auth.collection_allowed(l.id,'admin'),'is_owner',coalesce(l.owner_person_id=public.viewer_person_id_for_family(p_family),false),
   'created_at',l.created_at,'updated_at',l.updated_at);
  entries:=entries||jsonb_build_array(item);num:=num+1;
  next_cursor:=jsonb_build_object('version',1,'scope',scope,'state',p_state,'library_digest',digest,'sort_order',l.sort_order,'id',l.id);
 end loop;
 if start_at+num>=total then next_cursor:=null;end if;
 if family_auth.collection_library_observation(p_family,p_state)is distinct from observation then
  raise exception 'Collection library changed during read; restart complete read'using errcode='PT409';end if;
 return family_auth.collection_bound(jsonb_build_object('version',1,'scope',scope,'state',p_state,'library_digest',digest,
  'total_count',total,'offset',start_at,'collections',entries,'next_cursor',next_cursor),2097152);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid typed library cursor'using errcode='22023';
end;$$;

revoke all on function family_auth.collection_library_observation(uuid,text),family_auth.collection_library_entry(uuid,text,integer,jsonb)from public,anon,authenticated,service_role;
grant execute on function family_auth.collection_library_entry(uuid,text,integer,jsonb)to authenticated;
create function public.get_family_collection_library_v1(p_family_id uuid,p_state text default'active',p_limit integer default 50,p_cursor jsonb default NULL)returns jsonb
 language sql volatile security invoker set search_path=''as $$select family_auth.collection_library_entry(p_family_id,p_state,p_limit,p_cursor);$$;
revoke all on function public.get_family_collection_library_v1(uuid,text,integer,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.get_family_collection_library_v1(uuid,text,integer,jsonb)to authenticated;
commit;
