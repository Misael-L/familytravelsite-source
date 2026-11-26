"""Observed stay writers: real isolated SQL/signed HTTP, synthetic Auth metadata only."""
from pathlib import Path
import sys,json,unittest,concurrent.futures,copy,subprocess,time
sys.path.insert(0,str(Path(__file__).resolve().parent))
import trip_stay_commands_guard as g
S=g.S
sys.modules['trip_stay_foundation_guard']=g
import trip_stay_foundation as f
lit=f.lit;new=f.new;sql=f.sql;rpc=f.rpc;http=f.http
class StayCommands(f.StayFoundation):
 @classmethod
 def setUpClass(cls):
  f.USERS.clear()
  super().setUpClass()

 def setUp(self):
  super().setUp()
  sql('delete from public.family_permission_policies where family_id='+lit(self.family))
 def context(self,stay=None,location=None,booking=None,user=None):return rpc('get_family_stay_command_context_v1',[self.trip,stay or self.stay,location,booking],user or self.owner)
 def command(self,action='save',changes=None,context=None,operation=None,stay=None,booking=None,user=None):
  c=context or self.context(stay=stay,location=(changes or {}).get('location_id'),booking=booking,user=user)
  args=[self.trip,stay or self.stay,operation or new(),c['scope'],c['observation']]
  name={'save':'save_family_stay_v1','link':'set_family_stay_booking_link_v1','trash':'trash_family_stay_v1','restore':'restore_family_stay_v1'}[action]
  if action=='save':args.append(changes or {})
  if action=='link':args.append(booking)
  return rpc(name,args,user or self.owner)
 def history(self,**kw):return rpc('get_family_stay_history_v1',[self.trip,self.stay,kw.get('before'),kw.get('limit',50)],kw.get('user',self.owner))
 def graph(self):return sql('select jsonb_build_object(\'trip\',(select to_jsonb(t)from public.trips t where id='+lit(self.trip)+'),\'stays\',(select jsonb_agg(to_jsonb(s)order by s.id)from public.trip_stays s where trip_id='+lit(self.trip)+'),\'links\',(select jsonb_agg(to_jsonb(l)order by l.stay_id)from public.trip_stay_booking_links l where trip_id='+lit(self.trip)+'),\'bookings\',(select jsonb_agg(to_jsonb(r)order by r.id)from public.trip_reservations r where trip_id='+lit(self.trip)+'),\'receipts\',(select jsonb_agg(to_jsonb(r)order by r.sequence)from family_auth.stay_command_receipts r where trip_id='+lit(self.trip)+'))')
 def refused(self,code,call):
  before=self.graph()
  with self.assertRaisesRegex(RuntimeError,code):call()
  self.assertEqual(self.graph(),before)
 def permit(self,key,direct='trip_travelers',propose=None):
  sql('insert into public.trip_travelers(trip_id,person_id)select '+lit(self.trip)+',id from public.people where user_id='+lit(self.editor)+'on conflict do nothing')
  sql('insert into public.family_permission_policies(family_id,capability_key,direct_scope,propose_scope)values('+lit(self.family)+','+lit(key)+','+('null'if direct is None else lit(direct))+','+('null'if propose is None else lit(propose))+')on conflict(family_id,capability_key)do update set direct_scope=excluded.direct_scope,propose_scope=excluded.propose_scope')
 def command_01_context_binds_original_session_and_leaves_native_gated(self):
  c=self.context();self.assertEqual(set(c['scope']),{'version','layer','trip_id','family_id','user_id','person_id','session_id'});self.assertEqual(c['scope']['session_id'],f.USERS[self.owner]);self.assertEqual(c['state'],'active');self.assertTrue(c['admission']['save']);self.assertFalse(c['native_controls']);self.assertFalse(self.view()['capabilities']['commands'])
 def command_02_create_date_only_without_partner_booking_or_midnight(self):
  target=new();c=self.context(stay=target,location=self.location);r=self.command(changes={'location_id':self.location,'arrival_date':'2027-04-02','departure_date':'2027-04-03'},stay=target,context=c)
  row=json.loads(sql('select to_jsonb(s)from public.trip_stays s where id='+lit(target)));self.assertEqual(row['created_by_person_id'],self.person);self.assertEqual(row['revision'],1);self.assertIsNone(row['check_in_time']);self.assertEqual(r['action'],'create');self.assertEqual(sql('select count(*)from public.trip_reservations where trip_id='+lit(self.trip)),'1');self.assertEqual(sql('select count(*)from public.trip_stay_booking_links where stay_id='+lit(target)),'0')
 def command_03_repeat_intentional_creates_have_distinct_identities(self):
  ids=[new(),new()]
  for target in ids:self.command(stay=target,changes={'location_id':self.location,'arrival_date':'2027-05-01','departure_date':'2027-05-02'})
  self.assertEqual(len(self.view()['stays']),3);self.assertEqual(sql('select count(*)from public.trip_stays where id in('+','.join(map(lit,ids))+')'),'2')
 def command_04_real_http_create_retry_returns_same_ack_once(self):
  target=new();c=self.context(stay=target,location=self.location);payload={'p_trip_id':self.trip,'p_stay_id':target,'p_operation_id':new(),'p_scope':c['scope'],'p_observation':c['observation'],'p_changes':{'location_id':self.location,'arrival_date':'2027-04-01','departure_date':'2027-04-02'}}
  code,a=http('/rpc/save_family_stay_v1',payload,self.owner);self.assertEqual(code,200);before=self.graph();code,b=http('/rpc/save_family_stay_v1',payload,self.owner);self.assertEqual((code,a),(200,b));self.assertEqual(self.graph(),before);self.assertTrue(a['acknowledgement']);self.assertTrue(a['read_current_required']);self.assertNotIn('after',a);self.assertEqual(sql('select count(*)from family_auth.stay_command_receipts where stay_id='+lit(target)),'1')
 def command_05_operation_uuid_reuse_for_another_body_or_action_refuses(self):
  c=self.context();op=new();self.command(changes={'notes':'First'},context=c,operation=op)
  self.refused('PT409',lambda:self.command(changes={'notes':'Other'},context=c,operation=op));self.refused('PT409',lambda:self.command('trash',context=c,operation=op))
 def command_06_same_entity_create_under_another_operation_is_not_deduplicated(self):
  target=new();c=self.context(stay=target,location=self.location);changes={'location_id':self.location,'arrival_date':'2027-04-01','departure_date':'2027-04-02'};self.command(stay=target,context=c,changes=changes);self.refused('PT409',lambda:self.command(stay=target,context=c,changes=changes))
 def command_07_notes_save_preserves_booking_instants_and_microseconds(self):
  timed=self.add_booking(extra="starts_at,ends_at,timing_kind,time_zone='2027-04-01T00:00:00.123456Z','2027-04-02T01:00:00.654321Z','timed','America/Mexico_City'");sql('delete from public.trip_stay_booking_links where stay_id='+lit(self.stay));sql('insert into public.trip_stay_booking_links values('+lit(timed)+','+lit(self.stay)+','+lit(self.trip)+')');before=sql('select to_jsonb(r)from public.trip_reservations r where id='+lit(timed));self.command(changes={'notes':'Private stay note'});self.assertEqual(sql('select to_jsonb(r)from public.trip_reservations r where id='+lit(timed)),before)
 def command_08_omission_clear_and_real_midnight_are_distinct(self):
  self.command(changes={'notes':'Keep','check_in_time':'00:00','check_out_time':'00:00','time_zone':'America/Mexico_City'});self.command(changes={'arrival_date':'2027-04-02'});r=self.row();self.assertEqual(r['notes'],'Keep');self.assertEqual(r['check_in_time'],'00:00:00');self.command(changes={'notes':None,'time_zone':None});r=self.row();self.assertIsNone(r['notes']);self.assertIsNone(r['time_zone']);self.assertEqual(r['check_out_time'],'00:00:00')
 def command_09_strict_whitelist_types_and_clock_precision(self):
  c=self.context()
  for patch in [{'id':new()},{'metadata':{}},{'starts_at':None},{'notes':4},{'arrival_date':None},{'location_id':'invalid'},{'arrival_date':'2027-02-30'},{'check_in_time':'24:00'},{'check_in_time':'00:00:00.5'},{'check_in_time':'09:00Z'},{'check_in_window_end_day_offset':1.0},{'time_zone':'Bad/Zone'},{'notes':'é'*10001}]:
   with self.subTest(fields=list(patch)):self.refused('22023',lambda:self.command(changes=patch,context=c))
 def command_10_failed_composite_patch_rolls_back_all_fields(self):
  for patch in [{'notes':'No partial','departure_date':'2027-03-31'},{'notes':'No partial','check_in_window_end':'02:00'},{'check_in_time':'22:00','check_in_window_end':'02:00'}]:self.refused('23514',lambda:self.command(changes=patch))
 def command_11_noop_save_and_same_link_keep_stay_and_trip_revisions(self):
  before=self.row();trip=sql('select revision from public.trips where id='+lit(self.trip));r=self.command();self.assertFalse(r['changed']);self.assertEqual(self.row(),before);self.assertEqual(sql('select revision from public.trips where id='+lit(self.trip)),trip);r=self.command('link',booking=self.booking);self.assertFalse(r['changed']);self.assertEqual(self.row(),before)
 def command_12_parallel_same_operation_has_one_receipt(self):
  c=self.context();op=new()
  with concurrent.futures.ThreadPoolExecutor(2)as pool:out=list(pool.map(lambda _:self.command(context=c,operation=op,changes={'notes':'Parallel'}),range(2)))
  self.assertEqual(out[0],out[1]);self.assertEqual(sql('select count(*)from family_auth.stay_command_receipts where stay_id='+lit(self.stay)),'1')
 def command_13_parallel_distinct_operations_on_one_observation_have_one_winner(self):
  c=self.context()
  def attempt(text):
   try:self.command(context=c,changes={'notes':text});return 'ok'
   except RuntimeError as e:self.assertIn('PT409',str(e));return 'conflict'
  with concurrent.futures.ThreadPoolExecutor(2)as pool:out=list(pool.map(attempt,['One','Two']))
  self.assertEqual(sorted(out),['conflict','ok'])
 def command_14_stale_trip_revision_refuses(self):
  c=self.context();sql('update public.trips set name=\'Changed\'where id='+lit(self.trip),self.owner);self.refused('PT409',lambda:self.command(context=c,changes={'notes':'Old'}))
 def command_15_stale_stay_detected_even_when_trip_revision_is_refreshed(self):
  c=self.context();sql('update public.trip_stays set notes=\'Other editor\'where id='+lit(self.stay));c['observation']['trip_revision']=int(sql('select revision from public.trips where id='+lit(self.trip)));self.refused('PT409',lambda:self.command(context=c,changes={'notes':'Old'}))
 def command_16_stale_selected_location_detected_independently(self):
  target=rpc('mutate_family_trip_location_v1',[self.trip,new(),'create',None,None,{'source':{'kind':'manual'},'label':'Selected lodging'}],self.owner)['id'];c=self.context(location=target);sql('update public.trip_plan_locations set label=\'Changed lodging\'where id='+lit(target));c['observation']['trip_revision']=int(sql('select revision from public.trips where id='+lit(self.trip)));self.refused('PT409',lambda:self.command(context=c,changes={'location_id':target}))
 def command_17_stale_selected_booking_detected_independently(self):
  b=self.add_booking();c=self.context(booking=b);sql('update public.trip_reservations set notes=\'Changed booking\'where id='+lit(b));c['observation']['trip_revision']=int(sql('select revision from public.trips where id='+lit(self.trip)));self.refused('PT409',lambda:self.command('link',context=c,booking=b))
 def command_18_schedule_and_booking_authority_are_independent(self):
  self.permit('trip.schedule.manage');c=self.context(user=self.editor);self.assertTrue(c['admission']['save']);self.assertFalse(c['admission']['link']);self.command(changes={'notes':'Schedule editor'},user=self.editor);self.refused('42501',lambda:self.command('link',booking=self.booking,user=self.editor))
 def command_19_booking_authority_alone_cannot_edit_a_stay(self):
  self.permit('trip.reservations.manage');self.refused('42501',lambda:self.command(changes={'notes':'No schedule right'},user=self.editor))
 def command_20_propose_and_deny_do_not_publish(self):
  self.permit('trip.schedule.manage',None,'trip_travelers');self.assertEqual(sql('select public.can_trip_action_direct('+lit(self.trip)+",'trip.schedule.manage')",self.editor),'f');self.refused('42501',lambda:self.command(changes={'notes':'No fallback'},user=self.editor));self.refused('42501',lambda:self.command(changes={'notes':'No fallback'},user=self.viewer))
 def command_21_foreign_family_cannot_read_context_history_or_write(self):
  for call in [lambda:self.context(user=self.stranger),lambda:self.history(user=self.stranger),lambda:self.command(changes={'notes':'Foreign'},context=self.context(),user=self.stranger)]:self.refused('42501',call)
 def command_22_replay_rechecks_suspended_membership(self):
  c=self.context();op=new();self.command(context=c,operation=op,changes={'notes':'Accepted'});sql('update public.family_members set status=\'suspended\'where family_id='+lit(self.family)+'and user_id='+lit(self.owner))
  try:self.refused('42501',lambda:self.command(context=c,operation=op,changes={'notes':'Accepted'}))
  finally:sql('update public.family_members set status=\'active\'where family_id='+lit(self.family)+'and user_id='+lit(self.owner))
 def command_23_actual_http_aal1_and_revoked_session_refuse(self):
  c=self.context();payload={'p_trip_id':self.trip,'p_stay_id':self.stay,'p_operation_id':new(),'p_scope':c['scope'],'p_observation':c['observation'],'p_changes':{'notes':'Not saved'}};before=self.graph();self.assertEqual(http('/rpc/save_family_stay_v1',payload,self.owner,aal='aal1')[0],403);sql("update auth.sessions set not_after=now()-interval '1 minute'where id="+lit(f.USERS[self.owner]))
  try:self.assertEqual(http('/rpc/save_family_stay_v1',payload,self.owner)[0],403);self.assertEqual(self.graph(),before)
  finally:sql("update auth.sessions set not_after=now()+interval '1 day'where id="+lit(f.USERS[self.owner]))
 def command_24_other_valid_session_cannot_replay_original_scope(self):
  c=self.context();op=new();self.command(context=c,operation=op,changes={'notes':'Original session'});old=f.USERS[self.owner];sid=new();sql('insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after,factor_id)select '+lit(sid)+",user_id,now(),now(),aal,now()+interval '1 day',factor_id from auth.sessions where id="+lit(old));f.USERS[self.owner]=sid
  try:self.refused('PT409',lambda:self.command(context=c,operation=op,changes={'notes':'Original session'}))
  finally:f.USERS[self.owner]=old;sql('delete from auth.sessions where id='+lit(sid))
 def command_25_original_scope_identity_and_exact_keys_are_enforced(self):
  c=self.context()
  for key in ['trip_id','family_id','user_id','person_id','session_id']:
   bad=copy.deepcopy(c);bad['scope'][key]=new();self.refused('PT409',lambda:self.command(context=bad,changes={'notes':'Bad scope'}))
  bad=copy.deepcopy(c);bad['scope']['extra']=True;self.refused('22023',lambda:self.command(context=bad))
 def command_26_private_layer_has_no_published_fallback(self):
  c=self.context();c['scope']['layer']='draft';self.refused('0A000',lambda:self.command(context=c,changes={'notes':'Private'}))
 def command_27_trash_restore_retains_original_booking_link_and_notes(self):
  self.command(changes={'notes':'Retain me'});booking=sql('select to_jsonb(r)from public.trip_reservations r where id='+lit(self.booking));self.command('trash');self.assertEqual(self.view()['stays'],[]);self.assertEqual(self.context()['state'],'trash');self.command('restore');self.assertEqual(self.row()['notes'],'Retain me');self.assertEqual(sql('select to_jsonb(r)from public.trip_reservations r where id='+lit(self.booking)),booking);self.assertEqual(self.view()['stays'][0]['link']['reservation_id'],self.booking)
 def command_28_parent_trip_trash_freezes_command_and_receipt_replay(self):
  c=self.context();op=new();ack=self.command(context=c,operation=op,changes={'notes':'Keep'});rpc('trash_family_trip',[self.trip,sql('select revision from public.trips where id='+lit(self.trip))],self.owner);self.refused('42501',lambda:self.command(context=c,operation=op,changes={'notes':'Keep'}));rpc('restore_family_trip',[self.trip,sql('select revision from public.trips where id='+lit(self.trip))],self.owner);self.assertEqual(self.command(context=c,operation=op,changes={'notes':'Keep'}),ack);self.assertEqual(self.row()['notes'],'Keep')
 def command_29_trashed_stay_cannot_be_edited_and_repeated_trash_is_noop(self):
  self.command('trash');self.refused('0A000',lambda:self.command(changes={'notes':'No edit'}));before=self.row();r=self.command('trash');self.assertFalse(r['changed']);self.assertEqual(self.row(),before);self.command('restore');before=self.row();r=self.command('restore');self.assertFalse(r['changed']);self.assertEqual(self.row(),before)
 def command_30_restore_refuses_deleted_location_without_recreating_it(self):
  self.command('trash');c=self.context();sql('update public.trip_plan_locations set deleted_at=now(),deleted_by_person_id='+lit(self.person)+'where id='+lit(self.location));self.refused('23514',lambda:self.command('restore',context=c))
 def command_31_linked_booking_physical_deletion_and_type_replacement_refuse(self):
  self.command('trash');self.rejected('delete from public.trip_reservations where id='+lit(self.booking),'23503');self.rejected('update public.trip_reservations set type=\'restaurant\'where id='+lit(self.booking));self.command('restore');self.assertEqual(self.view()['stays'][0]['link']['reservation_id'],self.booking)
 def command_32_nonhotel_candidate_cannot_link(self):
  bad=self.add_booking('restaurant');self.refused('23514',lambda:self.command('link',booking=bad))
 def command_33_mismatched_hotel_relink_rolls_back_original_association(self):
  city,hotels,locations=self.hotel_locations();sql('update public.trip_stays set location_id='+lit(locations[0])+'where id='+lit(self.stay));bad=self.add_booking(extra='hotel_id,place_id='+lit(hotels[1])+','+lit(city));self.refused('23514',lambda:self.command('link',booking=bad));self.assertEqual(self.view()['stays'][0]['link']['reservation_id'],self.booking)
 def command_34_booking_claimed_by_another_stay_does_not_erase_original_link(self):
  other=self.add_stay();self.command('link',stay=other,booking=None);self.refused('PT409',lambda:self.command('link',stay=other,booking=self.booking));self.assertEqual(self.view()['stays'][0]['stay']['trip_id'],self.trip)
 def command_35_unlink_and_relink_never_delete_content(self):
  count=sql('select count(*)from public.trip_reservations where trip_id='+lit(self.trip));self.command('link');self.assertIsNone(self.view()['stays'][0]['link']);self.command('link',booking=self.booking);self.assertEqual(sql('select count(*)from public.trip_reservations where trip_id='+lit(self.trip)),count);self.assertEqual(self.view()['stays'][0]['link']['reservation_id'],self.booking)
 def command_36_retained_booking_proposal_refuses_association_change(self):
  draft=sql('insert into public.trip_change_drafts(trip_id,owner_person_id)values('+lit(self.trip)+','+lit(self.person)+')returning id');sql('insert into public.trip_change_draft_ops(draft_id,module,op,target_table,target_id,payload)values('+lit(draft)+",'reservation','update','trip_reservations',"+lit(self.booking)+",'{\"schema_version\":1}')");self.refused('0A000',lambda:self.command('link'))
 def command_37_ledger_is_append_only_and_not_client_accessible(self):
  self.command(changes={'notes':'History'});self.rejected('update family_auth.stay_command_receipts set changed=false where stay_id='+lit(self.stay),'0A000');self.rejected('delete from family_auth.stay_command_receipts where stay_id='+lit(self.stay),'0A000')
  for role in ['anon','authenticated','service_role']:self.rejected('select *from family_auth.stay_command_receipts',role=role,user=self.owner if role=='authenticated'else None,code='42501')
 def command_38_history_paginates_without_session_or_digest_leakage(self):
  for text in ['One','Two','Three']:self.command(changes={'notes':text})
  a=self.history(limit=2);self.assertEqual(len(a['events']),2);self.assertTrue(a['has_more']);b=self.history(limit=2,before=a['next_before_sequence']);self.assertEqual(len(b['events']),1);self.assertFalse(b['has_more']);self.assertGreater(a['events'][-1]['sequence'],b['events'][0]['sequence']);self.assertFalse({'session_id','request_sha256','result'}&set(a['events'][0]))
 def command_39_portable_family_export_retains_history_without_operational_credentials(self):
  self.command(changes={'notes':'Exported personal note'});job=sql('insert into public.family_export_jobs(family_id,requested_by_person_id,requested_by_user_id,expires_at)values('+lit(self.family)+','+lit(self.person)+','+lit(self.owner)+",now()+interval '1 day')returning id");rows=json.loads(sql('select public.build_family_export_v1('+lit(job)+')'))['snapshot']['tables']['trip_stay_history'];self.assertTrue(any(r['stay_id']==self.stay for r in rows));self.assertTrue(all('session_id'not in r and 'request_sha256'not in r for r in rows))
 def command_40_late_receipt_failure_rolls_back_stay_link_and_trip(self):
  sql("create function family_auth.test_fail_stay_receipt()returns trigger language plpgsql as $$begin raise exception 'Injected stay receipt failure';end;$$;create trigger zz_test_fail before insert on family_auth.stay_command_receipts for each row execute function family_auth.test_fail_stay_receipt()")
  try:
   self.refused('Injected stay receipt failure',lambda:self.command(changes={'notes':'Must roll back'}))
   b=self.add_booking();self.refused('Injected stay receipt failure',lambda:self.command('link',booking=b))
  finally:sql('drop trigger zz_test_fail on family_auth.stay_command_receipts;drop function family_auth.test_fail_stay_receipt()')
 def command_41_historical_ack_never_overwrites_a_newer_edit(self):
  c=self.context();op=new();ack=self.command(context=c,operation=op,changes={'notes':'First'});self.command(changes={'notes':'Newer'});before=self.graph();self.assertEqual(self.command(context=c,operation=op,changes={'notes':'First'}),ack);self.assertEqual(self.graph(),before);self.assertEqual(self.row()['notes'],'Newer')
 def command_42_missing_person_and_lost_direct_policy_refuse_writing(self):
  self.permit('trip.schedule.manage');c=self.context(user=self.editor);op=new();self.command(context=c,operation=op,changes={'notes':'Editor'},user=self.editor);sql('delete from public.family_permission_policies where family_id='+lit(self.family)+"and capability_key='trip.schedule.manage'");self.refused('42501',lambda:self.command(context=c,operation=op,changes={'notes':'Editor'},user=self.editor));c=self.context();sql('update public.people set archived_at=now()where id='+lit(self.person))
  try:self.refused('42501',lambda:self.command(context=c,changes={'notes':'No person'}))
  finally:sql('update public.people set archived_at=null where id='+lit(self.person))
 def command_43_history_limits_and_unknown_observation_keys_refuse(self):
  for limit in [0,101]:self.refused('22023',lambda:self.history(limit=limit))
  c=self.context();c['observation']['ignored']='no';self.refused('22023',lambda:self.command(context=c))
 def command_44_deleted_Auth_session_refuses_replay_but_retains_history(self):
  c=self.context();op=new();self.command(context=c,operation=op,changes={'notes':'Retained after logout'});sid=f.USERS[self.owner];record=json.loads(sql('select to_jsonb(s)from auth.sessions s where id='+lit(sid)));payload={'p_trip_id':self.trip,'p_stay_id':self.stay,'p_operation_id':op,'p_scope':c['scope'],'p_observation':c['observation'],'p_changes':{'notes':'Retained after logout'}};sql('delete from auth.sessions where id='+lit(sid))
  try:
   self.assertEqual(http('/rpc/save_family_stay_v1',payload,self.owner)[0],403);self.assertEqual(sql('select count(*)from family_auth.stay_command_receipts where stay_id='+lit(self.stay)),'1')
  finally:sql('insert into auth.sessions select *from jsonb_populate_record(null::auth.sessions,'+lit(json.dumps(record))+'::jsonb)')
 def command_45_count_admission_refuses_before_creating_an_unreadable_stay(self):
  sql('insert into public.trip_stays(trip_id,family_id,location_id,arrival_date,departure_date,created_by_person_id)select '+','.join(map(lit,[self.trip,self.family,self.location,'2027-04-01','2027-04-03',self.person]))+'from generate_series(1,1999)');target=new();self.refused('54000',lambda:self.command(stay=target,changes={'location_id':self.location,'arrival_date':'2027-04-01','departure_date':'2027-04-02'}));self.assertEqual(sql('select count(*)from public.trip_stays where id='+lit(target)),'0')
 def command_46_other_trip_booking_and_other_trip_stay_are_never_aliases(self):
  other=sql('insert into public.trips(family_id,name,start_at,end_at,created_by_person_id)values('+lit(self.family)+",'Other same Family trip','2027-04-01T00:00Z','2027-04-03T00:00Z',"+lit(self.person)+')returning id');booking=sql('insert into public.trip_reservations(trip_id,type,title)values('+lit(other)+",'hotel','Other trip hotel')returning id");self.refused('23514',lambda:self.command('link',booking=booking))
 def command_47_trash_history_requires_recovery_authority(self):
  self.command(changes={'notes':'Family-visible history'});self.assertEqual(len(self.history(user=self.viewer)['events']),1);self.command('trash');self.refused('42501',lambda:self.history(user=self.viewer));self.assertGreater(len(self.history()['events']),0)
 def command_48_role_demotion_prevents_historical_receipt_replay(self):
  c=self.context();op=new();self.command(context=c,operation=op,changes={'notes':'Owner accepted'});sql('update public.family_members set role=\'child\'where family_id='+lit(self.family)+'and user_id='+lit(self.owner))
  try:self.refused('42501',lambda:self.command(context=c,operation=op,changes={'notes':'Owner accepted'}))
  finally:sql('update public.family_members set role=\'patriarch\'where family_id='+lit(self.family)+'and user_id='+lit(self.owner))
 def command_49_policy_revoked_while_waiting_on_child_lock_refuses(self):
  self.permit('trip.schedule.manage');c=self.context(user=self.editor)
  locker=subprocess.Popen(['docker','exec','-i',f._pinned['id'],'psql','-h','/socket','-X','-Atq','-v','ON_ERROR_STOP=1','-U',g.OP,'-d',g.DB],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  locker.stdin.write('begin;select id from public.trip_plan_locations where id='+lit(self.location)+'for update;\n\\echo LOCKED\n');locker.stdin.flush()
  for _ in range(3):
   if locker.stdout.readline().strip()=='LOCKED':break
  else:raise AssertionError('Fixture lock not acquired')
  with concurrent.futures.ThreadPoolExecutor(1)as pool:
   future=pool.submit(lambda:self.command(context=c,changes={'notes':'Must refuse after revocation'},user=self.editor))
   try:
    waiting=False
    for _ in range(80):
     if sql("select exists(select 1 from pg_stat_activity where wait_event_type='Lock'and query like '%save_family_stay_v1%'and query like '%"+self.stay+"%')")=='t':waiting=True;break
     time.sleep(.05)
    self.assertTrue(waiting,'Command must reach the actual child-lock wait');sql('delete from public.family_permission_policies where family_id='+lit(self.family)+"and capability_key='trip.schedule.manage'");before=self.graph()
   finally:locker.stdin.write('commit;\n');locker.stdin.close();self.assertEqual(locker.wait(timeout=10),0)
   with self.assertRaisesRegex(RuntimeError,'42501'):future.result(timeout=15)
  self.assertEqual(self.graph(),before)
if __name__=='__main__':
 mode=sys.argv[1]if len(sys.argv)>1 else'full';names=['command_01_context_binds_original_session_and_leaves_native_gated']if mode=='red'else['command_49_policy_revoked_while_waiting_on_child_lock_refuses']if mode=='race-red'else[n for n in dir(StayCommands)if n.startswith('command_')]
 suite=unittest.TestSuite();foundation_count=33 if mode=='full'else 0
 if mode=='full':suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(f.StayFoundation))
 suite.addTests(StayCommands(n)for n in names);result=unittest.TextTestRunner(verbosity=2).run(suite);(S/('commands-'+mode+'.json')).write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'sql':f.COUNTERS['sql'],'HTTP':f.COUNTERS['http'],'foundation_methods':foundation_count,'command_methods':len(names),'methods':names},indent=2)+'\n');sys.exit(not result.wasSuccessful())
