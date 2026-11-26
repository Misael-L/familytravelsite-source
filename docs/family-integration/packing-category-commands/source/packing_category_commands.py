"""U04-C2b actual local role/Auth/HTTP and concurrency category-command regressions."""
import concurrent.futures,copy,json,time,uuid
from packing_categories import CategoryFoundation,lit

class CategoryCommands(CategoryFoundation):
 def cat_args(self,action='category-rename',values=None,category=None,user=None,operation=None):
  p=self.packet(user);c=next(c for c in p['categories']if category is None or c['id']==category)
  return [self.trip,operation or str(uuid.uuid4()),p['scope'],action,p['collection_revision'],c,values if values is not None else {'name':'Renamed'}]
 def cat(self,args,user=None):return self.rpc('execute_family_trip_packing_category_v1',args,user)
 def cat_receipt(self,op,user=None):return self.rpc('get_family_trip_packing_category_receipt_v1',[self.trip,op],user)
 def cat_statement(self,args):
  return 'select public.execute_family_trip_packing_category_v1('+','.join('null'if x is None else str(x)if isinstance(x,int)else lit(json.dumps(x))+'::jsonb'if isinstance(x,(dict,list))else lit(x)for x in args)+')'
 def cat_http(self,args,token=None):
  names=['p_trip_id','p_operation_id','p_scope','p_action','p_expected_collection_revision','p_observed_category','p_values']
  code,body=self.http('POST','/rest/v1/rpc/execute_family_trip_packing_category_v1',dict(zip(names,args)),token=token)
  return code,json.loads(body)
 def no_effect(self,args,pattern,user=None):
  before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,pattern):self.cat(args,user)
  self.assertEqual(self.foundation(),before)
 def test_c30_menus_remain_gated_no_new_category_write_endpoint_or_raw_grants(self):
  # Supersedes only the earlier121 endpoint-absence expectation. No application activation in this server packet.
  self.assertEqual(self.sql("select to_regprocedure('public.execute_family_trip_packing_category_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb)')is not null"),'t')
  for role in ['anon','authenticated','service_role']:
   for table in ['packing_categories','packing_category_assignments']:
    self.assertEqual(self.sql('select has_table_privilege('+lit(role)+','+lit('public.'+table)+",'SELECT,INSERT,UPDATE,DELETE')"),'f')
  self.assertEqual(self.sql("select prosecdef from pg_proc where oid='public.get_family_trip_packing_with_categories_v1(uuid)'::regprocedure"),'f')
 def test_d01_http_rename_returns_exact_committed_shape_and_final_facts(self):
  a=self.create(category='Gear');b=self.create(category='Gear');args=self.cat_args();code,r=self.cat_http(args);self.assertEqual(code,200,r)
  self.assertEqual(set(r),{'version','kind','trip_id','operation_id','scope','action','values','collection_revision','category','changed_item_revisions'})
  self.assertEqual(r['kind'],'packing-category');self.assertEqual(r['category']['id'],args[5]['id']);self.assertEqual(r['category']['name'],'Renamed')
  self.assertEqual(r['category'],self.packet()['categories'][0]);self.assertEqual(r['collection_revision'],self.packet()['collection_revision'])
  self.assertEqual(r['changed_item_revisions'],[{'item_id':x,'revision':self.row(x)['revision']}for x in sorted([a['id'],b['id']])])
 def test_d02_assignment_set_difference_preserves_provenance_and_records_actor(self):
  a=self.create(category='Gear');cat=self.category(a['id']);self.assign(cat,provenance=True);prior=self.packet()['categories'][0]['assignments'][0]
  args=self.cat_args('category-assignees',{'person_ids':sorted([self.viewer_person,self.editor_person])});r=self.cat(args)
  self.assertEqual(next(x for x in r['category']['assignments']if x['person_id']==self.viewer_person),prior)
  added=next(x for x in r['category']['assignments']if x['person_id']==self.editor_person);self.assertEqual(added['assigned_by_person_id'],self.person);self.assertIsNotNone(added['assigned_at'])
  self.assertEqual(r['changed_item_revisions'],[]);self.assertEqual(self.state()['category_assignees'],{'Gear':sorted([self.viewer_person,self.editor_person])})
 def test_d03_rename_noop_only_appends_one_receipt(self):
  self.create(category='Gear');args=self.cat_args(values={'name':'Gear'});before=self.foundation();r=self.cat(args);after=self.foundation()
  self.assertEqual(r['changed_item_revisions'],[]);self.assertEqual(r['collection_revision'],args[4]);self.assertEqual(r['category'],args[5])
  after['old']['packing']['receipts']=before['old']['packing']['receipts'];self.assertEqual(after,before)
  self.assertEqual(self.sql('select count(*)from family_auth.packing_command_receipts where operation_id='+lit(args[1])),'1')
 def test_d04_assignment_noop_preserves_unknown_and_ineligible_history(self):
  a=self.create(category='Gear');self.assign(self.category(a['id']));self.sql('update public.people set archived_at=now()where id='+lit(self.viewer_person))
  try:
   args=self.cat_args('category-assignees',{'person_ids':[self.viewer_person]});before=self.foundation();r=self.cat(args);after=self.foundation()
   self.assertEqual(r['category'],args[5]);self.assertIsNone(r['category']['assignments'][0]['assigned_at']);after['old']['packing']['receipts']=before['old']['packing']['receipts'];self.assertEqual(after,before)
  finally:self.sql('update public.people set archived_at=null where id='+lit(self.viewer_person))
 def test_d05_identical_retry_and_lost_reply_return_one_original_receipt(self):
  self.create(category='Gear');args=self.cat_args();first=self.cat(args);before=self.foundation();self.assertEqual(self.cat(args),first);self.assertEqual(self.foundation(),before)
  code,b=self.http('POST','/rest/v1/rpc/get_family_trip_packing_category_receipt_v1',{'p_trip_id':self.trip,'p_operation_id':args[1]});self.assertEqual(code,200);r=json.loads(b);self.assertEqual(r['status'],'committed');self.assertFalse(r['result_redacted']);self.assertEqual(r['result'],first)
 def test_d06_historical_retry_does_not_publish_or_overwrite_later_name(self):
  self.create(category='Gear');args=self.cat_args();old=self.cat(args);self.cat(self.cat_args(values={'name':'Current'}));before=self.foundation()
  self.assertEqual(self.cat(args),old);self.assertEqual(self.cat_receipt(args[1])['result'],old);self.assertEqual(self.foundation(),before);self.assertEqual(self.packet()['categories'][0]['name'],'Current')
 def test_d07_changed_intent_original_values_action_or_scope_conflicts(self):
  self.create(category='Gear');args=self.cat_args();self.cat(args)
  for index,value in [(6,{'name':'Different'}),(3,'category-assignees'),(4,args[4]+1),(5,{**args[5],'name':'Changed'}),(2,{**args[2],'layer':'myDraft'})]:
   bad=copy.deepcopy(args);bad[index]=value
   if index==3:bad[6]={'person_ids':[]}
   self.no_effect(bad,'PT409')
 def test_d08_item_group_category_namespace_is_shared_both_directions(self):
  item=self.create(category='Gear');old=self.args('update',{'name':'Old item'},target=item['id']);self.rpc('execute_family_trip_packing_v1',old)
  args=self.cat_args(operation=old[1]);self.no_effect(args,'PT409')
  group=self.group_args();self.group(group);self.no_effect(self.cat_args(operation=group[1]),'PT409')
  category=self.cat_args();self.cat(category)
  for call in [lambda:self.rpc('execute_family_trip_packing_v1',self.args('update',{'name':'Wrong'},target=item['id'],operation=category[1])),lambda:self.group(self.group_args(operation=category[1],categories=['Renamed']))]:
   with self.assertRaisesRegex(RuntimeError,'PT409'):call()
 def test_d09_wrong_receipt_domains_refuse_and_unknown_stays_unknown(self):
  a=self.create(category='Gear');args=self.cat_args();self.cat(args)
  for name in ['get_family_trip_packing_receipt_v1','get_family_trip_packing_group_receipt_v1']:
   with self.assertRaisesRegex(RuntimeError,'22023'):self.rpc(name,[self.trip,args[1]])
  item=self.args('update',{'name':'Item'},target=a['id']);self.rpc('execute_family_trip_packing_v1',item)
  group=self.group_args(categories=['Renamed']);self.group(group)
  for op in [item[1],group[1]]:
   with self.assertRaisesRegex(RuntimeError,'22023'):self.cat_receipt(op)
  r=self.cat_receipt(str(uuid.uuid4()));self.assertEqual(r['status'],'unknown');self.assertIsNone(r['result']);self.assertFalse(r['result_redacted'])
 def test_d10_stale_collection_conflicts_even_when_category_unchanged(self):
  self.create(category='Gear');args=self.cat_args();self.create(category='Other');self.no_effect(args,'PT409')
 def test_d11_every_original_category_fact_and_provenance_is_compared(self):
  a=self.create(category='Gear');self.assign(self.category(a['id']),provenance=True);base=self.cat_args()
  for key,val in [('name','Wrong'),('revision',base[5]['revision']+1),('created_at','2026-01-01T00:00:00+00:00'),('updated_at','2026-01-01T00:00:00+00:00'),('assignments',[])]:
   bad=copy.deepcopy(base);bad[5][key]=val;self.no_effect(bad,'PT409')
  bad=copy.deepcopy(base);bad[5]['assignments'][0]['assigned_by_person_id']=self.editor_person;self.no_effect(bad,'PT409')
 def test_d12_target_collision_is_409_never_merge(self):
  a=self.create(category='A');b=self.create(category='B');self.assign(self.category(a['id']),provenance=True);self.no_effect(self.cat_args(category=self.category(a['id']),values={'name':'B'}),'PT409')
  self.assertNotEqual(self.category(a['id']),self.category(b['id']))
 def test_d13_raw_unicode_spaces_case_and_reserved_names_remain_exact(self):
  self.create(category='Gear')
  for name in [' Gear ','gear','__proto__','constructor','é','e\u0301','😀'*200]:
   r=self.cat(self.cat_args(values={'name':name}));self.assertEqual(r['category']['name'],name)
  self.no_effect(self.cat_args(values={'name':'😀'*201}),'22023');self.no_effect(self.cat_args(values={'name':''}),'22023')
 def test_d14_personal_rename_never_changes_same_label_common_or_peer(self):
  self.policy('trip.packing.manage','trip_travelers');common=self.create(category='Gear');own=self.create(category='Gear',visibility='personal');peer=self.create(user=self.editor,category='Gear',visibility='personal')
  before_common=self.row(common['id']);before_peer=self.row(peer['id']);r=self.cat(self.cat_args(category=self.category(own['id'])))
  self.assertEqual(self.row(common['id']),before_common);self.assertEqual(self.row(peer['id']),before_peer);self.assertEqual(r['category']['owner_person_id'],self.person)
 def test_d15_shared_foreign_personal_category_has_no_metadata_authority(self):
  self.policy('trip.packing.manage','trip_travelers');a=self.create(category='Shared',visibility='personal');b=self.create(category='Shared',visibility='personal')
  self.sql('insert into public.packing_item_contributors(trip_id,item_id,person_id)values('+','.join(map(lit,[self.trip,a['id'],self.editor_person]))+')')
  args=self.cat_args(user=self.editor);self.no_effect(args,'42501',self.editor);self.assertNotIn(b['id'],json.dumps(self.packet(self.editor)))
 def test_d16_personal_assignment_endpoint_is_explicitly_unsupported(self):
  self.create(category='Private',visibility='personal');self.no_effect(self.cat_args('category-assignees',{'person_ids':[]}), '0A000')
 def test_d17_guessing_foreign_trip_or_hidden_category_never_widens_scope(self):
  self.create(category='Gear');args=self.cat_args();args[5]['id']=str(uuid.uuid4());self.no_effect(args,'42501')
  args=self.cat_args();args[5]['trip_id']=str(uuid.uuid4());self.no_effect(args,'PT409')
  self.no_effect(self.cat_args(),'42501',self.stranger)
 def test_d18_propose_and_denied_permissions_refuse_real_commands(self):
  self.create(category='Gear');args=self.cat_args(user=self.editor)
  self.policy('trip.packing.manage','patriarch','trip_travelers');self.no_effect(args,'42501',self.editor)
  self.policy('trip.packing.manage');self.no_effect(args,'42501',self.editor)
 def test_d19_real_aal1_owner_http_write_and_receipt_are_denied(self):
  self.create(category='Gear');args=self.cat_args();code,b=self.http('POST','/auth/v1/token?grant_type=password',{'email':'p01-'+self.owner+'@fixture.invalid','password':'local-only'});self.assertEqual(code,200);token=json.loads(b)['access_token']
  before=self.foundation();code,r=self.cat_http(args,token);self.assertEqual(code,403,r)
  code,_=self.http('POST','/rest/v1/rpc/get_family_trip_packing_category_receipt_v1',{'p_trip_id':self.trip,'p_operation_id':args[1]},token=token);self.assertEqual(code,403);self.assertEqual(self.foundation(),before)
 def test_d20_revoked_membership_precedes_retry_and_receipt(self):
  self.create(category='Gear');args=self.cat_args();self.cat(args);self.sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
  try:
   self.no_effect(args,'42501')
   code,_=self.cat_http(args);self.assertEqual(code,403)
   with self.assertRaisesRegex(RuntimeError,'42501'):self.cat_receipt(args[1])
  finally:self.sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
 def test_d21_new_assignee_requires_current_active_trip_and_family(self):
  self.create(category='Gear');self.sql('delete from public.trip_travelers where trip_id='+lit(self.trip)+'and person_id='+lit(self.viewer_person));self.no_effect(self.cat_args('category-assignees',{'person_ids':[self.viewer_person]}),'22023')
  self.no_effect(self.cat_args('category-assignees',{'person_ids':[str(uuid.uuid4())]}),'22023')
 def test_d22_historical_ineligible_assignment_can_be_kept_removed_not_readded(self):
  a=self.create(category='Gear');self.assign(self.category(a['id']),provenance=True);self.sql('update public.people set archived_at=now()where id='+lit(self.viewer_person))
  try:
   r=self.cat(self.cat_args('category-assignees',{'person_ids':sorted([self.viewer_person,self.editor_person])}));self.assertEqual(len(r['category']['assignments']),2)
   self.cat(self.cat_args('category-assignees',{'person_ids':[self.editor_person]}));self.no_effect(self.cat_args('category-assignees',{'person_ids':sorted([self.editor_person,self.viewer_person])}),'22023')
  finally:self.sql('update public.people set archived_at=null where id='+lit(self.viewer_person))
 def test_d23_guest_without_auth_can_be_assigned_without_granting_access(self):
  self.create(category='Gear');guest=self.guest();self.sql('insert into public.trip_travelers(trip_id,person_id)values('+lit(self.trip)+','+lit(guest)+')');r=self.cat(self.cat_args('category-assignees',{'person_ids':[guest]}))
  self.assertEqual(r['category']['assignments'][0]['person_id'],guest);self.assertEqual(self.sql('select user_id is null from public.people where id='+lit(guest)),'t');self.assertEqual(self.sql('select count(*)from public.family_members where family_id='+lit(self.family)),'3')
 def test_d24_invalid_assignment_is_validated_before_removing_existing(self):
  a=self.create(category='Gear');self.assign(self.category(a['id']),provenance=True);self.no_effect(self.cat_args('category-assignees',{'person_ids':[str(uuid.uuid4())]}),'22023')
 def test_d25_extra_missing_wrong_type_and_noncanonical_payloads_refuse(self):
  self.create(category='Gear');base=self.cat_args()
  bads=[]
  for val in [{},{'name':False},{'name':'Okay','extra':1},None]:
   b=copy.deepcopy(base);b[6]=val;bads.append(b)
  for key,val in [('extra','x'),('revision',1.5),('revision',True),('id','NOT-UUID'),('owner_person_id',False),('created_at','infinity'),('assignments',{})]:
   b=copy.deepcopy(base);b[5][key]=val;bads.append(b)
  b=copy.deepcopy(base);del b[5]['updated_at'];bads.append(b)
  for b in bads:self.no_effect(b,'22023')
  for ids in [[self.person,self.person],sorted([self.person,self.editor_person],reverse=True),['bad'],[False]]:
   self.no_effect(self.cat_args('category-assignees',{'person_ids':ids}),'22023')
 def test_d26_assignment_original_order_and_paired_provenance_are_strict(self):
  a=self.create(category='Gear');self.assign(self.category(a['id']),provenance=True);self.assign(self.category(a['id']),self.editor_person);base=self.cat_args()
  bad=copy.deepcopy(base);bad[5]['assignments'].reverse();self.no_effect(bad,'22023')
  bad=copy.deepcopy(base);bad[5]['assignments'][0]['extra']=1;self.no_effect(bad,'22023')
  bad=copy.deepcopy(base);bad[5]['assignments'][0]['assigned_at']=None;bad[5]['assignments'][0]['assigned_by_person_id']=self.person;self.no_effect(bad,'22023')
 def test_d27_request_assignment_and_safe_integer_bounds_refuse(self):
  self.create(category='Gear');args=self.cat_args('category-assignees',{'person_ids':[str(uuid.uuid4())for _ in range(2001)]});self.no_effect(args,'54000')
  args=self.cat_args();args[6]={'name':'x'*262145};self.no_effect(args,'54000')
  args=self.cat_args();args[4]=9007199254740992;self.no_effect(args,'22023')
 def test_d28_rename_keeps_immutable_trash_and_restore_uses_current_category(self):
  a=self.create(category='Gear');b=self.create(category='Gear');self.execute('trash',target=b['id']);before=self.row(b['id']);args=self.cat_args();r=self.cat(args)
  self.assertEqual(self.row(b['id']),before);self.assertEqual([x['item_id']for x in r['changed_item_revisions']],[a['id']]);out=self.execute('restore',target=b['id']);self.assertEqual(out['item']['category'],'Renamed');self.assertEqual(self.category(b['id']),args[5]['id'])
 def test_d29_root_trash_and_restored_lifecycle_refuse_old_write_but_receipt_survives(self):
  self.create(category='Gear');args=self.cat_args();result=self.cat(args);fresh=self.cat_args();root=int(self.sql('select revision from public.trips where id='+lit(self.trip)));self.rpc('trash_family_trip',[self.trip,root]);self.no_effect(fresh,'42501')
  root=int(self.sql('select revision from public.trips where id='+lit(self.trip)));self.rpc('restore_family_trip',[self.trip,root]);self.no_effect(args,'PT409');self.assertEqual(self.cat_receipt(args[1])['result'],result)
 def test_d30_late_receipt_failure_rolls_back_metadata_assignments_audit_and_history(self):
  self.create(category='Gear')
  for action,values in [('category-rename',{'name':'Rollback'}),('category-assignees',{'person_ids':[self.viewer_person]})]:
   args=self.cat_args(action,values);before=self.foundation();claims=json.dumps({'sub':self.owner,'role':'authenticated','aal':'aal2'})
   stmt="begin;alter table family_auth.packing_command_receipts add constraint c2b_late_failure check(action not in('category-rename','category-assignees'))not valid;select set_config('request.jwt.claims',"+lit(claims)+",true);set local role authenticated;"+self.cat_statement(args)+';commit;'
   with self.assertRaisesRegex(RuntimeError,'23514'):self.sql(stmt)
   self.assertEqual(self.foundation(),before);self.assertEqual(self.sql("select count(*)from pg_constraint where conname='c2b_late_failure'"),'0')
 def test_d31_collection_and_category_overflow_roll_back_every_effect(self):
  self.create(category='Gear');args=self.cat_args();self.sql('update family_auth.trip_packing_state set collection_revision=9007199254740991 where trip_id='+lit(self.trip));args[4]=9007199254740991;self.no_effect(args,'54000')
 def test_d32_actual_eight_mib_read_bound_rolls_back_category_command(self):
  self.create(category='Gear');args=self.cat_args();self.sql('insert into public.packing_bags(trip_id,name)values('+lit(self.trip)+",repeat('x',8388608))")
  args[4]=int(self.sql('select collection_revision from family_auth.trip_packing_state where trip_id='+lit(self.trip)));self.no_effect(args,'54000')
 def test_d33_private_coarse_audit_never_discloses_category_or_item_identity(self):
  a=self.create(category='Secret original',visibility='personal');args=self.cat_args(values={'name':'Secret new'});self.cat(args)
  events=json.loads(self.sql('select jsonb_agg(to_jsonb(e))from public.family_audit_events e where trip_id='+lit(self.trip)));text=json.dumps(events)
  for secret in ['Secret original','Secret new',a['id'],args[5]['id']]:self.assertNotIn(secret,text)
  receipt=json.loads(self.sql('select before_state from family_auth.packing_command_receipts where operation_id='+lit(args[1])));self.assertEqual(receipt['category'],args[5])
 def test_d34_concurrent_identical_submission_commits_once(self):
  self.create(category='Gear');args=self.cat_args()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as p:out=list(p.map(lambda _:self.cat(args),range(2)))
  self.assertEqual(out[0],out[1]);self.assertEqual(self.sql('select count(*)from family_auth.packing_command_receipts where operation_id='+lit(args[1])),'1');self.assertEqual(self.packet()['categories'][0]['revision'],2)
 def test_d35_concurrent_different_intents_have_one_winner(self):
  self.create(category='Gear');a=self.cat_args();b=copy.deepcopy(a);b[1]=str(uuid.uuid4());b[6]={'name':'Other'}
  def run(args):
   try:return self.cat(args)
   except RuntimeError as e:return str(e)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as p:out=list(p.map(run,[a,b]))
  self.assertEqual(sum(isinstance(x,dict)for x in out),1);self.assertIn('PT409',next(x for x in out if isinstance(x,str)))
 def test_d36_category_waits_for_group_then_refuses_stale_original(self):
  self.create(category='Gear');args=self.cat_args();group=self.group_args()
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as p:
   with self.held_authenticated_command(self.statement(group))as pid:
    f=p.submit(self.cat,args);self.wait_for_lock(args[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertTrue(self.state()['items'][0]['checked']);self.assertEqual(self.packet()['categories'][0]['name'],'Gear')
 def test_d37_group_waits_for_category_and_sees_no_partial_publication(self):
  self.create(category='Gear');args=self.cat_args();group=self.group_args()
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as p:
   with self.held_authenticated_command(self.cat_statement(args))as pid:
    self.assertEqual(self.packet()['categories'][0]['name'],'Gear');f=p.submit(self.group,group);self.wait_for_lock(group[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertEqual(self.packet()['categories'][0]['name'],'Renamed');self.assertFalse(self.state()['items'][0]['checked'])
 def test_d38_assignment_waits_for_item_and_refuses_changed_collection(self):
  a=self.create(category='Gear');args=self.cat_args('category-assignees',{'person_ids':[self.viewer_person]});item=self.args('update',{'name':'Current'},target=a['id'])
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as p:
   with self.held_authenticated_command(self.command_statement(item))as pid:
    f=p.submit(self.cat,args);self.wait_for_lock(args[1],pid)
   with self.assertRaisesRegex(RuntimeError,'PT409'):f.result(timeout=15)
  self.assertEqual(self.packet()['categories'][0]['assignments'],[])
 def test_d39_permission_revoked_during_mutex_wait_is_rechecked(self):
  self.create(category='Gear');self.policy('trip.packing.manage','trip_travelers');args=self.cat_args(user=self.editor)
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as p:
   with self.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(self.trip)+"::text,0))")as pid:
    f=p.submit(self.cat,args,self.editor);self.wait_for_lock(args[1],pid);self.policy('trip.packing.manage')
   with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=15)
  self.assertEqual(self.packet()['categories'][0]['name'],'Gear')
 def test_d40_root_trash_race_refuses_postwait_lifecycle(self):
  self.create(category='Gear');args=self.cat_args();rev=int(self.sql('select revision from public.trips where id='+lit(self.trip)))
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as p:
   with self.held_authenticated_command('select public.trash_family_trip('+lit(self.trip)+','+str(rev)+')')as pid:
    f=p.submit(self.cat,args);self.wait_for_lock(args[1],pid)
   with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=15)
  self.assertEqual(self.sql('select name from public.packing_categories where id='+lit(args[5]['id'])),'Gear')
 def test_d41_old_item_and_group_receipt_bodies_and_digests_remain_exact(self):
  a=self.create(category='Gear');item=self.args('update',{'name':'Historical'},target=a['id']);self.rpc('execute_family_trip_packing_v1',item);group=self.group_args();self.group(group)
  prior=self.sql('select jsonb_agg(to_jsonb(r)order by operation_id)from family_auth.packing_command_receipts r where trip_id='+lit(self.trip));self.cat(self.cat_args())
  now=self.sql('select jsonb_agg(to_jsonb(r)order by operation_id)from family_auth.packing_command_receipts r where trip_id='+lit(self.trip)+"and category_id is null");self.assertEqual(now,prior)
 def test_d42_raw_roles_cannot_execute_helpers_or_mutate_ledger(self):
  for role in ['anon','service_role']:
   self.assertEqual(self.sql("select has_function_privilege("+lit(role)+",'public.execute_family_trip_packing_category_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb)','EXECUTE')"),'f')
  for role in ['anon','authenticated','service_role']:
   self.assertEqual(self.sql('select has_table_privilege('+lit(role)+",'family_auth.packing_command_receipts','SELECT,INSERT,UPDATE,DELETE')"),'f')
   self.assertEqual(self.sql('select has_function_privilege('+lit(role)+",'family_auth.validate_packing_category_request(text,jsonb,jsonb)','EXECUTE')"),'f')
  self.assertEqual(self.sql("select prosecdef from pg_proc where oid='public.execute_family_trip_packing_category_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb)'::regprocedure"),'f')
 def test_d43_two_thousand_active_compatibility_revisions_fit_and_overflow_refuses(self):
  self.sql('insert into public.packing_items(trip_id,name,category,sort_order)select '+lit(self.trip)+",'Bulk '||x,'Gear',x from generate_series(1,2000)x")
  r=self.cat(self.cat_args());self.assertEqual(len(r['changed_item_revisions']),2000);self.assertLess(len(json.dumps(r).encode()),8388608)
  args=self.cat_args(values={'name':'Too many'});self.sql('insert into public.packing_items(trip_id,name,category)values('+lit(self.trip)+",'Overflow','Renamed')");args[4]=int(self.sql('select collection_revision from family_auth.trip_packing_state where trip_id='+lit(self.trip)));self.no_effect(args,'54000')
 def test_d44_membership_revoked_during_mutex_wait_is_rechecked(self):
  self.create(category='Gear');args=self.cat_args()
  try:
   with concurrent.futures.ThreadPoolExecutor(max_workers=1)as p:
    with self.held_authenticated_command("select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(self.trip)+"::text,0))")as pid:
     f=p.submit(self.cat,args);self.wait_for_lock(args[1],pid);self.sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
    with self.assertRaisesRegex(RuntimeError,'42501'):f.result(timeout=15)
  finally:self.sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
  self.assertEqual(self.packet()['categories'][0]['name'],'Gear')
 def test_d45_other_actor_cannot_enumerate_receipt_even_with_common_read(self):
  self.create(category='Gear');self.policy('trip.packing.manage','trip_travelers');args=self.cat_args();self.cat(args)
  result=self.cat_receipt(args[1],self.editor);self.assertEqual(result['status'],'unknown');self.assertIsNone(result['result'])
 def test_d46_removed_historical_traveler_is_preserved_and_can_be_unassigned(self):
  a=self.create(category='Gear');self.assign(self.category(a['id']),provenance=True);self.sql('delete from public.trip_travelers where trip_id='+lit(self.trip)+'and person_id='+lit(self.viewer_person))
  r=self.cat(self.cat_args('category-assignees',{'person_ids':sorted([self.viewer_person,self.editor_person])}));self.assertEqual(len(r['category']['assignments']),2)
  self.cat(self.cat_args('category-assignees',{'person_ids':[]}));self.no_effect(self.cat_args('category-assignees',{'person_ids':[self.viewer_person]}),'22023')
