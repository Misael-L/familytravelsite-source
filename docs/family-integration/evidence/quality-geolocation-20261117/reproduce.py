"""Replay Q92 against committed sources using the already installed website dependencies."""
from pathlib import Path
import argparse,json,os,shutil,subprocess
p=argparse.ArgumentParser();p.add_argument('--website',type=Path,required=True);p.add_argument('--out',type=Path,required=True);args=p.parse_args()
S=Path(__file__).parent;W=args.website.resolve();T=args.out.resolve();assert not T.exists();T.mkdir()
pins=json.loads((S/'source-pins.json').read_text())
for name in ['run_rehearsal.py','geolocation.private.test.ts','stale-watch.private.test.ts']:
 src=S/(name+'.txt') if (S/(name+'.txt')).exists() else S/name
 text=src.read_text().replace('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4',str(W));(T/name).write_text(text)
for version,pin in [('original',pins['incoming']),('candidate',pins['implementation'])]:
 D=T/(version+'-checkout');D.mkdir();a=subprocess.Popen(['git','archive',pin],cwd=W,stdout=subprocess.PIPE)
 r=subprocess.run(['tar','-xf','-','-C',str(D)],stdin=a.stdout);a.stdout.close();assert a.wait()==r.returncode==0
 for rel in ['node_modules','client/node_modules','family-backend/node_modules']:
  if (W/rel).exists():(D/rel).symlink_to(W/rel,target_is_directory=True)
 for name in ['geolocation.private.test.ts','stale-watch.private.test.ts']:shutil.copyfile(T/name,D/'client/src/hooks'/name)
 subprocess.run(['python3',str(T/'run_rehearsal.py'),version],check=True)
 result=json.loads((T/(version+'-result.json')).read_text());assert result['exit']==0
 env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH']}
 subprocess.run([str(W/'node_modules/.bin/vitest'),'run','src/hooks/stale-watch.private.test.ts'],cwd=D/'client',env=env,check=True)
assert json.loads((T/'original-traces.json').read_text())==json.loads((T/'candidate-traces.json').read_text())
print('Q92 original/candidate tests and recorded traces match; stale-callback issue remains characterized.')
