"""Frozen124 category-bound item and all inherited packing acceptance; no migration/reset/hosted access."""
from pathlib import Path
import argparse,sys,json,hashlib,time,unittest,types,os
ROOT=Path('/Users/Misael/Desktop/FamilyTravelApp');T=ROOT/'supabase/tests';sys.path.insert(0,str(T))
import packing_category_bound_guard as guard
# New-runner-only target adapter. Historical guards and helpers stay byte-identical.
sys.modules['packing_group_guard']=guard
os.environ['FAMILY_RECOVERY_STATE']=str(guard.STATE)
p=T/'trip_aggregate_recovery.py';src=p.read_text();assert src.count("cls.api!='http://127.0.0.1:55331'")==1
src=src.replace("cls.api!='http://127.0.0.1:55331'","cls.api!='http://127.0.0.1:55631'").replace("['supabase','status'","['/opt/homebrew/bin/supabase','status'")
m=types.ModuleType('trip_aggregate_recovery');m.__file__=str(p);sys.modules[m.__name__]=m;exec(compile(src,str(p),'exec'),m.__dict__)
from packing_category_bound import CategoryBound
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True,type=Path);a=parser.parse_args();out=a.output.absolute()
if not str(out).startswith('/private/tmp/')or out.exists()or out.resolve()!=out:parser.error('Fresh canonical private temporary output required')
guard.validate();out.mkdir(mode=0o700)
files=[p for p in T.glob('packing_category_bound*')if p.is_file()]+[T/n for n in ['packing_category_commands.py','packing_categories.py','packing_groups.py','packing_commands.py','trip_aggregate_recovery.py','task_commands.py','journey_entry_recovery.py','packing_category_lifecycle.py','packing_category_lifecycle_guard.py','rehearse_packing_category_bound.py']]+[ROOT/'supabase/migrations/20261112055647_category_bound_packing_items.sql']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();before={str(p):sha(p)for p in files};(out/'source-hashes.json').write_text(json.dumps(before,indent=2)+'\n')
names=unittest.defaultTestLoader.getTestCaseNames(CategoryBound);assert len(names)==255 and sum(n.startswith('test_f')for n in names)==55
start=time.monotonic()
with(out/'database-tests.log').open('w')as log:r=unittest.TextTestRunner(stream=log,verbosity=2).run(unittest.TestSuite(CategoryBound(n)for n in names))
guard.validate();assert all(sha(Path(n))==h for n,h in before.items())
proof={'actual_exit':0 if r.wasSuccessful()else 1,'actual_cases':r.testsRun,'new_bound_item_cases':55,'inherited_cases':200,'failures':len(r.failures),'errors':len(r.errors),'seconds':round(time.monotonic()-start,2),'schema':124,'project':'family-modernization-20261112-c3b1','source_frozen':True,'real_auth_totp_postgrest':True,'test_names':names}
(out/'receipt.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items()if k!='test_names'}));raise SystemExit(proof['actual_exit'])
