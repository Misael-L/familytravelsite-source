"""Replay existing booking regressions and the same six preference cases on both source pins."""
from pathlib import Path
import argparse,json,shutil,subprocess
p=argparse.ArgumentParser();p.add_argument('--website',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();W=a.website.resolve();T=a.out.resolve();S=Path(__file__).parent;assert not T.exists();T.mkdir();pins=json.loads((S/'source-pins.json').read_text());paths=json.loads((S/'application-paths.json').read_text());test=paths[2];(T/'run_rehearsal.py').write_text((S/'run_rehearsal.py').read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W)));shutil.copyfile(S/'consumer-suite-paths.json',T/'consumer-suite-paths.json');expanded={}
# New tests are installed unchanged into both pinned trees; originals are never edited.
test_bytes=subprocess.check_output(['git','show',pins['implementation']+':'+test],cwd=W)
for mode,pin in [('original',pins['incoming']),('candidate',pins['implementation'])]:
 D=T/(mode+'-checkout');D.mkdir();archive=subprocess.Popen(['git','archive',pin],cwd=W,stdout=subprocess.PIPE);r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=archive.stdout);archive.stdout.close();assert archive.wait()==r.returncode==0
 if mode=='original':assert not(D/test).exists();(D/test).write_bytes(test_bytes)
 assert(D/test).read_bytes()==test_bytes
 for n in ['node_modules','client/node_modules','family-backend/node_modules']:
  if(W/n).exists():(D/n).symlink_to(W/n,target_is_directory=True)
 subprocess.run(['python3',str(T/'run_rehearsal.py'),mode],check=True);result=json.loads((T/(mode+'-result.json')).read_text());assert result['exit']==0 and result['numPassedTests']==968 and result['numFailedTests']==result['numPendingTests']==0
 j=json.loads((T/(mode+'-tests.json')).read_text());expanded[mode]=sorted((r['name'].split('/client/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults'])
assert expanded['original']==expanded['candidate']and len(expanded['candidate'])==968;print('Q116:968 identical expanded cases pass before and after, including the same six parent-level preferences cases.')
