"""Actual SDK HTTP bridge to an owned Unix REST socket; no arbitrary SQL/host URL."""
from collection_library_support import *
import re
names={'get_family_collection_preparation_outcome_v2','cancel_family_collection_preparation_v2','get_family_collection_library_v1','get_family_collection_page_v1','get_family_collection_editor_v1','get_family_collection_membership_v1','get_family_collection_authoring_context_v1','prepare_family_collection_content_v1','execute_family_collection_content_v1','get_family_collection_content_operation_v1','cancel_family_collection_content_v1','get_family_collection_context_v1','get_family_collection_item_context_v1','list_family_collection_trash_v1','list_family_collection_item_trash_v1','execute_family_collection_lifecycle_v1','execute_family_collection_item_lifecycle_v1','list_family_collection_versions_v1','get_family_collection_operation_v1','cancel_family_collection_operation_v1'}
try:
 cfg=json.loads((S/'live-private.json').read_text());data=json.load(sys.stdin);g.validate_http();action=data.get('action','request')
 if action!='request':
  assert action in['expire','restore_session','source_edit','source_restore']
  if action in['expire','restore_session']:
   own=cfg['sessions']['owner'];claims=json.loads(base64.urlsafe_b64decode(own['session']['access_token'].split('.')[1]+'=='));value="now()-interval'1 minute'"if action=='expire'else"now()+interval'1 day'"
   sql('update auth.sessions set not_after='+value+'where id='+lit(claims['session_id'])+'and user_id='+lit(own['user_id']))
  else:
   value='Changed catalog'if action=='source_edit'else'Catalog description';sql('update public.foods set notes='+lit(value)+'where id='+lit(cfg['sources']['food'])+"and name='Transport fixture restaurant'")
  status,body=200,{'fixture_action':action};event=action
 else:
  path=data['path'];method=data['method'];headers={k.lower():v for k,v in data['headers'].items()};token=headers.get('authorization','').removeprefix('Bearer ')
  allowed={u['session']['access_token']for u in cfg['sessions'].values()}|{cfg['fresh']['access_token']};assert token in allowed and headers.get('apikey')==cfg['anon_key']
  if path=='/auth/v1/user':assert method=='GET';status,body=request('/user',token=token,auth=True,method='GET');event='auth_get_user'
  else:
   m=re.fullmatch('/rest/v1/rpc/([a-z0-9_]+)',path);assert m and m[1]in names and method=='POST'and isinstance(data.get('body'),dict)
   status,body=request('/rpc/'+m[1],data['body'],token=token,method='POST');event=m[1]
 with(S/'sdk-bridge-events.log').open('a')as out:out.write(json.dumps({'method':event,'status':status})+'\n')
 print(json.dumps({'status':status,'body':body}))
except Exception:
 print(json.dumps({'status':503,'body':{'code':'fixture_bridge_refused','message':'Owned fixture request refused; no external request performed.'}}))
