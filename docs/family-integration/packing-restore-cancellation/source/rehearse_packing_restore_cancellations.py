from pathlib import Path
import sys,unittest,json,time
from packing_restore_cancellations import Cancellation
from packing_restore_cancellation_identity import CancellationIdentity
if __name__=='__main__':
 names=unittest.defaultTestLoader.getTestCaseNames(Cancellation)
 if '--cancellation-only'in sys.argv:names=[n for n in names if n.startswith('test_i')]
 suite=unittest.TestSuite(Cancellation(n)for n in names)
 identity=[n for n in unittest.defaultTestLoader.getTestCaseNames(CancellationIdentity)if n.startswith('test_identity')]
 suite.addTests(CancellationIdentity(n)for n in identity);names+=identity
 start=time.monotonic();r=unittest.TextTestRunner(verbosity=2).run(suite)
 receipt={'cases':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'seconds':round(time.monotonic()-start,2),'names':names}
 if '--receipt'in sys.argv:
  dest=Path(sys.argv[sys.argv.index('--receipt')+1]);assert str(dest).startswith('/private/tmp/trek-u04d2c1b-packing-cancellation-20261112/');dest.write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({k:v for k,v in receipt.items()if k!='names'}));raise SystemExit(not r.wasSuccessful())
