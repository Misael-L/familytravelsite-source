"""Local-only aggregate regression suite; explicit nonce-guarded fixture required.

Uses real PostgreSQL views/RLS. Auth HTTP qualification is a separate test group.
Every synthetic data case rolls back; no hosted URI or schema mutation is accepted.
"""
from pathlib import Path
import json,os,sys,uuid,unittest
S=Path(os.environ['FAMILY_ATLAS_FIXTURE_DIR']).resolve()
assert S.is_relative_to(Path('/private/tmp'))and S.stat().st_mode&0o077==0
sys.path.insert(0,str(S/'rehearsal'));import target as g
DB=os.environ.get('FAMILY_ATLAS_TEST_DB','atlas_stats_candidate')
assert DB in ['atlas_stats_candidate','atlas_stats_replay'];g.ready()
new=lambda:str(uuid.uuid4());lit=lambda x:"'"+str(x).replace("'","''")+"'"
def run(body):
 r=g.run("begin;set local statement_timeout='20s';set local lock_timeout='5s';"+body+";rollback;",db=DB)
 if r.returncode:(S/'aggregate-test-error-private.log').write_text(r.stderr);raise RuntimeError('Local SQL failed; inspect private diagnostic')
 return json.loads(r.stdout.strip().splitlines()[-1])
def fixture(specs,persons=2,existing_family=None,existing_people=None):
 f=existing_family or new();p=existing_people or[new()for _ in range(persons)];q=''
 if not existing_family:q+='insert into public.families(id,name)values('+lit(f)+",'Atlas aggregate synthetic');"
 if not existing_people:
  q+="select set_config('family_auth.allow_identity_link','1',true);"
  q+='insert into public.people(id,family_id,display_name)values'+','.join('('+lit(x)+','+lit(f)+",'Synthetic traveler')"for x in p)+';'
 places=[new()for _ in range(4)]
 q+='insert into public.places(id,name,country_id)values'+','.join('('+lit(x)+','+lit('Synthetic city '+x)+",(select id from public.countries order by id limit 1))"for x in places)+';'
 for spec in specs:
  t=new();start,end=spec.get('dates',('2026-04-01T00:00:00Z','2026-04-03T23:59:00Z'))
  q+='insert into public.trips(id,family_id,name,status,start_at,end_at,archived_at)values('+','.join([lit(t),lit(f),"'Synthetic trip'",lit(spec.get('status','completed')),'null'if start is None else lit(start),'null'if end is None else lit(end),"now()"if spec.get('archived')else'null'])+');'
  for place in spec.get('places',[]):q+='insert into public.trip_places(trip_id,place_id)values('+lit(t)+','+lit(places[place])+');'
  for person in spec.get('travelers',range(persons)):q+='insert into public.trip_travelers(trip_id,person_id)values('+lit(t)+','+lit(p[person])+');'
  if spec.get('null_traveler'):q+='insert into public.trip_travelers(trip_id)values('+lit(t)+');'
  if spec.get('trashed'):q+='update public.trips set deleted_at=now(),deleted_by_person_id='+lit(p[0])+' where id='+lit(t)+';'
 return f,p,q

def stats(specs,persons=2,tail=''):
 f,p,q=fixture(specs,persons)
 result=run(q+tail+"select jsonb_build_object('family',(select to_jsonb(s)-'family_id'from public.family_travel_stats s where family_id="+lit(f)+"),'people',coalesce((select jsonb_agg(to_jsonb(s)-'family_id'-'person_id' order by s.person_id)from public.person_travel_stats s where family_id="+lit(f)+"),'[]'::jsonb))")
 return result

def expected(trips,days,places):return {'total_trips':trips,'total_days':days,'total_places':places}
class AggregateTests(unittest.TestCase):
 def check(self,specs,value,people=None,**kw):
  actual=stats(specs,**kw);self.assertEqual(actual['family'],value);self.assertEqual(actual['people'],[value,value]if people is None else people)
 def test_01_three_day_trip_without_places(self):self.check([{}],expected(1,3,0))
 def test_02_one_place_does_not_change_days(self):self.check([{'places':[0]}],expected(1,3,1))
 def test_03_multiple_places_do_not_multiply_trip_days(self):self.check([{'places':[0,1,2]}],expected(1,3,3))
 def test_04_equal_duration_trips_are_both_counted(self):self.check([{'places':[0,1,2]},{'places':[0,3]}],expected(2,6,4))
 def test_05_shared_place_counted_once_across_distinct_trips(self):self.check([{'places':[0,1]},{'places':[0,1]}],expected(2,6,2))
 def test_06_travelers_do_not_multiply_family_totals(self):self.check([{'places':[0,1,2]}],expected(1,3,3),people=[expected(1,3,3)]*3,persons=3)
 def test_07_each_person_only_counts_their_trips(self):
  f,p,q=fixture([{'places':[0,1,2],'travelers':[0]},{'places':[0],'travelers':[1]}]);actual=run(q+'select jsonb_object_agg(person_id,total_places)from public.person_travel_stats where family_id='+lit(f));self.assertEqual(actual,{p[0]:3,p[1]:1})
 def test_08_null_person_travelers_do_not_make_a_person_group(self):self.check([{'travelers':[],'null_traveler':True}],expected(1,3,0),people=[])
 def test_09_archived_completed_trip_excluded(self):self.check([{'places':[0]},{'archived':True,'places':[1,2]}],expected(1,3,1))
 def test_10_planning_trip_excluded(self):self.check([{'places':[0]},{'status':'planning','places':[1,2]}],expected(1,3,1))
 def test_11_upcoming_trip_excluded(self):self.check([{'places':[0]},{'status':'upcoming','places':[1,2]}],expected(1,3,1))
 def test_12_cancelled_trip_excluded(self):self.check([{'places':[0]},{'status':'cancelled','places':[1,2]}],expected(1,3,1))
 def test_13_trashed_completed_trip_excluded_even_for_operator(self):self.check([{'places':[0]},{'trashed':True,'places':[1,2]}],expected(1,3,1))
 def test_14_genuine_midnight_same_day_is_one_day(self):self.check([{'dates':('2026-04-01T00:00:00Z','2026-04-01T00:00:00Z'),'places':[0,1]}],expected(1,1,2))
 def test_15_UTC_civil_dates_not_elapsed_24_hour_periods(self):self.check([{'dates':('2026-04-01T23:59:00Z','2026-04-02T00:01:00Z'),'places':[0,1]}],expected(1,2,2))
 def test_16_offset_inputs_preserve_UTC_date_contract(self):self.check([{'dates':('2026-04-01T23:30:00-07:00','2026-04-02T01:30:00-07:00'),'places':[0,1]}],expected(1,1,2))
 def test_17_missing_start_contributes_zero_days(self):self.check([{'dates':(None,'2026-04-03T00:00:00Z'),'places':[0,1]}],expected(1,0,2))
 def test_18_missing_end_contributes_zero_days(self):self.check([{'dates':('2026-04-01T00:00:00Z',None),'places':[0,1]}],expected(1,0,2))
 def test_19_missing_both_dates_contributes_zero_days(self):self.check([{'dates':(None,None),'places':[0,1]}],expected(1,0,2))
 def test_20_empty_family_has_no_aggregate_group(self):self.check([],None,people=[])
 def test_21_only_excluded_trips_have_no_aggregate_group(self):self.check([{'archived':True},{'status':'planning'},{'trashed':True}],None,people=[])
 def test_22_overlapping_trips_keep_existing_per_trip_day_semantics(self):self.check([{'places':[0]},{'places':[1]}],expected(2,6,2))
 def test_23_non_UTC_session_does_not_change_totals(self):self.check([{'places':[0,1]}],expected(1,3,2),tail="set local timezone='America/Vancouver';")
 def test_24_independent_families_do_not_merge(self):
  f,p,q=fixture([{'places':[0,1,2]}]);f2,p2,q2=fixture([{'places':[0]}]);a=run(q+q2+'select jsonb_agg(total_days order by total_places)from public.family_travel_stats where family_id in('+lit(f)+','+lit(f2)+')');self.assertEqual(a,[3,3])

if __name__=='__main__':
 if '--reproduce'in sys.argv:
  actual=stats([{'places':[0,1,2]}]);assert actual['family']==expected(1,9,3)and actual['people']==[expected(1,9,3)]*2
  (S/'old-fanout-reproduction.json').write_text(json.dumps({'schema':143,'expected_days':3,'actual_family_days':9,'actual_person_days':[9,9],'places':3,'completed_trips':1,'real_local_SQL':True,'bug_reproduced':True},indent=2)+'\n');print('Confirmed: one three-day Trip with three places reports9 days in both views.');sys.exit(0)
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(AggregateTests));(S/('aggregate-'+DB+'-summary.json')).write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'real_local_SQL':True,'database':DB},indent=2)+'\n');sys.exit(not result.wasSuccessful())
