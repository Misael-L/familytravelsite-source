"""Replay unchanged native planner/transport/booking/phone/queue consumers on pinned before/after source."""
from pathlib import Path
from collections import Counter
import argparse,json,re,shutil,subprocess
p=argparse.ArgumentParser();p.add_argument('--website',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();W=a.website.resolve();T=a.out.resolve();S=Path(__file__).parent;assert not T.exists();T.mkdir();pins=json.loads((S/'source-pins.json').read_text());(T/'run_rehearsal.py').write_text((S/'run_rehearsal.py').read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W)));shutil.copyfile(S/'consumer-suite-paths.json',T/'consumer-suite-paths.json');expanded={};raw={}
file='src/integrations/family/stayTransport.test.ts';rx=r'^refuses false acknowledgements \{"stay_id":"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"\}$';sources=[]
for mode,pin in [('original',pins['incoming']),('candidate',pins['implementation'])]:
 D=T/(mode+'-checkout');D.mkdir();archive=subprocess.Popen(['git','archive',pin],cwd=W,stdout=subprocess.PIPE);r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=archive.stdout);archive.stdout.close();assert archive.wait()==r.returncode==0
 for name in ['node_modules','client/node_modules','family-backend/node_modules']:
  if(W/name).exists():(D/name).symlink_to(W/name,target_is_directory=True)
 sources.append((D/'client'/file).read_bytes());subprocess.run(['python3',str(T/'run_rehearsal.py'),mode],check=True);result=json.loads((T/(mode+'-result.json')).read_text());assert result['exit']==0 and result['numPassedTests']==1650 and result['numFailedTests']==result['numPendingTests']==0
 j=json.loads((T/(mode+'-tests.json')).read_text());rows=sorted((r['name'].split('/client/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults']);raw[mode]=rows
 expanded[mode]=sorted((f,anc,'refuses false acknowledgements {"stay_id":"<generated-v4-UUID>"}'if f==file and re.fullmatch(rx,title)else title,status)for f,anc,title,status in rows)
assert sources[0]==sources[1]and b'{ stay_id: crypto.randomUUID() }'in sources[0]
assert expanded['original']==expanded['candidate']and len(expanded['candidate'])==1650
for a,b in [(raw['original'],raw['candidate']),(raw['candidate'],raw['original'])]:
 delta=list((Counter(a)-Counter(b)).elements());assert len(delta)<=1
 for row in delta:assert row[0]==file and row[1]==()and re.fullmatch(rx,row[2])and row[3]=='passed'
print('Q119:1650 unchanged native planner/transport/booking/phone/queue cases pass before/after; only the exact source-defined generated UUID label may differ.')
