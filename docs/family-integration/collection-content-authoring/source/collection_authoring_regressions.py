"""All accepted business methods, pinned sources and explicit retirement adaptations."""
from pathlib import Path
import hashlib,os,types,sys,unittest,json
from collection_authoring_support import S,COUNTS
sys.modules.setdefault('collection_authoring_regressions',sys.modules[__name__]);CACHE={}
HASHES={'recovery':'804d543c8ec7cf0930ffadd614aade450d78ab60def82fbf1a95b59afe24d7f6','content':'6d6c707673fa4688a9796d5deec589f6608dd6ada4eaac7efff50b95438bb108','reads':'96ca5a823b36e7b31334492f73b290bbf4baf911cf33b494a602b27709c5b1ab'}
FILES={'recovery':'collection_recovery_tests.py','content':'collection_location_tests.py','reads':'collection_read_tests.py'}
def load(kind):
 if kind in CACHE:return CACHE[kind]
 source=Path(os.environ.get('FAMILY_COLLECTION_'+{'recovery':'RECOVERY','content':'CONTENT','reads':'READ'}[kind]+'_TEST_SOURCE',str(Path(__file__).with_name(FILES[kind])))).resolve()
 assert hashlib.sha256(source.read_bytes()).hexdigest()==HASHES[kind],'Accepted regression source changed'
 text=source.read_text();old={'recovery':'collection_recovery_support','content':'collection_location_support','reads':'collection_read_support'}[kind]
 assert text.count('from '+old+' import *')==1
 text=text.replace('from '+old+' import *','from collection_authoring_support import *\nrpc=regression_rpc;request=regression_request;sql=regression_sql').replace('collection_recovery_candidate','collection_authoring_candidate').replace('collection_content_candidate','collection_authoring_candidate').replace('collection_reads_candidate','collection_authoring_candidate')
 if kind=='recovery':
  lines=text.splitlines();matches=0
  for i,line in enumerate(lines):
   if "r=sql('delete from public.'+table+"in line and"self.assertIn('0A000',r.stderr)"in line:lines[i]=line.replace("self.assertIn('0A000',r.stderr)","self.assertIn('23503',r.stderr)");matches+=1
  assert matches==1;text='\n'.join(lines)
  oldline="self.rejected('add_list_item',{'list_id':self.collection,'kind':'place','entity_id':self.place},code='23505')";assert text.count(oldline)==1;text=text.replace(oldline,oldline.replace("code='23505'","code='PT409'"))
 if kind=='reads':text=text.replace('from collection_read_regressions import load_content','from collection_authoring_regressions import load_content')
 text=text.split("\nif __name__=='__main__':",1)[0];module=types.ModuleType('accepted_authoring_'+kind);sys.modules[module.__name__]=module;exec(compile(text,str(source),'exec'),module.__dict__);CACHE[kind]=module;return module
def load_content():return load('content')
if __name__=='__main__':
 a=load('recovery');b=load('content');c=load('reads');suite=unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromTestCase(a.CollectionRecovery),unittest.defaultTestLoader.loadTestsFromTestCase(b.CollectionLocation),unittest.TestSuite(c.CollectionReads(n)for n in c.CollectionReads.__dict__ if n.startswith('test_read_'))]);assert suite.countTestCases()==103
 r=unittest.TextTestRunner(verbosity=2).run(suite)
 (S/'regressions-summary.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped),'calls':COUNTS,'pinned_source_hashes':HASHES,'all_accepted_methods_retained':103,'adaptations':['new owned fixture/support/database','three legacy fixture calls translated into actual checked C4 context/prepare/execute APIs; raw retired endpoints independently refuse','one trusted coalesced-history SQL fixture replaces two retired status calls in the same transaction; not new public-writer proof','prior catalog DELETE RESTRICT23503 and duplicate saved source now explicit PT409'],'real_Auth_REST':True},indent=2)+'\n');sys.exit(not r.wasSuccessful())
