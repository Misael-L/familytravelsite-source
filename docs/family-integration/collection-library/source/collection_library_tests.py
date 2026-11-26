"""Real owned Auth/REST library pages; no hosted calls or native activation."""
from collection_library_support import *
import unittest,copy
class CollectionLibrary(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.users=setup_users()['users']
 def setUp(self):
  self.owner=self.users['owner'];self.member=self.users['member'];self.family=new()
  sql('insert into public.families(id,name)values('+lit(self.family)+",'Library fixture')")
  for kind in ['owner','member','reviewer']:
   u=self.users[kind];role='patriarch'if kind=='reviewer'else'child'
   sql('begin;insert into public.family_members(family_id,user_id,role,status)values('+lit(self.family)+','+lit(u['id'])+','+lit(role)+",'active');select set_config('family_auth.allow_identity_link','1',true);insert into public.people(family_id,user_id,display_name)values("+lit(self.family)+','+lit(u['id'])+','+lit('Library '+kind)+');commit;')
 def root(self,name='Saved',visibility='private',user=None):return rpc('create_family_list',{'family_id':self.family,'name':name,'visibility':visibility},user or(self.users['reviewer']if visibility=='family'else self.owner))
 def page(self,user=None,**kw):return rpc('get_family_collection_library_v1',{'family_id':self.family,**kw},user or self.owner)
 def refuse(self,code,user=None,token=None,**kw):
  status,b=request('/rpc/get_family_collection_library_v1',{'p_'+k:v for k,v in{'family_id':self.family,**kw}.items()},user or self.owner,token=token)
  self.assertGreaterEqual(status,400);self.assertEqual(b.get('code'),code,b);return b
 def paged(self):
  ids=[self.root('Saved '+str(i))for i in range(3)];p=self.page(limit=1);self.assertIsNotNone(p['next_cursor']);return ids,p
 def test_01_empty_is_explicit_complete_current_library(self):
  p=self.page();self.assertEqual((p['collections'],p['offset'],p['total_count'],p['next_cursor']),([],0,0,None));self.assertEqual(p['scope']['family_id'],self.family);self.assertEqual(p['scope']['user_id'],self.owner['id']);self.assertEqual(len(p['library_digest']),64)
 def test_02_complete_root_metadata_counts_and_authority(self):
  cid=self.root('Saved title');p=self.page();r=p['collections'][0];self.assertEqual(r['collection']['id'],cid);self.assertEqual(r['collection']['name'],'Saved title');self.assertEqual(r['active_item_count'],0);self.assertTrue(r['is_owner']and r['can_admin']and r['can_edit_items']);self.assertIsNone(r['collection']['deleted_at']);self.assertEqual(p['total_count'],1)
 def test_03_multi_page_identical_sort_keys_are_complete_unique(self):
  ids=[self.root(str(i))for i in range(5)];sql('update public.lists set sort_order=0 where family_id='+lit(self.family));rows=[];cursor=None;digest=None
  for offset in [0,2,4]:
   p=self.page(limit=2,cursor=cursor);self.assertEqual(p['offset'],offset);self.assertEqual(p['total_count'],5);digest=digest or p['library_digest'];self.assertEqual(p['library_digest'],digest);rows += [x['collection']['id']for x in p['collections']];cursor=p['next_cursor']
  self.assertIsNone(cursor);self.assertEqual(rows,sorted(ids));self.assertEqual(len(set(rows)),5)
 def test_04_private_roots_do_not_leak_names_or_digest(self):
  a=self.page(user=self.member);self.root('Private secret');b=self.page(user=self.member);self.assertEqual(a,b);self.assertEqual(b['total_count'],0)
 def test_05_family_root_current_member_is_editable_not_admin(self):
  cid=self.root(visibility='family');r=self.page(user=self.member)['collections'][0];self.assertEqual(r['collection']['id'],cid);self.assertTrue(r['can_edit_items']);self.assertFalse(r['is_owner']or r['can_admin'])
 def test_06_archived_explicit_owner_and_reviewer_only(self):
  cid=self.root(visibility='family');rpc('archive_family_list',{'list_id':cid},self.users['reviewer']);self.assertEqual(self.page()['collections'],[]);r=self.page(user=self.users['reviewer'],state='archived')['collections'][0];self.assertFalse(r['can_edit_items']);self.assertTrue(r['can_admin']);self.assertIsNotNone(r['collection']['archived_at']);self.assertEqual(self.page(user=self.member,state='archived')['collections'],[]);self.assertEqual(self.page(user=self.users['reviewer'],state='archived')['total_count'],1)
 def test_07_trashed_root_excluded_but_not_physically_removed(self):
  cid=self.root();ctx=rpc('get_family_collection_context_v1',{'collection_id':cid},self.owner)
  rpc('execute_family_collection_lifecycle_v1',{'collection_id':cid,'operation_id':new(),'scope':ctx['scope'],'action':'trash','expected_revision':ctx['collection']['revision']},self.owner)
  self.assertEqual(self.page()['total_count'],0);self.assertEqual(sql('select count(*)from public.lists where id='+lit(cid)),'1')
 def test_08_wrong_family_and_anonymous_are_refusals(self):
  self.refuse('42501',user=self.users['outsider']);self.refuse('42501',token=API['anon_key'])
 def test_09_service_role_has_no_reader_execution(self):self.refuse('42501',token=API['service_key'])
 def test_10_real_expired_session_is_not_empty_success(self):
  sid=json.loads(base64.urlsafe_b64decode(self.owner['session']['access_token'].split('.')[1]+'=='))['session_id'];sql('update auth.sessions set not_after=now()-interval\'1 minute\'where id='+lit(sid))
  try:self.refuse('42501')
  finally:sql('update auth.sessions set not_after=now()+interval\'1 day\'where id='+lit(sid))
 def test_11_suspended_member_refuses_even_empty_library(self):
  sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner['id']));self.refuse('42501')
 def test_12_archived_person_refuses_even_empty_library(self):
  sql('update public.people set archived_at=now()where family_id='+lit(self.family)+'and user_id='+lit(self.owner['id']));self.refuse('42501')
 def test_13_reviewer_real_aal1_must_satisfy_MFA(self):
  u=self.users['reviewer'];old=u['session'];u['session']=okay('/token?grant_type=password',{'email':u['email'],'password':u['password']},auth=True)
  try:self.refuse('42501',user=u)
  finally:u['session']=old
 def test_14_global_reader_preserves_null_person_not_invented_owner(self):
  self.root(visibility='family');r=self.page(user=self.users['global_admin']);self.assertIsNone(r['scope']['person_id']);self.assertFalse(r['collections'][0]['is_owner']);self.assertTrue(r['collections'][0]['can_admin'])
 def test_15_limit_state_family_null_and_unknown_rejected(self):
  for k,v in [('limit',0),('limit',101),('limit',None),('state',None),('state','all'),('family_id',None)]:self.refuse('22023',**{k:v})
 def test_16_exact_cursor_no_extra_missing_or_wrong_version(self):
  ids,p=self.paged();c=p['next_cursor']
  for bad in [{**c,'extra':1},{k:v for k,v in c.items()if k!='id'},{**c,'version':2},{**c,'sort_order':'0'},{**c,'id':'not-uuid'},[],{'large':'x'*8200}]:self.refuse('22023',cursor=bad)
 def test_17_cursor_cannot_switch_actor_or_family(self):
  self.root(visibility='family');self.root(visibility='family');c=self.page(limit=1)['next_cursor'];self.refuse('PT409',user=self.member,cursor=c);bad=copy.deepcopy(c);bad['scope']['family_id']=new();self.refuse('PT409',cursor=bad)
 def test_18_cursor_cannot_switch_current_auth_session(self):
  ids,p=self.paged();u=copy.deepcopy(self.owner);u['session']=okay('/token?grant_type=password',{'email':u['email'],'password':u['password']},auth=True);self.refuse('PT409',user=u,cursor=p['next_cursor'])
 def test_19_cursor_cannot_switch_active_archived_state(self):
  ids,p=self.paged();self.refuse('PT409',cursor=p['next_cursor'],state='archived')
 def test_20_insert_invalidates_complete_library_observation(self):
  ids,p=self.paged();self.root();self.refuse('PT409',cursor=p['next_cursor'])
 def test_21_root_edit_invalidates_observation(self):
  ids,p=self.paged();sql("update public.lists set description='New text'where id="+lit(ids[-1]));self.refuse('PT409',cursor=p['next_cursor'])
 def test_22_order_change_invalidates_observation(self):
  ids,p=self.paged();sql('update public.lists set sort_order=-3 where id='+lit(ids[-1]));self.refuse('PT409',cursor=p['next_cursor'])
 def test_23_private_visibility_change_invalidates_member_observation(self):
  a=self.root(visibility='family');b=self.root(visibility='family');p=self.page(user=self.member,limit=1);sql("update public.lists set visibility='private'where id="+lit(b));self.refuse('PT409',user=self.member,cursor=p['next_cursor'])
 def test_24_item_count_and_content_revision_include_nonlocation_records(self):
  cid=self.root();country=sql("insert into public.countries(name,iso2,iso3)select 'Count fixture',code,code||'Q' from(select chr(a)||chr(b)code from generate_series(65,90)a cross join generate_series(65,90)b)c where not exists(select 1 from public.countries x where x.iso2=c.code or x.iso3=c.code||'Q')limit 1 returning id")
  author(cid,'create_reference',{'source':{'kind':'country','id':country},'notes':None,'status':'idea'},self.owner)
  author(cid,'create_manual',{'content':manual_content(),'notes':None,'status':'want'},self.owner)
  r=self.page()['collections'][0];self.assertEqual(r['active_item_count'],2);self.assertGreater(r['content_revision'],0)
 def test_25_item_change_invalidates_count_page(self):
  ids,p=self.paged();author(ids[-1],'create_manual',{'content':manual_content(),'notes':None,'status':'idea'},self.owner);self.refuse('PT409',cursor=p['next_cursor'])
 def test_26_cursor_id_must_be_in_observed_visible_set(self):
  ids,p=self.paged();self.refuse('22023',cursor={**p['next_cursor'],'id':new()})
 def test_27_ready_media_only_and_private_cover_explicit_unavailable(self):
  cid=self.root();asset=new();path=self.family+'/lists/'+cid+'/'+asset+'.webp'
  sql('insert into public.media_assets(id,kind,visibility,bucket,storage_path,filename,content_hash,mime_type,size_bytes,family_id)values('+lit(asset)+",'image','family','family',"+lit(path)+",'cover.webp',"+lit(uuid.uuid4().hex*2)+",'image/webp',64,"+lit(self.family)+');update public.lists set cover_media_id='+lit(asset)+'where id='+lit(cid))
  cover=self.page()['collections'][0]['collection']['cover'];self.assertEqual(cover,{'id':asset,'availability':'private_unavailable','thumb_url':None,'hero_url':None});self.assertNotIn('storage_path',json.dumps(cover))
 def test_28_actual_1000_root_bound_no_hidden_truncation(self):
  person=sql('select id from public.people where family_id='+lit(self.family)+'and user_id='+lit(self.owner['id']))
  sql('insert into public.lists(family_id,owner_person_id,name,visibility,sort_order)select '+lit(self.family)+','+lit(person)+",'Bound '||s,'private',s from generate_series(1,1000)s")
  p=self.page(limit=100);self.assertEqual((p['total_count'],len(p['collections'])),(1000,100));self.root('Overflow');self.refuse('54000')
 def test_29_actual_response_byte_overflow_refuses_partial_library(self):
  ids=[self.root(str(i))for i in range(3)];sql("update public.lists set description=repeat('é',400000)where family_id="+lit(self.family));self.refuse('54000',limit=3)
 def test_30_hidden_other_owner_edits_do_not_invalidate_viewer_cursor(self):
  a=self.root(visibility='family');b=self.root(visibility='family');secret=self.root(user=self.member);p=self.page(limit=1);sql("update public.lists set description='Other private edit'where id="+lit(secret));q=self.page(limit=1,cursor=p['next_cursor']);self.assertEqual(q['library_digest'],p['library_digest']);self.assertEqual(q['total_count'],2)
 def test_31_negative_sort_order_and_limit_change_round_trip(self):
  ids=[self.root(str(i))for i in range(3)];sql('update public.lists set sort_order=-4 where id='+lit(ids[0]));p=self.page(limit=1);self.assertEqual(p['next_cursor']['sort_order'],-4);q=self.page(limit=100,cursor=p['next_cursor']);self.assertEqual(q['offset'],1);self.assertEqual(len(q['collections']),2);self.assertIsNone(q['next_cursor'])

if __name__=='__main__':
 r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(CollectionLibrary))
 (S/'library-qualification-summary.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped),'calls':COUNTS,'real_GoTrue_PostgREST':True,'new_public_read_APIs':1,'native_UI_activation':False,'Storage_byte_operations':0},indent=2)+'\n');sys.exit(not r.wasSuccessful())
