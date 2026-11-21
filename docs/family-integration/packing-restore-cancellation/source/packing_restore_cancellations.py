import packing_restore_cancellation_test_scope
from packing_bags import BagFoundation,lit
import json,copy,uuid,concurrent.futures,time
class Cancellation(BagFoundation):
 def original(self,domain='item',user=None):
  if domain=='item':
   i=self.create(user=user);self.execute('trash',{},target=i['id'],user=user);args=self.args('restore',{},target=i['id'],user=user);names=['p_trip_id','p_operation_id','p_scope','p_action','p_target_id','p_expected_revision','p_expected_collection_revision','p_values'];rpc='execute_family_trip_packing_v1';protocol='packing-item-v1'
  elif domain=='bag':
   b=self.newbag();self.bt(b);args=self.ba('bag-restore',b,user=user);names=self.NAMES;rpc=self.RPC;protocol='packing-bag-v1'
  else:
   c=self.empty('Cancelled batch '+str(uuid.uuid4()));self.bound(self.bound_args(c));self.aggregate3(self.aggregate_args(c));args=self.aggregate_args(c,'category-restore-batch',user=user);names=self.ARG_NAMES;rpc=self.AGGREGATE_RPC;protocol='packing-category-aggregate-v3'
  return [self.trip,args[1],protocol,dict(zip(names,args))],rpc,args
 def cancel(self,a,user=None):return self.rpc('cancel_family_trip_packing_restore_v1',a,user)
 def proof(self,a,user=None):return self.rpc('get_family_trip_packing_restore_cancellation_v1',a,user)
 def snapshot(self):
  tables=['public.packing_items','public.packing_bags','public.packing_categories','public.packing_category_assignments','public.packing_bag_members','public.packing_item_contributors','public.packing_item_recipients','family_auth.trip_packing_state','family_auth.packing_category_batches','family_auth.packing_category_batch_items','family_auth.packing_command_receipts','family_auth.packing_command_cancellations','public.family_audit_events','public.people','public.trips']
  return {t:self.sql("with h as materialized(select encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex')v from "+t+" x)select md5(coalesce(string_agg(v,''order by v),''))from h")for t in tables}
 def cancel_statement(self,a):return "select public.cancel_family_trip_packing_restore_v1("+lit(a[0])+','+lit(a[1])+','+lit(a[2])+','+lit(json.dumps(a[3]))+'::jsonb)'
 def execute_statement(self,rpc,args):return 'select public.'+rpc+'('+','.join('null'if v is None else str(v)if type(v)is int else lit(json.dumps(v))+'::jsonb'if isinstance(v,(dict,list))else lit(v)for v in args)+')'
 def _flow(self,domain):
  a,rpc,args=self.original(domain);before=self.state();self.assertEqual(self.proof(a)['status'],'unknown');proof=self.cancel(a);self.assertEqual(proof['status'],'cancelled');self.assertEqual(self.proof(a),proof);snap=self.snapshot();self.assertEqual(self.cancel(a),proof);self.assertEqual(self.snapshot(),snap);self.assertEqual(self.state(),before)
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.rpc(rpc,args)
  self.assertEqual(self.snapshot(),snap)
  # Old receipt JSON keeps its unknown/committed-only protocol.
  old=self.breceipt(a[1])if domain=='bag'else self.aggregate_receipt3(a[1])if domain=='aggregate'else self.rpc('get_family_trip_packing_receipt_v1',[self.trip,a[1]])
  self.assertEqual(old['status'],'unknown');self.assertIsNone(old['result'])
 def test_i01_item(self):self._flow('item')
 def test_i02_bag(self):self._flow('bag')
 def test_i03_aggregate(self):self._flow('aggregate')
 def _committed(self,domain):
  a,rpc,args=self.original(domain);out=self.rpc(rpc,args);before=self.snapshot();p=self.cancel(a);self.assertEqual(p['status'],'committed');self.assertEqual(p['result'],out);self.assertIsNone(p['cancelled_at']);self.assertEqual(self.snapshot(),before);self.assertEqual(self.proof(a),p)
 def test_i04_item_committed(self):self._committed('item')
 def test_i05_bag_committed(self):self._committed('bag')
 def test_i06_batch_committed(self):self._committed('aggregate')
 def test_i07_changed_original_reuses_no_terminal(self):
  a,_,_=self.original();self.cancel(a);before=self.snapshot()
  for key,value in [('p_target_id',str(uuid.uuid4())),('p_expected_revision',999)]:
   b=copy.deepcopy(a);b[3][key]=value
   for method in [self.cancel,self.proof]:
    with self.assertRaisesRegex(RuntimeError,'PT409'):method(b)
  self.assertEqual(self.snapshot(),before)
 def test_i08_extra_keys_values_and_protocol(self):
  a,_,_=self.original();before=self.snapshot()
  for key,value in [('extra',1),('p_values',{'name':'wrong'}),('p_action','create'),('p_expected_collection_revision',1),('p_expected_revision',True),('p_scope',{})]:
   b=copy.deepcopy(a);b[3][key]=value
   with self.assertRaisesRegex(RuntimeError,'22023'):self.cancel(b)
  b=copy.deepcopy(a);b[2]='unknown'
  with self.assertRaisesRegex(RuntimeError,'22023'):self.cancel(b)
  self.assertEqual(self.snapshot(),before)
 def test_i09_scope_contexts(self):
  a,_,_=self.original();before=self.snapshot()
  for key,value in [('user_id',self.editor),('person_id',self.editor_person),('family_id',str(uuid.uuid4())),('trip_lifecycle_revision',999)]:
   b=copy.deepcopy(a);b[3]['p_scope'][key]=value
   with self.assertRaisesRegex(RuntimeError,'PT409'):self.cancel(b)
  self.assertEqual(self.snapshot(),before)
 def test_i10_other_actor_and_roles(self):
  a,_,_=self.original();self.cancel(a);before=self.snapshot()
  for user in [self.editor,self.viewer,self.stranger]:
   with self.assertRaisesRegex(RuntimeError,'42501|PT409'):self.proof(a,user)
  self.assertEqual(self.snapshot(),before)
 def test_i11_assurance_and_grants(self):
  a,_,_=self.original();stmt=self.cancel_statement(a)
  for role,aal in [('authenticated','aal1'),('anon','aal2'),('service_role','aal2')]:
   with self.assertRaisesRegex(RuntimeError,'42501'):self.sql(stmt,self.owner,role,aal)
  for table in ['packing_command_cancellations','packing_command_receipts']:
   with self.assertRaisesRegex(RuntimeError,'42501'):self.sql('select * from family_auth.'+table,self.owner)
 def test_i12_privileges_and_immutability(self):
  a,_,_=self.original();self.cancel(a);before=self.snapshot()
  for stmt in ['delete from family_auth.packing_command_cancellations where operation_id='+lit(a[1]),'update family_auth.packing_command_cancellations set cancelled_at=now()where operation_id='+lit(a[1])]:
   with self.assertRaisesRegex(RuntimeError,'immutable|append|23514|42501|55000'):self.sql(stmt)
  self.assertEqual(self.snapshot(),before)
 def test_i13_history_identity(self):
  a,_,_=self.original();self.cancel(a);before=self.snapshot()
  for stmt in ['update public.people set user_id=null where id='+lit(self.person),'delete from public.people where id='+lit(self.person),'delete from auth.users where id='+lit(self.owner)]:
   with self.assertRaisesRegex(RuntimeError,'23514|23503|0A000'):self.sql(stmt)
  self.assertEqual(self.snapshot(),before)
 def test_i14_cross_domain_create_rolls_back(self):
  a,_,_=self.original();self.cancel(a);before=self.snapshot();other=self.args('create',{'name':'Must roll back'},operation=a[1])
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.rpc('execute_family_trip_packing_v1',other)
  self.assertEqual(self.snapshot(),before)
 def test_i15_noop_bag_still_cannot_commit(self):
  a,_,_=self.original();self.cancel(a);bag=self.newbag(name='Same');other=self.ba('bag-update',bag,{'name':'Same'});other[1]=a[1];before=self.snapshot()
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.bc(other)
  self.assertEqual(self.snapshot(),before)
 def _race(self,domain,first_cancel):
  a,rpc,args=self.original(domain);first=self.cancel_statement(a)if first_cancel else self.execute_statement(rpc,args)
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(first)as pid:
    f=pool.submit(self.rpc,rpc,args)if first_cancel else pool.submit(self.cancel,a);self.wait_for_lock(a[1],pid)
   if first_cancel:
    with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=20)
   else:self.assertEqual(f.result(timeout=20)['status'],'committed')
  self.assertEqual(self.proof(a)['status'],'cancelled'if first_cancel else'committed')
 def test_i16_item_cancel_first(self):self._race('item',True)
 def test_i17_item_execute_first(self):self._race('item',False)
 def test_i18_bag_cancel_first(self):self._race('bag',True)
 def test_i19_bag_execute_first(self):self._race('bag',False)
 def test_i20_batch_cancel_first(self):self._race('aggregate',True)
 def test_i21_batch_execute_first(self):self._race('aggregate',False)
 def test_i22_permission_wait_recheck(self):
  self.policy('trip.packing.manage','trip_travelers');a,_,_=self.original(user=self.editor)
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(self.trip)+"::text,0))")as pid:
    f=pool.submit(self.cancel,a,self.editor);self.wait_for_lock(a[1],pid);self.policy('trip.packing.manage')
   with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=20)
 def test_i23_http_auth_mfa(self):
  a,_,_=self.original();payload=dict(zip(['p_trip_id','p_operation_id','p_protocol','p_original_args'],a));code,body=self.http('POST','/rest/v1/rpc/cancel_family_trip_packing_restore_v1',payload);self.assertEqual(code,200,body[:200]);self.assertEqual(json.loads(body)['status'],'cancelled');code,body=self.http('POST','/rest/v1/rpc/get_family_trip_packing_restore_cancellation_v1',payload);self.assertEqual(code,200,body[:200]);self.assertEqual(json.loads(body)['status'],'cancelled')
 def test_i24_bound_and_safe_counters(self):
  a,_,_=self.original();before=self.snapshot()
  for key,value in [('p_expected_revision',9007199254740992),('p_expected_revision',1.5),('p_expected_revision',0)]:
   b=copy.deepcopy(a);b[3][key]=value
   with self.assertRaisesRegex(RuntimeError,'22023'):self.cancel(b)
  b=copy.deepcopy(a);b[3]['extra']='x'*131072
  with self.assertRaisesRegex(RuntimeError,'54000'):self.cancel(b)
  self.assertEqual(self.snapshot(),before)
 def test_i25_lost_http_reply_retry_is_exact(self):
  a,_,_=self.original('bag');payload=dict(zip(['p_trip_id','p_operation_id','p_protocol','p_original_args'],a))
  code,lost=self.http('POST','/rest/v1/rpc/cancel_family_trip_packing_restore_v1',payload);self.assertEqual(code,200)
  before=self.snapshot();code,retry=self.http('POST','/rest/v1/rpc/cancel_family_trip_packing_restore_v1',payload)
  self.assertEqual(code,200);self.assertEqual(json.loads(retry),json.loads(lost));self.assertEqual(self.snapshot(),before)
 def test_i26_committed_proof_redacts_private_result(self):
  a,rpc,args=self.original();self.rpc(rpc,args)
  self.sql('update public.packing_items set is_private=true,owner_person_id='+lit(self.editor_person)+'where id='+lit(args[4]))
  before=self.snapshot();p=self.cancel(a);self.assertEqual(p['status'],'committed');self.assertTrue(p['result_redacted']);self.assertIsNone(p['result']);self.assertEqual(self.snapshot(),before)
 def test_i27_cancel_original_after_root_recovery(self):
  a,rpc,args=self.original('aggregate');rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)));self.rpc('trash_family_trip',[self.trip,rev])
  with self.assertRaisesRegex(RuntimeError,'42501|40001'):self.cancel(a)
  rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)));self.rpc('restore_family_trip',[self.trip,rev]);before=self.state();p=self.cancel(a)
  self.assertEqual(p['status'],'cancelled');self.assertGreater(p['scope']['trip_lifecycle_revision'],a[3]['p_scope']['trip_lifecycle_revision']);self.assertEqual(self.state(),before)
  with self.assertRaisesRegex(RuntimeError,'PT409|42501'):self.rpc(rpc,args)
 def test_i28_root_trash_wait_rechecks(self):
  a,_,_=self.original();rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)))
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command('select public.trash_family_trip('+lit(self.trip)+','+str(rev)+')')as pid:
    f=pool.submit(self.cancel,a);self.wait_for_lock(a[1],pid)
   with self.assertRaisesRegex(RuntimeError,'42501|40001'):f.result(timeout=20)
  self.assertEqual(self.sql('select count(*)from family_auth.packing_command_cancellations where trip_id='+lit(self.trip)),'0')
 def test_i29_membership_revoked_while_waiting(self):
  a,_,_=self.original()
  try:
   with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
    with self.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(self.trip)+"::text,0))")as pid:
     f=pool.submit(self.cancel,a);self.wait_for_lock(a[1],pid);self.sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
    with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=20)
  finally:self.sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
  self.assertEqual(self.proof(a)['status'],'unknown')
 def test_i30_real_http_session_expiry_wait(self):
  import base64
  a,_,_=self.original();payload=dict(zip(['p_trip_id','p_operation_id','p_protocol','p_original_args'],a));session=json.loads(base64.urlsafe_b64decode(self.token.split('.')[1]+'=='))['session_id']
  try:
   with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
    with self.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(self.trip)+"::text,0))")as pid:
     f=pool.submit(self.http,'POST','/rest/v1/rpc/cancel_family_trip_packing_restore_v1',payload);deadline=time.monotonic()+10;waiting=False
     while time.monotonic()<deadline:
      waiting=self.sql("select exists(select 1 from pg_stat_activity where position('cancel_family_trip_packing_restore_v1'in query)>0 and "+str(pid)+'=any(pg_blocking_pids(pid)))')=='t'
      if waiting:break
      time.sleep(.05)
     self.assertTrue(waiting);self.sql('update auth.sessions set not_after=clock_timestamp()-interval \'1 second\'where id='+lit(session))
    code,body=f.result(timeout=20);self.assertEqual(code,403,body[:200])
  finally:self.sql('update auth.sessions set not_after=null where id='+lit(session))
  self.assertEqual(self.proof(a)['status'],'unknown')
 def test_i31_all_other_domains_rollback_reserved_uuid(self):
  a,_,_=self.original();self.cancel(a);self.create(category='Gear');category=self.empty('Bound')
  calls=[('execute_family_trip_packing_group_v1',self.group_args()),('execute_family_trip_packing_category_v1',self.meta_for(category)),('execute_family_trip_packing_category_lifecycle_v2',self.lifecycle_args()),('execute_family_trip_packing_category_item_v2',self.bound_args(category))]
  for rpc,args in calls:
   args[1]=a[1];before=self.snapshot()
   with self.assertRaisesRegex(RuntimeError,'PT409'):self.sql(self.execute_statement(rpc,args),self.owner)
   self.assertEqual(self.snapshot(),before,rpc)
 def test_i37_two_terminal_relations_cannot_coexist(self):
  a,rpc,args=self.original();self.rpc(rpc,args);before=self.snapshot()
  with self.assertRaisesRegex(RuntimeError,'PT409'):
   self.sql("insert into family_auth.packing_command_cancellations(trip_id,actor_user_id,actor_person_id,operation_id,protocol,action,target_id,original_trip_lifecycle_revision,request_sha256)select trip_id,actor_user_id,actor_person_id,operation_id,'packing-item-v1',action,target_id,0,request_sha256 from family_auth.packing_command_receipts where operation_id="+lit(a[1]))
  self.assertEqual(self.snapshot(),before)
 def test_i38_historical_identity_and_missing_arguments(self):
  a,_,_=self.original();self.cancel(a);before=self.snapshot()
  with self.assertRaisesRegex(RuntimeError,'23514|23503|42501'):self.sql('update public.trips set family_id=gen_random_uuid()where id='+lit(self.trip))
  for k in a[3]:
   b=copy.deepcopy(a);del b[3][k]
   with self.assertRaisesRegex(RuntimeError,'22023'):self.cancel(b)
  self.assertEqual(self.snapshot(),before)
 def test_i32_history_limit_retry_and_independent_actor(self):
  self.policy('trip.packing.manage','trip_travelers');a,_,_=self.original();p=self.cancel(a)
  self.sql("insert into family_auth.packing_command_cancellations(trip_id,actor_user_id,actor_person_id,operation_id,protocol,action,target_id,original_trip_lifecycle_revision,request_sha256)select trip_id,actor_user_id,actor_person_id,gen_random_uuid(),protocol,action,target_id,original_trip_lifecycle_revision,request_sha256 from family_auth.packing_command_cancellations cross join generate_series(1,9999)where operation_id="+lit(a[1]))
  self.assertEqual(self.cancel(a),p);self.assertEqual(self.proof(a),p);b=copy.deepcopy(a);b[1]=str(uuid.uuid4());b[3]['p_operation_id']=b[1]
  with self.assertRaisesRegex(RuntimeError,'54000'):self.cancel(b)
  self.assertEqual(self.proof(b)['status'],'unknown');other,_,_=self.original(user=self.editor);self.assertEqual(self.cancel(other,self.editor)['status'],'cancelled')
 def test_i33_integer_json_canonicalization(self):
  a,rpc,args=self.original();b=copy.deepcopy(a);b[3]['p_expected_revision']=float(b[3]['p_expected_revision']);p=self.cancel(b);self.assertEqual(self.proof(a),p)
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.rpc(rpc,args)
  a,_,_=self.original();a[3]['p_scope']['trip_lifecycle_revision']=0.0;self.assertEqual(self.cancel(a)['status'],'cancelled')
 def test_i34_unforgeable_digest_exact_shape(self):
  a,_,_=self.original();before=self.snapshot();b=copy.deepcopy(a);b[3]['request_sha256']='00'*32
  with self.assertRaisesRegex(RuntimeError,'22023'):self.cancel(b)
  p=self.proof(a);self.assertEqual(set(p),{'version','kind','trip_id','operation_id','protocol','action','target_id','scope','request_sha256','status','cancelled_at','result_redacted','result'});self.assertEqual(len(p['request_sha256']),64);self.assertEqual(self.snapshot(),before)
 def test_i35_cancellation_audit_cannot_skip(self):
  a,_,_=self.original();self.sql("select set_config('family_auth.skip_row_audit','1',true);"+self.cancel_statement(a),self.owner)
  self.assertEqual(self.sql("select count(*)from public.family_audit_events where trip_id="+lit(self.trip)+"and resource_type='packing_command_cancellations'and resource_id="+lit(a[1])),'1')
  event=json.loads(self.sql('select context from public.family_audit_events where resource_id='+lit(a[1])+"and resource_type='packing_command_cancellations'"));self.assertEqual(set(event),{'protocol','action','request_sha256'});self.assertNotIn(a[3]['p_target_id'],json.dumps(event))
 def test_i36_bag_batch_original_completeness(self):
  for domain in ['bag','aggregate']:
   a,_,_=self.original(domain);before=self.snapshot()
   for key,value in [('p_observed',{}),('p_values',{'request_sha256':'forged'}),('p_expected_collection_revision',True)]:
    b=copy.deepcopy(a);b[3][key]=value
    with self.assertRaisesRegex(RuntimeError,'22023'):self.cancel(b)
   self.assertEqual(self.snapshot(),before)
