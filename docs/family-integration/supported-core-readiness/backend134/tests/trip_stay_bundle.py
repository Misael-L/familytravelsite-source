"""Real guarded local stay/booking transactions; synthetic signed Auth metadata only."""
from pathlib import Path
import concurrent.futures,copy,json,subprocess,sys,time,unittest
sys.path.insert(0,str(Path(__file__).resolve().parent))
import trip_stay_bundle_guard as g
S=g.S
sys.modules['trip_stay_commands_guard']=g
from trip_stay_commands import StayCommands,f,sql,rpc,http,new,lit

class StayBundle(StayCommands):
 def packet(self,user=None,location=None,same_day=False):
  days=json.loads(sql('select json_agg(id order by civil_day)from public.trip_days where trip_id='+lit(self.trip)))
  sid,bid=new(),new();location=location or self.location
  c=rpc('get_family_stay_bundle_context_v1',[self.trip,location,days[0],days[0]if same_day else days[-1],sid,bid],user or self.owner)
  return {'format':'family.stay-bundle.v1','operation_id':new(),'scope':c['scope'],'stay_id':sid,'reservation_id':bid,'observation':c['observation'],
   'stay':{'location_id':location,'arrival_date':c['observation']['arrival_day']['civil_day'],'departure_date':c['observation']['departure_day']['civil_day']},
   'reservation':{'title':'Local lodging','status':'pending'}}
 def create(self,p,user=None):return rpc('create_family_stay_bundle_v1',[p],user or self.owner)
 def outcome(self,p,user=None,cancel=False):return rpc('cancel_family_stay_bundle_v1'if cancel else'get_family_stay_bundle_outcome_v1',[p],user or self.owner)
 def graph(self):
  tables=['public.trips','public.trip_stays','public.trip_stay_booking_links','public.trip_reservations','public.trip_reservation_calendar_dates',
   'family_auth.booking_calendar_context','family_auth.booking_calendar_history','family_auth.stay_command_receipts','family_auth.stay_command_cancellations','public.family_audit_events','public.trip_expenses']
  parts=[]
  for table in tables:
   where='id='+lit(self.trip)if table=='public.trips'else'xid=pg_current_xact_id()'if table.endswith('booking_calendar_context')else'trip_id='+lit(self.trip)
   parts.extend([lit(table),'(select coalesce(jsonb_agg(j order by j::text),\'[]\'::jsonb)from(select to_jsonb(z)j from '+table+' z where '+where+')q)'])
  return sql('select jsonb_build_object('+','.join(parts)+')')
 def refuse(self,p,code='22023',user=None,action='create'):
  before=self.graph()
  with self.assertRaisesRegex(RuntimeError,code):
   if action=='create':self.create(p,user)
   else:self.outcome(p,user,cancel=action=='cancel')
  self.assertEqual(self.graph(),before)
 def fresh(self):
  old=f.USERS[self.owner];sid=new();sql('insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after,factor_id)select '+lit(sid)+",user_id,now(),now(),aal,now()+interval '1 day',factor_id from auth.sessions where id="+lit(old));f.USERS[self.owner]=sid;self.addCleanup(lambda:f.USERS.__setitem__(self.owner,old));return sid
 def rows(self,p):
  return json.loads(sql('select jsonb_build_object(\'stay\',(select to_jsonb(s)from public.trip_stays s where id='+lit(p['stay_id'])+'),\'booking\',(select to_jsonb(b)from public.trip_reservations b where id='+lit(p['reservation_id'])+'),\'dates\',(select to_jsonb(d)from public.trip_reservation_calendar_dates d where reservation_id='+lit(p['reservation_id'])+'),\'link\',(select to_jsonb(l)from public.trip_stay_booking_links l where stay_id='+lit(p['stay_id'])+'))'))
 def bundle_01_context_exact_and_native_gated(self):
  p=self.packet();d=p['observation'];self.assertEqual(set(d),{'trip_revision','candidate_location','arrival_day','departure_day','stay_absent','reservation_absent'});self.assertTrue(d['stay_absent']);self.assertEqual(d['candidate_location']['source']['kind'],'manual');self.assertEqual(p['scope']['session_id'],f.USERS[self.owner])
  days=[d['arrival_day']['id'],d['departure_day']['id']];c=rpc('get_family_stay_bundle_context_v1',[self.trip,self.location,*days,p['stay_id'],p['reservation_id']],self.owner)
  self.assertEqual(set(c),{'format','scope','observation','admission','native_controls'});self.assertFalse(c['native_controls']);self.assertEqual(c['admission'],{'create':True})
 def bundle_02_atomic_create_retains_unknown_time_and_separate_notes(self):
  p=self.packet();p['stay']['notes']='Stay note';p['reservation']['notes']='Booking note';a=self.create(p);r=self.rows(p)
  self.assertEqual(r['stay']['notes'],'Stay note');self.assertEqual(r['booking']['notes'],'Booking note');self.assertEqual(r['booking']['type'],'hotel');self.assertEqual(r['booking']['timing_kind'],'untimed');self.assertIsNone(r['booking']['starts_at']);self.assertIsNone(r['booking']['ends_at']);self.assertIsNone(r['booking']['time_zone']);self.assertIsNone(r['stay']['check_in_time']);self.assertIsNone(r['booking']['hotel_id']);self.assertIsNone(r['booking']['place_id'])
  self.assertEqual(r['dates']['start_date'],p['stay']['arrival_date']);self.assertEqual(r['dates']['end_date'],p['stay']['departure_date']);self.assertEqual(r['link']['reservation_id'],p['reservation_id']);self.assertEqual(r['booking']['start_trip_day_id'],p['observation']['arrival_day']['id']);self.assertEqual(a['stay_revision_after'],r['stay']['revision']);self.assertEqual(a['trip_revision_after'],int(sql('select revision from public.trips where id='+lit(self.trip))))
  self.assertEqual(sql('select count(*)from family_auth.booking_calendar_history where reservation_id='+lit(p['reservation_id'])),'1');self.assertEqual(sql('select source from family_auth.booking_calendar_history where reservation_id='+lit(p['reservation_id'])),'explicit')
 def bundle_03_signed_http_retry_and_exact_new_ack_dialect(self):
  p=self.packet();code,a=http('/rpc/create_family_stay_bundle_v1',{'p_command':p},self.owner);self.assertEqual(code,200);before=self.graph();code,b=http('/rpc/create_family_stay_bundle_v1',{'p_command':p},self.owner);self.assertEqual((code,b),(200,a));self.assertEqual(self.graph(),before)
  self.assertEqual(set(a),{'format','state','acknowledgement','read_current_required','changed','trip_id','stay_id','reservation_id','operation_id','stay_revision_after','trip_revision_after','event_sequence','recorded_at'});self.assertEqual(a['format'],'family.stay-bundle-ack.v1');self.assertTrue(a['read_current_required']);self.assertEqual(self.outcome(p)['acknowledgement'],a)
 def bundle_04_deliberate_repeated_creates_distinct(self):
  a=self.packet();self.create(a);b=self.packet();self.create(b);self.assertNotEqual(a['stay_id'],b['stay_id']);self.assertNotEqual(a['reservation_id'],b['reservation_id']);self.assertEqual(sql('select count(*)from public.trip_stays where trip_id='+lit(self.trip)),'3')
 def bundle_05_true_midnight_seconds_named_zone_and_same_day(self):
  p=self.packet(same_day=True);p['stay'].update(check_in_time='00:00:01',check_out_time='00:00',time_zone='America/Mexico_City');p['reservation'].update(status='confirmed',confirmation_code='CONF-1',url='https://hotel.example/booking?id=1');self.create(p);r=self.rows(p);self.assertEqual(r['stay']['check_in_time'],'00:00:01');self.assertEqual(r['stay']['check_out_time'],'00:00:00');self.assertEqual(r['stay']['time_zone'],'America/Mexico_City');self.assertEqual(r['dates']['start_date'],r['dates']['end_date']);self.assertIsNone(r['booking']['starts_at']);self.assertEqual(r['booking']['status'],'confirmed')
 def bundle_06_overnight_window_preserved(self):
  p=self.packet();p['stay'].update(check_in_time='22:00',check_in_window_end='02:00',check_in_window_end_day_offset=1);self.create(p);r=self.rows(p)['stay'];self.assertEqual((r['check_in_time'],r['check_in_window_end'],r['check_in_window_end_day_offset']),('22:00:00','02:00:00',1))
 def bundle_07_unknown_extra_wrong_type_and_missing_fields(self):
  p=self.packet();bad=[]
  for key in ['format','operation_id','scope','stay_id','reservation_id','observation','stay','reservation']:
   x=copy.deepcopy(p);del x[key];bad.append(x)
  for group in [None,'scope','observation','stay','reservation']:
   x=copy.deepcopy(p);(x if group is None else x[group])['unexpected']=True;bad.append(x)
  for group,key,value in [('stay','notes',3),('reservation','title',None),('reservation','status',True),('scope','user_id',1),('observation','trip_revision',1.5),('observation','trip_revision',9007199254740992)]:
   x=copy.deepcopy(p);x[group][key]=value;bad.append(x)
  for x in bad:self.refuse(x)
 def bundle_08_invalid_clocks_windows_dates_zone_and_utf8_bounds(self):
  for patch in [{'arrival_date':'2027-02-30'},{'check_in_time':'24:00'},{'check_in_time':'10:00:00.1'},{'check_in_window_end':'02:00'},{'check_in_window_end_day_offset':1},{'check_in_time':'22:00','check_in_window_end':'02:00'},{'time_zone':'Bad/Zone'},{'notes':'é'*10001}]:
   p=self.packet();p['stay'].update(patch);self.refuse(p)
  for patch in [{'title':' '},{'title':'é'*501},{'notes':'é'*10001},{'confirmation_code':'x'*1025},{'confirmation_code':''},{'status':'cancelled'},{'url':'javascript:alert(1)'},{'url':'/relative'},{'url':'https://bad host.example'},{'type':'flight'},{'starts_at':'2027-04-01T00:00:00Z'}]:
   p=self.packet();p['reservation'].update(patch);self.refuse(p)
  p=self.packet();p['reservation']['notes']='x'*1048576;self.refuse(p)
 def bundle_09_explicit_nulls_do_not_copy_notes_or_guess_time(self):
  p=self.packet();p['stay'].update(notes=None,time_zone=None,check_in_time=None);p['reservation'].update(notes=None,url=None,confirmation_code=None);self.create(p);r=self.rows(p);self.assertIsNone(r['stay']['notes']);self.assertIsNone(r['booking']['notes']);self.assertIsNone(r['stay']['check_in_time'])
 def bundle_10_stale_trip_day_and_lodging_observations_refuse(self):
  for target in ['trip','day','location']:
   p=self.packet()
   if target=='trip':sql('update public.trips set name=\'Another name\'where id='+lit(self.trip),self.owner)
   elif target=='day':sql('update public.trip_days set title=\'Another day name\'where id='+lit(p['observation']['arrival_day']['id']));p['observation']['trip_revision']=int(sql('select revision from public.trips where id='+lit(self.trip)))
   else:sql('update public.trip_plan_locations set label=\'Another lodging label\'where id='+lit(self.location));p['observation']['trip_revision']=int(sql('select revision from public.trips where id='+lit(self.trip)))
   self.refuse(p,'PT409')
 def bundle_11_original_identity_or_body_cannot_reuse_receipt(self):
  p=self.packet();self.create(p)
  for key in ['stay_id','reservation_id']:
   q=copy.deepcopy(p);q[key]=new();self.refuse(q,'PT409')
  q=copy.deepcopy(p);q['reservation']['notes']='Different';self.refuse(q,'PT409');self.refuse(q,'PT409',action='inspect');self.refuse(q,'PT409',action='cancel')
 def bundle_12_cancel_unknown_terminal_and_committed_not_cancelled(self):
  p=self.packet();self.assertEqual(self.outcome(p)['status'],'unknown');a=self.outcome(p,cancel=True);self.assertEqual(a['status'],'cancelled');self.assertIsNone(a['acknowledgement']);self.assertIsNotNone(a['cancelled_at']);self.assertEqual(self.outcome(p,cancel=True),a);self.refuse(p,'PT409');self.assertIsNone(self.rows(p)['stay'])
  q=self.packet();ack=self.create(q);r=self.outcome(q,cancel=True);self.assertEqual(r['status'],'committed');self.assertEqual(r['acknowledgement'],ack);self.assertIsNone(r['cancelled_at'])
 def bundle_13_fresh_session_may_inspect_cancel_never_replay(self):
  p=self.packet();old=p['scope']['session_id'];fresh=self.fresh();r=self.outcome(p);self.assertEqual(r['original_session_id'],old);self.assertEqual(r['current_scope']['session_id'],fresh);self.refuse(p,'PT409');self.assertEqual(self.outcome(p,cancel=True)['status'],'cancelled')
 def bundle_14_aal1_expired_and_foreign_signed_sessions_refuse(self):
  p=self.packet();before=self.graph()
  for path in ['create_family_stay_bundle_v1','get_family_stay_bundle_outcome_v1','cancel_family_stay_bundle_v1']:
   for user,aal in [(self.owner,'aal1'),(self.stranger,'aal2')]:
    code,r=http('/rpc/'+path,{'p_command':p},user,aal=aal);self.assertEqual(code,403);self.assertEqual(r['code'],'42501')
  old=f.USERS[self.owner];sql('update auth.sessions set not_after=now()-interval \'1 minute\'where id='+lit(old))
  try:
   for action in ['create','inspect','cancel']:self.refuse(p,'42501',action=action)
  finally:sql('update auth.sessions set not_after=now()+interval \'1 day\'where id='+lit(old))
  self.assertEqual(self.graph(),before)
 def bundle_15_both_current_domains_required_direct_not_propose(self):
  p=self.packet(user=self.editor);self.refuse(p,'42501',user=self.editor)
  for key in ['trip.schedule.manage','trip.reservations.manage']:self.permit(key)
  p=self.packet(user=self.editor);self.create(p,user=self.editor)
  for mode in [('trip.schedule.manage',None,'trip_travelers'),('trip.reservations.manage',None,None)]:
   self.permit(*mode)
   for action in ['create','inspect','cancel']:self.refuse(p,'42501',user=self.editor,action=action)
   self.permit(mode[0])
 def bundle_16_parent_trip_trash_and_person_archive_refuse_receipt(self):
  p=self.packet();self.create(p);rpc('trash_family_trip',[self.trip,sql('select revision from public.trips where id='+lit(self.trip))],self.owner)
  for action in ['create','inspect','cancel']:self.refuse(p,'42501',action=action)
  rpc('restore_family_trip',[self.trip,sql('select revision from public.trips where id='+lit(self.trip))],self.owner)
  sql('update public.people set archived_at=now()where id='+lit(self.person))
  try:self.refuse(p,'42501',action='inspect')
  finally:sql('update public.people set archived_at=null where id='+lit(self.person))
 def bundle_17_parallel_original_retries_have_one_result(self):
  p=self.packet()
  with concurrent.futures.ThreadPoolExecutor(2)as pool:r=list(pool.map(lambda _:self.create(p),range(2)))
  self.assertEqual(r[0],r[1]);self.assertEqual(sql('select count(*)from family_auth.stay_command_receipts where stay_id='+lit(p['stay_id'])),'1')
 def bundle_18_parallel_distinct_intents_conflict_on_old_observation(self):
  a=self.packet();b=self.packet()
  def run(p):
   try:self.create(p);return 'ok'
   except RuntimeError as e:self.assertIn('PT409',str(e));return 'conflict'
  with concurrent.futures.ThreadPoolExecutor(2)as pool:r=list(pool.map(run,[a,b]))
  self.assertEqual(sorted(r),['conflict','ok'])
 def bundle_19_create_cancel_race_has_one_terminal_decision(self):
  p=self.packet()
  def create():
   try:self.create(p);return 'created'
   except RuntimeError as e:self.assertIn('PT409',str(e));return 'cancelled'
  with concurrent.futures.ThreadPoolExecutor(2)as pool:
   a=pool.submit(create);b=pool.submit(self.outcome,p,None,True);a.result();b.result()
  r=self.outcome(p);self.assertIn(r['status'],['committed','cancelled']);self.assertEqual(self.rows(p)['stay'] is not None,r['status']=='committed');self.assertEqual(sql('select count(*)from family_auth.stay_command_receipts where operation_id='+lit(p['operation_id'])),'1'if r['status']=='committed'else'0')
 def bundle_20_legacy_receipt_and_cancel_collisions_refuse_both_dialects(self):
  for cancelled in [False,True]:
   p=self.packet();c=self.context(stay=p['stay_id'],location=self.location);changes=p['stay']
   if cancelled:rpc('cancel_family_stay_command_v1',[self.trip,p['stay_id'],p['operation_id'],c['scope'],c['observation'],'save',changes,None],self.owner)
   else:self.command(stay=p['stay_id'],operation=p['operation_id'],context=c,changes=changes)
   for action in ['create','inspect','cancel']:self.refuse(p,'PT409',action=action)
  p=self.packet();c=self.context(stay=p['stay_id'],location=self.location);self.create(p)
  self.refused('PT409',lambda:self.command(stay=p['stay_id'],operation=p['operation_id'],context=c,changes=p['stay']))
  with self.assertRaisesRegex(RuntimeError,'PT409'):rpc('get_family_stay_command_outcome_v1',[self.trip,p['stay_id'],p['operation_id'],c['scope'],c['observation'],'save',p['stay'],None],self.owner)
 def bundle_21_injected_failures_rollback_every_owned_row_revision_and_audit(self):
  boundaries=[('public.trip_stays','before'),('public.trip_stays','after'),('public.trip_reservations','before'),('public.trip_reservations','after'),('public.trip_reservation_calendar_dates','before'),('public.trip_reservation_calendar_dates','after'),('public.trip_stay_booking_links','before'),('public.trip_stay_booking_links','after'),('public.family_audit_events','before'),('family_auth.booking_calendar_history','before'),('family_auth.stay_command_receipts','before'),('family_auth.stay_command_receipts','after')]
  sql("create function family_auth.test_bundle_failure()returns trigger language plpgsql as $$begin raise exception 'Injected bundle boundary';end;$$")
  try:
   for table,timing in boundaries:
    with self.subTest(table=table,timing=timing):
     p=self.packet();sql('create trigger zz_test_bundle_failure '+timing+' insert on '+table+' for each row execute function family_auth.test_bundle_failure()')
     try:self.refuse(p,'Injected bundle boundary')
     finally:sql('drop trigger zz_test_bundle_failure on '+table)
     self.assertEqual(self.outcome(p)['status'],'unknown');self.assertIsNone(self.rows(p)['stay'])
  finally:sql('drop function family_auth.test_bundle_failure()')
 def bundle_22_hotel_source_is_real_fk_and_stale_catalog_refuses(self):
  city,hotels,locations=self.hotel_locations();p=self.packet(location=locations[0]);sql('update public.hotels set name=\'Changed catalog hotel\'where id='+lit(hotels[0]));self.refuse(p,'PT409')
  p=self.packet(location=locations[0]);self.create(p);r=self.rows(p);self.assertEqual(r['booking']['hotel_id'],hotels[0]);self.assertEqual(r['stay']['location_id'],locations[0]);self.assertNotEqual(r['stay']['location_id'],city)
 def bundle_23_history_and_portable_export_keep_unchanged_shape(self):
  p=self.packet();a=self.create(p);h=rpc('get_family_stay_history_v1',[self.trip,p['stay_id'],None,50],self.owner);e=h['events'][0];self.assertIsNone(e['before']);self.assertEqual(e['action'],'create');self.assertEqual(e['after']['link']['reservation_id'],p['reservation_id']);self.assertEqual(e['sequence'],a['event_sequence']);self.assertNotIn('request_sha256',e)
  job=sql('insert into public.family_export_jobs(family_id,requested_by_person_id,requested_by_user_id,expires_at)values('+lit(self.family)+','+lit(self.person)+','+lit(self.owner)+",now()+interval '1 day')returning id");tables=json.loads(sql('select public.build_family_export_v1('+lit(job)+')'))['snapshot']['tables'];self.assertTrue(any(x['stay_id']==p['stay_id']for x in tables['trip_stay_history']));self.assertTrue(any(x['id']==p['reservation_id']for x in tables['trip_reservations']));self.assertTrue(all('session_id'not in x and 'request_sha256'not in x for x in tables['trip_stay_history']))
 def bundle_24_late_original_ack_does_not_replace_current_edit(self):
  p=self.packet();a=self.create(p);self.command(stay=p['stay_id'],changes={'notes':'Newer stay edit'});self.assertEqual(self.create(p),a);r=rpc('get_family_trip_booking_view_v2',[self.trip],self.owner);self.assertEqual(next(x for x in r['stays']if x['stay']['id']==p['stay_id'])['stay']['notes'],'Newer stay edit');self.assertFalse(r['capabilities']['native_write'])
 def bundle_25_existing_trash_restore_keeps_created_booking(self):
  p=self.packet();self.create(p);before=self.rows(p)['booking'];self.command('trash',stay=p['stay_id']);r=rpc('get_family_trip_booking_view_v2',[self.trip],self.owner);self.assertEqual(next(x for x in r['bookings']if x['record']['id']==p['reservation_id'])['stay_link']['state'],'retained');self.command('restore',stay=p['stay_id']);self.assertEqual(self.rows(p)['booking'],before)
 def bundle_26_privileges_and_owner_do_not_admit_direct_writes(self):
  for name,sig in [('get_family_stay_bundle_context_v1','uuid,uuid,uuid,uuid,uuid,uuid'),('create_family_stay_bundle_v1','jsonb'),('get_family_stay_bundle_outcome_v1','jsonb'),('cancel_family_stay_bundle_v1','jsonb')]:
   fn='public.'+name+'('+sig+')';self.assertEqual(sql('select pg_get_userbyid(proowner)from pg_proc where oid='+lit(fn)+'::regprocedure'),'postgres')
   for role in ['anon','service_role']:self.assertEqual(sql('select has_function_privilege('+lit(role)+','+lit(fn)+',\'execute\')'),'f')
   self.assertEqual(sql('select has_function_privilege(\'authenticated\','+lit(fn)+',\'execute\')'),'t')
  self.assertEqual(sql("select count(*)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='family_auth'and p.proname in('validate_stay_bundle_command','stay_bundle_observation','lock_stay_bundle','stay_bundle_outcome')and(has_function_privilege('authenticated',p.oid,'execute')or p.proconfig is distinct from array['search_path=\"\"'])"),'0')
  for table in ['public.trip_stays','public.trip_stay_booking_links','public.trip_reservation_calendar_dates','family_auth.stay_command_receipts','family_auth.stay_command_cancellations']:
   for role in ['anon','authenticated','service_role']:
    for permission in ['INSERT','UPDATE','DELETE']:self.assertEqual(sql('select has_table_privilege('+lit(role)+','+lit(table)+','+lit(permission)+')'),'f')
 def bundle_27_invalid_or_foreign_location_day_identity_and_private_layer(self):
  p=self.packet();p['scope']['layer']='draft';self.refuse(p,'0A000');p=self.packet();p['stay_id']=p['reservation_id'];self.refuse(p)
  for group,key in [('observation','arrival_day'),('observation','departure_day')]:
   p=self.packet();p[group][key]['id']=new();self.refuse(p,'PT409')
  p=self.packet();p['observation']['candidate_location']['id']=new();p['stay']['location_id']=p['observation']['candidate_location']['id'];self.refuse(p,'PT409')
 def bundle_28_booking_limit_rolls_back_before_creating_orphans(self):
  sql('insert into public.trip_reservations(trip_id,type,title)select '+lit(self.trip)+",'hotel','Admission fixture'from generate_series(1,1999)");p=self.packet();self.refuse(p,'54000');self.assertIsNone(self.rows(p)['booking'])
 def bundle_29_late_complete_view_admission_rolls_back_both_records(self):
  # Keep ordinary stay/booking counts admitted, but make the existing complete read refuse.
  sql("create function family_auth.test_bundle_view_failure()returns trigger language plpgsql as $$begin new.notes:=repeat('x',9000000);return new;end;$$;create trigger zz_test_bundle_view_failure before insert on public.trip_reservations for each row execute function family_auth.test_bundle_view_failure()")
  try:p=self.packet();self.refuse(p,'54000')
  finally:sql('drop trigger zz_test_bundle_view_failure on public.trip_reservations;drop function family_auth.test_bundle_view_failure()')
 def bundle_30_no_new_tables_old_functions_or_grants_changed(self):
  before=json.loads((S/'functions133-private.json').read_text());q="select json_agg(json_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'def',pg_get_functiondef(p.oid)))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','family_auth')and p.prokind='f'";after={r['signature']:r for r in json.loads(sql(q))}
  for r in before:self.assertEqual(after[r['signature']],r)
 def blocked(self,p,table,predicate,change,code,user=None,pause=0):
  before=self.graph();st=g.validate();locker=subprocess.Popen(['docker','exec','-i',st['id'],'psql','-h','/socket','-X','-Atq','-v','ON_ERROR_STOP=1','-U',g.OP,'-d',g.DB],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  locker.stdin.write('begin;select 1 from '+table+' where '+predicate+' for update;\n\\echo HELD\n');locker.stdin.flush()
  for _ in range(8):
   if locker.stdout.readline().strip()=='HELD':break
  else:raise AssertionError('Expected owned row lock')
  with concurrent.futures.ThreadPoolExecutor(1)as pool:
   future=pool.submit(self.create,p,user)
   try:
    waiting=False
    for _ in range(70):
     if sql("select exists(select 1 from pg_stat_activity where wait_event_type='Lock'and query like '%create_family_stay_bundle_v1%'and query like '%"+p['stay_id']+"%')")=='t':waiting=True;break
     time.sleep(.025)
    self.assertTrue(waiting,'Actual command must wait on a real row lock')
    if pause:time.sleep(pause)
    locker.stdin.write(change+';commit;\n');locker.stdin.close();self.assertEqual(locker.wait(timeout=12),0,locker.stderr.read())
    with self.assertRaisesRegex(RuntimeError,code):future.result(timeout=15)
   finally:
    if locker.poll()is None:
     locker.stdin.write('rollback;\n');locker.stdin.close();locker.wait(timeout=12)
  self.assertEqual(self.graph(),before);self.assertIsNone(self.rows(p)['stay'])
 def bundle_31_lock_wait_rechecks_changed_domain_policy(self):
  for key in ['trip.schedule.manage','trip.reservations.manage']:self.permit(key)
  p=self.packet(user=self.editor)
  self.blocked(p,'public.trip_plan_locations','id='+lit(self.location),'update public.family_permission_policies set direct_scope=null,propose_scope=\'trip_travelers\'where family_id='+lit(self.family)+"and capability_key='trip.schedule.manage'",'42501',user=self.editor)
 def bundle_32_lock_wait_rechecks_expired_session_row(self):
  p=self.packet();sid=f.USERS[self.owner]
  try:self.blocked(p,'auth.sessions','id='+lit(sid),'update auth.sessions set not_after=now()-interval \'1 minute\'where id='+lit(sid),'42501')
  finally:sql('update auth.sessions set not_after=now()+interval \'1 day\'where id='+lit(sid))
 def bundle_33_lock_wait_rechecks_membership(self):
  p=self.packet();predicate='family_id='+lit(self.family)+'and user_id='+lit(self.owner)
  try:self.blocked(p,'public.family_members',predicate,'update public.family_members set status=\'suspended\'where '+predicate,'42501')
  finally:sql('update public.family_members set status=\'active\'where '+predicate)
 def bundle_34_lock_wait_rechecks_person_archive(self):
  p=self.packet()
  try:self.blocked(p,'public.people','id='+lit(self.person),'update public.people set archived_at=now()where id='+lit(self.person),'42501')
  finally:sql('update public.people set archived_at=null where id='+lit(self.person))
 def bundle_35_lock_wait_compares_latest_shared_hotel_facts(self):
  city,hotels,locations=self.hotel_locations();p=self.packet(location=locations[0]);self.blocked(p,'public.hotels','id='+lit(hotels[0]),'update public.hotels set name=\'Changed while blocked\'where id='+lit(hotels[0]),'PT409')
 def bundle_36_lease_expiry_during_wait_is_checked_against_wall_clock(self):
  city,hotels,locations=self.hotel_locations();p=self.packet(location=locations[0]);sid=f.USERS[self.owner];sql('update auth.sessions set not_after=clock_timestamp()+interval \'2 seconds\'where id='+lit(sid))
  try:self.blocked(p,'public.hotels','id='+lit(hotels[0]),'select 1','42501',pause=2.2)
  finally:sql('update auth.sessions set not_after=now()+interval \'1 day\'where id='+lit(sid))
 def bundle_37_ack_sequence_bound_rolls_back_complete_creation(self):
  sequence='family_auth.stay_command_receipts_sequence_seq';old=json.loads(sql('select json_build_object(\'value\',last_value,\'called\',is_called)from '+sequence));p=self.packet()
  sql('select setval('+lit(sequence)+',9007199254740991,true)')
  try:self.refuse(p,'54000')
  finally:sql('select setval('+lit(sequence)+','+str(old['value'])+','+('true'if old['called']else'false')+')')
 def bundle_38_context_refuses_unbounded_selected_catalog(self):
  city,hotels,locations=self.hotel_locations();sql('update public.hotels set notes=repeat(\'x\',600000)where id='+lit(hotels[0]))
  with self.assertRaisesRegex(RuntimeError,'54000'):self.packet(location=locations[0])

if __name__=='__main__':
 names=[n for n in dir(StayBundle)if n.startswith('bundle_')];result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(StayBundle(n)for n in names));(S/'bundle-tests.json').write_text(json.dumps({'tests':result.testsRun,'errors':len(result.errors),'failures':len(result.failures),'skipped':len(result.skipped),'methods':names,'SQL_calls':f.COUNTERS['sql'],'signed_HTTP_calls':f.COUNTERS['http']},indent=2)+'\n');sys.exit(not result.wasSuccessful())
