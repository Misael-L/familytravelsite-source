from pathlib import Path
import subprocess,os,json,hashlib,time
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();policy=json.loads((T/'policy-input-hashes.json').read_text());declarations={str(p):sha(p)for name in ['shared','family-shared','family-backend']for p in(W/name/'dist').rglob('*')if p.is_file()and(p.name.endswith('.d.ts')or p.name.endswith('.d.mts')or p.name.endswith('.d.cts'))};assert len(declarations)==128
(T/'declaration-input-hashes.json').write_text(json.dumps(declarations,indent=2)+'\n');env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=6144'};results=[]
for name in ['strict','pages','rtl','layers','offline','dup','pairs','skips','i18n-keys']:
 start=time.monotonic()
 with(T/(name+'.log')).open('w')as log:r=subprocess.run(['npm','run','lint:'+name],cwd=W/'client',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
 assert all(sha(W/p)==h for p,h in policy.items())and all(sha(Path(p))==h for p,h in declarations.items())
 text=(T/(name+'.log')).read_text();lines=text.splitlines();fail=[l for l in lines if l.startswith('FAIL')];row={'name':name,'command':'npm run lint:'+name,'exit':r.returncode,'seconds':round(time.monotonic()-start,2),'failure_lines':len(fail),'last_summary':lines[-1]if lines else '', 'policy_and_128_declaration_inputs_exact':True};results.append(row);(T/'quality-results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(row),flush=True)
(T/'quality-complete.json').write_text(json.dumps({'all_nine_checks_attempted':len(results)==9,'passed':all(r['exit']==0 for r in results),'passed_commands':[r['name']for r in results if r['exit']==0],'failed_commands':[r['name']for r in results if r['exit']!=0],'no_source_policy_baseline_or_declaration_change':True},indent=2)+'\n')
