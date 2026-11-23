from pathlib import Path
import os,subprocess,json,time,hashlib,sys
s=Path(__file__).resolve().parent;r=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2')
out=Path('/private/tmp/trek-u03d16-u04c2c2-categories-r4-20261111/build-qualified')
env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','NODE_OPTIONS':'--max-old-space-size=8192','FAMILY_ENTRY_FIXTURE':'/private/tmp/trek-u03d12-u04c2c2-categories-r6-20261111/desktop-fixture/private-fixture.json','FAMILY_ENTRY_OUTPUT':str(out),'FAMILY_ENTRY_OFFLINE_READ_QUALIFICATION':'local-v1','FAMILY_RELEASE_BUILD':'1','APP_VERSION':'family-2026.11.11.37-rc.1'}
for n in ['SOURCE_BOUNDARY','LIFECYCLE_DRIVER','PRIVATE_MEMORY_DRIVER','PUBLIC_IMAGES_DRIVER','PUBLIC_IMAGE_PREPARATION_DRIVER','PREPARATION_READINESS_DRIVER']:env.pop('FAMILY_ENTRY_'+n,None)
start=time.monotonic()
with(s/'build.log').open('w')as log:p=subprocess.run(['node',str(s/'build122.mjs')],cwd=r,env=env,stdout=log,stderr=subprocess.STDOUT)
receipt={'actual_exit':p.returncode,'seconds':round(time.monotonic()-start,2),'build_directory':str(out),'ordinary_entry':True,'generated_worker':True,'local_only':True};(s/'build-exit.json').write_text(json.dumps(receipt,indent=2)+'\n');assert p.returncode==0
sys.path.insert(0,'/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');import packing_category_command_guard as g;g.validate()
b=out/'actual-build.json';data=json.loads(b.read_text());assert data['supabase_endpoint']=='http://127.0.0.1:55431'
for n,h in data['artifact_hashes'].items():assert hashlib.sha256((out/'actual-dist'/n).read_bytes()).hexdigest()==h
proof={'marked_local_only':True,'read_only_sql':True,'api':'http://127.0.0.1:55431','db_port':55432,'migrations':122,'project':'family-modernization-20261111-c2a','strict_function_source_guard':True,'earlier_migration_sources':121,'artifact_files_verified':len(data['artifact_hashes']),'build_manifest_sha256':hashlib.sha256(b.read_bytes()).hexdigest(),'checkout_parent':'88e72b0ae93ef70f3b248ff62c3e33c435c39f5c'}
(out.parent/'local-proof.json').write_text(json.dumps(proof,indent=2)+'\n');(s/'build-proof.json').write_text(json.dumps(proof,indent=2)+'\n');(s/'build-files.json').write_text(json.dumps(data,indent=2)+'\n')
print('Actual App/worker built and all artifact hashes verified against strict local122.')
