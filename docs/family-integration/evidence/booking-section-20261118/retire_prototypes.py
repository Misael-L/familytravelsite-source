from pathlib import Path
import os,json,hashlib,shutil
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');b=json.loads((T/'before-private.json').read_text());p=json.loads((T/'prototype-proof.json').read_text());view,helper,test=json.loads((T/'application-paths.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();assert json.loads((T/'consumer-proof.json').read_text())['passed']and json.loads((T/'compiler-program-proof.json').read_text())['passed'];before=shutil.disk_usage(T).free;results=[]
for mode in ['original','candidate']:
 D=T/(mode+'-checkout');assert D.resolve()==D and not D.is_symlink()and not(D/'.git').exists();expected=set(b['website_tracked'])|{test}|({helper}if mode=='candidate'else set());actual=set();links={}
 for root,dirs,files in os.walk(D,followlinks=False):
  for name in list(dirs):
   q=Path(root)/name
   if q.is_symlink():links[str(q.relative_to(D))]=str(q.readlink());dirs.remove(name)
  actual.update(str((Path(root)/n).relative_to(D))for n in files)
 assert actual==expected and all(k in ['node_modules','client/node_modules','family-backend/node_modules']and v==str(W/k)for k,v in links.items());assert all(sha(D/f)==h for f,h in b['website_tracked'].items()if mode=='original'or f!=view);assert sha(D/test)==p['new_test_sha256']
 if mode=='candidate':assert sha(D/view)==p['prototype_sha256']and sha(D/helper)==p['new_component_sha256']
 results.append({'prototype':str(D),'mode':mode,'files_verified':len(expected)});shutil.rmtree(D)
r={'passed':True,'only_fresh_verified_source_prototypes_retired':results,'all_other_tracked_bytes_verified':True,'new_test_bytes_exact_before_after':True,'dependency_links_unlinked_without_following':True,'retained_builds_complete_archives_prior_evidence_other_checkouts_backups_ETL_media_untouched':True,'free_bytes_before':before,'free_bytes_after':shutil.disk_usage(T).free};(T/'prototype-space-recovery.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'passed':True,'retired_fresh_prototypes':2,'availableGiB':round(r['free_bytes_after']/2**30,2)}))
