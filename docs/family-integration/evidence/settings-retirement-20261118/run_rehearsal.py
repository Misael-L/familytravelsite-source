from pathlib import Path
import json,os,subprocess,time,sys
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');v=sys.argv[1];D=T/(v+'-checkout') if (T/(v+'-checkout')).exists() else W;paths=['src/pages/SettingsPage.test.tsx', 'src/components/Settings/AccountTab.test.tsx', 'src/components/Settings/useAccountSettings.test.tsx', 'src/components/Settings/AccountDemoLock.test.tsx', 'src/components/Settings/IntegrationsTab.test.tsx', 'src/components/Settings/useIntegrationGates.test.ts', 'src/components/Settings/useMcpIntegration.test.ts', 'tests/unit/mobile/settings/MSettingsAccount.test.tsx', 'tests/unit/mobile/settings/MSettingsIntegrations.test.tsx', 'tests/unit/mobile/settings/MSettingsMcp.test.tsx', 'tests/unit/mobile/settings/MScopeGroupPicker.test.tsx', 'src/integrations/family/logoutRecovery.test.tsx', 'src/integrations/family/retainedRecovery.test.tsx', 'src/integrations/family/authContinuations.test.ts', 'src/integrations/family/applicationHandler.test.ts', 'src/integrations/family/directWriteSession.test.ts', 'src/store/authStore.validation.test.ts', 'tests/unit/stores/settingsStore.test.ts', 'tests/unit/scripts/family-scanner-ownership.test.ts', 'tests/unit/family/secretScan.test.ts']
cmd=[str(W/'node_modules/.bin/vitest'),'run',*paths,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+str(T/(v+'-tests.json'))];env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
for key in list(env):
 if key.startswith('FAMILY_')and('FIXTURE'in key or'LIVE'in key):env.pop(key)
start=time.monotonic()
with(T/(v+'-tests.log')).open('w')as log:r=subprocess.run(cmd,cwd=D/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
out={'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'files':paths,'command':cmd,'controlled_ports_only':True,'coverage_not_enabled_or_claimed':True}
if(T/(v+'-tests.json')).exists():
 j=json.loads((T/(v+'-tests.json')).read_text());out.update({k:j[k]for k in ['numPassedTests','numFailedTests','numPendingTests','numTotalTests']})
(T/(v+'-result.json')).write_text(json.dumps(out,indent=2)+'\n');print(v,json.dumps({k:v for k,v in out.items()if k not in ['files','command']}))
