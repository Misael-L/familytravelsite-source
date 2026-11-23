"""Guarded synthetic Person reassignment in the existing marked disposable project; never a production command."""
from pathlib import Path
import json,os,subprocess,sys,tomllib,uuid
fixture=Path(sys.argv[1]);action=sys.argv[2];assert action in ['replace','restore']
assert str(fixture)in ['/private/tmp/trek-u03d12-d16d-20261110/'+p+'-fixture/private-fixture.json'for p in ['desktop','phone']]
assert fixture.stat().st_mode&0o077==0;f=json.loads(fixture.read_text());assert f['api']=='http://127.0.0.1:55331'
family=str(uuid.UUID(f['family_id']));user=str(uuid.UUID(f['owner']['id']));original=str(uuid.UUID(f['identity_test']['original_person']));replacement=str(uuid.UUID(f['identity_test']['replacement_person']));assert original!=replacement
s=json.loads(Path('/private/tmp/family-modernization-active.json').read_text());w=Path(s['workdir']).resolve();assert str(w).startswith('/private/tmp/family-modernization-')and s['project_id']=='family-modernization-20261104-q8ichzv'
assert(w/'.family-modernization-disposable.json').is_file()and not(w/'supabase/.temp/project-ref').exists();c=tomllib.loads((w/'supabase/config.toml').read_text());assert c['project_id']==s['project_id']and c['api']['port']==55331 and c['db']['port']==55332
container='supabase_db_'+s['project_id'];info=json.loads(subprocess.check_output(['/usr/local/bin/docker','inspect',container],text=True))[0];assert info['State']['Running']and any(p['HostPort']=='55332'for p in info['NetworkSettings']['Ports']['5432/tcp'])
sys.path.insert(0,'/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');from journey_entry_recovery import JourneyRecovery,lit
JourneyRecovery.container=container;sql=JourneyRecovery.sql
assert sql("select exists(select 1 from public.families where id='0ea04851-1ad5-428d-9460-f086a4e94aa6')")=='f'and sql('select count(*)from supabase_migrations.schema_migrations')=='119'
where='family_id='+lit(family)+' and id in('+lit(original)+','+lit(replacement)+')'
def rows():
 data=json.loads(sql('select json_agg(t order by id)::text from public.people t where '+where));assert len(data)==2;return data
current=rows();by_id={p['id']:p for p in current};journal=fixture.with_name('person-original.json')
if action=='replace':
 assert not journal.exists()and by_id[original]['user_id']==user and by_id[replacement]['user_id']is None
 os.umask(0o077);journal.write_text(json.dumps(current,sort_keys=True)+'\n');journal.chmod(0o600)
 sql("begin;set local family_auth.allow_identity_link='1';update public.people set user_id=null where id="+lit(original)+' and family_id='+lit(family)+';update public.people set user_id='+lit(user)+' where id='+lit(replacement)+' and family_id='+lit(family)+';commit;')
 assert {p['id']:p['user_id']for p in rows()}=={original:None,replacement:user};print(json.dumps({'synthetic_only':True,'reassigned':True}))
else:
 assert journal.exists();before=json.loads(journal.read_text());assert {p['id']:p['user_id']for p in before}=={original:user,replacement:None}
 sql("begin;set local family_auth.allow_identity_link='1';update public.people set user_id=null where id="+lit(replacement)+' and family_id='+lit(family)+';update public.people set user_id='+lit(user)+' where id='+lit(original)+' and family_id='+lit(family)+';commit;')
 assert rows()==before
 journal.rename(fixture.with_name('person-restored.json'));print(json.dumps({'synthetic_only':True,'exact_people_rows_restored':True}))
