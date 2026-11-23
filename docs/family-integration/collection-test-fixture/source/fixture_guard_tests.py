"""Input integrity/refusal tests; no Docker connection or database mutation."""
from pathlib import Path
import ast,hashlib,os,tempfile,shutil,unittest,json,sys,subprocess
from unittest import mock
from types import SimpleNamespace
H=Path(os.environ['FAMILY_COMPACT_FIXTURE_DIR']).resolve();SOURCE=Path(os.environ['FAMILY_COMPACT_SOURCE_DIR']).resolve()
tree=ast.parse((H/'build_host_fixture.py').read_text());nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in('verify_exports','require_space')or isinstance(n,ast.Assign)and any(isinstance(v,ast.Name)and v.id=='EXPECTED_EXPORTS'for v in n.targets)]
env={'hashlib':hashlib,'shutil':shutil};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<exact-input-guard>','exec'),env);verify=env['verify_exports'];pins=env['EXPECTED_EXPORTS']
class Guards(unittest.TestCase):
 def test_01_all_pinned_exports_match(self):verify(SOURCE)
 def changed(self,name,kind='bytes'):
  with tempfile.TemporaryDirectory(prefix='compact-guard-',dir=H)as value:
   root=Path(value)
   for other in pins:
    if other==name:
     if kind=='bytes':(root/other).write_bytes(b'altered fixture')
     elif kind=='link':(root/other).symlink_to(SOURCE/other)
    else:shutil.copyfile(SOURCE/other,root/other)
   with self.assertRaisesRegex(AssertionError,name.replace('.','\\.')):verify(root)
 def test_02_wrong_database_export_refuses(self):self.changed('accepted142.dump')
 def test_03_wrong_role_flags_refuse(self):self.changed('role-flags-private.json')
 def test_04_wrong_role_members_refuse(self):self.changed('role-members-private.json')
 def test_05_wrong_routine_baseline_refuses(self):self.changed('source-routines-private.json')
 def test_06_symlink_export_refuses(self):self.changed('accepted142.dump','link')
 def test_07_missing_export_refuses(self):self.changed('accepted142.dump','missing')
 def test_08_existing_target_refuses_before_engine_mutation(self):
  r=subprocess.run(['python3',str(H/'build_host_fixture.py')],capture_output=True,text=True,env=os.environ)
  self.assertNotEqual(r.returncode,0);self.assertIn('target-private.json',r.stderr);self.assertIn('AssertionError',r.stderr)
 def test_09_low_space_refuses_before_copy(self):
  with mock.patch('shutil.disk_usage',return_value=SimpleNamespace(free=1024)):
   with self.assertRaisesRegex(AssertionError,'12GiB'):env['require_space'](H)
if __name__=='__main__':
 r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Guards));(H/'fixture-guard-summary.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped),'database_or_engine_mutations':0},indent=2)+'\n');sys.exit(not r.wasSuccessful())
