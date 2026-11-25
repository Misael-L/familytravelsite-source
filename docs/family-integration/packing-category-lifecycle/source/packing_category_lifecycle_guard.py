from pathlib import Path
import json,hashlib,subprocess,tomllib
ROOT=Path('/Users/Misael/Desktop/FamilyTravelApp')
STAGE=Path('/private/tmp/trek-u04c3a-packing-category-lifecycle-20261111')
STATE=STAGE/'rehearsal-state.json'
def container():return 'supabase_db_family-modernization-20261111-c3a'
def sql(statement):
 p=subprocess.run(['docker','exec','-i',container(),'psql','-X','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input=statement,text=True,capture_output=True,timeout=180)
 if p.returncode:raise RuntimeError(p.stderr)
 return p.stdout.strip()
def old_hashes():
 rows=json.loads((ROOT/'supabase/tests/packing_category_lifecycle_migration_prefix.json').read_text());assert len(rows)==122
 assert all(hashlib.sha256((ROOT/'supabase/migrations'/n).read_bytes()).hexdigest()==h for n,h in rows.items())
def validate():
 s=json.loads(STATE.read_text());w=Path(s['workdir']);assert s['project_id']=='family-modernization-20261111-c3a'and str(w)=='/private/tmp/family-modernization-20261111-c3a';assert(s['api_port'],s['db_port'])==(55531,55532)
 assert(w/'.family-modernization-disposable.json').is_file()and not(w/'supabase/.temp/project-ref').exists()
 cfg=tomllib.loads((w/'supabase/config.toml').read_text());assert cfg['project_id']==s['project_id']and(cfg['api']['port'],cfg['db']['port'])==(55531,55532)
 d=json.loads(subprocess.check_output(['docker','inspect',container()],text=True))[0];assert d['Config']['Image']=='public.ecr.aws/supabase/postgres:17.11.0.003';assert any(x['Type']=='volume'and 'family-modernization-20261111-c3a'in x.get('Name','')for x in d['Mounts']);assert any(int(x['HostPort'])==55532 for x in d['NetworkSettings']['Ports']['5432/tcp'])
 assert sql("select exists(select 1 from public.families where id='0ea04851-1ad5-428d-9460-f086a4e94aa6')")=='f';old_hashes()
 expected=json.loads((ROOT/'supabase/tests/packing_category_lifecycle_schema.json').read_text())
 assert sql('show server_version')=='17.11'and sql('select count(*)from supabase_migrations.schema_migrations')=='123'
 assert hashlib.sha256((ROOT/'supabase/migrations'/expected['migration']).read_bytes()).hexdigest()==expected['migration_sha256']
 assert sql("select encode(sha256(convert_to(statements[1],'UTF8')),'hex')from supabase_migrations.schema_migrations where version='20261112050004'and cardinality(statements)=1")==expected['migration_sha256']
 for signature,digest in expected['functions'].items():assert hashlib.sha256(sql("select pg_get_functiondef('"+signature+"'::regprocedure)").encode()).hexdigest()==digest,signature
 assert hashlib.sha256(sql((ROOT/'supabase/tests/packing_category_lifecycle_schema_contract.sql').read_text()).encode()).hexdigest()==expected['schema_contract_sha256']
 return w
