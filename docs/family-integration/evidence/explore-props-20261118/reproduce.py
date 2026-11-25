"""Replay unchanged catalog/media/permission/session consumers on the pinned before/after trees."""
from pathlib import Path
import argparse,json,shutil,subprocess
p=argparse.ArgumentParser();p.add_argument('--website',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();W=a.website.resolve();T=a.out.resolve();S=Path(__file__).parent;assert not T.exists();T.mkdir();pins=json.loads((S/'source-pins.json').read_text());(T/'run_rehearsal.py').write_text((S/'run_rehearsal.py').read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W)));shutil.copyfile(S/'consumer-suite-paths.json',T/'consumer-suite-paths.json');suites=json.loads((T/'consumer-suite-paths.json').read_text());all_cases={}
for mode,pin in [('original',pins['incoming']),('candidate',pins['implementation'])]:
 D=T/(mode+'-checkout');D.mkdir();archive=subprocess.Popen(['git','archive',pin],cwd=W,stdout=subprocess.PIPE);r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=archive.stdout);archive.stdout.close();assert archive.wait()==r.returncode==0
 for n in ['node_modules','client/node_modules','family-backend/node_modules']:
  if(W/n).exists():(D/n).symlink_to(W/n,target_is_directory=True)
 subprocess.run(['python3',str(T/'run_rehearsal.py'),mode],check=True);rows=[]
 for package in suites:
  result=next(r for r in json.loads((T/(mode+'-result.json')).read_text())if r['package']==package);assert result['exit']==0 and result['numFailedTests']==result['numPendingTests']==0
  j=json.loads((T/(mode+'-'+package+'-tests.json')).read_text());rows.extend((package,r['name'].split('/'+package+'/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults'])
 all_cases[mode]=sorted(rows)
assert all_cases['original']==all_cases['candidate']and len(all_cases['candidate'])==367 and all(r[-1]=='passed'for r in all_cases['candidate']);print('Q115:367 identical existing catalog/media/permission/session cases pass before and after the type-only extraction.')
