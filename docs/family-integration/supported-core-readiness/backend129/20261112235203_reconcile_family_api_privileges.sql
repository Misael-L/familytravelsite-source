-- U04-F3b2. Normalize application API privileges after authentic-data rehearsal.
-- Historical files/ledger and all data, RLS, function bodies and service grants stay intact.
-- Executor must manage both postgres and supabase_admin public-schema defaults.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- RLS does not protect whole-table administrative operations. These roles are
-- application callers, never schema/maintenance operators. Include existing
-- private application tables; exclude all managed schemas and relation kinds.
do $acl$
declare r record; creator text; namespace text;
begin
 for r in select n.nspname,c.relname from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('public','family_auth')and c.relkind in('r','p','m')
 loop
  execute format('revoke truncate,references,trigger,maintain on table %I.%I from public,anon,authenticated',r.nspname,r.relname);
 end loop;
 -- Only application-schema table defaults change. Global routine defaults and
 -- managed schemas are deliberately not rewritten. Every new application RPC
 -- still requires an explicit revoke/allowlist in its own migration transaction.
 foreach creator in array array['postgres','supabase_admin']loop
  foreach namespace in array array['public','family_auth']loop
   execute format('alter default privileges for role %I in schema %I revoke truncate,references,trigger,maintain on tables from public,anon,authenticated',creator,namespace);
  end loop;
 end loop;
end $acl$;

-- Trip creation is create_trip_proposal/duplicate_trip, both qualified definers.
-- No permissive raw INSERT policy exists. Preserve the existing update columns
-- and archive/cover capability RLS; do not enable a new mobile/raw-create path.
revoke insert on public.trips from public,anon,authenticated;

-- Column grants do not narrow a pre-existing table grant. Clear the latter and
-- reassert the already-reviewed legacy compatibility allowlists exactly.
revoke insert,update,delete on public.schedule_items from public,anon,authenticated;
grant insert(id,trip_id,activity,advocate_person_id,not_in_family,country_id,place_id,experience_id,food_id,address,link_url,starts_at,ends_at,time_zone,sort_order,explanations,airtable_id)
 on public.schedule_items to authenticated;
grant update(activity,advocate_person_id,not_in_family,country_id,place_id,experience_id,food_id,address,link_url,starts_at,ends_at,time_zone,sort_order,explanations,airtable_id)
 on public.schedule_items to authenticated;
grant delete on public.schedule_items to authenticated;

-- User uploads register metadata through qualified private-upload RPCs. Catalog
-- imports/variant publication retain their separate service-role grants. Reads,
-- Storage byte policy, history/retention triggers and media identities stay intact.
revoke insert,update,delete on public.media_assets from public,anon,authenticated;

-- Explicit role revocation is required as well as PUBLIC: source platform
-- defaults had already supplied direct anon/authenticated grants.
revoke all on function public.catalog_media_urls(text,uuid[],integer)from public,anon;
grant execute on function public.catalog_media_urls(text,uuid[],integer)to authenticated;
revoke all on function public.resolve_my_person_id(uuid)from public,anon;
grant execute on function public.resolve_my_person_id(uuid)to authenticated;

-- These are owner/service internal mutators, not public catalog-edit or review
-- endpoints. Their SECURITY DEFINER trigger/RPC callers retain owner execution.
do $internal$
declare r record;
begin
 for r in select p.oid::regprocedure identity,
   has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
  from pg_proc p where p.oid=any(array[
   'public.refresh_place_cover(uuid)'::regprocedure,'public.refresh_food_cover(uuid)'::regprocedure,
   'public.refresh_hotel_cover(uuid)'::regprocedure,'public.refresh_experience_cover(uuid)'::regprocedure,
   'public.refresh_trip_change_request_status(uuid)'::regprocedure])
 loop
  execute format('revoke execute on function %s from public,anon,authenticated',r.identity);
  if r.service_execute then execute format('grant execute on function %s to service_role',r.identity);end if;
 end loop;
end $internal$;

-- Trigger functions can only run as triggers; caller EXECUTE is unnecessary.
-- PostgreSQL checks it when creating a trigger, not for an existing row event.
do $triggers$
declare r record;
begin
 for r in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)args,
   has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','family_auth')and p.prorettype='pg_catalog.trigger'::regtype
 loop
  execute format('revoke execute on function %I.%I(%s)from public,anon,authenticated',r.nspname,r.proname,r.args);
  if r.service_execute then execute format('grant execute on function %I.%I(%s)to service_role',r.nspname,r.proname,r.args);end if;
 end loop;
end $triggers$;
commit;
