"""C3b1 category-ID-bound item create/move; real roles/Auth/HTTP and held-lock proofs."""
import concurrent.futures,copy,json,uuid
from packing_category_lifecycle import CategoryLifecycle,lit

class CategoryBound(CategoryLifecycle):
 def bound_args(self,category,action='category-item-create',target=None,values=None,user=None):
  p=self.packet2(user);target=target or str(uuid.uuid4());category=self.category2(category)if isinstance(category,str)else category
  return [self.trip,str(uuid.uuid4()),p['scope'],action,target,None if action=='category-item-create'else self.row(target)['revision'],p['collection_revision'],category['id'],copy.deepcopy(category),values if values is not None else({'name':'Bound item'}if action=='category-item-create'else{})]
 def bound(self,args,user=None):return self.rpc('execute_family_trip_packing_category_item_v2',args,user)
 def bound_receipt(self,operation,user=None):return self.rpc('get_family_trip_packing_category_item_receipt_v2',[self.trip,operation],user)
 def bound_statement(self,args):return 'select public.execute_family_trip_packing_category_item_v2('+','.join('null'if x is None else str(x)if isinstance(x,int)else lit(json.dumps(x))+'::jsonb'if isinstance(x,(dict,list))else lit(x)for x in args)+')'
 def bound_http(self,args,token=None):
  names=['p_trip_id','p_operation_id','p_scope','p_action','p_target_id','p_expected_revision','p_expected_collection_revision','p_category_id','p_observed_category','p_values'];code,b=self.http('POST','/rest/v1/rpc/execute_family_trip_packing_category_item_v2',dict(zip(names,args)),token=token);return code,json.loads(b)
 def bound_no_effect(self,args,pattern,user=None):
  before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,pattern):self.bound(args,user)
  self.assertEqual(self.foundation(),before)
 def meta_for(self,category,action='category-rename',values=None):
  p=self.packet2();c=self.category2(category['id']);c={k:v for k,v in c.items()if k not in ['retained_when_empty','sort_order','deleted_at','deleted_by_person_id']}
  return [self.trip,str(uuid.uuid4()),p['scope'],action,p['collection_revision'],c,values if values is not None else {'name':'Renamed'}]
 def test_f01_http_create_binds_exact_uuid_and_complete_committed_facts(self):
  c=self.empty();a=self.bound_args(c,values={'name':'  Café ☕  ','quantity':4,'packed_quantity':2,'weight_grams':75});code,r=self.bound_http(a);self.assertEqual(code,200,r)
  self.assertEqual(set(r),{'version','kind','trip_id','operation_id','scope','action','target_id','values','collection_revision','item','category','changed'});self.assertEqual(r['kind'],'packing-category-item');self.assertEqual(r['version'],2);self.assertTrue(r['changed']);self.assertEqual(r['item']['id'],a[4]);self.assertEqual(r['target_id'],a[4]);self.assertEqual(r['category'],c)
  self.assertEqual(r['item']['name'],'Café ☕');self.assertEqual(r['item']['revision'],1);self.assertEqual(r['item']['packed_quantity'],2);self.assertEqual(self.category(a[4]),c['id']);self.assertNotIn('category_id',r['item']);self.assertEqual(r['item'],self.state()['items'][0]);self.assertEqual(r['values'],a[9]);self.assertEqual(len(self.packet2()['categories']),1)
 def test_f02_common_and_own_personal_labels_derive_scope_without_owner_input(self):
  common=self.empty('Gear');own=self.empty('Gear','personal')
  for c in [common,own]:
   r=self.bound(self.bound_args(c));self.assertEqual(r['item']['is_private'],c['owner_person_id']is not None);self.assertEqual(r['item']['owner_person_id'],c['owner_person_id']);self.assertEqual(self.category(r['target_id']),c['id'])
 def test_f03_repeated_items_are_distinct_but_exact_retry_is_once(self):
  c=self.empty();a=self.bound_args(c);r=self.bound(a);before=self.foundation();self.assertEqual(self.bound(a),r);self.assertEqual(self.foundation(),before)
  b=self.bound_args(c);r2=self.bound(b);self.assertNotEqual(r2['target_id'],r['target_id']);self.assertEqual(len(self.state()['items']),2)
 def test_f04_request_uuid_and_occupied_item_identity_never_upsert(self):
  c=self.empty();r=self.bound(self.bound_args(c));a=self.bound_args(c,target=r['target_id']);self.bound_no_effect(a,'PT409');other=self.create(category='Legacy');self.bound_no_effect(self.bound_args(c,target=other['id']),'PT409')
 def test_f05_move_changes_only_binding_revision_and_timestamp(self):
  a=self.empty('A');b=self.empty('B');bag=self.bag();r=self.bound(self.bound_args(a,values={'name':'Keep','quantity':4,'weight_grams':125,'bag_id':bag,'packed_quantity':2}));item=r['target_id']
  for table,person in [('packing_item_recipients',self.viewer_person),('packing_item_contributors',self.editor_person)]:self.sql('insert into public.'+table+'(trip_id,item_id,person_id)values('+','.join(map(lit,[self.trip,item,person]))+')')
  before=self.row(item);links={t:self.sql('select jsonb_agg(to_jsonb(x)order by person_id)from public.'+t+' x where item_id='+lit(item))for t in ['packing_item_recipients','packing_item_contributors']};args=self.bound_args(b,'category-item-move',item);out=self.bound(args);after=self.row(item)
  for key in before:
   if key not in ['category_id','category','revision','updated_at']:self.assertEqual(after[key],before[key],key)
  self.assertEqual(after['category_id'],b['id']);self.assertEqual(after['revision'],before['revision']+1);self.assertTrue(out['changed']);self.assertEqual(self.category2(a['id']),a)
  for table,text in links.items():self.assertEqual(self.sql('select jsonb_agg(to_jsonb(x)order by person_id)from public.'+table+' x where item_id='+lit(item)),text)
 def test_f06_same_category_move_appends_only_receipt(self):
  c=self.empty();item=self.bound(self.bound_args(c))['target_id'];a=self.bound_args(c,'category-item-move',item);before=self.foundation();r=self.bound(a);after=self.foundation();self.assertFalse(r['changed']);self.assertEqual(r['collection_revision'],a[6]);after['old']['packing']['receipts']=before['old']['packing']['receipts'];self.assertEqual(after,before)
 def test_f07_move_and_create_retain_known_historical_identity(self):
  for action in ['category-item-create','category-item-move']:
   label='Historical '+action;cid=self.sql('insert into public.packing_categories(trip_id,name,retained_when_empty)values('+lit(self.trip)+','+lit(label)+',false)returning id');c=self.lookup2(label)['category'];target=self.create(category='Source')['id']if action.endswith('move')else None
   r=self.bound(self.bound_args(c,action,target));self.assertEqual(r['category']['id'],cid);self.assertTrue(r['category']['retained_when_empty']);self.assertEqual(r['category']['revision'],c['revision']+1);self.assertEqual(self.category(r['target_id']),cid)
 def test_f08_raw_default_unicode_and_literal_sentinel_content(self):
  for name in ['', 'Other',' Gear ','gear','é','e\u0301','__proto__','😀'*200]:
   item=self.create(category=name);c=self.category2(self.category(item['id']));r=self.bound(self.bound_args(c,values={'name':'...'}));self.assertEqual(r['item']['category'],name);self.assertEqual(r['item']['name'],'...');self.assertEqual(self.category(r['target_id']),c['id'])
 def test_f09_category_name_or_privacy_cannot_be_overridden_in_values(self):
  c=self.empty()
  for values in [{'name':'x','category':'Other'},{'name':'x','visibility':'personal'},{'name':'x','owner_person_id':self.person},{'name':'x','category_id':str(uuid.uuid4())},{'name':'x','revision':10}]:self.bound_no_effect(self.bound_args(c,values=values),'22023')
 def test_f10_move_values_cannot_edit_content_or_sharing(self):
  c=self.empty();item=self.bound(self.bound_args(c))['target_id']
  for values in [{'name':'Wrong'},{'quantity':2},{'bag_id':None},{'owner_person_id':self.person},{'is_private':True}]:self.bound_no_effect(self.bound_args(c,'category-item-move',item,values),'22023')
 def test_f11_invalid_numbers_names_packed_states_and_bags_are_atomic(self):
  c=self.empty()
  for values in [{'name':''},{'name':'x','quantity':True},{'name':'x','quantity':1.5},{'name':'x','quantity':0},{'name':'x','quantity':10001},{'name':'x','weight_grams':-1},{'name':'x','packed_quantity':2},{'name':'x','checked':True,'packed_quantity':None},{'name':'x','bag_id':'invalid'}]:self.bound_no_effect(self.bound_args(c,values=values),'22023')
  bag=self.bag(self.new_trip('Foreign bag'));self.bound_no_effect(self.bound_args(c,values={'name':'x','bag_id':bag}),'23503')
 def test_f12_counts_checkbox_and_nullable_fields_match_v1_creation(self):
  c=self.empty()
  for values,checked,partial in [({'name':'A','quantity':3,'packed_quantity':3},True,None),({'name':'B','quantity':3,'packed_quantity':None},False,None),({'name':'C','checked':True,'bag_id':None,'weight_grams':None},True,None)]:
   r=self.bound(self.bound_args(c,values=values));self.assertEqual((r['item']['checked'],r['item']['packed_quantity']),(checked,partial));self.assertEqual(r['item']['revision'],1)
 def test_f13_safe_revision_and_collection_inputs_are_required(self):
  c=self.empty();a=self.bound_args(c)
  for index,value in [(5,1),(6,None),(6,-1),(6,9007199254740992),(0,None),(1,None),(4,None),(7,None)]:
   b=copy.deepcopy(a);b[index]=value;self.bound_no_effect(b,'22023')
  item=self.bound(a)['target_id'];a=self.bound_args(c,'category-item-move',item)
  for val in [None,0,-1,9007199254740992]:b=copy.deepcopy(a);b[5]=val;self.bound_no_effect(b,'22023')
 def test_f14_exact_full_category_observation_is_required(self):
  c=self.empty();a=self.bound_args(c)
  for key,value in [('name','Other'),('revision',2),('sort_order',7),('retained_when_empty',False),('created_at','2026-01-01T00:00:00+00:00')]:
   b=copy.deepcopy(a);b[8][key]=value;self.bound_no_effect(b,'PT409')
  for key,value in [('extra',True),('revision',1.5),('sort_order',True),('assignments',None)]:
   b=copy.deepcopy(a);b[8][key]=value;self.bound_no_effect(b,'22023')
  b=copy.deepcopy(a);del b[8]['updated_at'];self.bound_no_effect(b,'22023')
  b=copy.deepcopy(a);b[8]['name']='x'*262145;self.bound_no_effect(b,'54000')
  b=copy.deepcopy(a);b[9]={'name':'x'*65537};self.bound_no_effect(b,'22023')
  b=copy.deepcopy(a);b[2]['layer']='myDraft';self.bound_no_effect(b,'PT409')
  b=copy.deepcopy(a);b[2]['unknown']='x';self.bound_no_effect(b,'PT409')
 def test_f15_stale_collection_and_item_revision_refuse_without_rebase(self):
  a=self.empty('A');b=self.empty('B');args=self.bound_args(a);self.create(category='Else');self.bound_no_effect(args,'PT409');item=self.bound(self.bound_args(a))['target_id'];args=self.bound_args(b,'category-item-move',item);self.execute('update',{'name':'Current'},target=item);self.bound_no_effect(args,'PT409')
  args[6]=self.packet2()['collection_revision'];self.bound_no_effect(args,'PT409')
 def test_f16_renamed_or_dismissed_category_never_falls_back_by_old_label(self):
  c=self.empty();a=self.bound_args(c);self.cat(self.meta_for(c));self.bound_no_effect(a,'PT409');self.assertIsNone(self.lookup2()['category']);self.assertEqual(self.state()['items'],[])
  current=self.category2(c['id']);a=self.bound_args(current);self.dismiss(current);self.bound_no_effect(a,'PT409');self.assertEqual(self.state()['items'],[])
 def test_f17_unknown_foreign_trip_and_foreign_personal_categories_refuse(self):
  self.policy('trip.packing.manage','trip_travelers');c=self.empty();a=self.bound_args(c);a[7]=str(uuid.uuid4());self.bound_no_effect(a,'42501');peer=self.empty('Private','personal',self.editor);self.bound_no_effect(self.bound_args(peer),'42501')
  original=self.trip;self.trip=self.new_trip('Other category Trip');self.sql('insert into public.trip_travelers(trip_id,person_id)values('+lit(self.trip)+','+lit(self.person)+')');other=self.empty();self.trip=original;self.bound_no_effect(self.bound_args(other),'42501')
 def test_f18_read_shared_foreign_personal_item_and_category_grant_no_move(self):
  self.policy('trip.packing.manage','trip_travelers');own=self.empty('Own','personal');item=self.bound(self.bound_args(own))['target_id'];self.sql('insert into public.packing_item_contributors(trip_id,item_id,person_id)values('+','.join(map(lit,[self.trip,item,self.editor_person]))+')');peer=self.empty('Peer','personal',self.editor)
  self.bound_no_effect(self.bound_args(peer,'category-item-move',item,user=self.editor),'42501',self.editor);self.bound_no_effect(self.bound_args(own,user=self.editor),'42501',self.editor)
 def test_f19_cross_privacy_moves_are_explicitly_unsupported(self):
  common=self.empty('Common');own=self.empty('Own','personal');a=self.bound(self.bound_args(common))['target_id'];b=self.bound(self.bound_args(own))['target_id']
  self.bound_no_effect(self.bound_args(own,'category-item-move',a),'0A000');self.bound_no_effect(self.bound_args(common,'category-item-move',b),'0A000')
 def test_f20_own_personal_moves_keep_owner_and_private_links(self):
  a=self.empty('A','personal');b=self.empty('B','personal');i=self.bound(self.bound_args(a))['target_id'];old=self.row(i);r=self.bound(self.bound_args(b,'category-item-move',i));self.assertEqual(r['item']['owner_person_id'],self.person);self.assertTrue(r['item']['is_private']);self.assertEqual(r['item']['sort_order'],old['sort_order']);self.assertEqual(self.category(i),b['id'])
 def test_f21_historical_common_owner_is_preserved_as_common(self):
  a=self.empty('A');b=self.empty('B');i=self.bound(self.bound_args(a))['target_id'];self.sql('update public.packing_items set owner_person_id='+lit(self.person)+'where id='+lit(i));r=self.bound(self.bound_args(b,'category-item-move',i));self.assertFalse(r['item']['is_private']);self.assertEqual(r['item']['owner_person_id'],self.person)
 def test_f22_trash_cannot_be_moved_or_resurrected(self):
  a=self.empty('A');b=self.empty('B');i=self.bound(self.bound_args(a))['target_id'];self.execute('trash',target=i);self.bound_no_effect(self.bound_args(b,'category-item-move',i),'PT409');self.assertIsNotNone(self.row(i)['deleted_at'])
 def test_f23_same_uuid_with_another_observed_category_conflicts(self):
  a=self.empty('A');b=self.empty('B');args=self.bound_args(a);args[8]=b;self.bound_no_effect(args,'PT409')
 def test_f24_retry_returns_original_receipt_after_later_move_and_rename(self):
  a=self.empty('A');b=self.empty('B');args=self.bound_args(a);r=self.bound(args);self.bound(self.bound_args(b,'category-item-move',r['target_id']));self.cat(self.meta_for(a));before=self.foundation();self.assertEqual(self.bound(args),r);self.assertEqual(self.bound_receipt(args[1])['result'],r);self.assertEqual(self.foundation(),before);self.assertEqual(self.category(r['target_id']),b['id'])
 def test_f25_changed_intent_cannot_reuse_operation_id(self):
  c=self.empty();a=self.bound_args(c);self.bound(a)
  for index,value in [(4,str(uuid.uuid4())),(6,a[6]+1),(7,str(uuid.uuid4())),(9,{'name':'Other'}),(8,{**c,'name':'Other'})]:
   b=copy.deepcopy(a);b[index]=value;self.bound_no_effect(b,'PT409')
 def test_f26_all_receipt_domains_are_separate(self):
  c=self.empty();a=self.bound_args(c);self.bound(a)
  for name in ['get_family_trip_packing_receipt_v1','get_family_trip_packing_group_receipt_v1','get_family_trip_packing_category_receipt_v1','get_family_trip_packing_category_lifecycle_receipt_v2']:
   with self.assertRaisesRegex(RuntimeError,'22023'):self.rpc(name,[self.trip,a[1]])
  r=self.bound_receipt(str(uuid.uuid4()));self.assertEqual(r['status'],'unknown');self.assertIsNone(r['result']);self.assertFalse(r['result_redacted'])
 def test_f27_original_actor_only_and_known_redacted_result(self):
  self.policy('trip.packing.manage','trip_travelers');c=self.empty();a=self.bound_args(c);r=self.bound(a);self.assertEqual(self.bound_receipt(a[1],self.editor)['status'],'unknown')
  self.sql('update public.packing_items set is_private=true,owner_person_id='+lit(self.editor_person)+'where id='+lit(r['target_id']));before=self.foundation();receipt=self.bound_receipt(a[1]);self.assertEqual(receipt['status'],'committed');self.assertTrue(receipt['result_redacted']);self.assertIsNone(receipt['result']);self.bound_no_effect(a,'42501');self.assertEqual(self.foundation(),before)
 def test_f28_shared_operation_namespace_refuses_old_writers_both_directions(self):
  c=self.empty();a=self.bound_args(c);r=self.bound(a);item=r['target_id']
  for call in [lambda:self.rpc('execute_family_trip_packing_v1',self.args('update',{'name':'Old'},target=item,operation=a[1])),lambda:self.group(self.group_args(operation=a[1])),lambda:self.cat(self.cat_args(operation=a[1]))]:
   with self.assertRaisesRegex(RuntimeError,'PT409'):call()
  life=self.lifecycle_args('category-retain',target=c['id']);life[1]=a[1]
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.life(life)
  old=self.args('update',{'name':'Changed'},target=item);self.rpc('execute_family_trip_packing_v1',old);new=self.bound_args(c);new[1]=old[1];self.bound_no_effect(new,'PT409')
  with self.assertRaisesRegex(RuntimeError,'22023'):self.bound_receipt(old[1])
 def test_f29_direct_permission_propose_deny_and_stranger_refuse(self):
  self.policy('trip.packing.manage','trip_travelers');c=self.empty();a=self.bound_args(c,user=self.editor);self.policy('trip.packing.manage','patriarch','trip_travelers');self.bound_no_effect(a,'42501',self.editor);self.policy('trip.packing.manage');self.bound_no_effect(a,'42501',self.editor);self.bound_no_effect(self.bound_args(c),'42501',self.stranger)
 def test_f30_http_aal1_cannot_write_or_recover_receipt(self):
  c=self.empty();a=self.bound_args(c);code,b=self.http('POST','/auth/v1/token?grant_type=password',{'email':'p01-'+self.owner+'@fixture.invalid','password':'local-only'});self.assertEqual(code,200);token=json.loads(b)['access_token'];before=self.foundation();code,r=self.bound_http(a,token);self.assertEqual(code,403,r);code,_=self.http('POST','/rest/v1/rpc/get_family_trip_packing_category_item_receipt_v2',{'p_trip_id':self.trip,'p_operation_id':a[1]},token=token);self.assertEqual(code,403);self.assertEqual(self.foundation(),before)
 def test_f31_public_invokers_private_validator_and_raw_roles(self):
  signatures=['public.execute_family_trip_packing_category_item_v2(uuid,uuid,jsonb,text,uuid,bigint,bigint,uuid,jsonb,jsonb)','public.get_family_trip_packing_category_item_receipt_v2(uuid,uuid)']
  for sig in signatures:
   self.assertEqual(self.sql('select prosecdef from pg_proc where oid='+lit(sig)+'::regprocedure'),'f')
   for role in ['anon','service_role']:self.assertEqual(self.sql('select has_function_privilege('+lit(role)+','+lit(sig)+",'EXECUTE')"),'f')
  for role in ['anon','authenticated','service_role']:self.assertEqual(self.sql('select has_function_privilege('+lit(role)+",'family_auth.validate_category_bound_packing_request(text,jsonb,jsonb)','EXECUTE')"),'f');self.assertEqual(self.sql('select has_table_privilege('+lit(role)+",'family_auth.packing_command_receipts','SELECT,INSERT,UPDATE,DELETE')"),'f')
  c=self.empty();a=self.bound_args(c)
  for token in [self.anon,self.service]:code,r=self.bound_http(a,token);self.assertIn(code,[401,403])
 def test_f32_late_receipt_failure_rolls_back_new_item_and_retention(self):
  cid=self.sql('insert into public.packing_categories(trip_id,name,retained_when_empty)values('+lit(self.trip)+",'Historical',false)returning id");a=self.bound_args(self.category2(cid));before=self.foundation();claims=json.dumps({'sub':self.owner,'role':'authenticated','aal':'aal2'})
  stmt="begin;alter table family_auth.packing_command_receipts add constraint c3b1_late_failure check(action<>'category-item-create')not valid;do $auth$begin perform set_config('request.jwt.claims',"+lit(claims)+",true);end $auth$;set local role authenticated;"+self.bound_statement(a)+';commit;'
  with self.assertRaisesRegex(RuntimeError,'23514'):self.sql(stmt)
  self.assertEqual(self.foundation(),before)
 def test_f33_late_move_failure_keeps_all_item_fields_and_provenance(self):
  a=self.empty('A');b=self.empty('B');i=self.bound(self.bound_args(a))['target_id'];args=self.bound_args(b,'category-item-move',i);before=self.foundation();claims=json.dumps({'sub':self.owner,'role':'authenticated','aal':'aal2'})
  stmt="begin;alter table family_auth.packing_command_receipts add constraint c3b1_late_failure check(action<>'category-item-move')not valid;do $auth$begin perform set_config('request.jwt.claims',"+lit(claims)+",true);end $auth$;set local role authenticated;"+self.bound_statement(args)+';commit;'
  with self.assertRaisesRegex(RuntimeError,'23514'):self.sql(stmt)
  self.assertEqual(self.foundation(),before)
 def test_f34_item_rank_and_collection_overflow_refuse(self):
  c=self.empty();i=self.bound(self.bound_args(c))['target_id'];self.sql('update public.packing_items set sort_order=2147483647 where id='+lit(i));self.bound_no_effect(self.bound_args(c),'54000')
  self.sql('update public.packing_items set sort_order=0 where id='+lit(i));self.sql('update family_auth.trip_packing_state set collection_revision=9007199254740991 where trip_id='+lit(self.trip));self.bound_no_effect(self.bound_args(c),'54000')
 def test_f35_item_revision_overflow_cannot_publish_unsafe_ack(self):
  a=self.empty('A');b=self.empty('B');i=self.bound(self.bound_args(a))['target_id'];self.sql('begin;alter table public.packing_items disable trigger ab_packing_v1_version;update public.packing_items set revision=9007199254740991 where id='+lit(i)+';alter table public.packing_items enable trigger ab_packing_v1_version;commit;');self.bound_no_effect(self.bound_args(b,'category-item-move',i),'54000')
 def test_f36_actual_snapshot_size_bound_rolls_back_create(self):
  c=self.empty();scope=self.packet2()['scope'];self.sql('insert into public.packing_bags(trip_id,name)values('+lit(self.trip)+",repeat('x',8388608))");a=[self.trip,str(uuid.uuid4()),scope,'category-item-create',str(uuid.uuid4()),None,int(self.sql('select collection_revision from family_auth.trip_packing_state where trip_id='+lit(self.trip))),c['id'],c,{'name':'Bound'}];self.bound_no_effect(a,'54000')
 def test_f37_concurrent_identical_submission_commits_once(self):
  c=self.empty();a=self.bound_args(c)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:r=list(pool.map(lambda _:self.bound(a),range(2)))
  self.assertEqual(r[0],r[1]);self.assertEqual(len(self.state()['items']),1)
 def test_f38_concurrent_distinct_intents_have_one_original_winner(self):
  c=self.empty();a=self.bound_args(c);b=self.bound_args(c)
  def run(v):
   try:return self.bound(v)
   except RuntimeError as e:return str(e)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:r=list(pool.map(run,[a,b]))
  self.assertEqual(sum(isinstance(x,dict)for x in r),1);self.assertIn('PT409',next(x for x in r if isinstance(x,str)))
 def test_f39_rename_first_then_create_refuses_old_category_observation(self):
  c=self.empty();a=self.bound_args(c);rename=self.meta_for(c)
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.cat_statement(rename))as pid:f=pool.submit(self.bound,a);self.wait_for_lock(a[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertIsNone(self.lookup2()['category']);self.assertEqual(self.state()['items'],[])
 def test_f40_create_first_then_rename_refuses_stale_metadata(self):
  c=self.empty();a=self.bound_args(c);rename=self.meta_for(c)
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.bound_statement(a))as pid:f=pool.submit(self.cat,rename);self.wait_for_lock(rename[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertEqual(self.category(a[4]),c['id']);self.assertEqual(self.lookup2()['category']['name'],'Empty')
 def test_f41_rename_first_then_move_cannot_recreate_the_old_name(self):
  a=self.empty('A');b=self.empty('B');i=self.bound(self.bound_args(a))['target_id'];args=self.bound_args(b,'category-item-move',i);rename=self.meta_for(b)
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.cat_statement(rename))as pid:f=pool.submit(self.bound,args);self.wait_for_lock(args[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertEqual(self.category(i),a['id']);self.assertIsNone(self.lookup2('B')['category'])
 def test_f42_dismiss_first_then_create_or_move_never_hides_live_child(self):
  for action in ['category-item-create','category-item-move']:
   c=self.empty(action);i=self.create(category='Source')['id']if action.endswith('move')else None;args=self.bound_args(c,action,i);dismiss=self.lifecycle_args('category-dismiss-empty',target=c['id'])
   with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
    with self.held_authenticated_command(self.life_statement(dismiss))as pid:f=pool.submit(self.bound,args);self.wait_for_lock(args[1],pid)
    with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
   self.assertEqual(self.sql('select count(*)from public.packing_items where category_id='+lit(c['id'])+'and deleted_at is null'),'0')
 def test_f43_create_first_then_dismiss_refuses_stale_original(self):
  c=self.empty();args=self.bound_args(c);dismiss=self.lifecycle_args('category-dismiss-empty',target=c['id'])
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.bound_statement(args))as pid:f=pool.submit(self.life,dismiss);self.wait_for_lock(dismiss[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertIsNone(self.category2(c['id'])['deleted_at'])
 def test_f44_last_item_trash_first_refuses_a_waiting_move(self):
  a=self.empty('A');b=self.empty('B');i=self.bound(self.bound_args(a))['target_id'];args=self.bound_args(b,'category-item-move',i);trash=self.args('trash',target=i)
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.command_statement(trash))as pid:f=pool.submit(self.bound,args);self.wait_for_lock(args[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertIsNotNone(self.row(i)['deleted_at']);self.assertEqual(self.category(i),a['id'])
 def test_f45_assignment_change_while_waiting_refuses_original_provenance(self):
  c=self.empty();args=self.bound_args(c);meta=self.meta_for(c,'category-assignees',{'person_ids':[self.viewer_person]})
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.cat_statement(meta))as pid:f=pool.submit(self.bound,args);self.wait_for_lock(args[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertEqual(self.state()['items'],[])
 def test_f46_permission_and_membership_are_rechecked_after_wait(self):
  for kind in ['permission','membership']:
   self.policy('trip.packing.manage','trip_travelers');c=self.empty(kind);args=self.bound_args(c,user=self.editor)
   try:
    with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
     with self.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(self.trip)+"::text,0))")as pid:
      f=pool.submit(self.bound,args,self.editor);self.wait_for_lock(args[1],pid)
      if kind=='permission':self.policy('trip.packing.manage')
      else:self.sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.editor))
     with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=15)
   finally:self.sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.editor))
 def test_f47_root_trash_while_waiting_retires_the_original_scope(self):
  c=self.empty();args=self.bound_args(c);rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)))
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command('select public.trash_family_trip('+lit(self.trip)+','+str(rev)+')')as pid:f=pool.submit(self.bound,args);self.wait_for_lock(args[1],pid)
   with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=15)
 def test_f48_typed_receipt_item_link_is_generated_and_result_checked(self):
  c=self.empty();args=self.bound_args(c);r=self.bound(args);self.assertEqual(self.sql('select category_bound_item_id from family_auth.packing_command_receipts where operation_id='+lit(args[1])),r['target_id'])
  self.assertEqual(self.sql("select attgenerated from pg_attribute where attrelid='family_auth.packing_command_receipts'::regclass and attname='category_bound_item_id'"),'s')
  with self.assertRaisesRegex(RuntimeError,'428C9'):self.sql('update family_auth.packing_command_receipts set category_bound_item_id='+lit(str(uuid.uuid4()))+'where operation_id='+lit(args[1]))
  new=str(uuid.uuid4());statement='insert into family_auth.packing_command_receipts(trip_id,actor_user_id,actor_person_id,operation_id,action,target_id,category_id,request_sha256,before_state,after_state,result)select trip_id,actor_user_id,actor_person_id,'+lit(new)+",action,target_id,category_id,request_sha256,before_state,after_state,result||jsonb_build_object('operation_id',"+lit(new)+",'kind','wrong')from family_auth.packing_command_receipts where operation_id="+lit(args[1])
  before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'23514'):self.sql(statement)
  self.assertEqual(self.foundation(),before)
  original=self.trip;self.trip=self.new_trip('Receipt foreign Trip');self.sql('insert into public.trip_travelers(trip_id,person_id)values('+lit(self.trip)+','+lit(self.person)+')');foreign=self.empty('Foreign');foreign_trip=self.trip;self.trip=original
  new=str(uuid.uuid4());wrong=copy.deepcopy(r);wrong.update(trip_id=foreign_trip,operation_id=new);wrong['item']['trip_id']=foreign_trip;wrong['category']=foreign
  sql='insert into family_auth.packing_command_receipts(trip_id,actor_user_id,actor_person_id,operation_id,action,target_id,category_id,request_sha256,before_state,after_state,result)select '+lit(foreign_trip)+',actor_user_id,actor_person_id,'+lit(new)+',action,target_id,'+lit(foreign['id'])+',request_sha256,before_state,after_state,'+lit(json.dumps(wrong))+'::jsonb from family_auth.packing_command_receipts where operation_id='+lit(args[1])
  with self.assertRaisesRegex(RuntimeError,'23503'):self.sql(sql)
 def test_f49_explicit_id_trigger_refuses_mismatched_label_without_resolving(self):
  a=self.empty('A');b=self.empty('B');item=self.bound(self.bound_args(a))['target_id'];before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'23503'):self.sql('update public.packing_items set category_id='+lit(b['id'])+",category='Wrong'where id="+lit(item))
  self.assertEqual(self.foundation(),before);self.assertIsNone(self.lookup2('Wrong')['category'])
 def test_f50_old_receipt_digests_and_result_bodies_are_unchanged(self):
  c=self.empty();i=self.create(category='Legacy');old=self.args('update',{'name':'Old'},target=i['id']);self.rpc('execute_family_trip_packing_v1',old);before=self.sql('select to_jsonb(r)from family_auth.packing_command_receipts r where operation_id='+lit(old[1]));self.bound(self.bound_args(c));self.assertEqual(self.sql('select to_jsonb(r)from family_auth.packing_command_receipts r where operation_id='+lit(old[1])),before)
 def test_f51_actual_logout_refuses_new_writer_and_receipt(self):
  fixture=type('BoundLogoutFixture',(CategoryBound,),{});fixture.setUpClass();c=fixture();c.setUp();category=c.empty();args=c.bound_args(category);before=c.foundation();token=c.token;code,b=c.http('POST','/auth/v1/logout?scope=local',{},token=token);self.assertEqual(code,204,b[:100]);code,r=c.bound_http(args,token);self.assertEqual(code,403,r);code,_=c.http('POST','/rest/v1/rpc/get_family_trip_packing_category_item_receipt_v2',{'p_trip_id':c.trip,'p_operation_id':args[1]},token=token);self.assertEqual(code,403);self.assertEqual(c.foundation(),before)
 def test_f52_real_session_expiry_after_http_wait_refuses_and_rolls_back(self):
  import base64,time
  fixture=type('BoundExpiryFixture',(CategoryBound,),{});fixture.setUpClass();c=fixture();c.setUp();category=c.empty();args=c.bound_args(category);before=c.foundation();session=json.loads(base64.urlsafe_b64decode(c.token.split('.')[1]+'=='))['session_id'];c.sql('update auth.sessions set not_after=clock_timestamp()+interval \'1 minute\'where id='+lit(session))
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with c.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(c.trip)+"::text,0))")as pid:
    f=pool.submit(c.bound_http,args);deadline=time.monotonic()+10;waiting=False
    while time.monotonic()<deadline:
     waiting=c.sql("select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid()and position('execute_family_trip_packing_category_item_v2'in query)>0 and "+str(pid)+'=any(pg_blocking_pids(pid)))')=='t'
     if waiting:break
     time.sleep(.05)
    self.assertTrue(waiting);c.sql('update auth.sessions set not_after=clock_timestamp()+interval \'200 milliseconds\'where id='+lit(session));time.sleep(.3)
   code,r=f.result(timeout=15);self.assertEqual(code,403,r)
  self.assertEqual(c.foundation(),before)
 def test_f53_original_item_and_category_facts_survive_root_recovery(self):
  a=self.empty('A');b=self.empty('B');r=self.bound(self.bound_args(a));self.bound(self.bound_args(b,'category-item-move',r['target_id']));before=self.foundation();rev=before['root']['revision'];self.rpc('trash_family_trip',[self.trip,rev]);rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)));self.rpc('restore_family_trip',[self.trip,rev]);after=self.foundation()
  self.assertEqual(after['categories'],before['categories']);self.assertEqual(after['assignments'],before['assignments']);old_packing=before['old']['packing'];new_packing=after['old']['packing'];self.assertEqual({k:v for k,v in new_packing.items()if k!='state'},{k:v for k,v in old_packing.items()if k!='state'});self.assertEqual(new_packing['state']['trip_lifecycle_revision'],old_packing['state']['trip_lifecycle_revision']+2);self.assertGreater(new_packing['state']['collection_revision'],old_packing['state']['collection_revision']);self.assertEqual(self.bound_receipt(r['operation_id'])['result'],r)
 def test_f54_ineligible_responsibility_history_and_last_source_retention_survive_move(self):
  a=self.empty('A');b=self.empty('B');self.assign(b['id'],provenance=True);self.sql('update public.people set archived_at=now()where id='+lit(self.viewer_person))
  try:
   i=self.bound(self.bound_args(a))['target_id'];c=self.category2(b['id']);r=self.bound(self.bound_args(c,'category-item-move',i));self.assertEqual(r['category']['assignments'],c['assignments']);self.assertEqual(self.category2(a['id']),a);self.assertIn(a['id'],{x['id']for x in self.packet2()['categories']})
  finally:self.sql('update public.people set archived_at=null where id='+lit(self.viewer_person))
 def test_f55_row_count_bound_includes_hidden_items(self):
  c=self.empty();self.sql('insert into public.packing_items(trip_id,name,category,is_private,owner_person_id)select '+lit(self.trip)+",'Hidden'||n,'Private',true,"+lit(self.editor_person)+'from generate_series(1,2000)n');self.assertEqual(self.state()['items'],[]);self.bound_no_effect(self.bound_args(c),'54000')
