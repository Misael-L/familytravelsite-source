from pathlib import Path
import sys,types,json,hashlib
t=Path('/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');sys.path.insert(0,str(t))
import packing_category_command_test_scope
import packing_category_command_guard as g
g.validate()
s=Path(__file__).resolve().parent
target=Path('/private/tmp/trek-u03d12-u04c2c2-categories-r6-20261111')
assert not target.exists()
# Scope the inherited normal-entry fixture to the already guarded122 project; never change historical sources.
p=t/'prepare_planner_entry.py';text=p.read_text();assert text.count("=='119'")==1
text=text.replace("=='119'","=='122'").replace("=='http://127.0.0.1:55331'","=='http://127.0.0.1:55431'")
m=types.ModuleType('prepare_planner_entry');m.__file__=str(p);sys.modules[m.__name__]=m;exec(compile(text,str(p),'exec'),m.__dict__)
cls=m.ApplicationEntryFixture;original=cls.sql
country_sql="insert into public.countries(name,iso2,iso3) values('Fixture country','ZZ','ZZZ') on conflict(iso2) do update set name=excluded.name returning id"
country=g.sql("select to_jsonb(c)::text from public.countries c where iso2='ZZ'");assert country
cls.sql=classmethod(lambda klass,q,*args:original("select id from public.countries where iso2='ZZ'" if q==country_sql else q,*args))
r=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2')
source=(r/'client/tests/browser/family-offline-lifecycle/prepare_fixture.py').read_text().replace("assert case.api=='http://127.0.0.1:55331'","assert case.api=='http://127.0.0.1:55431'")
extra='    guest=pack.sql("begin;select set_config(\'family_auth.allow_identity_link\',\'1\',true);insert into public.people(family_id,display_name)values("+lit(case.family)+",\'Category Guest\')returning id;commit;").splitlines()[-1]\n    historical=pack.sql("begin;select set_config(\'family_auth.allow_identity_link\',\'1\',true);insert into public.people(family_id,display_name)values("+lit(case.family)+",\'Historical Guest\')returning id;commit;").splitlines()[-1]\n    pack.sql(\'insert into public.trip_travelers(trip_id,person_id)values(\'+lit(case.trip)+\',\'+lit(guest)+\'),(\'+lit(case.trip)+\',\'+lit(historical)+\')\')\n    pack.sql("update public.packing_items set category=\'Gear\'where id="+lit(common[\'id\']))\n    packet=pack.rpc(\'get_family_trip_packing_with_categories_v1\',[case.trip])\n    category=next(c for c in packet[\'categories\']if c[\'name\']==\'Gear\'and c[\'owner_person_id\']is None)\n    import uuid\n    pack.rpc(\'execute_family_trip_packing_category_v1\',[case.trip,str(uuid.uuid4()),packet[\'scope\'],\'category-assignees\',packet[\'collection_revision\'],category,{\'person_ids\':[historical]}])\n    pack.sql(\'delete from public.trip_travelers where trip_id=\'+lit(case.trip)+\'and person_id=\'+lit(historical))\n    data[\'category_guest\']=guest\n    data[\'historical_guest\']=historical\n'
source=source.replace("    data['rich_packing']=",extra+"    data['rich_packing']=")
sys.argv=['prepare_fixture.py','--output-root',str(target)];exec(compile(source,'<guarded122-normal-entry-fixtures>','exec'))
assert g.sql("select to_jsonb(c)::text from public.countries c where iso2='ZZ'")==country;g.validate()
(s/'browser-preparation.json').write_text(json.dumps({'schema':122,'api':'http://127.0.0.1:55431','db_port':55432,'project':'family-modernization-20261111-c2a','profiles':['desktop','phone'],'fresh_fixture_root':str(target),'shared_country_exact':True,'historical_helpers_changed':False},indent=2)+'\n')
print('Fresh122 actual-entry desktop/phone Trips, guest, media and independent recovery graphs prepared.')
