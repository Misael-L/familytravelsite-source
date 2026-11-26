"""Replay the same existing cohort on the exact corrected source, retaining old case outcomes for comparison."""
from pathlib import Path
import argparse,json,shutil,subprocess,re,hashlib
from collections import Counter
p=argparse.ArgumentParser();p.add_argument('--website',required=True,type=Path);p.add_argument('--out',required=True,type=Path);a=p.parse_args();W=a.website.resolve();T=a.out.resolve();S=Path(__file__).parent;assert not T.exists();T.mkdir();pins=json.loads((S/'source-pins.json').read_text());D=T/'candidate-checkout';D.mkdir()
archive=subprocess.Popen(['git','archive',pins['implementation']],cwd=W,stdout=subprocess.PIPE);r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=archive.stdout);archive.stdout.close();assert archive.wait()==r.returncode==0
for name in ['node_modules','client/node_modules','family-backend/node_modules']:
 if(W/name).exists():(D/name).symlink_to(W/name,target_is_directory=True)
(T/'run_rehearsal.py').write_text((S/'run_rehearsal.py').read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W)));shutil.copyfile(S/'consumer-suite-paths.json',T/'consumer-suite-paths.json');subprocess.run(['python3',str(T/'run_rehearsal.py'),'candidate'],check=True)
result=json.loads((T/'candidate-result.json').read_text());assert result['exit']==0 and result['numPassedTests']==2316 and result['numFailedTests']==0 and result['numPendingTests']==38 and result['numTotalTests']==2354
j=json.loads((T/'candidate-tests.json').read_text());rows=sorted((r['name'].split('/client/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults']);expected=json.loads((S/'case-outcome-digest.json').read_text())
file='src/integrations/family/stayTransport.test.ts';rx=r'^refuses false acknowledgements \{"stay_id":"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"\}$'
norm=lambda rows:sorted((f,anc,'source-generated-v4-UUID-label'if f==file and re.fullmatch(rx,title)else title,status)for f,anc,title,status in rows)
assert len(rows)==expected['cases']==2354 and sum(f==file and bool(re.fullmatch(rx,title))for f,anc,title,status in rows)==1
assert hashlib.sha256(json.dumps(norm(rows),separators=(',',':')).encode()).hexdigest()==expected['sha256']
proof=json.loads((S/'consumer-proof.json').read_text());assert hashlib.sha256((D/'client'/file).read_bytes()).hexdigest()==proof['generated_label_source_sha256']
skips=[r for r in rows if r[3]=='skipped'];assert len(skips)==38 and all(r[0]=='src/pages/JourneyDetailPage.test.tsx'for r in skips)
print('Q121:2316 existing cases pass;38 unchanged pre-existing skips. Exact outcomes match except the one source-defined generated UUID label. No hosted/browser or full feature-coverage claim.')
