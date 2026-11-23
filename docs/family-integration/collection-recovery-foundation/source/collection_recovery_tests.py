"""Owned PostgreSQL + real GoTrue/PostgREST Collection recovery qualification."""
from collection_recovery_support import *
import unittest,concurrent.futures

class CollectionRecovery(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  fixture=setup_users();cls.family=fixture['family'];cls.users=fixture['users'];cls.place=sql('select id from public.places order by id limit 1')
 def setUp(self):
  self.owner=self.users['owner'];self.member=self.users['member'];self.reviewer=self.users['reviewer'];self.outsider=self.users['outsider']
  self.collection=rpc('create_family_list',{'family_id':self.family,'name':'Recovery '+new()},self.owner)
  self.item=rpc('add_list_item',{'list_id':self.collection,'kind':'place','entity_id':self.place},self.owner)
 def context(self,collection=None,user=None,state='active'):
  return rpc('get_family_collection_context_v1',{'collection_id':collection or self.collection,'state':state},user or self.owner)
 def item_context(self,user=None):return rpc('get_family_collection_item_context_v1',{'collection_id':self.collection,'item_id':self.item},user or self.owner)
 def original(self,kind='item',action='trash'):
  c=self.item_context()if kind=='item'else self.context(state='trash'if sql('select deleted_at is not null from public.lists where id='+lit(self.collection))=='t'else'archived'if sql('select archived_at is not null from public.lists where id='+lit(self.collection))=='t'else'active')
  obj={'target_kind':kind,'collection_id':self.collection,'scope':c['scope'],'action':action,'expected_revision':c['item']['revision']if kind=='item'else c['collection_revision']}
  if kind=='item':obj.update(item_id=self.item,expected_collection_revision=c['content_revision'])
  return obj
 def execute(self,original=None,op=None,user=None):
  original=original or self.original();args={k:v for k,v in original.items()if k!='target_kind'};args['operation_id']=op or new()
  return rpc('execute_family_collection_item_lifecycle_v1'if original['target_kind']=='item'else'execute_family_collection_lifecycle_v1',args,user or self.owner)
 def rejected(self,name,args,user=None,code=None):
  status,body=request('/rpc/'+name,{'p_'+k:v for k,v in args.items()},user or self.owner)
  self.assertGreaterEqual(status,400)
  if code:self.assertEqual(body.get('code'),code,body.get('message'))
  return body
 def rejected_original(self,original,op=None,user=None,code='PT409'):
  args={k:v for k,v in original.items()if k!='target_kind'};args['operation_id']=op or new()
  return self.rejected('execute_family_collection_item_lifecycle_v1'if original['target_kind']=='item'else'execute_family_collection_lifecycle_v1',args,user,code)
 def row(self):return json.loads(sql('select to_jsonb(i)from public.list_items i where id='+lit(self.item)))
 def history(self,item=True,**extra):return rpc('list_family_collection_versions_v1',{'collection_id':self.collection,'item_id':self.item if item else None,**extra},self.owner)
 def test_01_context_metadata_only_and_exact_scope(self):
  c=self.context();self.assertEqual(c['scope']['user_id'],self.owner['id']);self.assertEqual(c['item_counts'],{'active':1,'trash':0});self.assertNotIn('description',c['collection']);self.assertNotIn('items',c)
  item=self.item_context()['item'];self.assertEqual(item['source'],{'kind':'place','id':self.place});self.assertNotIn('notes',item)
 def test_02_item_trash_restore_preserves_identity_and_content(self):
  sql('update public.list_items set notes=E\'Personal notes\\n  exact text\',name=\'Kept label\'where id='+lit(self.item));before=self.row()
  r=self.execute();self.assertTrue(r['changed']);self.assertEqual(r['status'],'committed')
  status,rows=request('/list_items?id=eq.'+self.item,user=self.owner);self.assertEqual((status,rows),(200,[]))
  trash=rpc('list_family_collection_item_trash_v1',{'collection_id':self.collection},self.owner);self.assertEqual(trash['items'][0]['id'],self.item)
  self.execute(self.original(action='restore'));after=self.row()
  for key in ['id','list_id','item_kind','place_id','name','notes','status','sort_order','added_at']:self.assertEqual(before[key],after[key])
  self.assertIsNone(after['deleted_at'])
 def test_03_root_restore_keeps_independent_child_trash_and_archive(self):
  self.execute();rpc('archive_family_list',{'list_id':self.collection},self.owner)
  self.execute(self.original(kind='collection'));self.assertTrue(sql('select deleted_at is not null from public.lists where id='+lit(self.collection))=='t')
  self.execute(self.original(kind='collection',action='restore'))
  self.assertEqual(sql('select archived_at is not null from public.lists where id='+lit(self.collection)),'t');self.assertIsNotNone(self.row()['deleted_at'])
 def test_04_same_original_retry_returns_original_after_newer_change(self):
  original=self.original();op=new();first=self.execute(original,op);self.execute(self.original(action='restore'))
  self.assertEqual(self.execute(original,op),first);self.assertIsNone(self.row()['deleted_at'])
  self.rejected_original({**original,'action':'restore'},op=op)
 def test_05_unknown_cancel_and_cancelled_original_never_executes(self):
  op=new();original=self.original();unknown=rpc('get_family_collection_operation_v1',{'family_id':self.family,'operation_id':op},self.owner);self.assertEqual(unknown['status'],'unknown')
  cancelled=rpc('cancel_family_collection_operation_v1',{'family_id':self.family,'operation_id':op,'original':original},self.owner);self.assertEqual(cancelled['status'],'cancelled')
  self.assertEqual(self.execute(original,op),cancelled);self.assertIsNone(self.row()['deleted_at'])
 def test_06_private_authority_and_cross_scope(self):
  for user in [self.member,self.outsider]:
   self.rejected('get_family_collection_context_v1',{'collection_id':self.collection},user,'42501')
   status,rows=request('/list_items?id=eq.'+self.item,user=user);self.assertEqual((status,rows),(200,[]))
  self.rejected('get_family_collection_item_context_v1',{'collection_id':self.collection,'item_id':new()},code='42501')
 def test_07_stale_observation_and_noop(self):
  original=self.original();self.execute(original);self.rejected_original(original)
  c=self.original();before=self.row()['revision'];r=self.execute(c);self.assertFalse(r['changed']);self.assertEqual(self.row()['revision'],before)
 def test_08_raw_deletion_truncation_and_legacy_remove_refuse(self):
  self.rejected('remove_list_item',{'item_id':self.item},code='0A000')
  for query in ['delete from public.list_items where id='+lit(self.item),'delete from public.lists where id='+lit(self.collection),'truncate public.list_items cascade','truncate family_auth.collection_root_versions cascade']:
   r=sql(query,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('0A000',r.stderr)
 def test_09_transaction_coalesces_final_item_history(self):
  before=self.row()['revision'];sql('select public.set_list_item_status('+lit(self.item)+",'want');select public.set_list_item_status("+lit(self.item)+",'visited')",self.owner)
  after=self.row();self.assertEqual(after['revision'],before+1);v=self.history()['items'];self.assertEqual(v[0]['snapshot']['status'],'visited');self.assertEqual(v[0]['revision'],after['revision']);self.assertNotIn('deleted_by_user_id',v[0]['snapshot'])
 def test_10_paging_validation(self):
  for args in [{'limit':None},{'limit':0},{'limit':101},{'before_deleted_at':'infinity','before_id':new()},{'before_id':new()}]:
   self.rejected('list_family_collection_item_trash_v1',{'collection_id':self.collection,**args},code='22023')
  for rev in [0,-1]:self.rejected('list_family_collection_versions_v1',{'collection_id':self.collection,'before_revision':rev},code='22023')
 def test_11_family_item_authority_is_distinct_from_root_authority(self):
  collection=rpc('create_family_list',{'family_id':self.family,'name':'Family shared '+new(),'visibility':'family'},self.reviewer)
  item=rpc('add_list_item',{'list_id':collection,'kind':'place','entity_id':self.place},self.member)
  c=rpc('get_family_collection_item_context_v1',{'collection_id':collection,'item_id':item},self.member)
  r=rpc('execute_family_collection_item_lifecycle_v1',{'collection_id':collection,'item_id':item,'operation_id':new(),'scope':c['scope'],'action':'trash','expected_revision':c['item']['revision'],'expected_collection_revision':c['content_revision']},self.member);self.assertTrue(r['changed'])
  self.rejected('execute_family_collection_lifecycle_v1',{'collection_id':collection,'operation_id':new(),'scope':c['scope'],'action':'trash','expected_revision':c['collection_revision']},self.member,'42501')
  self.rejected('create_family_list',{'family_id':self.family,'name':'No publication','visibility':'family'},self.member,'42501')
 def test_12_suspended_and_archived_owners_cannot_read_or_write(self):
  for table,column,value,restore,where in [
   ('public.family_members','status',"'suspended'","'active'",'family_id='+lit(self.family)+'and user_id='+lit(self.owner['id'])),
   ('public.people','archived_at','now()','null','id='+lit(self.owner['person_id']))]:
   with self.subTest(table=table):
    sql('update '+table+' set '+column+'='+value+' where '+where)
    try:
     self.rejected('get_family_collection_context_v1',{'collection_id':self.collection},code='42501')
     self.rejected('create_family_list',{'family_id':self.family,'name':'Refused'},code='42501')
     self.assertEqual(request('/list_items?id=eq.'+self.item,user=self.owner),(200,[]))
    finally:sql('update '+table+' set '+column+'='+restore+' where '+where)
 def test_13_real_password_aal1_reviewer_and_expired_session_refused(self):
  weak={**self.reviewer,'session':okay('/token?grant_type=password',{'email':self.reviewer['email'],'password':self.reviewer['password']},auth=True)}
  self.rejected('get_family_collection_context_v1',{'collection_id':self.collection},weak,'42501')
  sid=json.loads(base64.urlsafe_b64decode(self.owner['session']['access_token'].split('.')[1]+'=='))['session_id']
  sql('update auth.sessions set not_after=now()-interval\'1 minute\'where id='+lit(sid))
  try:
   self.rejected('get_family_collection_context_v1',{'collection_id':self.collection},code='42501')
   self.assertEqual(request('/lists?id=eq.'+self.collection,user=self.owner),(200,[]))
  finally:sql('update auth.sessions set not_after=now()+interval\'1 day\'where id='+lit(sid))
 def test_14_real_fresh_session_resolves_owned_outcome_but_cannot_execute_old_scope(self):
  original=self.original();op=new();r=self.execute(original,op)
  fresh={**self.owner,'session':okay('/token?grant_type=password',{'email':self.owner['email'],'password':self.owner['password']},auth=True)}
  self.assertEqual(rpc('get_family_collection_operation_v1',{'family_id':self.family,'operation_id':op},fresh),r)
  self.rejected_original(original,op,user=fresh)
  cancelled=rpc('cancel_family_collection_operation_v1',{'family_id':self.family,'operation_id':op,'original':original},fresh);self.assertEqual(cancelled,r)
  self.assertNotIn('session_id',json.dumps(cancelled));self.assertNotIn('request_sha256',json.dumps(cancelled))
 def test_15_global_admin_has_nullable_local_person_and_real_mfa(self):
  admin=self.users['global_admin'];c=self.context(user=admin);self.assertIsNone(c['scope']['person_id'])
  r=rpc('execute_family_collection_lifecycle_v1',{'collection_id':self.collection,'operation_id':new(),'scope':c['scope'],'action':'trash','expected_revision':c['collection_revision']},admin);self.assertTrue(r['changed'])
  self.rejected('get_family_collection_operation_v1',{'family_id':new(),'operation_id':new()},admin,'42501')
 def test_16_parent_state_guards_legacy_and_new_item_writers(self):
  original=self.original();rpc('archive_family_list',{'list_id':self.collection},self.owner)
  self.rejected_original(original)
  for name,args in [('set_list_item_status',{'item_id':self.item,'status':'want'}),('add_list_item',{'list_id':self.collection,'kind':'place','entity_id':self.place}),('reorder_list_items',{'list_id':self.collection,'item_ids':[self.item]})]:
   self.rejected(name,args,code='42501')
  self.assertTrue(self.history()['items']);self.execute(self.original(kind='collection'))
  self.rejected('get_family_collection_context_v1',{'collection_id':self.collection},code='42501')
 def test_17_exact_original_scope_and_arguments_refuse_mutations(self):
  original=self.original();before=self.row()
  variants=[{**original,'scope':{**original['scope'],'extra':True}},{**original,'scope':{**original['scope'],'family_id':new()}},{**original,'scope':{**original['scope'],'user_id':self.member['id']}},{**original,'scope':{**original['scope'],'person_id':None}},{**original,'scope':{**original['scope'],'session_id':new()}},{**original,'expected_revision':None},{**original,'expected_collection_revision':None}]
  for body in variants:
   with self.subTest(field_set=sorted(body['scope'])):self.rejected_original(body,code='22023'if 'extra'in body['scope']or body.get('expected_revision')is None or body.get('expected_collection_revision')is None else'PT409')
  self.assertEqual(self.row(),before)
 def test_18_operation_reuse_cross_collection_and_changed_original_refuses(self):
  original=self.original();op=new();self.execute(original,op)
  other=rpc('create_family_list',{'family_id':self.family,'name':'Other original '+new()},self.owner);c=self.context(collection=other)
  self.rejected('execute_family_collection_lifecycle_v1',{'collection_id':other,'operation_id':op,'scope':c['scope'],'action':'trash','expected_revision':c['collection_revision']},code='PT409')
  self.rejected('cancel_family_collection_operation_v1',{'family_id':self.family,'operation_id':op,'original':{**original,'action':'restore'}},code='PT409')
  self.assertEqual(rpc('get_family_collection_operation_v1',{'family_id':self.family,'operation_id':op},self.member)['status'],'unknown')
 def test_19_server_revisions_history_receipts_and_guc_spoof_refuse(self):
  for table,where in [('public.lists','id='+lit(self.collection)),('public.list_items','id='+lit(self.item))]:
   for field,value in [('revision','revision+1'),('recovery_xid','pg_current_xact_id()')]:
    r=sql('update '+table+' set '+field+'='+value+' where '+where,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('22023',r.stderr)
  r=sql("select set_config('family_auth.collection_lifecycle','1',true);update public.list_items set deleted_at=now(),deleted_by_user_id="+lit(self.owner['id'])+'where id='+lit(self.item),fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('42501',r.stderr)
  for table in ['collection_root_versions','collection_item_versions','collection_root_version_media','collection_item_version_media','collection_operation_receipts']:
   for query in ['delete from family_auth.'+table,'truncate family_auth.'+table+' cascade']:
    r=sql(query,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('0A000',r.stderr)
  r=sql('update family_auth.collection_item_versions set snapshot=\'{}\'where item_id='+lit(self.item),fail=True);self.assertNotEqual(r.returncode,0)
 def test_20_private_unchecked_helpers_and_tables_unavailable(self):
  for role in ['anon','authenticated','service_role']:
   for query in ['select *from family_auth.collection_operation_receipts','select family_auth.collection_capture_snapshot(\'item\',\'{}\')','insert into family_auth.collection_lifecycle_permits values(pg_current_xact_id(),'+lit(self.collection)+",'item',"+lit(self.item)+','+lit(self.owner['id'])+",'trash')"]:
    r=sql(query,role=role,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('42501',r.stderr)
  status,_=request('/rpc/get_family_collection_context_v1',{'p_collection_id':self.collection});self.assertIn(status,[401,403])
  broken=self.owner['session']['access_token'][:-8]+'broken!!';self.assertEqual(request('/rpc/get_family_collection_context_v1',{'p_collection_id':self.collection},token=broken)[0],401)
 def test_21_parallel_identical_original_and_conflicting_new_operations(self):
  original=self.original();op=new()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:result=list(pool.map(lambda _:self.execute(original,op),range(2)))
  self.assertEqual(result[0],result[1]);self.assertEqual(sql('select count(*)from family_auth.collection_operation_receipts where operation_id='+lit(op)),'1')
  original=self.original(action='restore');args={k:v for k,v in original.items()if k!='target_kind'}
  def attempt(_):return request('/rpc/execute_family_collection_item_lifecycle_v1',{'p_'+k:v for k,v in{**args,'operation_id':new()}.items()},self.owner)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:codes=[r[0]for r in pool.map(attempt,range(2))]
  self.assertEqual(codes.count(200),1);self.assertEqual(codes.count(409),1)
 def test_22_parallel_cancel_execute_has_one_terminal_outcome(self):
  original=self.original();op=new()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
   a=pool.submit(self.execute,original,op);b=pool.submit(rpc,'cancel_family_collection_operation_v1',{'family_id':self.family,'operation_id':op,'original':original},self.owner)
   self.assertEqual(a.result(),b.result())
  status=rpc('get_family_collection_operation_v1',{'family_id':self.family,'operation_id':op},self.owner)['status'];self.assertIn(status,['committed','cancelled'])
  self.assertEqual(self.row()['deleted_at']is not None,status=='committed')
 def test_23_late_receipt_failure_rolls_back_rows_history_and_content(self):
  original=self.original();op=new();before=self.row();count=sql('select count(*)from family_auth.collection_item_versions where item_id='+lit(self.item));content=self.item_context()['content_revision']
  sql("create function family_auth.collection_test_late_failure()returns trigger language plpgsql as $$begin raise exception 'Synthetic late receipt failure';end;$$;create trigger collection_test_late_failure before insert on family_auth.collection_operation_receipts for each row when(new.operation_id="+lit(op)+"::uuid)execute function family_auth.collection_test_late_failure()")
  try:self.rejected_original(original,op,code='P0001')
  finally:sql('drop trigger collection_test_late_failure on family_auth.collection_operation_receipts;drop function family_auth.collection_test_late_failure()')
  self.assertEqual(self.row(),before);self.assertEqual(sql('select count(*)from family_auth.collection_item_versions where item_id='+lit(self.item)),count);self.assertEqual(self.item_context()['content_revision'],content);self.assertEqual(rpc('get_family_collection_operation_v1',{'family_id':self.family,'operation_id':op},self.owner)['status'],'unknown')
 def test_24_root_metadata_and_derived_touch_do_not_double_count(self):
  before=self.context();rpc('set_list_item_status',{'item_id':self.item,'status':'want'},self.owner);after=self.context()
  self.assertEqual(after['collection_revision'],before['collection_revision']);self.assertEqual(after['content_revision'],before['content_revision']+1)
  rpc('update_family_list',{'list_id':self.collection,'name':'Renamed '+new()},self.owner);self.assertEqual(self.context()['collection_revision'],before['collection_revision']+1)
  row=self.row();rpc('set_list_item_status',{'item_id':self.item,'status':'want'},self.owner);self.assertEqual(self.row(),row)
 def test_25_raw_service_path_cannot_erase_retained_content(self):
  for query in ['delete from public.list_items where id='+lit(self.item),'delete from public.lists where id='+lit(self.collection),'truncate public.list_items cascade']:
   r=sql(query,role='service_role',fail=True);self.assertNotEqual(r.returncode,0);self.assertTrue('0A000'in r.stderr or'42501'in r.stderr)
 def wait_for(self,query):
  end=time.monotonic()+8
  while time.monotonic()<end:
   if sql(query)=='t':return
   time.sleep(.025)
  self.fail('Expected owned concurrent database wait was not observed')
 def test_26_revocation_while_waiting_rechecks_current_authority(self):
  sid=json.loads(base64.urlsafe_b64decode(self.owner['session']['access_token'].split('.')[1]+'=='))['session_id']
  for table,field,value,restore,where in [
   ('public.family_members','status',"'suspended'","'active'",'family_id='+lit(self.family)+' and user_id='+lit(self.owner['id'])),
   ('public.family_members','role',"'parent'","'child'",'family_id='+lit(self.family)+' and user_id='+lit(self.owner['id'])),
   ('public.people','archived_at','now()','null','id='+lit(self.owner['person_id'])),
   ('auth.sessions','not_after',"now()-interval '1 second'","now()+interval '1 day'",'id='+lit(sid))]:
   with self.subTest(authority=table):
    original=self.original();args={k:v for k,v in original.items()if k!='target_kind'};args['operation_id']=new();tag='collection-lock-'+new()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
     holder=pool.submit(sql,'BEGIN;set application_name='+lit(tag)+';select id from public.lists where id='+lit(self.collection)+'for update;select pg_sleep(2);COMMIT;')
     self.wait_for('select exists(select 1 from pg_stat_activity where application_name='+lit(tag)+"and wait_event='PgSleep')")
     command=pool.submit(request,'/rpc/execute_family_collection_item_lifecycle_v1',{'p_'+k:v for k,v in args.items()},self.owner)
     self.wait_for("select exists(select 1 from pg_stat_activity where datname='collection_recovery_candidate'and wait_event_type='Lock'and query like '%execute_family_collection_item_lifecycle_v1%')")
     sql('update '+table+' set '+field+'='+value+' where '+where)
     try:
      status,b=command.result();self.assertEqual((status,b.get('code')),(403,'42501'));holder.result();self.assertIsNone(self.row()['deleted_at'])
     finally:sql('update '+table+' set '+field+'='+restore+' where '+where)
 def media(self):
  asset=new();path=self.family+'/lists/'+self.collection+'/'+asset+'.webp'
  sql('insert into public.media_assets(id,kind,visibility,bucket,storage_path,filename,content_hash,mime_type,size_bytes,family_id)values('+lit(asset)+",'image','family','family',"+lit(path)+",'cover.webp',"+lit(uuid.uuid4().hex*2)+",'image/webp',64,"+lit(self.family)+')')
  return asset,path
 def job(self,asset,path):
  return sql('insert into public.storage_cleanup_jobs(family_id,bucket_id,object_path,kind,status,resource_type,resource_id,locked_by,locked_at)values('+lit(self.family)+",'family',"+lit(path)+",'unref_private_asset','processing','media_assets',"+lit(asset)+",'collection-test-worker',now())returning id")
 def arm(self,job):return json.loads(sql('select public.revalidate_storage_cleanup_job('+lit(job)+",'collection-test-worker')"))
 def test_27_root_cover_versions_retain_media_after_cover_replacement(self):
  asset,path=self.media();rpc('update_family_list',{'list_id':self.collection,'cover_media_id':asset},self.owner)
  rpc('update_family_list',{'list_id':self.collection,'clear_cover':True},self.owner)
  self.assertEqual(sql('select family_auth.private_media_is_referenced('+lit(asset)+')'),'t')
  self.assertEqual(self.arm(self.job(asset,path))['action'],'skip')
  self.assertGreater(int(sql('select count(*)from family_auth.collection_root_version_media where media_asset_id='+lit(asset))),0)
  r=sql('delete from public.media_assets where id='+lit(asset),fail=True);self.assertNotEqual(r.returncode,0)
 def test_28_armed_worker_wins_before_new_reference_and_hold_wins_before_worker(self):
  asset,path=self.media();job=self.job(asset,path);self.assertEqual(self.arm(job)['action'],'delete')
  self.rejected('update_family_list',{'list_id':self.collection,'cover_media_id':asset},code='55000')
  asset,path=self.media();job=self.job(asset,path);tag='collection-media-lock-'+new()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
   holder=pool.submit(sql,'BEGIN;set application_name='+lit(tag)+';update public.lists set cover_media_id='+lit(asset)+'where id='+lit(self.collection)+';select pg_sleep(2);COMMIT;')
   self.wait_for('select exists(select 1 from pg_stat_activity where application_name='+lit(tag)+"and wait_event='PgSleep')")
   worker=pool.submit(self.arm,job);self.wait_for("select exists(select 1 from pg_stat_activity where datname='collection_recovery_candidate'and wait_event_type='Lock'and query like '%revalidate_storage_cleanup_job%')")
   holder.result();self.assertEqual(worker.result()['action'],'skip')
  self.assertEqual(sql('select delete_armed_at is null from public.storage_cleanup_jobs where id='+lit(job)),'t')
 def test_29_all_eight_catalog_cascades_are_blocked_and_typed_checks_remain(self):
  country=sql('select id from public.countries order by id limit 1')
  for kind,table in [('country','countries'),('place','places'),('food','foods'),('hotel','hotels'),('experience','experiences'),('airport','airports'),('airline','airlines'),('guide','guides')]:
   with self.subTest(kind=kind):
    extra_cols='';extra_values=''
    if kind=='country':
     code=sql("select a||b from unnest(string_to_array('Q,W,E,R,T,Y,U,I,O,P,A,S,D,F,G,H,J,K,L,Z,X,C,V,B,N,M',','))a cross join unnest(string_to_array('A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z',','))b where not exists(select 1 from public.countries where iso2=a||b)limit 1")
     iso3=sql("select 'Q'||a||b from unnest(string_to_array('A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z',','))a cross join unnest(string_to_array('A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z',','))b where not exists(select 1 from public.countries where iso3='Q'||a||b)limit 1")
     extra_cols=',iso2,iso3';extra_values=','+lit(code)+','+lit(iso3)
    if kind=='place':extra_cols=',country_id';extra_values=','+lit(country)
    if kind=='airport':
     code=sql("select 'Q'||a||b from unnest(string_to_array('A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z',','))a cross join unnest(string_to_array('A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z',','))b where not exists(select 1 from public.airports where iata_code='Q'||a||b)limit 1");extra_cols=',iata_code';extra_values=','+lit(code)
    target=sql('insert into public.'+table+'(name'+extra_cols+')values('+lit('Collection cascade '+new())+extra_values+')returning id')
    item=rpc('add_list_item',{'list_id':self.collection,'kind':kind,'entity_id':target},self.owner)
    r=sql('delete from public.'+table+' where id='+lit(target),fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('0A000',r.stderr)
    self.assertEqual(sql('select count(*)from public.list_items where id='+lit(item)),'1')
  self.execute()
  self.rejected('add_list_item',{'list_id':self.collection,'kind':'place','entity_id':self.place},code='23505')
  for query in ["insert into public.list_items(list_id,item_kind,place_id)values("+lit(self.collection)+",'food',"+lit(self.place)+')',"insert into public.list_items(list_id,item_kind,place_id,country_id)values("+lit(self.collection)+",'place',"+lit(self.place)+','+lit(country)+')']:
   r=sql(query,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('23514',r.stderr)
 def test_30_exact_trash_and_version_pagination_and_foreign_cursor(self):
  self.execute();other_place=sql('select id from public.places where id<>'+lit(self.place)+' order by id limit 1')
  other=rpc('add_list_item',{'list_id':self.collection,'kind':'place','entity_id':other_place},self.owner);c=rpc('get_family_collection_item_context_v1',{'collection_id':self.collection,'item_id':other},self.owner)
  rpc('execute_family_collection_item_lifecycle_v1',{'collection_id':self.collection,'item_id':other,'operation_id':new(),'scope':c['scope'],'action':'trash','expected_revision':c['item']['revision'],'expected_collection_revision':c['content_revision']},self.owner)
  page=rpc('list_family_collection_item_trash_v1',{'collection_id':self.collection,'limit':1},self.owner);self.assertIsNotNone(page['next_cursor']);next_page=rpc('list_family_collection_item_trash_v1',{'collection_id':self.collection,'limit':1,**page['next_cursor']},self.owner)
  self.assertEqual({page['items'][0]['id'],next_page['items'][0]['id']},{self.item,other});self.assertIsNone(next_page['next_cursor'])
  self.rejected('list_family_collection_item_trash_v1',{'collection_id':self.collection,'before_deleted_at':page['next_cursor']['before_deleted_at'],'before_id':new()},code='22023')
  page=self.history(limit=1);self.assertIsNotNone(page['next_cursor']);self.assertLess(self.history(limit=1,**page['next_cursor'])['items'][0]['revision'],page['items'][0]['revision'])
  self.execute(self.original(kind='collection'));roots=rpc('list_family_collection_trash_v1',{'family_id':self.family,'limit':1},self.owner);self.assertEqual(roots['items'][0]['id'],self.collection)
 def test_31_oversized_retained_text_kept_but_history_response_is_bounded(self):
  sql('update public.list_items set notes=repeat(\'x\',8500000)where id='+lit(self.item))
  self.assertEqual(self.item_context()['item']['id'],self.item);self.execute();self.assertEqual(sql('select octet_length(notes)from public.list_items where id='+lit(self.item)),'8500000')
  self.rejected('list_family_collection_versions_v1',{'collection_id':self.collection,'item_id':self.item},code='54000')
 def test_32_late_deferred_history_failure_rolls_back_acknowledgement(self):
  original=self.original();op=new();before=self.row()
  sql("create function family_auth.collection_test_history_failure()returns trigger language plpgsql as $$begin raise exception 'Synthetic deferred history failure';end;$$;create trigger collection_test_history_failure before insert on family_auth.collection_item_versions for each row when(new.item_id="+lit(self.item)+"::uuid)execute function family_auth.collection_test_history_failure()")
  try:self.rejected_original(original,op,code='P0001')
  finally:sql('drop trigger collection_test_history_failure on family_auth.collection_item_versions;drop function family_auth.collection_test_history_failure()')
  self.assertEqual(self.row(),before);self.assertEqual(rpc('get_family_collection_operation_v1',{'family_id':self.family,'operation_id':op},self.owner)['status'],'unknown')
 def test_33_deleted_real_session_and_unknown_fields_refuse(self):
  fresh={**self.owner,'session':okay('/token?grant_type=password',{'email':self.owner['email'],'password':self.owner['password']},auth=True)}
  sid=json.loads(base64.urlsafe_b64decode(fresh['session']['access_token'].split('.')[1]+'=='))['session_id'];sql('delete from auth.sessions where id='+lit(sid))
  self.rejected('get_family_collection_context_v1',{'collection_id':self.collection},fresh,'42501')
  self.rejected('get_family_collection_context_v1',{'collection_id':self.collection,'state':'unknown'},code='22023')
  q='select family_auth.collection_entry(\'context\','+lit(json.dumps({'collection_id':self.collection,'state':'active','extra':True}))+')'
  r=sql(q,user=self.owner,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('22023',r.stderr)
 def test_34_retained_media_identity_and_new_lifecycle_cannot_be_forged(self):
  asset,path=self.media();rpc('update_family_list',{'list_id':self.collection,'cover_media_id':asset},self.owner);rpc('update_family_list',{'list_id':self.collection,'clear_cover':True},self.owner)
  for field,value in [('storage_path',lit(path+'-changed')),('content_hash',lit('f'*64)),('bucket',lit('elsewhere'))]:
   r=sql('update public.media_assets set '+field+'='+value+' where id='+lit(asset),fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('0A000',r.stderr)
  r=sql('insert into public.lists(family_id,name,lifecycle_revision)values('+lit(self.family)+",'Forged initial lifecycle',1)",fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('22023',r.stderr)
 def test_35_global_role_and_mfa_revocation_during_parent_wait(self):
  admin=self.users['global_admin']
  for table,field,value,restore,where in [('public.profiles','is_super_admin','false','true','id='+lit(admin['id'])),('auth.mfa_factors','status',"'unverified'","'verified'",'id='+lit(admin['factor_id']))]:
   with self.subTest(authority=table):
    c=self.context(user=admin);args={'collection_id':self.collection,'operation_id':new(),'scope':c['scope'],'action':'trash','expected_revision':c['collection_revision']};tag='collection-admin-lock-'+new()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
     holder=pool.submit(sql,'BEGIN;set application_name='+lit(tag)+';select id from public.lists where id='+lit(self.collection)+' for update;select pg_sleep(2);COMMIT;')
     self.wait_for('select exists(select 1 from pg_stat_activity where application_name='+lit(tag)+"and wait_event='PgSleep')")
     command=pool.submit(request,'/rpc/execute_family_collection_lifecycle_v1',{'p_'+k:v for k,v in args.items()},admin)
     self.wait_for("select exists(select 1 from pg_stat_activity where datname='collection_recovery_candidate'and wait_event_type='Lock'and query like '%execute_family_collection_lifecycle_v1%')")
     sql('update '+table+' set '+field+'='+value+' where '+where)
     try:
      status,b=command.result();self.assertEqual((status,b.get('code')),(403,'42501'));holder.result()
     finally:sql('update '+table+' set '+field+'='+restore+' where '+where)

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(CollectionRecovery);r=unittest.TextTestRunner(verbosity=2).run(suite)
 (S/'qualification-summary.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped),'calls':COUNTS,'real_GoTrue_PostgREST':True,'browser_UI_proof':False},indent=2)+'\n');sys.exit(not r.wasSuccessful())
