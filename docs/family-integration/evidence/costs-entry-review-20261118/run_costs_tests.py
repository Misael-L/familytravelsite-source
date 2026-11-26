from pathlib import Path
import json,os,subprocess,time
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');paths=['src/components/Budget','tests/unit/mobile/trip/MCostsTab.test.tsx','tests/unit/mobile/trip/MCostSheet.test.tsx','tests/unit/mobile/trip/costsModel.test.ts','src/integrations/family/expenseDraft.test.ts','src/integrations/family/tripExpenses.payers.test.ts','src/integrations/family/plannerApplicationReads.test.ts','src/integrations/family/FamilyPlannerBoundary.test.tsx','src/integrations/family/directWriteSession.test.ts','src/integrations/family/completeTripRead.test.ts']
cmd=[str(W/'node_modules/.bin/vitest'),'run',*paths,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+str(T/'costs-tests.json')];env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
for key in list(env):
 if key.startswith('FAMILY_')and('FIXTURE'in key or'LIVE'in key):env.pop(key)
start=time.monotonic()
with(T/'costs-tests.log').open('w')as log:r=subprocess.run(cmd,cwd=W/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
out={'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'files':paths,'command':cmd,'controlled_ports_only':True,'coverage_not_enabled_or_claimed':True}
if(T/'costs-tests.json').exists():
 j=json.loads((T/'costs-tests.json').read_text());out.update({k:j[k]for k in ['numPassedTests','numFailedTests','numPendingTests','numTotalTests']})
(T/'costs-result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k not in ['files','command']}))
