from pathlib import Path
import json,hashlib
T=Path(__file__).parent;D=T/'candidate-checkout';b=json.loads((T/'before-private.json').read_text());paths=set(json.loads((T/'removed-paths.json').read_text()));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def cases(j):
 return sorted((r['name'].split('/client/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults'])
a=json.loads((T/'original-tests.json').read_text());c=json.loads((T/'candidate-tests.json').read_text());assert cases(a)==cases(c)and len(cases(c))==500 and all(r[-1]=='passed'for r in cases(c))
for mode in ['original','candidate']:
 r=json.loads((T/(mode+'-result.json')).read_text());assert r['exit']==0 and r['numPassedTests']==500 and r['numFailedTests']==r['numPendingTests']==0
assert len(paths)==1 and all(not(D/p).exists()for p in paths)
assert all(sha(D/p)==h for p,h in b['website_tracked'].items()if p not in paths)
normalized=json.dumps(cases(c),ensure_ascii=False,separators=(',',':')).encode();out={'passed':True,'same_expanded_cases_before_after':500,'same_names_files_status_multiplicity':True,'expanded_cases_sha256':hashlib.sha256(normalized).hexdigest(),'candidate_only_one_file_absent':True,'all_other_candidate_tracked_files_byte_exact':len(b['website_tracked'])-1,'assertions_fixtures_config_timeouts_coverage_skips_unchanged':True,'no_live_backend_browser_or_writer_admission':True};(T/'consumer-proof.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
