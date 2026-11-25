from pathlib import Path
import subprocess,os,json,sys,time
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');v=sys.argv[1];D=T/(v+'-checkout')
files=['src/integrations/family/FamilyTripBoundary.test.tsx','src/integrations/family/FamilyPlannerBoundary.test.tsx','src/integrations/family/FamilyGenericMapBridge.test.tsx','src/integrations/family/FamilyExploreHost.test.tsx','src/integrations/family/legacy/components/Planner/family/familyDayTimeline.test.ts']
if v=='candidate':files+=['src/integrations/family/controllerItineraryActions.test.ts']
cmd=[str(W/'node_modules/.bin/vitest'),'run',*files,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+str(T/(v+'-tests.json')),*(['--coverage.enabled']if v=='candidate'else[]),'--coverage.include=src/integrations/family/legacy/pages/familyTripWorkspace/controllerItineraryActions.ts','--coverage.reporter=json','--coverage.reporter=json-summary','--coverage.reporter=text','--coverage.reportsDirectory='+str(T/(v+'-coverage'))]
env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
for key in list(env):
 if key.startswith('FAMILY_')and('FIXTURE'in key or'LIVE'in key):env.pop(key)
start=time.monotonic()
with(T/(v+'-tests.log')).open('w')as log:r=subprocess.run(cmd,cwd=D/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
out={'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'files':files,'command':cmd,'thresholds_unchanged':85}
if(T/(v+'-tests.json')).exists():
 j=json.loads((T/(v+'-tests.json')).read_text());out.update({k:j[k]for k in ['numPassedTests','numFailedTests','numTotalTests']})
(T/(v+'-result.json')).write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k not in ['files','command']}))
