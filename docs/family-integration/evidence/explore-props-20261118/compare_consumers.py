from pathlib import Path
import json,hashlib
T=Path(__file__).parent;D=T/'candidate-checkout';b=json.loads((T/'before-private.json').read_text());proof=json.loads((T/'prototype-proof.json').read_text());view,new=json.loads((T/'application-paths.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();suites=json.loads((T/'consumer-suite-paths.json').read_text());combined=[];counts={}
for package in suites:
 def cases(mode):
  j=json.loads((T/(mode+'-'+package+'-tests.json')).read_text());return sorted((r['name'].split('/'+package+'/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults'])
 a=cases('original');c=cases('candidate');assert a==c and all(r[-1]=='passed'for r in c);counts[package]=len(c);combined.extend((package,*r)for r in c)
 for mode in ['original','candidate']:
  r=next(r for r in json.loads((T/(mode+'-result.json')).read_text())if r['package']==package);assert r['exit']==0 and r['numPassedTests']==len(c)and r['numFailedTests']==r['numPendingTests']==0
assert counts=={'client':300,'family-backend':67};assert all(sha(D/p)==h for p,h in b['website_tracked'].items()if p!=view);assert sha(D/view)==proof['prototype_sha256']and sha(D/new)==proof['new_type_sha256']
r={'passed':True,'same_expanded_cases_before_after':len(combined),'package_counts':counts,'same_raw_names_files_ancestors_status_and_multiplicity':True,'no_label_normalization_required':True,'expanded_cases_sha256':hashlib.sha256(json.dumps(combined,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),'all_other_tracked_prototype_files_exact':len(b['website_tracked'])-1,'only_one_component_type_boundary_and_new_type_file':True,'assertions_mocks_fixtures_config_timeouts_skips_and_coverage_unchanged':True,'no_live_backend_browser_or_writer_admission':True};(T/'consumer-proof.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
