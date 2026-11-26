"""Scoped new-stack adapters; historical helper sources remain exact."""
from pathlib import Path
import sys,types,os
s=Path('/private/tmp/trek-u04c2a-packing-category-foundation-20261111');c=Path('/Users/Misael/Desktop/FamilyTravelApp/supabase/tests')
sys.path.insert(0,str(c));sys.path.insert(0,str(s))
os.environ['FAMILY_RECOVERY_STATE']=str(s/'rehearsal-state.json')
import packing_category_guard as guard
# The new strict guard owns this new project; never relax the historical120 guard.
sys.modules['packing_group_guard']=guard
p=c/'trip_aggregate_recovery.py';t=p.read_text();assert t.count("cls.api!='http://127.0.0.1:55331'")==1
t=t.replace("cls.api!='http://127.0.0.1:55331'","cls.api!='http://127.0.0.1:55431'")
m=types.ModuleType('trip_aggregate_recovery');m.__file__=str(p);sys.modules[m.__name__]=m;exec(compile(t,str(p),'exec'),m.__dict__)
