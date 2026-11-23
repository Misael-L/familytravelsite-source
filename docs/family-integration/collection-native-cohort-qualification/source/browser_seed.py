from pathlib import Path
import os,json,hashlib
import urllib.parse

def browser_source():
 if os.environ.get('FAMILY_BROWSER_QUALIFIED')=='1':return 'http://127.0.0.1:55331'
 source=os.environ['FAMILY_BROWSER_IMAGE_SOURCE']
 expected_host=os.environ['FAMILY_BROWSER_IMAGE_HOST']
 url=urllib.parse.urlsplit(source)
 if url.scheme!='https' or not url.hostname or url.hostname!=expected_host or url.username or url.password or url.port or url.path or url.query or url.fragment:
  raise ValueError('Use only the explicit isolated image fixture source, without credentials or URL parameters.')
 return source

BROWSER_SOURCE=browser_source()
from collection_library_support import *
# Fresh synthetic Family only. Seed labels are trusted setup, not a public metadata-writer proof.
text=(S/'prepare_live.py').read_text().replace('range(32)','range(3)')
exec(compile(text,str(S/'prepare_live.py'),'exec'))
cfg=json.loads((S/'live-private.json').read_text());f=setup_users();u=f['users']['owner'];cfg['source']=BROWSER_SOURCE;cfg['browser']=True
for id,name in zip(cfg['root_ids'],['Mexico — UI rehearsal','Return visits — UI rehearsal','Recovery — UI rehearsal']):sql('update public.lists set name='+lit(name)+'where id='+lit(id)+'and family_id='+lit(cfg['family_id']))
meta={};asset=None
if os.environ.get('FAMILY_BROWSER_QUALIFIED')!='1':
 meta=json.loads((S/'fixture-images-meta.json').read_text());asset=new();hash=meta['source_hash'];sql('insert into public.media_assets(id,kind,visibility,bucket,storage_path,mime_type,filename,content_hash)values('+lit(asset)+",'image','public_catalog','catalog',"+lit('fixture/'+asset+'.webp')+",'image/webp','synthetic-fixture.webp',"+lit(hash)+')')
 for role in ['thumb','hero']:
  r=meta[role];path='variants/v1/'+hash+'/'+role+'-'+r['sha256']+'.webp';r['path']='/storage/v1/object/public/catalog/'+path;r['url']=cfg['source']+r['path']
  sql('insert into public.media_variants(media_asset_id,source_content_hash,preset,recipe_version,recipe_fingerprint,frame_policy,oriented_width_px,oriented_height_px,output_sha256,bucket,storage_path,public_url,mime_type,size_bytes,width_px,height_px,status)values('+','.join([lit(asset),lit(hash),lit(role),lit('v1'),lit('f'*64),lit('still'),'1600','1000',lit(r['sha256']),lit('catalog'),lit(path),lit(r['url']),lit('image/webp'),str(r['bytes']),str(r['width']),str(r['height']),lit('ready')])+')')
sql('update public.foods set name='+lit('Casa del Pintor (fixture)')+',notes='+lit('Catalog description: a synthetic restaurant for native Collection verification.')+',cover_media_id='+('null' if asset is None else lit(asset))+' where id='+lit(cfg['sources']['food']))
sql('update public.places set name='+lit('Puebla (fixture)')+'where id='+lit(cfg['sources']['place']))
for kind in ['country','place','food','hotel','experience','airport','airline','guide']:author(cfg['root_ids'][0],'create_reference',{'source':{'kind':kind,'id':cfg['sources'][kind]},'notes':'Personal note for '+kind,'status':'idea'},u)
r=author(cfg['root_ids'][1],'create_manual',{'content':manual_content(name='Return dinner',description='Independent manual description',cover_media_id=asset),'notes':'Personal return-visit notes','status':'want'},u)
cfg['images']=meta;cfg['root_names']=['Mexico — UI rehearsal','Return visits — UI rehearsal','Recovery — UI rehearsal'];cfg['manual_item']=r['item_id'];cfg['browser_owner']={k:u[k]for k in ['id','person_id','email','password']}
(S/'browser-private.json').write_text(json.dumps(cfg));(S/'browser-seed-summary.json').write_text(json.dumps({'synthetic_families':1,'browser_roots':3,'catalog_reference_kinds':8,'manual_items':1,'synthetic_ready_variants':len([x for x in meta if x in ['thumb','hero']]),'fixture_image_bytes_local_only':True,'original_source_rows_changed':False,'Storage_uploads':0,'transformations':0,'hosted_changes':False},indent=2)+'\n')
print('Synthetic browser Family and local test-image metadata ready; credentials remain private.')
