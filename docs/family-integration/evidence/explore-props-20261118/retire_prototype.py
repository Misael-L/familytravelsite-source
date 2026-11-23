from pathlib import Path
import hashlib,json,os,shutil
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');D=T/'candidate-checkout';b=json.loads((T/'before-private.json').read_text());p=json.loads((T/'prototype-proof.json').read_text());view,new=json.loads((T/'application-paths.json').read_text());assert p['passed']and json.loads((T/'consumer-proof.json').read_text())['passed']and json.loads((T/'compiler-program-proof.json').read_text())['passed'];assert D.resolve()==D and not D.is_symlink()and not(D/'.git').exists()
expected=set(b['website_tracked'])|{new};actual=set();links={}
for root,dirs,files in os.walk(D,followlinks=False):
 for name in list(dirs):
  f=Path(root)/name
  if f.is_symlink():links[str(f.relative_to(D))]=str(f.readlink());dirs.remove(name)
 actual.update(str((Path(root)/n).relative_to(D))for n in files)
assert actual==expected and all(k in ['node_modules','client/node_modules','family-backend/node_modules']and v==str(W/k)for k,v in links.items());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();assert all(sha(D/f)==h for f,h in b['website_tracked'].items()if f!=view);assert sha(D/view)==p['prototype_sha256']and sha(D/new)==p['new_type_sha256'];assert sha(W/view)==sha(D/view)and sha(W/new)==sha(D/new)
before=shutil.disk_usage(T).free;shutil.rmtree(D);r={'passed':True,'only_verified_disposable_prototype_removed':str(D),'pinned_incoming_source':b['head'],'exact_two_source_contract_paths':[view,new],'all_other_tracked_source_bytes_exact':len(b['website_tracked'])-1,'dependency_symlinks_unlinked_without_following':True,'logs_evidence_complete_archives_backups_ETL_media_and_retained_builds_preserved':True,'free_bytes_before':before,'free_bytes_after':shutil.disk_usage(T).free};(T/'prototype-space-recovery.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'passed':True,'retired_source_prototype_only':True,'freeGiB':round(r['free_bytes_after']/2**30,2)}))
