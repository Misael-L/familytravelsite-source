from pathlib import Path
import json,os,subprocess,time,sys
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');v=sys.argv[1];D=T/(v+'-checkout')if(T/(v+'-checkout')).exists()else W;suites=json.loads((T/'consumer-suite-paths.json').read_text());env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
for key in list(env):
 if key.startswith('FAMILY_')and('FIXTURE'in key or'LIVE'in key):env.pop(key)
results=[]
for package,paths in suites.items():
 cmd=[str(W/'node_modules/.bin/vitest'),'run',*paths,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+str(T/(v+'-'+package+'-tests.json'))];start=time.monotonic()
 with(T/(v+'-'+package+'-tests.log')).open('w')as log:r=subprocess.run(cmd,cwd=D/package,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
 out={'package':package,'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'files':paths,'command':cmd,'controlled_ports_only':True,'coverage_not_enabled_or_claimed':True}
 if(T/(v+'-'+package+'-tests.json')).exists():
  j=json.loads((T/(v+'-'+package+'-tests.json')).read_text());out.update({k:j[k]for k in ['numPassedTests','numFailedTests','numPendingTests','numTotalTests']})
 results.append(out);assert r.returncode==0;print(v,package,json.dumps({k:v for k,v in out.items()if k not in ['files','command']}),flush=True)
(T/(v+'-result.json')).write_text(json.dumps(results,indent=2)+'\n')
