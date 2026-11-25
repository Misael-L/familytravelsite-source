"""Replay Q95 planner-hook behavior parity on original and qualified source."""
from pathlib import Path
import argparse,json,subprocess
p=argparse.ArgumentParser();p.add_argument('--website',type=Path,required=True);p.add_argument('--out',type=Path,required=True);args=p.parse_args()
S=Path(__file__).parent;W=args.website.resolve();T=args.out.resolve();assert not T.exists();T.mkdir()
pins=json.loads((S/'source-pins.json').read_text())
(T/'run_rehearsal.py').write_text((S/'run_rehearsal.py').read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W)))
tests={name:subprocess.check_output(['git','show',pins['implementation']+':client/src/pages/tripPlanner/'+name],cwd=W)for name in ['useTripPlannerPage.test.tsx']}
for version,pin in [('original',pins['incoming']),('candidate',pins['implementation'])]:
 D=T/(version+'-checkout');D.mkdir();a=subprocess.Popen(['git','archive',pin],cwd=W,stdout=subprocess.PIPE)
 r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=a.stdout);a.stdout.close();assert a.wait()==r.returncode==0
 for rel in ['node_modules','client/node_modules','family-backend/node_modules']:
  if (W/rel).exists():(D/rel).symlink_to(W/rel,target_is_directory=True)
 for name,source in tests.items():(D/'client/src/pages/tripPlanner'/name).write_bytes(source)
 subprocess.run(['python3',str(T/'run_rehearsal.py'),version],check=True)
 result=json.loads((T/(version+'-result.json')).read_text());report=json.loads((T/(version+'-tests.json')).read_text())
 assert result['exit']==0 and report['numPassedTests']==207 and report['numFailedTests']==0
print('Q95 original and qualified planner source each passed207 checks.')
