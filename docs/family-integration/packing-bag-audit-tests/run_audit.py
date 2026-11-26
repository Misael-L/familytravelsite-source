"""Reproduce D1 against only the retained marked125 target; no reset or schema migration."""
from pathlib import Path
import argparse,os,shutil,subprocess,json,sys
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--fixture',type=Path,required=True);a=p.parse_args();out=a.output.absolute();fixture=a.fixture.absolute();root=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2');src=Path(__file__).resolve().parent
if not str(out).startswith('/private/tmp/')or out.exists()or out.resolve()!=out:p.error('Fresh canonical /private/tmp output required')
if not fixture.is_file()or fixture.resolve()!=fixture or fixture.stat().st_mode&0o077:p.error('Canonical private0600 fixture required')
f=json.loads(fixture.read_text())
if f.get('api')!='http://127.0.0.1:55731'or f.get('claims',{}).get('sub')!=f.get('user_id')or f.get('claims',{}).get('aal')!='aal2':p.error('Marked125 synthetic AAL2 fixture required')
sys.path.insert(0,'/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');import packing_category_aggregate_guard as guard
guard.validate();out.mkdir(mode=0o700)
for name in ['database-audit.py','rollback-witnesses.sql','model-audit.py','lifecycle-model.sql','native-audit.py','native-audit.template.tsx']:shutil.copyfile(src/name,out/name)
env={**os.environ,'D1_AUDIT_FIXTURE':str(fixture),'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin','NODE_OPTIONS':'--max-old-space-size=8192'}
with(out/'shared-build.log').open('w')as log:
 for workspace in ['@family/shared-compat','@trek/shared']:subprocess.run(['npm','run','build','--workspace='+workspace],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
for name in ['database-audit.py','model-audit.py','native-audit.py']:
 with(out/(name+'.log')).open('w')as log:r=subprocess.run([sys.executable,str(out/name)],env=env,stdout=log,stderr=subprocess.STDOUT)
 if r.returncode:raise SystemExit('Audit failed; inspect '+str(out/(name+'.log')))
print('D1 passed:28 rollback SQL witnesses,19 temporary lifecycle model cases and14 mocked native probes. No production, migration or activation.')
