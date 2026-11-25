"""Original stay outcome/cancellation on a new guarded derivative, synthetic Auth metadata."""
from pathlib import Path
import sys,unittest,json,copy,concurrent.futures
import os
sys.path.insert(0,str(Path(__file__).resolve().parent))
import trip_stay_adapters_guard as adapter_guard
sys.modules['trip_stay_commands_guard']=adapter_guard
from trip_stay_commands import StayCommands,f,g,sql,rpc,http,new,lit
S=g.S
import subprocess,time
class StayOutcomes(StayCommands):
 def operation(self,action='save',**kw):
  c=kw.pop('context',None)or self.context();return {'p_trip_id':self.trip,'p_stay_id':self.stay,'p_operation_id':new(),'p_scope':c['scope'],'p_observation':c['observation'],'p_action':action,'p_changes':{'notes':'Original private note'}if action=='save'else{},'p_reservation_id':None}|kw
 def outcome(self,p,cancel=False,user=None):return rpc('cancel_family_stay_command_v1'if cancel else'get_family_stay_command_outcome_v1',list(p.values()),user or self.owner)
 def execute(self,p):return self.command(p['p_action'],changes=p['p_changes'],context={'scope':p['p_scope'],'observation':p['p_observation']},operation=p['p_operation_id'],stay=p['p_stay_id'],booking=p['p_reservation_id'])
 def switch_session(self):
  old=f.USERS[self.owner];sid=new();sql('insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after,factor_id)select '+lit(sid)+",user_id,now(),now(),aal,now()+interval '1 day',factor_id from auth.sessions where id="+lit(old));f.USERS[self.owner]=sid;self.addCleanup(lambda:f.USERS.__setitem__(self.owner,old));return old,sid
 def outcome_01_absence_is_unknown_not_retry_authority(self):
  p=self.operation();before=self.graph();r=self.outcome(p);self.assertEqual(r['status'],'unknown');self.assertIsNone(r['acknowledgement']);self.assertIsNone(r['cancelled_at']);self.assertEqual(self.graph(),before)
 def outcome_02_lost_reply_inspected_after_new_login_without_content_overwrite(self):
  p=self.operation();ack=self.execute(p);self.command(changes={'notes':'Newer'});before=self.graph();old,sid=self.switch_session();r=self.outcome(p);self.assertEqual(r['acknowledgement'],ack);self.assertEqual(r['current_scope']['session_id'],sid);self.assertEqual(r['original_session_id'],old);self.assertEqual(self.graph(),before);self.refused('PT409',lambda:self.execute(p))
 def outcome_03_cancel_is_terminal_without_stay_or_trip_mutation(self):
  p=self.operation();before=self.graph();r=self.outcome(p,True);self.assertEqual(r['status'],'cancelled');self.assertEqual(self.graph(),before);self.assertEqual(self.outcome(p,True),r);self.refused('PT409',lambda:self.execute(p));self.assertEqual(self.outcome(p),r)
 def outcome_04_cancel_never_created_id_no_phantom_content(self):
  target=new();c=self.context(stay=target,location=self.location);p=self.operation(context=c,p_stay_id=target,p_changes={'location_id':self.location,'arrival_date':'2027-04-01','departure_date':'2027-04-03'});before=self.graph();self.assertEqual(self.outcome(p,True)['status'],'cancelled');self.refused('PT409',lambda:self.execute(p));self.assertEqual(self.graph(),before);self.assertEqual(sql('select count(*)from public.trip_stays where id='+lit(target)),'0')
 def outcome_05_cancel_committed_returns_committed(self):
  p=self.operation();ack=self.execute(p);self.assertEqual(self.outcome(p,True)['acknowledgement'],ack);self.assertEqual(sql('select count(*)from family_auth.stay_command_cancellations where trip_id='+lit(self.trip)),'0')
 def outcome_06_body_reuse_refuses_for_both_terminal_states(self):
  for cancel in[True,False]:
   p=self.operation();self.outcome(p,True)if cancel else self.execute(p);bad=copy.deepcopy(p);bad['p_changes']={'notes':'Different'}
   self.refused('PT409',lambda:self.outcome(bad));self.refused('PT409',lambda:self.outcome(bad,True))
 def outcome_07_current_revoked_session_does_not_read_receipt(self):
  p=self.operation();self.execute(p);sql('update auth.sessions set not_after=clock_timestamp()where id='+lit(f.USERS[self.owner]))
  try:
   for cancel in[True,False]:self.assertEqual(http('/rpc/cancel_family_stay_command_v1'if cancel else'/rpc/get_family_stay_command_outcome_v1',p,self.owner)[0],403)
  finally:sql("update auth.sessions set not_after=now()+interval '1 day'where id="+lit(f.USERS[self.owner]))
 def outcome_08_fresh_login_can_cancel_unknown_original_but_not_resubmit(self):
  p=self.operation();self.switch_session();self.refused('PT409',lambda:self.execute(p));self.assertEqual(self.outcome(p,True)['status'],'cancelled')
 def outcome_09_foreign_actor_or_trip_scope_refuses(self):
  p=self.operation()
  for key in['trip_id','family_id','user_id','person_id']:
   bad=copy.deepcopy(p);bad['p_scope'][key]=new();self.refused('PT409',lambda:self.outcome(bad,True))
  self.refused('42501',lambda:self.outcome(p,True,self.stranger))
 def outcome_10_link_requires_both_current_permissions(self):
  self.permit('trip.schedule.manage');c=self.context(user=self.editor);p=self.operation('link',context=c);self.refused('42501',lambda:self.outcome(p,True,self.editor));self.refused('42501',lambda:self.outcome(p,False,self.editor))
 def outcome_11_propose_denied_and_demoted_cannot_cancel(self):
  p=self.operation();self.permit('trip.schedule.manage',None,'trip_travelers');self.refused('42501',lambda:self.outcome(p,True,self.editor));sql('update public.family_members set role=\'child\'where family_id='+lit(self.family)+'and user_id='+lit(self.owner))
  try:self.refused('42501',lambda:self.outcome(p,True))
  finally:sql('update public.family_members set role=\'patriarch\'where family_id='+lit(self.family)+'and user_id='+lit(self.owner))
 def outcome_12_trashed_parent_freezes_outcome_until_restore(self):
  p=self.operation();rpc('trash_family_trip',[self.trip,sql('select revision from public.trips where id='+lit(self.trip))],self.owner);self.refused('42501',lambda:self.outcome(p,True));rpc('restore_family_trip',[self.trip,sql('select revision from public.trips where id='+lit(self.trip))],self.owner);self.assertEqual(self.outcome(p)['status'],'unknown')
 def outcome_13_immutable_and_no_public_or_service_access(self):
  p=self.operation();self.outcome(p,True)
  for q in ['delete from family_auth.stay_command_cancellations','update family_auth.stay_command_cancellations set cancelled_at=now()']:self.rejected(q,'0A000')
  for role in['anon','authenticated','service_role']:self.rejected('select *from family_auth.stay_command_cancellations',code='42501',role=role,user=self.owner if role=='authenticated'else None)
  for role in['anon','service_role']:self.rejected('select public.get_family_stay_command_outcome_v1('+','.join('NULL'for _ in range(8))+')',code='42501',role=role)
 def outcome_14_real_http_cancel_and_late_write(self):
  p=self.operation();code,r=http('/rpc/cancel_family_stay_command_v1',p,self.owner);self.assertEqual(code,200);self.assertEqual(r['status'],'cancelled');a={k:v for k,v in p.items()if k not in['p_action','p_reservation_id']};code,r=http('/rpc/save_family_stay_v1',a,self.owner);self.assertEqual((code,r['code']),(409,'PT409'))
 def outcome_15_parallel_cancel_and_writer_have_one_terminal_winner(self):
  p=self.operation()
  def writer():
   try:return self.execute(p)
   except RuntimeError as e:self.assertIn('PT409',str(e));return None
  with concurrent.futures.ThreadPoolExecutor(2)as pool:w=pool.submit(writer);c=pool.submit(lambda:self.outcome(p,True));ack=w.result();result=c.result()
  self.assertEqual(result['status'],'committed'if ack else'cancelled');self.assertEqual(self.outcome(p)['status'],result['status']);self.assertEqual(sql('select (select count(*)from family_auth.stay_command_receipts where trip_id='+lit(self.trip)+')+(select count(*)from family_auth.stay_command_cancellations where trip_id='+lit(self.trip)+')'),'1')
 def outcome_16_exact_shape_private_layer_and_bounds(self):
  p=self.operation();bad=copy.deepcopy(p);bad['p_scope']['extra']=1;self.refused('22023',lambda:self.outcome(bad,True));bad=copy.deepcopy(p);bad['p_scope']['layer']='draft';self.refused('0A000',lambda:self.outcome(bad,True));bad=copy.deepcopy(p);bad['p_changes']['notes']='é'*10001;self.refused('22023',lambda:self.outcome(bad,True))
 def outcome_17_deleted_original_auth_session_does_not_delete_cancel_decision(self):
  p=self.operation();self.outcome(p,True);old,sid=self.switch_session();record=sql('select to_jsonb(s)from auth.sessions s where id='+lit(old));sql('delete from auth.sessions where id='+lit(old));self.assertEqual(self.outcome(p)['status'],'cancelled');sql('insert into auth.sessions select *from jsonb_populate_record(null::auth.sessions,'+lit(record)+'::jsonb)')
 def outcome_18_expired_session_cannot_inspect_unknown(self):
  p=self.operation();code,r=http('/rpc/get_family_stay_command_outcome_v1',p,self.owner,raw_token=f.token(self.owner,overrides={'exp':1}));self.assertEqual(code,401)
 def outcome_19_permission_revoked_during_current_session_lock_wait_refuses_cancel(self):
  self.permit('trip.schedule.manage');c=self.context(user=self.editor);p=self.operation(context=c);st=g.validate()
  locker=subprocess.Popen(['docker','exec','-i',st['id'],'psql','-h','/socket','-X','-Atq','-v','ON_ERROR_STOP=1','-U',g.OP,'-d',g.DB],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  locker.stdin.write('begin;select id from auth.sessions where id='+lit(f.USERS[self.editor])+"for update;\n\\echo HELD\n");locker.stdin.flush()
  while locker.stdout.readline().strip()!='HELD':pass
  with concurrent.futures.ThreadPoolExecutor(1)as pool:
   future=pool.submit(lambda:self.outcome(p,True,self.editor))
   try:
    waiting=False
    for _ in range(80):
     if sql("select exists(select 1 from pg_stat_activity where wait_event_type='Lock'and query like '%cancel_family_stay_command_v1%'and query like '%"+self.trip+"%')")=='t':waiting=True;break
     time.sleep(.05)
    self.assertTrue(waiting);sql('delete from public.family_permission_policies where family_id='+lit(self.family)+"and capability_key='trip.schedule.manage'")
   finally:locker.stdin.write('commit;\n');locker.stdin.close();self.assertEqual(locker.wait(timeout=10),0)
   with self.assertRaisesRegex(RuntimeError,'42501'):future.result(timeout=15)
  self.assertEqual(sql('select count(*)from family_auth.stay_command_cancellations where trip_id='+lit(self.trip)),'0')
if __name__=='__main__':
 names=[n for n in dir(StayOutcomes)if n.startswith('outcome_')];result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(StayOutcomes(n)for n in names));(S/'outcome-tests.json').write_text(json.dumps({'tests':result.testsRun,'errors':len(result.errors),'failures':len(result.failures),'skipped':len(result.skipped),'SQL':f.COUNTERS['sql'],'HTTP':f.COUNTERS['http']},indent=2)+'\n');sys.exit(not result.wasSuccessful())
