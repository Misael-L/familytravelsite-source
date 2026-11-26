"""Storage qualification only: no public content writer is introduced."""
from collection_location_support import *
import unittest,concurrent.futures

def fixture_write(query,user=None,fail=False):
 if user:
  claims=json.loads(base64.urlsafe_b64decode(user['session']['access_token'].split('.')[1]+'=='))
  query='begin;select set_config(\'request.jwt.claims\','+lit(json.dumps(claims))+',true);'+query+';commit;'
 return sql(query,fail=fail)

class CollectionLocation(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  f=setup_users();cls.family=f['family'];cls.other=f['other_family'];cls.users=f['users'];cls.place=sql('select id from public.places order by id limit 1')
 def setUp(self):
  self.owner=self.users['owner'];self.member=self.users['member'];self.collection=rpc('create_family_list',{'family_id':self.family,'name':'Location '+new()},self.owner)
  self.item=rpc('add_list_item',{'list_id':self.collection,'kind':'place','entity_id':self.place},self.owner)
  sql('update public.list_items set name=\'Saved location\',notes=\'Personal note\' where id='+lit(self.item))
 def child_insert(self,item=None,extra=None):
  values={'item_id':item or self.item,'list_id':self.collection,'family_id':self.family,**(extra or {})}
  return 'insert into public.list_item_locations('+','.join(values)+')values('+','.join('NULL'if v is None else lit(v)for v in values.values())+')'
 def child(self,item=None):return json.loads(sql('select to_jsonb(x)from public.list_item_locations x where item_id='+lit(item or self.item)))
 def row(self):return json.loads(sql('select to_jsonb(i)from public.list_items i where id='+lit(self.item)))
 def history(self):return rpc('list_family_collection_versions_v1',{'collection_id':self.collection,'item_id':self.item},self.owner)['items']
 def rejected(self,query,code=None,user=None):
  r=fixture_write(query,user,fail=True);self.assertNotEqual(r.returncode,0)
  if code:self.assertIn(code,r.stderr)
 def materialize(self,extra=None,user=None):fixture_write(self.child_insert(extra=extra),user)
 def context(self):return rpc('get_family_collection_item_context_v1',{'collection_id':self.collection,'item_id':self.item},self.owner)
 def lifecycle(self,action):
  c=self.context();return rpc('execute_family_collection_item_lifecycle_v1',{'collection_id':self.collection,'item_id':self.item,'operation_id':new(),'scope':c['scope'],'action':action,'expected_revision':c['item']['revision'],'expected_collection_revision':c['content_revision']},self.owner)
 def test_01_reference_then_explicit_empty_snapshot(self):
  self.assertEqual(sql('select count(*)from public.list_item_locations where item_id='+lit(self.item)),'0');self.assertIsNone(self.history()[0]['location_snapshot'])
  self.materialize({'description':'','website':'','address':None,'phone':''});c=self.child();self.assertEqual(c['description'],'');self.assertEqual(c['website'],'');self.assertIsNone(c['address']);self.assertEqual(c['phone'],'');self.assertNotIn('name',c);self.assertNotIn('notes',c)
  h=self.history();self.assertEqual(h[0]['location_snapshot']['description'],'');self.assertIsNone(h[1]['location_snapshot'])
 def test_02_manual_requires_complete_child_before_commit(self):
  item=new();base='insert into public.list_items(id,list_id,item_kind,name,notes)values('+lit(item)+','+lit(self.collection)+",'manual','Manual point','Manual personal notes')"
  self.rejected(base,'23514');self.assertEqual(sql('select count(*)from public.list_items where id='+lit(item)),'0')
  sql('begin;'+base+';'+self.child_insert(item,{'description':'Independent description','latitude':'19.04379848','longitude':'-98.19815123'})+';commit;')
  self.assertEqual(self.child(item)['description'],'Independent description');self.assertEqual(sql('select revision from public.list_items where id='+lit(item)),'1')
  self.assertEqual(sql('select count(*)from family_auth.collection_item_versions where item_id='+lit(item)),'1')
 def test_03_manual_forbids_catalog_targets_and_blank_names(self):
  for name in ['',' padded ','x'*501]:
   self.rejected('insert into public.list_items(list_id,item_kind,name)values('+lit(self.collection)+",'manual',"+lit(name)+')','23514')
  self.rejected('insert into public.list_items(list_id,item_kind,name,place_id)values('+lit(self.collection)+",'manual','Wrong source',"+lit(self.place)+')','23514')
 def test_04_child_kind_and_scope(self):
  country=sql('select id from public.countries order by id limit 1');item=rpc('add_list_item',{'list_id':self.collection,'kind':'country','entity_id':country},self.owner)
  sql('update public.list_items set name=\'Country reference\'where id='+lit(item));self.rejected(self.child_insert(item),'23514')
  self.rejected(self.child_insert(extra={'family_id':self.other}),'23514')
  collection=rpc('create_family_list',{'family_id':self.family,'name':'Other scope '+new()},self.owner);self.rejected(self.child_insert(extra={'list_id':collection}),'23503')
 def test_05_child_and_parent_identity_are_immutable(self):
  self.materialize()
  for col,value in [('item_id',new()),('list_id',new()),('family_id',self.other)]:self.rejected('update public.list_item_locations set '+col+'='+lit(value)+'where item_id='+lit(self.item),'23514')
  for col,value in [('item_kind','manual'),('place_id',new())]:self.rejected('update public.list_items set '+col+'='+lit(value)+'where id='+lit(self.item),'23514')
 def test_06_coordinates_pair_range_and_storage_precision(self):
  for values in [{'latitude':'1'},{'longitude':'1'},{'latitude':'90.00000001','longitude':'0'},{'latitude':'0','longitude':'180.00000001'},{'latitude':'NaN','longitude':'0'}]:self.rejected(self.child_insert(extra=values),'23514')
  self.materialize({'latitude':'19.04379848','longitude':'-98.19815123'});self.assertEqual(sql('select latitude::text||\',\'||longitude::text from public.list_item_locations where item_id='+lit(self.item)),'19.04379848,-98.19815123')
 def test_07_text_bounds_and_multibyte_whitespace(self):
  for field,value in [('description','x'*20001),('address','x'*2001),('phone','x'*101)]:self.rejected(self.child_insert(extra={field:value}),'23514')
  text='  **漢**\n\nkept spacing  ';self.materialize({'description':text,'address':'','phone':''});self.assertEqual(self.child()['description'],text)
  sql('update public.list_items set notes='+lit('漢'*20000)+'where id='+lit(self.item));self.assertEqual(sql('select char_length(notes)from public.list_items where id='+lit(self.item)),'20000')
  self.rejected('update public.list_items set notes='+lit('x'*20001)+'where id='+lit(self.item),'23514')
 def test_08_canonical_websites_without_rewriting(self):
  accepted=['','https://example.com/','http://localhost:8080/path?q=a%20b#tag','https://xn--bcher-kva.example/a','https://[2001:db8::1]/path','https://127.0.0.1/']
  rejected=['javascript:alert(1)','ftp://example.com/','https://user:pass@example.com/','HTTPS://example.com/','https://EXAMPLE.com/','https://example.com','https://example.com:443/','https://example.com:99999/','https://example.com/a b','https://example.com/a/../b','https://example.com/%GG','https://example.com\\bad/']
  self.materialize()
  for value in accepted:sql('update public.list_item_locations set website='+lit(value)+'where item_id='+lit(self.item));self.assertEqual(self.child()['website'],value)
  for value in rejected:self.rejected('update public.list_item_locations set website='+lit(value)+'where item_id='+lit(self.item),'23514')
 def test_09_full_old_and_final_new_child_history(self):
  self.materialize({'description':'Old address description','address':'Old address'});before=self.row()['revision']
  sql('begin;update public.list_item_locations set description=\'Intermediate\'where item_id='+lit(self.item)+';update public.list_item_locations set description=\'Final description\',address=\'Final address\'where item_id='+lit(self.item)+';commit;')
  h=self.history();self.assertEqual(self.row()['revision'],before+1);self.assertEqual(h[0]['location_snapshot']['description'],'Final description');self.assertEqual(h[1]['location_snapshot']['description'],'Old address description');self.assertNotIn('Intermediate',[v['location_snapshot']['description']for v in h if v['location_snapshot']])
 def test_10_noop_does_not_bump_or_leave_permits(self):
  self.materialize({'description':'Same'});before=self.row();context=self.context();sql('update public.list_item_locations set description=description where item_id='+lit(self.item))
  self.assertEqual(self.row(),before);self.assertEqual(self.context()['content_revision'],context['content_revision']);self.assertEqual(sql('select count(*)from family_auth.collection_content_permits'),'0')
 def test_11_trash_restore_retains_child_and_hides_raw_reads(self):
  self.materialize({'description':'Retained','latitude':'0','longitude':'0'});before=self.child();self.lifecycle('trash');self.assertEqual(request('/list_item_locations?item_id=eq.'+self.item,user=self.owner),(200,[]));self.assertEqual(self.child(),before)
  self.rejected('update public.list_item_locations set description=\'Denied\'where item_id='+lit(self.item),'PT409');self.lifecycle('restore');self.assertEqual(self.child(),before)
 def test_12_root_archive_and_raw_write_roles_remain_gated(self):
  self.materialize();rpc('archive_family_list',{'list_id':self.collection},self.owner);self.rejected('update public.list_item_locations set description=\'Denied\'where item_id='+lit(self.item),'PT409')
  for role in ['anon','authenticated','service_role']:
   r=sql('update public.list_item_locations set description=\'Denied\'where item_id='+lit(self.item),role=role,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('42501',r.stderr)
 def test_13_active_read_authority_and_typed_trigger_authority(self):
  self.materialize(user=self.owner);self.assertEqual(request('/list_item_locations?item_id=eq.'+self.item,user=self.owner)[0],200);self.assertEqual(request('/list_item_locations?item_id=eq.'+self.item,user=self.member),(200,[]))
  self.rejected('update public.list_item_locations set description=\'No\'where item_id='+lit(self.item),'42501',self.member)
  sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']))
  try:
   self.rejected('update public.list_item_locations set description=\'No\'where item_id='+lit(self.item),'42501',self.owner)
   self.rejected('update public.list_item_locations set description=description where item_id='+lit(self.item),'42501',self.owner)
   self.assertEqual(request('/list_item_locations?item_id=eq.'+self.item,user=self.owner),(200,[]))
  finally:sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']))
 def category(self,family=None):
  icon=sql('select unnest(family_auth.place_category_icon_keys())limit 1')
  return sql('insert into public.family_place_categories(family_id,name,color_hex,icon_key)values('+lit(family or self.family)+','+lit('Category '+new())+",'#123abc',"+lit(icon)+')returning id')
 def test_14_category_scope_and_historical_display_snapshot(self):
  foreign=self.category(self.other);self.rejected(self.child_insert(extra={'family_place_category_id':foreign}),'23503')
  category=self.category();self.materialize({'family_place_category_id':category});old=self.history()[0]['location_snapshot']['category_snapshot'];renamed='Renamed category '+new();sql('update public.family_place_categories set name='+lit(renamed)+'where id='+lit(category));sql('update public.list_item_locations set address=\'New address\'where item_id='+lit(self.item))
  h=self.history();self.assertEqual(h[0]['location_snapshot']['category_snapshot']['name'],renamed);self.assertEqual(h[1]['location_snapshot']['category_snapshot'],old)
  self.rejected('delete from public.family_place_categories where id='+lit(category),'23503')
 def media(self,family=None,visibility='family'):
  asset=new();fam=family or self.family;path=fam+'/lists/'+self.collection+'/'+asset+'.webp';sql('insert into public.media_assets(id,kind,visibility,bucket,storage_path,filename,content_hash,mime_type,size_bytes,family_id)values('+lit(asset)+",'image',"+lit(visibility)+",'family',"+lit(path)+",'cover.webp',"+lit(uuid.uuid4().hex*2)+",'image/webp',64,"+lit(fam)+')');return asset,path
 def test_15_wrong_family_and_trip_private_media_refuse(self):
  for family,visibility in [(self.other,'family'),(self.family,'trip_private')]:
   asset,_=self.media(family,visibility);self.rejected(self.child_insert(extra={'cover_media_id':asset}),'42501')
 def test_16_cover_replacement_keeps_historical_original(self):
  asset,path=self.media();self.materialize({'cover_media_id':asset});sql('update public.list_item_locations set cover_media_id=null where item_id='+lit(self.item))
  self.assertEqual(sql('select family_auth.private_media_is_referenced('+lit(asset)+')'),'t');self.assertGreater(int(sql('select count(*)from family_auth.collection_item_version_media where media_asset_id='+lit(asset))),0)
  self.rejected('delete from public.media_assets where id='+lit(asset),'23503');self.rejected('update public.media_assets set storage_path='+lit(path+'-changed')+'where id='+lit(asset),'0A000')
 def job(self,asset,path):return sql('insert into public.storage_cleanup_jobs(family_id,bucket_id,object_path,kind,status,resource_type,resource_id,locked_by,locked_at)values('+lit(self.family)+",'family',"+lit(path)+",'unref_private_asset','processing','media_assets',"+lit(asset)+",'content-test-worker',now())returning id")
 def arm(self,job):return json.loads(sql('select public.revalidate_storage_cleanup_job('+lit(job)+",'content-test-worker')"))
 def test_17_already_armed_object_refuses_child_reference(self):
  asset,path=self.media();job=self.job(asset,path);self.assertEqual(self.arm(job)['action'],'delete');before=self.row();self.rejected(self.child_insert(extra={'cover_media_id':asset}),'55000');self.assertEqual(self.row(),before)
 def test_18_late_history_failure_rolls_back_child_and_parent(self):
  self.materialize({'description':'Old'});before=self.row();child=self.child();revision=self.context()['content_revision']
  sql("create function family_auth.collection_content_test_failure()returns trigger language plpgsql as $$begin raise exception 'Synthetic content history failure';end;$$;create trigger collection_content_test_failure before insert on family_auth.collection_item_versions for each row when(new.item_id="+lit(self.item)+"::uuid)execute function family_auth.collection_content_test_failure()")
  try:self.rejected('update public.list_item_locations set description=\'Never committed\'where item_id='+lit(self.item),'P0001')
  finally:sql('drop trigger collection_content_test_failure on family_auth.collection_item_versions;drop function family_auth.collection_content_test_failure()')
  self.assertEqual(self.row(),before);self.assertEqual(self.child(),child);self.assertEqual(self.context()['content_revision'],revision);self.assertEqual(sql('select count(*)from family_auth.collection_content_permits'),'0')
 def test_19_physical_child_removal_and_unauthorized_permits_refuse(self):
  self.materialize();self.rejected('delete from public.list_item_locations where item_id='+lit(self.item),'0A000');self.rejected('truncate public.list_item_locations cascade','0A000')
  for role in ['anon','authenticated','service_role']:
   r=sql('insert into family_auth.collection_content_permits values(pg_current_xact_id(),'+lit(self.item)+','+lit(self.collection)+')',role=role,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('42501',r.stderr)
 def test_20_catalog_edits_do_not_replace_kept_content(self):
  country=sql('select id from public.countries order by id limit 1');place=sql('insert into public.places(name,country_id,notes)values('+lit('Synthetic original '+new())+','+lit(country)+",'Catalog description')returning id")
  item=rpc('add_list_item',{'list_id':self.collection,'kind':'place','entity_id':place},self.owner);sql('begin;update public.list_items set name=\'Kept label\'where id='+lit(item)+';'+self.child_insert(item,{'description':'Kept description'})+';commit;')
  sql('update public.places set name='+lit('Changed catalog '+new())+",notes='Changed catalog description'where id="+lit(place));self.assertEqual(self.child(item)['description'],'Kept description');self.assertEqual(sql('select name from public.list_items where id='+lit(item)),'Kept label');self.rejected('delete from public.places where id='+lit(place),'23503')
 def test_21_explicit_immediate_capture_cannot_silently_keep_half_state(self):
  self.materialize({'description':'Old'});before=self.child();self.rejected('begin;set constraints all immediate;update public.list_item_locations set description=\'New\'where item_id='+lit(self.item)+';commit;','PT409');self.assertEqual(self.child(),before)
 def test_22_parent_fields_and_child_changes_share_final_revision(self):
  self.materialize({'description':'Old'});before=self.row()['revision'];sql('begin;update public.list_items set notes=\'New personal note\'where id='+lit(self.item)+';update public.list_item_locations set description=\'New description\'where item_id='+lit(self.item)+';commit;')
  h=self.history();self.assertEqual(self.row()['revision'],before+1);self.assertEqual(h[0]['snapshot']['notes'],'New personal note');self.assertEqual(h[0]['location_snapshot']['description'],'New description');self.assertEqual(h[1]['location_snapshot']['description'],'Old')
 def wait_for(self,query):
  end=time.monotonic()+8
  while time.monotonic()<end:
   if sql(query)=='t':return
   time.sleep(.025)
  self.fail('Expected owned database wait was not observed')
 def test_23_child_hold_wins_before_cleanup_revalidation(self):
  self.materialize();asset,path=self.media();job=self.job(asset,path);tag='content-hold-'+new()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
   holder=pool.submit(sql,'begin;set application_name='+lit(tag)+';update public.list_item_locations set cover_media_id='+lit(asset)+'where item_id='+lit(self.item)+';select pg_sleep(2);commit;')
   self.wait_for('select exists(select 1 from pg_stat_activity where application_name='+lit(tag)+"and wait_event='PgSleep')")
   worker=pool.submit(self.arm,job);self.wait_for("select exists(select 1 from pg_stat_activity where datname='collection_content_candidate'and wait_event_type='Lock'and query like '%revalidate_storage_cleanup_job%')")
   holder.result();self.assertEqual(worker.result()['action'],'skip')
  self.assertEqual(sql('select delete_armed_at is null from public.storage_cleanup_jobs where id='+lit(job)),'t')
 def test_24_revocation_while_child_waits_on_root(self):
  self.materialize();tag='content-authority-'+new()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
   holder=pool.submit(sql,'begin;set application_name='+lit(tag)+';select id from public.lists where id='+lit(self.collection)+'for update;select pg_sleep(2);commit;')
   self.wait_for('select exists(select 1 from pg_stat_activity where application_name='+lit(tag)+"and wait_event='PgSleep')")
   command=pool.submit(fixture_write,'update public.list_item_locations set description=\'Refused\'where item_id='+lit(self.item),self.owner,True)
   self.wait_for("select exists(select 1 from pg_stat_activity where datname='collection_content_candidate'and wait_event_type='Lock'and query like '%list_item_locations%')")
   sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']))
   try:r=command.result();holder.result();self.assertNotEqual(r.returncode,0);self.assertIn('42501',r.stderr)
   finally:sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']))
  self.assertIsNone(self.child()['description'])
 def test_25_concurrent_child_edits_preserve_both_fields_and_versions(self):
  self.materialize({'description':'Old','address':'Old'});before=self.row()['revision']
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
   a=pool.submit(sql,'update public.list_item_locations set description=\'New description\'where item_id='+lit(self.item));b=pool.submit(sql,'update public.list_item_locations set address=\'New address\'where item_id='+lit(self.item));a.result();b.result()
  self.assertEqual(self.child()['description'],'New description');self.assertEqual(self.child()['address'],'New address');self.assertEqual(self.row()['revision'],before+2);self.assertEqual(self.history()[2]['location_snapshot']['description'],'Old')
 def test_26_all_location_catalog_kinds_accept_independent_content(self):
  for kind,table in [('food','foods'),('hotel','hotels'),('experience','experiences')]:
   target=sql('insert into public.'+table+'(name)values('+lit('Content '+new())+')returning id');item=rpc('add_list_item',{'list_id':self.collection,'kind':kind,'entity_id':target},self.owner)
   sql('begin;update public.list_items set name='+lit('Saved '+kind)+'where id='+lit(item)+';'+self.child_insert(item,{'description':'Own '+kind})+';commit;');self.assertEqual(self.child(item)['description'],'Own '+kind)
 def test_27_failed_child_constraint_leaves_no_parent_history_or_counter(self):
  self.materialize({'description':'Kept'});parent=self.row();child=self.child();revision=self.context()['content_revision'];history=self.history()
  self.rejected('update public.list_item_locations set latitude=1,longitude=null where item_id='+lit(self.item),'23514')
  self.assertEqual(self.row(),parent);self.assertEqual(self.child(),child);self.assertEqual(self.context()['content_revision'],revision);self.assertEqual(self.history(),history);self.assertEqual(sql('select count(*)from family_auth.collection_content_permits'),'0')
 def test_28_referenced_media_cannot_change_family_or_be_silently_published(self):
  for field,value in [('family_id',self.other),('visibility','public_catalog')]:
   with self.subTest(field=field):
    self.item=rpc('add_list_item',{'list_id':self.collection,'kind':'food','entity_id':sql('insert into public.foods(name)values('+lit('Scope fixture '+new())+')returning id')},self.owner);sql('update public.list_items set name=\'Scope fixture\'where id='+lit(self.item))
    asset,_=self.media();self.materialize({'cover_media_id':asset})
    self.rejected('update public.media_assets set '+field+'='+lit(value)+'where id='+lit(asset),'0A000')

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(CollectionLocation);r=unittest.TextTestRunner(verbosity=2).run(suite)
 (S/'content-qualification-summary.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped),'calls':COUNTS,'real_local_Auth_REST_reads_and_lifecycle':True,'content_mutations':'trusted SQL fixtures only; no public content writer introduced','browser_UI_proof':False},indent=2)+'\n');sys.exit(not r.wasSuccessful())
