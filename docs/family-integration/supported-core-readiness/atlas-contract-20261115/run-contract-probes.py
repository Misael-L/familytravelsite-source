from pathlib import Path
import argparse,hashlib,json,os,re,subprocess

p=argparse.ArgumentParser()
p.add_argument('--repo',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--wanted',action='store_true')
a=p.parse_args()
W=a.repo.resolve();T=a.output.resolve()
assert T.parent==Path('/private/tmp') and T.name.startswith('trek-atlas-contract-')
assert T.is_dir() and T.stat().st_uid==os.getuid() and T.stat().st_mode&0o077==0
pin='8d6fd108fa628ebb0ff6992defee56afaea0e460'
roots=['client','server','shared','family-backend','family-shared']
subprocess.run(['git','diff','--quiet',pin,'--',*roots],cwd=W,check=True)
assert not subprocess.check_output(['git','ls-files','--others','--exclude-standard','--',*roots],cwd=W,text=True).strip()
assert subprocess.check_output(['node','--version'],text=True).startswith('v24.')
source=W/'client/src/pages/atlas/useAtlas.test.tsx'
prefix=source.read_text().split('const statsResponse =')[0]
def absolute(match):
    quote,rel=match.groups()
    return quote+str((source.parent/rel).resolve())+quote
prefix=re.sub(r"(['\"])(\.{1,2}/[^'\"]+)\1",absolute,prefix)
template=Path(__file__).with_name('atlas-diagnostics.template.tsx')
(T/'atlas-diagnostics.test.tsx').write_text(prefix+template.read_text().replace('__ROOT__',str(W)))
config="import base from "+json.dumps(str(W/'client/vitest.config.ts'))+";import {createRequire} from 'node:module';const require=createRequire("+json.dumps(str(W/'package.json'))+");const inherited=Array.isArray(base.resolve?.alias)?base.resolve.alias:Object.entries(base.resolve?.alias??{}).map(([find,replacement])=>({find,replacement}));const packages=['react','react-dom','react/jsx-runtime','react/jsx-dev-runtime','leaflet','@maplibre/maplibre-gl-leaflet'].map(find=>({find:new RegExp('^'+find.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+'$'),replacement:require.resolve(find)}));export default {...base,resolve:{...base.resolve,alias:[{find:/^vitest$/,replacement:"+json.dumps(str(W/'node_modules/vitest/dist/index.js'))+"},{find:/^msw$/,replacement:"+json.dumps(str(W/'node_modules/msw/lib/core/index.mjs'))+"},...packages,...inherited],dedupe:['vitest','react','react-dom','@testing-library/react']},test:{...base.test,root:"+json.dumps(str(W/'client'))+",include:["+json.dumps(str(T/'atlas-diagnostics.test.tsx'))+"]}};"
(T/'probes.config.mts').write_text(config)
stem='desired-contract' if a.wanted else 'diagnostics'
env={**os.environ,'NODE_OPTIONS':'--max-old-space-size=8192','ATLAS_CONTRACT_MODE':'wanted' if a.wanted else 'current'}
with(T/(stem+'.log')).open('w')as log:
    r=subprocess.run(['node',str(W/'node_modules/vitest/vitest.mjs'),'run','--config',str(T/'probes.config.mts'),'--maxWorkers=1','--reporter=json','--outputFile='+str(T/(stem+'-private.json'))],cwd=W/'client',env=env,stdout=log,stderr=log)
j=json.loads((T/(stem+'-private.json')).read_text())
receipt={k:j[k]for k in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests','success']}
receipt.update(exit_code=r.returncode,mode='wanted' if a.wanted else 'current',diagnostics_only_not_feature_acceptance=True,baseline=pin,native_mock_prefix_sha256=hashlib.sha256(prefix.encode()).hexdigest())
(T/(stem+'.json')).write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
raise SystemExit(r.returncode)
