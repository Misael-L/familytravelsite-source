from pathlib import Path
import json,hashlib,subprocess,tomllib
ROOT=Path('/Users/Misael/Desktop/FamilyTravelApp')
STAGE=Path('/private/tmp/trek-u04d2c1b-packing-cancellation-20261112')
STATE=STAGE/'rehearsal-state.json'
def container():return 'supabase_db_family-modernization-20261112-d2c1b'
def sql(statement):
 p=subprocess.run(['docker','exec','-i',container(),'psql','-X','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input='set jit=off;set max_parallel_workers_per_gather=0;'+statement,text=True,capture_output=True,timeout=180)
 if p.returncode:raise RuntimeError(p.stderr)
 return p.stdout.strip()
def old_hashes():
 rows=json.loads((ROOT/'supabase/tests/packing_restore_cancellation_migration_prefix.json').read_text());assert len(rows)==126
 assert all(hashlib.sha256((ROOT/'supabase/migrations'/n).read_bytes()).hexdigest()==h for n,h in rows.items())
def validate():
 s=json.loads(STATE.read_text());w=Path(s['workdir']);assert s['project_id']=='family-modernization-20261112-d2c1b'and str(w)=='/private/tmp/family-modernization-20261112-d2c1b'and s['schema']==127
 assert(s['api_port'],s['db_port'])==(55931,55932)
 assert(w/'.family-modernization-disposable.json').is_file()and json.loads((w/'.family-modernization-disposable.json').read_text())['project_id']==s['project_id']and not(w/'supabase/.temp/project-ref').exists()
 cfg=tomllib.loads((w/'supabase/config.toml').read_text());assert cfg['project_id']==s['project_id']and(cfg['api']['port'],cfg['db']['port'])==(55931,55932)
 d=json.loads(subprocess.check_output(['docker','inspect',container()],text=True))[0];assert d['Config']['Image']=='public.ecr.aws/supabase/postgres:17.11.0.003'
 assert d['HostConfig']['PortBindings']['5432/tcp']==[{'HostIp':'','HostPort':'55932'}]
 assert any(x['Type']=='volume'and s['project_id']in x.get('Name','')for x in d['Mounts'])and all(s['project_id']in x.get('Name','')for x in d['Mounts']if x['Type']=='volume')
 assert sql("select exists(select 1 from public.families where id='0ea04851-1ad5-428d-9460-f086a4e94aa6')")=='f';old_hashes()
 e=json.loads((ROOT/'supabase/tests/packing_restore_cancellation_schema.json').read_text())
 assert sql('show server_version')=='17.11'and sql('select count(*)from supabase_migrations.schema_migrations')=='127'
 assert hashlib.sha256((ROOT/'supabase/migrations'/e['migration']).read_bytes()).hexdigest()==e['migration_sha256']
 assert sql(e['ledger_query'])==e['ledger_sha256']
 assert json.loads(sql(e['function_query']))==e['functions']
 assert hashlib.sha256(sql((ROOT/'supabase/tests/packing_restore_cancellation_schema_contract.sql').read_text()).encode()).hexdigest()==e['schema_contract_sha256']
 return w
if __name__=='__main__':validate();print('Strict isolated127 target/source/ledger/function/schema guard passed')
