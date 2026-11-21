"""Frozen122 category-command and inherited regression acceptance; never migrates/resets/contacts hosted resources."""
from pathlib import Path
import argparse,sys,json,hashlib,time,unittest
root=Path('/Users/Misael/Desktop/FamilyTravelApp');t=root/'supabase/tests';sys.path.insert(0,str(t))
import packing_category_command_test_scope
import packing_category_command_guard as g
from packing_category_commands import CategoryCommands
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True,type=Path);a=p.parse_args();out=a.output.absolute()
if not str(out).startswith('/private/tmp/')or out.exists()or out.resolve()!=out:p.error('Fresh canonical private temporary output required')
g.validate();out.mkdir(mode=0o700)
files=[t/n for n in ['packing_category_commands.py','packing_category_command_guard.py','packing_category_command_migration_prefix.json','packing_category_command_schema.json','packing_category_command_schema_contract.sql','packing_category_command_test_scope.py','rehearse_packing_category_commands.py','packing_categories.py','packing_groups.py','packing_commands.py','trip_aggregate_recovery.py','task_commands.py','journey_entry_recovery.py']]+[root/'supabase/migrations/20261112005447_observed_trip_packing_categories.sql']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();before={str(p):sha(p)for p in files};(out/'source-hashes.json').write_text(json.dumps(before,indent=2)+'\n')
names=unittest.defaultTestLoader.getTestCaseNames(CategoryCommands);assert len(names)==156 and sum(n.startswith('test_d')for n in names)==46
start=time.monotonic()
with(out/'database-tests.log').open('w')as log:r=unittest.TextTestRunner(stream=log,verbosity=2).run(unittest.TestSuite(CategoryCommands(n)for n in names))
g.validate();assert all(sha(Path(n))==h for n,h in before.items())
proof={'actual_exit':0 if r.wasSuccessful()else 1,'actual_cases':r.testsRun,'new_category_command_cases':46,'inherited_cases':110,'inherited_endpoint_absence_expectation_superseded':1,'failures':len(r.failures),'errors':len(r.errors),'seconds':round(time.monotonic()-start,2),'schema':122,'project':'family-modernization-20261111-c2a','source_frozen':True,'real_auth_totp_postgrest':True,'test_names':names}
(out/'receipt.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items()if k!='test_names'}));sys.exit(proof['actual_exit'])
