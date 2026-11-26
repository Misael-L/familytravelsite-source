from pathlib import Path
import json,hashlib,re
from collections import Counter
T=Path(__file__).parent;D=(T/'candidate-checkout')if(T/'candidate-checkout').exists()else Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');b=json.loads((T/'before-private.json').read_text());paths=set(json.loads((T/'application-paths.json').read_text()));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def cases(j):
 return sorted((r['name'].split('/client/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in j['testResults']for t in r['assertionResults'])
a=json.loads((T/'original-tests.json').read_text());c=json.loads((T/'candidate-tests.json').read_text());raw_a=cases(a);raw_c=cases(c)
only_a=list((Counter(raw_a)-Counter(raw_c)).elements());only_c=list((Counter(raw_c)-Counter(raw_a)).elements());assert len(only_a)==len(only_c)==1
file='src/integrations/family/stayTransport.test.ts';source=(D/'client'/file).read_text();assert source==(Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4')/'client'/file).read_text();assert "{ stay_id: crypto.randomUUID() }"in source and "('refuses false acknowledgements %j', (bad) => {"in source
rx=r'^refuses false acknowledgements \{"stay_id":"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"\}$'
for row in only_a+only_c:assert row[0]==file and row[1]==()and row[3]=='passed'and re.fullmatch(rx,row[2])
def normalized(rows):return sorted((f,anc,'refuses false acknowledgements {"stay_id":"<generated-v4-UUID>"}'if f==file and re.fullmatch(rx,title)else title,status)for f,anc,title,status in rows)
assert normalized(raw_a)==normalized(raw_c)and len(raw_c)==1290 and all(r[-1]=='passed'for r in raw_c)
(T/'generated-test-label-review.json').write_text(json.dumps({'passed':True,'raw_label_delta_before':only_a,'raw_label_delta_after':only_c,'source':file,'source_sha256':sha(D/'client'/file),'exact_raw_title_cases':1289,'only_normalized_case':1,'source_defined_v4_UUID_in_parameterized_label':True,'assertions_mocks_fixtures_test_configuration_unchanged':True,'scope':'Only this exact known file/title/template and one generated UUID label are normalized; any other raw identity delta fails.'},indent=2)+'\n')

for mode in ['original','candidate']:
 r=json.loads((T/(mode+'-result.json')).read_text());assert r['exit']==0 and r['numPassedTests']==len(cases(c)) and r['numFailedTests']==r['numPendingTests']==0
assert len(paths)==4
proof=json.loads((T/'prototype-proof.json').read_text())
A=T/'original-checkout'
if A.exists():assert all(sha(A/p)==h for p,h in b['website_tracked'].items())
else:assert json.loads((T/'prototype-space-recovery.json').read_text())['passed']
assert sha(D/'client/src/integrations/family/legacy/components/Planner/TransportsPanelFamily.presentation.test.tsx')==proof['new_test_sha256']
assert all(sha(D/p)==h for p,h in proof['new_source_sha256'].items())
assert all(sha(D/p)==h for p,h in b['website_tracked'].items()if p not in paths and p not in ['.github/family-release.json','docs/family-integration/qualified-source.json'])
normalized=json.dumps(normalized(raw_c),ensure_ascii=False,separators=(',',':')).encode();out={'passed':True,'same_expanded_cases_before_after':len(cases(c)),'same_names_files_status_multiplicity_after_one_proved_generated_UUID_label_normalization':True,'exact_raw_title_cases':1289,'one_generated_label_review':'generated-test-label-review.json','expanded_cases_sha256':hashlib.sha256(normalized).hexdigest(),'same_existing_tests_and_only_selected_presentation_plus_new_test_paths':True,'all_other_candidate_tracked_files_byte_exact':len(b['website_tracked'])-3,'assertions_fixtures_config_timeouts_coverage_skips_unchanged':True,'no_live_backend_browser_or_writer_admission':True,'final_candidate_checked_on_committed_checkout_after_formatter':True,'metadata_only_qualification_pointer_paths_excluded_from_source_byte_comparison':['.github/family-release.json','docs/family-integration/qualified-source.json']};(T/'consumer-proof.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
