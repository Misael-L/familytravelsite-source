-- Scoped read-only catalog assertions, not a hosted/CLI advisor-pass claim.
begin read only;
do $$
declare r record;n integer;
begin
 select count(*)into n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where
  (s.nspname='family_auth'and p.proname in('collection_library_observation','collection_library_entry'))or
  (s.nspname='public'and p.proname='get_family_collection_library_v1');
 assert n=3,'Expected exactly three new functions';
 for r in select p.*,s.nspname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where
  (s.nspname='family_auth'and p.proname in('collection_library_observation','collection_library_entry'))or
  (s.nspname='public'and p.proname='get_family_collection_library_v1')
 loop
  assert r.proconfig=array['search_path=""'];
  assert r.prosecdef=(r.nspname='family_auth');
  assert not has_function_privilege('anon',r.oid,'EXECUTE')and not has_function_privilege('service_role',r.oid,'EXECUTE');
  assert not exists(select 1 from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner)))a where a.grantee=0 and a.privilege_type='EXECUTE');
  assert has_function_privilege('authenticated',r.oid,'EXECUTE')=(r.proname<>'collection_library_observation');
  assert position('user_metadata'in pg_get_functiondef(r.oid))=0;
 end loop;
 assert not has_table_privilege('authenticated','family_auth.collection_content_permits','SELECT,INSERT,UPDATE,DELETE');
 assert not has_table_privilege('authenticated','public.list_item_locations','INSERT,UPDATE,DELETE');
 assert to_regprocedure('public.get_family_collection_library_v1(uuid,text,integer,jsonb)')is not null;
end;$$;
rollback;
