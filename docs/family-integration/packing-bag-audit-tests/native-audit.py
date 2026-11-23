from pathlib import Path
import subprocess,os,json,time
s=Path(__file__).resolve().parent;r=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2')
test=s/'native-audit.test.tsx';test.write_text((s/'native-audit.template.tsx').read_text().replace('__ROOT__',str(r)))
config=s/'audit.config.mts';config.write_text("import base from '"+str(r/ 'client/vitest.config.ts')+"';\nexport default {...base, resolve: {...base.resolve, alias:[{find:/^vitest$/,replacement:'/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2/node_modules/vitest/dist/index.js'},...(Array.isArray(base.resolve?.alias)?base.resolve.alias:Object.entries(base.resolve?.alias??{}).map(([find,replacement])=>({find,replacement})))], dedupe:['vitest','react','react-dom','@testing-library/react']}, test:{...base.test, root:"+json.dumps(str(r/'client'))+", include:["+json.dumps(str(test))+"], reporters:['default']}};\n")
env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:/opt/homebrew/bin:/usr/bin:/bin','NODE_OPTIONS':'--max-old-space-size=8192'}
args=['node','../node_modules/vitest/vitest.mjs','run','--config',str(config),'--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+str(s/'native-audit.json')];start=time.monotonic()
with(s/'native-audit.log').open('w')as log:p=subprocess.run(args,cwd=r/'client',env=env,stdout=log,stderr=subprocess.STDOUT)
receipt={'actual_exit':p.returncode,'seconds':round(time.monotonic()-start,2),'command':args,'scope':'mocked native hook/view contract witnesses; not browser/Auth/write activation'}
(s/'native-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt));print((s/'native-audit.log').read_text()[-1500:]);assert p.returncode==0
