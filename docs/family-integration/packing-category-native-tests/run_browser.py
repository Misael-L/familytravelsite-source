from pathlib import Path
import os,subprocess,json,time
s=Path(__file__).resolve().parent;r=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2')
out=Path('/private/tmp/trek-u03d16-u04c2c2-browser-r5-20261111');assert not out.exists();out.mkdir(mode=0o700)
env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','FAMILY_OFFLINE_INVENTORY_ROOT':str(r/'client'),'FAMILY_OFFLINE_INVENTORY_DIST':'/private/tmp/trek-u03d16-u04c2c2-categories-r4-20261111/build-qualified/actual-dist','FAMILY_OFFLINE_INVENTORY_LOCAL_PROOF':'/private/tmp/trek-u03d16-u04c2c2-categories-r4-20261111/local-proof.json','FAMILY_OFFLINE_INVENTORY_MODE':'controls','FAMILY_OFFLINE_INVENTORY_COMPLETE':'1'}
receipts={}
for profile in ['desktop','phone']:
 start=time.monotonic()
 with(s/(profile+'-browser.log')).open('w')as log:p=subprocess.run(['node',str(s/'packing-category-browser-driver.mjs')],cwd=r,env={**env,'FAMILY_OFFLINE_INVENTORY_PROFILE':profile,'FAMILY_OFFLINE_INVENTORY_FIXTURE':'/private/tmp/trek-u03d12-u04c2c2-categories-r6-20261111/'+profile+'-fixture/private-fixture.json','FAMILY_OFFLINE_INVENTORY_OUTPUT':str(out/profile)},stdout=log,stderr=subprocess.STDOUT)
 receipts[profile]={'actual_exit':p.returncode,'seconds':round(time.monotonic()-start,2),'directory':str(out/profile)};(s/'browser-exits.json').write_text(json.dumps(receipts,indent=2)+'\n');print(profile,p.returncode,flush=True)
 if p.returncode:break
assert len(receipts)==2 and all(x['actual_exit']==0 for x in receipts.values())
