"""Replay Q97 unchanged controller checks and new extracted-factory contracts."""
from pathlib import Path
import argparse,json,subprocess
p=argparse.ArgumentParser();p.add_argument('--website',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();W=a.website.resolve();T=a.out.resolve();S=Path(__file__).parent;assert not T.exists();T.mkdir();pins=json.loads((S/'source-pins.json').read_text())
(T/'run_rehearsal.py').write_text((S/'run_rehearsal.py').read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W)))
for version,pin in [('original',pins['incoming']),('candidate',pins['implementation'])]:
 D=T/(version+'-checkout');D.mkdir();archive=subprocess.Popen(['git','archive',pin],cwd=W,stdout=subprocess.PIPE);r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=archive.stdout);archive.stdout.close();assert archive.wait()==r.returncode==0
 for rel in ['node_modules','client/node_modules','family-backend/node_modules']:
  if(W/rel).exists():(D/rel).symlink_to(W/rel,target_is_directory=True)
 subprocess.run(['python3',str(T/'run_rehearsal.py'),version],check=True);r=json.loads((T/(version+'-result.json')).read_text());assert r['exit']==0 and r['numFailedTests']==0 and r['numPassedTests']==(49 if version=='original'else 109)
print('Q97:49 existing checks pass before/after;60 additional factory contracts pass on the candidate.')
