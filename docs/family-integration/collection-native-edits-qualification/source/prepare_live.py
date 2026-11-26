"""Synthetic fixture setup only; actual new transport commands run through the JS SDK."""
from collection_library_support import *
f=setup_users();users=f['users'];owner=users['owner'];family=f['family'];ids=[]
for index in range(32):ids.append(rpc('create_family_list',{'family_id':family,'name':'Transport fixture '+str(index)},owner))
country=sql("insert into public.countries(name,iso2,iso3)select 'Transport fixture country',code,code||'Q'from(select chr(a)||chr(b)code from generate_series(65,90)a cross join generate_series(65,90)b)c where not exists(select 1 from public.countries x where x.iso2=c.code or x.iso3=c.code||'Q')limit 1 returning id")
place=sql('insert into public.places(name,country_id,notes,latitude,longitude,coord_source)values('+lit('Transport fixture city')+','+lit(country)+",'Catalog city',19.043798,-98.198151,'curated')returning id")
food=sql('insert into public.foods(name,notes,link_url,address,latitude,longitude,place_id)values('+lit('Transport fixture restaurant')+",'Catalog description','https://example.invalid/','Venue street',21.12345678,-100.12345678,"+lit(place)+')returning id')
sources={'country':country,'place':place,'food':food}
for kind,table in [('hotel','hotels'),('experience','experiences'),('airline','airlines'),('guide','guides')]:sources[kind]=sql('insert into public.'+table+'(name)values('+lit('Transport fixture '+kind+' '+uuid.uuid4().hex[:12])+')returning id')
sources['airport']=sql("insert into public.airports(name,iata_code)select 'Transport fixture airport',code from(select chr(a)||chr(b)||chr(c)code from generate_series(65,90)a cross join generate_series(65,90)b cross join generate_series(65,90)c)t where not exists(select 1 from public.airports x where x.iata_code=t.code)limit 1 returning id")
fresh=okay('/token?grant_type=password',{'email':owner['email'],'password':owner['password']},auth=True)
asset=new();path=family+'/lists/'+ids[0]+'/'+asset+'.webp';sql('insert into public.media_assets(id,kind,visibility,bucket,storage_path,filename,content_hash,mime_type,size_bytes,family_id)values('+lit(asset)+",'image','family','family',"+lit(path)+",'private.webp',"+lit(uuid.uuid4().hex*2)+",'image/webp',64,"+lit(family)+')')
cfg={'source':'https://fixture.invalid','directory':str(S),'bridge':str(S/'bridge.py'),'anon_key':API['anon_key'],'family_id':family,'root_ids':ids,'sources':sources,'private_media_id':asset,'sessions':{name:{'user_id':u['id'],'person_id':u['person_id'],'session':u['session']}for name,u in users.items()},'fresh':fresh}
(S/'live-private.json').write_text(json.dumps(cfg));print('Synthetic live SDK fixture ready; credentials stay in the private fixture file.')

if os.environ.get('FAMILY_COLLECTION_RECOVERY_SEED')=='1':
 from collection_recovery_paging_seed import seed_recovery
 cfg['recovery']=seed_recovery();(S/'live-private.json').write_text(json.dumps(cfg));print('Extended recovery fixture ready with55 roots/items and56 historical versions.')

if os.environ.get('FAMILY_COLLECTION_EDIT_SEED')=='1':
 cfg['shared_root']=rpc('create_family_list',{'family_id':family,'name':'Shared editor concurrency fixture','visibility':'family'},users['reviewer'])
 (S/'live-private.json').write_text(json.dumps(cfg));print('Shared editor fixture ready; separate linked member credentials remain private.')
