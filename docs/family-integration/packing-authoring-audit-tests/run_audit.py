from pathlib import Path
import argparse,shutil,os,subprocess,json
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--fixture',type=Path,required=True);args=p.parse_args()
s=Path(__file__).resolve().parent;out=args.output.absolute();fixture=args.fixture.absolute()
if not str(out).startswith('/private/tmp/')or out.exists()or out.resolve()!=out:p.error('New canonical /private/tmp output required')
if not fixture.is_file()or fixture.resolve()!=fixture or fixture.stat().st_mode&0o077:p.error('Private canonical fixture file required')
data=json.loads(fixture.read_text())
if data.get('api')!='http://127.0.0.1:55431':p.error('Strict local122 fixture required')
out.mkdir(mode=0o700)
for name in ['database_audit.py','rollback-witnesses.sql','native_audit.py','native-audit.template.tsx','model_audit.py','lifecycle-model.sql']:shutil.copyfile(s/name,out/name)
env={**os.environ,'C3_AUDIT_FIXTURE':str(fixture)}
for name in ['database_audit.py','model_audit.py','native_audit.py']:
 with(out/(name+'.log')).open('w')as log:r=subprocess.run(['python3',str(out/name)],env=env,stdout=log,stderr=subprocess.STDOUT)
 if r.returncode:raise SystemExit('Audit failed; inspect '+str(out/(name+'.log')))
print('Audit passed: 16 rollback-only DB, 14 temporary-model and 12 mocked native contract witnesses. No migration or runtime activation.')
