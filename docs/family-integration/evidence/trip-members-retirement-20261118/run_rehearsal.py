from pathlib import Path
import json,os,subprocess,time,sys
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');v=sys.argv[1];D=T/(v+'-checkout') if (T/(v+'-checkout')).exists() else W;paths=['src/components/Trips/TripMembersModal.test.tsx', 'src/pages/TripPlannerPage.test.tsx', 'src/pages/TripPlannerPage.wiring.test.tsx', 'src/integrations/family/shareLinkSession.test.tsx', 'src/integrations/family/authContinuations.test.ts', 'src/integrations/family/directWriteSession.test.ts', 'src/native/shareLink.test.ts', 'src/utils/clipboard.test.ts', 'src/utils/safeUrl.test.ts', 'tests/unit/mobile/trip/MTripSheets.members.test.tsx', 'tests/unit/mobile/trip/MTripSettingsSheet.test.tsx', 'tests/unit/mobile/trip/MTripSheets.test.tsx', 'tests/unit/stores/permissionsStore.test.ts', 'tests/unit/stores/authStore.test.ts', 'src/store/authStore.validation.test.ts', 'src/components/shared/dialogFocus.test.tsx', 'src/components/shared/DialogShell.test.tsx', 'src/components/shared/Modal.test.tsx', 'tests/unit/scripts/family-scanner-ownership.test.ts']
cmd=[str(W/'node_modules/.bin/vitest'),'run',*paths,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+str(T/(v+'-tests.json'))];env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
for key in list(env):
 if key.startswith('FAMILY_')and('FIXTURE'in key or'LIVE'in key):env.pop(key)
start=time.monotonic()
with(T/(v+'-tests.log')).open('w')as log:r=subprocess.run(cmd,cwd=D/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
out={'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'files':paths,'command':cmd,'controlled_ports_only':True,'coverage_not_enabled_or_claimed':True}
if(T/(v+'-tests.json')).exists():
 j=json.loads((T/(v+'-tests.json')).read_text());out.update({k:j[k]for k in ['numPassedTests','numFailedTests','numPendingTests','numTotalTests']})
(T/(v+'-result.json')).write_text(json.dumps(out,indent=2)+'\n');print(v,json.dumps({k:v for k,v in out.items()if k not in ['files','command']}))
