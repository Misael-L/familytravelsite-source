from pathlib import Path
import json,hashlib
T=Path(__file__).parent;A=Path('/private/tmp/trek-core-ci-quality-20261118/candidate-web-explicit');B=T/'candidate-web-explicit';read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();cp=read(T/'chunk-reference-proof.json');contract=read(T/'bundle-contract-proof.json');sw=read(T/'service-worker-proof.json');assert cp['passed']and contract['passed']and sw['passed']and read(T/'public-slot-proof.json')['passed'];pairs=cp['chunk_pairs'];mapping=dict(pairs);assert len(mapping)==421 and set(cp['differing_after_only_chunk_reference_normalization'])=={'sw.js','assets/index-RnjDS9Wy.js'}
name_map={Path(x).name:Path(y).name for x,y in pairs if x!=y}
def names(s):
 for x,y in name_map.items():s=s.replace(x,y)
 return s
def mapped(v):
 if isinstance(v,str):return names(v)
 if isinstance(v,list):return [mapped(x)for x in v]
 if isinstance(v,dict):return {names(k):mapped(x)for k,x in v.items()}
 return v
assert names((A/'index.html').read_text())==(B/'index.html').read_text()and mapped(read(A/'asset-manifest.json'))==read(B/'asset-manifest.json')
def checked(row,root):
 p=root/row['path'].lstrip('/');assert p.is_file()and row['bytes']==p.stat().st_size and row['sha256']==sha(p)
def entry(a,b):
 checked(a,A);checked(b,B);assert set(a)==set(b)=={'path','bytes','sha256'};assert names(a['path'])==b['path']
 if not a['path'].endswith('/index-RnjDS9Wy.js'):assert a['bytes']==b['bytes']
a,b=read(A/'family-build.json'),read(B/'family-build.json');entry(a.pop('entry'),b.pop('entry'));assert a==b
a,b=read(A/'family-public-config.json'),read(B/'family-public-config.json');entry(a.pop('entry'),b.pop('entry'));assert a.pop('sourceCommit')=='f99266c7205668c58ecd934627ba110512f7dadf'and b.pop('sourceCommit')==(T/'build-commit.txt').read_text().strip();ac=a.pop('chunks');bc=b.pop('chunks');assert a==b;bynew={r['path']:r for r in bc};assert len(bynew)==len(ac)==len(bc)
for row in ac:
 n=bynew[names(row['path'])];checked(row,A);checked(n,B);assert set(row)==set(n)=={'path','bytes','sha256','slots'}and [{k:v for k,v in s.items()if k not in ['start','end']}for s in row['slots']]==[{k:v for k,v in s.items()if k not in ['start','end']}for s in n['slots']]
 if not row['path'].endswith('/index-RnjDS9Wy.js'):assert row['bytes']==n['bytes']
all_a={str(p.relative_to(A)):sha(p)for p in A.rglob('*')if p.is_file()};all_b={str(p.relative_to(B)):sha(p)for p in B.rglob('*')if p.is_file()};full=dict(pairs);compressed=[]
for x,y in pairs:
 if (A/(x+'.br')).exists():
  assert (B/(y+'.br')).exists();full[x+'.br']=y+'.br';compressed.extend([{'root':str(A),'compressed':x+'.br','plain':x},{'root':str(B),'compressed':y+'.br','plain':y}])
metadata={'index.html','asset-manifest.json','family-build.json','family-public-config.json','sw.js'}
for p in all_a:
 if p in full or p in metadata:continue
 assert p in all_b and all_a[p]==all_b[p],p;full[p]=p
for p in metadata:full.setdefault(p,p)
assert len(all_a)==len(all_b)==len(full)==len(set(full.values()))==3793 and set(full)==set(all_a)and set(full.values())==set(all_b)
css=[(x,y)for x,y in pairs if x.endswith('.css')];assert len(css)==14 and all(x==y and all_a[x]==all_b[y]for x,y in css)
(T/'compressed-artifacts-to-verify.json').write_text(json.dumps(compressed,indent=2)+'\n');initial=T/'artifact-diff-initial.json';assert not initial.exists();(T/'artifact-diff.json').rename(initial)
r={'passed':True,'acceptance':'Two precisely reviewed response functions change in the index script. Every other index AST node, 405 other application JS payloads, 14 CSS files, and SW logic are preserved with verified metadata, source bindings and chunk-name mapping. No raw-byte identity claim for changed content-addressed assets.','before_build':'f99266c7205668c58ecd934627ba110512f7dadf','after_build':(T/'build-commit.txt').read_text().strip(),'all_output_files_accounted_for':3793,'logical_JS_CSS_chunks':421,'other_application_JS_payloads_equal_after_only_chunk_names':405,'all_14_CSS_files_byte_exact':True,'index_only_two_functions_match_reviewed_source':True,'all_other_index_AST_exact_after_binding_and_chunk_name_normalization':True,'SW_logic_equal_and_actual_precache_revisions_verified':True,'HTML_manifest_only_exact_chunk_name_changes':True,'all_entry_and_chunk_hashes_and_sizes_match_actual_files':True,'public_configuration_slot_values_and_non_binding_fields_exact':True,'all_slot_offsets_recomputed_from_actual_source_by_unchanged_scanner':True,'all_other_static_assets_byte_exact':True,'compressed_derivative_check_required':True,'all_JavaScript_CSS_raw_bytes_exact':False};(T/'artifact-diff.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
