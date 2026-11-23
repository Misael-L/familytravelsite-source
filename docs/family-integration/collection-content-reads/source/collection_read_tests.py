"""Real local read APIs, explicit snapshot semantics, bounds and exact membership."""
from collection_read_support import *
from collection_read_regressions import load_content
import unittest,concurrent.futures
Base=load_content().CollectionLocation
class CollectionReads(Base):
 def setUp(self):
  self.owner=self.users['owner'];self.member=self.users['member'];self.collection=rpc('create_family_list',{'family_id':self.family,'name':'Read '+new()},self.owner)
  self.food=sql('insert into public.foods(name,notes,address,latitude,longitude,place_id)values('+lit('Meal '+new())+",'Catalog description','Venue street',21.12345678,-100.12345678,"+lit(self.place)+')returning id')
  self.item=rpc('add_list_item',{'list_id':self.collection,'kind':'food','entity_id':self.food},self.owner);sql("update public.list_items set name='Saved meal',notes='Personal note'where id="+lit(self.item))
 def page(self,user=None,**kw):return rpc('get_family_collection_page_v1',{'collection_id':self.collection,**kw},user or self.owner)
 def editor(self,user=None,**kw):return rpc('get_family_collection_editor_v1',{'collection_id':self.collection,'item_id':self.item,**kw},user or self.owner)
 def membership(self,identity=None,user=None,family=None):return rpc('get_family_collection_membership_v1',{'family_id':family or self.family,'identity':{'kind':'food','id':self.food}if identity is None else identity},user or self.owner)
 def refuse(self,api,args,code,user=None,token=None):
  status,b=request('/rpc/'+api,{'p_'+k:v for k,v in args.items()},user or self.owner,token=token);self.assertGreaterEqual(status,400);self.assertEqual(b.get('code'),code,b);return b
 def p_args(self,**kw):return{'collection_id':self.collection,**kw}
 def m_args(self,identity=None):return{'family_id':self.family,'identity':{'kind':'food','id':self.food}if identity is None else identity}
 def manual(self,name='Manual',order=0):
  item=new();sql('begin;insert into public.list_items(id,list_id,item_kind,name,sort_order)values('+lit(item)+','+lit(self.collection)+",'manual',"+lit(name)+','+str(order)+');'+self.child_insert(item,{'description':'Manual description'})+';commit;');return item
 def trip(self,manual=False,family=None):
  family=family or self.family;trip=sql('insert into public.trips(family_id,name)values('+lit(family)+",'Read fixture trip')returning id")
  location=sql('insert into public.trip_plan_locations(trip_id,family_id,created_by_person_id,'+('label'if manual else'catalog_food_id')+')values('+lit(trip)+','+lit(family)+','+lit(self.owner['person_id'])+','+lit('Manual stop'if manual else self.food)+')returning id');return trip,location
 def test_read_01_reference_separates_description_notes_and_own_coords(self):
  row=self.page()['items'][0];self.assertEqual(row['content_mode'],'reference');self.assertEqual(row['notes'],'Personal note');self.assertEqual(row['content']['description'],'Catalog description');self.assertEqual(row['content']['name'],'Saved meal');self.assertEqual(row['content']['latitude'],21.12345678);self.assertEqual(row['geography']['context_place_id'],self.place);self.assertEqual(row['cover']['availability'],'absent')
 def test_read_02_snapshot_null_empty_never_inherit(self):
  self.materialize({'description':'','address':None,'phone':'','website':'','latitude':None,'longitude':None});row=self.editor()['item'];self.assertEqual(row['content_mode'],'snapshot');self.assertEqual(row['content'],{'name':'Saved meal','description':'','address':None,'phone':'','website':'','latitude':None,'longitude':None});self.assertEqual(row['notes'],'Personal note')
 def test_read_03_manual_has_no_catalog_source(self):
  item=self.manual();row=self.editor(item_id=item)['item'];self.assertIsNone(row['source']['id']);self.assertIsNone(row['source_observation']);self.assertIsNone(row['geography']);self.assertTrue(row['native_location_compatible']);self.assertEqual(row['content']['description'],'Manual description')
 def test_read_04_reference_null_name_inherits_but_empty_is_literal(self):
  sql('update public.list_items set name=NULL where id='+lit(self.item));name=self.editor()['item']['content']['name'];self.assertTrue(name.startswith('Meal '));sql("update public.list_items set name=''where id="+lit(self.item));self.assertEqual(self.editor()['item']['content']['name'],'')
 def test_read_05_all_nine_kinds_preserved_with_typed_compatibility(self):
  for kind,table in [('place','places'),('hotel','hotels'),('experience','experiences'),('country','countries'),('airport','airports'),('airline','airlines'),('guide','guides')]:
   target=sql('select id from public.'+table+' order by id limit 1')
   if not target:target=sql('insert into public.'+table+'(name)values('+lit('Read '+kind)+')returning id')
   rpc('add_list_item',{'list_id':self.collection,'kind':kind,'entity_id':target},self.owner)
  self.manual();rows=self.page()['items'];self.assertEqual(len(rows),9);self.assertEqual({r['kind']for r in rows},{'place','food','hotel','experience','country','airport','airline','guide','manual'})
  for row in rows:self.assertEqual(row['native_location_compatible'],row['kind']in['place','food','hotel','experience','manual'])
 def test_read_06_complete_keyset_pages_ties_negative_order(self):
  for n in range(5):self.manual('Page '+str(n),-1 if n<2 else 0)
  found=[];cursor=None
  for _ in range(5):
   p=self.page(limit=2,cursor=cursor);found+=p['items'];cursor=p['next_cursor']
   if cursor is None:break
  self.assertIsNone(cursor);self.assertEqual(len(found),6);self.assertEqual(len({r['id']for r in found}),6);self.assertEqual([(r['sort_order'],r['id'])for r in found],sorted((r['sort_order'],r['id'])for r in found))
 def test_read_07_editor_source_digest_changes_without_personal_notes_change(self):
  a=self.editor();sql("update public.foods set notes='Changed catalog'where id="+lit(self.food));b=self.editor();self.assertNotEqual(a['observation']['source_digest'],b['observation']['source_digest']);self.assertNotEqual(a['observation']['item_digest'],b['observation']['item_digest']);self.assertEqual(a['observation']['item_revision'],b['observation']['item_revision']);self.assertEqual(b['item']['notes'],'Personal note')
 def test_read_08_snapshot_keeps_content_after_source_edit(self):
  self.materialize({'description':'Kept'});a=self.editor();sql("update public.foods set notes='Changed after snapshot'where id="+lit(self.food));b=self.editor();self.assertEqual(b['item']['content']['description'],'Kept');self.assertNotEqual(a['observation']['source_digest'],b['observation']['source_digest'])
 def test_read_09_explicit_archived_state_and_owner_rules(self):
  rpc('archive_family_list',{'list_id':self.collection},self.owner);self.refuse('get_family_collection_page_v1',self.p_args(),'PT409');self.assertIsNotNone(self.page(state='archived')['collection']['archived_at']);self.refuse('get_family_collection_page_v1',self.p_args(state='archived'),'42501',self.member)
 def test_read_10_private_wrong_item_and_wrong_family_refuse(self):
  self.refuse('get_family_collection_page_v1',self.p_args(),'42501',self.member);self.refuse('get_family_collection_editor_v1',self.p_args(item_id=new()),'42501');self.refuse('get_family_collection_membership_v1',self.m_args(),'42501',self.users['outsider']);self.assertNotEqual(self.page()['scope']['user_id'],self.member['id'])
 def test_read_11_family_visible_current_member_and_editability(self):
  reviewer=self.users['reviewer'];collection=rpc('create_family_list',{'family_id':self.family,'name':'Shared','visibility':'family'},reviewer);item=rpc('add_list_item',{'list_id':collection,'kind':'food','entity_id':self.food},reviewer)
  p=rpc('get_family_collection_page_v1',{'collection_id':collection},self.member);self.assertEqual(p['items'][0]['id'],item);m=self.membership(user=self.member);self.assertEqual([r['collection_id']for r in m['lists']],[collection]);self.assertTrue(m['lists'][0]['can_edit'])
 def test_read_12_real_expired_session_cannot_return_empty_membership(self):
  sid=json.loads(base64.urlsafe_b64decode(self.owner['session']['access_token'].split('.')[1]+'=='))['session_id'];sql('update auth.sessions set not_after=now()-interval\'1 minute\'where id='+lit(sid))
  try:self.refuse('get_family_collection_membership_v1',self.m_args(),'42501');self.refuse('get_family_collection_page_v1',self.p_args(),'42501')
  finally:sql('update auth.sessions set not_after=now()+interval\'1 day\'where id='+lit(sid))
 def test_read_13_suspended_membership_and_archived_person_refuse(self):
  for table,field,value,restore,where in [('public.family_members','status',"'suspended'","'active'",'family_id='+lit(self.family)+'and user_id='+lit(self.owner['id'])),('public.people','archived_at','now()','NULL','id='+lit(self.owner['person_id']))]:
   sql('update '+table+' set '+field+'='+value+' where '+where)
   try:self.refuse('get_family_collection_page_v1',self.p_args(),'42501');self.refuse('get_family_collection_membership_v1',self.m_args(),'42501')
   finally:sql('update '+table+' set '+field+'='+restore+' where '+where)
 def test_read_14_no_name_matching_or_wrong_kind_fallback(self):
  other=sql('insert into public.foods(name)select name from public.foods where id='+lit(self.food)+'returning id');m=self.membership({'kind':'food','id':other});self.assertFalse(m['saved']);self.assertEqual(m['lists'],[])
  self.refuse('get_family_collection_membership_v1',self.m_args({'name':'Saved meal'}),'22023');self.refuse('get_family_collection_membership_v1',self.m_args({'kind':'hotel','id':self.food}),'42501')
 def test_read_15_exact_membership_native_mapping_facts(self):
  m=self.membership();self.assertTrue(m['saved']);self.assertEqual(len(m['lists']),1);r=m['lists'][0];self.assertEqual(r['collection_id'],self.collection);self.assertEqual(r['item_id'],self.item);self.assertTrue(r['can_edit']);self.assertIn(r['status'],['idea','want','visited']);self.assertIsNone(r['archived_at']);self.assertEqual(m['source_observation']['id'],self.food)
 def test_read_16_saved_trip_location_resolves_exact_canonical_identity(self):
  trip,location=self.trip();a=self.membership();b=self.membership({'trip_id':trip,'location_id':location});self.assertEqual(a['lists'],b['lists']);self.assertEqual(b['source_observation']['location_id'],location)
  self.refuse('get_family_collection_membership_v1',self.m_args({'trip_id':trip,'location_id':location,'visit_id':new()}),'22023');self.refuse('get_family_collection_membership_v1',self.m_args({'trip_id':new(),'location_id':location}),'42501')
 def test_read_17_manual_trip_refuses_unrepresented_provenance(self):
  trip,location=self.trip(True);self.refuse('get_family_collection_membership_v1',self.m_args({'trip_id':trip,'location_id':location}),'0A000')
 def test_read_18_owned_manual_identity_is_exact_not_name(self):
  first=self.manual('Same manual name');second=self.manual('Same manual name');a=self.membership({'collection_id':self.collection,'item_id':first});self.assertEqual([r['item_id']for r in a['lists']],[first]);self.assertNotEqual(first,second)
  self.refuse('get_family_collection_membership_v1',self.m_args({'collection_id':self.collection,'item_id':first}),'42501',self.member)
 def test_read_19_archived_membership_is_readable_and_not_editable(self):
  rpc('archive_family_list',{'list_id':self.collection},self.owner);m=self.membership();self.assertTrue(m['saved']);self.assertIsNotNone(m['lists'][0]['archived_at']);self.assertFalse(m['lists'][0]['can_edit'])
 def test_read_20_trashed_item_is_not_saved_and_reader_refuses(self):
  self.lifecycle('trash');self.assertEqual(self.membership()['lists'],[]);self.assertEqual(self.page()['items'],[]);self.refuse('get_family_collection_editor_v1',self.p_args(item_id=self.item),'42501')
 def test_read_21_invalid_limits_states_and_identity_types(self):
  for args in [self.p_args(limit=0),self.p_args(limit=101),self.p_args(limit=None),self.p_args(state=None),self.p_args(state='trash')]:self.refuse('get_family_collection_page_v1',args,'22023')
  for identity in [[],{}, {'kind':'food','id':None},{'kind':'food','id':'bad'},{'kind':'food','id':self.food,'extra':True}]:self.refuse('get_family_collection_membership_v1',self.m_args(identity),'22023')
 def test_read_22_revision_bound_cursor_rejects_intervening_edit(self):
  self.manual();cursor=self.page(limit=1)['next_cursor'];self.assertIsNotNone(cursor);sql("update public.list_items set notes='Cursor edit'where id="+lit(self.item));self.refuse('get_family_collection_page_v1',self.p_args(cursor=cursor),'PT409')
 def test_read_23_cursor_tampering_and_partial_cursors_refuse(self):
  self.manual();cursor=self.page(limit=1)['next_cursor']
  for c in [{}, {**cursor,'collection_id':new()},{**cursor,'id':new()},{**cursor,'sort_order':1},{**cursor,'extra':True},{**cursor,'revision':'1'},{**cursor,'lifecycle_revision':None}]:self.refuse('get_family_collection_page_v1',self.p_args(cursor=c),'22023')
 def test_read_24_oversized_source_or_root_is_error_not_truncation(self):
  sql('update public.foods set notes=repeat(\'x\',270000)where id='+lit(self.food));self.refuse('get_family_collection_page_v1',self.p_args(),'54000');self.refuse('get_family_collection_editor_v1',self.p_args(item_id=self.item),'54000')
 def test_read_25_private_media_has_no_url_or_byte_path(self):
  asset,_=self.media();self.materialize({'cover_media_id':asset});cover=self.editor()['item']['cover'];self.assertEqual(cover,{'id':asset,'availability':'private_unavailable','thumb_url':None,'hero_url':None});self.assertNotIn('storage_path',json.dumps(self.editor()))
 def test_read_26_public_media_only_ready_ordinary_variant_urls(self):
  asset=sql("select a.id from public.media_assets a join public.media_variants v on v.media_asset_id=a.id where a.visibility='public_catalog'and a.kind='image'and v.status='ready'and v.recipe_version='v1'order by a.id limit 1");self.assertTrue(asset);self.materialize({'cover_media_id':asset});cover=self.editor()['item']['cover'];self.assertEqual(cover['availability'],'ready_variants')
  for value in [cover['thumb_url'],cover['hero_url']]:
   if value:self.assertIn('/storage/v1/object/public/catalog/variants/v1/',value);self.assertNotIn('/render/image/',value);self.assertNotIn('token=',value)
  self.assertNotIn('public_url',cover)
 def test_read_27_no_new_raw_or_private_helper_execution(self):
  for role in ['anon','service_role']:
   r=sql('select public.get_family_collection_page_v1('+lit(self.collection)+')',role=role,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('42501',r.stderr)
  r=sql('select family_auth.collection_read_catalog(\'food\','+lit(self.food)+')',user=self.owner,fail=True);self.assertNotEqual(r.returncode,0);self.assertIn('42501',r.stderr)
 def test_read_28_revocation_during_page_root_wait_refuses(self):
  tag='read-wait-'+new()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
   holder=pool.submit(sql,'begin;set application_name='+lit(tag)+';select id from public.lists where id='+lit(self.collection)+'for update;select pg_sleep(2);commit;');self.wait_for('select exists(select 1 from pg_stat_activity where application_name='+lit(tag)+"and wait_event='PgSleep')")
   future=pool.submit(request,'/rpc/get_family_collection_page_v1',{'p_collection_id':self.collection},self.owner);self.wait_for("select exists(select 1 from pg_stat_activity where datname='collection_reads_candidate'and wait_event_type='Lock'and query like '%get_family_collection_page_v1%')")
   sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']))
   try:status,b=future.result();holder.result();self.assertEqual((status,b.get('code')),(403,'42501'))
   finally:sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']))
 def test_read_29_reads_do_not_mutate_revisions_or_history(self):
  before=self.row();history=self.history();self.page();self.editor();self.membership();self.assertEqual(self.row(),before);self.assertEqual(self.history(),history);self.assertEqual(sql('select count(*)from family_auth.collection_content_permits'),'0')
 def test_read_30_archived_catalog_reference_stays_typed(self):
  sql('update public.foods set archived_at=now()where id='+lit(self.food));row=self.editor()['item'];self.assertTrue(row['source_observation']['archived']);self.assertEqual(row['source']['id'],self.food);self.assertEqual(row['content']['description'],'Catalog description')


 def test_read_31_membership_overflow_refuses_complete_success(self):
  sql('with roots as(insert into public.lists(family_id,owner_person_id,name)select '+lit(self.family)+','+lit(self.owner['person_id'])+",'Membership bound '||n from generate_series(1,201)n returning id)insert into public.list_items(list_id,item_kind,food_id)select id,'food',"+lit(self.food)+'from roots')
  self.refuse('get_family_collection_membership_v1',self.m_args(),'54000')
 def test_read_32_full_page_byte_overflow_refuses_partial_results(self):
  for n in range(28):
   item=self.manual('Large '+str(n));sql("update public.list_item_locations set description=repeat('🧳',20000)where item_id="+lit(item))
  self.refuse('get_family_collection_page_v1',self.p_args(limit=100),'54000');self.assertEqual(len(self.page(limit=1)['items']),1)
 def test_read_33_wrong_family_saved_location_is_inaccessible(self):
  trip=sql('insert into public.trips(family_id,name)values('+lit(self.other)+",'Other read trip')returning id")
  location=sql('insert into public.trip_plan_locations(trip_id,family_id,created_by_person_id,catalog_food_id)values('+lit(trip)+','+lit(self.other)+','+lit(self.users['outsider']['person_id'])+','+lit(self.food)+')returning id')
  self.refuse('get_family_collection_membership_v1',self.m_args({'trip_id':trip,'location_id':location}),'42501')
 def test_read_34_unready_public_image_returns_placeholder_without_original(self):
  asset=new();sql('insert into public.media_assets(id,kind,visibility,bucket,storage_path,mime_type,filename,content_hash)values('+lit(asset)+",'image','public_catalog','catalog',"+lit('fixture/'+asset+'.webp')+",'image/webp','fixture.webp',"+lit(uuid.uuid4().hex*2)+")");self.materialize({'cover_media_id':asset});cover=self.editor()['item']['cover'];self.assertEqual(cover,{'id':asset,'availability':'placeholder','thumb_url':None,'hero_url':None})
 def test_read_35_trashed_root_cannot_be_read_or_match_membership(self):
  ctx=rpc('get_family_collection_context_v1',{'collection_id':self.collection},self.owner)
  rpc('execute_family_collection_lifecycle_v1',{'collection_id':self.collection,'operation_id':new(),'scope':ctx['scope'],'action':'trash','expected_revision':ctx['collection_revision']},self.owner)
  self.refuse('get_family_collection_page_v1',self.p_args(),'42501');self.assertFalse(self.membership()['saved'])


 def test_read_36_wrong_family_catalog_cover_does_not_expose_identity(self):
  asset,_=self.media();sql('update public.media_assets set family_id='+lit(self.other)+'where id='+lit(asset));sql('update public.foods set cover_media_id='+lit(asset)+'where id='+lit(self.food));cover=self.editor()['item']['cover'];self.assertEqual(cover,{'id':None,'availability':'unavailable','thumb_url':None,'hero_url':None})
 def test_read_37_anonymous_rest_cannot_read_or_report_empty_membership(self):
  for api,args in [('get_family_collection_page_v1',self.p_args()),('get_family_collection_editor_v1',self.p_args(item_id=self.item)),('get_family_collection_membership_v1',self.m_args())]:self.refuse(api,args,'42501',token=API['anon_key'])
 def test_read_38_existing_global_override_retains_qualified_public_media(self):
  admin=self.users['global_admin'];asset=sql("select id from public.media_assets where visibility='public_catalog'and kind='image'order by id limit 1");self.materialize({'cover_media_id':asset})
  sql("update public.family_members set status='suspended'where user_id="+lit(admin['id']))
  try:
   row=self.editor(user=admin)['item'];self.assertEqual(row['cover']['availability'],'ready_variants');self.assertTrue(row['cover']['thumb_url']or row['cover']['hero_url']);self.assertNotIn('/render/image/',json.dumps(row['cover']))
  finally:sql("update public.family_members set status='active'where user_id="+lit(admin['id']))


 def test_read_39_repeated_scheduled_visits_do_not_duplicate_membership(self):
  trip,location=self.trip();before=self.membership({'trip_id':trip,'location_id':location})
  for n in range(2):rpc('mutate_family_trip_visit_v1',{'trip_id':trip,'operation_id':new(),'action':'create','payload':{'location_id':location,'activity':'Repeat meal '+str(n)}},self.users['reviewer'])
  self.assertEqual(sql('select count(*)from public.schedule_items where trip_id='+lit(trip)+'and plan_location_id='+lit(location)),'2');after=self.membership({'trip_id':trip,'location_id':location});self.assertEqual(after['lists'],before['lists']);self.assertEqual(len(after['lists']),1)


 def test_read_40_missing_owner_and_missing_person_are_not_owned_origin(self):
  collection=sql('insert into public.lists(family_id,name)values('+lit(self.family)+",'Ownerless historical library')returning id");item=new()
  sql('begin;insert into public.list_items(id,list_id,item_kind,name)values('+lit(item)+','+lit(collection)+",'manual','Ownerless manual');"+self.child_insert(item,{'list_id':collection,'description':'Retained manual content'})+';commit;')
  p=rpc('get_family_collection_page_v1',{'collection_id':collection},self.users['global_admin']);self.assertEqual(p['items'][0]['id'],item)
  self.refuse('get_family_collection_membership_v1',self.m_args({'collection_id':collection,'item_id':item}),'42501',self.users['global_admin'])

if __name__=='__main__':
 suite=unittest.TestSuite(CollectionReads(n)for n in CollectionReads.__dict__ if n.startswith('test_read_'));r=unittest.TextTestRunner(verbosity=2).run(suite)
 (S/'read-qualification-summary.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped),'calls':COUNTS,'real_GoTrue_PostgREST':True,'public_read_APIs':3,'native_UI_activation':False,'Storage_byte_requests':0},indent=2)+'\n');sys.exit(not r.wasSuccessful())
