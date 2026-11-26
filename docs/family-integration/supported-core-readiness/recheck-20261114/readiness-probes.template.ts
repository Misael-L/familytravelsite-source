import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { familyRepositoryFixture } from '__ROOT__/client/tests/helpers/familyRepository';
import { resetAllStores } from '__ROOT__/client/tests/helpers/store';
import { resetOfflineTestDatabase } from '__ROOT__/client/tests/helpers/offlineDb';
import api from '__ROOT__/client/src/api/client';
import { setAuthed } from '__ROOT__/client/src/sync/authGate';
import { currentPlannerPackingPort } from '__ROOT__/client/src/repo/plannerPackingPort';
import { currentPlannerTaskPort } from '__ROOT__/client/src/repo/plannerTaskPort';
import { currentPlannerEditorPort } from '__ROOT__/client/src/repo/plannerEditorPort';
import { currentPlannerReadPort } from '__ROOT__/client/src/repo/plannerReadPort';
import { currentSourcePolicy } from '__ROOT__/client/src/db/sourceDatabase';
import { createFamilyApplicationHandler } from '__ROOT__/client/src/integrations/family/applicationHandler';
import { FamilyIdentityRegistry } from '__ROOT__/client/src/integrations/family/identity';
import { compiledFeatureMap } from '__ROOT__/client/src/integrations/family/legacy/data/supabase/familyFeatures';
import { useFamilyFeatureStore } from '__ROOT__/client/src/integrations/family/legacy/store/familyFeatureStore';
import { installFamilyNativeSourceOwnership } from '__ROOT__/client/src/integrations/family/nativeSourceOwnership';
import { offlineTripQualificationEnabled, packingCategoryQualificationEnabled, packingIdentityQualificationEnabled, packingAggregateQualificationEnabled, packingBagQualificationEnabled, packingRecoveryQualificationEnabled } from '__ROOT__/client/src/integrations/family/offlineTripQualification';
import { familyDeviceRecoveryAvailable } from '__ROOT__/client/src/integrations/family/deviceRecoveryGate';
import { installFamilyPlanner } from '__ROOT__/client/src/integrations/family/plannerBootstrap';
import { plannerActionAvailable } from '__ROOT__/client/src/integrations/family/plannerActionAvailability';
import { type FamilyPermissionController, familyCanDo } from '__ROOT__/client/src/integrations/family/uiPermissions';
import { createFamilyAxiosAdapter, createFamilyFetch } from '__ROOT__/client/src/integrations/family/transport';
import {coherentStayQualificationEnabled,nativeStayWriteQualificationEnabled,nativeStayCommandQualificationEnabled,nativeStayControlsQualificationEnabled} from '__ROOT__/client/src/integrations/family/coherentStayQualification';
import {v4PrivateFileSource} from '__ROOT__/client/src/integrations/family/offlineTripQualification';
const original = api.defaults.adapter;
const flags = ['VITE_FAMILY_STAY_READ_QUALIFICATION','VITE_FAMILY_STAY_WRITE_QUALIFICATION','VITE_FAMILY_STAY_COMMAND_QUALIFICATION','VITE_FAMILY_STAY_CONTROLS_QUALIFICATION','VITE_FAMILY_PRIVATE_FILE_QUALIFICATION','VITE_FAMILY_OFFLINE_READ_QUALIFICATION','VITE_FAMILY_PACKING_IDENTITY_QUALIFICATION','VITE_FAMILY_PACKING_AGGREGATE_QUALIFICATION','VITE_FAMILY_PACKING_BAG_QUALIFICATION','VITE_FAMILY_PACKING_RECOVERY_QUALIFICATION'];
const fid='60000000-0000-4000-8000-000000000001';
function fixture() { const ids = new FamilyIdentityRegistry(fid); return familyRepositoryFixture(fid,()=>ids,{}); }
const stops:(()=>void)[]=[];
beforeEach(async()=>{resetAllStores();await resetOfflineTestDatabase();setAuthed(true);vi.stubEnv('VITE_DATA_PLANE','supabase');vi.stubEnv('VITE_SUPABASE_URL','https://readiness.example.invalid');for(const f of flags)vi.stubEnv(f,'');});
afterEach(async()=>{for(const stop of stops.splice(0).reverse())stop();api.defaults.adapter=original;vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();setAuthed(false);await resetOfflineTestDatabase();});
function modes(){return {cold:offlineTripQualificationEnabled(),categories:packingCategoryQualificationEnabled(),identity:packingIdentityQualificationEnabled(),aggregate:packingAggregateQualificationEnabled(),bags:packingBagQualificationEnabled(),bagRecovery:packingRecoveryQualificationEnabled(),deviceRecovery:familyDeviceRecoveryAvailable()};}
describe('actual default and strict-local selectors',()=>{
 for(const source of ['https://readiness.example.invalid','http://127.0.0.1:56041','http://127.0.0.1:55931','http://127.0.0.1:55331','http://localhost:56041'])
 it(`ordinary build on ${source} enables no local-only features`,()=>{vi.stubEnv('VITE_SUPABASE_URL',source);expect(Object.values(modes()).every(x=>!x)).toBe(true);const stop=installFamilyNativeSourceOwnership();expect(currentSourcePolicy()).toBeNull();stop();});
 for(const source of ['https://readiness.example.invalid','http://localhost:56041','http://127.0.0.1:56041/','http://127.0.0.1:56042'])
 it(`qualification strings cannot activate a foreign hosted/alias source ${source}`,()=>{vi.stubEnv('VITE_SUPABASE_URL',source);for(const f of flags)vi.stubEnv(f,f.includes('IDENTITY')?'local-v2':f.includes('AGGREGATE')?'local-v3':'local-v1');expect(Object.values(modes()).every(x=>!x)).toBe(true);});
 it('F1 strict local128 qualifies recovery, but does not qualify cold reads or source ownership',()=>{vi.stubEnv('VITE_SUPABASE_URL','http://127.0.0.1:56041');vi.stubEnv('VITE_FAMILY_PACKING_RECOVERY_QUALIFICATION','local-v1');expect(modes()).toEqual({cold:false,categories:false,identity:false,aggregate:false,bags:false,bagRecovery:true,deviceRecovery:false});const stop=installFamilyNativeSourceOwnership();expect(currentSourcePolicy()).toBeNull();stop();});
 it('the actual default bootstrap installs planner, task and base packing ports without bag management',async()=>{const repo=fixture();await repo.session();const binding=installFamilyPlanner(repo,createFamilyApplicationHandler(repo));stops.push(binding.dispose);expect(currentPlannerReadPort()).not.toBeNull();expect(currentPlannerEditorPort()).not.toBeNull();expect(currentPlannerTaskPort()).not.toBeNull();expect(currentPlannerPackingPort()).not.toBeNull();expect(currentPlannerPackingPort()?.bags).toBeUndefined();expect(currentPlannerPackingPort()?.terminalRecoveryMode?.()).toBe(false);expect(currentPlannerPackingPort()?.categoryIdentityMode?.()).toBe(false);});
 for(const action of ['day_edit','place_edit','reservation_edit'])it(`default ${action} is an available observed contract`,()=>expect(plannerActionAvailable(action)).toBe(true));
 for(const action of ['budget_edit','file_upload','file_edit','file_delete','trip_title_edit','trip_dates_edit','trip_delete'])it(`native planner ${action} remains unavailable despite an arbitrary server grant`,()=>expect(plannerActionAvailable(action)).toBe(false));
 for(const action of ['todo_edit','packing_edit'])for(const outcome of ['direct','propose','deny'])it(`${action} requires current direct authority, not ${outcome} alone`,()=>{const controller={gov:{actionOutcomes:{[action==='todo_edit'?'trip.todos.manage':'trip.packing.manage']:outcome}},supportsAction:()=>true,isCurrent:()=>true}as unknown as FamilyPermissionController;expect(familyCanDo(action,controller)).toBe(outcome==='direct');expect(familyCanDo(action,{...controller,isCurrent:()=>false})).toBe(false);});
});
describe('visible scope and known connector gaps through the real adapter',()=>{
 async function app(){const repo=fixture();await repo.session();api.defaults.adapter=createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));const forward=vi.fn(async()=>{throw Error('Provider fallback forbidden');});vi.stubGlobal('fetch',createFamilyFetch(createFamilyApplicationHandler(repo),forward,window.location.origin));return{repo,forward};}
 it('global links preserve Family flags and unsupported tools stay absent',async()=>{useFamilyFeatureStore.setState({features:{...compiledFeatureMap(),vacay:true,journey:true,collections:true}});await app();const {addons}=(await api.get('/addons')).data;expect(addons.filter((a:{type:string})=>a.type==='global').map((a:{id:string})=>a.id).sort()).toEqual(['atlas','collections','journey','vacay']);for(const id of ['roadtrip','tours','collab','studio'])expect(addons.some((a:{id:string})=>a.id===id)).toBe(false);});
 it('disabled Family global domains remain unavailable in navigation metadata',async()=>{useFamilyFeatureStore.setState({features:{...compiledFeatureMap(),vacay:false,journey:false,collections:false}});await app();const {addons}=(await api.get('/addons')).data;expect(addons.filter((a:{type:string})=>a.type==='global').map((a:{id:string})=>a.id)).toEqual(['atlas']);});
 for(const path of ['/maps/pois','/maps/route','/addons/atlas/bucket-list/item'])it(`${path} has no connected backend; this is a readiness gap, not feature acceptance`,async()=>{const {forward}=await app();await expect(api.get(path)).rejects.toMatchObject({response:{status:501}});expect(forward).not.toHaveBeenCalled();});
 it('native autocomplete is an empty compatibility response, not a search result proof',async()=>{const {forward}=await app();expect((await api.get('/maps/autocomplete',{params:{q:'Puebla'}})).data).toEqual({suggestions:[],source:'family'});expect(forward).not.toHaveBeenCalled();});
 for(const path of ['/addons/atlas/bucket-list','/addons/atlas/regions','/atlas-layers'])it(`${path} returns an empty compatibility result, not populated feature acceptance`,async()=>{await app();const data=(await api.get(path)).data;expect(data).toEqual(path==='/addons/atlas/bucket-list'?{items:[]}:path==='/atlas-layers'?{layers:[]}:{regions:{}});});
});

describe('current 5.1.4 stay and private-file availability',()=>{
 function stayModes(){return {read:coherentStayQualificationEnabled(),existingWriter:nativeStayWriteQualificationEnabled(),command:nativeStayCommandQualificationEnabled(),controls:nativeStayControlsQualificationEnabled(),private:v4PrivateFileSource(String(import.meta.env.VITE_SUPABASE_URL))};}
 for(const source of ['https://readiness.example.invalid','http://localhost:57171','http://127.0.0.1:57172'])it('cannot activate current stay/private qualifiers on '+source,()=>{vi.stubEnv('VITE_SUPABASE_URL',source);vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION','local-native-v1');vi.stubEnv('VITE_FAMILY_STAY_CONTROLS_QUALIFICATION','local-native-v1');vi.stubEnv('VITE_FAMILY_PRIVATE_FILE_QUALIFICATION','local-v4');expect(Object.values(stayModes()).every(x=>!x)).toBe(true);});
 it('ordinary native rehearsal source alone grants nothing',()=>{vi.stubEnv('VITE_SUPABASE_URL','http://127.0.0.1:57171');expect(Object.values(stayModes()).every(x=>!x)).toBe(true);});
 it('private marker alone grants nothing',()=>{vi.stubEnv('VITE_SUPABASE_URL','http://127.0.0.1:57171');vi.stubEnv('VITE_FAMILY_PRIVATE_FILE_QUALIFICATION','local-v4');expect(Object.values(stayModes()).every(x=>!x)).toBe(true);});
 it('native command/read qualification does not imply native controls or private files',()=>{vi.stubEnv('VITE_SUPABASE_URL','http://127.0.0.1:57171');vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION','local-native-v1');expect(stayModes()).toEqual({read:true,existingWriter:false,command:true,controls:false,private:false});});
 it('combined native control qualification still does not imply private files',()=>{vi.stubEnv('VITE_SUPABASE_URL','http://127.0.0.1:57171');vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION','local-native-v1');vi.stubEnv('VITE_FAMILY_STAY_CONTROLS_QUALIFICATION','local-native-v1');expect(stayModes()).toEqual({read:true,existingWriter:false,command:true,controls:true,private:false});});
 it('private RAM qualification requires both exact source and separate markers',()=>{vi.stubEnv('VITE_SUPABASE_URL','http://127.0.0.1:57171');vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION','local-native-v1');vi.stubEnv('VITE_FAMILY_PRIVATE_FILE_QUALIFICATION','local-v4');expect(stayModes()).toEqual({read:true,existingWriter:false,command:true,controls:false,private:true});});
});
