BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='20s';
DO $contract$
DECLARE role_name text; privilege_name text;object_name text;
BEGIN
 ASSERT (SELECT count(*) FROM supabase_migrations.schema_migrations)=129;
 ASSERT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261112235203');
 ASSERT NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN(VALUES('anon'),('authenticated'))r(role_name)
  CROSS JOIN(VALUES('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN'))p(privilege_name)
  WHERE n.nspname IN('public','family_auth')AND c.relkind IN('r','p','m')
  AND has_table_privilege(r.role_name,c.oid,p.privilege_name));
 ASSERT NOT has_table_privilege('authenticated','public.trips','INSERT');
 ASSERT NOT has_table_privilege('authenticated','public.schedule_items','INSERT');
 ASSERT NOT has_table_privilege('authenticated','public.schedule_items','UPDATE');
 FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE']LOOP
  ASSERT NOT has_table_privilege('authenticated','public.media_assets',privilege_name);
  ASSERT has_table_privilege('service_role','public.media_assets',privilege_name);
 END LOOP;
 ASSERT has_column_privilege('authenticated','public.schedule_items','activity','UPDATE');
 ASSERT NOT has_column_privilege('authenticated','public.schedule_items','visit_revision','UPDATE');
 ASSERT NOT has_function_privilege('anon','public.catalog_media_urls(text,uuid[],integer)','EXECUTE');
 ASSERT has_function_privilege('authenticated','public.catalog_media_urls(text,uuid[],integer)','EXECUTE');
 ASSERT has_function_privilege('authenticated','public.catalog_media_variants(text,uuid[],integer,text)','EXECUTE');
 ASSERT has_function_privilege('service_role','public.publish_media_variant(uuid,text,jsonb)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.publish_media_variant(uuid,text,jsonb)','EXECUTE');
 ASSERT NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  CROSS JOIN(VALUES('anon'),('authenticated'))r(role_name)
  WHERE n.nspname IN('public','family_auth')AND p.prorettype='trigger'::regtype
  AND has_function_privilege(r.role_name,p.oid,'EXECUTE'));
END $contract$;
ROLLBACK;
