"""Synthetic Auth/RLS fixture support; requires the explicit owned local Atlas guard."""
from pathlib import Path
import sys,json,uuid,subprocess,time,base64,secrets,hmac,hashlib,struct,os
S=Path(os.environ['FAMILY_ATLAS_FIXTURE_DIR']).resolve();import target as g,engine
DB='atlas_stats_candidate';ST=g.validate();API=json.loads((S/'api-private.json').read_text());COUNTS={'sql':0,'http':0}
new=lambda:str(uuid.uuid4());lit=lambda x:"'"+str(x).replace("'","''")+"'"
def sql(q,user=None,fail=False,role=None):
 if user:
  claims=json.loads(base64.urlsafe_b64decode(user['session']['access_token'].split('.')[1]+'=='))
  q='BEGIN;select set_config(\'request.jwt.claims\','+lit(json.dumps(claims))+',true);SET LOCAL ROLE authenticated;'+q+';COMMIT;'
 elif role:q='BEGIN;SET LOCAL ROLE '+role+';'+q+';COMMIT;'
 COUNTS['sql']+=1;r=g.run("set statement_timeout='30s';set lock_timeout='8s';"+q,db=DB)
 if fail:return r
 if r.returncode:
  (S/'test-error-private.log').write_text(r.stderr);raise RuntimeError('Local SQL failed; see private test-error-private.log')
 return r.stdout.strip().splitlines()[-1]if r.stdout.strip()else''
def request(path,payload=None,user=None,token=None,auth=False,method=None):
 g.validate_http();COUNTS['http']+=1
 headers=['Content-Type: application/json','apikey: '+API['anon_key'],'Authorization: Bearer '+(token or(user['session']['access_token']if user else API['anon_key']))]
 config=['silent','show-error','max-time = 30','url = '+json.dumps(('http://127.0.0.1:9999'if auth else'http://localhost')+path),'request = '+json.dumps(method or('POST'if payload is not None else'GET')),'write-out = "\\n%{http_code}"']
 config+=['header = '+json.dumps(h)for h in headers]
 if payload is not None:config+=['data-binary = '+json.dumps(json.dumps(payload))]
 args=['/usr/bin/curl']+([]if auth else['--unix-socket','/socket/rest.sock'])+['--config','-']
 code,out,err=engine.exec_input(ST['id'],args,'\n'.join(config)+'\n',timeout=40)
 if code:raise RuntimeError('Owned local HTTP transport failed')
 raw,status=out.rsplit('\n',1);return int(status),json.loads(raw or'null')
def okay(path,payload=None,user=None,**kw):
 status,result=request(path,payload,user,**kw)
 if status not in(200,201,204):
  (S/'http-error-private.json').write_text(json.dumps({'status':status,'body':result,'path':path}));raise RuntimeError('Owned HTTP request failed '+path+' status '+str(status))
 return result
def rpc(name,args,user):return okay('/rpc/'+name,{'p_'+k:v for k,v in args.items()},user)
def enroll(user):
 factor=okay('/factors',{'factor_type':'totp','friendly_name':'Atlas statistics fixture'},user,auth=True)
 challenge=okay('/factors/'+factor['id']+'/challenge',{},user,auth=True)
 if time.time()%30>27:time.sleep(3.1)
 key=base64.b32decode(factor['totp']['secret']+'='*(-len(factor['totp']['secret'])%8));d=hmac.new(key,struct.pack('>Q',int(time.time())//30),hashlib.sha1).digest();o=d[-1]&15;otp=str((struct.unpack('>I',d[o:o+4])[0]&0x7fffffff)%1000000).zfill(6)
 user['session']=okay('/factors/'+factor['id']+'/verify',{'challenge_id':challenge['id'],'code':otp},user,auth=True);user['factor_id']=factor['id']
def setup_users():
 cache=S/'atlas-users-private.json'
 if cache.exists():return json.loads(cache.read_text())
 family,other=new(),new();users={}
 sql('insert into public.families(id,name)values('+lit(family)+",'Atlas statistics fixtures'),("+lit(other)+",'Other Atlas fixtures')")
 for kind in ['owner','member','reviewer','outsider','global_admin']:
  email='atlas-'+kind+'-'+uuid.uuid4().hex+'@fixture.invalid';password=secrets.token_urlsafe(24)
  u=okay('/admin/users',{'email':email,'password':password,'email_confirm':True},token=API['service_key'],auth=True)
  fam=other if kind in('outsider','global_admin')else family;role='patriarch'if kind=='reviewer'else'child'
  sql('BEGIN;insert into public.family_members(family_id,user_id,role,status)values('+lit(fam)+','+lit(u['id'])+','+lit(role)+",'active');select set_config('family_auth.allow_identity_link','1',true);insert into public.people(family_id,user_id,display_name)values("+lit(fam)+','+lit(u['id'])+','+lit('Atlas '+kind)+');COMMIT;')
  user={'id':u['id'],'email':email,'password':password,'family_id':fam,'person_id':sql('select id from public.people where user_id='+lit(u['id']))}
  user['session']=okay('/token?grant_type=password',{'email':email,'password':password},auth=True)
  if kind in('reviewer','global_admin'):enroll(user)
  if kind=='global_admin':sql('update public.profiles set is_super_admin=true where id='+lit(u['id']))
  users[kind]=user
 cache.write_text(json.dumps({'family':family,'other_family':other,'users':users},indent=2));return json.loads(cache.read_text())
