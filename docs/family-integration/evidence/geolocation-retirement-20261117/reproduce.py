"""Replay Q93's old-hook failures and repaired-hook acceptance using installed dependencies."""
from pathlib import Path
import argparse,json,subprocess
p=argparse.ArgumentParser();p.add_argument('--website',type=Path,required=True);p.add_argument('--out',type=Path,required=True);args=p.parse_args()
S=Path(__file__).parent;W=args.website.resolve();T=args.out.resolve();assert not T.exists();T.mkdir()
pins=json.loads((S/'source-pins.json').read_text())
(T/'run_rehearsal.py').write_text((S/'run_rehearsal.py').read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W)))
regression=subprocess.check_output(['git','show',pins['implementation']+':client/src/hooks/useGeolocation.lifecycle.test.ts'],cwd=W)
for version,pin in [('original',pins['incoming']),('candidate',pins['implementation'])]:
 D=T/(version+'-checkout');D.mkdir();a=subprocess.Popen(['git','archive',pin],cwd=W,stdout=subprocess.PIPE)
 r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=a.stdout);a.stdout.close();assert a.wait()==r.returncode==0
 for rel in ['node_modules','client/node_modules','family-backend/node_modules']:
  if (W/rel).exists():(D/rel).symlink_to(W/rel,target_is_directory=True)
 (D/'client/src/hooks/useGeolocation.lifecycle.test.ts').write_bytes(regression)
 subprocess.run(['python3',str(T/'run_rehearsal.py'),version],check=True)
 result=json.loads((T/(version+'-result.json')).read_text());report=json.loads((T/(version+'-tests.json')).read_text())
 if version=='original':
  assert result['exit']==1 and report['numFailedTests']==13 and report['numPassedTests']==405
  assert all(f['name'].endswith('/useGeolocation.lifecycle.test.ts')for f in report['testResults']if f['status']=='failed')
 else:assert result['exit']==0 and report['numPassedTests']==418 and report['numFailedTests']==0
print('Q93 reproduced13 old lifecycle failures; all418 repaired-source checks passed.')
