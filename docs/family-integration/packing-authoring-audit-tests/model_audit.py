from pathlib import Path
import sys,json
s=Path(__file__).resolve().parent;sys.path.insert(0,'/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');import packing_category_command_guard as g
g.validate();results=json.loads(g.sql((s/'lifecycle-model.sql').read_text()).splitlines()[-1]);assert len(results)==14
assert g.sql("select to_regclass('pg_temp.c3_categories')is null")=='t';g.validate()
(s/'model-receipt.json').write_text(json.dumps({'model_cases':len(results),'results':results,'temporary_tables_only':True,'rolled_back':True,'schema_122_exact':True,'qualification':'constraint model only; future migration, RLS and RPC implementation are not proved'},indent=2)+'\n');print('temporary model cases',len(results))
