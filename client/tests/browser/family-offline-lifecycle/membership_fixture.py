"""Only an explicitly allowlisted synthetic member in the positively marked loopback project may be suspended/restored."""
from pathlib import Path
import json,sys,uuid,tomllib,subprocess,os
fixture=Path(sys.argv[1]);action=sys.argv[2];assert action in['suspend','restore'];assert str(fixture)in['/private/tmp/trek-u03d12-'+run+'-20261110/'+p+'-fixture/private-fixture.json'for run in['d16c','d16d']for p in['desktop','phone']];assert fixture.stat().st_mode&0o077==0
f=json.loads(fixture.read_text());assert f['api']=='http://127.0.0.1:55331';family=str(uuid.UUID(f['family_id']));user=str(uuid.UUID(f['owner']['id']))
s=json.loads(Path('/private/tmp/family-modernization-active.json').read_text());w=Path(s['workdir']).resolve();assert str(w).startswith('/private/tmp/family-modernization-')and s['project_id']=='family-modernization-20261104-q8ichzv';assert(w/'.family-modernization-disposable.json').is_file()and not(w/'supabase/.temp/project-ref').exists();c=tomllib.loads((w/'supabase/config.toml').read_text());assert c['project_id']==s['project_id']and c['api']['port']==55331 and c['db']['port']==55332
container='supabase_db_'+s['project_id'];info=json.loads(subprocess.check_output(['/usr/local/bin/docker','inspect',container],text=True))[0];assert info['State']['Running']and any(p['HostPort']=='55332'for p in info['NetworkSettings']['Ports']['5432/tcp'])
sys.path.insert(0,'/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');from journey_entry_recovery import JourneyRecovery,lit
JourneyRecovery.container=container;sql=JourneyRecovery.sql;assert sql("select exists(select 1 from public.families where id='0ea04851-1ad5-428d-9460-f086a4e94aa6')")=='f';assert sql('select count(*)from supabase_migrations.schema_migrations')=='119'
where='family_id='+lit(family)+'and user_id='+lit(user);journal=fixture.with_name('membership-original.json');current=json.loads(sql('select row_to_json(t)::text from public.family_members t where '+where))
if action=='suspend':
 assert not journal.exists()and current['status']=='active';os.umask(0o077);journal.write_text(json.dumps(current,sort_keys=True)+'\n');journal.chmod(0o600)
 assert sql("update public.family_members set status='suspended'where "+where+" and status='active' returning status")=='suspended'
 print(json.dumps({'synthetic_only':True,'status':'suspended'}))
else:
 assert journal.exists();original=json.loads(journal.read_text());assert original['status']=='active'and current['status']in['active','suspended']
 sql('update public.family_members set status='+lit(original['status'])+'where '+where)
 restored=json.loads(sql('select row_to_json(t)::text from public.family_members t where '+where));assert restored==original
 journal.rename(fixture.with_name('membership-restored.json'));print(json.dumps({'synthetic_only':True,'status':'active','exact_row_restored':True}))
