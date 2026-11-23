"""Native stay transaction qualification on an explicitly guarded local derivative."""
from pathlib import Path
import copy,concurrent.futures,json,subprocess,sys,time,unittest
sys.path.insert(0,str(Path(__file__).resolve().parent))
import trip_native_stays_guard as g
S=g.S
sys.modules['trip_stay_bundle_guard']=g
sys.modules['trip_stay_commands_guard']=g
from trip_stay_bundle import StayBundle,f,sql,rpc,http,new,lit
class NativeStay(StayBundle):
 def native(self,inner=None,keep=False,user=None):return rpc('get_family_native_stay_context_v1',[inner or self.packet(user=user),new(),keep],user or self.owner)['command']
 def execute(self,p,user=None):return rpc('execute_family_native_stay_v1',[p],user or self.owner)
 def inspect(self,p,cancel=False,user=None):return rpc('cancel_family_native_stay_v1'if cancel else'get_family_native_stay_outcome_v1',[p],user or self.owner)
 def existing(self,sid,action='save',changes=None,user=None):
  c=self.context(stay=sid,location=(changes or {}).get('location_id'),user=user)
  return {'action':action,'stay_id':sid,'operation_id':new(),'scope':c['scope'],'observation':c['observation'],'changes':changes or {},'reservation_id':None}
 def view_native(self,user=None):return rpc('get_family_native_stay_view_v1',[self.trip],user or self.owner)
 def visit(self,p):
  rows=json.loads(sql('select coalesce(json_agg(to_jsonb(v)),\'[]\')from public.schedule_items v where owning_stay_id='+lit(p['stay_id'])))
  return rows[0]if rows else None
 def planned(self,location=None,day=None):
  day=day or json.loads(sql('select json_agg(id order by civil_day)from public.trip_days where trip_id='+lit(self.trip)))[0]
  return rpc('mutate_family_trip_visit_v1',[self.trip,new(),'create',None,None,{'location_id':location or self.location,'day_id':day}],self.owner)['id']
 def graph(self):
  original=json.loads(super().graph())
  for table in ['public.schedule_items','family_auth.trip_location_receipts','family_auth.visit_command_receipts','family_auth.native_stay_context','family_auth.visit_command_context']:
   original[table]=json.loads(sql('select coalesce(jsonb_agg(j order by j::text),\'[]\')from(select to_jsonb(x)j from '+table+' x where trip_id='+lit(self.trip)+')q'))
  return json.dumps(original,sort_keys=True)
 def deny(self,p,code='PT409',action='execute',user=None):
  before=self.graph()
  with self.assertRaisesRegex(RuntimeError,code):
   if action=='execute':self.execute(p,user)
   else:self.inspect(p,action=='cancel',user)
  self.assertEqual(self.graph(),before)
 def fresh(self):
  old=f.USERS[self.owner];sid=new();sql('insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after,factor_id)select '+lit(sid)+",user_id,now(),now(),aal,now()+interval '1 day',factor_id from auth.sessions where id="+lit(old));f.USERS[self.owner]=sid;self.addCleanup(lambda:f.USERS.__setitem__(self.owner,old));return sid
 def page(self,cursor=None,limit=25,user=None):return rpc('list_family_trashed_stays_v1',[self.trip,cursor,limit],user or self.owner)
 def native_01_create_one_untimed_arrival_and_independent_booking(self):
  p=self.native();r=self.execute(p);v=self.visit(p);self.assertEqual(r['arrival_visit_id'],p['arrival_visit_id']);self.assertEqual(v['id'],r['arrival_visit_id']);self.assertEqual(v['plan_location_id'],self.location);self.assertEqual(v['timing_kind'],'untimed');self.assertIsNone(v['starts_at']);self.assertIsNone(v['time_zone']);self.assertIsNone(v['explanations']);self.assertEqual(v['owning_stay_id'],p['stay_id']);self.assertEqual(r['format'],'family.native-stay-ack.v1');self.assertGreater(r['trip_revision_after'],p['inner']['observation']['trip_revision'])
 def native_02_exact_retry_is_one_transaction_and_one_outer_decision(self):
  p=self.native();a=self.execute(p);before=self.graph();self.assertEqual(self.execute(p),a);self.assertEqual(before,self.graph());self.assertEqual(sql('select count(*)from family_auth.trip_location_receipts where operation_id='+lit(p['operation_id'])),'1')
 def native_03_unknown_inspection_is_read_only_and_cancel_blocks_inner_too(self):
  p=self.native();before=self.graph();self.assertEqual(self.inspect(p)['status'],'unknown');self.assertEqual(self.graph(),before);out=self.inspect(p,True);self.assertEqual(out['status'],'cancelled');self.assertEqual(out,self.inspect(p,True));self.deny(p)
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.create(p['inner'])
 def native_04_committed_cannot_be_cancelled_and_receipt_is_historical(self):
  p=self.native();ack=self.execute(p);out=self.inspect(p,True);self.assertEqual(out['status'],'committed');self.assertEqual(out['acknowledgement'],ack);self.assertIsNone(out['cancelled_at'])
 def native_05_reuses_independent_arrival_without_claiming_or_editing_it(self):
  vid=self.planned();before=sql('select to_jsonb(v)from public.schedule_items v where id='+lit(vid));p=self.native();ack=self.execute(p);self.assertEqual(ack['arrival_visit_id'],vid);self.assertIsNone(self.visit(p));self.assertEqual(before,sql('select to_jsonb(v)from public.schedule_items v where id='+lit(vid)))
 def native_06_repeated_stays_share_arrival_without_stealing_it(self):
  p=self.native();self.execute(p);v=self.visit(p);q=self.native();self.execute(q);self.assertIsNone(self.visit(q));self.execute(self.native(self.existing(p['stay_id'],'trash')));after=json.loads(sql('select to_jsonb(v)from public.schedule_items v where id='+lit(v['id'])));self.assertIsNone(after['deleted_at']);self.assertIsNone(after['owning_stay_id']);self.assertEqual(sql('select deleted_at is null from public.trip_stays where id='+lit(q['stay_id'])),'t')
 def native_07_deliberate_stays_on_different_days_have_different_arrivals(self):
  p=self.native();self.execute(p);i=self.packet();i['stay']['arrival_date']='2027-04-02';days=json.loads(sql('select json_agg(id order by civil_day)from public.trip_days where trip_id='+lit(self.trip)));c=rpc('get_family_stay_bundle_context_v1',[self.trip,self.location,days[1],days[-1],i['stay_id'],i['reservation_id']],self.owner);i['observation']=c['observation'];q=self.native(i);self.execute(q);self.assertNotEqual(self.visit(p)['id'],self.visit(q)['id'])
 def native_08_save_moves_original_arrival_identity_and_preserves_visit_notes(self):
  self.command('trash') # Isolate ownership behavior from the preexisting independent stay at this lodging.
  p=self.native();self.execute(p);v=self.visit(p);rpc('mutate_family_trip_visit_v1',[self.trip,new(),'update',v['id'],v['visit_revision'],{'notes':'Separate arrival visit note','duration_minutes':17}],self.owner)
  q=self.native(self.existing(p['stay_id'],changes={'arrival_date':'2027-04-02','check_in_time':'00:00:01'}));self.execute(q);after=self.visit(p);self.assertEqual(after['id'],v['id']);self.assertEqual(after['explanations'],'Separate arrival visit note');self.assertEqual(after['planned_duration_minutes'],17);self.assertNotEqual(after['trip_day_id'],v['trip_day_id']);self.assertIsNone(after['starts_at'])
 def native_09_generic_stay_move_cannot_desynchronize_owned_arrival(self):
  p=self.native();self.execute(p);before=self.graph()
  with self.assertRaisesRegex(RuntimeError,'0A000'):self.command(stay=p['stay_id'],changes={'arrival_date':'2027-04-02'})
  self.assertEqual(self.graph(),before)
 def native_10_trash_and_restore_same_visit_without_deleting_booking(self):
  self.command('trash') # Isolate ownership behavior from the preexisting independent stay at this lodging.
  p=self.native();self.execute(p);v=self.visit(p);booking=sql('select to_jsonb(b)from public.trip_reservations b where id='+lit(p['inner']['reservation_id']));self.execute(self.native(self.existing(p['stay_id'],'trash')));self.assertIsNotNone(self.visit(p)['deleted_at']);self.assertEqual(booking,sql('select to_jsonb(b)from public.trip_reservations b where id='+lit(p['inner']['reservation_id'])));self.execute(self.native(self.existing(p['stay_id'],'restore')));self.assertEqual(self.visit(p)['id'],v['id']);self.assertIsNone(self.visit(p)['deleted_at']);self.assertNotIn(p['stay_id'],[r['id']for r in self.page()['items']])
 def native_11_keep_stop_releases_and_restore_does_not_reclaim_independent_visit(self):
  p=self.native();self.execute(p);v=self.visit(p);self.execute(self.native(self.existing(p['stay_id'],'trash'),True));self.assertIsNone(self.visit(p));self.assertEqual(sql('select deleted_at is null and owning_stay_id is null from public.schedule_items where id='+lit(v['id'])),'t');self.execute(self.native(self.existing(p['stay_id'],'restore')));self.assertIsNone(self.visit(p));self.assertEqual(sql('select count(*)from public.schedule_items where trip_id='+lit(self.trip)+'and deleted_at is null'),'1')
 def native_12_generic_visit_trash_or_move_cannot_break_owned_arrival(self):
  p=self.native();self.execute(p);v=self.visit(p)
  for action,payload in [('trash',{}),('update',{'day_id':None})]:
   before=self.graph()
   with self.assertRaisesRegex(RuntimeError,'0A000'):rpc('mutate_family_trip_visit_v1',[self.trip,new(),action,v['id'],v['visit_revision'],payload],self.owner)
   self.assertEqual(self.graph(),before)
 def native_13_notes_only_save_does_not_reseat_dragged_arrival(self):
  p=self.native();self.execute(p);v=self.visit(p);q=self.native(self.existing(p['stay_id'],changes={'notes':'Stay note only'}));self.execute(q);self.assertEqual(v,self.visit(p));self.assertEqual(sql('select notes from public.trip_stays where id='+lit(p['stay_id'])),'Stay note only')
 def native_14_fresh_session_inspects_and_cancels_but_does_not_rebind_write(self):
  p=self.native();sid=self.fresh();out=self.inspect(p);self.assertEqual(out['current_scope']['session_id'],sid);self.assertEqual(out['original_session_id'],p['scope']['session_id']);self.deny(p);self.assertEqual(self.inspect(p,True)['status'],'cancelled')
 def native_15_signed_foreign_aal1_and_expired_sessions_refuse(self):
  p=self.native();before=self.graph()
  for name in ['execute_family_native_stay_v1','get_family_native_stay_outcome_v1','cancel_family_native_stay_v1']:
   for user,aal in [(self.owner,'aal1'),(self.stranger,'aal2')]:self.assertEqual(http('/rpc/'+name,{'p_command':p},user,aal=aal)[0],403)
  old=f.USERS[self.owner];sql('update auth.sessions set not_after=now()where id='+lit(old))
  try:
   for action in ['execute','inspect','cancel']:self.deny(p,'42501',action)
  finally:sql("update auth.sessions set not_after=now()+interval '1 day'where id="+lit(old))
  self.assertEqual(self.graph(),before)
 def native_16_current_domains_are_separate_for_create_vs_lifecycle(self):
  for key in ['trip.schedule.manage','trip.reservations.manage']:self.permit(key)
  p=self.native(user=self.editor);self.execute(p,self.editor);self.permit('trip.reservations.manage',None,None)
  self.execute(self.native(self.existing(p['stay_id'],'trash',user=self.editor),user=self.editor),self.editor)
  self.execute(self.native(self.existing(p['stay_id'],'restore',user=self.editor),user=self.editor),self.editor)
  self.permit('trip.schedule.manage',None,'trip_travelers')
  with self.assertRaisesRegex(RuntimeError,'42501'):self.page(user=self.editor)
  self.deny(p,'42501',user=self.editor)
 def native_17_stale_trip_or_day_or_visit_observation_is_not_rebased(self):
  p=self.native();self.planned();self.deny(p)
 def native_18_whole_command_identity_collision_refuses(self):
  p=self.native();self.execute(p)
  for key,value in [('arrival_visit_id',new()),('keep_stop',True)]:
   q=copy.deepcopy(p);q[key]=value;self.deny(q,'22023'if key=='keep_stop'else'PT409')
 def native_19_standalone_inner_commit_cannot_be_adopted_as_native_success(self):
  p=self.native();self.create(p['inner']);self.deny(p)
  for action in ['inspect','cancel']:self.deny(p,action=action)
 def native_20_parallel_identical_retries_are_one_atomic_decision(self):
  p=self.native()
  with concurrent.futures.ThreadPoolExecutor(2)as pool:r=list(pool.map(lambda _:self.execute(p),range(2)))
  self.assertEqual(r[0],r[1]);self.assertEqual(sql('select count(*)from public.schedule_items where owning_stay_id='+lit(p['stay_id'])),'1')
 def native_21_create_cancel_race_has_one_terminal_decision(self):
  p=self.native()
  def create():
   try:self.execute(p);return 'committed'
   except RuntimeError as e:self.assertIn('PT409',str(e));return 'cancelled'
  with concurrent.futures.ThreadPoolExecutor(2)as pool:a=pool.submit(create);b=pool.submit(self.inspect,p,True);self.assertEqual(a.result(),b.result()['status'])
  out=self.inspect(p);self.assertEqual(sql('select count(*)from public.trip_stays where id='+lit(p['stay_id'])),'1'if out['status']=='committed'else'0')
 def native_22_paged_trash_lists_same_ids_and_no_duplicates(self):
  for _ in range(3):
   p=self.native();self.execute(p);self.execute(self.native(self.existing(p['stay_id'],'trash'),True))
  rows=[];cursor=None
  while True:
   page=self.page(cursor,1);self.assertEqual(page['format'],'family.stay-trash.v1');rows+=page['items']
   if not page['has_more']:break
   cursor=page['next_cursor'];self.assertIsNotNone(cursor)
  self.assertEqual(len(rows),3);self.assertEqual(len({r['id']for r in rows}),3);self.assertTrue(all(r['restore_available']for r in rows))
 def native_23_trash_cursor_and_bounds_are_strict(self):
  for cursor,limit in [({},25),({'id':new(),'deleted_at':'infinity'},25),({'id':new(),'deleted_at':'2026-11-14T01:00:00Z','extra':1},25),(None,0),(None,51),(None,None)]:
   with self.assertRaisesRegex(RuntimeError,'22023'):self.page(cursor,limit)
 def native_24_trash_refuses_viewer_foreign_and_parent_trip_trash(self):
  for user in [self.viewer,self.stranger]:
   with self.assertRaisesRegex(RuntimeError,'42501'):self.page(user=user)
  rpc('trash_family_trip',[self.trip,sql('select revision from public.trips where id='+lit(self.trip))],self.owner)
  with self.assertRaisesRegex(RuntimeError,'42501'):self.page()
 def native_25_new_view_pins_owner_without_changing_old_view_shape(self):
  p=self.native();self.execute(p);old=rpc('get_family_trip_booking_view_v2',[self.trip],self.owner);native=self.view_native();self.assertEqual(native['format'],'family.native-stay-view.v1');owned=[v for v in native['core']['planner']['state']['visits']if v.get('owning_stay_id')==p['stay_id']];self.assertEqual(len(owned),1);self.assertTrue(all('owning_stay_id'not in v for v in old['planner']['state']['visits']));self.assertEqual({k:v for k,v in native['core'].items()if k!='planner'},{k:v for k,v in old.items()if k!='planner'})
 def native_26_true_midnight_seconds_and_overnight_remain_guidance_not_timestamps(self):
  i=self.packet();i['stay'].update(check_in_time='00:00:01',check_in_window_end='00:00:02',check_out_time='00:00:03',time_zone='America/Mexico_City');p=self.native(i);self.execute(p);v=self.visit(p);self.assertIsNone(v['starts_at']);self.assertIsNone(v['ends_at']);self.assertIsNone(v['time_zone']);self.assertEqual(sql('select check_in_time from public.trip_stays where id='+lit(p['stay_id'])),'00:00:01')
  q=self.native(self.existing(p['stay_id'],changes={'check_in_time':'22:00','check_in_window_end':'02:00','check_in_window_end_day_offset':1}));self.execute(q);self.assertEqual(sql('select check_in_window_end_day_offset from public.trip_stays where id='+lit(p['stay_id'])),'1')
 def native_27_missing_clocks_lead_unclocked_places_without_fabricated_appointments(self):
  location=sql('insert into public.trip_plan_locations(trip_id,family_id,label,created_by_person_id)values('+lit(self.trip)+','+lit(self.family)+',\'Other independent stop\','+lit(self.person)+')returning id');other=self.planned(location);p=self.native();self.execute(p);self.assertLess(self.visit(p)['sort_order'],int(sql('select sort_order from public.schedule_items where id='+lit(other))))
 def native_28_owned_arrival_is_exported_in_existing_full_schedule_records(self):
  p=self.native();self.execute(p);job=sql('insert into public.family_export_jobs(family_id,requested_by_person_id,requested_by_user_id,expires_at)values('+lit(self.family)+','+lit(self.person)+','+lit(self.owner)+",now()+interval '1 day')returning id");tables=json.loads(sql('select public.build_family_export_v1('+lit(job)+')'))['snapshot']['tables'];self.assertTrue(any(v.get('owning_stay_id')==p['stay_id']for v in tables['schedule_items']))
 def native_29_outer_receipt_failure_rolls_back_stay_booking_arrival_and_all_audit(self):
  p=self.native();before=self.graph();name='test_native_receipt_fail';sql('create function public.'+name+"()returns trigger language plpgsql as $$begin if new.trip_id="+lit(self.trip)+"::uuid then raise exception 'native receipt failure';end if;return new;end;$$;create trigger "+name+' before insert on family_auth.trip_location_receipts for each row execute function public.'+name+'()')
  try:
   with self.assertRaisesRegex(RuntimeError,'native receipt failure'):self.execute(p)
  finally:sql('drop trigger '+name+' on family_auth.trip_location_receipts;drop function public.'+name+'()')
  self.assertEqual(before,self.graph())
 def native_30_arrival_insert_failure_rolls_back_every_inner_bundle_row(self):
  p=self.native();before=self.graph();name='test_native_arrival_fail';sql('create function public.'+name+"()returns trigger language plpgsql as $$begin if new.trip_id="+lit(self.trip)+"::uuid then raise exception 'native arrival failure';end if;return new;end;$$;create trigger "+name+' before insert on public.schedule_items for each row execute function public.'+name+'()')
  try:
   with self.assertRaisesRegex(RuntimeError,'native arrival failure'):self.execute(p)
  finally:sql('drop trigger '+name+' on public.schedule_items;drop function public.'+name+'()')
  self.assertEqual(before,self.graph())
 def native_31_malformed_unknown_fields_are_refused_without_writes(self):
  base=self.native()
  for change in [lambda p:p.update(extra=1),lambda p:p.update(arrival_visit_id=1),lambda p:p.update(keep_stop=None),lambda p:p.update(observation=None),lambda p:p['inner'].update(extra=1),lambda p:p.update(scope={})]:
   p=copy.deepcopy(base);change(p);self.deny(p,'22023')
 def native_32_no_direct_client_right_on_ownership_or_internal_context(self):
  self.assertEqual(sql("select has_column_privilege('authenticated','public.schedule_items','owning_stay_id','UPDATE')or has_column_privilege('authenticated','public.schedule_items','owning_stay_id','INSERT')"),'f');self.assertEqual(sql("select has_table_privilege('authenticated','family_auth.native_stay_context','SELECT,INSERT,UPDATE,DELETE')"),'f')
 def native_33_shared_old_arrival_is_retained_when_one_stay_moves(self):
  a=self.native();self.execute(a);old=self.visit(a);b=self.native();self.execute(b);self.execute(self.native(self.existing(a['stay_id'],changes={'arrival_date':'2027-04-02'})));after=json.loads(sql('select to_jsonb(v)from public.schedule_items v where id='+lit(old['id'])));self.assertIsNone(after['owning_stay_id']);self.assertIsNone(after['deleted_at']);self.assertNotEqual(self.visit(a)['id'],old['id'])
 def blocked_native(self,p,table,predicate,change,user=None):
  st=g.validate();locker=subprocess.Popen(['docker','exec','-i',st['id'],'psql','-h','/socket','-X','-Atq','-v','ON_ERROR_STOP=1','-U',g.OP,'-d',g.DB],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  locker.stdin.write('begin;select 1 from '+table+'where '+predicate+'for update;\n\\echo HELD\n');locker.stdin.flush()
  for _ in range(8):
   if locker.stdout.readline().strip()=='HELD':break
  else:raise AssertionError('Expected real owned row lock')
  with concurrent.futures.ThreadPoolExecutor(1)as pool:
   future=pool.submit(self.execute,p,user)
   try:
    waiting=False
    for _ in range(90):
     if sql("select exists(select 1 from pg_stat_activity where wait_event_type='Lock'and query like '%execute_family_native_stay_v1%'and query like '%"+p['stay_id']+"%')")=='t':waiting=True;break
     time.sleep(.025)
    self.assertTrue(waiting);locker.stdin.write(change+';commit;\n');locker.stdin.close();self.assertEqual(locker.wait(timeout=12),0,locker.stderr.read())
    with self.assertRaisesRegex(RuntimeError,'42501'):future.result(timeout=15)
   finally:
    if locker.poll()is None:locker.stdin.write('rollback;\n');locker.stdin.close();locker.wait(timeout=10)
 def native_34_real_visit_lock_wait_rechecks_changed_domain_policy(self):
  self.planned()
  for key in ['trip.schedule.manage','trip.reservations.manage']:self.permit(key)
  p=self.native(user=self.editor);vid=sql('select id from public.schedule_items where trip_id='+lit(self.trip)+'limit 1');before=self.graph()
  self.blocked_native(p,'public.schedule_items ','id='+lit(vid)+' ',"update public.family_permission_policies set direct_scope=null,propose_scope='trip_travelers'where family_id="+lit(self.family)+"and capability_key='trip.schedule.manage'",self.editor);self.assertEqual(self.graph(),before)
 def native_35_real_session_lock_wait_rechecks_expiry(self):
  p=self.native();sid=f.USERS[self.owner]
  try:self.blocked_native(p,'auth.sessions ','id='+lit(sid)+' ',"update auth.sessions set not_after=clock_timestamp()where id="+lit(sid))
  finally:sql("update auth.sessions set not_after=now()+interval '1 day'where id="+lit(sid))
 def native_36_real_membership_lock_wait_refuses_suspension(self):
  p=self.native()
  try:self.blocked_native(p,'public.family_members ','family_id='+lit(self.family)+'and user_id='+lit(self.owner)+' ',"update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
  finally:sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
 def native_37_native_decisions_are_immutable_at_database_boundary(self):
  p=self.native();self.execute(p)
  for action in ["update family_auth.trip_location_receipts set result='{}'where operation_id=",'delete from family_auth.trip_location_receipts where operation_id=']:
   with self.assertRaises(RuntimeError):sql(action+lit(p['operation_id']))
  self.assertEqual(self.inspect(p)['status'],'committed')
 def native_38_incomplete_or_oversized_observation_cannot_be_cancelled(self):
  base=self.native()
  for value in [{},{'bad':True},base['observation']|{'day_id':1},base['observation']|{'day_visits':[{}]},base['observation']|{'owned_visit':'x'},base['observation']|{'extra':'x'*2100000}]:
   p=copy.deepcopy(base);p['observation']=value
   for action in ['execute','inspect','cancel']:self.deny(p,'22023',action)
 def native_39_trashed_lodging_is_visible_but_not_falsely_restorable(self):
  self.command('trash');revision=sql('select revision from public.trip_plan_locations where id='+lit(self.location));rpc('mutate_family_trip_location_v1',[self.trip,new(),'trash',self.location,revision,{}],self.owner);page=self.page();self.assertEqual(len(page['items']),1);self.assertFalse(page['items'][0]['restore_available'])
 def native_40_original595_function_bodies_owners_and_ACLs_stay_exact(self):
  before=json.loads((S/'functions134-private.json').read_text());after={r['signature']:r for r in json.loads(sql("select json_agg(json_build_object('signature',p.oid::regprocedure::text,'schema',n.nspname,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'def',pg_get_functiondef(p.oid)))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','family_auth')and p.prokind='f'"))}
  self.assertEqual(len(before),595)
  for r in before:self.assertEqual(after[r['signature']],r)
 def native_41_noop_save_keeps_content_revision_and_returns_a_real_receipt(self):
  self.command('trash');p=self.native();self.execute(p);q=self.native(self.existing(p['stay_id']));v=self.visit(p);ack=self.execute(q);self.assertEqual(ack['trip_revision_after'],q['observation']['trip_revision']);self.assertEqual(v,self.visit(p));self.assertEqual(self.inspect(q)['acknowledgement'],ack)
 def blocked_read_native(self,name,args,change,user=None):
  st=g.validate();locker=subprocess.Popen(['docker','exec','-i',st['id'],'psql','-h','/socket','-X','-Atq','-v','ON_ERROR_STOP=1','-U',g.OP,'-d',g.DB],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  locker.stdin.write('begin;lock table public.trip_stays in access exclusive mode;\n\\echo HELD\n');locker.stdin.flush()
  for _ in range(8):
   if locker.stdout.readline().strip()=='HELD':break
  else:raise AssertionError('Read lock not acquired')
  with concurrent.futures.ThreadPoolExecutor(1)as pool:
   future=pool.submit(rpc,name,args,user or self.owner)
   try:
    waiting=False
    for _ in range(90):
     if sql("select exists(select 1 from pg_stat_activity where wait_event_type='Lock'and query like '%"+name+"%'and query like '%"+self.trip+"%')")=='t':waiting=True;break
     time.sleep(.025)
    self.assertTrue(waiting);locker.stdin.write(change+';commit;\n');locker.stdin.close();self.assertEqual(locker.wait(timeout=12),0,locker.stderr.read())
    with self.assertRaisesRegex(RuntimeError,'42501'):future.result(timeout=15)
   finally:
    if locker.poll()is None:locker.stdin.write('rollback;\n');locker.stdin.close();locker.wait(timeout=10)
 def native_42_snapshot_rechecks_session_after_real_read_wait(self):
  p=self.native();self.execute(p);sid=f.USERS[self.owner]
  try:self.blocked_read_native('get_family_native_stay_view_v1',[self.trip],"update auth.sessions set not_after=clock_timestamp()where id="+lit(sid))
  finally:sql("update auth.sessions set not_after=now()+interval '1 day'where id="+lit(sid))
 def native_43_trash_list_rechecks_domain_after_real_read_wait(self):
  self.command('trash');self.permit('trip.schedule.manage')
  self.blocked_read_native('list_family_trashed_stays_v1',[self.trip,None,25],"update public.family_permission_policies set direct_scope=null,propose_scope='trip_travelers'where family_id="+lit(self.family)+"and capability_key='trip.schedule.manage'",self.editor)
 def native_44_relative_or_unbounded_cursor_timestamp_is_not_accepted(self):
  for value in ['now','2026-11-14','x'*600]:
   with self.assertRaisesRegex(RuntimeError,'22023'):self.page({'id':new(),'deleted_at':value})
if __name__=='__main__':
 names=[n for n in dir(NativeStay)if n.startswith('native_')];result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(NativeStay(n)for n in names));(S/'native-tests.json').write_text(json.dumps({'tests':result.testsRun,'errors':len(result.errors),'failures':len(result.failures),'skipped':len(result.skipped),'methods':names},indent=2)+'\n');sys.exit(not result.wasSuccessful())
