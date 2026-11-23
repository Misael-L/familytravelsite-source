from pathlib import Path
import json,hashlib,os,shutil
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');D=T/'candidate-checkout';b=json.loads((T/'before-private.json').read_text());removed=set(json.loads((T/'removed-paths.json').read_text()));proof=json.loads((T/'consumer-proof.json').read_text());assert proof['passed']and json.loads((T/'compiler-program-proof.json').read_text())['passed'];assert len(removed)==5 and D.resolve()==D and not D.is_symlink()and not(D/'.git').exists()
expected=set(b['website_tracked'])-removed;actual=set();links={}
for root,dirs,files in os.walk(D,followlinks=False):
 for name in list(dirs):
  p=Path(root)/name
  if p.is_symlink():links[str(p.relative_to(D))]=str(p.readlink());dirs.remove(name)
 actual.update(str((Path(root)/n).relative_to(D))for n in files)
assert actual==expected
assert all(k in ['node_modules','client/node_modules','family-backend/node_modules']and v==str(W/k)for k,v in links.items())
assert all(hashlib.sha256((D/p).read_bytes()).hexdigest()==b['website_tracked'][p]for p in expected)
before=shutil.disk_usage(T).free;shutil.rmtree(D);after=shutil.disk_usage(T).free;out={'passed':True,'only_verified_disposable_source_prototype_removed':str(D),'pinned_original_source':b['head'],'explicit_candidate_deletions':sorted(removed),'all_other_tracked_bytes_verified':len(expected),'dependency_links_unlinked_without_following':True,'test_logs_evidence_compiled_artifacts_source_checkouts_backups_ETL_media_preserved':True,'free_bytes_before':before,'free_bytes_after':after};(T/'prototype-space-recovery.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'prototype_removed':True,'available_GiB':round(after/2**30,2)}))
