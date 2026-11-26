"""Fresh synthetic rich Trip in the already marked disposable project; no reset or schema changes."""
from pathlib import Path
import sys,json,argparse,re
sys.path.insert(0,'/Users/Misael/Desktop/FamilyTravelApp/supabase/tests')
from prepare_planner_entry import build_fixture,write_fixture,validate_destination
from packing_commands import PackingCommands,lit

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-root',required=True,help='Fresh /private/tmp/trek-u03d12-... directory; existing fixtures are never reset')
base=Path(parser.parse_args().output_root)
assert re.fullmatch(r'/private/tmp/trek-u03d12-[^/]+',str(base))
assert not base.exists() and base.resolve()==base
for profile in ['desktop','phone']:
    output=base/(profile+'-fixture/private-fixture.json')
    validate_destination(output,'12')
    case,data=build_fixture()
    assert case.api=='http://127.0.0.1:55331'
    write_fixture(output.with_name('preparation.json'),data,'12')
    class PackingFixture(PackingCommands):pass
    for key in ['container','api','anon','service','token','family','owner','editor','viewer','stranger','person','editor_person','viewer_person','trip']:
        setattr(PackingFixture,key,getattr(case,key))
    pack=PackingFixture()
    pack.policy('trip.packing.manage','trip_travelers')
    bag=pack.bag()
    common=pack.create(name='D16b shared raincoat',quantity=1,weight_grams=100,bag_id=bag)
    personal=pack.create(name='D16b private camera',quantity=2,packed_quantity=1,weight_grams=350,bag_id=bag,visibility='personal')
    hidden=pack.create(user=case.editor,name='D16b peer-only medicine',quantity=3,weight_grams=500,bag_id=bag,visibility='personal')
    case.sql('insert into public.packing_bag_members(trip_id,bag_id,person_id)values'+','.join('('+lit(case.trip)+','+lit(bag)+','+lit(person)+')' for person in [case.person,case.editor_person]))
    state=pack.state()
    assert {r['id']for r in state['items']}=={common['id'],personal['id']}
    assert state['bags'][0]['total_weight_grams']==2300 and state['unassigned_weight_grams']==0
    for person,name in [(case.person,'D16b viewer'),(case.editor_person,'D16b peer'),(case.viewer_person,'D16b other traveler')]:
        case.sql('update public.people set display_name='+lit(name)+'where id='+lit(person))
    other=case.new_trip('D16b second saved Trip')
    case.sql('insert into public.trip_travelers(trip_id,person_id)values('+lit(other)+','+lit(case.person)+')')
    data['rich_packing']={'common':common['id'],'personal':personal['id'],'hidden':hidden['id'],'bag':bag,'total_weight_grams':2300,'other_trip':other}
    write_fixture(output,data,'12')
    print(profile+': fresh rich synthetic Trip, two visible packing items, one hidden peer item, exact bag total and second Trip; private credentials retained only in the 0600 fixture.')
