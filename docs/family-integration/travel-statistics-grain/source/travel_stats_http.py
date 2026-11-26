"""Actual isolated GoTrue/PostgREST aggregate reads with authenticated RLS.

Fixture construction/target guard and real SQL aggregate tests are separate.
No hosted URI, product state injection or service-role application read.
"""
from pathlib import Path
import os,sys,json,unittest
S=Path(os.environ['FAMILY_ATLAS_FIXTURE_DIR']).resolve();assert S.is_relative_to(Path('/private/tmp'))and S.stat().st_mode&0o077==0
sys.path[:0]=[str(S/'rehearsal'),str(S)];import target as g,travel_stats_fixture_support as h
from travel_stats_aggregate import fixture,expected
F=h.setup_users();U=F['users'];member=U['member'];reviewer=U['reviewer'];outsider=U['outsider']
cache=S/'http-fixture-private.json'
if not cache.exists():
 f,p,q=fixture([{'places':[0,1,2]},{'places':[0,3]}],existing_family=F['family'],existing_people=[member['person_id'],reviewer['person_id']])
 h.sql(q);cache.write_text(json.dumps({'family':F['family'],'expected':expected(2,6,4)},indent=2))
state=json.loads(cache.read_text())
def read(view,user=None,filter_family=None):return h.request('/'+view+'?select=*&family_id=eq.'+(filter_family or F['family']),user=user)
class HTTPTests(unittest.TestCase):
 def test_01_authenticated_family_totals(self):
  status,rows=read('family_travel_stats',member);self.assertEqual(status,200);self.assertEqual([{k:r[k]for k in expected(2,6,4)}for r in rows],[expected(2,6,4)])
 def test_02_authenticated_person_totals(self):
  status,rows=read('person_travel_stats',member);self.assertEqual(status,200);self.assertEqual({r['person_id']for r in rows},{member['person_id'],reviewer['person_id']});self.assertTrue(all({k:r[k]for k in expected(2,6,4)}==expected(2,6,4)for r in rows))
 def test_03_reviewer_AAL2_reads_same_facts(self):
  for view in ['family_travel_stats','person_travel_stats']:status,rows=read(view,reviewer);self.assertEqual(status,200);self.assertTrue(rows)
 def test_04_foreign_family_cannot_read_family_totals(self):self.assertEqual(read('family_travel_stats',outsider),(200,[]))
 def test_05_foreign_family_cannot_read_person_totals(self):self.assertEqual(read('person_travel_stats',outsider),(200,[]))
 def test_06_anonymous_cannot_read_family_totals(self):
  status,rows=read('family_travel_stats');self.assertIn(status,[401,403])
 def test_07_anonymous_cannot_read_person_totals(self):
  status,rows=read('person_travel_stats');self.assertIn(status,[401,403])
 def test_08_suspended_membership_loses_both_reads(self):
  h.sql('update public.family_members set status=\'suspended\'where family_id='+h.lit(F['family'])+'and user_id='+h.lit(member['id']))
  try:
   for view in ['family_travel_stats','person_travel_stats']:self.assertEqual(read(view,member),(200,[]))
  finally:h.sql('update public.family_members set status=\'active\'where family_id='+h.lit(F['family'])+'and user_id='+h.lit(member['id']))
 def test_09_grants_remain_select_only_for_client_roles(self):
  value=json.loads(h.sql("select jsonb_object_agg(name,jsonb_build_object('select',has_table_privilege('authenticated','public.'||name,'SELECT'),'update',has_table_privilege('authenticated','public.'||name,'UPDATE'),'delete',has_table_privilege('authenticated','public.'||name,'DELETE'),'anon',has_table_privilege('anon','public.'||name,'SELECT')))from unnest(array['family_travel_stats','person_travel_stats'])name"))
  self.assertEqual(list(value.values()),[{'select':True,'update':False,'delete':False,'anon':False}]*2)
 def test_10_explicit_visited_marks_are_not_invented_from_trips(self):
  self.assertEqual(h.okay('/family_country_visited?select=country_id&family_id=eq.'+F['family'],user=member),[])
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(HTTPTests));(S/'aggregate-http-summary.json').write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'real_GoTrue_PostgREST_RLS':True,'HTTP_calls':h.COUNTS['http'],'SQL_calls':h.COUNTS['sql'],'hosted':False,'AAL2_reviewer_and_current_membership':True},indent=2)+'\n');sys.exit(not result.wasSuccessful())
