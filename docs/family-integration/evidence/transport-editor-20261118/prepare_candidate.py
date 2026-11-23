from pathlib import Path
import subprocess,json,ctypes,os,shutil,hashlib
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');A=T/'original-checkout';B=T/'candidate-checkout';b=json.loads((T/'before-private.json').read_text());view,form,shared,test=json.loads((T/'application-paths.json').read_text());assert not A.exists()and not B.exists();assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=W,text=True).strip()==b['head'];A.mkdir();p=subprocess.Popen(['git','archive',b['head']],cwd=W,stdout=subprocess.PIPE);r=subprocess.run(['tar','-xf','-','-C',str(A)],stdin=p.stdout);p.stdout.close();assert p.wait()==r.returncode==0
lib=ctypes.CDLL('/usr/lib/libSystem.B.dylib',use_errno=True);clone=lib.clonefile;clone.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint32];clone.restype=ctypes.c_int;metadata=lib.copyfile;metadata.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_void_p,ctypes.c_uint32];metadata.restype=ctypes.c_int
P=T/'prototype-clone-probe';P.mkdir();s=P/'source';c=P/'clone';s.write_bytes(b'Q118 source copy isolation');assert clone(os.fsencode(s),os.fsencode(c),1)==0 and s.stat().st_ino!=c.stat().st_ino and s.stat().st_nlink==c.stat().st_nlink==1;c.write_bytes(b'clone changed');assert s.read_bytes()==b'Q118 source copy isolation';shutil.rmtree(P)
def copy(a,z):
 assert clone(os.fsencode(a),os.fsencode(z),1)==0 and metadata(os.fsencode(a),os.fsencode(z),None,7|(1<<18)|(1<<19))==0;return z
shutil.copytree(A,B,copy_function=copy)
s=(A/view).read_text();prefix=s[:s.index('const TYPE_OPTIONS:')];options=s[s.index('const TYPE_OPTIONS:'):s.index('type FlightWaypoint')];waypoints=s[s.index('type FlightWaypoint'):s.index('function pickFromEndpoint')];local=s[s.index('function pickFromEndpoint'):s.index('function asDayId')];asday=s[s.index('function asDayId'):s.index('const EMPTY_ENDPOINT')];parent=s[s.index('const EMPTY_ENDPOINT'):s.index('function TransportManualForm(')];forms=s[s.index('function TransportManualForm('):]
parent_imports="""import { TramFront } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type ReactElement } from 'react';
import { lookupAirportByIata } from '../../data/supabase/airports';
import type { FamilyTripDay } from '../../data/supabase/tripDays';
import { unlinkExpenseReservation, type FamilyTripExpense } from '../../data/supabase/tripExpenses';
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces';
import { costCategoryForTransportType, isTransportManualType, upsertTripTransport, type FamilyExpensePrefill, type FamilyTransportDraft, type FamilyTransportEndpointDraft, type FamilyTransportReservation, type ReservationStatus, type TransportManualType } from '../../data/supabase/tripReservations';
import { useTranslation } from '../../i18n';
import { formatDate } from '../../utils/formatters';
import FamilyFileAttach from '../Files/FamilyFileAttach';
import CustomSelect from '../shared/CustomSelect';
import { DialogButton, FooterSpacer } from '../shared/DialogShell';
import Modal, { type ModalFocusScope } from '../shared/Modal';
import { useToast } from '../shared/Toast';
import { BookingDialogHeader, StatusPill, TypePill } from './bookings/BookingDialogShell';
import type { FamilyAirportPick } from './FamilyAirportSelect';
import { TransportManualForm } from './FamilyTransportManualForm';
import { asDayId, emptyFlight, emptyStation, type FlightWaypoint, type StationWaypoint } from './familyTransportWaypoints';

"""
form_imports="""import { Bike, Bus, Car, CarTaxiFront, Pencil, Plane, Plus, Route, Sailboat, Ship, Train, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { FamilyTripExpense } from '../../data/supabase/tripExpenses';
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces';
import type { ReservationStatus, TransportManualType } from '../../data/supabase/tripReservations';
import { useTranslation } from '../../i18n';
import { formatMoney } from '../../utils/formatters';
import { catMeta } from '../Budget/costsCategories';
import CustomSelect from '../shared/CustomSelect';
import CustomTimePicker from '../shared/CustomTimePicker';
import { INPUT, LABEL, Segmented } from '../shared/dialogParts';
import FamilyAirportSelect from './FamilyAirportSelect';
import { asDayId, emptyFlight, emptyStation, type FlightWaypoint, type StationWaypoint } from './familyTransportWaypoints';

"""
comment='/**'+prefix.split('/**',1)[1].split('*/',1)[0]+'*/\n'
(B/view).write_text(comment+parent_imports+local+parent.rstrip()+'\n');(B/form).write_text(form_imports+options+forms.replace('function TransportManualForm(', 'export function TransportManualForm(',1));exports=waypoints.replace('type FlightWaypoint','export type FlightWaypoint',1).replace('type StationWaypoint','export type StationWaypoint',1).replace('function emptyFlight','export function emptyFlight',1).replace('function emptyStation','export function emptyStation',1)+asday.replace('function asDayId','export function asDayId',1);(B/shared).write_text("import type { FamilyAirportPick } from './FamilyAirportSelect';\n\n"+exports.rstrip()+'\n');shutil.copyfile(T/'editor.test.tsx',B/test)
subprocess.run(['/Users/Misael/.nvm/versions/node/v24.22.2/bin/node',str(T/'format_candidate.mjs')],check=True);shutil.copyfile(B/test,A/test)
for D in [A,B]:
 for n in ['node_modules','client/node_modules','family-backend/node_modules']:
  if(W/n).exists():(D/n).symlink_to(W/n,target_is_directory=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();assert prefix+options+waypoints+local+asday+parent+forms==s;assert all(sha(A/f)==h for f,h in b['website_tracked'].items())and all(sha(B/f)==h for f,h in b['website_tracked'].items()if f!=view)
assert (B/view).read_text()[(B/view).read_text().index('function pickFromEndpoint'):]==local+parent.rstrip()+'\n';assert (B/form).read_text()[(B/form).read_text().index('const TYPE_OPTIONS:'):].replace('export function TransportManualForm(', 'function TransportManualForm(',1)==options+forms
actual=(B/shared).read_text();actual=actual[actual.index('export type FlightWaypoint'):].replace('export type ','type ').replace('export function ','function ');assert actual+'\n'==waypoints+asday
(T/'original-editor-fragments.json').write_text(json.dumps({'prefix':prefix,'options':options,'waypoints':waypoints,'local':local,'asday':asday,'parent':parent,'forms':forms},indent=2)+'\n')
p={'passed':True,'changed_source':view,'new_sources':[form,shared],'new_test':test,'original_sha256':sha(A/view),'prototype_sha256':sha(B/view),'new_source_sha256':{f:sha(B/f)for f in [form,shared]},'new_test_sha256':sha(A/test),'complete_parent_body_public_props_and_business_helpers_exact':True,'all_five_form_route_expense_component_bodies_exact':True,'waypoint_types_factories_and_conversion_exact_except_exports':True,'lookup_and_field_constants_exact':True,'inverse_reconstruction_exact':True,'no_original_test_changed':True,'all_other_tracked_source_bytes_exact':len(b['website_tracked'])-1,'fresh_COW_source_copy_independence_passed':True,'all_four_changed_files_formatted_before_testing':True};(T/'prototype-proof.json').write_text(json.dumps(p,indent=2)+'\n');print('Exact-body, formatted transport editor prototypes prepared.')
