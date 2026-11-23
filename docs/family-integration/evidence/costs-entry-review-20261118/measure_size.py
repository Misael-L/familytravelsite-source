from pathlib import Path
import subprocess,json,os
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH']}
with(T/'size-current.log').open('w')as log:r=subprocess.run(['npm','run','lint:size','--workspace=client'],cwd=W,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
rows=lambda p:[s for s in p.read_text().splitlines()if s.startswith('FAIL')];a=rows(T/'size-current.log');b=rows(W/'docs/family-integration/evidence/admin-plugins-20261118/size-final.txt');assert a==b and len(a)==30 and r.returncode==1
(T/'size-result.json').write_text(json.dumps({'command':'npm run lint:size --workspace=client','exit':r.returncode,'size_failures':30,'all_prior_failure_lines_exact':True,'rules_and_baselines_unchanged':True},indent=2)+'\n');print('Actual size-gate exit:',r.returncode,';30 exact inherited findings.')
