from pathlib import Path
import json,os,subprocess,time,sys
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');v=sys.argv[1];D=T/(v+'-checkout') if (T/(v+'-checkout')).exists() else W;paths=['src/components/Planner/PlaceInspector.test.tsx', 'src/components/Planner/PlaceDetailsColumn.test.tsx', 'src/components/Planner/usePlaceGallery.test.ts', 'src/mobile/screens/trip/sheets/MPlaceSheet.test.tsx', 'tests/unit/mobile/trip/MPlaceSheet.test.tsx', 'tests/unit/mobile/trip/MPlaceEditSheet.test.tsx', 'src/integrations/family/planLocations.test.tsx', 'src/integrations/family/identity.test.ts', 'src/integrations/family/directWriteSession.test.ts', 'src/integrations/family/FamilyExploreHost.test.tsx', 'src/integrations/family/FamilyGenericMapBridge.test.tsx', 'src/integrations/family/legacy/components/Explore/ExploreEntityDetailPanel.test.tsx', 'src/integrations/family/legacy/components/Map/ExplorePoiPartialCard.test.tsx', 'src/integrations/family/publicVariantProjection.test.ts', 'src/integrations/family/publicVariantImages.test.ts', 'src/repo/placeImageLease.test.ts', 'src/components/shared/PlaceAvatar.imageLease.test.tsx', 'src/components/Planner/usePlaceImageField.test.ts', 'src/components/Planner/placeImageChoice.test.ts', 'tests/unit/scripts/family-scanner-ownership.test.ts']
cmd=[str(W/'node_modules/.bin/vitest'),'run',*paths,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+str(T/(v+'-tests.json'))];env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
for key in list(env):
 if key.startswith('FAMILY_')and('FIXTURE'in key or'LIVE'in key):env.pop(key)
start=time.monotonic()
with(T/(v+'-tests.log')).open('w')as log:r=subprocess.run(cmd,cwd=D/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
out={'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'files':paths,'command':cmd,'controlled_ports_only':True,'coverage_not_enabled_or_claimed':True}
if(T/(v+'-tests.json')).exists():
 j=json.loads((T/(v+'-tests.json')).read_text());out.update({k:j[k]for k in ['numPassedTests','numFailedTests','numPendingTests','numTotalTests']})
(T/(v+'-result.json')).write_text(json.dumps(out,indent=2)+'\n');print(v,json.dumps({k:v for k,v in out.items()if k not in ['files','command']}))
