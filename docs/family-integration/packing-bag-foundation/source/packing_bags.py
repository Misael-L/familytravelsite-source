"""U04-D2a real local bag database/HTTP contract tests; never hosted."""
import copy,json,uuid,concurrent.futures,http.client,time
from packing_category_aggregate import CategoryAggregate,lit
class BagFoundation(CategoryAggregate):
 RPC='execute_family_trip_packing_bag_v1'
 NAMES=['p_trip_id','p_operation_id','p_scope','p_action','p_target_id','p_expected_revision','p_expected_collection_revision','p_observed','p_values']
 def bags(self,user=None):return self.rpc('get_family_trip_packing_bags_v1',[self.trip],user)
 def obs(self,bag,deleted=False,user=None):return json.loads(self.sql('select public.get_family_trip_packing_bag_v1('+lit(self.trip)+','+lit(bag)+','+('true'if deleted else'false')+')',user or self.owner))
 def ba(self,action='bag-create',bag=None,values=None,user=None):
  view=self.bags(user);o=None if action=='bag-create'else self.obs(bag,action=='bag-restore',user)
  return [self.trip,str(uuid.uuid4()),view['scope'],action,bag or str(uuid.uuid4()),o['bag']['revision']if o else None,view['collection_revision'],o,{'name':'Bag'}if values is None and action=='bag-create'else values or{}]
 def bc(self,args,user=None):return self.rpc(self.RPC,args,user)
 def newbag(self,**values):return self.bc(self.ba(values={'name':'Bag',**values}))['bag']['id']
 def members(self,bag,people,user=None):return self.bc(self.ba('bag-members',bag,{'person_ids':sorted(people)},user),user)
 def bt(self,bag):return self.bc(self.ba('bag-trash-empty',bag))
 def br(self,bag):return self.bc(self.ba('bag-restore',bag))
 def bp(self,limit=50,cursor=None):return self.rpc('list_family_trip_packing_bag_trash_v1',[self.trip,limit,cursor['deleted_at']if cursor else None,cursor['id']if cursor else None])
 def breceipt(self,op,user=None):return self.rpc('get_family_trip_packing_bag_receipt_v1',[self.trip,op],user)
 def brefuse(self,args,pattern='PT409',user=None):
  before=self.aggregate_graph()
  with self.assertRaisesRegex(RuntimeError,pattern):self.bc(args,user)
  self.assertEqual(self.aggregate_graph(),before)
 def bs(self,args):return 'select public.'+self.RPC+'('+','.join('null'if v is None else str(v)if type(v)is int else lit(json.dumps(v))+'::jsonb'if isinstance(v,(dict,list))else lit(v)for v in args)+')'
 def test_h01_pure_coupled_read_and_strict_old_keys(self):
  bag=self.newbag();before=self.aggregate_graph();v=self.bags();old=self.state();self.assertEqual(v['packing'],old);self.assertEqual(v['scope'],old['scope']);self.assertEqual(v['collection_revision'],old['collection_revision']);self.assertEqual(self.aggregate_graph(),before)
  self.assertEqual(set(old['bags'][0]),set(['id','trip_id','name','color','sort_order','weight_limit_grams','created_at','updated_at','member_person_ids','total_weight_grams']));self.assertEqual(v['bags'][0],self.obs(bag))
 def test_h02_deliberate_duplicate_names_have_distinct_ids(self):
  a=self.newbag(name='Café 🎒');b=self.newbag(name='Café 🎒');self.assertNotEqual(a,b);self.assertEqual([x['bag']['sort_order']for x in self.bags()['bags']],[0,1])
 def test_h03_metadata_omission_and_explicit_null(self):
  b=self.newbag(color='#F0a123',weight_limit_grams=5000);r=self.bc(self.ba('bag-update',b,{'name':'New'}));self.assertEqual(r['bag']['color'],'#F0a123');self.assertEqual(r['bag']['weight_limit_grams'],5000)
  r=self.bc(self.ba('bag-update',b,{'color':None,'weight_limit_grams':None}));self.assertIsNone(r['bag']['color']);self.assertIsNone(r['bag']['weight_limit_grams'])
 def test_h04_true_noop_has_only_immutable_receipt(self):
  b=self.newbag();a=self.ba('bag-update',b,{'name':'Bag'});before=self.obs(b);events=self.sql('select count(*)from public.family_audit_events where trip_id='+lit(self.trip));r=self.bc(a);self.assertFalse(r['changed']);self.assertEqual(self.obs(b),before);self.assertEqual(events,self.sql('select count(*)from public.family_audit_events where trip_id='+lit(self.trip)));self.assertEqual(self.breceipt(a[1])['result'],r)
  a=self.ba('bag-members',b,{'person_ids':[]});before=self.obs(b);self.assertFalse(self.bc(a)['changed']);self.assertEqual(self.obs(b),before)
 def test_h05_exact_retry_after_later_edit_preserves_original(self):
  b=self.newbag();a=self.ba('bag-update',b,{'name':'First'});r=self.bc(a);self.bc(self.ba('bag-update',b,{'name':'Later'}));before=self.aggregate_graph();self.assertEqual(self.bc(a),r);self.assertEqual(self.aggregate_graph(),before);self.assertEqual(self.breceipt(a[1])['result'],r)
 def test_h06_changed_intent_never_reuses_receipt_uuid(self):
  a=self.ba();self.bc(a)
  for i,val in [(4,str(uuid.uuid4())),(8,{'name':'Other'}),(6,999),(3,'bag-update')]:
   b=copy.deepcopy(a);b[i]=val;self.brefuse(b,'PT409|22023')
 def test_h07_invalid_content_is_atomic(self):
  for values in [{'name':''},{'name':' padded '},{'name':'x'*501},{'name':None},{'name':'x','color':'red'},{'name':'x','color':True},{'name':'x','weight_limit_grams':0},{'name':'x','weight_limit_grams':10000001},{'name':'x','weight_limit_grams':1.5},{'name':'x','weight_limit_grams':True},{'name':'x','sort_order':1},{'name':'x','owner_person_id':self.person}]:self.brefuse(self.ba(values=values),'22023')
  b=self.newbag()
  for values in [{},{'name':None},{'revision':2},{'member_person_ids':[]},{'name':'x','is_private':True}]:self.brefuse(self.ba('bag-update',b,values),'22023')
 def test_h08_stale_collection_bag_and_full_observation(self):
  b=self.newbag();a=self.ba('bag-update',b,{'name':'Never'});self.create();self.brefuse(a);a=self.ba('bag-update',b,{'name':'Never'});self.bc(self.ba('bag-update',b,{'name':'Now'}));a[6]=self.bags()['collection_revision'];a[7]['collection_revision']=a[6];self.brefuse(a)
  for key,value in [('name','torn'),('revision',999),('created_at','2027-01-01T00:00:00Z')]:
   a=self.ba('bag-update',b,{'name':'Never'});a[7]['bag'][key]=value;self.brefuse(a)
 def test_h09_exact_scope_fields_required(self):
  for k,val in [('trip_id',str(uuid.uuid4())),('person_id',self.editor_person),('family_id',str(uuid.uuid4())),('user_id',self.editor),('layer','myDraft'),('extra',1),('trip_lifecycle_revision',99)]:
   a=self.ba();a[2][k]=val;self.brefuse(a)
 def test_h10_cross_trip_identity_and_observation_refused(self):
  b=self.newbag();trip=self.trip;self.trip=self.new_trip('Foreign');other=self.bag();self.trip=trip;a=self.ba('bag-update',b,{'name':'No'});a[4]=other;self.brefuse(a,'42501');self.brefuse(self.ba(bag=b),'PT409')
 def test_h11_direct_lifecycle_identity_and_revision_are_guarded(self):
  b=self.newbag()
  for patch,pattern in [('id='+lit(str(uuid.uuid4())),'23514'),('trip_id='+lit(self.new_trip()),'23514'),('revision=99','23514'),('name=\' invalid \'','22023'),('sort_order=-1','23514')]:
   before=self.aggregate_graph()
   with self.assertRaisesRegex(RuntimeError,pattern):self.sql('update public.packing_bags set '+patch+' where id='+lit(b))
   self.assertEqual(self.aggregate_graph(),before)
  with self.assertRaisesRegex(RuntimeError,'0A000'):self.sql('delete from public.packing_bags where id='+lit(b))
 def test_h12_differential_carriers_advance_revision_not_item_acl(self):
  b=self.newbag();i=self.create(bag_id=b,visibility='personal');before=self.row(i['id']);first=self.members(b,[self.person,self.editor_person]);self.assertGreater(first['bag']['revision'],1);self.assertEqual(self.row(i['id']),before)
  after=self.members(b,[self.editor_person,self.viewer_person]);self.assertEqual(after['member_person_ids'],sorted([self.editor_person,self.viewer_person]));self.assertEqual(self.row(i['id']),before)
 def test_h13_bad_carrier_set_is_all_or_nothing(self):
  b=self.newbag();self.members(b,[self.person])
  for people in [[self.person,self.person],[str(uuid.uuid4())],[self.viewer_person,self.person] if self.viewer_person>self.person else[self.person,self.viewer_person],['invalid']]:
   # Unsorted is built deliberately rather than relying on fixture UUID ordering.
   if len(people)==2 and people[0]!=people[1]:people=sorted(people,reverse=True)
   self.brefuse(self.ba('bag-members',b,{'person_ids':people}),'22023')
  self.sql('delete from public.trip_travelers where trip_id='+lit(self.trip)+'and person_id='+lit(self.viewer_person));self.brefuse(self.ba('bag-members',b,{'person_ids':sorted([self.editor_person,self.viewer_person])}),'22023');self.assertEqual(self.obs(b)['member_person_ids'],[self.person])
 def test_h14_archived_carrier_can_be_retained_removed_not_readded(self):
  b=self.newbag();self.members(b,[self.viewer_person]);self.sql('update public.people set archived_at=now()where id='+lit(self.viewer_person))
  try:
   r=self.members(b,[self.person,self.viewer_person]);self.assertIn(self.viewer_person,r['member_person_ids']);self.members(b,[self.person]);self.brefuse(self.ba('bag-members',b,{'person_ids':sorted([self.person,self.viewer_person])}),'22023');self.assertFalse(next(p for p in self.bags()['people']if p['id']==self.viewer_person)['eligible'])
  finally:self.sql('update public.people set archived_at=null where id='+lit(self.viewer_person))
 def test_h15_guest_carrier_is_not_an_auth_identity(self):
  b=self.newbag();p=self.guest();self.sql('insert into public.trip_travelers(trip_id,person_id)values('+lit(self.trip)+','+lit(p)+')');r=self.members(b,[p]);self.assertEqual(r['member_person_ids'],[p]);self.assertEqual(self.sql('select user_id is null from public.people where id='+lit(p)),'t')
 def test_h16_hidden_items_deny_trash_without_revealing_details(self):
  self.policy('trip.packing.manage','trip_travelers');b=self.newbag();i=self.create(bag_id=b,visibility='personal',name='Hidden secret',weight_grams=17,quantity=2);self.members(b,[self.editor_person]);view=self.bags(self.editor);self.assertEqual(view['packing']['items'],[]);self.assertEqual(view['packing']['bags'][0]['total_weight_grams'],34);self.assertNotIn('Hidden secret',json.dumps(view));self.brefuse(self.ba('bag-trash-empty',b,user=self.editor),'PT409',self.editor)
 def test_h17_independent_item_trash_preserved_through_bag_trash(self):
  b=self.newbag();self.members(b,[self.person]);i=self.create(bag_id=b);self.execute('trash',target=i['id']);before=self.row(i['id']);r=self.bt(b);self.assertIsNotNone(r['bag']['deleted_at']);self.assertEqual(self.row(i['id']),before);self.assertEqual(self.state()['bags'],[]);self.assertEqual(self.bp()['bags'][0]['bag'],r['bag']);self.br(b);self.assertEqual(self.row(i['id']),before)
 def test_h18_item_restore_requires_explicit_parent_restore(self):
  b=self.newbag();i=self.create(bag_id=b);self.execute('trash',target=i['id']);self.bt(b);before=self.aggregate_graph()
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.execute('restore',target=i['id'])
  self.assertEqual(self.aggregate_graph(),before);self.br(b);self.execute('restore',target=i['id']);self.assertIsNone(self.row(i['id'])['deleted_at'])
 def test_h19_every_create_update_raw_path_refuses_inactive_bag(self):
  b=self.newbag();self.bt(b);i=self.create();c=self.empty()
  for fn in [lambda:self.create(bag_id=b),lambda:self.execute('update',{'bag_id':b},target=i['id']),lambda:self.bound(self.bound_args(c,values={'name':'No','bag_id':b})),lambda:self.sql('insert into public.packing_items(trip_id,name,bag_id)values('+lit(self.trip)+",'No',"+lit(b)+')'),lambda:self.sql('update public.packing_items set bag_id='+lit(b)+'where id='+lit(i['id']))]:
   before=self.aggregate_graph()
   with self.assertRaisesRegex(RuntimeError,'PT409'):fn()
   self.assertEqual(self.aggregate_graph(),before)
 def test_h20_category_batch_restore_waits_for_bag_restore(self):
  b=self.newbag();i=self.create(category='Batch',bag_id=b);c=self.category2(self.category(i['id']));self.aggregate3(self.aggregate_args(c));self.bt(b);a=self.aggregate_args(c,'category-restore-batch');self.aggregate_no_effect(a,'PT409');self.br(b);self.aggregate3(self.aggregate_args(c,'category-restore-batch'));self.assertIsNone(self.row(i['id'])['deleted_at'])
 def test_h21_trash_retains_carriers_and_blocks_raw_edits(self):
  b=self.newbag();self.members(b,[self.person]);self.bt(b)
  for statement in ['update public.packing_bags set name=\'Wrong\'where id='+lit(b),'delete from public.packing_bag_members where bag_id='+lit(b),'insert into public.packing_bag_members(trip_id,bag_id,person_id)values('+','.join(map(lit,[self.trip,b,self.editor_person]))+')']:
   with self.assertRaisesRegex(RuntimeError,'PT409'):self.sql(statement)
  self.assertEqual(self.obs(b,True)['member_person_ids'],[self.person])
 def test_h22_other_direct_actor_can_restore_without_reviving_items(self):
  self.policy('trip.packing.manage','trip_travelers');b=self.newbag();self.bt(b);r=self.bc(self.ba('bag-restore',b,user=self.editor),self.editor);self.assertIsNone(r['bag']['deleted_at']);self.assertEqual(self.state()['items'],[])
 def test_h23_trip_recovery_preserves_independent_bag_trash(self):
  b=self.newbag();self.bt(b);before=self.obs(b,True)['bag'];rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)));self.rpc('trash_family_trip',[self.trip,rev]);self.rpc('restore_family_trip',[self.trip,int(self.sql('select revision from public.trips where id='+lit(self.trip)))]);self.assertEqual(self.obs(b,True)['bag'],before);self.assertEqual(self.state()['bags'],[])
 def test_h24_trash_pagination_exact_microsecond_ties(self):
  ids=[self.newbag()for _ in range(3)]
  for b in ids:self.bt(b)
  rows=self.bp(2);self.assertEqual(len(rows['bags']),2);more=self.bp(2,rows['next_cursor']);self.assertEqual(len(more['bags']),1);self.assertEqual({r['bag']['id']for r in rows['bags']+more['bags']},set(ids));self.assertIsNone(more['next_cursor'])
  for args in [[self.trip,0],[self.trip,101],[self.trip,2,'infinity',str(uuid.uuid4())],[self.trip,2,None,str(uuid.uuid4())]]:
   with self.assertRaisesRegex(RuntimeError,'22023'):self.rpc('list_family_trip_packing_bag_trash_v1',args)
 def test_h25_low_assurance_outsider_and_revoked_grants(self):
  b=self.newbag()
  with self.assertRaisesRegex(RuntimeError,'42501'):self.sql('select public.get_family_trip_packing_bags_v1('+lit(self.trip)+')',self.owner,aal='aal1')
  with self.assertRaisesRegex(RuntimeError,'42501'):self.bags(self.stranger)
  for role in ['authenticated','service_role','anon']:
   for table in ['packing_bags','packing_bag_members']:
    for perm in ['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']:self.assertEqual(self.sql('select has_table_privilege('+lit(role)+','+lit('public.'+table)+','+lit(perm)+')'),'f')
 def test_h26_propose_and_unrelated_permission_cannot_write(self):
  self.policy('trip.packing.manage','patriarch','trip_travelers');self.brefuse(self.ba(user=self.editor),'42501',self.editor);self.policy('trip.todos.manage','trip_travelers');self.policy('trip.packing.manage');self.brefuse(self.ba(user=self.editor),'42501',self.editor)
 def test_h27_membership_revocation_precedes_retry(self):
  self.policy('trip.packing.manage','trip_travelers');a=self.ba(user=self.editor);self.bc(a,self.editor);self.sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.editor))
  try:self.brefuse(a,'42501',self.editor)
  finally:self.sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.editor))
 def test_h28_typed_receipt_unknown_and_wrong_domains(self):
  self.assertEqual(self.breceipt(str(uuid.uuid4()))['status'],'unknown');a=self.ba();r=self.bc(a);self.assertEqual(self.breceipt(a[1])['result'],r)
  for name in ['get_family_trip_packing_receipt_v1','get_family_trip_packing_group_receipt_v1','get_family_trip_packing_category_receipt_v1','get_family_trip_packing_category_lifecycle_receipt_v2','get_family_trip_packing_category_item_receipt_v2','get_family_trip_packing_category_aggregate_receipt_v3']:
   if self.sql("select exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname="+lit(name)+')')=='t':
    with self.assertRaisesRegex(RuntimeError,'22023'):self.rpc(name,[self.trip,a[1]])
 def test_h29_cross_domain_uuid_is_rejected_both_directions(self):
  a=self.ba();self.bc(a);item=self.args('create',{'name':'Other'},operation=a[1]);before=self.aggregate_graph()
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.rpc('execute_family_trip_packing_v1',item)
  self.assertEqual(before,self.aggregate_graph());item=self.args('create',{'name':'Real'});self.rpc('execute_family_trip_packing_v1',item);a=self.ba();a[1]=item[1];self.brefuse(a)
  with self.assertRaisesRegex(RuntimeError,'22023'):self.breceipt(item[1])
 def test_h30_receipt_redacted_after_root_lifecycle_changes(self):
  a=self.ba();self.bc(a);rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)));self.rpc('trash_family_trip',[self.trip,rev]);self.rpc('restore_family_trip',[self.trip,int(self.sql('select revision from public.trips where id='+lit(self.trip)))]);r=self.breceipt(a[1]);self.assertEqual(r['status'],'committed');self.assertTrue(r['result_redacted']);self.assertIsNone(r['result']);self.brefuse(a)
 def test_h31_actual_http_commit_with_discarded_reply_body(self):
  a=self.ba();host=self.api.removeprefix('http://');c=http.client.HTTPConnection(host,timeout=20);c.request('POST','/rest/v1/rpc/'+self.RPC,body=json.dumps(dict(zip(self.NAMES,a))),headers={'apikey':self.anon,'Authorization':'Bearer '+self.token,'Content-Type':'application/json'});resp=c.getresponse();self.assertEqual(resp.status,200);c.close() # deliberately lose the JSON acknowledgement
  recovered=self.breceipt(a[1]);self.assertEqual(recovered['status'],'committed');before=self.aggregate_graph();self.assertEqual(self.bc(a),recovered['result']);self.assertEqual(self.aggregate_graph(),before)
 def test_h32_competing_bag_updates_serialize_and_conflict(self):
  b=self.newbag();a=self.ba('bag-update',b,{'name':'First'});other=self.ba('bag-update',b,{'name':'Second'})
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.bs(a))as pid:f=pool.submit(self.bc,other);self.wait_for_lock(other[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertEqual(self.obs(b)['bag']['name'],'First')
 def test_h33_item_move_before_bag_trash_keeps_bag_active(self):
  b=self.newbag();i=self.create();a=self.ba('bag-trash-empty',b);item=self.args('update',{'bag_id':b},target=i['id'])
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.command_statement(item))as pid:f=pool.submit(self.bc,a);self.wait_for_lock(a[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertIsNone(self.obs(b)['bag']['deleted_at'])
 def test_h34_bag_trash_before_item_move_rejects_assignment(self):
  b=self.newbag();i=self.create();a=self.ba('bag-trash-empty',b);item=self.args('update',{'bag_id':b},target=i['id'])
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.bs(a))as pid:f=pool.submit(self.rpc,'execute_family_trip_packing_v1',item);self.wait_for_lock(item[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertIsNone(self.row(i['id'])['bag_id'])
 def test_h35_permission_rechecked_after_root_lock_wait(self):
  self.policy('trip.packing.manage','trip_travelers');a=self.ba(user=self.editor)
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(self.trip)+'::text,0))')as pid:
    f=pool.submit(self.bc,a,self.editor);self.wait_for_lock(a[1],pid);self.policy('trip.packing.manage')
   with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=15)
  self.assertEqual(self.bags()['bags'],[])
 def test_h36_bag_collection_overflow_rolls_back_business_and_receipt(self):
  b=self.newbag();self.sql('update family_auth.trip_packing_state set collection_revision=9007199254740991 where trip_id='+lit(self.trip));a=self.ba('bag-update',b,{'name':'No overflow'});self.brefuse(a,'54000')
 def test_h37_legacy_oversized_content_survives_unrelated_edit(self):
  # Old125 fixture is cloned before126 and inspected in migration replay; here no post126 bypass.
  self.assertEqual(self.sql("select count(*)>0 from public.packing_bags where char_length(name)>500"),'t');b=self.newbag();self.assertEqual(self.bc(self.ba('bag-update',b,{'weight_limit_grams':10000000}))['bag']['weight_limit_grams'],10000000)
 def test_h38_active_parent_rls_hides_carriers_and_raw_bag(self):
  b=self.newbag();self.members(b,[self.person]);self.bt(b)
  for table,where in [('packing_bags','id'),('packing_bag_members','bag_id')]:self.assertEqual(self.sql('select count(*)from public.'+table+' where '+where+'='+lit(b),self.owner),'0')
  with self.assertRaisesRegex(RuntimeError,'42501'):self.obs(b)
  self.assertIsNotNone(self.obs(b,True)['bag']['deleted_at'])
 def test_h39_raw_live_reference_blocks_privileged_bag_trash(self):
  b=self.newbag();self.create(bag_id=b);before=self.aggregate_graph()
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.sql('update public.packing_bags set deleted_at=now(),deleted_by_person_id='+lit(self.person)+'where id='+lit(b))
  self.assertEqual(before,self.aggregate_graph())
 def test_h40_history_carrier_restore_retains_removed_members(self):
  b=self.newbag();self.members(b,[self.viewer_person]);self.bt(b);self.sql('delete from public.trip_travelers where trip_id='+lit(self.trip)+'and person_id='+lit(self.viewer_person));r=self.br(b);self.assertEqual(r['member_person_ids'],[self.viewer_person]);p=next(p for p in self.bags()['people']if p['id']==self.viewer_person);self.assertFalse(p['eligible'])
 def test_h41_true_equal_microsecond_trash_cursor_uses_descending_uuid(self):
  ids=[self.newbag()for _ in range(3)];self.sql("update public.packing_bags set deleted_at='2026-11-12T11:30:01.123456Z',deleted_by_person_id="+lit(self.person)+'where id in('+','.join(map(lit,ids))+')');a=self.bp(2);b=self.bp(2,a['next_cursor']);self.assertEqual([o['bag']['id']for o in a['bags']+b['bags']],sorted(ids,reverse=True));self.assertIn('.123456',a['next_cursor']['deleted_at'])
 def test_h42_all_existing_command_domains_share_original_operation_namespace(self):
  bag=self.ba();self.bc(bag);c=self.empty('Domains');i=self.create(category='Domains')
  commands=[(self.cat,self.cat_args()),(self.life,self.lifecycle_args()),(self.bound,self.bound_args(c)),(self.aggregate3,self.aggregate_args(c)),(self.group,self.group_args())]
  for execute,args in commands:
   a=copy.deepcopy(args);a[1]=bag[1];before=self.aggregate_graph()
   with self.assertRaisesRegex(RuntimeError,'PT409'):execute(a)
   self.assertEqual(self.aggregate_graph(),before)
  # Committed commands in each domain are separately refused by bag receipt lookup.
  for execute,args in commands[:4]:
   # Regenerate stale collection/category observations after each deliberate command.
   if execute==self.cat:a=self.cat_args()
   elif execute==self.life:a=self.lifecycle_args(values={'name':'Other domain '+str(uuid.uuid4()),'visibility':'common'})
   elif execute==self.bound:a=self.bound_args(self.category2(c['id']))
   else:a=self.aggregate_args(self.category2(c['id']))
   execute(a)
   with self.assertRaisesRegex(RuntimeError,'22023'):self.breceipt(a[1])
   candidate=self.ba();candidate[1]=a[1];self.brefuse(candidate)
 def test_h43_genuine_person_context_change_refuses_receipt(self):
  a=self.ba();self.bc(a);self.sql('update public.people set archived_at=clock_timestamp()where id='+lit(self.person))
  try:
   with self.assertRaisesRegex(RuntimeError,'PT409|42501'):self.breceipt(a[1])
  finally:self.sql('update public.people set archived_at=null where id='+lit(self.person))
 def test_h44_foreign_family_carrier_is_not_silently_filtered(self):
  b=self.newbag();foreign=self.sql('select id from public.people where family_id<>'+lit(self.family)+'limit 1');self.assertTrue(foreign);self.brefuse(self.ba('bag-members',b,{'person_ids':sorted([self.person,foreign])}),'22023')
 def test_h45_removed_member_addition_is_rejected_historical_one_retained(self):
  b=self.newbag();self.members(b,[self.viewer_person]);self.sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.viewer))
  try:
   self.members(b,[self.viewer_person,self.person]);self.members(b,[self.person]);self.brefuse(self.ba('bag-members',b,{'person_ids':sorted([self.viewer_person,self.person])}),'22023')
  finally:self.sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.viewer))
 def test_h46_active_quota_excludes_history_and_restore_rechecks_capacity(self):
  b=self.newbag();self.sql('insert into public.packing_bags(trip_id,name)select '+lit(self.trip)+",'Quota bag'from generate_series(1,1999)");self.brefuse(self.ba(),'54000');self.bt(b);new=self.newbag();self.brefuse(self.ba('bag-restore',b),'54000');self.assertNotEqual(new,b)
 def test_h47_envelope_and_field_bounds_refuse_without_changes(self):
  a=self.ba(values={'name':'x'*1048577});self.brefuse(a,'54000');b=self.newbag()
  for key,val in [(0,None),(1,None),(4,None),(6,-1),(6,9007199254740992),(5,0),(5,9007199254740992)]:
   a=self.ba('bag-update',b,{'name':'No'});a[key]=val;self.brefuse(a,'22023')
  a=self.ba('bag-update',b,{'name':'No'});a[7]['extra']=True;self.brefuse(a,'22023')
 def test_h48_unsafe_bag_revision_is_refused_before_commit(self):
  b=self.newbag();a=self.ba('bag-update',b,{'name':'No'});self.sql('begin;alter table public.packing_bags disable trigger ab_packing_bag_version;update public.packing_bags set revision=9007199254740991 where id='+lit(b)+';set constraints all immediate;alter table public.packing_bags enable trigger ab_packing_bag_version;commit;');a=self.ba('bag-update',b,{'name':'No'});self.brefuse(a,'54000')
 def test_h49_late_carrier_insert_fault_rolls_back_all_prior_changes(self):
  b=self.newbag();a=self.ba('bag-members',b,{'person_ids':sorted([self.person,self.editor_person])});last=max(self.person,self.editor_person)
  self.sql("create function family_auth.d2a_fault()returns trigger language plpgsql as $$begin if new.person_id="+lit(last)+"::uuid then raise exception 'D2a injected late carrier fault'using errcode='P0001';end if;return new;end $$;create trigger zz_d2a_fault before insert on public.packing_bag_members for each row execute function family_auth.d2a_fault()")
  try:self.brefuse(a,'D2a injected late carrier fault')
  finally:self.sql('drop trigger zz_d2a_fault on public.packing_bag_members;drop function family_auth.d2a_fault()')
 def test_h50_trip_trash_race_refuses_waiting_bag_create(self):
  a=self.ba();rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)))
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command('select public.trash_family_trip('+lit(self.trip)+','+str(rev)+')')as pid:f=pool.submit(self.bc,a);self.wait_for_lock(a[1],pid)
   with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=15)
  self.assertEqual(self.sql('select count(*)from public.packing_bags where trip_id='+lit(self.trip)),'0')
 def test_h51_carrier_removed_during_lock_wait_is_revalidated(self):
  b=self.newbag();a=self.ba('bag-members',b,{'person_ids':[self.viewer_person]})
  # Local fixture command removes a carrier and holds the same root transaction.
  self.sql("create function family_auth.d2a_roster_remove()returns void language sql security definer set search_path=''as $$delete from public.trip_travelers where trip_id="+lit(self.trip)+'and person_id='+lit(self.viewer_person)+'$$')
  try:
   with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
    with self.held_authenticated_command('select family_auth.d2a_roster_remove()')as pid:
     f=pool.submit(self.bc,a);self.wait_for_lock(a[1],pid)
    with self.assertRaisesRegex(RuntimeError,'PT409|22023'):f.result(timeout=15)
   self.assertEqual(self.obs(b)['member_person_ids'],[])
  finally:self.sql('drop function family_auth.d2a_roster_remove()')
 def test_h52_sensitive_helpers_and_public_wrappers_have_explicit_security(self):
  for fn in ['packing_bag_json(public.packing_bags)','packing_bag_members_json(uuid)','validate_packing_bag_request(text,jsonb)']:
   self.assertEqual(self.sql('select has_function_privilege(\'authenticated\','+lit('family_auth.'+fn)+',\'EXECUTE\')'),'f')
  for name in ['get_family_trip_packing_bags_v1','get_family_trip_packing_bag_v1','list_family_trip_packing_bag_trash_v1','execute_family_trip_packing_bag_v1','get_family_trip_packing_bag_receipt_v1']:
   self.assertEqual(self.sql("select not prosecdef and proconfig=array['search_path=\"\"']from pg_proc where proname="+lit(name)),'t')
 # Four old tests seeded NEW 8MiB bag names after125.126 intentionally rejects
 # these new values at the write boundary. Legacy migrated8MiB bags are proved
 # separately without disabling or changing production triggers.
 def assert_oversized_new_bag_refused(self):
  before=self.aggregate_graph()
  with self.assertRaisesRegex(RuntimeError,'22023'):self.sql('insert into public.packing_bags(trip_id,name)values('+lit(self.trip)+",repeat('x',8388608))")
  self.assertEqual(self.aggregate_graph(),before)
 def test_45_oversize_snapshot_refuses_and_rolls_back_a_command(self):self.assert_oversized_new_bag_refused()
 def test_d32_actual_eight_mib_read_bound_rolls_back_category_command(self):self.assert_oversized_new_bag_refused()
 def test_e23_eight_mib_and_two_thousand_empty_categories_bound(self):
  self.sql('insert into public.packing_categories(trip_id,name)select '+lit(self.trip)+",'C'||x from generate_series(1,2000)x");self.assertEqual(len(self.packet2()['categories']),2000);self.life_no_effect(self.lifecycle_args(values={'name':'Overflow','visibility':'common'}),'54000');self.assert_oversized_new_bag_refused()
 def test_f36_actual_snapshot_size_bound_rolls_back_create(self):self.assert_oversized_new_bag_refused()
 def test_h53_real_http_aal2_and_rejected_lower_roles(self):
  code,body=self.http('POST','/rest/v1/rpc/get_family_trip_packing_bags_v1',{'p_trip_id':self.trip});self.assertEqual(code,200,body[:200]);self.assertEqual(json.loads(body)['kind'],'packing-bag-snapshot');args=self.ba();payload=dict(zip(self.NAMES,args));code,body=self.http('POST','/rest/v1/rpc/'+self.RPC,payload);self.assertEqual(code,200,body[:200]);result=json.loads(body);self.assertEqual(result,self.breceipt(args[1])['result'])
  code,body=self.http('POST','/auth/v1/token?grant_type=password',{'email':'p01-'+self.owner+'@fixture.invalid','password':'local-only'});self.assertEqual(code,200);low=json.loads(body)['access_token']
  for token in [low,self.anon,self.service]:
   for endpoint,request in [('get_family_trip_packing_bags_v1',{'p_trip_id':self.trip}),(self.RPC,payload),('get_family_trip_packing_bag_receipt_v1',{'p_trip_id':self.trip,'p_operation_id':args[1]})]:
    code,body=self.http('POST','/rest/v1/rpc/'+endpoint,request,token=token);self.assertIn(code,[401,403],body[:200])
