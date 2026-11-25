"""Replay the unchanged consumer cases on pinned original and retired sources."""
from pathlib import Path
import argparse,json,subprocess
p=argparse.ArgumentParser();p.add_argument('--website',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();W=a.website.resolve();T=a.out.resolve();S=Path(__file__).parent;assert not T.exists();T.mkdir();pins=json.loads((S/'source-pins.json').read_text());(T/'run_rehearsal.py').write_text((S/'run_rehearsal.py').read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W)))
for mode,pin in [('original',pins['incoming']),('candidate',pins['implementation'])]:
 D=T/(mode+'-checkout');D.mkdir();archive=subprocess.Popen(['git','archive',pin],cwd=W,stdout=subprocess.PIPE);r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=archive.stdout);archive.stdout.close();assert archive.wait()==r.returncode==0
 for name in ['node_modules','client/node_modules','family-backend/node_modules']:
  if(W/name).exists():(D/name).symlink_to(W/name,target_is_directory=True)
 subprocess.run(['python3',str(T/'run_rehearsal.py'),mode],check=True);result=json.loads((T/(mode+'-result.json')).read_text());assert result['exit']==0 and result['numPassedTests']==603 and result['numFailedTests']==result['numPendingTests']==0
print('Q103:603 identical consumer cases pass before and after the two-page Login/Dashboard retirement.')
