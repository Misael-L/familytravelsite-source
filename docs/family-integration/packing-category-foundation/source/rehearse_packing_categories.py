"""Qualify the observed category foundation on its exact isolated121 stack. No migration, reset or hosted access."""
from pathlib import Path
import argparse,sys,json,hashlib,unittest,time
ROOT=Path('/Users/Misael/Desktop/FamilyTravelApp');sys.path.insert(0,str(ROOT/'supabase/tests'))
import packing_category_test_scope
import packing_category_guard as g
from packing_categories import CategoryFoundation
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);args=p.parse_args();out=args.output.absolute()
if not str(out).startswith('/private/tmp/')or out.exists()or out.resolve()!=out:p.error('Fresh canonical /private/tmp output required')
g.validate();out.mkdir(mode=0o700)
files=[ROOT/'supabase/tests'/n for n in ['packing_categories.py','packing_category_guard.py','packing_category_schema.json','packing_category_schema_contract.sql','packing_category_migration_prefix.json','packing_category_test_scope.py','packing_groups.py','packing_commands.py','trip_aggregate_recovery.py','task_commands.py','journey_entry_recovery.py']]+[ROOT/'supabase/migrations/20261111234537_normalized_trip_packing_categories.sql']
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();before={str(f):sha(f)for f in files};(out/'source-hashes.json').write_text(json.dumps(before,indent=2)+'\n')
names=unittest.defaultTestLoader.getTestCaseNames(CategoryFoundation);assert len(names)==110 and sum(n.startswith('test_c')for n in names)==34
start=time.monotonic()
with(out/'database-tests.log').open('w')as log:result=unittest.TextTestRunner(stream=log,verbosity=2).run(unittest.TestSuite(CategoryFoundation(n)for n in names))
g.validate();assert all(sha(Path(n))==h for n,h in before.items())
receipt={'actual_exit':0 if result.wasSuccessful()else 1,'actual_cases':result.testsRun,'existing_cases':76,'new_category_cases':34,'failures':len(result.failures),'errors':len(result.errors),'seconds':round(time.monotonic()-start,2),'schema':121,'project':'family-modernization-20261111-c2a','server':'17.11','real_auth_totp_postgrest':True,'metadata_changes_are_trusted_sql_not_a_public_writer':True,'source_frozen':True,'test_names':names}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items()if k!='test_names'}));sys.exit(receipt['actual_exit'])
