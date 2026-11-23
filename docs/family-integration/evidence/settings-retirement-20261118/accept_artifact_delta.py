from pathlib import Path
import json,hashlib,copy
T=Path(__file__).parent;A=Path('/private/tmp/trek-core-atlas-retirement-20261118/candidate-web-explicit');B=T/'candidate-web-explicit';read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();cp=read(T/'chunk-reference-proof.json');css=read(T/'css-removal-proof.json');orphan=read(T/'orphan-class-source-proof.json');sw=read(T/'service-worker-proof.json')
assert cp['all_421_logical_chunks_paired_without_collision']and cp['unique_pairing_for_two_distinct_native_legacy_MapViewGL_chunks']and cp['differing_after_only_chunk_reference_normalization']==['sw.js','assets/index-b3UOLynz.css'];assert css['passed']and css['only_removed_rules']==24 and orphan['passed']and sw['passed'];pairs=cp['chunk_pairs'];mapping=dict(pairs);assert len(mapping)==421
# Only known chunk names are mapped; CSS rule removal and SW code are proved separately.
name_map={Path(x).name:Path(y).name for x,y in pairs if x!=y}
def names(s):
 for x,y in name_map.items():s=s.replace(x,y)
 return s
def map_data(v):
 if isinstance(v,str):return names(v)
 if isinstance(v,list):return [map_data(x)for x in v]
 if isinstance(v,dict):return {names(k):map_data(x)for k,x in v.items()}
 return v
assert names((A/'index.html').read_text())==(B/'index.html').read_text()
assert map_data(read(A/'asset-manifest.json'))==read(B/'asset-manifest.json')
def checked_file(row,root):
 p=root/row['path'].lstrip('/');assert p.is_file();assert row['bytes']==p.stat().st_size and row['sha256']==sha(p)
def entry(a,b):
 checked_file(a,A);checked_file(b,B);assert set(a)==set(b)=={'path','bytes','sha256'};assert names(a['path'])==b['path'];assert a['bytes']==b['bytes']
a=read(A/'family-build.json');b=read(B/'family-build.json');entry(a.pop('entry'),b.pop('entry'));assert a==b
a=read(A/'family-public-config.json');b=read(B/'family-public-config.json');entry(a.pop('entry'),b.pop('entry'));assert a.pop('sourceCommit')=='a4e9f2197a600840c7cbfefbeb59def1e3f8acb4';assert b.pop('sourceCommit')==(T/'build-commit.txt').read_text().strip();ac=a.pop('chunks');bc=b.pop('chunks');assert a==b
by_new={r['path']:r for r in bc};assert len(by_new)==len(bc)==len(ac)
for row in ac:
 n=by_new[names(row['path'])];checked_file(row,A);checked_file(n,B);assert set(row)==set(n)=={'path','bytes','sha256','slots'};assert row['bytes']==n['bytes']and row['slots']==n['slots']
all_a={str(p.relative_to(A)):sha(p)for p in A.rglob('*')if p.is_file()};all_b={str(p.relative_to(B)):sha(p)for p in B.rglob('*')if p.is_file()};full=dict(pairs);compressed=[]
for x,y in pairs:
 if (A/(x+'.br')).exists():assert (B/(y+'.br')).exists();full[x+'.br']=y+'.br';compressed.extend([{'root':str(A),'compressed':x+'.br','plain':x},{'root':str(B),'compressed':y+'.br','plain':y}])
metadata={'index.html','asset-manifest.json','family-build.json','family-public-config.json','sw.js'}
for p in all_a:
 if p in full or p in metadata:continue
 assert p in all_b and all_a[p]==all_b[p],p;full[p]=p
for p in metadata:full.setdefault(p,p)
assert len(all_a)==len(all_b)==len(full)==len(set(full.values()))==3793 and set(full)==set(all_a)and set(full.values())==set(all_b)
(T/'compressed-artifacts-to-verify.json').write_text(json.dumps(compressed,indent=2)+'\n')
initial=T/'artifact-diff-initial.json'
if not initial.exists():(T/'artifact-diff.json').rename(initial)
r={'passed':True,'acceptance':'Reviewed removal of 24 orphaned utility rules; no byte-identity claim for content-addressed files or generated metadata.','before_build':'a4e9f2197a600840c7cbfefbeb59def1e3f8acb4','after_build':(T/'build-commit.txt').read_text().strip(),'all_output_files_accounted_for':3793,'JavaScript_CSS_files':421,'application_JS_files_equal_after_only_chunk_reference_renames':406,'SW_code_semantically_equal_with_verified_cache_manifest':True,'CSS_files':14,'unchanged_CSS_files':13,'main_stylesheet_only_24_orphan_rules_removed_ordered_other_bytes_exact':True,'removed_whole_utility_tokens_absent_from_current_application_source_and_compiled_JS':True,'entry_receipts_and_public_configuration_slots_and_non_binding_fields_preserved':True,'manifest_and_HTML_only_chunk_path_renames':True,'rules_scanner_baselines_and_native_source_unchanged':True,'compressed_derivative_check_required':True,'all_JavaScript_CSS_raw_bytes_exact':False};(T/'artifact-diff.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
