"""U04-C3a: real database/Auth/HTTP, original-observation and held-lock lifecycle proofs."""
import concurrent.futures,copy,json,uuid
from packing_category_commands import CategoryCommands,lit

class CategoryLifecycle(CategoryCommands):
 def packet2(self,user=None):return self.rpc('get_family_trip_packing_with_categories_v2',[self.trip],user)
 def lookup2(self,name='Empty',visibility='common',user=None):return self.rpc('lookup_family_trip_packing_category_v2',[self.trip,visibility,name],user)
 def category2(self,key):return json.loads(self.sql('select family_auth.packing_category_json_v2(c)from public.packing_categories c where id='+lit(key)))
 def lifecycle_args(self,action='category-create',values=None,target=None,user=None,observed=None):
  p=self.packet2(user);target=target or str(uuid.uuid4())
  if action!='category-create'and observed is None:observed=self.category2(target)
  return [self.trip,str(uuid.uuid4()),p['scope'],action,target,p['collection_revision'],observed,values if values is not None else({'name':'Empty','visibility':'common'}if action=='category-create'else{})]
 def life(self,args,user=None):return self.rpc('execute_family_trip_packing_category_lifecycle_v2',args,user)
 def empty(self,name='Empty',visibility='common',user=None):return self.life(self.lifecycle_args(values={'name':name,'visibility':visibility},user=user),user)['category']
 def life_statement(self,args):return 'select public.execute_family_trip_packing_category_lifecycle_v2('+','.join('null'if x is None else str(x)if isinstance(x,int)else lit(json.dumps(x))+'::jsonb'if isinstance(x,(dict,list))else lit(x)for x in args)+')'
 def life_receipt(self,operation,user=None):return self.rpc('get_family_trip_packing_category_lifecycle_receipt_v2',[self.trip,operation],user)
 def life_no_effect(self,args,pattern,user=None):
  before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,pattern):self.life(args,user)
  self.assertEqual(self.foundation(),before)
 def dismiss(self,c):return self.life(self.lifecycle_args('category-dismiss-empty',target=c['id']))['category']
 def test_e01_empty_create_is_exact_pure_metadata_no_placeholder(self):
  args=self.lifecycle_args();r=self.life(args);c=r['category'];p=self.packet2()
  self.assertEqual(set(r),{'version','kind','trip_id','operation_id','scope','action','values','collection_revision','category','changed'})
  self.assertEqual(r['version'],2);self.assertEqual(r['kind'],'packing-category-lifecycle');self.assertTrue(r['changed']);self.assertEqual(c['id'],args[4])
  self.assertEqual(set(c),{'id','trip_id','owner_person_id','name','revision','created_at','updated_at','assignments','retained_when_empty','sort_order','deleted_at','deleted_by_person_id'})
  self.assertEqual(c['revision'],1);self.assertEqual(c['sort_order'],0);self.assertTrue(c['retained_when_empty']);self.assertEqual(p['categories'],[c]);self.assertEqual(p['item_categories'],[]);self.assertEqual(p['packing']['items'],[])
  self.assertEqual(self.packet()['categories'],[]);self.assertEqual(p['packing'],self.state());self.assertEqual(set(p),set(self.packet()))
 def test_e02_http_create_and_read_are_real_authenticated_apis(self):
  args=self.lifecycle_args();names=['p_trip_id','p_operation_id','p_scope','p_action','p_target_id','p_expected_collection_revision','p_observed_category','p_values']
  code,b=self.http('POST','/rest/v1/rpc/execute_family_trip_packing_category_lifecycle_v2',dict(zip(names,args)));self.assertEqual(code,200,b[:250]);r=json.loads(b)
  code,b=self.http('POST','/rest/v1/rpc/get_family_trip_packing_with_categories_v2',{'p_trip_id':self.trip});self.assertEqual(code,200);self.assertEqual(json.loads(b)['categories'],[r['category']])
 def test_e03_common_own_and_foreign_empty_visibility(self):
  self.policy('trip.packing.manage','trip_travelers');common=self.empty('Same');own=self.empty('Same','personal');peer=self.empty('Same','personal',self.editor)
  self.assertEqual({c['id']for c in self.packet2()['categories']},{common['id'],own['id']});self.assertEqual({c['id']for c in self.packet2(self.editor)['categories']},{common['id'],peer['id']})
  self.assertEqual(self.lookup2('Same','personal')['category'],own)
  self.life_no_effect(self.lifecycle_args('category-retain',target=peer['id']),'42501')
 def test_e04_historical_orphan_lookup_retain_and_noop(self):
  self.sql('insert into public.packing_categories(trip_id,name,retained_when_empty)values('+lit(self.trip)+",'Historical',false)")
  self.assertEqual(self.packet2()['categories'],[]);p=self.lookup2('Historical');c=p['category'];self.assertFalse(c['retained_when_empty']);self.assertEqual(self.packet()['categories'],[])
  r=self.life(self.lifecycle_args('category-retain',target=c['id']));self.assertTrue(r['changed']);self.assertEqual(r['category']['revision'],c['revision']+1);self.assertEqual(self.packet2()['categories'],[r['category']])
  a=self.lifecycle_args('category-retain',target=c['id']);before=self.category2(c['id']);r=self.life(a);self.assertFalse(r['changed']);self.assertEqual(r['category'],before);self.assertEqual(r['collection_revision'],a[5])
 def test_e05_dismiss_restore_preserve_assignments_and_historical_items(self):
  row=self.create(category='Keep');cid=self.category(row['id']);self.assign(cid,provenance=True);self.execute('trash',target=row['id']);item=self.row(row['id']);c=self.category2(cid);assign=c['assignments'];trashed=self.dismiss(c)
  self.assertEqual(trashed['revision'],c['revision']+1);self.assertEqual(trashed['deleted_by_person_id'],self.person);self.assertEqual(trashed['assignments'],assign);self.assertEqual(self.row(row['id']),item);self.assertEqual(self.packet2()['categories'],[]);self.assertNotIn('Keep',self.state()['category_assignees'])
  self.sql('update public.people set archived_at=now()where id='+lit(self.viewer_person))
  try:r=self.life(self.lifecycle_args('category-restore-empty',target=cid));self.assertEqual(r['category']['assignments'],assign);self.assertIsNone(r['category']['deleted_at']);self.assertEqual(self.row(row['id']),item);self.assertFalse(next(x for x in self.packet2()['people']if x['id']==self.viewer_person)['eligible'])
  finally:self.sql('update public.people set archived_at=null where id='+lit(self.viewer_person))
 def test_e06_active_child_blocks_dismiss_and_retain(self):
  i=self.create(category='Live');cid=self.category(i['id'])
  for action in ['category-retain','category-dismiss-empty']:self.life_no_effect(self.lifecycle_args(action,target=cid),'PT409')
 def test_e07_all_state_name_reserved_no_implicit_merge(self):
  c=self.empty();self.life_no_effect(self.lifecycle_args(),'PT409');self.dismiss(c);self.life_no_effect(self.lifecycle_args(),'PT409');self.assertIsNotNone(self.lookup2()['category']['deleted_at'])
  self.sql('insert into public.packing_categories(trip_id,name,retained_when_empty)values('+lit(self.trip)+",'Orphan',false)");self.life_no_effect(self.lifecycle_args(values={'name':'Orphan','visibility':'common'}),'PT409')
 def test_e08_exact_raw_unicode_names_and_new_blank_refusals(self):
  names=[' Gear ','gear','Gear','é','e\u0301','__proto__','constructor','😀'*200,'...']
  for n in names:self.assertEqual(self.empty(n)['name'],n)
  for n in ['', '   ','😀'*201]:self.life_no_effect(self.lifecycle_args(values={'name':n,'visibility':'common'}),'22023')
  self.assertEqual(self.lookup2('missing')['category'],None)
 def test_e09_strict_observation_values_and_safe_counters(self):
  c=self.empty();base=self.lifecycle_args('category-dismiss-empty',target=c['id'])
  for key,val in [('revision',2),('name','Other'),('sort_order',3),('retained_when_empty',False),('updated_at','2026-01-01T00:00:00+00:00'),('assignments',[{'person_id':self.viewer_person,'assigned_at':None,'assigned_by_person_id':None}])]:
   a=copy.deepcopy(base);a[6][key]=val;self.life_no_effect(a,'PT409')
  for key,val in [('extra',True),('sort_order',True),('sort_order',9007199254740992),('deleted_at','infinity'),('retained_when_empty',None)]:
   a=copy.deepcopy(base);a[6][key]=val;self.life_no_effect(a,'22023')
  for values in [{'owner_person_id':self.person},{'sort_order':2},{'deleted_at':None}]:
   a=copy.deepcopy(base);a[7]=values;self.life_no_effect(a,'22023')
  a=copy.deepcopy(base);a[5]=9007199254740992;self.life_no_effect(a,'22023')
  a=copy.deepcopy(base);a[6]['name']='x'*262145;self.life_no_effect(a,'54000')
 def test_e10_lifecycle_state_and_original_scope_refuse(self):
  c=self.empty();self.life_no_effect(self.lifecycle_args('category-restore-empty',target=c['id']),'PT409');old=self.lifecycle_args('category-dismiss-empty',target=c['id']);t=self.dismiss(c)
  self.life_no_effect(old,'PT409');self.life_no_effect(self.lifecycle_args('category-retain',target=c['id']),'PT409')
  a=self.lifecycle_args('category-restore-empty',target=c['id']);a[2]['layer']='myDraft';self.life_no_effect(a,'PT409')
 def test_e11_receipts_and_exact_retry_survive_later_states(self):
  a=self.lifecycle_args();r=self.life(a);self.dismiss(r['category']);before=self.foundation();self.assertEqual(self.life(a),r);self.assertEqual(self.foundation(),before);self.assertEqual(self.life_receipt(a[1])['result'],r)
  u=self.life_receipt(str(uuid.uuid4()));self.assertEqual(u['status'],'unknown');self.assertIsNone(u['result']);self.assertFalse(u['result_redacted'])
 def test_e12_changed_intent_and_all_old_receipt_domains_refuse(self):
  a=self.lifecycle_args();self.life(a)
  for idx,val in [(4,str(uuid.uuid4())),(5,a[5]+1),(7,{'name':'Different','visibility':'common'})]:
   b=copy.deepcopy(a);b[idx]=val;self.life_no_effect(b,'PT409')
  for name in ['get_family_trip_packing_receipt_v1','get_family_trip_packing_group_receipt_v1','get_family_trip_packing_category_receipt_v1']:
   with self.assertRaisesRegex(RuntimeError,'22023'):self.rpc(name,[self.trip,a[1]])
  item=self.create(category='Items');args=self.args('update',{'name':'Changed'},target=item['id']);self.rpc('execute_family_trip_packing_v1',args)
  b=self.lifecycle_args(values={'name':'Unused','visibility':'common'});b[1]=args[1];self.life_no_effect(b,'PT409')
  with self.assertRaisesRegex(RuntimeError,'22023'):self.life_receipt(args[1])
 def test_e13_shared_namespace_rejects_lifecycle_operation_in_item_group_metadata(self):
  c=self.empty();a=self.lifecycle_args('category-retain',target=c['id']);self.life(a);i=self.create(category='Items')
  item=self.args('update',{'name':'Bad'},target=i['id'],operation=a[1]);group=self.group_args(operation=a[1]);meta=self.cat_args(operation=a[1])
  for call in [lambda:self.rpc('execute_family_trip_packing_v1',item),lambda:self.group(group),lambda:self.cat(meta)]:
   with self.assertRaisesRegex(RuntimeError,'PT409'):call()
 def test_e14_legacy_writers_reuse_active_identity_and_append_rank(self):
  c=self.empty('Empty');other=self.empty('Other');i=self.create(category='Empty');self.assertEqual(self.category(i['id']),c['id']);self.assertEqual(self.category2(c['id'])['sort_order'],0)
  legacy=self.create(category='Legacy');self.assertEqual(self.category2(self.category(legacy['id']))['sort_order'],2);self.assertEqual(self.category2(other['id'])['sort_order'],1)
 def test_e15_dismissed_parent_refuses_create_move_and_item_restore(self):
  i=self.create(category='Trashed');cid=self.category(i['id']);self.execute('trash',target=i['id']);self.dismiss(self.category2(cid));live=self.create(category='Live');before=self.foundation()
  for call in [lambda:self.create(category='Trashed'),lambda:self.execute('update',{'category':'Trashed'},target=live['id']),lambda:self.execute('restore',target=i['id'])]:
   with self.assertRaisesRegex(RuntimeError,'PT409'):call()
   self.assertEqual(self.foundation(),before)
  self.life(self.lifecycle_args('category-restore-empty',target=cid));self.execute('restore',target=i['id']);self.assertEqual(self.category(i['id']),cid)
 def test_e16_old_metadata_writer_refuses_dismissed_parent(self):
  i=self.create(category='Old');a=self.cat_args();self.execute('trash',target=i['id']);self.dismiss(self.category2(self.category(i['id'])));self.no_effect(a,'PT409')
 def test_e17_exact_trash_paging_ties_and_own_scope(self):
  self.policy('trip.packing.manage','trip_travelers');categories=[self.dismiss(self.empty('C'+str(x)))for x in range(4)];own=self.dismiss(self.empty('Own','personal'));peer=self.empty('Peer','personal',self.editor);self.life(self.lifecycle_args('category-dismiss-empty',target=peer['id'],user=self.editor),self.editor)
  seen=[];cursor=None
  while True:
   p=self.rpc('list_family_trip_packing_category_trash_v2',[self.trip,2,cursor['deleted_at']if cursor else None,cursor['id']if cursor else None]);self.assertEqual(set(p),{'version','kind','scope','collection_revision','categories','next_cursor'});seen+=p['categories'];cursor=p['next_cursor']
   if cursor is None:break
  self.assertEqual({c['id']for c in seen},{c['id']for c in categories+[own]});self.assertEqual(len(seen),5)
  for args in [[0,None,None],[101,None,None],[1,'infinity',str(uuid.uuid4())],[1,None,str(uuid.uuid4())]]:
   with self.assertRaisesRegex(RuntimeError,'22023'):self.rpc('list_family_trip_packing_category_trash_v2',[self.trip]+args)
 def test_e18_foreign_shared_personal_only_visible_through_live_item(self):
  self.policy('trip.packing.manage','trip_travelers');i=self.create(category='Shared',visibility='personal');cid=self.category(i['id']);self.sql('insert into public.packing_item_contributors(trip_id,item_id,person_id)values('+','.join(map(lit,[self.trip,i['id'],self.editor_person]))+')')
  self.assertEqual([c['id']for c in self.packet2(self.editor)['categories']],[cid]);self.life_no_effect(self.lifecycle_args('category-dismiss-empty',target=cid,user=self.editor),'42501',self.editor)
  self.execute('trash',target=i['id']);self.assertEqual(self.packet2(self.editor)['categories'],[])
 def test_e19_direct_permission_propose_deny_and_cross_family(self):
  self.policy('trip.packing.manage','trip_travelers');args=self.lifecycle_args(user=self.editor)
  self.policy('trip.packing.manage','patriarch','trip_travelers');self.life_no_effect(args,'42501',self.editor)
  self.policy('trip.packing.manage');self.life_no_effect(args,'42501',self.editor);self.life_no_effect(self.lifecycle_args(),'42501',self.stranger)
  with self.assertRaisesRegex(RuntimeError,'42501'):self.lookup2(user=self.editor)
 def test_e20_raw_grants_invoker_wrappers_and_http_denial(self):
  public=['get_family_trip_packing_with_categories_v2(uuid)','lookup_family_trip_packing_category_v2(uuid,text,text)','list_family_trip_packing_category_trash_v2(uuid,integer,timestamp with time zone,uuid)','execute_family_trip_packing_category_lifecycle_v2(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb)','get_family_trip_packing_category_lifecycle_receipt_v2(uuid,uuid)']
  for sig in public:
   self.assertEqual(self.sql("select prosecdef from pg_proc where oid="+lit('public.'+sig)+'::regprocedure'),'f')
   for role in ['anon','service_role']:self.assertEqual(self.sql('select has_function_privilege('+lit(role)+','+lit('public.'+sig)+",'EXECUTE')"),'f')
  for role in ['anon','authenticated','service_role']:
   for tab in ['public.packing_categories','public.packing_category_assignments','family_auth.packing_command_receipts']:self.assertEqual(self.sql('select has_table_privilege('+lit(role)+','+lit(tab)+",'SELECT,INSERT,UPDATE,DELETE')"),'f')
  for token in [self.anon,self.service]:
   code,b=self.http('POST','/rest/v1/rpc/get_family_trip_packing_with_categories_v2',{'p_trip_id':self.trip},token=token);self.assertIn(code,[401,403])
 def test_e21_late_receipt_failure_rolls_back_everything(self):
  args=self.lifecycle_args();before=self.foundation();claims=json.dumps({'sub':self.owner,'role':'authenticated','aal':'aal2'})
  stmt="begin;alter table family_auth.packing_command_receipts add constraint c3a_late_failure check(action<>'category-create')not valid;do $auth$begin perform set_config('request.jwt.claims',"+lit(claims)+",true);end $auth$;set local role authenticated;"+self.life_statement(args)+';commit;'
  with self.assertRaisesRegex(RuntimeError,'23514'):self.sql(stmt)
  self.assertEqual(self.foundation(),before);self.assertEqual(self.sql("select count(*)from pg_constraint where conname='c3a_late_failure'"),'0')
 def test_e22_collection_order_and_category_overflows_are_atomic(self):
  c=self.empty();self.sql('update family_auth.trip_packing_state set collection_revision=9007199254740991 where trip_id='+lit(self.trip));self.life_no_effect(self.lifecycle_args(values={'name':'Other','visibility':'common'}),'54000')
  self.sql('update family_auth.trip_packing_state set collection_revision=0 where trip_id='+lit(self.trip));self.sql('update public.packing_categories set sort_order=9007199254740991 where id='+lit(c['id']));self.life_no_effect(self.lifecycle_args(values={'name':'Other','visibility':'common'}),'54000')
  self.sql('update public.packing_categories set revision=revision where id='+lit(c['id']))
 def test_e23_eight_mib_and_two_thousand_empty_categories_bound(self):
  self.sql('insert into public.packing_categories(trip_id,name)select '+lit(self.trip)+",'C'||x from generate_series(1,2000)x");self.assertEqual(len(self.packet2()['categories']),2000);self.life_no_effect(self.lifecycle_args(values={'name':'Overflow','visibility':'common'}),'54000')
  # Separate bounded response failure without weakening any existing item/category limit.
  self.sql('insert into public.packing_bags(trip_id,name)values('+lit(self.trip)+",repeat('x',8388608))")
  with self.assertRaisesRegex(RuntimeError,'54000'):self.packet2()
 def test_e24_concurrent_identical_create_commits_one_identity(self):
  a=self.lifecycle_args()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:r=list(pool.map(lambda _:self.life(a),range(2)))
  self.assertEqual(r[0],r[1]);self.assertEqual(len(self.packet2()['categories']),1);self.assertEqual(self.sql('select count(*)from family_auth.packing_command_receipts where operation_id='+lit(a[1])),'1')
 def test_e25_create_then_dismiss_race_refuses_stale_original(self):
  c=self.empty();a=self.lifecycle_args('category-dismiss-empty',target=c['id']);i=self.args('create',{'name':'Arrived','category':'Empty'})
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.command_statement(i))as pid:f=pool.submit(self.life,a);self.wait_for_lock(a[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertIsNone(self.category2(c['id'])['deleted_at']);self.assertEqual(len(self.state()['items']),1)
 def test_e26_dismiss_then_create_race_refuses_parent(self):
  c=self.empty();a=self.lifecycle_args('category-dismiss-empty',target=c['id']);i=self.args('create',{'name':'Too late','category':'Empty'})
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.life_statement(a))as pid:f=pool.submit(self.rpc,'execute_family_trip_packing_v1',i);self.wait_for_lock(i[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertEqual(self.state()['items'],[]);self.assertIsNotNone(self.category2(c['id'])['deleted_at'])
 def test_e27_permissions_revoked_while_waiting_are_rechecked(self):
  self.policy('trip.packing.manage','trip_travelers');a=self.lifecycle_args(user=self.editor)
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(self.trip)+"::text,0))")as pid:f=pool.submit(self.life,a,self.editor);self.wait_for_lock(a[1],pid);self.policy('trip.packing.manage')
   with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=15)
 def test_e28_root_trash_while_waiting_refuses_lifecycle(self):
  a=self.lifecycle_args();rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)))
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command('select public.trash_family_trip('+lit(self.trip)+','+str(rev)+')')as pid:f=pool.submit(self.life,a);self.wait_for_lock(a[1],pid)
   with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=15)
 def test_e29_category_deletion_pair_actor_and_rank_constraints(self):
  c=self.empty();before=self.foundation()
  for expr,pattern in [('sort_order=-1','23514'),('sort_order=9007199254740992','23514'),('deleted_at=now()','23514'),('deleted_by_person_id='+lit(str(uuid.uuid4())),'23503'),('revision=99','23514'),('owner_person_id='+lit(self.editor_person),'23514')]:
   with self.assertRaisesRegex(RuntimeError,pattern):self.sql('update public.packing_categories set '+expr+' where id='+lit(c['id']))
   self.assertEqual(self.foundation(),before)
  with self.assertRaisesRegex(RuntimeError,'0A000'):self.sql('delete from public.packing_categories where id='+lit(c['id']))
 def test_e30_root_recovery_preserves_empty_and_dismissed_categories(self):
  a=self.empty('Active');b=self.dismiss(self.empty('Trash'));before=self.foundation();rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)));self.rpc('trash_family_trip',[self.trip,rev]);rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)));self.rpc('restore_family_trip',[self.trip,rev])
  after=self.foundation();self.assertEqual(after['categories'],before['categories']);self.assertEqual(after['assignments'],before['assignments']);self.assertEqual(self.packet2()['categories'],[a]);self.assertEqual(self.lookup2('Trash')['category'],b)
 def test_e31_empty_and_dismissed_metadata_export_without_private_leak(self):
  # Family export is aggregate-wide: use a separate synthetic Family so earlier deliberate 8MiB limit fixtures are excluded.
  fixture=type('ExportLifecycleFixture',(CategoryLifecycle,),{});fixture.setUpClass();c=fixture();c.setUp()
  a=c.empty('Active');b=c.dismiss(c.empty('Trash'));own=c.empty('Private','personal');job=c.sql('insert into public.family_export_jobs(family_id,requested_by_person_id,requested_by_user_id,expires_at)values('+','.join(map(lit,[c.family,c.editor_person,c.editor]))+",now()+interval '1 day')returning id")
  tables=json.loads(c.sql('select public.build_family_export_v1('+lit(job)+')'))['snapshot']['tables'];rows={x['id']:x for x in tables['packing_categories']};self.assertIn(a['id'],rows);self.assertIn(b['id'],rows);self.assertNotIn(own['id'],rows)
  for category in [a,b]:
   for k in ['retained_when_empty','sort_order','deleted_at','deleted_by_person_id']:self.assertEqual(rows[category['id']][k],category[k])
 def test_e32_real_aal1_http_write_lookup_and_receipt_denied(self):
  a=self.lifecycle_args();before=self.foundation();code,b=self.http('POST','/auth/v1/token?grant_type=password',{'email':'p01-'+self.owner+'@fixture.invalid','password':'local-only'});self.assertEqual(code,200);token=json.loads(b)['access_token'];names=['p_trip_id','p_operation_id','p_scope','p_action','p_target_id','p_expected_collection_revision','p_observed_category','p_values']
  for endpoint,body in [('execute_family_trip_packing_category_lifecycle_v2',dict(zip(names,a))),('lookup_family_trip_packing_category_v2',{'p_trip_id':self.trip,'p_visibility':'common','p_name':'Empty'}),('get_family_trip_packing_category_lifecycle_receipt_v2',{'p_trip_id':self.trip,'p_operation_id':a[1]})]:
   code,b=self.http('POST','/rest/v1/rpc/'+endpoint,body,token=token);self.assertEqual(code,403,b[:200])
  self.assertEqual(self.foundation(),before)
 def test_e33_membership_revoked_before_retry_or_during_wait_refuses(self):
  a=self.lifecycle_args();self.life(a)
  try:
   self.sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner));self.life_no_effect(a,'42501')
   with self.assertRaisesRegex(RuntimeError,'42501'):self.life_receipt(a[1])
  finally:self.sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
  b=self.lifecycle_args(values={'name':'Waiting','visibility':'common'})
  try:
   with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
    with self.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(self.trip)+"::text,0))")as pid:f=pool.submit(self.life,b);self.wait_for_lock(b[1],pid);self.sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
    with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=15)
  finally:self.sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
 def test_e34_only_original_actor_can_observe_receipt(self):
  self.policy('trip.packing.manage','trip_travelers');a=self.lifecycle_args();self.life(a);r=self.life_receipt(a[1],self.editor);self.assertEqual(r['status'],'unknown');self.assertIsNone(r['result'])
 def test_e35_last_item_trash_and_dismiss_serialize_without_invisible_children(self):
  i=self.create(category='Last');cid=self.category(i['id']);a=self.lifecycle_args('category-dismiss-empty',target=cid);trash=self.args('trash',target=i['id'])
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.command_statement(trash))as pid:f=pool.submit(self.life,a);self.wait_for_lock(a[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.dismiss(self.category2(cid));self.assertEqual(self.state()['items'],[])
 def test_e36_rename_and_assignment_races_refuse_changed_collection(self):
  for action,values in [('category-rename',{'name':'Changed'}),('category-assignees',{'person_ids':[self.viewer_person]})]:
   i=self.create(category='Race'+action);cid=self.category(i['id']);self.execute('trash',target=i['id']);a=self.lifecycle_args('category-dismiss-empty',target=cid)
   # The qualified v1 command still accepts an original observed historical metadata record.
   c=self.category2(cid);v1={k:v for k,v in c.items()if k not in ['retained_when_empty','sort_order','deleted_at','deleted_by_person_id']};p=self.packet2();meta=[self.trip,str(uuid.uuid4()),p['scope'],action,p['collection_revision'],v1,values]
   with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
    with self.held_authenticated_command(self.cat_statement(meta))as pid:f=pool.submit(self.life,a);self.wait_for_lock(a[1],pid)
    with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
 def test_e37_restore_waiting_on_dismissed_parent_refuses_item(self):
  i=self.create(category='Restore race');cid=self.category(i['id']);self.execute('trash',target=i['id']);a=self.lifecycle_args('category-dismiss-empty',target=cid);restore=self.args('restore',target=i['id'])
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.life_statement(a))as pid:f=pool.submit(self.rpc,'execute_family_trip_packing_v1',restore);self.wait_for_lock(restore[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
 def test_e38_failed_restore_and_dismiss_receipt_roll_back_assignments_and_history(self):
  c=self.empty();c=self.dismiss(c)
  for action in ['category-restore-empty','category-dismiss-empty']:
   if action=='category-dismiss-empty':self.life(self.lifecycle_args('category-restore-empty',target=c['id']))
   args=self.lifecycle_args(action,target=c['id']);before=self.foundation();claims=json.dumps({'sub':self.owner,'role':'authenticated','aal':'aal2'})
   statement="begin;alter table family_auth.packing_command_receipts add constraint c3a_restore_failure check(action<>"+lit(action)+")not valid;do $auth$begin perform set_config('request.jwt.claims',"+lit(claims)+",true);end $auth$;set local role authenticated;"+self.life_statement(args)+';commit;'
   with self.assertRaisesRegex(RuntimeError,'23514'):self.sql(statement)
   self.assertEqual(self.foundation(),before)
 def test_e39_trash_equal_timestamps_uuid_cursor_has_no_skips(self):
  cats=[self.dismiss(self.empty('Tie'+str(i)))for i in range(3)];self.sql('update public.packing_categories set deleted_at=\'2026-11-11T01:00:00Z\'where trip_id='+lit(self.trip));seen=[];cursor=None
  for _ in range(3):
   p=self.rpc('list_family_trip_packing_category_trash_v2',[self.trip,1,cursor['deleted_at']if cursor else None,cursor['id']if cursor else None]);seen.append(p['categories'][0]['id']);cursor=p['next_cursor']
  self.assertEqual(seen,sorted([x['id']for x in cats],reverse=True));self.assertIsNone(cursor)
 def test_e40_category_row_bound_noop_receipt_and_read_purity(self):
  c=self.empty();before=self.foundation();self.lookup2();self.packet2();self.rpc('list_family_trip_packing_category_trash_v2',[self.trip]);self.assertEqual(self.foundation(),before)
  args=self.lifecycle_args('category-retain',target=c['id']);r=self.life(args);self.assertFalse(r['changed']);after=self.foundation();after['old']['packing']['receipts']=before['old']['packing']['receipts'];self.assertEqual(after,before)
 def test_e41_real_logout_refuses_still_signed_jwt_for_new_apis(self):
  fixture=type('SessionLifecycleFixture',(CategoryLifecycle,),{});fixture.setUpClass();c=fixture();c.setUp();a=c.lifecycle_args();before=c.foundation();token=c.token
  code,b=c.http('POST','/auth/v1/logout?scope=local',{},token=token);self.assertEqual(code,204,b[:100]);names=['p_trip_id','p_operation_id','p_scope','p_action','p_target_id','p_expected_collection_revision','p_observed_category','p_values']
  for name,values in [('get_family_trip_packing_with_categories_v2',{'p_trip_id':c.trip}),('execute_family_trip_packing_category_lifecycle_v2',dict(zip(names,a))),('get_family_trip_packing_category_lifecycle_receipt_v2',{'p_trip_id':c.trip,'p_operation_id':a[1]})]:
   code,b=c.http('POST','/rest/v1/rpc/'+name,values,token=token);self.assertEqual(code,403,b[:200])
  self.assertEqual(c.foundation(),before)
 def test_e42_known_receipt_visibility_fault_redacts_without_unknown(self):
  a=self.lifecycle_args();self.life(a);before=self.foundation();claims=json.dumps({'sub':self.owner,'role':'authenticated','aal':'aal2'})
  # Rolled-back fault injection exercises the loss-of-visibility branch without mutating immutable ownership.
  result=self.sql("begin;create or replace function family_auth.packing_result_visible(p_result jsonb)returns boolean language sql stable security definer set search_path=''as 'select false';do $auth$begin perform set_config('request.jwt.claims',"+lit(claims)+",true);end $auth$;set local role authenticated;select public.get_family_trip_packing_category_lifecycle_receipt_v2("+lit(self.trip)+','+lit(a[1])+');rollback;')
  r=json.loads(result);self.assertEqual(r['status'],'committed');self.assertTrue(r['result_redacted']);self.assertIsNone(r['result']);self.assertEqual(self.foundation(),before);self.assertIsNotNone(self.life_receipt(a[1])['result'])
 def test_e43_lifecycle_actor_reference_prevents_cross_family_person_move(self):
  c=self.empty();guest=self.guest();self.sql('update public.packing_categories set deleted_at=now(),deleted_by_person_id='+lit(guest)+'where id='+lit(c['id']));other=self.sql("insert into public.families(name)values('Actor boundary fixture')returning id")
  with self.assertRaisesRegex(RuntimeError,'23514'):self.sql('update public.people set family_id='+lit(other)+'where id='+lit(guest))
 def test_e44_real_session_expiry_during_lock_wait_is_rechecked(self):
  import base64,time
  fixture=type('ExpiryLifecycleFixture',(CategoryLifecycle,),{});fixture.setUpClass();c=fixture();c.setUp();a=c.lifecycle_args();before=c.foundation();session=json.loads(base64.urlsafe_b64decode(c.token.split('.')[1]+'=='))['session_id']
  c.sql('update auth.sessions set not_after=clock_timestamp()+interval \'1 minute\'where id='+lit(session))
  names=['p_trip_id','p_operation_id','p_scope','p_action','p_target_id','p_expected_collection_revision','p_observed_category','p_values']
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with c.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(c.trip)+"::text,0))")as pid:
    f=pool.submit(c.http,'POST','/rest/v1/rpc/execute_family_trip_packing_category_lifecycle_v2',dict(zip(names,a)))
    # PostgREST parameterizes values: witness the RPC/backend and actual blocker, not a literal UUID in query text.
    deadline=time.monotonic()+10;waiting=False
    while time.monotonic()<deadline:
     waiting=c.sql("select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid()and position('execute_family_trip_packing_category_lifecycle_v2'in query)>0 and "+str(pid)+'=any(pg_blocking_pids(pid)))')=='t'
     if waiting:break
     time.sleep(.05)
    self.assertTrue(waiting,'HTTP RPC never demonstrably waited on the held aggregate mutex')
    c.sql('update auth.sessions set not_after=clock_timestamp()+interval \'200 milliseconds\'where id='+lit(session));time.sleep(.3)
   code,b=f.result(timeout=15);self.assertEqual(code,403,b[:200])
  self.assertEqual(c.foundation(),before)
