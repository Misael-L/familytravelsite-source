"""Strict122 stack adapter; historical helpers and guards remain byte-exact."""
from pathlib import Path
import sys,types,os
c=Path('/Users/Misael/Desktop/FamilyTravelApp/supabase/tests')
sys.path.insert(0,str(c))
os.environ['FAMILY_RECOVERY_STATE']='/private/tmp/trek-u04c2a-packing-category-foundation-20261111/rehearsal-state.json'
import packing_category_command_guard as guard
sys.modules['packing_group_guard']=guard
p=c/'trip_aggregate_recovery.py';text=p.read_text();assert text.count("cls.api!='http://127.0.0.1:55331'")==1
text=text.replace("cls.api!='http://127.0.0.1:55331'","cls.api!='http://127.0.0.1:55431'")
m=types.ModuleType('trip_aggregate_recovery');m.__file__=str(p);sys.modules[m.__name__]=m;exec(compile(text,str(p),'exec'),m.__dict__)
