"""Calendar/owned-arrival integrity; only the explicitly guarded isolated derivative."""
from pathlib import Path
import concurrent.futures,copy,json,subprocess,sys,time,unittest
sys.path.insert(0,'/Users/Misael/Desktop/FamilyTravelApp/supabase/tests')
import trip_native_stay_calendar_guard as g
sys.path.insert(0,str(g.S))
from test_native import NativeStay,rpc,sql,new,lit,f
class CalendarIntegrity(NativeStay):
 def setUp(self):
  super().setUp();self.command('trash');self.p=self.native();self.execute(self.p);self.v=self.visit(self.p)
 def calendar_scope(self):return{'version':1,'layer':'published','trip_id':self.trip,'family_id':self.family,'user_id':self.owner,'person_id':self.person}
 def calendar(self,change):
  c=rpc('get_family_trip_calendar_v1',[self.trip],self.owner)
  return rpc('revise_family_trip_calendar_v1',[self.trip,new(),self.calendar_scope(),c['observation'],change],self.owner)
 def complete_graph(self):return self.graph()+sql("select jsonb_agg(to_jsonb(d)order by id)from public.trip_days d where trip_id="+lit(self.trip))
 def invariant(self):
  self.assertEqual(sql("select count(*)from public.schedule_items v join public.trip_stays s on s.id=v.owning_stay_id left join public.trip_days d on d.id=v.trip_day_id where v.trip_id="+lit(self.trip)+" and v.deleted_at is null and(v.trip_id<>s.trip_id or v.plan_location_id<>s.location_id or d.civil_day is distinct from s.arrival_date or s.deleted_at is not null)"),'0')
 def rejects(self,fn,code='23514'):
  before=self.complete_graph()
  with self.assertRaisesRegex(RuntimeError,code):fn()
  self.assertEqual(self.complete_graph(),before);self.invariant()
 def raw(self,statement):
  claims={'sub':self.owner,'role':'authenticated','aal':'aal2','session_id':f.USERS[self.owner]}
  # Model the existing private checked-calendar context as the normal owner; clients cannot insert it.
  context="insert into family_auth.visit_command_context(transaction_id,trip_id,actor_user_id,purpose)values(pg_current_xact_id(),"+lit(self.trip)+","+lit(self.owner)+",'calendar_order');"
  cleanup='delete from family_auth.visit_command_context where transaction_id=pg_current_xact_id();'
  return 'begin;set local role postgres;set local request.jwt.claims='+lit(json.dumps(claims))+';'+context+statement.replace('commit;',cleanup+'commit;')
 def calendar_01_inserting_before_owned_arrival_rolls_back_all_rows(self):self.rejects(lambda:self.calendar({'action':'insert','position':1}))
 def calendar_02_reordering_owned_date_rolls_back_all_rows(self):
  c=rpc('get_family_trip_calendar_v1',[self.trip],self.owner);self.rejects(lambda:self.calendar({'action':'reorder','order':[d['id']for d in reversed(c['observation']['days'])]}))
 def calendar_03_day_title_is_still_writable(self):self.calendar({'action':'title','day_id':self.v['trip_day_id'],'title':'Native title'});self.invariant()
 def calendar_04_append_after_arrival_is_still_writable(self):self.calendar({'action':'append'});self.invariant()
 def calendar_05_extend_end_is_still_writable(self):self.calendar({'action':'extend','end_date':'2027-04-06'});self.invariant()
 def calendar_06_insert_after_owned_date_is_allowed(self):self.calendar({'action':'insert','position':3});self.invariant()
 def calendar_07_reorder_other_days_keeps_owned_date(self):
  c=rpc('get_family_trip_calendar_v1',[self.trip],self.owner);ids=[d['id']for d in c['observation']['days']];self.calendar({'action':'reorder','order':ids[:1]+list(reversed(ids[1:]))});self.invariant()
 def calendar_08_no_owned_arrival_preserves_general_calendar_support(self):
  self.execute(self.native(self.existing(self.p['stay_id'],'trash'),True));self.calendar({'action':'insert','position':1});self.invariant()
 def calendar_09_trashed_arrival_does_not_block_calendar_and_restores_same_identity(self):
  old=self.v['id'];self.execute(self.native(self.existing(self.p['stay_id'],'trash')));self.calendar({'action':'insert','position':1});self.execute(self.native(self.existing(self.p['stay_id'],'restore')));self.assertEqual(self.visit(self.p)['id'],old);self.invariant()
 def calendar_10_native_move_still_preserves_its_arrival(self):
  q=self.native(self.existing(self.p['stay_id'],changes={'arrival_date':'2027-04-02'}));self.execute(q);self.assertEqual(self.visit(self.p)['id'],self.v['id']);self.invariant()
 def calendar_11_native_trash_restore_still_works(self):
  self.execute(self.native(self.existing(self.p['stay_id'],'trash')));self.execute(self.native(self.existing(self.p['stay_id'],'restore')));self.assertEqual(self.visit(self.p)['id'],self.v['id']);self.invariant()
 def calendar_12_raw_date_change_is_refused_at_commit(self):
  self.rejects(lambda:sql(self.raw("update public.trip_days set civil_day=civil_day+60 where id="+lit(self.v['trip_day_id'])+';commit;')))
 def calendar_13_set_constraints_immediate_catches_invalid_state(self):
  self.rejects(lambda:sql(self.raw('update public.trip_days set civil_day=civil_day+60 where id='+lit(self.v['trip_day_id'])+';set constraints native_stay_calendar_consistency immediate;commit;')))
 def calendar_14_temporary_change_restored_before_commit_is_legal(self):
  sql(self.raw('update public.trip_days set civil_day=civil_day+60 where id='+lit(self.v['trip_day_id'])+';update public.trip_days set civil_day=civil_day-60 where id='+lit(self.v['trip_day_id'])+';commit;'));self.invariant()
 def calendar_15_civil_day_noop_does_not_change_arrival(self):
  sql(self.raw('update public.trip_days set civil_day=civil_day where id='+lit(self.v['trip_day_id'])+';commit;'));self.assertEqual(self.visit(self.p),self.v);self.invariant()
 def calendar_16_new_functions_are_private_and_non_superuser_owned(self):
  for n in['tg_native_stay_calendar_lock','tg_native_stay_calendar_consistency']:
   sig='family_auth.'+n+'()'
   for role in['anon','authenticated','service_role']:self.assertEqual(sql('select has_function_privilege('+lit(role)+','+lit(sig)+",'execute')"),'f')
   self.assertEqual(sql('select pg_get_userbyid(proowner)from pg_proc where oid='+lit(sig)+'::regprocedure'),'postgres');self.assertEqual(sql('select proconfig::text from pg_proc where oid='+lit(sig)+'::regprocedure'),'{"search_path=\\"\\""}')
  self.assertEqual(sql("select rolsuper from pg_roles where rolname='postgres'"),'f')
 def calendar_17_final_constraint_is_deferred_and_enabled(self):
  self.assertEqual(sql("select count(*)from pg_trigger where tgname='native_stay_calendar_consistency'and tgdeferrable and tginitdeferred and tgenabled='O'"),'1')
  self.assertEqual(sql("select count(*)from pg_trigger where tgname='aaa_native_stay_calendar_lock'and not tgdeferrable and tgenabled='O'"),'1')
 def calendar_18_all_612_old_routine_definitions_owners_and_grants_are_exact(self):
  before={x['signature']:x for x in json.loads((g.S/'functions135-private.json').read_text())};after={x['signature']:x for x in json.loads(sql("select json_agg(json_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'def',pg_get_functiondef(p.oid)))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','family_auth')and p.prokind='f'"))};self.assertEqual(len(before),612);self.assertEqual(len(after),614);self.assertTrue(all(after[k]==v for k,v in before.items()))
 def calendar_19_generic_visit_move_still_cannot_break_ownership(self):
  self.rejects(lambda:rpc('mutate_family_trip_visit_v1',[self.trip,new(),'update',self.v['id'],self.v['visit_revision'],{'day_id':None}],self.owner),'0A000')
 def calendar_20_generic_visit_trash_still_cannot_break_ownership(self):
  self.rejects(lambda:rpc('mutate_family_trip_visit_v1',[self.trip,new(),'trash',self.v['id'],self.v['visit_revision'],{}],self.owner),'0A000')
 def calendar_21_independent_visit_note_and_duration_are_still_writable(self):
  rpc('mutate_family_trip_visit_v1',[self.trip,new(),'update',self.v['id'],self.v['visit_revision'],{'notes':'Kept independent note','duration_minutes':19}],self.owner);v=self.visit(self.p);self.assertEqual(v['explanations'],'Kept independent note');self.assertEqual(v['planned_duration_minutes'],19);self.invariant()
 def calendar_22_concurrent_calendar_and_native_save_leave_consistent_state(self):
  q=self.native(self.existing(self.p['stay_id'],changes={'notes':'Concurrent lodging note'}));c=rpc('get_family_trip_calendar_v1',[self.trip],self.owner)
  def change():
   try:rpc('revise_family_trip_calendar_v1',[self.trip,new(),self.calendar_scope(),c['observation'],{'action':'insert','position':1}],self.owner);return'committed'
   except RuntimeError:return'refused'
  with concurrent.futures.ThreadPoolExecutor(2)as pool:
   a=pool.submit(change);b=pool.submit(self.execute,q);self.assertEqual(a.result(timeout=15),'refused');self.assertEqual(b.result(timeout=15)['action'],'save')
  self.invariant()
 def calendar_23_raw_day_writer_waits_for_parent_trip_lock(self):
  st=g.validate();args=['docker','exec','-i',st['id'],'psql','-h','/socket','-X','-Atq','-v','ON_ERROR_STOP=1','-U',g.OP,'-d',g.DB]
  p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  try:
   p.stdin.write("begin;select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"+lit(self.trip)+",0));\\echo HELD\n");p.stdin.flush()
   while p.stdout.readline().strip()!='HELD':
    if p.poll()is not None:self.fail('Parent lock fixture failed')
   with concurrent.futures.ThreadPoolExecutor(1)as pool:
    future=pool.submit(sql,self.raw('update public.trip_days set civil_day=civil_day+60 where id='+lit(self.v['trip_day_id'])+';commit;'));time.sleep(.15);self.assertFalse(future.done());p.stdin.write('rollback;\n');p.stdin.flush()
    with self.assertRaisesRegex(RuntimeError,'23514'):future.result(timeout=10)
   self.invariant()
  finally:
   if p.poll()is None:p.stdin.write('rollback;\n');p.stdin.close();p.wait(timeout=10)
 def calendar_24_preflight_refuses_bad_data_without_automatic_repair(self):
  root=Path('/Users/Misael/Desktop/FamilyTravelApp/supabase/migrations');p=next(root.glob('*_native_stay_calendar_consistency.sql'));raw=p.read_text();check=raw[raw.index('do $$ begin'):raw.rfind('commit;')]
  before=self.complete_graph();r=g.run(self.raw('alter table public.trip_days disable trigger native_stay_calendar_consistency;update public.trip_days set civil_day=civil_day+60 where id='+lit(self.v['trip_day_id'])+';'+check))
  self.assertNotEqual(r.returncode,0);self.assertIn('Repair the explicitly identified lodging arrival inconsistency',r.stderr);self.assertEqual(before,self.complete_graph());self.invariant()
if __name__=='__main__':
 names=[n for n in dir(CalendarIntegrity)if n.startswith('calendar_')and n[9:11].isdigit()];r=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(CalendarIntegrity(n)for n in names));(g.S.parent/'calendar-tests.json').write_text(json.dumps({'tests':r.testsRun,'errors':len(r.errors),'failures':len(r.failures),'skipped':len(r.skipped),'methods':names},indent=2)+'\n');sys.exit(not r.wasSuccessful())
