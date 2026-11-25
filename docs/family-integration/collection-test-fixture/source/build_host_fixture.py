"""Restore one pinned accepted database into an owned compact host-backed fixture.

Requires an explicit private fixture and accepted export directory. No project URI,
hosted command, old-container restart, volume prune, migration or media operation.
"""
from pathlib import Path
import json,os,sys,uuid,subprocess,time,hashlib,shutil
os.umask(0o077)
EXPECTED_EXPORTS={'accepted142.dump': '8910b5df47325e57a94fbf2413628f68d76a4302d4dd89e926db0c3b05a331bc', 'role-flags-private.json': 'e87659f51f6d6c4b30d2caacf5f32325cde58f749a2d4b0681026bdfa7936d93', 'role-members-private.json': '342605edb6754241d6154fba742d71d60b83bcf8cd6b77811e86799103d7f1c3', 'source-routines-private.json': '351ff21a41d7b0d5d7bb636e6076aac0f354a003c6ec0290d18eeee3e67473e0'}
def require_space(path):
 assert shutil.disk_usage(path).free>=12*1024**3,'At least12GiB free on the private Mac fixture filesystem is required'

def verify_exports(source):
 for name,digest in EXPECTED_EXPORTS.items():
  p=source/name
  assert p.is_file()and not p.is_symlink(),name
  assert hashlib.sha256(p.read_bytes()).hexdigest()==digest,name

T=Path(os.environ['FAMILY_COMPACT_FIXTURE_DIR']).resolve();SOURCE=Path(os.environ['FAMILY_COMPACT_SOURCE_DIR']).resolve()
for p in [T,SOURCE]:assert p.is_relative_to(Path('/private/tmp'))and p.is_dir()and p.stat().st_uid==os.getuid()and p.stat().st_mode&0o077==0
sys.path.insert(0,str(T/'rehearsal'));import target as g,engine
verify_exports(SOURCE);assert T!=SOURCE;require_space(T)
assert not(T/'rehearsal/target-private.json').exists();data=T/'data';data.mkdir(mode=0o700);assert not data.is_symlink()
rows=engine.request('GET','/containers/json?all=true');ids=[r['Id']for r in rows];vols=[v['Name']for v in engine.request('GET','/volumes')['Volumes']];assert not any('/'+g.NAME in r['Names']for r in rows)and g.SOCK not in vols
before={cid:{k:engine.request('GET','/containers/'+cid+'/json')['State'][k]for k in ['Running','StartedAt','FinishedAt']}for cid in ids};(T/'protected-service-states-private.json').write_text(json.dumps(before));nonce=uuid.uuid4().hex
subprocess.run(['docker','volume','create','--label','family.stay.nonce='+nonce,g.SOCK],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['docker','run','--rm','--pull','never','--network','none','--read-only','--user','0:0','--cap-drop','ALL','--cap-add','CHOWN','--mount','type=bind,source='+str(data)+',target=/target','--mount','type=volume,source='+g.SOCK+',target=/socket','--entrypoint','/bin/sh',g.IMAGE,'-c','set -eu; chown 100:101 /target /socket'],check=True)
boot=T/'rehearsal/bootstrap.sh';final_boot=boot.read_text();assert 'shared_preload_libraries=pg_net,pg_stat_statements'in final_boot
restore_boot=final_boot.replace('shared_preload_libraries=pg_net,pg_stat_statements','shared_preload_libraries=pg_cron,pg_net,pg_stat_statements');boot.write_text(restore_boot)
def start():
 cid=subprocess.check_output(['docker','run','--detach','--pull','never','--no-healthcheck','--name',g.NAME,'--label','family.stay.nonce='+nonce,'--network','none','--read-only','--user','100:101','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','768m','--pids-limit','128','--mount','type=bind,source='+str(data)+',target=/var/lib/postgresql/data','--mount','type=volume,source='+g.SOCK+',target=/socket','--tmpfs','/tmp:rw,noexec,nosuid,size=256m','--log-opt','max-size=1m','--log-opt','max-file=2','--entrypoint','/bin/sh',g.IMAGE,'-c',boot.read_text()],text=True).strip()
 (T/'rehearsal/target-private.json').write_text(json.dumps({'purpose':'new-collection-transport-local-only','id':cid,'nonce':nonce,'protected_ids':ids,'protected_volumes':vols,'data_path':str(data)}))
 for _ in range(50):
  r=g.run('select 1',db='postgres')
  if r.returncode==0:break
  time.sleep(.3)
 else:raise RuntimeError('New host fixture did not start')
 return cid
cid=start();roles=json.loads((SOURCE/'role-flags-private.json').read_text());members=json.loads((SOURCE/'role-members-private.json').read_text());existing=json.loads(g.sql('select json_agg(rolname)from pg_roles',db='postgres'));quote=lambda v:'"'+v.replace('"','""')+'"';lit=lambda v:"'"+str(v).replace("'","''")+"'";commands=[]
for r in roles:
 if r['name']not in existing:
  flags=[a if r[k]else b for k,a,b in [('superuser','SUPERUSER','NOSUPERUSER'),('inherit','INHERIT','NOINHERIT'),('create_role','CREATEROLE','NOCREATEROLE'),('create_db','CREATEDB','NOCREATEDB'),('login','LOGIN','NOLOGIN'),('replication','REPLICATION','NOREPLICATION'),('bypass_rls','BYPASSRLS','NOBYPASSRLS')]]
  flags+=['CONNECTION LIMIT '+str(r['connection_limit'])]
  if r['valid_until']:flags+=['VALID UNTIL '+lit(r['valid_until'])]
  commands.append('create role '+quote(r['name'])+' with '+' '.join(flags)+';')
 for config in r['config']or[]:
  key,value=config.split('=',1);commands.append('alter role '+quote(r['name'])+' set '+quote(key)+' to '+lit(value)+';')
for r in members:commands.append('grant '+quote(r['role'])+' to '+quote(r['member'])+' with '+', '.join(k+' '+('true'if r[v]else'false')for k,v in [('ADMIN','admin'),('INHERIT','inherit'),('SET','set')])+';')
g.sql(''.join(commands),db='postgres');g.sql("create database collection_library_acceptance template template0 owner postgres encoding 'UTF8' locale_provider icu locale 'en_US.UTF-8' icu_locale 'en-US'",db='postgres')
with(T/'decode-private.log').open('w')as err:r=subprocess.run(['pg_restore','--single-transaction','--exit-on-error','--file='+str(T/'restore-original-private.sql'),str(SOURCE/'accepted142.dump')],stderr=err)
assert r.returncode==0;text=(T/'restore-original-private.sql').read_text();assert text.count('\nBEGIN;\n')==text.count('\nCOMMIT;\n')==1
postgres=next(r for r in roles if r['name']=='postgres');flag='SUPERUSER'if postgres['superuser']else'NOSUPERUSER'
text=text.replace('\nBEGIN;\n','\nBEGIN;\nALTER ROLE postgres SUPERUSER;\n').replace('\nCOMMIT;\n','\nALTER ROLE postgres '+flag+';\nCOMMIT;\n');(T/'restore-execution-private.sql').write_text(text)
with(T/'restore-execution-private.sql').open()as inp,(T/'restore-private.log').open('w')as log:r=subprocess.run(['docker','exec','-i',cid,'psql','-h','/socket','-X','-q','-v','ON_ERROR_STOP=1','-U',g.OP,'-d',g.DB],stdin=inp,stdout=log,stderr=subprocess.STDOUT,timeout=180)
assert r.returncode==0,'Restore failed; private diagnostics retained';assert g.sql('select count(*)from supabase_migrations.schema_migrations')=='142'
subprocess.run(['docker','stop','--time','20',cid],check=True,stdout=subprocess.DEVNULL);subprocess.run(['docker','rm',cid],check=True,stdout=subprocess.DEVNULL);boot.write_text(final_boot);cid=start();assert g.ready()
for db in ['collection_transport_candidate','collection_transport_acceptance']:g.sql('create database '+db+' template collection_library_acceptance',db='postgres')
query="select jsonb_object_agg(n.nspname||'.'||p.oid::regprocedure::text,jsonb_build_object('owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'definition',pg_get_functiondef(p.oid)))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','family_auth')and p.prokind='f'"
original=json.loads((SOURCE/'source-routines-private.json').read_text());actual=json.loads(g.sql(query));assert original==actual and len(actual)==672
for cid,state in before.items():assert{k:engine.request('GET','/containers/'+cid+'/json')['State'][k]for k in state}==state
receipt={'method':'one pinned accepted142 database restored into compact private host-backed data','schema':142,'routine_definitions_owners_ACLs_match':672,'internal_OIDs_preserved':False,'old_service_states_exact':len(before),'old_volumes_removed':0,'passwords_copied':False,'database_password_hash_rows_restored_privately':True,'database_schema_changed':False,'new_migrations':0,'data_storage':'owned private Mac fixture directory','network':'none','published_ports':[],'scheduler_preload_final':False,'cron_jobs_enabled':False,'role_flags_membership_options_reproduced':True};(T/'compact-restore.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
