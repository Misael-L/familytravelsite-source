\set ON_ERROR_STOP on
\if :{?commit_seed}
\else
  \set commit_seed false
\endif

-- Supply the designated trip ID, approved family ID, and verified organizer identity.
-- An operator inserts the new Trip and its published Tour. Feature commands run
-- as the organizer through the normal authenticated database functions.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

select set_config('family.preview_trip_id', :'trip_id', true) as selected_trip,
       set_config('family.preview_family_id', :'family_id', true) as selected_family,
       set_config('request.jwt.claims', jsonb_build_object(
         'sub', :'organizer_user_id'::uuid, 'role', 'authenticated', 'aal', 'aal2',
         'session_id', :'organizer_session_id'::uuid
       )::text, true) as actor_claims
\gset

do $$
declare
  target uuid := current_setting('family.preview_trip_id')::uuid;
  family uuid := current_setting('family.preview_family_id')::uuid;
  actor uuid := auth.uid();
  organizer_session uuid := (auth.jwt()->>'session_id')::uuid;
  person uuid;
  country uuid;
  trip_title constant text := 'Mexico · Route Planning Preview';
  walk_name constant text := 'Mexico City Historic Center Walk';
  place public.places%rowtype;
  stop record;
  day jsonb;
  scope jsonb;
  location jsonb;
  locations jsonb := '{}';
  result jsonb;
  leg jsonb;
  walk uuid;
  journal uuid;
  track jsonb;
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 181
     or (select max(version) from supabase_migrations.schema_migrations) <> '20261122222205' then
    raise exception 'The rehearsed Mexico migration sequence is required';
  end if;
  perform family_auth.require_private_session(true);
  if not exists (select 1 from auth.sessions s
                 where s.id = organizer_session and s.user_id = actor and s.aal = 'aal2') then
    raise exception 'The supplied organizer session has not completed MFA';
  end if;
  select p.id into strict person
  from public.people p
  join public.family_members m on m.family_id = p.family_id and m.user_id = p.user_id
  where p.family_id = family and p.user_id = actor and p.archived_at is null
    and m.status = 'active' and m.role in ('patriarch', 'parent');
  if public.session_meets_private_assurance(family) is distinct from true then
    raise exception 'The organizer must have a current verified Family MFA session';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mexico-preview:' || family::text, 0));
  if exists (select 1 from public.trips where id = target or (family_id = family and name = trip_title)) then
    raise exception 'The designated trip or its preview name already exists. Verify that trip before retrying';
  end if;
  select id into strict country from public.countries where lower(name) in ('mexico', 'méxico');
  insert into public.trips(id, family_id, name, primary_country_id, start_at, end_at, created_by_person_id, notes)
  values (target, family, trip_title, country, '2027-04-01T00:00:00Z', '2027-04-03T00:00:00Z', person,
          'Private test trip with sample itinerary and Journal content.');
  insert into public.trip_countries(trip_id, country_id, is_primary) values (target, country, true);
  insert into public.trip_travelers(trip_id, person_id, user_id) values (target, person, actor);

  execute 'set local role authenticated';
  perform public.sync_trip_days(target);
  scope := jsonb_build_object('version',1,'layer','published','trip_id',target,
                              'family_id',family,'user_id',actor,'person_id',person);
  for stop in select * from (values
    (1, 1, 'Ciudad De Mexico', '09:00', '10:00'), (1, 2, 'Puebla', '12:30', '14:30'),
    (2, 1, 'Puebla', '08:30', '09:30'), (2, 2, 'Guanajuato', '15:00', '17:00'),
    (3, 1, 'Guanajuato', null, null), (3, 2, 'Guadalajara', '14:00', '16:00')
  ) as stops(day_number, position, name, starts, ends) order by day_number, position loop
    select jsonb_build_object('id', d.id, 'civil_day', d.civil_day) into strict day
    from public.trip_days d where d.trip_id = target and d.civil_day = date '2027-04-01' + (stop.day_number - 1);
    location := locations -> stop.name;
    if location is null then
      select p.* into strict place from public.places p
      where p.country_id = country and lower(p.name) = lower(stop.name) and p.archived_at is null
        and p.latitude is not null and p.longitude is not null;
      location := jsonb_build_object('create',jsonb_build_object('source',
                    jsonb_build_object('kind','place','id',place.id),'label',stop.name));
    end if;
    result := public.create_family_native_plan_v1(target, gen_random_uuid(), scope,
      jsonb_build_object('location',location,'day',day,'clocks',jsonb_build_object('start',stop.starts,'end',stop.ends),
                         'visit_notes',null));
    if result->>'state' is distinct from 'published' then
      raise exception 'The organizer could not publish the Mexico itinerary';
    end if;
    locations := locations || jsonb_build_object(stop.name,jsonb_build_object('id',result->>'location_id','revision',1));
  end loop;

  perform public.save_family_route_preferences_v1(target,0,
    '{"roadtrip_leg_minutes":95,"roadtrip_connect_days":true,"roadtrip_day_colors":true}');
  select leg_row into strict leg
  from jsonb_array_elements(public.get_family_route_waypoints_v1(target)->'legs') as legs(leg_row)
  join public.trip_days d on d.id = (leg_row->>'day_id')::uuid
  where d.civil_day = date '2027-04-01';
  perform public.save_family_route_waypoint_v1(target,(leg->>'day_id')::uuid,
    (leg->>'from_visit_id')::uuid,(leg->>'to_visit_id')::uuid,0,19.25874,-98.88367);

  select p.* into strict place from public.places p
  where p.country_id = country and lower(p.name) = 'ciudad de mexico' and p.archived_at is null
    and p.latitude is not null and p.longitude is not null;
  result := public.mutate_family_trip_location_v1(target,gen_random_uuid(),'create',
    p_payload => jsonb_build_object('source',jsonb_build_object('kind','manual'),'label',walk_name,
      'description_override','Sample walk based on the Family catalog’s Mexico City coordinates.',
      'latitude',place.latitude,'longitude',place.longitude));
  walk := (result->>'id')::uuid;
  select jsonb_agg(jsonb_build_array(place.latitude + offsets.lat, place.longitude + offsets.lng) order by seq)
    into track
  from (values (1,0,0),(2,.00065,0),(3,.00065,-.0016),(4,.00145,-.0016),
               (5,.00145,-.0028),(6,.0019,-.0045),(7,.00235,-.0045)) as offsets(seq,lat,lng);
  execute 'reset role';
  insert into family_auth.trip_tours(location_id,trip_id,tour_type,track,stops,planned_minutes,published_at)
  values (walk,target,'walk',track,'[
    {"key":"historic-start","name":"Historic center start","index":0,"stay_minutes":0},
    {"key":"plaza-pause","name":"Plaza pause","index":3,"stay_minutes":10},
    {"key":"museum-finish","name":"Museum finish","index":6,"stay_minutes":5}
  ]',25,clock_timestamp());

  execute 'set local role authenticated';
  journal := (public.create_family_journey(family,'Mexico Trip Journal · Preview',
    'Two sample entries for the Family Mexico test itinerary.',array[target])->>'id')::uuid;
  perform public.create_family_trip_journal_text_v1(target,journal,gen_random_uuid(),date '2027-04-01',
    'First evening in Mexico City','We finished the day in the historic center and wrote down what to see next time.');
  perform public.create_family_trip_journal_text_v1(target,journal,gen_random_uuid(),date '2027-04-02',
    'A morning in Puebla','We started with a walk in the center before planning the next leg of the trip.');

  perform public.save_family_trip_collab_note_v1(target,gen_random_uuid(),null,null,
    'Meet before the Puebla drive','On Day 1, regroup in the historic center before setting off for Puebla.',
    'Meeting points','#6366f1');
  perform public.save_family_trip_collab_note_v1(target,gen_random_uuid(),null,null,
    'Last morning in Guadalajara','On Day 3, leave time for a short walk before the group leaves.','Plans','#10b981');
  perform public.save_family_trip_collab_link_v1(target,gen_random_uuid(),null,null,
    'Historic Centre of Puebla','https://whc.unesco.org/en/list/416/');
  perform public.send_family_trip_collab_chat_v3(target,gen_random_uuid(),
    'Let’s meet in the hotel lobby before the Puebla drive.',null,'[]');
  perform public.create_family_trip_collab_poll_v1(target,gen_random_uuid(),
    'What should we add to the Mexico walk?',array['Museum','Market','Coffee stop'],false,null);

  if (select count(*) from public.schedule_items where trip_id = target and deleted_at is null) <> 6
    or (public.get_family_route_preferences_v1(target)->'preferences'->>'roadtrip_leg_minutes') is distinct from '95'
    or not exists (select 1 from jsonb_array_elements(public.get_family_route_waypoints_v1(target)->'legs') l
                   where (l->>'lat')::numeric = 19.25874 and (l->>'lng')::numeric = -98.88367)
    or jsonb_array_length(public.get_family_trip_tours_v1(target)->'tours') is distinct from 1
    or (select count(*) from jsonb_array_elements(public.get_family_trip_journal_v1(target,journal)->'journal'->'entries') e
        where e->>'kind' = 'entry') <> 2
    or jsonb_array_length(public.get_family_trip_collab_notes_v1(target)->'notes') is distinct from 2
    or jsonb_array_length(public.get_family_trip_collab_links_v1(target)->'links') is distinct from 1
    or jsonb_array_length(public.get_family_trip_collab_chat_v1(target)->'messages') is distinct from 1
    or jsonb_array_length(public.get_family_trip_collab_polls_v1(target)->'polls') is distinct from 1 then
    raise exception 'The seeded Mexico workspace did not match the expected counts';
  end if;
  execute 'reset role';
end $$;

\if :commit_seed
  commit;
\else
  rollback;
\endif
