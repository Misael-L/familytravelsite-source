"""Both orders of authorized Person unlink versus terminal cancellation, on strict127 only."""
from packing_restore_cancellations import Cancellation,lit
import contextlib,concurrent.futures,subprocess,selectors,time
class CancellationIdentity(Cancellation):
 @contextlib.contextmanager
 def held_identity_update(self,person):
  p=subprocess.Popen(['docker','exec','-i',self.container,'psql','-X','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
  try:
   p.stdin.write("begin;do $identity$begin perform set_config('family_auth.allow_identity_link','1',true);update public.people set user_id=null where id="+lit(person)+";end $identity$;select pg_backend_pid();\n");p.stdin.flush()
   with selectors.DefaultSelector()as ready:
    ready.register(p.stdout,selectors.EVENT_READ);self.assertTrue(ready.select(timeout=10));pid=int(p.stdout.readline().strip())
   yield pid
   p.stdin.write('commit;\n\\q\n');p.stdin.flush();_,error=p.communicate(timeout=15);self.assertEqual(p.returncode,0,error)
  finally:
   if p.poll()is None:p.stdin.write('rollback;\n\\q\n');p.stdin.flush();p.communicate(timeout=15)
 def editor_original(self,user):
  self.policy('trip.packing.manage','trip_travelers');a,_,_=self.original();a[3]['p_scope']=self.state(user)['scope']
  self.assertEqual(self.sql('select count(*)from family_auth.packing_command_receipts where actor_user_id='+lit(user)),'0');return a
 def relink(self,user,person):self.sql("select set_config('family_auth.allow_identity_link','1',false);update public.people set user_id="+lit(user)+'where id='+lit(person))
 def test_identity_cancel_before_unlink(self):
  a=self.editor_original(self.editor);statement="select set_config('family_auth.allow_identity_link','1',false);update public.people set user_id=null where id="+lit(self.editor_person)
  try:
   self.owner=self.editor
   with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
    with self.held_authenticated_command(self.cancel_statement(a))as pid:
     f=pool.submit(self.sql,statement);self.wait_for_lock(self.editor_person,pid)
    with self.assertRaisesRegex(RuntimeError,'23514'):f.result(timeout=20)
  finally:
   del self.owner;self.relink(self.editor,self.editor_person)
  self.assertEqual(self.proof(a,self.editor)['status'],'cancelled')
 def test_identity_unlink_before_cancel(self):
  a=self.editor_original(self.viewer)
  try:
   with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
    with self.held_identity_update(self.viewer_person)as pid:
     f=pool.submit(self.cancel,a,self.viewer);self.wait_for_lock(a[1],pid)
    with self.assertRaisesRegex(RuntimeError,'23514|42501'):f.result(timeout=20)
   self.assertEqual(self.sql('select count(*)from family_auth.packing_command_cancellations where operation_id='+lit(a[1])),'0')
  finally:self.relink(self.viewer,self.viewer_person)
