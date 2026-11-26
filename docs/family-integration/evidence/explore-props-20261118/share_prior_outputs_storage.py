"""Share APFS extents for byte-identical generated assets; preserve every logical build."""
from pathlib import Path
import ctypes,hashlib,json,os,stat,uuid,shutil
T=Path(__file__).parent;A=Path('/private/tmp/trek-core-transport-ui-retirement-20261118/candidate-web-explicit');read=lambda p:json.loads(p.read_text());sha=lambda b:hashlib.sha256(b).hexdigest();assert (T/'before-private.json').is_file()and A.is_dir()and A.resolve()==A
assert read(Path('/private/tmp/trek-core-transport-ui-retirement-20261118')/'final-verification.json')['passed']and read(A/'family-public-config.json')['sourceCommit']=='f18be8d3fd32b32371a02d30eb1d2e43d8eaeaf0'
assert read(T/'warnings-final-result.json')['exit']==0 and read(T/'artifact-diff.json')['passed']and read(T/'clone-isolation-proof.json')['passed']
lib=ctypes.CDLL('/usr/lib/libSystem.B.dylib',use_errno=True);clone=lib.clonefile;clone.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint32];clone.restype=ctypes.c_int;metadata=lib.copyfile;metadata.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_void_p,ctypes.c_uint32];metadata.restype=ctypes.c_int
aclget=lib.acl_get_file;aclget.argtypes=[ctypes.c_char_p,ctypes.c_int];aclget.restype=ctypes.c_void_p;acltext=lib.acl_to_text;acltext.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ssize_t)];acltext.restype=ctypes.c_void_p;aclfree=lib.acl_free;aclfree.argtypes=[ctypes.c_void_p];aclfree.restype=ctypes.c_int


listattr=lib.listxattr;listattr.argtypes=[ctypes.c_char_p,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_int];listattr.restype=ctypes.c_ssize_t
getattr_=lib.getxattr;getattr_.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_uint32,ctypes.c_int];getattr_.restype=ctypes.c_ssize_t
setattr_=lib.setxattr;setattr_.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_uint32,ctypes.c_int];setattr_.restype=ctypes.c_int
def xattrs(p):
 n=listattr(os.fsencode(p),None,0,1)
 if n<0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()),str(p))
 if not n:return {}
 buf=ctypes.create_string_buffer(n);assert listattr(os.fsencode(p),buf,n,1)==n;out={}
 for key in sorted(k for k in buf.raw.split(b'\0')if k):
  size=getattr_(os.fsencode(p),key,None,0,0,1)
  if size<0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()),str(p))
  data=ctypes.create_string_buffer(size);assert getattr_(os.fsencode(p),key,data,size,0,1)==size;out[os.fsdecode(key)]=sha(data.raw)
 return out

def aclhash(p):
 a=aclget(os.fsencode(p),0x100)
 if not a:
  err=ctypes.get_errno()
  if err==2 and p.is_file()and not p.is_symlink():return sha(b'NO_EXTENDED_ACL')
  raise OSError(err,os.strerror(err),str(p))
 buf=None
 try:
  n=ctypes.c_ssize_t();buf=acltext(a,ctypes.byref(n));assert buf;return sha(ctypes.string_at(buf,n.value))
 finally:
  if buf:aclfree(buf)
  aclfree(a)

def sig(p):
 s=p.lstat();assert stat.S_ISREG(s.st_mode)and not p.is_symlink()
 return {'sha256':sha(p.read_bytes()),'bytes':s.st_size,'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'mtime_ns':s.st_mtime_ns,'flags':s.st_flags,'xattrs':xattrs(p),'ACL_sha256':aclhash(p)}
def inventory(root):
 assert root.resolve()==root and not root.is_symlink();files={};dirs={}
 for d,ds,fs in os.walk(root,followlinks=False):
  p=Path(d);s=p.lstat();assert stat.S_ISDIR(s.st_mode)and not p.is_symlink();dirs[str(p.relative_to(root))]=(s.st_atime_ns,s.st_mtime_ns)
  for n in ds:assert not(p/n).is_symlink()
  for n in fs:files[str((p/n).relative_to(root))]=sig(p/n)
 return files,dirs
def digest(rows):return sha(json.dumps(rows,sort_keys=True,separators=(',',':')).encode())

# Small metadata/COW probe before touching retained artifacts.
P=T/'metadata-clone-probe-prior';P.mkdir();src=P/'source';old=P/'target';tmp=P/'clone';src.write_bytes(b'copy-on-write metadata probe');old.write_bytes(src.read_bytes());old.chmod(0o640);os.utime(old,ns=(1600000000000000000,1600000000000000000));assert setattr_(os.fsencode(old),b'com.codex.artifact-test',b'preserved',9,0,1)==0;expected=sig(old)
assert clone(os.fsencode(src),os.fsencode(tmp),1)==0;assert metadata(os.fsencode(old),os.fsencode(tmp),None,7|(1<<18)|(1<<19))==0;assert sig(tmp)==expected;shutil.rmtree(P)
(T/'prior-build-metadata-clone-proof.json').write_text(json.dumps({'passed':True,'ACL_STAT_XATTR_copy_only_no_DATA':True,'mode_owner_mtime_flags_xattrs_ACL_and_bytes_verified':True,'separate_COW_isolation_probe':True},indent=2)+'\n')
source,sourceDirs=inventory(A);sourceRootHash=digest(source);assert len(source)==3793
targets=[('/private/tmp/trek-core-trip-members-retirement-20261118/candidate-web-explicit', '/private/tmp/trek-core-trip-members-retirement-20261118'), ('/private/tmp/trek-core-notice-ui-retirement-20261118/candidate-web-explicit', '/private/tmp/trek-core-notice-ui-retirement-20261118'), ('/private/tmp/trek-core-packing-ui-retirement-20261118/candidate-web-explicit', '/private/tmp/trek-core-packing-ui-retirement-20261118'), ('/private/tmp/trek-core-task-list-retirement-20261118/candidate-web-explicit', '/private/tmp/trek-core-task-list-retirement-20261118'), ('/private/tmp/trek-core-place-inspector-retirement-20261118/candidate-web-explicit', '/private/tmp/trek-core-place-inspector-retirement-20261118'), ('/private/tmp/trek-core-day-plan-retirement-20261118/candidate-web-explicit', '/private/tmp/trek-core-day-plan-retirement-20261118'), ('/private/tmp/trek-core-settings-retirement-20261118/candidate-web-explicit', '/private/tmp/trek-core-settings-retirement-20261118'), ('/private/tmp/trek-core-atlas-retirement-20261118/candidate-web-explicit', '/private/tmp/trek-core-atlas-retirement-20261118')];freeBefore=shutil.disk_usage(T).free;results=[]
for rootPath,basePath in targets:
 base=Path(basePath);root=Path(rootPath);assert root.is_dir()and root.resolve()==root
 build=read(base/'build-result-explicit.json');assert build['exit']==0 and read(root/'family-public-config.json')['sourceCommit']==build['build_source_commit']
 before,dirs=inventory(root);cloned=0;logicalBytes=0;skipped=0
 for rel,expected in before.items():
  original=root/rel;reference=A/rel
  if rel not in source or source[rel]['sha256']!=expected['sha256']or source[rel]['bytes']!=expected['bytes']or original.lstat().st_nlink!=1:
   skipped+=1;continue
  inode=original.lstat().st_ino;temp=original.parent/('.codex-storage-share-'+uuid.uuid4().hex)
  try:
   if clone(os.fsencode(reference),os.fsencode(temp),1)!=0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()),str(temp))
   if metadata(os.fsencode(original),os.fsencode(temp),None,7|(1<<18)|(1<<19))!=0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()),str(temp))
   assert sig(temp)==expected and original.lstat().st_ino==inode and sig(original)==expected
   os.replace(temp,original);assert sig(original)==expected;cloned+=1;logicalBytes+=expected['bytes']
  finally:
   if temp.exists():temp.unlink()
 for rel,(atime,mtime)in dirs.items():os.utime(root/rel,ns=(atime,mtime),follow_symlinks=False)
 after,_=inventory(root);assert before==after
 row={'root':str(root),'pinned_build_source':build['build_source_commit'],'all_files':len(before),'before_tree_sha256':digest(before),'after_tree_sha256':digest(after),'all_paths_bytes_modes_owners_mtime_flags_xattrs_ACLs_exact':True,'cloned_identical_files':cloned,'logical_bytes_now_using_current_source_extents':logicalBytes,'nonidentical_or_special_files_untouched':skipped};results.append(row);print(json.dumps(row),flush=True)
assert inventory(A)[0]==source
out={'passed':True,'method':'APFS clonefile with CLONE_NOFOLLOW; copyfile ACL|STAT|XATTR metadata only; validate then atomic replace','source_build':str(A),'source_tree_sha256_unchanged':sourceRootHash,'source_and_all_target_logical_trees_unchanged':True,'target_builds':results,'free_bytes_before':freeBefore,'free_bytes_after':shutil.disk_usage(T).free,'no_tracked_source_complete_archive_sealed_evidence_backup_ETL_media_or_unverified_copy_changed':True,'physical_inodes_and_ctime_may_change':True,'no_file_removed_from_any_logical_build':True};(T/'prior-build-storage-sharing.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'passed':True,'shared_builds':len(results),'free_GiB':round(out['free_bytes_after']/2**30,2),'free_GiB_delta':round((out['free_bytes_after']-freeBefore)/2**30,2)}),flush=True)
