"""Exact local browser bridge. No external hosts, schema/config changes or arbitrary SQL."""
from collection_library_support import *
import re,hmac
cfg=json.loads((S/'browser-private.json').read_text());cache=S/'browser-tokens-private.json'
read_rpcs={'count_my_unread_notifications','get_my_effective_preferences','get_my_effective_map_settings','get_my_auth_bootstrap','get_my_effective_features','list_family_place_categories','get_my_notification_preferences_v1','list_my_notifications_v1','list_my_notifications_v2','get_my_notification_count_v1','get_my_unread_notification_count_v1','list_my_sessions'}
collection_rpcs=set(re.findall("'([a-z0-9_]+)'",(S/'bridge.py').read_text().split('names=',1)[1].split('\ntry:',1)[0]))
read_tables={'profiles','people_avatar_refs','people','families','family_members','family_place_categories','trips','trip_travelers','family_permission_policies'}
try:
 data=json.load(sys.stdin);path=data['path'];method=data['method'];body=data.get('body');headers={k.lower():v for k,v in data['headers'].items()};assert headers.get('apikey')==cfg['anon_key'];token=headers.get('authorization','').removeprefix('Bearer ')
 allowed=set(json.loads(cache.read_text()))if cache.exists()else set()
 if path=='/auth/v1/token?grant_type=password':
  owner=cfg['browser_owner'];assert method=='POST'and hmac.compare_digest(str(body.get('email','')),owner['email'])and hmac.compare_digest(str(body.get('password','')),owner['password']);status,result=request('/token?grant_type=password',body,auth=True,method='POST')
  if status==200:assert result['user']['id']==owner['id'];allowed.add(result['access_token']);cache.write_text(json.dumps(sorted(allowed)))
 elif path=='/auth/v1/health':status,result=request('/health',auth=True,method='GET')
 else:
  assert token in allowed,'Synthetic browser bearer required'
  if path.startswith('/auth/v1/'):
   endpoint=path.removeprefix('/auth/v1');assert(endpoint=='/user'and method=='GET')or(endpoint.startswith('/logout')and method=='POST');status,result=request(endpoint,body,token=token,auth=True,method=method)
  else:
   m=re.fullmatch('/rest/v1/rpc/([a-z0-9_]+)',path)
   if m:assert m[1]in(collection_rpcs|read_rpcs)and method=='POST';status,result=request('/rpc/'+m[1],body,token=token,method=method)
   else:
    m=re.fullmatch('/rest/v1/([a-z0-9_]+)(\?.*)?',path);assert m and m[1]in read_tables and method=='GET';status,result=request(path.removeprefix('/rest/v1'),token=token,method='GET')
 # Record routes/status only, never bearer, credential bodies or source rows.
 with(S/'browser-bridge-events.log').open('a')as f:f.write(json.dumps({'path':path.split('?')[0],'method':method,'status':status,**({'code':result.get('code'),'message':str(result.get('message',''))[:250]}if status>=400 and isinstance(result,dict)else{})})+'\n')
 print(json.dumps({'status':status,'body':result}))
except Exception as error:
 with(S/'browser-bridge-refusals.log').open('a')as f:f.write(json.dumps({'path':str(locals().get('path','')).split('?')[0],'method':str(locals().get('method','')),'kind':type(error).__name__})+'\n')
 print(json.dumps({'status':503,'body':{'code':'fixture_browser_refused','message':'Owned browser fixture request refused.'}}))
