from pathlib import Path
import subprocess,json,hashlib,stat,os
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');reference=Path('/private/tmp/trek-core-explore-props-20261118/final-archive-retry');targets=[Path('/private/tmp/trek-core-transport-presentation-20261118/final-archive')]
def qualify(base):
 m=json.loads((base/'source-archive.json').read_text());q=m['privateCommit'];assert m['allRetainedBytesAndModesMatchGit'];root=base/'extract';assert root.resolve()==root and not root.is_symlink();rows={}
 for row in subprocess.check_output(['git','ls-tree','-rz','--full-tree',q],cwd=W).split(b'\0'):
  if not row:continue
  header,path=row.split(b'\t');mode,kind,oid=header.decode().split();assert kind=='blob';rows[path.decode()]=(mode,oid)
 omitted={r['path']for r in m['omissions']};assert omitted=={'.cursor/plans/existing-family-backend-integration.plan.md'}
 actual={str(f.relative_to(root))for f in root.rglob('*')if f.is_file()};assert actual==(rows.keys()-omitted)|{'RELEASE_MANIFEST.json'}
 for name in rows.keys()-omitted:
  f=root/name;s=f.lstat();assert stat.S_ISREG(s.st_mode)and not f.is_symlink();data=f.read_bytes();oid=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();assert oid==rows[name][1]and (s.st_mode&0o777)==(0o755 if rows[name][0]=='100755'else 0o644),(name,q)
 manifest=json.loads((root/'RELEASE_MANIFEST.json').read_text());assert manifest['privateSourceCommit']==q
 assert json.loads((base.parent/'final-verification.json').read_text())['passed']
 return {'root':str(root),'private_commit':q,'tracked_files':len(rows),'retained_Git_files':len(rows)-len(omitted),'all_files':len(actual),'all_retained_bytes_and_modes_independently_match_Git':True,'manifest_bound_to_same_source':True,'original_declared_omission_preserved':True}
r={'passed':True,'source':qualify(reference),'targets':[qualify(p)for p in targets],'no_snapshot_changed_during_qualification':True};(T/'source-snapshot-input-proof.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'passed':True,'qualified_snapshots':1+len(r['targets']),'source':r['source']['private_commit'],'targets':[r['private_commit']for r in r['targets']]}))
