from pathlib import Path
import json,os,subprocess,time,sys
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');v=sys.argv[1];label=('focused-'+v)if'--focused'in sys.argv else v;D=T/(v+'-checkout') if (T/(v+'-checkout')).exists() else W;paths=json.loads((T/'consumer-suite-paths.json').read_text());paths=[paths[-1]]if'--focused'in sys.argv else paths
cmd=[str(W/'node_modules/.bin/vitest'),'run',*paths,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+str(T/(label+'-tests.json'))];env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
for key in list(env):
 if key.startswith('FAMILY_')and('FIXTURE'in key or'LIVE'in key):env.pop(key)
result_path=T/(label+'-tests.json')
if result_path.exists():result_path.unlink()
start=time.monotonic()
with(T/(label+'-tests.log')).open('w')as log:r=subprocess.run(cmd,cwd=D/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
out={'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'files':paths,'command':cmd,'controlled_ports_only':True,'coverage_not_enabled_or_claimed':True}
if(T/(label+'-tests.json')).exists():
 j=json.loads((T/(label+'-tests.json')).read_text());out.update({k:j[k]for k in ['numPassedTests','numFailedTests','numPendingTests','numTotalTests']})
(T/(label+'-result.json')).write_text(json.dumps(out,indent=2)+'\n');print(v,json.dumps({k:v for k,v in out.items()if k not in ['files','command']}))
