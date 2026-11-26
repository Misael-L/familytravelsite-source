"""Real isolated PostgreSQL/Auth category foundation tests; metadata writes are trusted rehearsal SQL, not a new API."""
from pathlib import Path
import concurrent.futures,json,uuid,unittest,hashlib,urllib.parse
from packing_groups import PackingGroups,lit

class CategoryFoundation(PackingGroups):
 def packet(self,user=None):return self.rpc('get_family_trip_packing_with_categories_v1',[self.trip],user)
 def category(self,item):return self.sql('select category_id from public.packing_items where id='+lit(item))
 def metadata(self,statement):
  # PostgreSQL takes an UPDATE row lock before its row trigger. The future command must acquire this mutex FIRST.
  return self.sql('begin;select pg_advisory_xact_lock(hashtextextended(\'trip-recovery:\'||'+lit(self.trip)+"::text,0));select 1 from public.trips where id="+lit(self.trip)+'for no key update;select 1 from family_auth.trip_packing_state where trip_id='+lit(self.trip)+'for update;'+statement+';commit;')
 def rename(self,category,name):return self.metadata('update public.packing_categories set name='+lit(name)+'where id='+lit(category))
 def foundation(self):
  return {'old':self.full_graph(),'categories':json.loads(self.sql("select coalesce(jsonb_agg(to_jsonb(c)order by id),'[]')from public.packing_categories c where trip_id="+lit(self.trip))),
   'assignments':json.loads(self.sql("select coalesce(jsonb_agg(to_jsonb(c)order by category_id,person_id),'[]')from public.packing_category_assignments c where trip_id="+lit(self.trip))),
   'root':json.loads(self.sql('select to_jsonb(t)from public.trips t where id='+lit(self.trip)))}
 def assign(self,category,person=None,provenance=False):
  fields=[self.trip,category,person or self.viewer_person]
  self.metadata('insert into public.packing_category_assignments(trip_id,category_id,person_id,assigned_at,assigned_by_person_id)values('+','.join(map(lit,fields))+(",clock_timestamp(),"+lit(self.person)if provenance else',null,null')+')')
 def test_c01_same_label_distinguishes_common_and_two_personal_owners(self):
  self.policy('trip.packing.manage','trip_travelers')
  a=self.create(category='Gear');b=self.create(category='Gear',visibility='personal');c=self.create(user=self.editor,category='Gear',visibility='personal')
  self.assertEqual(len({self.category(x['id'])for x in [a,b,c]}),3)
  own=self.packet();peer=self.packet(self.editor)
  self.assertEqual({x['item_id']for x in own['item_categories']},{a['id'],b['id']});self.assertEqual({x['item_id']for x in peer['item_categories']},{a['id'],c['id']})
 def test_c02_exact_labels_default_case_spaces_unicode_and_reserved(self):
  labels=['','Other','Gear','gear',' Gear ','é','e\u0301','__proto__','constructor','toString','😀'*200]
  rows=[self.create(category=x)for x in labels];self.assertEqual(len({self.category(x['id'])for x in rows}),len(labels))
  self.assertEqual({x['name']for x in self.packet()['categories']},set(labels))
  with self.assertRaisesRegex(RuntimeError,'22023|23514'):self.create(category='😀'*201)
 def test_c03_old_v1_shapes_and_coupled_observations(self):
  row=self.create(category='Gear');p=self.packet();old=self.state()
  self.assertEqual(p['packing'],old);self.assertEqual(p['scope'],old['scope']);self.assertEqual(p['collection_revision'],old['collection_revision'])
  self.assertEqual(set(p),{'version','scope','collection_revision','packing','categories','item_categories','people'})
  self.assertNotIn('category_id',old['items'][0]);self.assertEqual(p['item_categories'],[{'item_id':row['id'],'category_id':self.category(row['id'])}])
  self.assertEqual(set(p['categories'][0]),{'id','trip_id','owner_person_id','name','revision','created_at','updated_at','assignments'})
 def test_c04_legacy_item_category_move_and_retry_preserve_contract(self):
  row=self.create(category='Gear');before=self.category(row['id']);args=self.args('update',{'category':'Clothes'},target=row['id']);a=self.rpc('execute_family_trip_packing_v1',args)
  self.assertNotEqual(self.category(row['id']),before);state=self.foundation();self.assertEqual(self.rpc('execute_family_trip_packing_v1',args),a);self.assertEqual(self.foundation(),state)
  self.assertNotIn('category_id',a['item'])
 def test_c05_metadata_rename_retains_identity_and_trash_facts(self):
  a=self.create(category='Gear');b=self.create(category='Gear');cat=self.category(a['id']);self.execute('trash',target=b['id']);trashed=self.row(b['id']);self.assign(cat,provenance=True)
  assignment=self.foundation()['assignments'];self.rename(cat,'New gear')
  self.assertEqual(self.category(a['id']),cat);self.assertEqual(self.row(b['id']),trashed);self.assertEqual(self.foundation()['assignments'],assignment)
  self.assertEqual(self.state()['items'][0]['category'],'New gear');self.assertGreater(self.row(a['id'])['revision'],a['revision'])
  self.assertEqual(self.state()['category_assignees'],{'New gear':[self.viewer_person]})
 def test_c06_restore_after_rename_uses_original_category_and_final_revision(self):
  row=self.create(category='Gear');cat=self.category(row['id']);self.execute('trash',target=row['id']);before=self.row(row['id']);self.rename(cat,'Restored gear')
  page=self.rpc('list_family_trip_packing_trash_v1',[self.trip,50,None,None]);self.assertEqual(page['items'][0]['category'],'Restored gear');self.assertNotIn('category_id',page['items'][0])
  result=self.execute('restore',target=row['id']);after=self.row(row['id']);self.assertEqual(after['category_id'],cat);self.assertEqual(after['category'],'Restored gear');self.assertEqual(after['revision'],before['revision']+1);self.assertEqual(result['item']['revision'],after['revision'])
 def test_c07_old_receipts_and_digests_remain_historical(self):
  args=self.args('create',{'name':'Original','category':'Gear'});result=self.rpc('execute_family_trip_packing_v1',args)
  original=self.sql('select to_jsonb(r)from family_auth.packing_command_receipts r where operation_id='+lit(args[1]));self.rename(self.category(result['item']['id']),'Renamed')
  self.assertEqual(self.sql('select to_jsonb(r)from family_auth.packing_command_receipts r where operation_id='+lit(args[1])),original)
  self.assertEqual(self.rpc('execute_family_trip_packing_v1',args),result);self.assertEqual(self.rpc('get_family_trip_packing_receipt_v1',[self.trip,args[1]])['result'],result)
 def test_c08_common_historical_owner_is_not_private_scope(self):
  a=self.create(category='Gear');self.sql('update public.packing_items set owner_person_id='+lit(self.person)+'where id='+lit(a['id']))
  c=self.packet()['categories'][0];self.assertIsNone(c['owner_person_id']);self.assertFalse(self.row(a['id'])['is_private']);self.assertEqual(self.row(a['id'])['owner_person_id'],self.person)
 def test_c09_cross_trip_and_owner_links_refuse_atomically(self):
  self.policy('trip.packing.manage','trip_travelers');a=self.create(category='Gear');peer=self.create(user=self.editor,visibility='personal',category='Gear');other=self.new_trip('Other category Trip')
  before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'23503'):self.sql('update public.packing_items set category_id='+lit(self.category(peer['id']))+'where id='+lit(a['id']))
  self.assertEqual(self.foundation(),before)
  with self.assertRaisesRegex(RuntimeError,'23514|23503'):self.metadata('update public.packing_categories set trip_id='+lit(other)+'where id='+lit(self.category(a['id'])))
  self.assertEqual(self.foundation(),before)
 def test_c10_scoped_collision_never_merges_or_loses_assignments(self):
  a=self.create(category='A');self.create(category='B');cat=self.category(a['id']);self.assign(cat);before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'23505'):self.rename(cat,'B')
  self.assertEqual(self.foundation(),before)
 def test_c11_owned_personal_rename_does_not_change_peer_or_common(self):
  self.policy('trip.packing.manage','trip_travelers');a=self.create(category='Gear');b=self.create(category='Gear',visibility='personal');c=self.create(user=self.editor,category='Gear',visibility='personal')
  common=self.row(a['id']);peer=self.row(c['id']);self.rename(self.category(b['id']),'Own only');self.assertEqual(self.row(a['id']),common);self.assertEqual(self.row(c['id']),peer)
 def test_c12_private_assignment_refused_without_changing_access(self):
  a=self.create(category='Private',visibility='personal');before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'23503'):self.assign(self.category(a['id']),self.editor_person)
  self.assertEqual(self.foundation(),before);self.assertEqual(self.packet(self.editor)['categories'],[])
 def test_c13_normalized_and_legacy_assignment_mirrors_preserve_provenance(self):
  a=self.create(category='Gear');cat=self.category(a['id']);self.assign(cat,provenance=True);original=self.foundation()['assignments']
  self.assertEqual(self.state()['category_assignees'],{'Gear':[self.viewer_person]});self.assertEqual(self.graph()['packing_category_assignees'][0]['person_id'],self.viewer_person)
  self.sql('update public.packing_category_assignees set category_name=category_name where trip_id='+lit(self.trip));self.assertEqual(self.foundation()['assignments'],original)
  self.rename(cat,'Renamed');self.assertEqual(self.foundation()['assignments'],original)
  self.metadata('delete from public.packing_category_assignments where category_id='+lit(cat));self.assertEqual(self.graph()['packing_category_assignees'],[]);self.assertEqual(self.state()['category_assignees'],{})
 def test_c14_archived_unchanged_assignment_survives_rename_and_can_be_removed(self):
  a=self.create(category='Gear');cat=self.category(a['id']);self.assign(cat,provenance=True);original=self.foundation()['assignments'];self.sql('update public.people set archived_at=now()where id='+lit(self.viewer_person))
  try:
   self.rename(cat,'Archive-safe');self.assertEqual(self.foundation()['assignments'],original);self.assertFalse(next(p for p in self.packet()['people']if p['id']==self.viewer_person)['eligible'])
   self.metadata('delete from public.packing_category_assignments where category_id='+lit(cat))
   with self.assertRaisesRegex(RuntimeError,'23503'):self.assign(cat)
  finally:self.sql('update public.people set archived_at=null where id='+lit(self.viewer_person))
 def test_c15_guest_and_assignment_only_label_classification(self):
  guest=self.sql("begin;select set_config('family_auth.allow_identity_link','1',true);insert into public.people(family_id,display_name)values("+lit(self.family)+",'Guest traveler')returning id;commit;").splitlines()[-1]
  self.sql('insert into public.trip_travelers(trip_id,person_id)values('+lit(self.trip)+','+lit(guest)+')')
  self.sql('insert into public.packing_category_assignees(trip_id,category_name,person_id)values('+','.join(map(lit,[self.trip,'Empty responsibility',guest]))+')')
  self.assertEqual(self.packet()['categories'],[]);self.assertEqual(self.state()['category_assignees'],{'Empty responsibility':[guest]})
  self.create(category='Empty responsibility');person=next(p for p in self.packet()['people']if p['id']==guest);self.assertTrue(person['is_guest']);self.assertTrue(person['eligible'])
 def test_c16_assignment_actor_and_provenance_are_immutable(self):
  a=self.create(category='Gear');cat=self.category(a['id']);self.assign(cat,provenance=True);before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'23514'):self.metadata('update public.packing_category_assignments set assigned_at=now()where category_id='+lit(cat))
  self.assertEqual(self.foundation(),before)
 def test_c17_foreign_family_assignee_refuses_with_no_partial_effect(self):
  a=self.create(category='Gear');cat=self.category(a['id']);before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'23503'):self.assign(cat,str(uuid.uuid4()))
  self.assertEqual(self.foundation(),before)
 def test_c18_metadata_noop_changes_no_rows_revisions_audits_or_root(self):
  a=self.create(category='Gear');before=self.foundation();self.rename(self.category(a['id']),'Gear');self.assertEqual(self.foundation(),before)
 def test_c19_category_identity_and_revision_are_server_managed(self):
  a=self.create(category='Gear');cat=self.category(a['id']);before=self.foundation()
  for patch in ['revision=revision+1','owner_person_id='+lit(self.person),'id='+lit(str(uuid.uuid4()))]:
   with self.assertRaisesRegex(RuntimeError,'23514'):self.metadata('update public.packing_categories set '+patch+' where id='+lit(cat))
   self.assertEqual(self.foundation(),before)
 def test_c20_permanent_deletion_and_parent_cascades_are_unavailable(self):
  a=self.create(category='Gear');before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'0A000'):self.metadata('delete from public.packing_categories where id='+lit(self.category(a['id'])))
  self.assertEqual(self.foundation(),before)
 def test_c21_new_http_reader_and_raw_tables_under_real_auth(self):
  a=self.create(category='Gear');code,body=self.http('POST','/rest/v1/rpc/get_family_trip_packing_with_categories_v1',{'p_trip_id':self.trip});self.assertEqual(code,200,body[:180]);self.assertEqual(json.loads(body),self.packet())
  for table in ['packing_categories','packing_category_assignments']:
   for verb in ['GET','POST']:
    code,_=self.http(verb,'/rest/v1/'+table,{}if verb=='POST'else None);self.assertEqual(code,403)
 def test_c22_real_aal1_owner_and_revoked_membership_cannot_read(self):
  self.create(category='Gear');code,body=self.http('POST','/auth/v1/token?grant_type=password',{'email':'p01-'+self.owner+'@fixture.invalid','password':'local-only'});self.assertEqual(code,200)
  token=json.loads(body)['access_token'];code,_=self.http('POST','/rest/v1/rpc/get_family_trip_packing_with_categories_v1',{'p_trip_id':self.trip},token=token);self.assertEqual(code,403)
  self.sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
  try:
   code,_=self.http('POST','/rest/v1/rpc/get_family_trip_packing_with_categories_v1',{'p_trip_id':self.trip});self.assertEqual(code,403)
  finally:self.sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
 def test_c23_rls_recipient_sees_only_a_referenced_personal_category(self):
  a=self.create(category='Visible private',visibility='personal');b=self.create(category='Hidden private',visibility='personal')
  self.sql('insert into public.packing_item_recipients(trip_id,item_id,person_id)values('+','.join(map(lit,[self.trip,a['id'],self.editor_person]))+')')
  view=self.packet(self.editor);self.assertEqual({c['name']for c in view['categories']},{'Visible private'});self.assertNotIn(self.category(b['id']),json.dumps(view))
  claims=json.dumps({'sub':self.editor,'role':'authenticated','aal':'aal2'})
  text=self.sql('begin;grant select on public.packing_categories,public.packing_category_assignments to authenticated;select set_config(\'request.jwt.claims\','+lit(claims)+',true);set local role authenticated;select jsonb_agg(id order by id)from public.packing_categories where trip_id='+lit(self.trip)+';rollback;')
  self.assertEqual(json.loads(text.splitlines()[-1]),[self.category(a['id'])]);self.assertEqual(self.sql("select has_table_privilege('authenticated','public.packing_categories','SELECT')"),'f')
 def test_c24_unauthorized_trip_people_and_history_are_not_enumerated(self):
  a=self.create(category='Hidden personal',visibility='personal');self.assign(self.category(self.create(category='Common')['id']))
  view=self.packet(self.editor);self.assertNotIn(self.category(a['id']),json.dumps(view));self.assertNotIn(self.person,{p['id']for p in view['people']})
  with self.assertRaisesRegex(RuntimeError,'42501'):self.packet(self.stranger)
 def test_c25_metadata_change_conflicts_old_item_and_group_originals(self):
  a=self.create(category='Gear');args=self.group_args();item_args=self.args('update',{'name':'Stale'},target=a['id']);self.rename(self.category(a['id']),'Current');before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.group(args)
  with self.assertRaisesRegex(RuntimeError,'PT409'):self.rpc('execute_family_trip_packing_v1',item_args)
  self.assertEqual(self.foundation(),before);out=self.group(self.group_args(categories=['Current']));self.assertTrue(out['items'][0]['checked'])
 def test_c26_trip_trash_restore_retains_categories_assignments_and_freezes_writes(self):
  a=self.create(category='Gear');cat=self.category(a['id']);self.assign(cat,provenance=True);before=self.foundation();rev=before['root']['revision'];self.rpc('trash_family_trip',[self.trip,rev])
  with self.assertRaisesRegex(RuntimeError,'42501'):self.packet()
  with self.assertRaisesRegex(RuntimeError,'40001'):self.rename(cat,'Wrong')
  root=json.loads(self.sql('select to_jsonb(t)from public.trips t where id='+lit(self.trip)));self.rpc('restore_family_trip',[self.trip,root['revision']]);after=self.foundation()
  for key in ['categories','assignments']:self.assertEqual(after[key],before[key])
  self.assertEqual(after['old']['packing']['packing_items'],before['old']['packing']['packing_items'])
 def test_c27_export_includes_normalized_links_without_peer_private_categories(self):
  a=self.create(category='Common');b=self.create(category='Hidden private',visibility='personal');cat=self.category(a['id']);self.assign(cat,provenance=True)
  job=self.sql('insert into public.family_export_jobs(family_id,requested_by_person_id,requested_by_user_id,expires_at)values('+','.join(map(lit,[self.family,self.editor_person,self.editor]))+",now()+interval '1 day')returning id")
  tables=json.loads(self.sql('select public.build_family_export_v1('+lit(job)+')'))['snapshot']['tables']
  self.assertIn(cat,{c['id']for c in tables['packing_categories']});self.assertNotIn(self.category(b['id']),json.dumps(tables['packing_categories']));self.assertTrue(any(a['category_id']==cat and a['person_id']==self.viewer_person for a in tables['packing_category_assignments']))
  for item in tables['packing_items']:self.assertIn(item['category_id'],{c['id']for c in tables['packing_categories']})
 def test_c28_collection_overflow_rolls_back_metadata_and_compatibility(self):
  a=self.create(category='Gear');self.sql('update family_auth.trip_packing_state set collection_revision=9007199254740991 where trip_id='+lit(self.trip));before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'54000'):self.rename(self.category(a['id']),'Overflow')
  self.assertEqual(self.foundation(),before)
 def test_c29_late_assignment_failure_is_atomic(self):
  a=self.create(category='Gear');cat=self.category(a['id']);self.assign(cat,provenance=True);before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'23503'):self.metadata('delete from public.packing_category_assignments where category_id='+lit(cat)+';insert into public.packing_category_assignments(trip_id,category_id,person_id)values('+','.join(map(lit,[self.trip,cat,str(uuid.uuid4())]))+')')
  self.assertEqual(self.foundation(),before)
 def test_c30_menus_remain_gated_no_new_category_write_endpoint_or_raw_grants(self):
  self.assertEqual(self.sql("select to_regprocedure('public.execute_family_trip_packing_category_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb)')is null"),'t')
  for role in ['anon','authenticated','service_role']:
   for table in ['packing_categories','packing_category_assignments']:
    self.assertEqual(self.sql("select has_table_privilege("+lit(role)+','+lit('public.'+table)+",'SELECT,INSERT,UPDATE,DELETE')"),'f')
  self.assertEqual(self.sql("select prosecdef from pg_proc where oid='public.get_family_trip_packing_with_categories_v1(uuid)'::regprocedure"),'f')
 def test_c31_metadata_obeys_existing_group_mutex_without_partial_publication(self):
  a=self.create(category='Gear');cat=self.category(a['id']);args=self.group_args()
  with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
   with self.held_authenticated_command(self.statement(args))as pid:
    future=pool.submit(self.rename,cat,'After group');self.wait_for_lock(self.trip,pid)
   future.result(timeout=15)
  self.assertTrue(self.row(a['id'])['checked']);self.assertEqual(self.state()['items'][0]['category'],'After group')
  result=self.receipt(args[1])['result'];self.assertEqual(result['items'][0]['category'],'Gear')
 def test_c32_future_columns_do_not_leak_into_strict_item_or_category_packets(self):
  a=self.create(category='Gear');cat=self.category(a['id'])
  text=self.sql("begin;alter table public.packing_items add column accidental_future_field text;alter table public.packing_categories add column accidental_future_field text;select jsonb_build_object('item_leak',family_auth.packing_item_json(i)?'accidental_future_field','category_leak',family_auth.packing_category_json(c)?'accidental_future_field')from public.packing_items i join public.packing_categories c on c.id=i.category_id where i.id="+lit(a['id'])+';rollback;')
  self.assertEqual(json.loads(text.splitlines()[-1]),{'item_leak':False,'category_leak':False})
  self.assertEqual(self.sql("select count(*)from information_schema.columns where table_schema='public'and table_name in('packing_items','packing_categories')and column_name='accidental_future_field'"),'0')
 def guest(self):return self.sql("begin;select set_config('family_auth.allow_identity_link','1',true);insert into public.people(family_id,display_name)values("+lit(self.family)+",'Synthetic reference Person')returning id;commit;").splitlines()[-1]
 def test_c33_empty_category_owner_cannot_move_to_another_family(self):
  person=self.guest();cat=self.sql('insert into public.packing_categories(trip_id,owner_person_id,name)values('+','.join(map(lit,[self.trip,person,'Retained empty personal category']))+')returning id');other=self.sql("insert into public.families(name)values('Other synthetic Family')returning id")
  before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'23514'):self.sql('update public.people set family_id='+lit(other)+'where id='+lit(person))
  self.assertEqual(self.foundation(),before);self.assertEqual(self.sql('select family_id from public.people where id='+lit(person)),self.family)
 def test_c34_assignment_author_reference_cannot_move_to_another_family(self):
  person=self.guest();a=self.create(category='Gear');cat=self.category(a['id']);self.metadata('insert into public.packing_category_assignments(trip_id,category_id,person_id,assigned_at,assigned_by_person_id)values('+','.join(map(lit,[self.trip,cat,self.viewer_person]))+',now(),'+lit(person)+')')
  other=self.sql("insert into public.families(name)values('Other synthetic provenance Family')returning id");before=self.foundation()
  with self.assertRaisesRegex(RuntimeError,'23514'):self.sql('update public.people set family_id='+lit(other)+'where id='+lit(person))
  self.assertEqual(self.foundation(),before);self.assertEqual(self.sql('select family_id from public.people where id='+lit(person)),self.family)
