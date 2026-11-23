"""Replay existing transport regressions and the same seven preference/filter cases on both source pins."""
from pathlib import Path
import argparse,json,shutil,subprocess
p=argparse.ArgumentParser();p.add_argument('--website',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();W=a.website.resolve();T=a.out.resolve();S=Path(__file__).parent;assert not T.exists();T.mkdir();pins=json.loads((S/'source-pins.json').read_text());paths=json.loads((S/'application-paths.json').read_text());test=paths[3];(T/'run_rehearsal.py').write_text((S/'run_rehearsal.py').read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W)));shutil.copyfile(S/'consumer-suite-paths.json',T/'consumer-suite-paths.json');expanded={}
# New tests are installed unchanged into both pinned trees; originals are never edited.
test_bytes=subprocess.check_output(['git','show',pins['implementation']+':'+test],cwd=W)
for mode,pin in [('original',pins['incoming']),('candidate',pins['implementation'])]:
 D=T/(mode+'-checkout');D.mkdir();archive=subprocess.Popen(['git','archive',pin],cwd=W,stdout=subprocess.PIPE);r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=archive.stdout);archive.stdout.close();assert archive.wait()==r.returncode==0
 if mode=='original':assert not(D/test).exists();(D/test).write_bytes(test_bytes)
 assert(D/test).read_bytes()==test_bytes
 for n in ['node_modules','client/node_modules','family-backend/node_modules']:
  if(W/n).exists():(D/n).symlink_to(W/n,target_is_directory=True)
 subprocess.run(['python3',str(T/'run_rehearsal.py'),mode],check=True);result=json.loads((T/(mode+'-result.json')).read_text());assert result['exit']==0 and result['numPassedTests']==1290 and result['numFailedTests']==result['numPendingTests']==0
 j=json.loads((T/(mode+'-tests.json')).read_text());expanded[mode]=sorted((r['name'].split('/client/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults'])
# Compare exact cases with only the known source-generated UUID label exception.
import re
from collections import Counter
ra=expanded['original'];rb=expanded['candidate'];da=list((Counter(ra)-Counter(rb)).elements());db=list((Counter(rb)-Counter(ra)).elements());assert len(da)==len(db)==1
file='src/integrations/family/stayTransport.test.ts';rx=r'^refuses false acknowledgements \{"stay_id":"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"\}$'
for row in da+db:assert row[0]==file and row[1]==() and row[3]=='passed' and re.fullmatch(rx,row[2])
norm=lambda rows:sorted((f,anc,'generated-v4-label' if f==file and re.fullmatch(rx,title) else title,status) for f,anc,title,status in rows)
assert norm(ra)==norm(rb) and len(rb)==1290
(T/'generated-label-comparison.json').write_text(json.dumps({'passed':True,'before':da,'after':db,'exact_other_cases':1289},indent=2)+'\n')
print('Q117:1290 cases pass before and after; one known generated UUID label and1289 exact raw titles.')
