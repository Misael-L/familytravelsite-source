"""Actual owned Auth/REST paging/history and authorization qualification."""
from collection_library_support import *
from collection_recovery_paging_seed import seed_recovery
import unittest,copy
class RecoveryPaging(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.f=setup_users();cls.u=cls.f['users']['owner'];cls.r=seed_recovery()
 def page(self,kind,cursor=None,user=None,collection=None):
  a={'limit':25,**(cursor or{})}
  if kind=='collection':a['family_id']=self.f['family']
  else:a['collection_id']=collection or self.r['collection_id']
  return rpc('list_family_collection_'+('trash'if kind=='collection'else'item_trash')+'_v1',a,user or self.u)
 def traverse(self,kind):
  cursor=None;ids=[];pages=0;times=[]
  while True:
   p=self.page(kind,cursor);pages+=1;ids.extend(v['id']for v in p['items']);times.extend(v['deleted_at']for v in p['items']);cursor=p['next_cursor']
   if cursor is None:break
   self.assertEqual(len(p['items']),25);self.assertLess(pages,10)
  return ids,pages,times
 def test_01_root_pages_tied_microseconds_match_all_canonical_ids(self):
  ids,pages,times=self.traverse('collection');self.assertEqual(ids,self.r['root_ids']);self.assertEqual(len(ids),len(set(ids)));self.assertEqual(pages,3);self.assertEqual(len(set(times)),2)
 def test_02_item_pages_tied_microseconds_match_all_canonical_ids(self):
  ids,pages,times=self.traverse('item');self.assertEqual(ids,self.r['item_ids']);self.assertEqual(len(ids),len(set(ids)));self.assertEqual(pages,3);self.assertEqual(len(set(times)),2)
 def test_03_item_cursor_wrong_parent_is_refused(self):
  p=self.page('item');status,r=request('/rpc/list_family_collection_item_trash_v1',{'p_collection_id':self.r['history_collection_id'],'p_limit':25,**{'p_'+k:v for k,v in p['next_cursor'].items()}},self.u);self.assertEqual((status,r['code']),(400,'22023'))
 def history(self,item):
  before=None;revs=[];rows=[]
  while True:
   p=rpc('list_family_collection_versions_v1',{'collection_id':self.r['history_collection_id'],'item_id':self.r['history_item_id']if item else None,'limit':25,'before_revision':before},self.u);rows.extend(p['items']);revs.extend(v['revision']for v in p['items'])
   if p['next_cursor']is None:break
   before=p['next_cursor']['before_revision'];self.assertLess(len(revs),200)
  return revs,rows
 def test_04_root_history_56_versions_match_canonical(self):
  revs,rows=self.history(False);self.assertEqual(revs,self.r['root_revisions']);self.assertGreater(len(revs),50);self.assertTrue(all(v['revision']==v['snapshot']['revision']for v in rows))
 def test_05_item_history_keeps_distinct_notes_and_snapshot_descriptions(self):
  revs,rows=self.history(True);self.assertEqual(revs,self.r['item_revisions']);self.assertGreater(len(revs),50);self.assertEqual(rows[0]['snapshot']['notes'],'History note 55');self.assertEqual(rows[0]['location_snapshot']['description'],'History description 55')
 def test_06_history_wrong_collection_is_denied(self):
  status,r=request('/rpc/list_family_collection_versions_v1',{'p_collection_id':self.r['collection_id'],'p_item_id':self.r['history_item_id'],'p_limit':25},self.u);self.assertEqual((status,r['code']),(403,'42501'))
 def test_07_revoked_membership_after_first_page_does_not_return_empty_success(self):
  p=self.page('item');sql("update public.family_members set status='suspended'where family_id="+lit(self.f['family'])+'and user_id='+lit(self.u['id']))
  try:
   status,r=request('/rpc/list_family_collection_item_trash_v1',{'p_collection_id':self.r['collection_id'],'p_limit':25,**{'p_'+k:v for k,v in p['next_cursor'].items()}},self.u);self.assertEqual((status,r['code']),(403,'42501'))
  finally:sql("update public.family_members set status='active'where family_id="+lit(self.f['family'])+'and user_id='+lit(self.u['id']))
 def test_08_expired_session_after_first_page_is_refused(self):
  p=self.page('item');u=copy.deepcopy(self.u);u['session']=okay('/token?grant_type=password',{'email':u['email'],'password':u['password']},auth=True);sid=json.loads(base64.urlsafe_b64decode(u['session']['access_token'].split('.')[1]+'=='))['session_id'];sql("update auth.sessions set not_after=now()-interval'1 second'where id="+lit(sid))
  status,r=request('/rpc/list_family_collection_item_trash_v1',{'p_collection_id':self.r['collection_id'],'p_limit':25,**{'p_'+k:v for k,v in p['next_cursor'].items()}},u);self.assertEqual((status,r['code']),(403,'42501'))
 def test_09_reviewer_own_private_root_requires_actual_mfa(self):
  u=self.f['users']['reviewer'];c=rpc('create_family_list',{'family_id':self.f['family'],'name':'Reviewer private recovery'},u);ctx=rpc('get_family_collection_context_v1',{'collection_id':c},u);rpc('execute_family_collection_lifecycle_v1',{'collection_id':c,'operation_id':new(),'scope':ctx['scope'],'action':'trash','expected_revision':ctx['collection_revision']},u)
  self.assertIn(c,[x['id']for x in self.page('collection',user=u)['items']]);weak=copy.deepcopy(u);weak['session']=okay('/token?grant_type=password',{'email':u['email'],'password':u['password']},auth=True)
  status,r=request('/rpc/list_family_collection_trash_v1',{'p_family_id':self.f['family'],'p_limit':25},weak);self.assertEqual((status,r['code']),(403,'42501'))
 def test_10_restored_cursor_is_refused_and_identity_history_survives(self):
  p=self.page('item');id=p['next_cursor']['before_id'];ctx=rpc('get_family_collection_item_context_v1',{'collection_id':self.r['collection_id'],'item_id':id},self.u);rpc('execute_family_collection_item_lifecycle_v1',{'collection_id':self.r['collection_id'],'item_id':id,'operation_id':new(),'scope':ctx['scope'],'action':'restore','expected_revision':ctx['item']['revision'],'expected_collection_revision':ctx['content_revision']},self.u)
  status,r=request('/rpc/list_family_collection_item_trash_v1',{'p_collection_id':self.r['collection_id'],'p_limit':25,**{'p_'+k:v for k,v in p['next_cursor'].items()}},self.u);self.assertEqual((status,r['code']),(400,'22023'));h=rpc('list_family_collection_versions_v1',{'collection_id':self.r['collection_id'],'item_id':id},self.u);self.assertEqual(h['items'][0]['snapshot']['id'],id)
if __name__=='__main__':
 r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(RecoveryPaging));(S/'paging-tests-summary.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped),'real_Auth_REST':True,'trusted_clock_seed_not_public_writer_proof':True},indent=2));sys.exit(not r.wasSuccessful())
