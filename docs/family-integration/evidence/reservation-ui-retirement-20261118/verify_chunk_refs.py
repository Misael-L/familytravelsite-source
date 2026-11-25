from pathlib import Path
from collections import defaultdict
import re,json,itertools,difflib
T=Path(__file__).parent;A=Path('/private/tmp/trek-core-trip-members-retirement-20261118/candidate-web-explicit');B=T/'candidate-web-explicit'
a={str(p.relative_to(A)):p for p in A.rglob('*')if p.is_file()and p.suffix in ['.js','.css']};b={str(p.relative_to(B)):p for p in B.rglob('*')if p.is_file()and p.suffix in ['.js','.css']};common=a.keys()&b.keys();key=lambda p:re.sub(r'-[A-Za-z0-9_-]{8}(?=\.(?:js|css)$)','',p);ga=defaultdict(list);gb=defaultdict(list)
for p in a.keys()-common:ga[key(p)].append(p)
for p in b.keys()-common:gb[key(p)].append(p)
assert ga.keys()==gb.keys()and all(len(ga[k])==len(gb[k])for k in ga)
base=[(p,p)for p in sorted(common)]+[(ga[k][0],gb[k][0])for k in sorted(ga)if len(ga[k])==1];dups=[k for k in ga if len(ga[k])>1];assert dups==['assets/MapViewGL.js']
cacheA={k:p.read_text()for k,p in a.items()};cacheB={k:p.read_text()for k,p in b.items()};solutions=[];diagnostics=[]
def normalize(s,m):
 for x,y in m.items():s=s.replace(x,y)
 return s
for perm in itertools.permutations(sorted(gb[dups[0]])):
 pairs=base+list(zip(sorted(ga[dups[0]]),perm));assert len(pairs)==421
 ma={Path(x).name:'@@chunk:'+str(i)+'@@'for i,(x,y)in enumerate(pairs)if x!=y};mb={Path(y).name:'@@chunk:'+str(i)+'@@'for i,(x,y)in enumerate(pairs)if x!=y};assert len(ma)==len(mb)==len(a.keys()-common)
 changed=[];details=[]
 for x,y in pairs:
  s=cacheA[x];t=cacheB[y]
  if s==t:continue
  ns=normalize(s,ma);nt=normalize(t,mb)
  if ns!=nt:
   changed.append(x)
   if x.endswith('.js'):
    first=next((i for i,(c,d)in enumerate(zip(ns,nt))if c!=d),min(len(ns),len(nt)));details.append({'file':x,'old':ns[max(0,first-80):first+220],'new':nt[max(0,first-80):first+220]})
 diagnostics.append({'changed':changed,'details':details})
 if not any(x.startswith('assets/')and x.endswith('.js')for x in changed):solutions.append((pairs,changed,details))
assert len(solutions)==1,diagnostics
pairs,changed,details=solutions[0];out={'passed':changed==['sw.js','assets/index-7osPZ3Qs.css'],'scope':'All 406 application scripts; service-worker code/manifest and main stylesheet have separate exact proofs.','all_421_logical_chunks_paired_without_collision':True,'unique_pairing_for_two_distinct_native_legacy_MapViewGL_chunks':True,'differing_after_only_chunk_reference_normalization':changed,'JS_files':407,'chunk_pairs':pairs,'remaining_JS_details':details};(T/'chunk-reference-proof.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k!='chunk_pairs'}))
