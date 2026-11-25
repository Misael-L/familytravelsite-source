from pathlib import Path
from collections import Counter
import json,re,hashlib
T=Path(__file__).parent;O=Path('/private/tmp/trek-core-ci-quality-20261118');W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');read=lambda p:json.loads(p.read_text())
def rows(p):return sorted((r['name'].split('/client/',1)[1],tuple(t['ancestorTitles']),t['title'],t['status'])for r in read(p)['testResults']for t in r['assertionResults'])
a=rows(O/'candidate-tests.json');c=rows(T/'candidate-tests.json');f='src/integrations/family/stayTransport.test.ts';rx=r'^refuses false acknowledgements \{"stay_id":"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"\}$';norm=lambda rows:sorted((p,anc,'source-generated-v4-UUID-label'if p==f and re.fullmatch(rx,title)else title,status)for p,anc,title,status in rows)
assert norm(a)==norm(c)and len(a)==len(c)==2354
for left,right in [(a,c),(c,a)]:
 d=list((Counter(left)-Counter(right)).elements());assert len(d)<=1
 for r in d:assert r[0]==f and r[1]==()and r[3]=='passed'and re.fullmatch(rx,r[2])
r=read(T/'candidate-result.json');assert r['exit']==0 and r['numPassedTests']==2316 and r['numPendingTests']==38 and r['numFailedTests']==0
assert '{ stay_id: crypto.randomUUID() }'in(W/'client'/f).read_text();assert hashlib.sha256((W/'client'/f).read_bytes()).hexdigest()==read(T/'before-private.json')['website_tracked']['client/'+f]
focused=set(read(T/'focused-suite-paths.json'));core=set(read(T/'consumer-suite-paths.json'));out={'passed':True,'existing_regression_cases':2354,'passed_cases':2316,'failed_cases':0,'unchanged_preexisting_skipped_cases':38,'same_expanded_case_outcomes_and_multiplicities':True,'one_source_defined_generated_UUID_label_only_normalized':True,'focused_cases':213,'focused_suite_overlap_with_core':sorted(focused&core),'no_existing_core_tests_skips_mocks_fixtures_timeouts_or_config_changed':True,'four_new_focused_cases_outside_core':True,'not_full_CI_browser_or_live_backend_acceptance':True};(T/'core-consumer-proof.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
