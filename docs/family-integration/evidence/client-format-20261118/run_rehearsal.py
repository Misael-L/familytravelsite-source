from pathlib import Path
import json,os,subprocess,sys,time
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');v=sys.argv[1];D=T/(v+'-checkout')if(T/(v+'-checkout')).exists()else W
names=['creationTerminalSettlement.test.ts','creationTerminalRecovery.test.tsx','creationArchiveLifecycle.test.ts','creationTerminalTransport.test.ts','plannerReadGuard.test.ts','plannerTaskRecovery.test.tsx','retainedRecovery.test.tsx','originalWorkExport.test.ts','familyOriginalWorkExport.test.ts','logoutRecovery.test.tsx','queueRecoverySession.test.ts','crossTabQueueSession.test.tsx','plannerCompleteStorage.test.ts','plannerCacheRetirement.test.ts','nativeSourceOwnership.test.ts','completeTripRead.test.ts','packingRecoveryActions.test.tsx','packingNativeRecoveryActions.test.tsx','plannerPackingRecovery.test.tsx','packingTerminalSettlement.test.ts','packingBagTerminalSettlement.test.ts','adminPluginBoundary.test.tsx'];files=['src/integrations/family/'+n for n in names]+['src/components/Settings/OfflineTab.test.tsx'];assert all((D/'client'/p).exists()for p in files)
cmd=[str(W/'node_modules/.bin/vitest'),'run',*files,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+str(T/(v+'-tests.json'))];env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
for k in list(env):
 if k.startswith('FAMILY_')and('LIVE'in k or'FIXTURE'in k):env.pop(k)
start=time.monotonic()
with(T/(v+'-tests.log')).open('w')as log:r=subprocess.run(cmd,cwd=D/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
out={'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'files':files,'command':cmd,'controlled_ports_only':True,'new_coverage_or_live_backend_acceptance':False}
if(T/(v+'-tests.json')).exists():
 j=json.loads((T/(v+'-tests.json')).read_text());out.update({k:j[k]for k in ['numPassedTests','numFailedTests','numPendingTests','numTotalTests']})
(T/(v+'-result.json')).write_text(json.dumps(out,indent=2)+'\n');print(v,json.dumps({k:v for k,v in out.items()if k not in['files','command']}))
