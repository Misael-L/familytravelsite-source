"""Pinned accepted sources; only owned fixture/database and prior SQLSTATE adaptations."""
from pathlib import Path
import hashlib,os,types,sys,unittest,json

def load_content():
 source=Path(os.environ.get('FAMILY_COLLECTION_CONTENT_TEST_SOURCE',str(Path(__file__).with_name('collection_location_tests.py')))).resolve()
 assert hashlib.sha256(source.read_bytes()).hexdigest()=='6d6c707673fa4688a9796d5deec589f6608dd6ada4eaac7efff50b95438bb108','Accepted C2 source changed'
 text=source.read_text().replace('from collection_location_support import *','from collection_read_support import *').replace('collection_content_candidate','collection_reads_candidate').split("\nif __name__=='__main__':",1)[0]
 module=types.ModuleType('accepted_collection_content');sys.modules[module.__name__]=module;exec(compile(text,str(source),'exec'),module.__dict__);return module

def load_recovery():
 source=Path(os.environ.get('FAMILY_COLLECTION_RECOVERY_TEST_SOURCE',str(Path(__file__).with_name('collection_recovery_tests.py')))).resolve()
 assert hashlib.sha256(source.read_bytes()).hexdigest()=='804d543c8ec7cf0930ffadd614aade450d78ab60def82fbf1a95b59afe24d7f6','Accepted C1 source changed'
 text=source.read_text().replace('from collection_recovery_support import *','from collection_read_support import *').replace('collection_recovery_candidate','collection_reads_candidate')
 lines=text.splitlines();matched=0
 for i,line in enumerate(lines):
  if "r=sql('delete from public.'+table+"in line and"self.assertIn('0A000',r.stderr)"in line:lines[i]=line.replace("self.assertIn('0A000',r.stderr)","self.assertIn('23503',r.stderr)");matched+=1
 assert matched==1
 text='\n'.join(lines).split("\nif __name__=='__main__':",1)[0];module=types.ModuleType('accepted_collection_recovery');sys.modules[module.__name__]=module;exec(compile(text,str(source),'exec'),module.__dict__);return module

if __name__=='__main__':
 from collection_read_support import S,COUNTS
 a=load_content();b=load_recovery();suite=unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromTestCase(a.CollectionLocation),unittest.defaultTestLoader.loadTestsFromTestCase(b.CollectionRecovery)])
 r=unittest.TextTestRunner(verbosity=2).run(suite)
 (S/'regressions-summary.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped),'calls':COUNTS,'accepted_methods_retained':63,'source_hashes_checked':2,'adaptations':['new explicitly owned fixture/support and database','C1 catalog deletion retains accepted C2 RESTRICT/23503 adaptation'],'real_Auth_REST':True},indent=2)+'\n');sys.exit(not r.wasSuccessful())
