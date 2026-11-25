import { packingList } from '__ROOT__/client/src/integrations/family/packingContract';
import { act, renderHook } from '__ROOT__/node_modules/@testing-library/react/dist/index.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { canonicalPackingList, canonicalPackingRow, packingFixtureId as id, packingFixtureAt as at } from '__ROOT__/client/tests/helpers/familyPacking';
import { buildTrip, buildUser } from '__ROOT__/client/tests/helpers/factories';
import { buildPlanner } from '__ROOT__/client/tests/helpers/mobileTrip';
import { cleanup, render, screen, fireEvent } from '__ROOT__/client/tests/helpers/render';
import { resetAllStores } from '__ROOT__/client/tests/helpers/store';
import { packingApi, tripsApi } from '__ROOT__/client/src/api/client';
import PackingListPanel from '__ROOT__/client/src/components/Packing/PackingListPanel';
import { usePackingBags } from '__ROOT__/client/src/components/Packing/usePackingBags';
import { usePackingBagTracking } from '__ROOT__/client/src/components/Packing/usePackingSnapshot';
import MBagsSheet from '__ROOT__/client/src/mobile/screens/trip/tabs/MBagsSheet';
import { installPlannerPackingPort, packingGroupActionsAvailable } from '__ROOT__/client/src/repo/plannerPackingPort';
import { installReadOnlySession } from '__ROOT__/client/src/db/readOnlySession';
import { useTripStore } from '__ROOT__/client/src/store/tripStore';
import { useAuthStore } from '__ROOT__/client/src/store/authStore';
import { useTranslation } from '__ROOT__/client/src/i18n';
import { FamilyIdentityRegistry } from '__ROOT__/client/src/integrations/family/identity';
import { projectPacking } from '__ROOT__/client/src/integrations/family/plannerPacking';
const toast=vi.hoisted(()=>({error:vi.fn(),success:vi.fn(),warning:vi.fn(),info:vi.fn()}));
vi.mock('__ROOT__/client/src/components/shared/Toast',()=>({useToast:()=>toast}));
vi.mock('__ROOT__/client/src/components/Packing/useBagTotalsPing',()=>({useBagTotalsPing:()=>{}}));
vi.mock('__ROOT__/client/src/components/Plugins/PluginContributions',()=>({usePluginViewContributions:()=>()=>[],PluginCardFooter:()=>null}));
let stop:()=>void,readOnly:(()=>void)|undefined,native:number,view:ReturnType<typeof projectPacking>&{unassigned_weight_grams:number},retired:boolean;
let listeners:Set<()=>void>;
const raw=vi.fn();
beforeEach(()=>{
 resetAllStores();retired=false;listeners=new Set();raw.mockReset();toast.error.mockReset();
 const p=canonicalPackingList();p.items=[canonicalPackingRow({id:id(30),name:'D1 visible coat',quantity:2,weight_grams:100,is_private:false,owner_person_id:null,bag_id:id(20),recipient_person_ids:[],contributor_person_ids:[]})];
 p.bags=[{id:id(20),trip_id:p.scope.trip_id,name:'D1 shared bag',color:'#6366f1',weight_limit_grams:7000,sort_order:0,created_at:at,updated_at:at,member_person_ids:[p.scope.person_id],total_weight_grams:1200}];p.unassigned_weight_grams=1000;p.category_assignees={};
 const ids=new FamilyIdentityRegistry(p.scope.user_id);native=ids.register('trip',p.scope.trip_id);view={...projectPacking(p,ids,[{personId:p.scope.person_id,displayName:'D1 carrier'}]),unassigned_weight_grams:1000};
 useTripStore.setState({trip:buildTrip({id:native}),packingItems:view.items});useAuthStore.setState({user:buildUser({id:1}),isAuthenticated:true});
 stop=installPlannerPackingPort({bind:raw,packed:raw,reorder:raw,snapshot:()=>retired?null:view,subscribe:fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},trashPage:raw,restore:raw,reconcile:raw});
 for(const name of ['listBags','createBag','updateBag','deleteBag','setBagMembers']as const)vi.spyOn(packingApi,name).mockImplementation(raw);
 vi.spyOn(tripsApi,'getMembers').mockResolvedValue({owner:null,members:[]}as never);
});
afterEach(()=>{cleanup();readOnly?.();readOnly=undefined;stop();vi.restoreAllMocks();});
const options=()=>({tripId:native,bagTrackingEnabled:true,t:(key:string)=>key,toast});
it('Family bags and authoritative hidden-inclusive totals come from one stable coupled publication',()=>{
 const f=renderHook(()=>usePackingBags(options()));expect(f.result.current.bags).toEqual(view.bags);expect(f.result.current.bags[0].total_weight_grams).toBe(1200);expect(f.result.current.unassignedWeightGrams).toBe(1000);expect(f.result.current.serverWeightsFresh).toBe(true);expect(raw).not.toHaveBeenCalled();
});
it.each(['create','update','delete','members']as const)('qualified %s refuses legacy HTTP before any effect',async kind=>{
 const f=renderHook(()=>usePackingBags(options())),before=structuredClone(view);
 await act(async()=>{if(kind==='create')expect(await f.result.current.createBag('New')).toBeUndefined();if(kind==='update')await f.result.current.updateBag(view.bags[0].id,{name:'Changed'});if(kind==='delete')await f.result.current.deleteBag(view.bags[0].id);if(kind==='members')await f.result.current.setBagMembers(view.bags[0].id,[42]);});
 expect(raw).not.toHaveBeenCalled();expect(view).toEqual(before);expect(f.result.current.bags).toEqual(before.bags);expect(toast.error).toHaveBeenCalledTimes(1);
});
it('a retained old bag callback never borrows a newer Trip or missing port',async()=>{
 const f=renderHook(()=>usePackingBags(options())),save=f.result.current.updateBag;act(()=>{stop();useTripStore.setState({trip:buildTrip({id:native+1})});});await act(async()=>save(view.bags[0].id,{name:'late'}));for(const name of ['createBag','updateBag','deleteBag','setBagMembers']as const)expect(packingApi[name]).not.toHaveBeenCalled();
});
it('retiring the publication removes bags and totals rather than falling back to legacy reads',()=>{
 const f=renderHook(()=>usePackingBags(options()));act(()=>{retired=true;for(const fn of listeners)fn();});expect(f.result.current.bags).toEqual([]);expect(f.result.current.unassignedWeightGrams).toBeNull();expect(f.result.current.serverWeightsFresh).toBe(false);expect(raw).not.toHaveBeenCalled();
});
it('saved read-only leases refuse every management path and preserve the captured values',async()=>{
 readOnly=installReadOnlySession();const f=renderHook(()=>usePackingBags(options()));await act(async()=>{await f.result.current.createBag('no');await f.result.current.updateBag(view.bags[0].id,{name:'no'});await f.result.current.deleteBag(view.bags[0].id);await f.result.current.setBagMembers(view.bags[0].id,[]);});expect(raw).not.toHaveBeenCalled();expect(f.result.current.bags).toEqual(view.bags);expect(packingGroupActionsAvailable(true)).toBe(false);
});
it('bag tracking follows the qualified publication and retires with it',()=>{const f=renderHook(()=>usePackingBagTracking(native));expect(f.result.current).toBe(true);act(()=>{retired=true;for(const fn of listeners)fn();});expect(f.result.current).toBe(false);});
function Phone(){const {t}=useTranslation();return <MBagsSheet planner={buildPlanner({tripId:native,packingItems:view.items,t,toast,can:()=>true})} open onClose={()=>{}} bags={view.bags} unassignedWeightGrams={1000} serverWeightsFresh items={view.items} tripMembers={[]} canEdit={packingGroupActionsAvailable(true)} currentUserId={1} onCreateBag={raw} onUpdateBag={raw} onDeleteBag={raw} onSetBagMembers={raw}/>;}
for(const phone of [false,true])for(const saved of [false,true])it((phone?'phone':'desktop')+(saved?' saved':' live')+' actual bag surface retains totals with unsupported management hidden',()=>{
 if(saved)readOnly=installReadOnlySession();render(phone?<Phone/>:<PackingListPanel tripId={native} items={view.items}/>);
 if(!phone){const buttons=screen.getAllByRole('button',{name:'Bags'});fireEvent.click(buttons[0]);}
 expect(screen.getAllByText('D1 shared bag',{exact:true}).length).toBeGreaterThan(0);expect(screen.getAllByText(/1\.2 kg/).length).toBeGreaterThan(0);expect(screen.queryByText('D1 hidden peer item')).toBeNull();expect(screen.queryByRole('button',{name:/add bag/i})).toBeNull();expect(screen.queryByRole('button',{name:/delete bag/i})).toBeNull();expect(raw).not.toHaveBeenCalled();
});

it('adding lifecycle columns through a whole-row bag JSON projection breaks the existing strict packing parser',()=>{
 const packet=canonicalPackingList();packet.items=[];packet.bags=[{id:id(20),trip_id:packet.scope.trip_id,name:'D1 bag',color:null,weight_limit_grams:null,sort_order:0,created_at:at,updated_at:at,member_person_ids:[],total_weight_grams:0}];
 expect(packingList.safeParse(packet).success).toBe(true);
 const extended=structuredClone(packet);Object.assign(extended.bags[0],{revision:1,deleted_at:null,deleted_by_person_id:null});expect(packingList.safeParse(extended).success).toBe(false);
 const explicit=structuredClone(extended);const {revision,deleted_at,deleted_by_person_id,...legacy}=explicit.bags[0]as typeof explicit.bags[0]&{revision:number;deleted_at:null;deleted_by_person_id:null};void revision;void deleted_at;void deleted_by_person_id;explicit.bags[0]=legacy;expect(packingList.safeParse(explicit).success).toBe(true);
});
