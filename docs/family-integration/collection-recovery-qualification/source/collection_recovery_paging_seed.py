"""Synthetic owned fixture only. Trusted seed sets tied microsecond Trash clocks;
actual observed public Restore/authorization contracts are tested separately.
No trigger, policy or production bypass is installed or changed.
"""
from collection_library_support import *
def seed_recovery():
 f=setup_users();u=f['users']['owner'];fam=f['family'];claims=json.loads(base64.urlsafe_b64decode(u['session']['access_token'].split('.')[1]+'=='))
 def trusted(q):return sql("begin;select set_config('request.jwt.claims',"+lit(json.dumps(claims))+",true);"+q+';commit;')
 roots=json.loads(sql("select json_agg(public.create_family_list("+lit(fam)+",'Recovery root '||x))from generate_series(1,55)x",u))
 c=rpc('create_family_list',{'family_id':fam,'name':'Recovery saved locations'},u);items=[new()for _ in range(55)]
 vals=','.join('('+lit(id)+','+lit(c)+",'manual','Synthetic saved location','Saved personal note',"+str(n)+')'for n,id in enumerate(items))
 trusted('insert into public.list_items(id,list_id,item_kind,name,notes,sort_order)values'+vals+';insert into public.list_item_locations(item_id,list_id,family_id,description)select id,list_id,'+lit(fam)+",'Synthetic independent description'from public.list_items where list_id="+lit(c))
 def deleted(ids,kind,collection=None):
  table='lists'if kind=='collection'else'list_items';idsql=','.join(lit(v)+'::uuid'for v in ids)
  return trusted('insert into family_auth.collection_lifecycle_permits(transaction_id,collection_id,target_kind,target_id,actor_user_id,action)select pg_current_xact_id(),'+('id'if collection is None else lit(collection)+'::uuid')+','+lit(kind)+',id,'+lit(u['id'])+"::uuid,'trash'from public."+table+' where id in('+idsql+');update public.'+table+" set deleted_at='2050-01-01T00:00:00.123456Z'::timestamptz-case when get_byte(uuid_send(id),15)%2=0 then interval'1 microsecond'else interval'0'end,deleted_by_user_id="+lit(u['id'])+'where id in('+idsql+');delete from family_auth.collection_lifecycle_permits where transaction_id=pg_current_xact_id()')
 deleted(roots,'collection');deleted(items,'item',c)
 hc=rpc('create_family_list',{'family_id':fam,'name':'Recovery history'},u);hi=new()
 trusted('insert into public.list_items(id,list_id,item_kind,name,notes)values('+lit(hi)+','+lit(hc)+",'manual','History saved location','History note 0');insert into public.list_item_locations(item_id,list_id,family_id,description)values("+lit(hi)+','+lit(hc)+','+lit(fam)+",'History description 0')")
 for i in range(1,56):
  trusted('update public.lists set name='+lit('History root '+str(i))+'where id='+lit(hc)+';update public.list_items set notes='+lit('History note '+str(i))+'where id='+lit(hi)+';update public.list_item_locations set description='+lit('History description '+str(i))+'where item_id='+lit(hi))
 ordered=lambda table,ids:json.loads(sql('select json_agg(id order by deleted_at desc,id)from public.'+table+' where id in('+','.join(lit(v)+'::uuid'for v in ids)+')'))
 return {'collection_id':c,'item_ids':ordered('list_items',items),'root_ids':ordered('lists',roots),'history_collection_id':hc,'history_item_id':hi,'root_revisions':json.loads(sql('select json_agg(revision order by revision desc)from family_auth.collection_root_versions where collection_id='+lit(hc))),'item_revisions':json.loads(sql('select json_agg(revision order by revision desc)from family_auth.collection_item_versions where item_id='+lit(hi)))}
if __name__=='__main__':
 (S/'recovery-private.json').write_text(json.dumps(seed_recovery()));print('Synthetic55-root/55-item/56-version recovery fixture seeded; no media bytes or hosted data accessed.')
