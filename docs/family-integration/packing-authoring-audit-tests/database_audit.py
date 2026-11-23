from pathlib import Path
import sys,json,base64,hashlib,time,os
s=Path(__file__).resolve().parent;t=Path('/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');sys.path.insert(0,str(t))
import packing_category_command_guard as g
g.validate()
f=json.loads(Path(os.environ.get('C3_AUDIT_FIXTURE','/private/tmp/trek-u04c2c3-sdk-fixtures-20261111/live-fixture.json')).read_text());assert f['api']=='http://127.0.0.1:55431'
claims=json.loads(base64.urlsafe_b64decode(f['access_token'].split('.')[1]+'=='));assert claims['sub']==f['user_id']and claims['aal']=='aal2'
lit=lambda v:"'"+str(v).replace("'","''")+"'"
tables=['public.trips','public.trip_travelers','public.packing_categories','public.packing_category_assignments','public.packing_category_assignees','public.packing_items','family_auth.trip_packing_state','family_auth.packing_command_receipts','public.family_audit_events']
tables=[n for n in tables if g.sql('select to_regclass('+lit(n)+')is not null')=='t']
def graph():
 return {n:g.sql("select count(*)||':'||encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x)order by to_jsonb(x)::text),'[]')::text,'UTF8')),'hex')from "+n+' x')for n in tables}
before=graph();(s/'tables-before.json').write_text(json.dumps(before,indent=2)+'\n')
schema=g.sql("select jsonb_build_object('columns',(select jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'nullable',is_nullable,'default',column_default)order by ordinal_position)from information_schema.columns where table_schema='public'and table_name='packing_categories'),'constraints',(select jsonb_agg(pg_get_constraintdef(oid)order by conname)from pg_constraint where conrelid='public.packing_categories'::regclass),'indexes',(select jsonb_agg(indexdef order by indexname)from pg_indexes where schemaname='public'and tablename in('packing_categories','packing_items','packing_category_assignments')),'rls',(select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity))from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relname in('packing_categories','packing_category_assignments')))")
(s/'schema-observed.json').write_text(json.dumps(json.loads(schema),indent=2)+'\n')
script=(s/'rollback-witnesses.sql').read_text()
for a,b in [('__USER__',lit(f['user_id'])),('__FAMILY__',lit(f['family_id'])),('__PERSON__',lit(f['person_id'])),('__CLAIMS__',lit(json.dumps(claims)))]:script=script.replace(a,b)
start=time.monotonic();output=g.sql(script);results=json.loads(output.splitlines()[-1]);assert len(results)==16 and len(set(results))==16
after=graph();assert before==after;g.validate()
(s/'tables-after.json').write_text(json.dumps(after,indent=2)+'\n')
receipt={'schema':122,'api':'http://127.0.0.1:55431','marked_local_only':True,'role':'authenticated','claims_source':'existing synthetic Auth-issued AAL2 fixture; no new Auth/HTTP claim','actual_witnesses':len(results),'results':results,'all_domain_changes_rolled_back':True,'observed_tables':len(tables),'all_table_counts_and_hashes_exact':True,'schema_and_function_guard_before_after':True,'elapsed_seconds':round(time.monotonic()-start,2),'migration_applied':False}
(s/'database-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items()if k!='results'}))
