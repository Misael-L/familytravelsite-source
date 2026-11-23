from pathlib import Path
import hashlib,json,subprocess,os
import engine
S=Path(__file__).resolve().parent
assert S.is_relative_to(Path('/private/tmp'))and S.is_dir()and S.stat().st_uid==os.getuid()and S.stat().st_mode&0o077==0,'Explicit private local fixture directory required'
DB='collection_library_acceptance';OP='family_restore_operator';NAME='family_collection_compact_host_20261114';VOL=NAME+'_data';SOCK=NAME+'_socket';IMAGE='sha256:448276390cbb668b6be9e831dd02c8ac76f3746689b69a149ab826088f043a8f'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def docker(*a):
 if len(a)==2 and a[0]=='inspect':return json.dumps([engine.request('GET','/containers/'+a[1]+'/json')])
 if len(a)==3 and a[:2]==('volume','inspect'):return json.dumps([engine.request('GET','/volumes/'+a[2])])
 raise AssertionError('Only owned target/volume metadata reads are admitted here')
def validate():
 st=json.loads((S/'target-private.json').read_text());o=json.loads(docker('inspect',NAME))[0]
 assert st['purpose']=='new-collection-transport-local-only'and o['Id']==st['id']and o['Image']==IMAGE and o['State']['Running'];assert o['HostConfig']['NetworkMode']=='none'and not o['HostConfig'].get('PortBindings')and o['HostConfig']['ReadonlyRootfs']and o['Config']['User']=='100:101'and o['HostConfig']['CapDrop']==['ALL'];assert o['Config']['Labels']['family.stay.nonce']==st['nonce'];assert o['Id']not in st['protected_ids'];assert o['Config']['Cmd']==['-c',(S/'bootstrap.sh').read_text()]
 assert {(m['Name'],m['Destination'])for m in o['Mounts']if m['Type']=='volume'}=={(SOCK,'/socket')}
 assert [(m['Source'],m['Destination'],m['RW'])for m in o['Mounts']if m['Type']=='bind']==[(str(S.parent/'data'),'/var/lib/postgresql/data',True)]
 assert st['data_path']==str(S.parent/'data')and not(S.parent/'data').is_symlink()and S.parent.stat().st_uid==os.getuid()and S.parent.stat().st_mode&0o077==0
 for n in [SOCK]:assert n not in st['protected_volumes']and json.loads(docker('volume','inspect',n))[0]['Labels']['family.stay.nonce']==st['nonce']
 return st

def run(sql,db=DB):
 assert db in [DB,'postgres','collection_transport_candidate','collection_transport_acceptance'];st=validate();code,out,err=engine.exec_input(st['id'],['psql','-h','/socket','-X','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U',OP,'-d',db],sql,timeout=240);return subprocess.CompletedProcess(['guarded-local-psql'],code,out,err)
def sql(q,db=DB):
 r=run(q,db)
 if r.returncode:(S/'last-error-private.log').write_text(r.stderr);raise RuntimeError('Guarded local SQL failed; private log retained')
 return r.stdout.strip()
def ready():
 r=json.loads(sql("select json_build_object('db',current_database(),'engine',current_setting('server_version'),'listen',current_setting('listen_addresses'),'cron',current_setting('cron.launch_active_jobs'),'net',current_setting('pg_net.database_name'))"));assert r=={'db':DB,'engine':'17.11','listen':'','cron':'off','net':'family_restore_disabled'};return r

def validate_http(return_state=False):
 st=validate();r=json.loads((S/'rest-private.json').read_text());o=json.loads(docker('inspect',r['id']))[0]
 assert o['Id']==r['id']and o['Name']=='/'+r['name']and o['Image']=='sha256:b9d08b0ef5306d50304e6e05bfc88ca35a04bcddc7a1c3d38950b8df70a5ebda'and o['State']['Running']
 assert o['HostConfig']['NetworkMode']=='none'and not o['HostConfig'].get('PortBindings')and not o['NetworkSettings'].get('Ports')and o['HostConfig']['ReadonlyRootfs']and o['Config']['User']=='100:101'and o['HostConfig']['CapDrop']==['ALL']
 assert o['Config']['Labels']['family.stay.nonce']==st['nonce']and {(m['Name'],m['Destination'])for m in o['Mounts']if m['Type']=='volume'}=={(SOCK,'/socket')}and not any(m['Type']=='bind'for m in o['Mounts'])
 env=dict(e.split('=',1)for e in o['Config']['Env']if'='in e)
 assert env['PGRST_DB_URI']=='postgresql://authenticator@/collection_transport_candidate?host=/socket'and env['PGRST_DB_CONFIG']=='false'and env['PGRST_SERVER_UNIX_SOCKET']=='/socket/rest.sock'and env['PGRST_JWT_SECRET']==r['jwt_secret']
 return st if return_state else True
