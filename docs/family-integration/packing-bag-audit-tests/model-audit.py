from pathlib import Path
import json,sys
s=Path(__file__).resolve().parent;sys.path.insert(0,'/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');import packing_category_aggregate_guard as g
g.validate();results=json.loads(g.sql((s/'lifecycle-model.sql').read_text()).splitlines()[-1]);assert len(results)==19 and len(set(results))==19;assert g.sql("select to_regclass('pg_temp.d1_model_bags')is null")=='t';g.validate();(s/'model-receipt.json').write_text(json.dumps({'model_cases':len(results),'results':results,'temporary_tables_only':True,'rolled_back':True,'schema125_unchanged':True,'limit':'relational lifecycle model only; future migration/RLS/API/queue/HTTP/browser behavior is not qualified'},indent=2));print('Temporary relational/lifecycle model cases passed:',len(results))
