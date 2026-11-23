"""Owned real Auth/PostgREST and separate PostgreSQL session cancellation proofs."""
from collection_library_support import *
import unittest,copy,concurrent.futures
CHECK='get_family_collection_preparation_outcome_v2';CANCEL='cancel_family_collection_preparation_v2'
class RequestCancellation(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.f=setup_users();cls.owner=cls.f['users']['owner'];cls.family=cls.f['family']
 def setUp(self):
  self.c=rpc('create_family_list',{'family_id':self.family,'name':'Cancellation qualification '+uuid.uuid4().hex},self.owner)
 def packet(self,action='create_manual',body=None):
  target={'item_id':body['item_id']}if body and'item_id'in body else{}
  ctx=author_context(self.c,self.owner,target);return {'scope':ctx['scope'],'operation_id':new(),'intent':{'action':action,'body':body or {'content':manual_content(),'notes':None,'status':'idea'}},'observation':ctx['observation']}
 def call(self,p,name=CANCEL,user=None):return rpc(name,{'preparation':p},user or self.owner)
 def reject(self,p,code='PT409',name=CANCEL,user=None):
  status,r=request('/rpc/'+name,{'p_preparation':p},user or self.owner);self.assertGreaterEqual(status,400);self.assertEqual(r['code'],code)
 def prepare(self,p):return rpc('prepare_family_collection_content_v1',{'collection_id':self.c,'operation_id':p['operation_id'],'action':p['intent']['action'],'body':p['intent']['body'],'observation':p['observation']},self.owner)
 def count(self):return int(sql('select count(*)from public.list_items where list_id='+lit(self.c)))
 def fresh(self,user=None):
  u=copy.deepcopy(user or self.owner);u['session']=okay('/token?grant_type=password',{'email':u['email'],'password':u['password']},auth=True);return u
 def hold(self,name,args,p,after=None):
  # Real independent PostgreSQL transaction holds the SAME actor/operation lock.
  q='select public.'+name+'('+','.join(lit(json.dumps(v))+'::jsonb' if isinstance(v,dict)else lit(v)+('::text'if v in ['create_manual','create_reference','create_snapshot']else'::uuid')for v in args)+');'+(after or '')+'select pg_sleep(2.5)'
  pool=concurrent.futures.ThreadPoolExecutor(1);job=pool.submit(sql,q,self.owner)
  deadline=time.monotonic()+15
  key="hashtextextended('collection-operation:'||"+lit(self.owner['id'])+"||':'||"+lit(p['operation_id'])+",0)"
  while time.monotonic()<deadline:
   # Advisory lock key is a signed64-bit hash; oid halves are unsigned32.
   found=sql("select exists(select 1 from pg_locks where locktype='advisory'and granted and classid=(("+key+" >>32)&4294967295)::oid and objid=("+key+"&4294967295)::oid)")
   if found=='t':return pool,job
   if job.done():job.result();self.fail('Winning transaction ended before lock observation')
   time.sleep(.04)
  self.fail('No operation lock observed')
 def test_never_sent_fresh_login_cancels_and_fences_delayed_prepare(self):
  p=self.packet();self.assertEqual(self.call(p,CHECK)['status'],'unknown');u=self.fresh();r=self.call(p,user=u)
  self.assertEqual((r['status'],r['resolution'],r['result']),('cancelled','unprepared',None));self.assertEqual(r,self.call(p,user=u));self.assertEqual(r,self.call(p,CHECK,u));self.assertEqual(self.count(),0)
  self.reject_prepare(p);self.assertEqual(rpc('get_family_collection_content_operation_v1',{'collection_id':self.c,'operation_id':p['operation_id']},self.owner)['status'],'unknown')
 def reject_prepare(self,p):
  status,r=request('/rpc/prepare_family_collection_content_v1',{'p_collection_id':self.c,'p_operation_id':p['operation_id'],'p_action':p['intent']['action'],'p_body':p['intent']['body'],'p_observation':p['observation']},self.owner);self.assertEqual((status,r['code']),(409,'PT409'))
 def test_cancel_transaction_wins_delayed_prepare(self):
  p=self.packet();pool,job=self.hold(CANCEL,[p],p)
  try:self.reject_prepare(p);job.result()
  finally:pool.shutdown()
  self.assertEqual(self.count(),0);self.assertEqual(self.call(p,CHECK)['resolution'],'unprepared')
 def test_prepare_transaction_wins_cancellation(self):
  p=self.packet();a=[self.c,p['operation_id'],p['intent']['action'],p['intent']['body'],p['observation']]
  pool,job=self.hold('prepare_family_collection_content_v1',a,p)
  try:r=self.call(p);job.result()
  finally:pool.shutdown()
  self.assertEqual((r['status'],r['resolution'],r['result']['status']),('cancelled','prepared','cancelled'));self.assertEqual(self.count(),0)
 def test_commit_transaction_wins_cancellation(self):
  p=self.packet();o=self.prepare(p)['original'];pool,job=self.hold('execute_family_collection_content_v1',[self.c,p['operation_id'],o],p)
  try:r=self.call(p,user=self.fresh());job.result()
  finally:pool.shutdown()
  self.assertEqual((r['status'],r['resolution']),('committed','prepared'));self.assertEqual(self.count(),1)
 def test_prepared_cancel_wins_late_execution(self):
  p=self.packet();o=self.prepare(p)['original'];pool,job=self.hold(CANCEL,[p],p)
  try:r=execute_content(self.c,p['operation_id'],o,self.owner);job.result()
  finally:pool.shutdown()
  self.assertEqual(r['status'],'cancelled');self.assertEqual(self.count(),0)
 def test_reused_uuid_changed_body_observation_scope_parent_conflicts(self):
  p=self.packet();self.call(p)
  for mutate in [lambda q:q['intent']['body'].update(notes='changed'),lambda q:q['observation'].update(content_revision=1),lambda q:q['scope'].update(session_id=new()),lambda q:q['scope'].update(person_id=None)]:
   q=copy.deepcopy(p);mutate(q);self.reject(q);self.reject(q,name=CHECK)
  c2=rpc('create_family_list',{'family_id':self.family,'name':'Other parent'},self.owner);q=copy.deepcopy(p);q['scope']['collection_id']=c2;self.reject(q)
 def test_prepared_request_exact_identity_required(self):
  p=self.packet();self.prepare(p);q=copy.deepcopy(p);q['intent']['body']['notes']='different';self.reject(q);self.assertEqual(self.call(p,CHECK)['status'],'prepared')
 def test_no_original_item_or_body_is_fabricated_or_retained(self):
  p=self.packet();p['intent']['body']['notes']='Private uncommitted note';self.call(p)
  self.assertEqual(sql('select count(*)from family_auth.collection_authoring_commands where operation_id='+lit(p['operation_id'])),'0')
  self.assertNotIn('Private uncommitted note',sql('select row_to_json(x)from family_auth.collection_request_cancellations x where operation_id='+lit(p['operation_id'])))
 def test_lifecycle_uuid_namespace_fenced_both_directions(self):
  p=self.packet();self.call(p);ctx=rpc('get_family_collection_context_v1',{'collection_id':self.c,'state':'active'},self.owner)
  args={'p_collection_id':self.c,'p_operation_id':p['operation_id'],'p_scope':ctx['scope'],'p_action':'trash','p_expected_revision':ctx['collection_revision']}
  status,r=request('/rpc/execute_family_collection_lifecycle_v1',args,self.owner);self.assertEqual(r['code'],'PT409')
  p2=self.packet();args['p_operation_id']=p2['operation_id'];okay('/rpc/execute_family_collection_lifecycle_v1',args,self.owner);self.reject(p2)
 def test_archived_deleted_root_can_cancel_without_restoring(self):
  for archived in [True,False]:
   self.c=rpc('create_family_list',{'family_id':self.family,'name':'Recovery parent'},self.owner);p=self.packet()
   if archived:rpc('archive_family_list',{'list_id':self.c},self.owner)
   else:
    ctx=rpc('get_family_collection_context_v1',{'collection_id':self.c,'state':'active'},self.owner)
    rpc('execute_family_collection_lifecycle_v1',{'collection_id':self.c,'operation_id':new(),'scope':ctx['scope'],'action':'trash','expected_revision':ctx['collection_revision']},self.owner)
   self.assertEqual(self.call(p)['status'],'cancelled')
 def test_current_session_revoked_and_expired_denied(self):
  p=self.packet()
  for expired in [False,True]:
   u=self.fresh();claims=json.loads(base64.urlsafe_b64decode(u['session']['access_token'].split('.')[1]+'=='));sid=claims['session_id']
   sql('update auth.sessions set not_after=clock_timestamp()-interval\'1 second\'where id='+lit(sid))if expired else sql('delete from auth.sessions where id='+lit(sid))
   self.reject(p,'42501',user=u)
 def test_other_account_private_root_and_no_mfa_denied(self):
  p=self.packet()
  for key in ['member','outsider']:self.reject(p,'42501',user=self.f['users'][key])
  reviewer=self.f['users']['reviewer'];u=self.fresh(reviewer);self.reject(p,'42501',user=u)
 def test_changed_person_family_or_user_scope_denied(self):
  p=self.packet()
  for k in ['user_id','person_id','family_id']:
   q=copy.deepcopy(p);q['scope'][k]=new();self.reject(q)
 def test_stale_source_and_observation_still_cancellable(self):
  p=self.packet('create_reference',{'source':{'kind':'food','id':new()},'notes':None,'status':'idea'});self.assertEqual(self.call(p)['status'],'cancelled')
  p=self.packet();sql('update public.lists set name=name||\' changed\'where id='+lit(self.c));self.assertEqual(self.call(p)['status'],'cancelled')
 def test_all_actions_structural_validation_and_nullable_override(self):
  for action,body in [('create_snapshot',{'source':{'kind':'place','id':new()},'notes':None,'status':'want'}),('materialize',{'item_id':new()}),('status',{'item_id':new(),'status':'visited'}),('edit',{'item_id':new(),'changes':{'name':None,'notes':None}}),('reorder',{'ordered_ids':[new(),new()]})]:
   p=self.packet();p['intent']={'action':action,'body':body};self.assertEqual(self.call(p)['status'],'cancelled')
 def test_malformed_requests_and_unknown_fields_rejected(self):
  p=self.packet()
  mutations=[lambda q:q.update(extra=True),lambda q:q['scope'].update(extra=True),lambda q:q['observation'].update(item_revision=1),lambda q:q['observation'].update(content_revision=9007199254740992),lambda q:q['intent']['body'].update(notes=42),lambda q:q['intent']['body']['content'].update(name=None),lambda q:q['intent'].update(action='unknown')]
  for fn in mutations:
   q=copy.deepcopy(p);fn(q);self.reject(q,'22023')
 def test_revocation_while_waiting_is_rechecked(self):
  p=self.packet();q="begin;select pg_advisory_xact_lock(hashtextextended('collection-operation:'||"+lit(self.owner['id'])+"||':'||"+lit(p['operation_id'])+",0));select pg_sleep(2.5);commit;"
  with concurrent.futures.ThreadPoolExecutor(2)as pool:
   holder=pool.submit(sql,q)
   def waiting(granted):
    key="hashtextextended('collection-operation:'||"+lit(self.owner['id'])+"||':'||"+lit(p['operation_id'])+",0)"
    for _ in range(80):
     if sql("select exists(select 1 from pg_locks where locktype='advisory'and granted="+('true'if granted else'false')+" and classid=(("+key+" >>32)&4294967295)::oid and objid=("+key+"&4294967295)::oid)")=='t':return
     time.sleep(.02)
    self.fail('Expected granted/waiting operation lock was not observed')
   waiting(True);waiter=pool.submit(request,'/rpc/'+CANCEL,{'p_preparation':p},self.owner);waiting(False)
   sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']))
   try:
    holder.result();status,result=waiter.result();self.assertEqual((status,result['code']),(403,'42501'))
   finally:sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']))
  self.assertEqual(self.call(p,CHECK)['status'],'unknown')
 def test_security_catalog_and_nullable_session_retention(self):
  self.assertEqual(sql("select relrowsecurity from pg_class where oid='family_auth.collection_request_cancellations'::regclass"),'t')
  self.assertEqual(sql("select count(*)from pg_policies where schemaname='family_auth'and tablename='collection_request_cancellations'"),'0')
  for name in ['get_family_collection_preparation_outcome_v2','cancel_family_collection_preparation_v2']:
   self.assertEqual(sql("select prosecdef from pg_proc where oid=('public."+name+"(jsonb)')::regprocedure"),'f')
   for role in ['anon','service_role']:self.assertEqual(sql("select has_function_privilege('"+role+"','public."+name+"(jsonb)','execute')"),'f')
  self.assertEqual(sql("select count(*)from pg_constraint where conrelid='family_auth.collection_request_cancellations'::regclass and confrelid='auth.sessions'::regclass"),'0')
  p=self.packet();self.call(p);sid=p['scope']['session_id'];sql('delete from auth.sessions where id='+lit(sid))
  try:self.assertEqual(self.call(p,CHECK,self.fresh())['status'],'cancelled')
  finally:
   # Subsequent tests must use an actual new authenticated session.
   self.__class__.owner=self.fresh()
 def test_private_table_immutable_and_roles_grants(self):
  p=self.packet();self.call(p)
  for role in ['anon','authenticated','service_role']:
   r=sql('select *from family_auth.collection_request_cancellations',role=role,fail=True);self.assertIn('42501',r.stderr)
  for q in ['update family_auth.collection_request_cancellations set action=action','delete from family_auth.collection_request_cancellations','truncate family_auth.collection_request_cancellations']:
   self.assertIn('0A000',sql(q,fail=True).stderr)
  self.assertEqual(sql("select count(*)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='family_auth'and p.proname like 'collection_authoring_%'"),'8')
if __name__=='__main__':
 r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(RequestCancellation));(S/'request-tests-summary.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'realAuthRest':True,'separateSessionRaces':4},indent=2));sys.exit(not r.wasSuccessful())
