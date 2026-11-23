from pathlib import Path
import subprocess,json,hashlib,re
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');O=Path('/private/tmp/trek-core-image-response-20261118');read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();b=read(T/'before-private.json');changed='client/scripts/feature-pairs.json';p=read(T/'registration-proof.json')
assert subprocess.check_output(['git','diff','--name-only'],cwd=W,text=True).splitlines()==[changed];assert all(sha(W/r)==h for r,h in b['website_tracked'].items()if r!=changed);assert sha(W/changed)==p['after_sha256'];assert read(T/'pairs-unit-result.json')['passed']==15 and read(T/'pairs-unit-result.json')['failed']==0 and all(r['exit']==0 for r in read(T/'pairs-after-results.json'))
refs=[]
for r in b['website_tracked']:
 if r.startswith('docs/'):continue
 try:s=(W/r).read_text()
 except (UnicodeError,OSError):continue
 if 'feature-pairs'in s:refs.append(r)
assert set(refs)=={'.github/workflows/test.yml','CLAUDE.md','client/CLAUDE.md','client/scripts/lib/pairs.mjs','client/scripts/pairs-lint.mjs','client/tests/unit/scripts/pairs-lint.test.ts'}
globProof=read(Path('/private/tmp/trek-core-retained-stylesheets-20261118/prototype-proof.json'));globs=globProof['all_literal_glob_expansions'];assert len(globs)==2 and all('scripts/'not in r['pattern']for r in globs)
# The code files owning both exhaustive literal glob declarations are still unchanged from their audit.
audit=read(Path('/private/tmp/trek-core-retained-stylesheets-20261118/before-private.json'))
for g in globs:assert sha(W/g['file'])==audit['website_tracked'][g['file']]
A=O/'candidate-web-explicit';B=W/'client/dist';invent=lambda r:{str(p.relative_to(r)):sha(p)for p in r.rglob('*')if p.is_file()};a=invent(A);c=invent(B);assert a==c and len(a)==3793 and not any('feature-pairs'in p for p in a)
config=read(A/'family-public-config.json');assert config['sourceCommit']=='a7033ef64e9ff42fe59e3413d1584645dbbd2310';assert read(O/'final-verification.json')['repair_verified']
decl=read(O/'typecheck-input-hashes.json');assert len(decl)==128 and all(sha(Path(r))==h for r,h in decl.items())
(T/'runtime-reuse-proof.json').write_text(json.dumps({'passed':True,'scope':'Metadata-only registration; no new source-bound build, browser or writer acceptance.','incoming':b['head'],'only_application_metadata_changed':changed,'all_other_tracked_files_exact_before_qualification':len(b['website_tracked'])-1,'all_runtime_source_tests_build_configs_and_assets_exact':True,'all_non_documentation_manifest_references':refs,'manifest_not_imported_by_runtime_or_emitted_as_asset':True,'literal_glob_owners_hash_exact_from_complete_prior_audit':True,'literal_glob_patterns':[g['pattern']for g in globs],'all_3793_accepted_and_working_dist_bytes_exact':True,'retained_build_source_commit':config['sourceCommit'],'generated_declaration_files_exact':128,'previous_Q123_runtime_receipts_reused_without_relabelling':True,'new_build_typecheck_full_regression_or_hosted_acceptance_not_claimed':True,'existing_guard_tests_passed':15,'actual_pair_guard_passed_both_cwds':True,'all_baselines_and_rule_code_exact':True},indent=2)+'\n');print('Runtime/build/declaration inputs and accepted output remain exact; existing pair tests15 pass.')
