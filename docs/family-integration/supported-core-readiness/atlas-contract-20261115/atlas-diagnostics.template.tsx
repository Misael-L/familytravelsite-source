import { cleanup, screen, fireEvent } from '__ROOT__/client/tests/helpers/render';
import api from '__ROOT__/client/src/api/client';
import AtlasPage from '__ROOT__/client/src/pages/AtlasPage';
import MAtlasStatsCard from '__ROOT__/client/src/mobile/screens/atlas/MAtlasStatsCard';
import MAtlasBucketSheet from '__ROOT__/client/src/mobile/screens/atlas/MAtlasBucketSheet';
import { createFamilyApplicationHandler } from '__ROOT__/client/src/integrations/family/applicationHandler';
import { FamilyFrontendRepository, FamilyApiError } from '__ROOT__/client/src/integrations/family/repository';
import { createFamilyAxiosAdapter } from '__ROOT__/client/src/integrations/family/transport';
import * as supabaseClient from '__ROOT__/client/src/integrations/family/legacy/data/supabase/client';
import { useAuthStore as nativeAuth } from '__ROOT__/client/src/store/authStore';
import { buildUser } from '__ROOT__/client/tests/helpers/factories';

vi.mock('__ROOT__/client/src/components/Layout/Navbar', () => ({default: () => <nav />}));
vi.mock('__ROOT__/client/src/integrations/family/runtime', () => ({isFamilyFrontendActive: () => true, activateFamilyFrontend() {}}));

const id = (n: number) => `f5b00000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const session = { userId:id(1), personId:id(2), familyId:id(3), user:{username:'Fixture member',email:'member@example.invalid',avatar_url:null,created_at:'2026-01-01'} };
const geo = {type:'FeatureCollection',features:[{type:'Feature',properties:{ISO_A2:'MX',ADM0_A3:'MEX',NAME:'Mexico'},geometry:{type:'Polygon',coordinates:[[[-100,18],[-98,18],[-98,20],[-100,20],[-100,18]]]}}]};
const originalAdapter=api.defaults.adapter;
let atlas: ReturnType<typeof useAtlas>;
let statsRow: unknown;
let calls: {table:string; filters:unknown[]}[];
let handler: ReturnType<typeof createFamilyApplicationHandler>;

function fakeReadClient() {
  return {from(table:string) {
    const entry={table,filters:[] as unknown[]};calls.push(entry);
    const result=()=>table==='family_travel_stats' ? statsRow : table==='family_country_visited' ? {data:[{country_id:id(4)}],error:null} : table==='countries' ? {data:[{iso2:'mx'}],error:null} : (()=>{throw new Error('Unexpected table '+table)})();
    const q={select:(_columns:string)=>q,eq:(key:string,value:unknown)=>{entry.filters.push([key,value]);return q},in:(key:string,value:unknown)=>{entry.filters.push([key,value]);return q},maybeSingle:()=>Promise.resolve(result()),then:(resolve: (r:unknown)=>unknown,reject:(e:unknown)=>unknown)=>Promise.resolve(result()).then(resolve,reject)};
    return q;
  }};
}
function Probe({phone=false}:{phone?:boolean}) {
  atlas=useAtlas();
  return phone ? <><MAtlasStatsCard stats={atlas.stats}/><MAtlasBucketSheet atlas={atlas} open onClose={()=>{}}/></> : <output>{JSON.stringify({data:atlas.data,loading:atlas.loading})}</output>;
}
async function mount(phone=false) {
  const view=render(<Probe phone={phone}/>);
  await waitFor(()=>expect(atlas.loading).toBe(false));
  await waitFor(()=>expect(atlas.geoData?.features).toHaveLength(1));
  return view;
}
beforeEach(()=>{
  lf.reset();resetAllStores();
  seedStore(useSettingsStore,{settings:buildSettings({dark_mode:false,language:'en'})});
  seedStore(nativeAuth,{user:buildUser(),isAuthenticated:true});
  calls=[];statsRow={data:{total_trips:7,total_places:8,total_days:12},error:null};
  vi.stubEnv('VITE_DATA_PLANE','supabase');vi.stubEnv('VITE_SUPABASE_URL','https://atlas.example.invalid');
  vi.spyOn(supabaseClient,'getSupabaseBrowserClient').mockReturnValue(fakeReadClient() as ReturnType<typeof supabaseClient.getSupabaseBrowserClient>);
  const repo=new FamilyFrontendRepository(async()=>session);
  handler=createFamilyApplicationHandler(repo);
  api.defaults.adapter=createFamilyAxiosAdapter(handler);
  server.use(http.get(/admin0\.geojson(?:\.gz)?.*$/,()=>HttpResponse.json(geo)));
});
afterEach(()=>{cleanup();api.defaults.adapter=originalAdapter;vi.restoreAllMocks();vi.unstubAllEnvs();});

if(process.env.ATLAS_CONTRACT_MODE!=='wanted')describe('Atlas current contract-gap diagnostics; not feature acceptance',()=>{
  it('real reader and handler preserve totals/visited code but invent per-country zero counts',async()=>{
    const r=await api.get('/addons/atlas/stats');
    expect(r.data).toEqual({countries:[{code:'MX',tripCount:0,placeCount:0,status:'visited'}],stats:{totalTrips:7,totalPlaces:8,totalCountries:1,totalDays:12}});
    expect(calls.find(c=>c.table==='family_travel_stats')?.filters).toEqual([['family_id',session.familyId]]);
    expect(calls.find(c=>c.table==='family_country_visited')?.filters).toEqual([['family_id',session.familyId]]);
  });
  it('unsupported native bucket/regions/layers currently acknowledge empty200 results',async()=>{
    for(const [url,body]of [['/addons/atlas/bucket-list',{items:[]}],['/addons/atlas/regions',{regions:{}}],['/addons/atlas/regions/geo/MX',{type:'FeatureCollection',features:[]}],['/atlas-layers',{layers:[]}]]) {
      const r=await api.get(String(url));expect(r.status).toBe(200);expect(r.data).toEqual(body);
    }
  });
  it('actual hook consumes real Family totals and geography with current empty compatibility responses',async()=>{
    await mount();expect(atlas.stats.totalTrips).toBe(7);expect(atlas.countries[0].code).toBe('MX');expect(atlas.bucketList).toEqual([]);expect(atlas.regionsVisited).toBe(0);expect(atlas.pluginLayers).toEqual([]);
  });
  it('simply refusing unsupported bucket would discard successful stats while keeping geometry',async()=>{
    api.defaults.adapter=createFamilyAxiosAdapter(r=>r.pathname==='/addons/atlas/bucket-list'?Promise.reject(new FamilyApiError(501,'atlas_unavailable','Unavailable')):handler(r));
    await mount();expect(atlas.data).toBeNull();expect(atlas.stats.totalTrips).toBe(0);expect(calls.some(c=>c.table==='family_travel_stats')).toBe(true);expect(atlas.geoData?.features).toHaveLength(1);
  });
  it('failed stats become default zero totals, not a visible read error state',async()=>{
    statsRow={data:null,error:new Error('Synthetic stats unavailable')};
    await mount(true);expect(atlas.data).toBeNull();expect(atlas.stats.totalTrips).toBe(0);
    const label=screen.getByText(atlas.t('atlas.trips',{count:0}));expect(label.parentElement?.textContent).toContain('0');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('actual phone bucket sheet renders empty guidance and city zero despite unavailable facts',async()=>{
    await mount(true);
    expect(screen.getByText(atlas.t('atlas.bucketEmpty'))).toBeInTheDocument();
    const label=screen.getByText(atlas.t('atlas.cities',{count:0}));expect(label.parentElement?.textContent).toContain('0');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('actual desktop renders unknown city/region metrics as zero and bucket empty guidance',async()=>{
    render(<><Probe/><AtlasPage/></>);
    await waitFor(()=>expect(screen.getAllByText(atlas.t('atlas.cities',{count:0})).length).toBeGreaterThan(0));
    const cities=screen.getAllByText(atlas.t('atlas.cities',{count:0}));for(const label of cities)expect(label.parentElement?.textContent).toContain('0');
    const regions=screen.getAllByText(atlas.t('atlas.regions',{count:0}));for(const label of regions)expect(label.parentElement?.textContent).toContain('0');
    const tab=screen.getByRole('button',{name:atlas.t('atlas.bucketTab')});fireEvent.click(tab);
    expect(screen.getByText(atlas.t('atlas.bucketEmptyHint'))).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('existing unsupported Atlas writes still refuse through real handler/adapter',async()=>{
    for(const [url,method]of [['/addons/atlas/bucket-list','post'],['/addons/atlas/country/MX/mark','post'],['/addons/atlas/region/MX-PUE/mark','delete']]) {
      await expect(api.request({url,method,data:{name:'Synthetic'}})).rejects.toMatchObject({response:{status:501}});
    }
  });
});

if(process.env.ATLAS_CONTRACT_MODE==='wanted')describe('Atlas desired repair contract; expected failures on unchanged baseline',()=>{
  it('unsupported Family bucket read must refuse instead of promising authoritative empty data',async()=>{
    await expect(api.get('/addons/atlas/bucket-list')).rejects.toMatchObject({response:{status:501}});
  });
  it('successful statistics must survive an unavailable independent bucket read',async()=>{
    api.defaults.adapter=createFamilyAxiosAdapter(r=>r.pathname==='/addons/atlas/bucket-list'?Promise.reject(new FamilyApiError(501,'atlas_unavailable','Unavailable')):handler(r));
    await mount();expect(atlas.stats.totalTrips).toBe(7);
  });
  it('the actual phone metric consumer must not display unknown city count as measured zero',async()=>{
    await mount(true);
    const label=screen.getByText(atlas.t('atlas.cities',{count:0}));
    expect(label.previousElementSibling?.textContent?.trim()).not.toBe('0');
  });
});
