-- Read-only advisor-style catalog assertions, scoped to the new routines.
begin read only;
do $$
declare r record;n integer;
begin
 select count(*)into n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='family_auth'and p.proname in('collection_read_catalog','collection_read_media','collection_read_item','collection_read_root','collection_read_entry');
 assert n=5,'Expected five private read helpers';
 for r in select p.*,s.nspname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where
  (s.nspname='family_auth'and p.proname in('collection_read_catalog','collection_read_media','collection_read_item','collection_read_root','collection_read_entry'))or
  (s.nspname='public'and p.proname in('get_family_collection_page_v1','get_family_collection_editor_v1','get_family_collection_membership_v1'))
 loop
  assert r.proconfig=array['search_path=""'],'Empty explicit search_path required';
  assert r.prosecdef=(r.nspname='family_auth'),'Invoker public / checked private definer boundary';
  assert not has_function_privilege('anon',r.oid,'EXECUTE')and not has_function_privilege('service_role',r.oid,'EXECUTE'),'No anonymous/service access';
  assert not exists(select 1 from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner)))a where a.grantee=0 and a.privilege_type='EXECUTE'),'No PUBLIC execution';
  assert has_function_privilege('authenticated',r.oid,'EXECUTE')=(r.nspname='public'or r.proname='collection_read_entry'),'No direct helper execution';
  assert position('user_metadata'in pg_get_functiondef(r.oid))=0,'No client metadata authorization';
 end loop;
 assert to_regprocedure('public.get_family_collection_page_v1(uuid,text,integer,jsonb)')is not null;
 assert to_regprocedure('public.get_family_collection_editor_v1(uuid,uuid,text)')is not null;
 assert to_regprocedure('public.get_family_collection_membership_v1(uuid,jsonb)')is not null;
 assert not has_table_privilege('authenticated','family_auth.collection_content_permits','SELECT,INSERT,UPDATE,DELETE');
 assert not has_table_privilege('authenticated','public.list_item_locations','INSERT,UPDATE,DELETE');
 assert (select relrowsecurity from pg_class where oid='public.list_item_locations'::regclass);
 assert (select count(*)from pg_policy where polrelid='public.list_item_locations'::regclass)=2;
end;$$;
rollback;
