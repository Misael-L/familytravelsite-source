"""Real coherent-v2 SQL/signed HTTP; synthetic Auth metadata, never a hosted target."""
from pathlib import Path
import sys,json,unittest,subprocess,concurrent.futures,time
import os
sys.path.insert(0,str(Path(__file__).resolve().parent))
import booking_stay_read_guard as g
S=g.S
sys.modules['trip_stay_commands_guard']=g
from trip_stay_commands import StayCommands,f,sql,rpc,http,new,lit

class CoherentRead(StayCommands):
 def read(self,user=None):return rpc('get_family_trip_booking_view_v2',[self.trip],user or self.owner)
 def denied(self,code='42501',user=None):
  before=self.graph()
  with self.assertRaisesRegex(RuntimeError,code):self.read(user)
  self.assertEqual(self.graph(),before)
 def fresh_session(self):
  old=f.USERS[self.owner];sid=new();sql('insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after,factor_id)select '+lit(sid)+",user_id,now(),now(),aal,now()+interval '1 day',factor_id from auth.sessions where id="+lit(old));f.USERS[self.owner]=sid;self.addCleanup(lambda:f.USERS.__setitem__(self.owner,old));return sid
 def blocked_read(self,change):
  st=g.validate();locker=subprocess.Popen(['docker','exec','-i',st['id'],'psql','-h','/socket','-X','-Atq','-v','ON_ERROR_STOP=1','-U',g.OP,'-d',g.DB],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  locker.stdin.write('begin;lock table public.trip_stays in access exclusive mode;\n\\echo HELD\n');locker.stdin.flush()
  for _ in range(5):
   if locker.stdout.readline().strip()=='HELD':break
  else:raise AssertionError('Fixture lock did not open')
  with concurrent.futures.ThreadPoolExecutor(1)as pool:
   result=pool.submit(self.read)
   try:
    waiting=False
    for _ in range(80):
     if sql("select exists(select 1 from pg_stat_activity where wait_event_type='Lock'and query like '%get_family_trip_booking_view_v2%'and query like '%"+self.trip+"%')")=='t':waiting=True;break
     time.sleep(.03)
    self.assertTrue(waiting,'Actual read must block in the content snapshot');locker.stdin.write(change+';commit;\n');locker.stdin.close();self.assertEqual(locker.wait(timeout=12),0,locker.stderr.read())
   except BaseException:
    if locker.poll()is None:locker.stdin.write('rollback;\n');locker.stdin.close();locker.wait(timeout=10)
    raise
   return result.result(timeout=15)
 def read_01_one_complete_published_view_without_mutation(self):
  before=self.graph();r=self.read();self.assertEqual(r['version'],2);self.assertEqual(r['completeness'],'complete');self.assertEqual(r['trip_revision'],r['planner']['state']['trip_revision']);self.assertEqual(r['planner']['scope']['layer'],'published');self.assertEqual(r['capabilities'],{'read':True,'native_read':False,'native_write':False,'confirmed_timing_write':False});self.assertEqual(self.graph(),before)
 def read_02_actual_signed_http_matches_sql(self):
  code,r=http('/rpc/get_family_trip_booking_view_v2',{'p_trip_id':self.trip},self.owner);self.assertEqual(code,200);self.assertEqual(r,self.read())
 def read_03_link_identity_is_explicit_not_a_city_join(self):
  r=self.read();b=r['bookings'][0];s=r['stays'][0];self.assertEqual(b['stay_link'],{'id':self.stay,'state':'active'});self.assertEqual(s['link']['reservation_id'],self.booking);self.assertEqual(s['booking']['record'],b['record']);self.assertEqual(s['location'],next(x for x in r['planner']['state']['locations']if x['id']==self.location))
 def read_04_booking_without_stay_and_stay_without_booking_remain(self):
  other=self.add_booking();stay=self.add_stay();r=self.read();self.assertEqual(len(r['bookings']),2);self.assertEqual(len(r['stays']),2);self.assertIsNone(next(b for b in r['bookings']if b['record']['id']==other)['stay_link']);self.assertIsNone(next(s for s in r['stays']if s['stay']['id']==stay)['booking'])
 def read_05_repeated_stays_at_one_lodging_keep_distinct_ids(self):
  ids=[self.stay,self.add_stay(),self.add_stay()];self.assertEqual({s['stay']['id']for s in self.read()['stays']},set(ids))
 def read_06_unknown_clocks_and_true_midnight_remain_distinct(self):
  self.assertIsNone(self.read()['stays'][0]['stay']['check_in_time']);self.command(changes={'check_in_time':'00:00','check_out_time':'00:00','time_zone':'America/Mexico_City'});r=self.read();self.assertEqual(r['stays'][0]['stay']['check_in_time'],'00:00:00');self.assertEqual(r['stays'][0]['stay']['time_zone'],'America/Mexico_City')
 def read_07_overnight_window_is_not_dropped_or_same_day_rewritten(self):
  self.command(changes={'check_in_time':'22:00','check_in_window_end':'02:00','check_in_window_end_day_offset':1});r=self.read()['stays'][0]['stay'];self.assertEqual((r['check_in_time'],r['check_in_window_end'],r['check_in_window_end_day_offset']),('22:00:00','02:00:00',1))
 def read_08_off_calendar_stay_is_present_with_null_day_bindings(self):
  self.command(changes={'arrival_date':'2027-05-01','departure_date':'2027-05-03'});r=self.read()['stays'][0];self.assertIsNone(r['arrival_day_id']);self.assertIsNone(r['departure_day_id']);self.assertEqual(r['stay']['arrival_date'],'2027-05-01')
 def read_09_same_day_stay_is_valid(self):
  self.command(changes={'departure_date':'2027-04-01'});r=self.read()['stays'][0];self.assertEqual(r['arrival_day_id'],r['departure_day_id'])
 def read_10_retained_link_has_no_trashed_private_stay_projection(self):
  self.command(changes={'notes':'Retained private note'});self.command('trash');r=self.read();self.assertEqual(r['stays'],[]);self.assertEqual(r['bookings'][0]['stay_link'],{'id':self.stay,'state':'retained'});self.assertNotIn('Retained private note',json.dumps(r))
 def read_11_restore_recovers_original_lodging_and_link(self):
  self.command(changes={'notes':'Restore me'});self.command('trash');self.command('restore');r=self.read();self.assertEqual(r['stays'][0]['stay']['notes'],'Restore me');self.assertEqual(r['bookings'][0]['stay_link']['state'],'active')
 def read_12_parent_trip_trash_denies_then_restore_recovers(self):
  before=self.read();rpc('trash_family_trip',[self.trip,before['trip_revision']],self.owner);self.denied();rpc('restore_family_trip',[self.trip,sql('select revision from public.trips where id='+lit(self.trip))],self.owner);self.assertEqual(self.read()['stays'],before['stays'])
 def read_13_viewer_and_propose_member_can_read_without_direct_write_right(self):
  for user in[self.viewer,self.editor]:self.assertEqual(self.read(user)['user_id'],user)
 def read_14_foreign_family_and_missing_trip_cannot_read(self):
  self.denied(user=self.stranger);code,_=http('/rpc/get_family_trip_booking_view_v2',{'p_trip_id':new()},self.owner);self.assertEqual(code,403)
 def read_15_signed_aal1_session_refuses(self):self.assertEqual(http('/rpc/get_family_trip_booking_view_v2',{'p_trip_id':self.trip},self.owner,aal='aal1')[0],403)
 def read_16_revoked_existing_session_refuses_valid_signed_token(self):
  old=f.USERS[self.owner];record=sql('select to_jsonb(s)from auth.sessions s where id='+lit(old));sql('delete from auth.sessions where id='+lit(old))
  try:self.assertEqual(http('/rpc/get_family_trip_booking_view_v2',{'p_trip_id':self.trip},self.owner)[0],403)
  finally:sql('insert into auth.sessions select *from jsonb_populate_record(null::auth.sessions,'+lit(record)+'::jsonb)')
 def read_17_expired_session_refuses(self):
  sql('update auth.sessions set not_after=clock_timestamp()where id='+lit(f.USERS[self.owner]))
  try:self.denied()
  finally:sql("update auth.sessions set not_after=now()+interval '1 day'where id="+lit(f.USERS[self.owner]))
 def read_18_fresh_login_reads_current_same_actor_without_session_leak(self):
  sid=self.fresh_session();r=self.read();self.assertEqual(r['user_id'],self.owner);self.assertNotIn(sid,json.dumps(r));self.assertNotIn('session_id',r)
 def read_19_one_mvcc_snapshot_during_real_concurrent_stay_booking_change(self):
  old=self.read();r=self.blocked_read('update public.trip_reservations set title=\'Concurrent booking\'where id='+lit(self.booking)+';update public.trip_stays set notes=\'Concurrent stay\'where id='+lit(self.stay));self.assertEqual(r,old);now=self.read();self.assertEqual(now['bookings'][0]['record']['title'],'Concurrent booking');self.assertEqual(now['stays'][0]['stay']['notes'],'Concurrent stay')
 def read_20_post_snapshot_session_revocation_denies(self):
  sid=f.USERS[self.owner]
  try:
   with self.assertRaisesRegex(RuntimeError,'42501'):self.blocked_read('update auth.sessions set not_after=clock_timestamp()where id='+lit(sid))
  finally:sql("update auth.sessions set not_after=now()+interval '1 day'where id="+lit(sid))
 def read_21_post_snapshot_membership_revocation_denies(self):
  try:
   with self.assertRaisesRegex(RuntimeError,'42501'):self.blocked_read('update public.family_members set status=\'suspended\'where user_id='+lit(self.owner)+'and family_id='+lit(self.family))
  finally:sql('update public.family_members set status=\'active\'where user_id='+lit(self.owner)+'and family_id='+lit(self.family))
 def read_22_post_snapshot_person_archive_denies(self):
  try:
   with self.assertRaisesRegex(RuntimeError,'42501'):self.blocked_read('update public.people set archived_at=clock_timestamp()where id='+lit(self.person))
  finally:sql('update public.people set archived_at=null where id='+lit(self.person))
 def read_23_old_null_timing_is_not_reclassified_or_guessed(self):
  # Simulate a preserved pre130 booking by inserting a valid explicit legacy row; NULL original source rows are separately byte-preserved.
  b=self.add_booking(extra="timing_kind,starts_at='legacy_unclassified','2027-04-01T00:00:00.123456Z'");before=sql('select to_jsonb(r)from public.trip_reservations r where id='+lit(b));r=next(x for x in self.read()['bookings']if x['record']['id']==b);self.assertEqual(r['timing_state'],'unclassified');self.assertEqual(r['record']['starts_at'],'2027-04-01T00:00:00.123456+00:00');self.assertEqual(sql('select to_jsonb(r)from public.trip_reservations r where id='+lit(b)),before)
 def read_24_untimed_booking_preserves_date_facts_without_clocks(self):
  r=self.read()['bookings'][0];self.assertEqual(r['timing_state'],'untimed');self.assertIsNone(r['record']['starts_at']);self.assertIsNone(r['record']['ends_at'])
 def read_25_named_zone_timed_booking_preserves_micros(self):
  b=self.add_booking(extra="timing_kind,time_zone,starts_at='timed','America/Mexico_City','2027-04-01T00:00:00.123456Z'");r=next(x for x in self.read()['bookings']if x['record']['id']==b);self.assertEqual(r['timing_state'],'timed');self.assertEqual(r['record']['time_zone'],'America/Mexico_City');self.assertIn('.123456',r['record']['starts_at'])
 def read_26_private_helpers_and_service_anon_cannot_execute(self):
  for role in['anon','service_role']:self.rejected('select public.get_family_trip_booking_view_v2('+lit(self.trip)+')',code='42501',role=role)
  for func in['family_auth.require_booking_stay_read','family_auth.booking_stay_snapshot']:self.rejected('select '+func+'('+lit(self.trip)+')',code='42501',user=self.owner)
 def read_27_booking_limit_refuses_whole_view(self):
  sql('insert into public.trip_reservations(trip_id,type,title)select '+lit(self.trip)+",'hotel','Limit'from generate_series(1,2000)");self.denied('54000')
 def read_28_stay_limit_refuses_whole_view(self):
  sql('insert into public.trip_stays(trip_id,family_id,location_id,arrival_date,departure_date,created_by_person_id)select '+','.join(map(lit,[self.trip,self.family,self.location,'2027-04-01','2027-04-03',self.person]))+'from generate_series(1,2000)');self.denied('54000')
 def read_29_aggregate_byte_limit_with_each_subreader_under_its_own_limit(self):
  sql('begin;create temp table read_pairs(id uuid)on commit drop;insert into read_pairs select gen_random_uuid()from generate_series(1,230);insert into public.trip_reservations(id,trip_id,type,title,notes)select id,'+lit(self.trip)+",'hotel','Bound',repeat('b',10000)from read_pairs;insert into public.trip_stays(id,trip_id,family_id,location_id,arrival_date,departure_date,created_by_person_id,notes)select id,"+','.join(map(lit,[self.trip,self.family,self.location,'2027-04-01','2027-04-03',self.person]))+",repeat('s',18000)from read_pairs;insert into public.trip_stay_booking_links select id,id,"+lit(self.trip)+'from read_pairs;commit;')
  for func in['get_family_trip_booking_view_v1','get_family_trip_stay_view_v1']:self.assertLess(int(sql('select octet_length(public.'+func+'('+lit(self.trip)+')::text)',self.owner)),8388608)
  with self.assertRaisesRegex(RuntimeError,'54000'):self.read()
 def read_30_no_internal_receipt_history_or_mutation_capabilities(self):
  self.command(changes={'notes':'Content'});r=self.read();self.assertEqual(set(r),{'version','trip_id','family_id','user_id','person_id','trip_revision','days','bookings','completeness','planner','stays','capabilities'});self.assertNotIn('stay_command_receipts',json.dumps(r));self.assertFalse(r['capabilities']['native_read'])
if __name__=='__main__':
 names=[n for n in dir(CoherentRead)if n.startswith('read_')];result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(CoherentRead(n)for n in names));(S/'read-tests.json').write_text(json.dumps({'tests':result.testsRun,'errors':len(result.errors),'failures':len(result.failures),'skipped':len(result.skipped),'SQL':f.COUNTERS['sql'],'HTTP':f.COUNTERS['http'],'methods':names},indent=2)+'\n');sys.exit(not result.wasSuccessful())
