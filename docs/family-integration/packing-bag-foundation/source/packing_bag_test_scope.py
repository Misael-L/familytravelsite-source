from pathlib import Path
import sys,types,os
S=Path('/private/tmp/trek-u04d2a-bag-foundation-20261112');T=Path('/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');sys.path.insert(0,str(T));os.environ['FAMILY_RECOVERY_STATE']=str(S/'rehearsal-state.json')
import packing_bag_guard as guard
guard.validate();sys.modules['packing_group_guard']=guard
p=T/'trip_aggregate_recovery.py';src=p.read_text();assert src.count("cls.api!='http://127.0.0.1:55331'")==1
src=src.replace("cls.api!='http://127.0.0.1:55331'","cls.api!='http://127.0.0.1:55831'").replace("['supabase','status'","['/opt/homebrew/Cellar/supabase/2.109.1/bin/supabase','status'")
m=types.ModuleType('trip_aggregate_recovery');m.__file__=str(p);sys.modules[m.__name__]=m;exec(compile(src,str(p),'exec'),m.__dict__)
