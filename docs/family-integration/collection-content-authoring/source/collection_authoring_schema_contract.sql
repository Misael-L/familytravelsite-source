begin read only;
do $$declare r record;n integer;begin
 select count(*)into n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='family_auth'and p.proname like'collection_authoring_%';assert n=8,'Eight private checked authoring helpers required';
 for r in select p.*,s.nspname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where(s.nspname='family_auth'and p.proname like'collection_authoring_%')or(s.nspname='public'and p.proname in('get_family_collection_authoring_context_v1','prepare_family_collection_content_v1','execute_family_collection_content_v1','cancel_family_collection_content_v1','get_family_collection_content_operation_v1'))loop
  assert r.proconfig=array['search_path=""'];assert r.prosecdef=(r.nspname='family_auth'and r.proname not in('collection_authoring_validate','collection_authoring_snapshot'));
  assert not has_function_privilege('anon',r.oid,'EXECUTE')and not has_function_privilege('service_role',r.oid,'EXECUTE');
  assert not exists(select 1 from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner)))a where a.grantee=0 and a.privilege_type='EXECUTE');
  assert has_function_privilege('authenticated',r.oid,'EXECUTE')=(r.nspname='public'or r.proname='collection_authoring_entry');
  assert position('user_metadata'in pg_get_functiondef(r.oid))=0;
 end loop;
 for r in select oid,relname,relrowsecurity from pg_class where relnamespace='family_auth'::regnamespace and relname in('collection_authoring_commands','collection_authoring_outcomes','collection_authoring_context','collection_authoring_media_holds')loop
  assert r.relrowsecurity;assert not has_table_privilege('anon',r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE');
  assert not has_table_privilege('authenticated',r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE');assert not has_table_privilege('service_role',r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE');
 end loop;
 assert (select count(*)from pg_trigger where not tgisinternal and tgname='ab_collection_authoring_gate'and tgrelid in('public.list_items'::regclass,'public.list_item_locations'::regclass))=2;
 assert not has_table_privilege('authenticated','public.list_item_locations','INSERT,UPDATE,DELETE');
 assert to_regprocedure('public.prepare_family_collection_content_v1(uuid,uuid,text,jsonb,jsonb)')is not null;
 assert to_regprocedure('public.get_family_collection_authoring_context_v1(uuid,jsonb)')is not null;
 assert to_regprocedure('public.execute_family_collection_content_v1(uuid,uuid,jsonb)')is not null;
 assert to_regprocedure('public.cancel_family_collection_content_v1(uuid,uuid,jsonb)')is not null;
 assert to_regprocedure('public.get_family_collection_content_operation_v1(uuid,uuid)')is not null;
 assert position('collection_authoring_commands'in pg_get_functiondef('family_auth.collection_execute(uuid,jsonb,boolean)'::regprocedure))>0;
 assert position('collection_authoring_media_holds'in pg_get_functiondef('family_auth.private_media_is_referenced(uuid)'::regprocedure))>0;
end;$$;
rollback;
