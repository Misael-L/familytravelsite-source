#!/usr/bin/env python3
"""Run an assigned check from its own worktree; serialize expensive checks on this Mac."""
from pathlib import Path
import argparse,datetime,fcntl,json,os,re,shutil,subprocess,sys
ROOT=Path(__file__).resolve().parents[3]
def die(message,code=2):
 print(message,file=sys.stderr);raise SystemExit(code)
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
p=argparse.ArgumentParser();p.add_argument('--lane',choices=['coordinator','worker-b'],required=True);p.add_argument('--packet',required=True);p.add_argument('--kind',choices=['preflight','tests','all-tests','strict','typecheck','lint','format','lease'],required=True);p.add_argument('--label',default='current');p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args()
plan=json.loads((ROOT/'docs/family-integration/parallel/plan.json').read_text());lane=plan['lanes'][a.lane]
if ROOT!=Path(lane['worktree']).resolve():die('Wrong worktree for this lane; do not switch the other chat’s branch.')
if git('branch','--show-current')!=lane['branch']:die('Wrong branch for this lane.')
if subprocess.run(['git','merge-base','--is-ancestor',plan['base_commit'],'HEAD'],cwd=ROOT).returncode:die('Required integration history is missing.')
packet=next((x for x in lane['packets']if x['id']==a.packet),None)
if not packet:die('Packet is outside this lane’s finite queue.')
if not re.fullmatch(r'[A-Za-z0-9_-]+',a.label):die('Invalid report label.')
bootstrap=ROOT/'.cache/family-parallel/bootstrap.json'
if not bootstrap.is_file():die('Prepared environment bootstrap receipt is missing; ask the coordinator.')
setup=json.loads(bootstrap.read_text())['setup_commit']
if subprocess.run(['git','merge-base','--is-ancestor',setup,'HEAD'],cwd=ROOT).returncode:die('Shared setup commit is missing from this branch.')
active=subprocess.run(['git','rev-parse','--show-toplevel'],cwd=Path.cwd(),capture_output=True,text=True)
if active.returncode or Path(active.stdout.strip()).resolve()!=ROOT:die('Run this check from the assigned worktree, not another project folder.')
if a.lane=='worker-b':
 allowed=set(lane['allowed_source_paths'])
 changed=set(git('diff','--name-only',setup,'HEAD').splitlines()+git('diff','--name-only').splitlines()+git('diff','--cached','--name-only').splitlines()+git('ls-files','--others','--exclude-standard').splitlines())
 # Setup files are shared immutable inputs; only setup-commit versions are admitted.
 for name in changed:
  if name in allowed or name=='docs/family-integration/parallel/worker-b-status.json'or name.startswith('docs/family-integration/parallel/worker-b-reports/'):continue
  die('Out-of-scope change: '+name+'. Preserve it, report it, and stop; do not revert unknown work.')
node=Path('/Users/Misael/.nvm/versions/node/v24.22.2/bin/node')
if not node.is_file():die('Pinned Node is unavailable; ask the coordinator before installing anything.')
version=subprocess.check_output([str(node),'--version'],text=True).strip()
if version!='v24.22.2':die('Pinned Node version mismatch.')
if a.kind=='preflight':
 print(json.dumps({'plan':plan['plan_id'],'lane':a.lane,'packet':a.packet,'root':str(ROOT),'branch':lane['branch'],'head':git('rev-parse','HEAD'),'node':version,'free_bytes_now':shutil.disk_usage(ROOT).free,'existing_baseline_is_not_global_quality_acceptance':True},indent=2));raise SystemExit(0)
if a.lane=='worker-b'and a.kind in ['typecheck','lease']:die('Worker B may not run builds/arbitrary commands or unassigned checks.')
selected=packet.get('tests',[])
if a.kind=='all-tests':selected=list(dict.fromkeys(t for x in lane['packets']for t in x.get('tests',[])))
if a.kind in ['tests','all-tests']and not selected:die('This packet has no assigned executable test cohort.')
cache=ROOT/'.cache/family-parallel'/a.packet;cache.mkdir(parents=True,exist_ok=True);stem=cache/(a.label+'-'+a.kind);cmd=[];cwd=ROOT/'client'
if a.kind in ['tests','all-tests']:cmd=[str(node),str(ROOT/'node_modules/vitest/vitest.mjs'),'run',*selected,'--maxWorkers=2','--reporter=json','--outputFile='+str(stem)+'.tests.json']
elif a.kind=='strict':cmd=[str(node),'scripts/strict-lint.mjs','--list']
elif a.kind=='typecheck':cmd=[str(node),str(ROOT/'node_modules/typescript/bin/tsc'),'--noEmit']
elif a.kind=='format':cmd=[str(node),str(ROOT/'node_modules/prettier/bin/prettier.cjs'),'--check',*[str(ROOT/x)for x in packet['source_paths']]]
elif a.kind=='lint':cmd=[str(node),str(ROOT/'node_modules/eslint/bin/eslint.js'),*[str(ROOT/x)for x in packet['source_paths']]]
else:
 cmd=a.command[1:]if a.command[:1]==['--']else a.command
 if not cmd:die('Coordinator lease needs an explicit command after --.')
 cwd=ROOT
heavy=a.kind in ['strict','typecheck','lint','lease'];lock=None
if heavy:
 folder=Path(plan['resource_lock']).parent;folder.mkdir(parents=True,exist_ok=True);lock=open(plan['resource_lock'],'a+')
 try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:
  lock.seek(0);die('Another expensive check holds the lease: '+lock.read()+'. Continue independent reading or retry later; do not delete the lock.',75)
 if shutil.disk_usage(ROOT).free<512*2**20:die('Less than512MiB immediately free. Report the capacity check; do not delete artifacts.',75)
 lock.seek(0);lock.truncate();json.dump({'lane':a.lane,'packet':a.packet,'kind':a.kind,'pid':os.getpid(),'root':str(ROOT),'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()},lock);lock.flush()
env={k:v for k,v in os.environ.items()if not(k.startswith('FAMILY_')and any(s in k for s in ['LIVE','FIXTURE']))};env['PATH']=str(node.parent)+os.pathsep+env.get('PATH','');env['NODE_OPTIONS']='--max-old-space-size=8192'
with open(str(stem)+'.log','w')as log:
 proc=subprocess.Popen(cmd,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
 try:code=proc.wait()
 except BaseException:
  proc.terminate()
  try:proc.wait(timeout=10)
  except subprocess.TimeoutExpired:proc.kill();proc.wait()
  raise
if lock:lock.close()
report={'lane':a.lane,'packet':a.packet,'kind':a.kind,'head':git('rev-parse','HEAD'),'command':cmd,'raw_exit_code':code,'log':str(stem)+'.log','global_quality_pass':False}
if a.kind=='strict':
 text=Path(str(stem)+'.log').read_text();headers={m.group(1):int(m.group(2))for m in re.finditer(r'^(.+?) \((\d+), baseline (\d+)\)$',text,re.M)};m=re.search(r'^strict: (\d+) error\(s\)',text,re.M)
 if not m:die('Strict command did not produce its expected summary; inspect the raw log.')
 report['global_scored_diagnostics']=int(m.group(1));report['packet_diagnostics']={x.removeprefix('client/'):headers.get(x.removeprefix('client/'),0)for x in packet['source_paths']};report['note']='Raw nonzero global strict exit is preserved. Packet-clean does not mean global quality passes.'
if a.kind in ['tests','all-tests']:
 data=json.loads(Path(str(stem)+'.tests.json').read_text());report['tests']={k:data[k]for k in ['numPassedTests','numFailedTests','numPendingTests','numTotalTests']}
Path(str(stem)+'.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));raise SystemExit(code)
