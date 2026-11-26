from pathlib import Path
import sys,json,uuid,subprocess,time,base64,secrets,hmac,hashlib,struct,os
S=Path(os.environ['FAMILY_COLLECTION_RECOVERY_FIXTURE_DIR']).resolve();import collection_library_guard as g,collection_recovery_engine as engine
DB='collection_library_candidate';ST=g.validate();API=json.loads((S/'api-private.json').read_text());COUNTS={'sql':0,'http':0}
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
 factor=okay('/factors',{'factor_type':'totp','friendly_name':'Collection fixture'},user,auth=True)
 challenge=okay('/factors/'+factor['id']+'/challenge',{},user,auth=True)
 if time.time()%30>27:time.sleep(3.1)
 key=base64.b32decode(factor['totp']['secret']+'='*(-len(factor['totp']['secret'])%8));d=hmac.new(key,struct.pack('>Q',int(time.time())//30),hashlib.sha1).digest();o=d[-1]&15;otp=str((struct.unpack('>I',d[o:o+4])[0]&0x7fffffff)%1000000).zfill(6)
 user['session']=okay('/factors/'+factor['id']+'/verify',{'challenge_id':challenge['id'],'code':otp},user,auth=True);user['factor_id']=factor['id']
def setup_users():
 cache=S/'users-private.json'
 if cache.exists():return json.loads(cache.read_text())
 family,other=new(),new();users={}
 sql('insert into public.families(id,name)values('+lit(family)+",'Collection recovery fixtures'),("+lit(other)+",'Other Collection fixtures')")
 for kind in ['owner','member','reviewer','outsider','global_admin']:
  email='collection-'+kind+'-'+uuid.uuid4().hex+'@fixture.invalid';password=secrets.token_urlsafe(24)
  u=okay('/admin/users',{'email':email,'password':password,'email_confirm':True},token=API['service_key'],auth=True)
  fam=other if kind in('outsider','global_admin')else family;role='patriarch'if kind=='reviewer'else'child'
  sql('BEGIN;insert into public.family_members(family_id,user_id,role,status)values('+lit(fam)+','+lit(u['id'])+','+lit(role)+",'active');select set_config('family_auth.allow_identity_link','1',true);insert into public.people(family_id,user_id,display_name)values("+lit(fam)+','+lit(u['id'])+','+lit('Collection '+kind)+');COMMIT;')
  user={'id':u['id'],'email':email,'password':password,'family_id':fam,'person_id':sql('select id from public.people where user_id='+lit(u['id']))}
  user['session']=okay('/token?grant_type=password',{'email':email,'password':password},auth=True)
  if kind in('reviewer','global_admin'):enroll(user)
  if kind=='global_admin':sql('update public.profiles set is_super_admin=true where id='+lit(u['id']))
  users[kind]=user
 cache.write_text(json.dumps({'family':family,'other_family':other,'users':users},indent=2));return json.loads(cache.read_text())

def author_context(collection,user,target=None):return rpc('get_family_collection_authoring_context_v1',{'collection_id':collection,'target':{}if target is None else target},user)
def prepare_content(collection,action,body,user,observation=None,op=None):
 if observation is None:
  target={'source':body['source']}if action in('create_reference','create_snapshot')else{'item_id':body['item_id']}if action in('edit','status','materialize')else{}
  observation=author_context(collection,user,target)['observation']
 op=op or new();result=rpc('prepare_family_collection_content_v1',{'collection_id':collection,'operation_id':op,'action':action,'body':body,'observation':observation},user)
 return op,result['original']
def execute_content(collection,op,original,user):return rpc('execute_family_collection_content_v1',{'collection_id':collection,'operation_id':op,'original':original},user)
def author(collection,action,body,user,**kw):
 op,original=prepare_content(collection,action,body,user,**kw);return execute_content(collection,op,original,user)
def manual_content(**kw):return{'name':'Manual place','description':'Independent description','latitude':None,'longitude':None,'address':None,'website':None,'phone':None,'family_place_category_id':None,'cover_media_id':None,**kw}

# Explicit test-only translation for pinned pre-retirement business regressions.
# This does not re-enable or call the retired public item writers.
def regression_request(path,payload=None,user=None,token=None,auth=False,method=None):
 name=path.removeprefix('/rpc/')
 if not auth and name in('add_list_item','set_list_item_status','reorder_list_items'):
  a={k.removeprefix('p_'):v for k,v in(payload or{}).items()}
  collection=a.get('list_id')or sql('select list_id from public.list_items where id='+lit(a.get('item_id')))
  if name=='add_list_item':action='create_reference';body={'source':{'kind':a['kind'],'id':a['entity_id']},'notes':None,'status':a.get('status','idea')};target={'source':body['source']}
  elif name=='set_list_item_status':action='status';body={'item_id':a['item_id'],'status':a['status']};target={'item_id':a['item_id']}
  else:action='reorder';body={'ordered_ids':a['item_ids']};target={}
  status,c=request('/rpc/get_family_collection_authoring_context_v1',{'p_collection_id':collection,'p_target':target},user)
  if status!=200:return status,c
  op=new();status,p=request('/rpc/prepare_family_collection_content_v1',{'p_collection_id':collection,'p_operation_id':op,'p_action':action,'p_body':body,'p_observation':c['observation']},user)
  if status!=200:return status,p
  status,r=request('/rpc/execute_family_collection_content_v1',{'p_collection_id':collection,'p_operation_id':op,'p_original':p['original']},user)
  return(status,r['item_id']if name=='add_list_item'and status==200 else None if status==200 else r)
 return request(path,payload,user,token,auth,method)
def regression_rpc(name,args,user):
 status,result=regression_request('/rpc/'+name,{'p_'+k:v for k,v in args.items()},user)
 if status not in(200,201,204):
  (S/'regression-http-error-private.json').write_text(json.dumps({'status':status,'body':result,'path':name}));raise RuntimeError('Qualified regression fixture call failed '+name+' '+str(status))
 return result
def regression_sql(query,user=None,fail=False,role=None):
 import re
 pattern=r"select public\.set_list_item_status\('([0-9a-f-]{36})','want'\);select public\.set_list_item_status\('\1','visited'\)"
 matched=re.fullmatch(pattern,query)
 if matched and user:
  claims=json.loads(base64.urlsafe_b64decode(user['session']['access_token'].split('.')[1]+'=='));item=matched.group(1)
  q='begin;select set_config(\'request.jwt.claims\','+lit(json.dumps(claims))+',true);update public.list_items set status=\'want\'where id='+lit(item)+';update public.list_items set status=\'visited\'where id='+lit(item)+';commit;'
  return sql(q,fail=fail)
 return sql(query,user,fail,role)
