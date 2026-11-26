from pathlib import Path
import sys,os,json,subprocess,secrets,time,base64,hmac,hashlib
S=Path(__file__).parent;sys.path.insert(0,str(S/'rehearsal'));import target as g,engine
os.umask(0o077);st=g.validate();secret=secrets.token_hex(32)
def launch(name,image,env,network,readonly_mount=False):
 assert not any('/'+name in x['Names']for x in engine.request('GET','/containers/json?all=true'))
 path=S/(name+'-env-private');path.write_text(''.join(k+'='+v+'\n'for k,v in env.items()))
 args=['docker','run','--detach','--pull','never','--no-healthcheck','--name',name,'--label','family.stay.nonce='+st['nonce'],'--network',network,'--read-only','--user','100:101','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','256m','--pids-limit','64','--mount','type=volume,source='+g.SOCK+',target=/socket'+(',readonly'if readonly_mount else''),'--tmpfs','/tmp:rw,noexec,nosuid,size=32m','--env-file',str(path),image]
 cid=subprocess.check_output(args,text=True).strip()
 return {'id':cid,'name':name,'image':image,'jwt_secret':secret}
rest=launch(g.NAME+'_rest','sha256:b9d08b0ef5306d50304e6e05bfc88ca35a04bcddc7a1c3d38950b8df70a5ebda',{
 'PGRST_DB_URI':'postgresql://authenticator@/collection_transport_candidate?host=/socket','PGRST_DB_SCHEMAS':'public','PGRST_DB_ANON_ROLE':'anon','PGRST_DB_CONFIG':'false','PGRST_DB_POOL':'4','PGRST_JWT_SECRET':secret,'PGRST_SERVER_UNIX_SOCKET':'/socket/rest.sock','PGRST_SERVER_UNIX_SOCKET_MODE':'660','PGRST_LOG_LEVEL':'error'},'none')
(S/'rehearsal/rest-private.json').write_text(json.dumps(rest))
prior=g.sql('select json_agg(version order by version)from auth.schema_migrations',db='collection_transport_candidate')
auth=launch(g.NAME+'_auth','sha256:55317705734c469aa56fde1b0915480102863e3cc2a50b8431d451b1d838d687',{
 'GOTRUE_API_HOST':'127.0.0.1','PORT':'9999','API_EXTERNAL_URL':'http://127.0.0.1:9999','GOTRUE_SITE_URL':'http://127.0.0.1',
 'GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':'postgresql://supabase_auth_admin@localhost/collection_transport_candidate?host=/socket&sslmode=disable&search_path=auth','GOTRUE_DB_NAMESPACE':'auth','GOTRUE_DB_CLEANUP_ENABLED':'false','GOTRUE_JWT_SECRET':secret,'GOTRUE_JWT_EXP':'3600','GOTRUE_JWT_AUD':'authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME':'authenticated','GOTRUE_JWT_ADMIN_ROLES':'service_role','GOTRUE_DISABLE_SIGNUP':'true','GOTRUE_EXTERNAL_EMAIL_ENABLED':'true','GOTRUE_MAILER_AUTOCONFIRM':'true','GOTRUE_MFA_TOTP_ENROLL_ENABLED':'true','GOTRUE_MFA_TOTP_VERIFY_ENABLED':'true','GOTRUE_MFA_MAX_ENROLLED_FACTORS':'10','GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED':'true','GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL':'10','GOTRUE_LOG_LEVEL':'error','GOTRUE_RATE_LIMIT_TOKEN_REFRESH':'1000','GOTRUE_RATE_LIMIT_VERIFY':'1000'},'container:'+st['id'],True)
(S/'auth-private.json').write_text(json.dumps(auth))
for _ in range(50):
 code,out,err=engine.exec_input(st['id'],['/usr/bin/curl','--silent','--max-time','2','--include','http://127.0.0.1:9999/health'],'',timeout=5)
 if code==0 and out.startswith('HTTP/1.1 200'):break
 time.sleep(.3)
else:raise RuntimeError('New isolated Auth did not start')
assert g.sql('select json_agg(version order by version)from auth.schema_migrations',db='collection_transport_candidate')==prior
def token(role):
 enc=lambda v:base64.urlsafe_b64encode(json.dumps(v,separators=(',',':')).encode()).decode().rstrip('=')
 text=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'role':role,'iss':'supabase','iat':int(time.time()),'exp':int(time.time())+86400})
 return text+'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),text.encode(),hashlib.sha256).digest()).decode().rstrip('=')
(S/'api-private.json').write_text(json.dumps({'anon_key':token('anon'),'service_key':token('service_role')}))
(S/'api-startup.json').write_text(json.dumps({'real_GoTrue':True,'real_PostgREST':True,'auth_ledger_unchanged':True,'owned_service_count':3,'published_ports':[],'egress':'none','hosted':False},indent=2)+'\n')
print('Owned GoTrue/PostgREST ready, no published ports or egress; original Auth ledger unchanged.')
