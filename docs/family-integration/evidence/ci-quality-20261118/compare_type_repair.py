from pathlib import Path
from collections import Counter
import json,re,hashlib
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();proposal=read(T/'type-flow-proposal.json');before=read(T/'before-private.json');selected={r['path']for r in proposal['files']}
def cases(label):
 j=read(T/('focused-'+label+'-tests.json'));return sorted((r['name'].split('/client/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults'])
a,c=cases('original'),cases('candidate');assert a==c and len(c)==209 and all(r[3]=='passed'for r in c)
for label in ['original','candidate']:
 r=read(T/('focused-'+label+'-result.json'));assert r['exit']==0 and r['numPassedTests']==209 and r['numFailedTests']==r['numPendingTests']==0
assert all(sha(W/p)==h for p,h in before['website_tracked'].items()if p not in selected);assert all(sha(W/r['path'])==r['after_sha256']and r['transpiled_JS_byte_exact']for r in proposal['files']);assert all(sha(W/p)==h for p,h in read(T/'policy-input-hashes.json').items())
def grown(name):
 rows={}
 for l in(T/name).read_text().splitlines():
  m=re.match(r'^FAIL  (.+?): (\d+) error\(s\).*baseline (\d+)\.',l)
  if m:rows[m[1]]={'count':int(m[2]),'baseline':int(m[3])}
 return rows
old,new=grown('strict.log'),grown('strict-after.log');assert all(p in old and row['count']<=old[p]['count']and row['baseline']==old[p]['baseline']for p,row in new.items())
oldtotal=int(re.search(r'strict: (\d+) error', (T/'strict.log').read_text())[1]);newtotal=int(re.search(r'strict: (\d+) error', (T/'strict-after.log').read_text())[1]);changes=[]
for p,row in old.items():
 now=new.get(p,{'count':0,'baseline':row['baseline']})['count']
 if now!=row['count']:changes.append({'path':p,'before':row['count'],'after':now})
assert new.get('src/integrations/family/publicVariantCache.ts',{}).get('count')==1
for p in selected-{'client/src/integrations/family/publicVariantCache.ts'}:assert p.removeprefix('client/')not in new
assert oldtotal-newtotal==64 and sum(r['before']-r['after']for r in changes)==64
assert read(T/'strict-after-result.json')['exit']==1
out={'passed':True,'scope':'Five explicit callable throw-helper signatures; no runtime or policy change. Strict gate remains failing on other files.','focused_cases_before_after':[209,209],'all_case_identities_outcomes_and_multiplicities_exact':True,'no_skipped_added_removed_or_modified_tests':True,'transpiled_JS_in_all_five_modules_byte_exact':True,'only_source_changes':sorted(selected),'strict_total_before_after':[oldtotal,newtotal],'strict_errors_resolved':64,'strict_changed_files':changes,'new_strict_failures':0,'strict_gate_pass':False,'baseline_allows_unchanged':467,'all_other_tracked_bytes_exact_before_qualification':len(before['website_tracked'])-5,'all_policy_rules_baselines_exclusions_suppressions_exact':True};(T/'type-repair-proof.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
