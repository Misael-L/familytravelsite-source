from pathlib import Path
import os,subprocess,json,concurrent.futures,time
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH']}
def run(n):
 start=time.monotonic()
 with(T/('guard-'+n+'.log')).open('w')as log:r=subprocess.run(['npm','run','lint:'+n],cwd=W/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
 return {'name':n,'exit':r.returncode,'expected':1 if n=='offline'else 0,'seconds':round(time.monotonic()-start,2)}
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as ex:rows=list(ex.map(run,['layers','offline','size','pairs']))
(T/'light-guard-results.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows));assert all(r['exit']==r['expected']for r in rows)
