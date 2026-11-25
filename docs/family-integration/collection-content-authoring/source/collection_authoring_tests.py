from collection_authoring_support import *
import unittest,concurrent.futures,copy
class Authoring(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  f=setup_users();cls.family=f['family'];cls.other=f['other_family'];cls.users=f['users']
 def setUp(self):
  self.owner=self.users['owner'];self.member=self.users['member'];self.collection=rpc('create_family_list',{'family_id':self.family,'name':'Author '+new()},self.owner)
  self.food=sql('insert into public.foods(name,notes,link_url,address,latitude,longitude)values('+lit('Meal '+new())+",'Catalog description','https://example.invalid/','Venue street',21.123456789,-100.123456789)returning id")
 def ctx(self,target=None,user=None):return author_context(self.collection,user or self.owner,target)
 def prepare(self,action,body,**kw):return prepare_content(self.collection,action,body,kw.pop('user',self.owner),**kw)
 def execute(self,op,original,user=None):return execute_content(self.collection,op,original,user or self.owner)
 def command(self,action,body,**kw):op,original=self.prepare(action,body,**kw);return self.execute(op,original)
 def reference(self,kind='food',entity=None):return self.command('create_reference',{'source':{'kind':kind,'id':entity or self.food},'notes':'Personal note','status':'idea'})['item_id']
 def manual(self,**kw):return self.command('create_manual',{'content':manual_content(**kw),'notes':None,'status':'idea'})['item_id']
 def row(self,item):return json.loads(sql('select to_jsonb(x)from public.list_items x where id='+lit(item)))
 def child(self,item):return json.loads(sql('select to_jsonb(x)from public.list_item_locations x where item_id='+lit(item)))
 def outcome(self,op,user=None):return rpc('get_family_collection_content_operation_v1',{'collection_id':self.collection,'operation_id':op},user or self.owner)
 def cancel(self,op,original,user=None):return rpc('cancel_family_collection_content_v1',{'collection_id':self.collection,'operation_id':op,'original':original},user or self.owner)
 def refuse(self,name,args,code,user=None):
  status,b=request('/rpc/'+name,{'p_'+k:v for k,v in args.items()},user or self.owner);self.assertGreaterEqual(status,400);self.assertEqual(b.get('code'),code,b);return status,b
 def fail_prepare(self,action,body,code='22023',obs=None,user=None):
  user=user or self.owner
  if obs is None:
   target={'source':body['source']}if action in('create_reference','create_snapshot')and isinstance(body.get('source'),dict)else{'item_id':body['item_id']}if action in('edit','status','materialize')and'item_id'in body else{}
   obs=author_context(self.collection,user,target)['observation']
  return self.refuse('prepare_family_collection_content_v1',{'collection_id':self.collection,'operation_id':new(),'action':action,'body':body,'observation':obs},code,user)
 def fail_execute(self,op,original,code='PT409',user=None):return self.refuse('execute_family_collection_content_v1',{'collection_id':self.collection,'operation_id':op,'original':original},code,user)
 def media(self):
  asset=new();path=self.family+'/lists/'+self.collection+'/'+asset+'.webp';sql('insert into public.media_assets(id,kind,visibility,bucket,storage_path,filename,content_hash,mime_type,size_bytes,family_id)values('+lit(asset)+",'image','family','family',"+lit(path)+",'cover.webp',"+lit(uuid.uuid4().hex*2)+",'image/webp',64,"+lit(self.family)+')');return asset,path
 def job(self,asset,path):return sql('insert into public.storage_cleanup_jobs(family_id,bucket_id,object_path,kind,status,resource_type,resource_id,locked_by,locked_at)values('+lit(self.family)+",'family',"+lit(path)+",'unref_private_asset','processing','media_assets',"+lit(asset)+",'author-test-worker',now())returning id")
 def arm(self,job):return json.loads(sql('select public.revalidate_storage_cleanup_job('+lit(job)+",'author-test-worker')"))
 def wait_for(self,query):
  until=time.monotonic()+8
  while time.monotonic()<until:
   if sql(query)=='t':return
   time.sleep(.025)
  self.fail('Owned lock wait was not observed')
 def test_01_context_and_reference_exact_source(self):
  c=self.ctx({'source':{'kind':'food','id':self.food}});self.assertEqual(c['source']['description'],'Catalog description');self.assertEqual(c['observation']['source_digest'],c['source']['digest']);item=self.reference();row=rpc('get_family_collection_editor_v1',{'collection_id':self.collection,'item_id':item},self.owner)['item'];self.assertEqual(row['content_mode'],'reference');self.assertEqual(row['notes'],'Personal note');self.assertEqual(row['content']['description'],'Catalog description')
 def test_02_snapshot_is_server_derived_and_normalized_before_execution(self):
  op,o=self.prepare('create_snapshot',{'source':{'kind':'food','id':self.food},'notes':'Own notes','status':'want'});c=o['body']['content'];self.assertEqual(c['latitude'],21.12345679);self.assertEqual(c['description'],'Catalog description');r=self.execute(op,o);self.assertEqual(self.child(r['item_id'])['latitude'],21.12345679);self.assertEqual(self.row(r['item_id'])['notes'],'Own notes')
 def test_03_manual_exact_null_empty_and_utf8(self):
  item=self.manual(description='',address=None,website='',phone='',latitude=19.12345678,longitude=-98.12345678);c=self.child(item);self.assertEqual((c['description'],c['address'],c['website'],c['phone']),('',None,'',''));self.assertEqual(self.row(item)['item_kind'],'manual')
 def test_04_materialize_preserves_saved_name_and_notes(self):
  item=self.reference();self.command('edit',{'item_id':item,'changes':{'name':'Saved label','notes':'Personal'}});r=self.command('materialize',{'item_id':item});self.assertTrue(r['changed']);self.assertEqual(self.row(item)['name'],'Saved label');self.assertEqual(self.row(item)['notes'],'Personal');self.assertEqual(self.child(item)['description'],'Catalog description')
 def test_05_parent_child_edit_has_complete_old_final_history(self):
  item=self.manual(description='Old');before=self.row(item)['revision'];self.command('edit',{'item_id':item,'changes':{'name':'New label','notes':'New note','description':'New description','address':''}});h=rpc('list_family_collection_versions_v1',{'collection_id':self.collection,'item_id':item},self.owner)['items'];self.assertEqual(self.row(item)['revision'],before+1);self.assertEqual(h[0]['snapshot']['notes'],'New note');self.assertEqual(h[0]['location_snapshot']['description'],'New description');self.assertEqual(h[1]['location_snapshot']['description'],'Old')
 def test_06_status_and_noop_have_truthful_outcomes(self):
  item=self.reference();a=self.command('status',{'item_id':item,'status':'want'});before=self.row(item);b=self.command('status',{'item_id':item,'status':'want'});self.assertTrue(a['changed']);self.assertFalse(b['changed']);self.assertEqual(self.row(item),before)
 def test_07_complete_reorder_and_unchanged_order(self):
  a=self.reference();b=self.manual();r=self.command('reorder',{'ordered_ids':[b,a]});self.assertTrue(r['changed']);before=self.ctx()['observation'];r=self.command('reorder',{'ordered_ids':[b,a]});self.assertFalse(r['changed']);self.assertEqual(self.ctx()['observation'],before);self.assertEqual(self.row(b)['sort_order'],0)
 def test_08_lost_prepare_reply_returns_original_target(self):
  body={'content':manual_content(),'notes':None,'status':'idea'};obs=self.ctx()['observation'];op,o=self.prepare('create_manual',body,observation=obs);r=rpc('prepare_family_collection_content_v1',{'collection_id':self.collection,'operation_id':op,'action':'create_manual','body':body,'observation':obs},self.owner);self.assertEqual(r['original'],o);self.execute(op,o);self.assertEqual(sql('select count(*)from public.list_items where id='+lit(o['target_item_id'])),'1')
 def test_09_lost_execution_reply_and_stale_ack_do_not_reapply(self):
  item=self.manual();op,o=self.prepare('edit',{'item_id':item,'changes':{'notes':'First'}});a=self.execute(op,o);self.command('edit',{'item_id':item,'changes':{'notes':'Newer'}});self.assertEqual(self.execute(op,o),a);self.assertEqual(self.row(item)['notes'],'Newer');self.assertNotIn('content',a)
 def test_10_deliberate_duplicate_and_repeated_manual_saves(self):
  self.reference();self.fail_prepare('create_reference',{'source':{'kind':'food','id':self.food},'notes':None,'status':'idea'},'PT409');a=self.manual();b=self.manual();self.assertNotEqual(a,b)
 def test_11_source_edit_after_context_is_conflict(self):
  obs=self.ctx({'source':{'kind':'food','id':self.food}})['observation'];sql("update public.foods set notes='Changed before prepare'where id="+lit(self.food));self.fail_prepare('create_snapshot',{'source':{'kind':'food','id':self.food},'notes':None,'status':'idea'},'PT409',obs)
 def test_12_source_edit_after_prepare_does_not_change_original(self):
  op,o=self.prepare('create_snapshot',{'source':{'kind':'food','id':self.food},'notes':None,'status':'idea'});sql("update public.foods set notes='Changed after prepare'where id="+lit(self.food));self.fail_execute(op,o);self.assertEqual(self.outcome(op)['original'],o)
 def test_13_tampered_original_and_reused_preparation_refuse(self):
  body={'content':manual_content(),'notes':None,'status':'idea'};obs=self.ctx()['observation'];op,o=self.prepare('create_manual',body,observation=obs);bad=copy.deepcopy(o);bad['body']['notes']='Tamper';self.fail_execute(op,bad);self.refuse('prepare_family_collection_content_v1',{'collection_id':self.collection,'operation_id':op,'action':'create_manual','body':{**body,'notes':'Other'},'observation':obs},'PT409')
 def test_14_new_session_discovers_and_cancels_but_cannot_execute_old(self):
  op,o=self.prepare('create_manual',{'content':manual_content(),'notes':None,'status':'idea'});fresh={**self.owner,'session':okay('/token?grant_type=password',{'email':self.owner['email'],'password':self.owner['password']},auth=True)};self.assertEqual(self.outcome(op,fresh)['original'],o);self.fail_execute(op,o,user=fresh);self.assertEqual(self.cancel(op,o,fresh)['status'],'cancelled');self.assertEqual(self.outcome(op)['status'],'cancelled')
 def test_15_expired_session_cannot_read_or_execute_original(self):
  op,o=self.prepare('create_manual',{'content':manual_content(),'notes':None,'status':'idea'});sid=o['scope']['session_id'];sql('update auth.sessions set not_after=now()-interval\'1 minute\'where id='+lit(sid))
  try:self.fail_execute(op,o,'42501');self.refuse('get_family_collection_content_operation_v1',{'collection_id':self.collection,'operation_id':op},'42501')
  finally:sql('update auth.sessions set not_after=now()+interval\'1 day\'where id='+lit(sid))
 def test_16_wrong_member_and_family_cannot_prepare_or_execute(self):
  op,o=self.prepare('create_manual',{'content':manual_content(),'notes':None,'status':'idea'});self.fail_execute(op,o,'42501',self.member);self.fail_execute(op,o,'42501',self.users['outsider']);self.refuse('get_family_collection_authoring_context_v1',{'collection_id':self.collection},'42501',self.member)
 def test_17_active_family_member_can_edit_shared_list(self):
  reviewer=self.users['reviewer'];c=rpc('create_family_list',{'family_id':self.family,'name':'Shared authoring','visibility':'family'},reviewer);r=author(c,'create_manual',{'content':manual_content(),'notes':None,'status':'idea'},self.member);self.assertTrue(r['changed'])
 def test_18_existing_item_lifecycle_still_works_and_reserves_source(self):
  item=self.reference();ctx=rpc('get_family_collection_item_context_v1',{'collection_id':self.collection,'item_id':item},self.owner);rpc('execute_family_collection_item_lifecycle_v1',{'collection_id':self.collection,'item_id':item,'operation_id':new(),'scope':ctx['scope'],'action':'trash','expected_revision':ctx['item']['revision'],'expected_collection_revision':ctx['content_revision']},self.owner);self.fail_prepare('create_reference',{'source':{'kind':'food','id':self.food},'notes':None,'status':'idea'},'PT409')
 def test_19_archived_parent_refuses_mutation_but_allows_cancel(self):
  op,o=self.prepare('create_manual',{'content':manual_content(),'notes':None,'status':'idea'});rpc('archive_family_list',{'list_id':self.collection},self.owner);self.fail_execute(op,o,'42501');self.assertEqual(self.cancel(op,o)['status'],'cancelled')
 def test_20_unknown_fields_and_unsupported_financial_inputs_refuse(self):
  for extra in [{'price':0},{'image_url':'https://fixture.invalid/a.webp'},{'source_trip_id':new()},{'links':[]}]:self.fail_prepare('create_manual',{'content':manual_content(),'notes':None,'status':'idea',**extra})
  self.fail_prepare('create_manual',{'content':manual_content(),'notes':None,'status':'other'})
 def test_21_precision_and_coordinate_pair_require_preobservation_normalization(self):
  for c in [manual_content(latitude=1.123456789,longitude=1),manual_content(latitude=1),manual_content(latitude='1',longitude=1),manual_content(latitude=91,longitude=1)]:self.fail_prepare('create_manual',{'content':c,'notes':None,'status':'idea'})
 def test_22_invalid_names_urls_and_uuid_scope_refuse(self):
  for c in [manual_content(name=''),manual_content(name=' padded '),manual_content(name='x'*501),manual_content(website='javascript:bad'),manual_content(website='https://fixture.invalid'),manual_content(cover_media_id='not-uuid')]:self.fail_prepare('create_manual',{'content':c,'notes':None,'status':'idea'})
  self.fail_prepare('create_manual',{'content':manual_content(family_place_category_id=new()),'notes':None,'status':'idea'},'42501')
 def test_23_identity_edit_and_reference_detail_edit_refuse(self):
  item=self.reference();self.fail_prepare('edit',{'item_id':item,'changes':{'description':'New'}},'0A000');self.fail_prepare('edit',{'item_id':item,'changes':{'list_id':new()}},'0A000')
 def test_24_snapshot_explicit_clears_are_not_catalog_defaults(self):
  item=self.command('create_snapshot',{'source':{'kind':'food','id':self.food},'notes':'Personal','status':'idea'})['item_id'];self.command('edit',{'item_id':item,'changes':{'description':'','notes':None,'address':None,'website':'','latitude':None,'longitude':None}});c=self.child(item);self.assertEqual((c['description'],c['address'],c['website'],c['latitude']),('',None,'',None));self.assertIsNone(self.row(item)['notes'])
 def test_25_all_catalog_kinds_and_nonlocation_materialization(self):
  for kind,table in [('country','countries'),('place','places'),('hotel','hotels'),('experience','experiences'),('airport','airports'),('airline','airlines'),('guide','guides')]:
   entity=sql('select id from public.'+table+' order by id limit 1')
   if not entity:entity=sql('insert into public.'+table+'(name)values('+lit('Author '+kind)+')returning id')
   item=self.reference(kind,entity)
   if kind in('country','airport','airline','guide'):self.fail_prepare('materialize',{'item_id':item},'0A000')
 def test_26_prepared_media_is_held_until_cancel(self):
  asset,path=self.media();op,o=self.prepare('create_manual',{'content':manual_content(cover_media_id=asset),'notes':None,'status':'idea'});self.assertEqual(sql('select family_auth.private_media_is_referenced('+lit(asset)+')'),'t');self.assertEqual(self.arm(self.job(asset,path))['action'],'skip');self.cancel(op,o);self.assertEqual(sql('select family_auth.private_media_is_referenced('+lit(asset)+')'),'f');self.assertEqual(self.arm(self.job(asset,path))['action'],'delete')
 def test_27_armed_media_refuses_preparation_without_registering(self):
  asset,path=self.media();self.assertEqual(self.arm(self.job(asset,path))['action'],'delete');before=sql('select count(*)from family_auth.collection_authoring_commands');self.fail_prepare('create_manual',{'content':manual_content(cover_media_id=asset),'notes':None,'status':'idea'},'55000');self.assertEqual(sql('select count(*)from family_auth.collection_authoring_commands'),before)
 def test_28_pending_media_identity_and_scope_are_immutable(self):
  asset,path=self.media();op,o=self.prepare('create_manual',{'content':manual_content(cover_media_id=asset),'notes':None,'status':'idea'})
  for field,value in [('family_id',self.other),('visibility','public_catalog'),('storage_path',path+'-changed')]:
   r=sql('update public.media_assets set '+field+'='+lit(value)+'where id='+lit(asset),fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('0A000',r.stderr)
  self.cancel(op,o)
 def test_29_late_history_failure_leaves_prepared_original_and_no_content(self):
  asset,_=self.media();op,o=self.prepare('create_manual',{'content':manual_content(cover_media_id=asset),'notes':None,'status':'idea'});target=o['target_item_id'];sql("create function family_auth.author_test_failure()returns trigger language plpgsql as $$begin raise exception 'Synthetic history failure';end;$$;create trigger author_test_failure before insert on family_auth.collection_item_versions for each row when(new.item_id="+lit(target)+"::uuid)execute function family_auth.author_test_failure()")
  try:self.fail_execute(op,o,'P0001')
  finally:sql('drop trigger author_test_failure on family_auth.collection_item_versions;drop function family_auth.author_test_failure()')
  self.assertEqual(sql('select count(*)from public.list_items where id='+lit(target)),'0');self.assertEqual(self.outcome(op)['status'],'prepared');self.assertEqual(sql('select count(*)from family_auth.collection_authoring_media_holds where operation_id='+lit(op)),'1');self.assertEqual(self.execute(op,o)['status'],'committed')
 def test_30_late_outcome_failure_rolls_back_edit_and_context(self):
  item=self.manual();before=self.row(item);child=self.child(item);op,o=self.prepare('edit',{'item_id':item,'changes':{'notes':'New','description':'New'}});sql("create function family_auth.author_test_failure()returns trigger language plpgsql as $$begin raise exception 'Synthetic outcome failure';end;$$;create trigger author_test_failure before insert on family_auth.collection_authoring_outcomes for each row when(new.operation_id="+lit(op)+"::uuid)execute function family_auth.author_test_failure()")
  try:self.fail_execute(op,o,'P0001')
  finally:sql('drop trigger author_test_failure on family_auth.collection_authoring_outcomes;drop function family_auth.author_test_failure()')
  self.assertEqual(self.row(item),before);self.assertEqual(self.child(item),child);self.assertEqual(self.outcome(op)['status'],'prepared');self.assertEqual(sql('select count(*)from family_auth.collection_authoring_context'),'0');self.execute(op,o)
 def test_31_cancel_wins_and_original_never_executes(self):
  op,o=self.prepare('create_manual',{'content':manual_content(),'notes':None,'status':'idea'});r=self.cancel(op,o);self.assertEqual(r['status'],'cancelled');self.assertEqual(self.execute(op,o),r);self.assertEqual(sql('select count(*)from public.list_items where id='+lit(o['target_item_id'])),'0')
 def test_32_execution_wins_cancel_acknowledges_committed(self):
  op,o=self.prepare('create_manual',{'content':manual_content(),'notes':None,'status':'idea'});r=self.execute(op,o);self.assertEqual(self.cancel(op,o),r);self.assertEqual(self.outcome(op),r)
 def test_33_concurrent_execute_and_cancel_share_one_outcome(self):
  op,o=self.prepare('create_manual',{'content':manual_content(),'notes':None,'status':'idea'})
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
   a=pool.submit(self.execute,op,o);b=pool.submit(self.cancel,op,o);ra=a.result();rb=b.result()
  self.assertEqual(ra,rb);self.assertEqual(sql('select count(*)from public.list_items where id='+lit(o['target_item_id'])),'1'if ra['status']=='committed'else'0')
 def test_34_concurrent_same_original_creates_once(self):
  op,o=self.prepare('create_manual',{'content':manual_content(),'notes':None,'status':'idea'})
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
   a=pool.submit(self.execute,op,o);b=pool.submit(self.execute,op,o);self.assertEqual(a.result(),b.result())
  self.assertEqual(sql('select count(*)from public.list_items where id='+lit(o['target_item_id'])),'1')
 def test_35_concurrent_observed_edits_do_not_overwrite(self):
  item=self.manual();obs=self.ctx({'item_id':item})['observation'];a,oa=self.prepare('edit',{'item_id':item,'changes':{'notes':'A'}},observation=obs);b,ob=self.prepare('edit',{'item_id':item,'changes':{'notes':'B'}},observation=obs);self.execute(a,oa);self.fail_execute(b,ob);self.assertEqual(self.row(item)['notes'],'A')
 def test_36_revocation_during_root_wait_refuses_execution(self):
  op,o=self.prepare('create_manual',{'content':manual_content(),'notes':None,'status':'idea'});tag='author-root-'+new()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
   holder=pool.submit(sql,'begin;set application_name='+lit(tag)+';select id from public.lists where id='+lit(self.collection)+'for update;select pg_sleep(2);commit;');self.wait_for('select exists(select 1 from pg_stat_activity where application_name='+lit(tag)+"and wait_event='PgSleep')")
   future=pool.submit(request,'/rpc/execute_family_collection_content_v1',{'p_collection_id':self.collection,'p_operation_id':op,'p_original':o},self.owner);self.wait_for("select exists(select 1 from pg_stat_activity where datname='collection_authoring_candidate'and wait_event_type='Lock'and query like '%execute_family_collection_content_v1%')");sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']))
   try:status,b=future.result();holder.result();self.assertEqual((status,b.get('code')),(403,'42501'))
   finally:sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']))
  self.assertEqual(self.outcome(op)['status'],'prepared')
 def test_37_source_change_during_source_wait_is_observed(self):
  obs=self.ctx({'source':{'kind':'food','id':self.food}})['observation'];tag='author-source-'+new()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
   holder=pool.submit(sql,'begin;set application_name='+lit(tag)+";update public.foods set notes='Changed while waiting'where id="+lit(self.food)+';select pg_sleep(2);commit;');self.wait_for('select exists(select 1 from pg_stat_activity where application_name='+lit(tag)+"and wait_event='PgSleep')")
   future=pool.submit(request,'/rpc/prepare_family_collection_content_v1',{'p_collection_id':self.collection,'p_operation_id':new(),'p_action':'create_snapshot','p_body':{'source':{'kind':'food','id':self.food},'notes':None,'status':'idea'},'p_observation':obs},self.owner);self.wait_for("select exists(select 1 from pg_stat_activity where datname='collection_authoring_candidate'and wait_event_type='Lock'and query like '%prepare_family_collection_content_v1%')");status,b=future.result();holder.result();self.assertEqual((status,b.get('code')),(409,'PT409'))
 def test_38_retired_legacy_and_raw_application_writes_refuse(self):
  item=self.manual()
  for name,args in [('add_list_item',{'list_id':self.collection,'kind':'food','entity_id':self.food}),('set_list_item_status',{'item_id':item,'status':'want'}),('reorder_list_items',{'list_id':self.collection,'item_ids':[item]})]:self.refuse(name,args,'0A000')
  r=sql("update public.list_items set notes='Raw bypass'where id="+lit(item),user=self.owner,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('42501',r.stderr)
  for role in ['anon','authenticated','service_role']:
   r=sql('insert into family_auth.collection_authoring_context values(pg_current_xact_id(),'+lit(self.collection)+','+lit(self.owner['id'])+','+lit(new())+','+lit(item)+",'edit')",role=role,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('42501',r.stderr)
 def test_39_shared_lifecycle_content_operation_namespace_both_directions(self):
  item=self.manual();ctx=rpc('get_family_collection_item_context_v1',{'collection_id':self.collection,'item_id':item},self.owner);original={'target_kind':'item','collection_id':self.collection,'item_id':item,'scope':ctx['scope'],'action':'trash','expected_revision':ctx['item']['revision'],'expected_collection_revision':ctx['content_revision']};op,o=self.prepare('status',{'item_id':item,'status':'want'})
  self.refuse('cancel_family_collection_operation_v1',{'family_id':self.family,'operation_id':op,'original':original},'PT409');other=new();rpc('cancel_family_collection_operation_v1',{'family_id':self.family,'operation_id':other,'original':original},self.owner)
  obs=self.ctx({'item_id':item})['observation'];self.refuse('prepare_family_collection_content_v1',{'collection_id':self.collection,'operation_id':other,'action':'status','body':{'item_id':item,'status':'want'},'observation':obs},'PT409')
 def test_40_oversize_notes_and_complete_order_validation(self):
  self.fail_prepare('create_manual',{'content':manual_content(),'notes':'x'*20001,'status':'idea'});item=self.manual();self.fail_prepare('reorder',{'ordered_ids':[]},'PT409');self.fail_prepare('reorder',{'ordered_ids':[item,item]},'22023');self.fail_prepare('reorder',{'ordered_ids':[new()]},'PT409')
 def test_41_unrepresentable_canonical_source_is_not_silently_rewritten(self):
  sql("update public.foods set link_url='https://fixture.invalid'where id="+lit(self.food));self.fail_prepare('create_snapshot',{'source':{'kind':'food','id':self.food},'notes':None,'status':'idea'},'0A000');self.assertEqual(sql('select count(*)from public.list_items where list_id='+lit(self.collection)),'0')
 def test_42_materialize_existing_snapshot_is_unchanged(self):
  item=self.manual();before=self.row(item);r=self.command('materialize',{'item_id':item});self.assertFalse(r['changed']);self.assertEqual(self.row(item),before)
 def test_43_cancelled_hold_does_not_strand_media_metadata_fk(self):
  asset,_=self.media();op,o=self.prepare('create_manual',{'content':manual_content(cover_media_id=asset),'notes':None,'status':'idea'});self.cancel(op,o);sql('delete from public.media_assets where id='+lit(asset));self.assertEqual(sql('select count(*)from public.media_assets where id='+lit(asset)),'0');self.assertEqual(self.outcome(op)['status'],'cancelled')
 def test_44_source_removal_after_prepare_still_allows_cancel(self):
  op,o=self.prepare('create_snapshot',{'source':{'kind':'food','id':self.food},'notes':None,'status':'idea'});sql('delete from public.foods where id='+lit(self.food));self.fail_execute(op,o,'42501');self.assertEqual(self.cancel(op,o)['status'],'cancelled')
 def test_45_no_capabilities_remain_after_success(self):
  self.manual();self.assertEqual(sql('select count(*)from family_auth.collection_authoring_context'),'0');self.assertEqual(sql('select count(*)from family_auth.collection_content_permits'),'0');self.assertEqual(sql('select count(*)from family_auth.collection_lifecycle_permits'),'0')


 def test_46_creation_preserves_recorded_creator_requirement(self):
  admin=self.users['global_admin'];ctx=author_context(self.collection,admin)
  self.refuse('prepare_family_collection_content_v1',{'collection_id':self.collection,'operation_id':new(),'action':'create_manual','body':{'content':manual_content(),'notes':None,'status':'idea'},'observation':ctx['observation']},'42501',admin)
 def test_47_pending_quota_counts_real_originals_without_mutating_content(self):
  email='authoring-quota-'+uuid.uuid4().hex+'@fixture.invalid';password=secrets.token_urlsafe(24)
  data=okay('/admin/users',{'email':email,'password':password,'email_confirm':True},token=API['service_key'],auth=True)
  sql('begin;insert into public.family_members(family_id,user_id,role,status)values('+lit(self.family)+','+lit(data['id'])+",'child','active');select set_config('family_auth.allow_identity_link','1',true);insert into public.people(family_id,user_id,display_name)values("+lit(self.family)+','+lit(data['id'])+",'Quota fixture');commit;")
  user={'id':data['id'],'family_id':self.family,'session':okay('/token?grant_type=password',{'email':email,'password':password},auth=True)}
  collection=rpc('create_family_list',{'family_id':self.family,'name':'Quota fixture'},user);obs=author_context(collection,user)['observation'];body={'content':manual_content(),'notes':None,'status':'idea'}
  for _ in range(200):prepare_content(collection,'create_manual',body,user,observation=obs)
  self.refuse('prepare_family_collection_content_v1',{'collection_id':collection,'operation_id':new(),'action':'create_manual','body':body,'observation':obs},'54000',user)
  self.assertEqual(sql('select count(*)from public.list_items where list_id='+lit(collection)),'0')


 def test_48_large_collection_still_accepts_creation_without_partial_order(self):
  sql('with inserted as(insert into public.list_items(list_id,item_kind,name)select '+lit(self.collection)+",'manual','Large '||n from generate_series(1,101)n returning id,list_id)insert into public.list_item_locations(item_id,list_id,family_id)select id,list_id,"+lit(self.family)+'from inserted')
  ctx=self.ctx();self.assertFalse(ctx['order_complete']);self.assertIsNone(ctx['ordered_items']);item=self.manual();self.assertEqual(self.row(item)['item_kind'],'manual');self.fail_prepare('reorder',{'ordered_ids':[]},'54000')

if __name__=='__main__':
 r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Authoring));(S/'authoring-qualification-summary.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped),'calls':COUNTS,'real_GoTrue_REST':True,'new_public_APIs':5,'native_UI_activation':False,'Storage_byte_operations':0},indent=2)+'\n');sys.exit(not r.wasSuccessful())
