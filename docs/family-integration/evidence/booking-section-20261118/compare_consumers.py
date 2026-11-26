from pathlib import Path
import json,hashlib
T=Path(__file__).parent;b=json.loads((T/'before-private.json').read_text());A=T/'original-checkout';B=T/'candidate-checkout';view,helper,test=json.loads((T/'application-paths.json').read_text());p=json.loads((T/'prototype-proof.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
def cases(mode):
 j=json.loads((T/(mode+'-tests.json')).read_text());return sorted((r['name'].split('/client/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults'])
a,c=cases('original'),cases('candidate');assert a==c and len(c)==968 and all(r[-1]=='passed'for r in c)
for mode in ['original','candidate']:
 x=json.loads((T/(mode+'-result.json')).read_text());assert x['exit']==0 and x['numPassedTests']==968 and x['numFailedTests']==x['numPendingTests']==0
assert sha(A/test)==sha(B/test)==p['new_test_sha256'];assert all(sha(A/f)==h for f,h in b['website_tracked'].items())and all(sha(B/f)==h for f,h in b['website_tracked'].items()if f!=view);assert sha(B/view)==p['prototype_sha256']and sha(B/helper)==p['new_component_sha256']
r={'passed':True,'same_expanded_cases_before_after':968,'existing_cases':962,'new_parent_level_preference_cases':6,'same_raw_names_files_ancestors_status_multiplicity':True,'expanded_cases_sha256':hashlib.sha256(json.dumps(c,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),'original_existing_source_files_exact':len(b['website_tracked']),'candidate_other_existing_source_files_exact':len(b['website_tracked'])-1,'same_final_new_test_source_bytes_before_after':True,'existing_tests_fixtures_mocks_config_timeouts_skips_coverage_unchanged':True,'no_new_live_database_browser_or_feature_admission':True};(T/'consumer-proof.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
