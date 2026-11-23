from pathlib import Path
import subprocess,os,json,shutil,ctypes,hashlib,stat
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');q=(T/'build-commit.txt').read_text().strip()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=W,text=True).strip()==q and not subprocess.check_output(['git','status','--porcelain'],cwd=W)
env={**os.environ,'PATH':'/Users/Misael/.nvm/versions/node/v24.22.2/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192','FAMILY_SOURCE_COMMIT':q,'VITE_DATA_PLANE':'supabase','VITE_SUPABASE_URL':os.environ['FAMILY_REPLAY_FIXTURE_ORIGIN'],'VITE_SUPABASE_ANON_KEY':os.environ['FAMILY_REPLAY_FIXTURE_PUBLISHABLE_KEY'],'VITE_FAMILY_CORE_WRITER_PROFILE':'isolated-planner-packing-v1'}
for k in ['VITE_FAMILY_OFFLINE_READ_QUALIFICATION','VITE_FAMILY_PACKING_IDENTITY_QUALIFICATION','VITE_FAMILY_PACKING_AGGREGATE_QUALIFICATION','VITE_FAMILY_PACKING_BAG_QUALIFICATION','VITE_FAMILY_PACKING_RECOVERY_QUALIFICATION','VITE_FAMILY_STAY_READ_QUALIFICATION','VITE_FAMILY_STAY_WRITE_QUALIFICATION','VITE_FAMILY_STAY_COMMAND_QUALIFICATION','VITE_FAMILY_STAY_CONTROLS_QUALIFICATION','VITE_FAMILY_PRIVATE_FILE_QUALIFICATION']:env[k]=''
for k in list(env):
 if k.startswith('VITE_FAMILY_') and k.endswith('QUALIFICATION'):env[k]=''
with(T/'build-explicit.log').open('w')as log:r=subprocess.run(['npm','run','build:web'],cwd=W,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
(T/'build-result-explicit.json').write_text(json.dumps({'exit':r.returncode,'build_source_commit':q,'qualified_application_commit':(T/'implementation-commit.txt').read_text().strip(),'ordinary_installed_build':True,'native_presentation_protected':True,'new_browser_acceptance_performed':False,'configuration':'unchanged isolated planner/base packing profile and noncredential publishable fixture placeholder; no advanced qualifications','hosted_or_browser_connection':False,'deployable_or_deployed':False},indent=2)+'\n')
assert r.returncode==0
# A fresh disposable COW probe proves this copy method before retaining generated output.
P=T/'build-clone-probe';P.mkdir();a=P/'source';c=P/'clone';a.write_bytes(b'Q118 isolated build-copy probe');lib=ctypes.CDLL('/usr/lib/libSystem.B.dylib',use_errno=True);clone=lib.clonefile;clone.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint32];clone.restype=ctypes.c_int;metadata=lib.copyfile;metadata.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_void_p,ctypes.c_uint32];metadata.restype=ctypes.c_int
assert clone(os.fsencode(a),os.fsencode(c),1)==0 and a.stat().st_ino!=c.stat().st_ino and a.stat().st_nlink==c.stat().st_nlink==1;c.write_bytes(b'clone changed');assert a.read_bytes()==b'Q118 isolated build-copy probe';shutil.rmtree(P)
def copy_clone(source,target):
 if clone(os.fsencode(source),os.fsencode(target),1)!=0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()),str(target))
 if metadata(os.fsencode(source),os.fsencode(target),None,7|(1<<18)|(1<<19))!=0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()),str(target))
 return target
assert not(T/'candidate-web-explicit').exists();shutil.copytree(W/'client/dist',T/'candidate-web-explicit',copy_function=copy_clone)
def inventory(root):
 return {str(p.relative_to(root)):(hashlib.sha256(p.read_bytes()).hexdigest(),p.stat().st_size,stat.S_IMODE(p.stat().st_mode),p.stat().st_uid,p.stat().st_gid,p.stat().st_mtime_ns,p.stat().st_flags)for p in root.rglob('*')if p.is_file()}
source=inventory(W/'client/dist');copy=inventory(T/'candidate-web-explicit');assert source==copy and all((W/'client/dist'/r).stat().st_ino!=(T/'candidate-web-explicit'/r).stat().st_ino for r in source)
(T/'build-copy-proof.json').write_text(json.dumps({'passed':True,'method':'Native APFS clonefile COW plus ACL|STAT|XATTR metadata copy to a new output directory only; no retained tree replaced','fresh_COW_isolation_probe_passed':True,'all_output_paths_bytes_modes_owners_mtime_and_flags_exact':True,'all_copied_files_have_separate_inodes':True,'files':len(source),'prior_builds_complete_archives_backups_ETL_media_untouched':True},indent=2)+'\n')
assert json.loads((T/'candidate-web-explicit/family-public-config.json').read_text())['sourceCommit']==q
print('Committed-source candidate build passed:',q)
