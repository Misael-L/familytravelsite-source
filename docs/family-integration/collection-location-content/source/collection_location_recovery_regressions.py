"""Re-run accepted C1 behavior with declared v139 scope/RESTRICT adaptations."""
from pathlib import Path
import hashlib,os,types,sys,unittest,json
source=Path(os.environ.get('FAMILY_COLLECTION_RECOVERY_TEST_SOURCE',str(Path(__file__).with_name('collection_recovery_tests.py')))).resolve()
assert hashlib.sha256(source.read_bytes()).hexdigest()=='804d543c8ec7cf0930ffadd614aade450d78ab60def82fbf1a95b59afe24d7f6','Accepted C1 test source changed'
text=source.read_text().replace('from collection_recovery_support import *','from collection_location_support import *').replace('collection_recovery_candidate','collection_content_candidate')
lines=text.splitlines();matched=0
for i,line in enumerate(lines):
 if "r=sql('delete from public.'+table+" in line and "self.assertIn('0A000',r.stderr)" in line:
  lines[i]=line.replace("self.assertIn('0A000',r.stderr)","self.assertIn('23503',r.stderr)");matched+=1
assert matched==1,'Expected exactly one declared catalog-deletion SQLSTATE adaptation'
text='\n'.join(lines).split("\nif __name__=='__main__':",1)[0]
module=types.ModuleType('collection_recovery_v139_regression');sys.modules[module.__name__]=module
exec(compile(text,str(source),'exec'),module.__dict__)
suite=unittest.defaultTestLoader.loadTestsFromTestCase(module.CollectionRecovery);result=unittest.TextTestRunner(verbosity=2).run(suite)
receipt={'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'calls':module.COUNTS,'accepted_source_sha256':'804d543c8ec7cf0930ffadd614aade450d78ab60def82fbf1a95b59afe24d7f6','declared_adaptations':['local candidate database name','local owned support/guard','catalog physical delete now RESTRICT/23503 instead of cascade-trigger/0A000'],'all_accepted_test_methods_retained':True,'real_GoTrue_PostgREST':True}
(module.S/'recovery-regressions-summary.json').write_text(json.dumps(receipt,indent=2)+'\n');sys.exit(not result.wasSuccessful())
