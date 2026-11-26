from pathlib import Path
import json,subprocess,os,time,sys
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');label=sys.argv[1];paths=['src/components/Collections/useCollectionSharing.test.ts','src/components/Collections/useCollectionSharing.lifetime.test.tsx','src/components/Collections/collectionSharing.consumers.test.tsx','src/components/Collections/collectionSharing.gates.test.ts','src/components/Collections/ShareCollectionModal.test.tsx','src/store/collectionStore.test.ts','tests/unit/scripts/offline-lint.test.ts','src/components/Collections/collectionSharing.read-boundary.test.tsx']
if label=='candidate':paths+=['src/repo/collectionSharingRepo.test.ts']
env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
for k in list(env):
 if k.startswith('FAMILY_')and('LIVE'in k or'FIXTURE'in k):env.pop(k)
start=time.monotonic();cmd=[str(W/'node_modules/.bin/vitest'),'run',*paths,'--maxWorkers=2','--reporter=json','--outputFile='+str(T/(label+'-tests.json'))]
with(T/(label+'-tests.log')).open('w')as log:r=subprocess.run(cmd,cwd=W/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
j=json.loads((T/(label+'-tests.json')).read_text());out={'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'paths':paths,**{k:j[k]for k in ['numPassedTests','numFailedTests','numPendingTests','numTotalTests']}};(T/(label+'-result.json')).write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out));assert r.returncode==(1 if label=='original'else 0)
