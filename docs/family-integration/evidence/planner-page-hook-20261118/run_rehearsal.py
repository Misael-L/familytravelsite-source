from pathlib import Path
import subprocess,os,json,sys,time
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');v=sys.argv[1];D=T/(v+'-checkout')
files=['src/pages/tripPlanner/useTripPlannerPage.test.tsx','src/pages/tripPlanner/b4a-wiring.test.ts','src/pages/TripPlannerPage.wiring.test.tsx','src/pages/TripPlannerPage.tours.wiring.test.tsx','src/pages/TripPlannerPage.leftPanelTab.test.tsx','src/pages/tripPlanner/PlanMapStage.test.tsx','src/pages/tripPlanner/TourPlannerMapStage.test.tsx','src/pages/tripPlanner/usePlannerFocusPoints.test.ts','src/pages/tripPlanner/useMapLocationSearch.test.ts','src/pages/tripPlanner/useTourOverview.test.ts','src/hooks/usePlanMapViewport.test.ts']
cmd=[str(W/'node_modules/.bin/vitest'),'run',*files,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+str(T/(v+'-tests.json')),'--coverage.enabled','--coverage.include=src/pages/tripPlanner/useTripPlannerPage.ts','--coverage.reporter=json','--coverage.reporter=json-summary','--coverage.reporter=text','--coverage.reportsDirectory='+str(T/(v+'-coverage'))]
env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
for key in list(env):
 if key.startswith('FAMILY_')and('FIXTURE'in key or'LIVE'in key):env.pop(key)
start=time.monotonic()
with(T/(v+'-tests.log')).open('w')as log:r=subprocess.run(cmd,cwd=D/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
out={'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'files':files,'command':cmd,'thresholds_unchanged':85}
if(T/(v+'-tests.json')).exists():
 j=json.loads((T/(v+'-tests.json')).read_text());out.update({k:j[k]for k in ['numPassedTests','numFailedTests','numTotalTests']})
(T/(v+'-result.json')).write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k not in ['files','command']}))
