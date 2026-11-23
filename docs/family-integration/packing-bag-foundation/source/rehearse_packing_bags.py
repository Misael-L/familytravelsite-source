"""Frozen126 bag and inherited packing acceptance. Never migrates or accesses hosted databases."""
from pathlib import Path
import sys,argparse,json,hashlib,time,unittest
T=Path(__file__).resolve().parent;ROOT=T.parents[1];sys.path.insert(0,str(T))
from packing_bag_test_scope import guard
from packing_bags import BagFoundation
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True,type=Path);p.add_argument('--names',nargs='+');a=p.parse_args();out=a.output.absolute()
if not str(out).startswith('/private/tmp/')or out.exists()or out.resolve()!=out:p.error('Fresh canonical private temporary output required')
guard.validate();out.mkdir(mode=0o700)
files=[x for x in T.glob('packing_bag*')if x.is_file()]+[T/'rehearse_packing_bags.py',ROOT/'supabase/migrations/20261112112956_observed_trip_packing_bags.sql']+[T/n for n in ['packing_commands.py','packing_groups.py','packing_categories.py','packing_category_commands.py','packing_category_lifecycle.py','packing_category_bound.py','packing_category_aggregate.py','trip_aggregate_recovery.py','task_commands.py','journey_entry_recovery.py']]
sha=lambda x:hashlib.sha256(x.read_bytes()).hexdigest();before={str(x):sha(x)for x in files};(out/'source-hashes.json').write_text(json.dumps(before,indent=2)+'\n')
all_names=unittest.defaultTestLoader.getTestCaseNames(BagFoundation);assert len(all_names)==372 and sum(n.startswith('test_h')for n in all_names)==53
names=a.names or all_names
if len(set(names))!=len(names)or any(n not in all_names for n in names):p.error('Unique existing test names required')
start=time.monotonic()
with(out/'database-tests.log').open('w')as log:r=unittest.TextTestRunner(stream=log,verbosity=2).run(unittest.TestSuite(BagFoundation(n)for n in names))
guard.validate();assert all(sha(Path(n))==h for n,h in before.items())
proof={'actual_exit':0 if r.wasSuccessful()else 1,'actual_cases':r.testsRun,'bag_cases':sum(n.startswith('test_h')for n in names),'inherited_or_adapted_cases':sum(not n.startswith('test_h')for n in names),'failures':len(r.failures),'errors':len(r.errors),'full_default_suite':not bool(a.names),'seconds':round(time.monotonic()-start,2),'schema':126,'project':'family-modernization-20261112-d2a','source_frozen':True,'real_auth_totp_postgrest':r.wasSuccessful()and r.testsRun>0,'names':names};(out/'receipt.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items()if k!='names'}));raise SystemExit(proof['actual_exit'])
