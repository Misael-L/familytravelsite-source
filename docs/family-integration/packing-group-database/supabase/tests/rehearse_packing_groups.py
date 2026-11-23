"""Run the already-applied group contract on the marked disposable stack. Never resets/applies SQL."""
from pathlib import Path
import argparse, hashlib, json, os, re, subprocess, sys, time
from packing_group_guard import ROOT, validate, old_hashes, sql
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
out=a.output.resolve()
if not str(out).startswith('/private/tmp/') or out.exists():p.error('A new /private/tmp output directory is required')
validate();old_hashes()
if sql('select count(*)from supabase_migrations.schema_migrations')!='120':p.error('Exactly the reviewed120 local migrations are required; never reset a newer chain')
source=ROOT/'supabase/migrations/20261111201637_observed_trip_packing_groups.sql'
expected=json.loads((ROOT/'supabase/tests/packing_group_schema.json').read_text())
if hashlib.sha256(source.read_bytes()).hexdigest()!=expected['migration_sha256']:p.error('Migration source drift')
for signature,digest in expected['functions'].items():
 body=sql("select pg_get_functiondef('"+signature+"'::regprocedure)")
 if hashlib.sha256(body.encode()).hexdigest()!=digest:p.error('Reviewed database function drift: '+signature)
out.mkdir(mode=0o700)
env={**os.environ,'FAMILY_PACKING_GROUP_STAGE':str(out)};started=time.monotonic()
with(out/'database-tests.log').open('w')as log:run=subprocess.run([sys.executable,str(ROOT/'supabase/tests/packing_groups.py')],env=env,stdout=log,stderr=subprocess.STDOUT)
text=(out/'database-tests.log').read_text();cases=re.findall(r'^(test_\w+) \(.*\) \.\.\. ok$',text,re.M)
receipt={'actual_exit':run.returncode,'seconds':round(time.monotonic()-started,2),'passed_cases':len(cases),'test_names':cases,'marked_local_only':True,'schema_count':120,'migrations_applied_by_runner':False,'reset':False,'hosted_connections':False,'sql_sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items()if k!='test_names'}))
if run.returncode or len(cases)!=76:sys.exit(1)
