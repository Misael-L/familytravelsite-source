-- Read-only structural/privilege assertions; run only through the owned fixture guard.
begin;
do $contract$
declare rel regclass;role_name text;f record;
begin
 if(select count(*)from pg_enum where enumtypid='public.list_item_kind'::regtype)<>9 then raise exception 'Collection kind contract drift';end if;
 if(select count(*)from pg_constraint where conrelid='public.list_items'::regclass and contype='f'and confdeltype='r'
  and confrelid in('public.countries'::regclass,'public.places'::regclass,'public.foods'::regclass,'public.hotels'::regclass,'public.experiences'::regclass,'public.airports'::regclass,'public.airlines'::regclass,'public.guides'::regclass))<>8 then raise exception 'Catalog target FKs must retain eight RESTRICT definitions';end if;
 if exists(select 1 from pg_constraint where conrelid in('public.lists'::regclass,'public.list_items'::regclass)and not convalidated)then raise exception 'Unvalidated Collection constraint';end if;
 foreach rel in array array['family_auth.collection_state'::regclass,'family_auth.collection_root_versions'::regclass,
  'family_auth.collection_item_versions'::regclass,'family_auth.collection_root_version_media'::regclass,
  'family_auth.collection_item_version_media'::regclass,'family_auth.collection_operation_receipts'::regclass,
  'family_auth.collection_lifecycle_permits'::regclass]loop
  if not(select relrowsecurity from pg_class where oid=rel)then raise exception 'Private Collection relation lacks RLS';end if;
  foreach role_name in array array['anon','authenticated','service_role']loop
   if has_table_privilege(role_name,rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')then raise exception 'Private Collection relation has application privilege';end if;
  end loop;
 end loop;
 for f in select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='family_auth'and p.proname like 'collection_%'loop
  if has_function_privilege('anon',f.oid,'execute')or has_function_privilege('service_role',f.oid,'execute')then raise exception 'Unchecked Collection helper exposure';end if;
  if has_function_privilege('authenticated',f.oid,'execute')is distinct from(f.proname='collection_entry')then raise exception 'Collection helper execution allowlist drift';end if;
  if f.proconfig is distinct from array['search_path=""']then raise exception 'Unrestricted Collection helper search path';end if;
 end loop;
 if(select count(*)from pg_proc where pronamespace='public'::regnamespace and proname in(
  'get_family_collection_context_v1','get_family_collection_item_context_v1','list_family_collection_trash_v1','list_family_collection_item_trash_v1',
  'execute_family_collection_lifecycle_v1','execute_family_collection_item_lifecycle_v1','list_family_collection_versions_v1','get_family_collection_operation_v1','cancel_family_collection_operation_v1'))<>9 then raise exception 'Nine Collection public entries required';end if;
 for f in select p.oid,p.prosecdef from pg_proc p where pronamespace='public'::regnamespace and proname in(
  'get_family_collection_context_v1','get_family_collection_item_context_v1','list_family_collection_trash_v1','list_family_collection_item_trash_v1',
  'execute_family_collection_lifecycle_v1','execute_family_collection_item_lifecycle_v1','list_family_collection_versions_v1','get_family_collection_operation_v1','cancel_family_collection_operation_v1')loop
  if f.prosecdef or not has_function_privilege('authenticated',f.oid,'execute')or has_function_privilege('anon',f.oid,'execute')or has_function_privilege('service_role',f.oid,'execute')then raise exception 'Invalid public Collection entry privilege';end if;
 end loop;
 if exists(select 1 from pg_constraint c join pg_namespace n on n.oid=c.connamespace
  where c.contype='f'and n.nspname='family_auth'and c.conrelid::regclass::text like 'family_auth.collection_%'
   and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid
    and(select array_agg(i.indkey[x]order by x)from generate_series(0,cardinality(c.conkey)-1)x)=c.conkey))then raise exception 'Collection FK missing leading-key index';end if;
end;$contract$;
select 'COLLECTION_SCHEMA_CONTRACT_OK';
do $content$
begin
 if(select count(*)from information_schema.columns where table_schema='public'and table_name='list_item_locations')<>11 then raise exception 'Unexpected live location columns';end if;
 if exists(select 1 from information_schema.columns where table_schema='public'and table_name='list_item_locations'and column_name in('name','notes','image_url'))then raise exception 'Duplicated or unqualified content fields';end if;
 if not(select relrowsecurity from pg_class where oid='public.list_item_locations'::regclass)then raise exception 'Missing child RLS';end if;
 if not has_table_privilege('authenticated','public.list_item_locations','SELECT')or has_table_privilege('authenticated','public.list_item_locations','INSERT,UPDATE,DELETE,TRUNCATE')or has_table_privilege('service_role','public.list_item_locations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')or has_table_privilege('anon','public.list_item_locations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')then raise exception 'Location privilege contract changed';end if;
 if has_table_privilege('authenticated','family_auth.collection_content_permits','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')or has_table_privilege('service_role','family_auth.collection_content_permits','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')or has_table_privilege('anon','family_auth.collection_content_permits','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')then raise exception 'Caller content capability exposure';end if;
 if(select numeric_scale from information_schema.columns where table_schema='public'and table_name='list_item_locations'and column_name='latitude')<>8 or(select numeric_scale from information_schema.columns where table_schema='public'and table_name='list_item_locations'and column_name='longitude')<>8 then raise exception 'Coordinate storage precision drift';end if;
 if(select count(*)from pg_constraint where conrelid='public.list_item_locations'::regclass and contype='f'and convalidated and confdeltype='r')<>4 then raise exception 'Scoped content/reference FKs incomplete';end if;
 if(select count(*)from pg_indexes where schemaname='public'and tablename='list_item_locations')<>4 then raise exception 'Location index budget drift';end if;
end;$content$;
do $coverage$begin if not exists(select 1 from family_auth.rls_aal_coverage where table_schema='public'and table_name='list_item_locations'and classification='joined_child'and policy_name='list_item_locations_aal_restrict')or not exists(select 1 from pg_policies where schemaname='public'and tablename='list_item_locations'and policyname='list_item_locations_aal_restrict'and permissive='RESTRICTIVE')then raise exception 'Location assurance registration incomplete';end if;end;$coverage$;
select 'COLLECTION_LOCATION_SCHEMA_CONTRACT_OK';
rollback;
