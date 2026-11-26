"""Prepare fresh SDK fixtures on the already-qualified disposable120 stack; never reset/apply SQL."""
from pathlib import Path
import argparse,hashlib,json,sys,uuid,os
sys.path.insert(0,str(Path(__file__).resolve().parent))
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
destination=a.output.resolve()
if not str(destination).startswith('/private/tmp/') or destination.exists():p.error('A new /private/tmp output directory is required')
from packing_group_guard import validate,old_hashes,sql,ROOT
from packing_groups import PackingGroups,lit
validate();old_hashes();assert sql('select count(*)from supabase_migrations.schema_migrations')=='120'
schema=json.loads((ROOT/'supabase/tests/packing_group_schema.json').read_text())
assert hashlib.sha256((ROOT/'supabase/migrations/20261111201637_observed_trip_packing_groups.sql').read_bytes()).hexdigest()==schema['migration_sha256']
for sig,h in schema['functions'].items():assert hashlib.sha256(sql("select pg_get_functiondef('"+sig+"'::regprocedure)").encode()).hexdigest()==h
destination.mkdir(mode=0o700)
PackingGroups.setUpClass();g=PackingGroups();g.setUp()
for name in ['redacted','lifecycle']:
 g.trip=g.new_trip('U04-C1b '+name+' proof');g.sql('insert into public.trip_travelers(trip_id,person_id)values'+','.join('('+lit(g.trip)+','+lit(p)+')'for p in [g.person,g.viewer_person]))
 row=g.group_item(category='Original',name='Private recovery fixture')
 before=g.state();args=g.group_args(categories=['Original']);result=g.group(args)
 original={'version':1,'source_url':g.api,'view_layer':'published','command':{'version':1,'kind':'packing-group','operation_id':args[1],'scope':args[2],'action':args[3],'expected_collection_revision':args[4],'selector':args[5],'observed_items':args[6],'values':args[7]},'original_items':sorted(before['items'],key=lambda r:r['id'])}
 if name=='redacted':
  g.sql('update public.packing_items set is_private=true,owner_person_id='+lit(g.viewer_person)+' where id='+lit(row['id']))
 else:
  root=json.loads(g.sql('select to_jsonb(t)from public.trips t where id='+lit(g.trip)))
  g.rpc('trash_family_trip',[g.trip,root['revision']]);root=json.loads(g.sql('select to_jsonb(t)from public.trips t where id='+lit(g.trip)))
  g.rpc('restore_family_trip',[g.trip,root['revision']])
 setattr(g,name+'_packet',original)
g.trip=g.new_trip('U04-C1b live SDK');g.sql('insert into public.trip_travelers(trip_id,person_id)values('+lit(g.trip)+','+lit(g.person)+')')
code,body=g.http('POST','/auth/v1/token?grant_type=password',{'email':'p01-'+g.owner+'@fixture.invalid','password':'local-only'})
assert code==200
out={'api':g.api,'anon_key':g.anon,'access_token':g.token,'low_access_token':json.loads(body)['access_token'],'family_id':g.family,'user_id':g.owner,'person_id':g.person,'trip_id':g.trip,'redacted_packet':g.redacted_packet,'lifecycle_packet':g.lifecycle_packet}
p=destination/'live-fixture.json';p.write_text(json.dumps(out));os.chmod(p,0o600)
print('Fresh synthetic Family/Trips and actual password/TOTP sessions prepared on local120; private tokens saved without printing.')
