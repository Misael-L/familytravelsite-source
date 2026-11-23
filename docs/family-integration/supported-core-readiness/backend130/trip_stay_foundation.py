"""Real guarded local SQL + PostgREST; Auth/session/factor rows are synthetic fixtures."""
from pathlib import Path
import subprocess
import base64,concurrent.futures,hashlib,hmac,json,os,sys,time,unittest,urllib.request,urllib.error,uuid
import trip_stay_foundation_guard as g
S=g.S;_pinned=g.validate();_marker=g.sha(S/'target-private.json');lit=lambda x:"'"+str(x).replace("'","''")+"'";new=lambda:str(uuid.uuid4());USERS={};COUNTERS={'sql':0,'http':0}
def claims(user,aal='aal2'):return {'sub':user,'role':'authenticated','aal':aal,'session_id':USERS[user],'exp':int(time.time())+3600}
def sql(q,user=None,role='authenticated',aal='aal2',fail=False):
 if user:
  assert user in USERS; q="BEGIN;DO $claims$BEGIN PERFORM set_config('request.jwt.claims',"+lit(json.dumps(claims(user,aal)))+",true);END $claims$;SET LOCAL ROLE "+role+';'+q+';COMMIT;'
 elif role!='authenticated':q='BEGIN;SET LOCAL ROLE '+role+';'+q+';COMMIT;'
 COUNTERS['sql']+=1;assert g.sha(S/'target-private.json')==_marker
 r=subprocess.run(['docker','exec','-i',_pinned['id'],'psql','-h','/socket','-X','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U',g.OP,'-d',g.DB],input="SET statement_timeout='40s';SET lock_timeout='5s';"+q,text=True,capture_output=True,timeout=60,env={k:v for k,v in os.environ.items()if not k.startswith(('PG','SUPABASE_'))})
 if fail:return r
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
def rpc(name,args,user=None):return json.loads(sql('select public.'+name+'('+','.join('NULL'if v is None else lit(json.dumps(v))+'::jsonb'if isinstance(v,(dict,list))else lit(v)for v in args)+')',user))
def token(user,aal='aal2',overrides=None):
 cfg=json.loads((S/'rest-private.json').read_text());enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=');body=enc({'alg':'HS256','typ':'JWT'})+'.'+enc(claims(user,aal)| (overrides or {}));return body+'.'+base64.urlsafe_b64encode(hmac.new(cfg['jwt_secret'].encode(),body.encode(),hashlib.sha256).digest()).decode().rstrip('=')
def http(path,body=None,user=None,aal='aal2',method=None,raw_token=None):
 assert path.startswith('/')and '\n'not in path and g.sha(S/'target-private.json')==_marker
 headers=['Content-Type: application/json']
 if user or raw_token:headers+=['Authorization: Bearer '+(raw_token or token(user,aal))]
 config=['silent','show-error','max-time = 30','url = '+json.dumps('http://localhost'+path),'request = '+json.dumps(method or('POST'if body is not None else'GET')),'write-out = "\\n%{http_code}"']
 config+=['header = '+json.dumps(h)for h in headers]
 if body is not None:config+=['data-binary = '+json.dumps(json.dumps(body))]
 COUNTERS['http']+=1;r=subprocess.run(['docker','exec','-i',_pinned['id'],'/usr/bin/curl','--unix-socket','/socket/rest.sock','--config','-'],input='\n'.join(config)+'\n',text=True,capture_output=True,timeout=45)
 if r.returncode:raise RuntimeError('Local HTTP transport failed: '+r.stderr[:200])
 raw,code=r.stdout.rsplit('\n',1);return int(code),json.loads(raw or 'null')

class StayFoundation(unittest.TestCase):
 @classmethod
 def setUpClass(c):
  g.ready();g.validate_http();c.family,c.other_family=new(),new();c.owner,c.editor,c.viewer,c.stranger=[new()for _ in range(4)]
  for u in [c.owner,c.editor,c.viewer,c.stranger]:USERS[u]=new()
  q='BEGIN;'
  for u in USERS:
   q+="insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)values('00000000-0000-0000-0000-000000000000',"+lit(u)+",'authenticated','authenticated',"+lit('stay-'+u+'@fixture.invalid')+",null,now(),'{\"provider\":\"email\",\"providers\":[\"email\"]}','{}',now(),now());"
  q+='insert into public.families(id,name)values('+lit(c.family)+",'Stay synthetic Family'),("+lit(c.other_family)+",'Other synthetic Family');"
  for u in USERS:
   fam=c.other_family if u==c.stranger else c.family;role='patriarch'if u in[c.owner,c.stranger]else'child';factor=new()
   q+='insert into public.family_members(family_id,user_id,role,status)values('+lit(fam)+','+lit(u)+','+lit(role)+",'active');select set_config('family_auth.allow_identity_link','1',true);insert into public.people(family_id,user_id,display_name)values("+lit(fam)+','+lit(u)+",'Stay fixture');insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)values("+lit(factor)+','+lit(u)+",'Synthetic metadata, not enrollment','totp','verified',now(),now(),'SQL fixture only');insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after,factor_id)values("+lit(USERS[u])+','+lit(u)+",now(),now(),'aal2',now()+interval '1 day',"+lit(factor)+');'
  sql(q+'COMMIT;');c.person=sql('select id from public.people where family_id='+lit(c.family)+'and user_id='+lit(c.owner));c.other_person=sql('select id from public.people where user_id='+lit(c.stranger));c.country=sql('select id from public.countries order by id limit 1');assert c.country
  (S/'fixture-private.json').write_text(json.dumps({'family':c.family,'other_family':c.other_family,'users':list(USERS)},indent=2)+'\n')
 def setUp(self):
  self.trip=sql("insert into public.trips(family_id,name,start_at,end_at,created_by_person_id)values("+lit(self.family)+",'Stay read fixture','2027-04-01T00:00Z','2027-04-03T00:00Z',"+lit(self.person)+')returning id');sql('select family_auth.sync_trip_days_before_untimed('+lit(self.trip)+')');self.location=rpc('mutate_family_trip_location_v1',[self.trip,new(),'create',None,None,{'source':{'kind':'manual'},'label':'Manual lodging'}],self.owner)['id'];self.stay=self.add_stay();self.booking=self.add_booking();sql('insert into public.trip_stay_booking_links values('+lit(self.booking)+','+lit(self.stay)+','+lit(self.trip)+')')
 def add_stay(self,extra=''):
  cols='trip_id,family_id,location_id,arrival_date,departure_date,created_by_person_id';vals=','.join(map(lit,[self.trip,self.family,self.location,'2027-04-01','2027-04-03',self.person]))
  if extra:cols+=','+extra.split('=',1)[0];vals+=','+extra.split('=',1)[1]
  return sql('insert into public.trip_stays('+cols+')values('+vals+')returning id')
 def add_booking(self,kind='hotel',extra=''):
  return sql('insert into public.trip_reservations(trip_id,type,title'+(','+extra.split('=',1)[0]if extra else'')+')values('+lit(self.trip)+','+lit(kind)+",'Fixture reservation'"+(','+extra.split('=',1)[1]if extra else'')+')returning id')
 def view(self,user=None):return rpc('get_family_trip_stay_view_v1',[self.trip],user or self.owner)
 def row(self):return json.loads(sql('select to_jsonb(s)from public.trip_stays s where id='+lit(self.stay)))
 def rejected(self,q,code=None,**kw):
  r=sql(q,fail=True,**kw);self.assertNotEqual(r.returncode,0)
  if code:self.assertIn(code,r.stderr)
 def test_01_read_identity_link_and_no_automatic_clocks(self):
  v=self.view();self.assertEqual(v['completeness'],'complete');self.assertEqual(v['capabilities'],{'read':True,'commands':False});r=v['stays'][0];self.assertEqual(r['stay']['id'],self.stay);self.assertEqual(r['link']['reservation_id'],self.booking);self.assertIsNone(r['stay']['check_in_time']);self.assertEqual(r['location']['source']['kind'],'manual');self.assertIsNotNone(r['arrival_day_id'])
 def test_02_real_postgrest_read_and_editor_match_sql(self):
  status,v=http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip},self.owner);self.assertEqual(status,200);self.assertEqual(v,self.view());status,e=http('/rpc/get_family_stay_editor_v1',{'p_trip_id':self.trip,'p_stay_id':self.stay},self.owner);self.assertEqual(status,200);self.assertEqual(e['observation']['stay'],self.row());self.assertFalse(e['capabilities']['commands'])
 def test_03_foreign_and_missing_trip_refuse_without_empty_success(self):
  for trip,user in[(self.trip,self.stranger),(new(),self.owner)]:
   status,v=http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':trip},user);self.assertEqual(status,403);self.assertEqual(v['code'],'42501')
 def test_04_anon_bad_signature_and_service_access_refused(self):
  self.assertIn(http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip})[0],[401,403]);self.assertEqual(http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip},raw_token=token(self.owner)[:-6]+'broken')[0],401)
  self.rejected('select *from public.trip_stays',role='service_role',code='42501')
 def test_05_rls_reads_original_family_only(self):
  self.assertEqual(sql('select count(*)from public.trip_stays where trip_id='+lit(self.trip),self.owner),'1');self.assertEqual(sql('select count(*)from public.trip_stays where trip_id='+lit(self.trip),self.stranger),'0');status,rows=http('/trip_stay_booking_links?trip_id=eq.'+self.trip,user=self.stranger);self.assertEqual((status,rows),(200,[]))
 def test_06_owner_aal1_and_suspended_membership_refuse(self):
  self.assertEqual(http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip},self.owner,aal='aal1')[0],403);sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
  try:self.assertEqual(http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip},self.owner)[0],403)
  finally:sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.owner))
 def test_07_all_clients_lack_table_writes_and_unimplemented_commands(self):
  for role in ['anon','authenticated','service_role']:
   for table in ['trip_stays','trip_stay_booking_links']:
    for perm in ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:self.assertEqual(sql('select has_table_privilege('+lit(role)+','+lit('public.'+table)+','+lit(perm)+')'),'f')
  self.assertEqual(http('/rpc/save_family_stay_v1',{},self.owner)[0],404)
 def test_08_midnight_and_same_day_remain_explicit(self):
  sql("update public.trip_stays set check_in_time='00:00',check_out_time='00:00',departure_date=arrival_date where id="+lit(self.stay));r=self.view()['stays'][0]['stay'];self.assertEqual(r['check_in_time'],'00:00:00');self.assertEqual(r['arrival_date'],r['departure_date'])
 def test_09_invalid_dates_clock_bounds_and_windows_refuse(self):
  for assignment in["departure_date='2027-03-31'","arrival_date='infinity'","check_in_time='24:00'","check_in_window_end='23:00'","check_in_time='22:00',check_in_window_end='02:00'","check_in_window_end_day_offset=2"]:self.rejected('update public.trip_stays set '+assignment+' where id='+lit(self.stay),'23514')
 def test_10_overnight_window_and_named_zone_preserved(self):
  sql("update public.trip_stays set check_in_time='22:00',check_in_window_end='02:00',check_in_window_end_day_offset=1,time_zone='America/Mexico_City'where id="+lit(self.stay));r=self.row();self.assertEqual(r['check_in_window_end_day_offset'],1);self.assertEqual(r['time_zone'],'America/Mexico_City');self.assertIsNone(self.view()['stays'][0]['booking']['record']['starts_at']);self.rejected("update public.trip_stays set time_zone='Bad/Zone'where id="+lit(self.stay),'22023')
 def test_11_repeated_unbooked_and_offcalendar_stays_are_not_omitted(self):
  other=self.add_stay();sql("update public.trip_stays set arrival_date='2027-05-01',departure_date='2027-05-03'where id="+lit(other));v=self.view();self.assertEqual(len(v['stays']),2);r=next(x for x in v['stays']if x['stay']['id']==other);self.assertIsNone(r['link']);self.assertIsNone(r['arrival_day_id'])
 def test_12_city_location_and_foreign_creator_rejected(self):
  city=sql('insert into public.places(name,country_id)values('+lit('Stay fixture city '+new())+','+lit(self.country)+')returning id');loc=rpc('mutate_family_trip_location_v1',[self.trip,new(),'create',None,None,{'source':{'kind':'place','id':city}}],self.owner)['id'];self.rejected('update public.trip_stays set location_id='+lit(loc)+'where id='+lit(self.stay),'23514');self.rejected('update public.trip_stays set created_by_person_id='+lit(self.other_person)+'where id='+lit(self.stay),'23514')
 def test_13_cross_trip_and_nonhotel_link_rejected(self):
  restaurant=self.add_booking('restaurant');unbooked=self.add_stay();self.rejected('insert into public.trip_stay_booking_links values('+lit(restaurant)+','+lit(unbooked)+','+lit(self.trip)+')','23514');self.rejected('insert into public.trip_stay_booking_links values('+lit(restaurant)+','+lit(unbooked)+','+lit(new())+')','23503')
 def test_14_link_uniqueness_and_revision_are_transactional(self):
  r=self.row()['revision'];sql('delete from public.trip_stay_booking_links where stay_id='+lit(self.stay));self.assertEqual(self.row()['revision'],r+1);sql('insert into public.trip_stay_booking_links values('+lit(self.booking)+','+lit(self.stay)+','+lit(self.trip)+')');self.assertEqual(self.row()['revision'],r+2);second=self.add_booking();self.rejected('insert into public.trip_stay_booking_links values('+lit(second)+','+lit(self.stay)+','+lit(self.trip)+')','23505')
 def test_15_linked_booking_and_active_location_cannot_disappear(self):
  self.rejected('delete from public.trip_reservations where id='+lit(self.booking),'23503');self.rejected("update public.trip_reservations set type='restaurant'where id="+lit(self.booking));self.rejected('update public.trip_plan_locations set deleted_at=now(),deleted_by_person_id='+lit(self.person)+'where id='+lit(self.location),'0A000');self.rejected('delete from public.trip_stays where id='+lit(self.stay),'0A000')
 def test_16_stay_trash_hides_but_retains_link_then_restores(self):
  sql('update public.trip_stays set deleted_at=now(),deleted_by_person_id='+lit(self.person)+'where id='+lit(self.stay));self.assertEqual(self.view()['stays'],[]);self.assertEqual(sql('select count(*)from public.trip_stay_booking_links where stay_id='+lit(self.stay)),'1');self.assertEqual(sql('select count(*)from public.trip_stay_booking_links where stay_id='+lit(self.stay),self.owner),'0');self.assertEqual(rpc('get_family_stay_editor_v1',[self.trip,self.stay],self.owner)['state'],'trash');sql('update public.trip_stays set deleted_at=null,deleted_by_person_id=null where id='+lit(self.stay));self.assertEqual(len(self.view()['stays']),1)
 def test_17_trip_trash_freezes_children_and_restore_preserves_graph(self):
  before=self.view()['stays'];rev=sql('select revision from public.trips where id='+lit(self.trip));rpc('trash_family_trip',[self.trip,rev],self.owner);self.assertEqual(http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip},self.owner)[0],403);self.rejected("update public.trip_stays set notes='No'where id="+lit(self.stay),'40001');rev=sql('select revision from public.trips where id='+lit(self.trip));rpc('restore_family_trip',[self.trip,rev],self.owner);self.assertEqual(self.view()['stays'],before)
 def test_18_new_untimed_booking_cannot_become_midnight_by_legacy_write(self):
  self.assertEqual(sql('select timing_kind from public.trip_reservations where id='+lit(self.booking)),'untimed');self.rejected("update public.trip_reservations set starts_at='2027-04-01T00:00Z'where id="+lit(self.booking),'0A000');sql("update public.trip_reservations set notes='Text remains compatible'where id="+lit(self.booking));self.assertIsNone(self.view()['stays'][0]['booking']['record']['starts_at'])
 def test_19_classified_timed_booking_preserves_precision_and_zone(self):
  timed=self.add_booking(extra="starts_at,ends_at,timing_kind,time_zone='2027-04-01T00:00:00.123456Z','2027-04-02T01:00:00.654321Z','timed','America/Mexico_City'");sql("update public.trip_reservations set notes='Clock intact'where id="+lit(timed));self.assertIn('.123456',sql('select starts_at::text from public.trip_reservations where id='+lit(timed)));self.rejected('update public.trip_reservations set time_zone=\'UTC\'where id='+lit(timed),'0A000')
 def test_20_invalid_classification_and_timezone_refuse(self):
  for extra in ["timing_kind='made_up'","timing_kind,time_zone='untimed','UTC'","starts_at,timing_kind,time_zone='2027-04-01T00:00Z','timed','Invalid/Zone'"]:
   with self.assertRaises(RuntimeError):self.add_booking(extra=extra)
 def test_21_private_notes_bound_uses_utf8_bytes(self):
  sql('update public.trip_stays set notes='+lit('é'*10000)+'where id='+lit(self.stay));self.rejected('update public.trip_stays set notes='+lit('é'*10001)+'where id='+lit(self.stay),'23514')
 def test_22_family_export_includes_stays_and_links_without_cross_family(self):
  job=sql('insert into public.family_export_jobs(family_id,requested_by_person_id,requested_by_user_id,expires_at)values('+lit(self.family)+','+lit(self.person)+','+lit(self.owner)+",now()+interval '1 day')returning id");tables=json.loads(sql('select public.build_family_export_v1('+lit(job)+')'))['snapshot']['tables'];self.assertTrue(any(r['id']==self.stay for r in tables['trip_stays']));self.assertTrue(any(r['reservation_id']==self.booking for r in tables['trip_stay_booking_links']));self.assertTrue(all(r['family_id']==self.family for r in tables['trip_stays']))
 def test_23_readers_never_claim_individual_write_commands_available(self):
  for user in[self.owner,self.editor,self.viewer]:self.assertEqual(self.view(user)['capabilities'],{'read':True,'commands':False})
 def test_24_private_helpers_and_service_execution_are_not_public(self):
  for func in ['family_auth.stay_projection(public.trip_stays)','family_auth.tg_stay_guard()','family_auth.tg_stay_booking_guard()','public.get_family_trip_stay_view_v1(uuid)']:
   for role in['anon','service_role']:self.assertEqual(sql('select has_function_privilege('+lit(role)+','+lit(func)+",'EXECUTE')"),'f')
 def test_25_typed_read_functions_have_fixed_search_path_and_security(self):
  self.assertEqual(sql("select count(*)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname in('get_family_trip_stay_view_v1','get_family_stay_editor_v1')and p.prosecdef and p.provolatile='s'and 'search_path=\"\"'=any(p.proconfig)"),'2')
 def test_26_concurrent_claim_for_one_stay_has_one_winner(self):
  extra=self.add_stay();bookings=[self.add_booking(),self.add_booking()]
  def attempt(b):return sql('insert into public.trip_stay_booking_links values('+lit(b)+','+lit(extra)+','+lit(self.trip)+')',fail=True).returncode
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:codes=list(pool.map(attempt,bookings))
  self.assertEqual(codes.count(0),1);self.assertEqual(sql('select count(*)from public.trip_stay_booking_links where stay_id='+lit(extra)),'1')
 def hotel_locations(self):
  city=sql('insert into public.places(name,country_id)values('+lit('Stay hotel city '+new())+','+lit(self.country)+')returning id')
  hotels=[sql('insert into public.hotels(name,country_id,place_id)values('+lit('Stay hotel '+new())+','+lit(self.country)+','+lit(city)+')returning id')for _ in range(2)]
  locations=[rpc('mutate_family_trip_location_v1',[self.trip,new(),'create',None,None,{'source':{'kind':'hotel','id':h}}],self.owner)['id']for h in hotels]
  return city,hotels,locations
 def test_27_known_hotel_booking_cannot_link_to_different_catalog_hotel(self):
  city,hotels,locations=self.hotel_locations();s=self.add_stay();sql('update public.trip_stays set location_id='+lit(locations[0])+'where id='+lit(s));b=self.add_booking(extra='hotel_id,place_id='+lit(hotels[1])+','+lit(city));self.rejected('insert into public.trip_stay_booking_links values('+lit(b)+','+lit(s)+','+lit(self.trip)+')','23514')
 def test_28_linked_hotel_identity_is_checked_from_both_update_directions(self):
  city,hotels,locations=self.hotel_locations();sql('delete from public.trip_stay_booking_links where stay_id='+lit(self.stay));sql('update public.trip_stays set location_id='+lit(locations[0])+'where id='+lit(self.stay));sql('update public.trip_reservations set hotel_id='+lit(hotels[0])+',place_id='+lit(city)+'where id='+lit(self.booking));sql('insert into public.trip_stay_booking_links values('+lit(self.booking)+','+lit(self.stay)+','+lit(self.trip)+')');self.rejected('update public.trip_reservations set hotel_id='+lit(hotels[1])+'where id='+lit(self.booking),'23514');self.rejected('update public.trip_stays set location_id='+lit(locations[1])+'where id='+lit(self.stay),'23514')
 def test_29_known_hotel_booking_cannot_claim_unverifiable_manual_location(self):
  city,hotels,locations=self.hotel_locations();s=self.add_stay();b=self.add_booking(extra='hotel_id='+lit(hotels[0]));self.rejected('insert into public.trip_stay_booking_links values('+lit(b)+','+lit(s)+','+lit(self.trip)+')','23514')
 def test_30_row_bound_is_error_not_truncation(self):
  sql('insert into public.trip_stays(trip_id,family_id,location_id,arrival_date,departure_date,created_by_person_id)select '+','.join(map(lit,[self.trip,self.family,self.location,'2027-04-01','2027-04-03',self.person]))+'from generate_series(1,2000)')
  status,body=http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip},self.owner);self.assertEqual((status,body['code']),(500,'54000'))
 def test_31_byte_bound_is_error_not_partial_success(self):
  sql('insert into public.trip_stays(trip_id,family_id,location_id,arrival_date,departure_date,created_by_person_id,notes)select '+','.join(map(lit,[self.trip,self.family,self.location,'2027-04-01','2027-04-03',self.person]))+",repeat('x',20000)from generate_series(1,430)")
  status,body=http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip},self.owner);self.assertEqual((status,body['code']),(500,'54000'))
 def test_32_revoked_session_and_archived_person_refuse(self):
  sql("update auth.sessions set not_after=now()-interval '1 minute'where id="+lit(USERS[self.owner]))
  try:self.assertEqual(http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip},self.owner)[0],403)
  finally:sql("update auth.sessions set not_after=now()+interval '1 day'where id="+lit(USERS[self.owner]))
  sql('update public.people set archived_at=now()where id='+lit(self.person))
  try:self.assertEqual(http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip},self.owner)[0],403)
  finally:sql('update public.people set archived_at=null where id='+lit(self.person))
 def test_33_missing_malformed_foreign_and_expired_session_claims_refused(self):
  for override in [{'session_id':None},{'session_id':'not-a-uuid'},{'session_id':USERS[self.stranger]},{'session_id':new()}]:
   status,body=http('/rpc/get_family_trip_stay_view_v1',{'p_trip_id':self.trip},raw_token=token(self.owner,overrides=override));self.assertEqual((status,body['code']),(403,'42501'))
   status,rows=http('/trip_stays?trip_id=eq.'+self.trip,raw_token=token(self.owner,overrides=override));self.assertEqual((status,rows),(200,[]))
  self.assertEqual(http('/rpc/get_family_stay_editor_v1',{'p_trip_id':self.trip,'p_stay_id':self.stay},raw_token=token(self.owner,overrides={'exp':int(time.time())-600}))[0],401)
if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(StayFoundation);result=unittest.TextTestRunner(verbosity=2).run(suite);(S/'sql-rest-tests.json').write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'sql_calls':COUNTERS['sql'],'http_calls':COUNTERS['http'],'auth_fixture':'synthetic rows/claims; real PostgREST signature/RLS only'},indent=2)+'\n');sys.exit(not result.wasSuccessful())
