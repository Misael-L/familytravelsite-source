"""Create fresh synthetic SDK fixtures only on strict local122. Never migrates/resets or accesses hosted data."""
from pathlib import Path
import argparse,sys,json,uuid,os
t=Path('/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');sys.path.insert(0,str(t))
import packing_category_command_test_scope
import packing_category_command_guard as guard
from packing_category_commands import CategoryCommands,lit
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args();out=a.output.absolute()
if not str(out).startswith('/private/tmp/')or out.exists()or out.resolve()!=out:p.error('Fresh canonical /private/tmp destination required')
guard.validate();out.mkdir(mode=0o700);CategoryCommands.setUpClass();c=CategoryCommands();c.setUp();main=c.trip
guest=c.guest();c.sql('insert into public.trip_travelers(trip_id,person_id)values('+lit(main)+','+lit(guest)+')')
c.trip=c.new_trip('C2c1 historical category receipt');c.sql('insert into public.trip_travelers(trip_id,person_id)values('+lit(c.trip)+','+lit(c.person)+')');row=c.create(category='Original receipt');packet=c.packet();category=packet['categories'][0]
operation=str(uuid.uuid4());original={'version':1,'source_url':c.api,'view_layer':'published','original_items':sorted(packet['packing']['items'],key=lambda x:x['id']),'command':{'version':1,'kind':'packing-category','operation_id':operation,'scope':packet['scope'],'action':'category-rename','expected_collection_revision':packet['collection_revision'],'observed_category':category,'values':{'name':'Historical renamed'}}}
c.rpc('execute_family_trip_packing_category_v1',[c.trip,operation,packet['scope'],'category-rename',packet['collection_revision'],category,{'name':'Historical renamed'}])
revision=int(c.sql('select revision from public.trips where id='+lit(c.trip)));c.rpc('trash_family_trip',[c.trip,revision]);revision=int(c.sql('select revision from public.trips where id='+lit(c.trip)));c.rpc('restore_family_trip',[c.trip,revision])
code,b=c.http('POST','/auth/v1/token?grant_type=password',{'email':'p01-'+c.owner+'@fixture.invalid','password':'local-only'});assert code==200
data={'api':c.api,'anon_key':c.anon,'access_token':c.token,'low_access_token':json.loads(b)['access_token'],'trip_id':main,'family_id':c.family,'user_id':c.owner,'person_id':c.person,'guest_person_id':guest,'lifecycle_packet':original}

# Existing group SDK assertions can be requalified against122 without writing the preserved120 project.
groups={}
for kind in ['redacted','lifecycle']:
 c.trip=c.new_trip('C2c1 existing group '+kind);c.sql('insert into public.trip_travelers(trip_id,person_id)values'+','.join('('+lit(c.trip)+','+lit(person)+')'for person in [c.person,c.viewer_person]))
 row=c.create(category='Original',name='Existing group SDK recovery');before=c.state();args=c.group_args(categories=['Original']);c.group(args)
 original_group={'version':1,'source_url':c.api,'view_layer':'published','original_items':sorted(before['items'],key=lambda x:x['id']),'command':{'version':1,'kind':'packing-group','operation_id':args[1],'scope':args[2],'action':args[3],'expected_collection_revision':args[4],'selector':args[5],'observed_items':args[6],'values':args[7]}}
 if kind=='redacted':c.sql('update public.packing_items set is_private=true,owner_person_id='+lit(c.viewer_person)+'where id='+lit(row['id']))
 else:
  rev=int(c.sql('select revision from public.trips where id='+lit(c.trip)));c.rpc('trash_family_trip',[c.trip,rev]);rev=int(c.sql('select revision from public.trips where id='+lit(c.trip)));c.rpc('restore_family_trip',[c.trip,rev])
 groups[kind+'_packet']=original_group
c.trip=c.new_trip('C2c1 existing group SDK');c.sql('insert into public.trip_travelers(trip_id,person_id)values('+lit(c.trip)+','+lit(c.person)+')')
group_data={k:data[k]for k in ['api','anon_key','access_token','low_access_token','family_id','user_id','person_id']};group_data.update(groups,trip_id=c.trip,schema=122,project_id='family-modernization-20261111-c2a')
(out/'group-fixture.json').write_text(json.dumps(group_data));os.chmod(out/'group-fixture.json',0o600)
(out/'live-fixture.json').write_text(json.dumps(data));os.chmod(out/'live-fixture.json',0o600);guard.validate()
print('Fresh local122 synthetic SDK Trip, guest and historical lifecycle receipt prepared. Private credentials saved without printing.')
