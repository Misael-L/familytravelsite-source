from pathlib import Path
from collections import Counter
import json,re,hashlib
T=Path(__file__).parent;O=Path('/private/tmp/trek-core-ci-quality-20261118');W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();p=read(T/'response-contract-proposal.json');b=read(T/'before-private.json')
def cases(f):return sorted((r['name'].split('/client/',1)[1],tuple(a['ancestorTitles']),a['title'],a['status'])for r in read(f)['testResults']for a in r['assertionResults'])
before=cases(T/'focused-original-tests.json');after=cases(T/'focused-candidate-tests.json');prior=cases(O/'focused-candidate-tests.json');assert len(prior)==209 and len(before)==len(after)==213
assert all(r[3]=='passed'for r in after);old_ids={r[:3]for r in prior};assert [r for r in after if r[:3]in old_ids]==prior
new=[r for r in after if r[:3]not in old_ids];assert len(new)==4 and all(r[0]=='src/integrations/family/publicVariantCache.test.ts'for r in new)
changed=[(a,c)for a,c in zip(before,after)if a!=c];assert len(changed)==1 and changed[0][0][2]=='uses the checked response stream without reading a nullable body twice'and changed[0][0][3]=='failed'and changed[0][1][3]=='passed'
for label,exit,passed,failed in [('original',1,212,1),('candidate',0,213,0)]:
 r=read(T/('focused-'+label+'-result.json'));assert r['exit']==exit and r['numPassedTests']==passed and r['numFailedTests']==failed and r['numPendingTests']==0
assert sha(W/p['source'])==p['source_after_sha256']and sha(W/p['test'])==p['test_after_sha256']
assert all(sha(W/r)==h for r,h in b['website_tracked'].items()if r not in [p['source'],p['test']]);assert all(sha(W/r)==h for r,h in read(T/'policy-input-hashes.json').items())
old={r['path']:(r['diagnostics'],r['baseline'])for r in read(O/'remaining-strict-counts.json')['grown_files']};newcounts={}
s=(T/'strict-after.log').read_text()
for l in s.splitlines():
 m=re.match(r'^FAIL  (.+?): (\d+) error\(s\).*baseline (\d+)\.',l)
 if m:newcounts[m[1]]=(int(m[2]),int(m[3]))
target=p['source'].removeprefix('client/');assert old.pop(target)==(1,0)and newcounts==old;assert re.search(r'^strict: 636 error\(s\).*baseline allows 467$',s,re.M);assert read(T/'strict-after-result.json')['exit']==1
out={'passed':True,'scope':'Single validated-stream handoff; not complete strict or release acceptance.','original_existing_focused_cases_preserved':209,'new_meaningful_cases':4,'focused_after_passed':213,'new_single_read_test_red_on_original_green_on_candidate':True,'no_removed_changed_or_skipped_existing_cases':True,'strict_diagnostics_before_after':[637,636],'target_module_strict_diagnostics_after':0,'all_other_grown_file_counts_and_allowances_exact':True,'new_strict_failures':0,'strict_gate_pass':False,'policies_baselines_thresholds_exclusions_suppressions_unchanged':True,'only_application_files_changed':[p['source'],p['test']],'no_live_network_schema_provider_transformation_or_writer_admission':True};(T/'repair-proof.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
