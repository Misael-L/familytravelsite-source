"""Replay unchanged inspector/media cases on pinned original and retired sources."""
from pathlib import Path
import argparse,json,subprocess
p=argparse.ArgumentParser();p.add_argument('--website',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();W=a.website.resolve();T=a.out.resolve();S=Path(__file__).parent;assert not T.exists();T.mkdir();pins=json.loads((S/'source-pins.json').read_text())
for runner in ['run_rehearsal.py','run_backend_rehearsal.py']:(T/runner).write_text((S/runner).read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W)))
expanded={}
for mode,pin in [('original',pins['incoming']),('candidate',pins['implementation'])]:
 D=T/(mode+'-checkout');D.mkdir();archive=subprocess.Popen(['git','archive',pin],cwd=W,stdout=subprocess.PIPE);r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=archive.stdout);archive.stdout.close();assert archive.wait()==r.returncode==0
 for name in ['node_modules','client/node_modules','family-backend/node_modules']:
  if(W/name).exists():(D/name).symlink_to(W/name,target_is_directory=True)
 allcases=[]
 for package,suffix,runner,count in [('client','','run_rehearsal.py',385),('family-backend','-backend','run_backend_rehearsal.py',16)]:
  subprocess.run(['python3',str(T/runner),mode],check=True);result=json.loads((T/(mode+suffix+'-result.json')).read_text());assert result['exit']==0 and result['numPassedTests']==count and result['numFailedTests']==result['numPendingTests']==0
  j=json.loads((T/(mode+suffix+'-tests.json')).read_text());allcases.extend((package,r['name'].split('/'+package+'/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults'])
 expanded[mode]=sorted(allcases)
assert expanded['original']==expanded['candidate']and len(expanded['candidate'])==401
print('Q108:401 identical unchanged inspector/media cases pass before and after the two-file retirement.')
