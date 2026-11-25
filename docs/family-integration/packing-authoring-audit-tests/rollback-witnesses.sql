begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $seed$
declare t uuid; n int; peer uuid;
begin
 if not exists(select 1 from auth.users where id=__USER__ and email like '%@fixture.invalid') then raise exception 'Synthetic actor required';end if;
 select id into peer from public.people where family_id=__FAMILY__ and user_id is not null and user_id<>__USER__ order by id limit 1;
 if peer is null then raise exception 'Synthetic peer missing';end if;
 for n in 1..4 loop
  insert into public.trips(family_id,name,start_at,end_at,created_by_person_id)values(__FAMILY__,'C3 rollback witness '||n,'2027-04-01T00:00:00Z','2027-04-03T00:00:00Z',__PERSON__)returning id into t;
  insert into public.trip_travelers(trip_id,person_id)values(t,__PERSON__),(t,peer);
  perform set_config('c3.trip'||n,t::text,true);
 end loop;
 -- Metadata-only category: exact representation supported by storage, omitted by the v1 coupled read.
 insert into public.packing_categories(trip_id,name)values(current_setting('c3.trip1')::uuid,'Truly empty');
 insert into public.packing_items(trip_id,name,category,is_private,owner_person_id,sort_order)
 values(current_setting('c3.trip4')::uuid,'Visible A','A',false,null,0),
 (current_setting('c3.trip4')::uuid,'Hidden peer','Secret',true,peer,1),
 (current_setting('c3.trip4')::uuid,'Visible B','B',false,null,2),
 (current_setting('c3.trip4')::uuid,'Own personal','Own',true,__PERSON__,3);
 perform set_config('c3.hidden_before',(select to_jsonb(i)::text from public.packing_items i where trip_id=current_setting('c3.trip4')::uuid and name='Hidden peer'),true);
 perform set_config('c3.peer',peer::text,true);
end $seed$;
select set_config('request.jwt.claims',__CLAIMS__,true) is not null;
set local role authenticated;
do $proof$
declare t uuid:=current_setting('c3.trip1')::uuid; p jsonb; r jsonb; a jsonb; b jsonb; cat jsonb; original jsonb; args jsonb; op uuid; target uuid; result jsonb:='[]'; expected boolean;
begin
 p:=public.get_family_trip_packing_with_categories_v1(t);
 assert jsonb_array_length(p->'categories')=0 and jsonb_array_length(p->'packing'->'items')=0;
 result:=result||jsonb_build_array('metadata_only_empty_category_is_not_in_v1_read');
 op:=gen_random_uuid();target:=gen_random_uuid();args:=jsonb_build_object('name','...','category','Gear','visibility','common');
 r:=public.execute_family_trip_packing_v1(t,op,p->'scope','create',target,null,null,args);original:=r;
 assert r->'item'->>'name'='...' and r->'item'->>'quantity'='1';
 result:=result||jsonb_build_array('native_placeholder_is_a_real_countable_v1_item');
 r:=public.execute_family_trip_packing_v1(t,op,p->'scope','create',target,null,null,args);
 assert r=original;
 p:=public.get_family_trip_packing_with_categories_v1(t);assert jsonb_array_length(p->'packing'->'items')=1;
 result:=result||jsonb_build_array('same_operation_replays_one_placeholder_only');
 r:=public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','create',gen_random_uuid(),null,null,args);
 p:=public.get_family_trip_packing_with_categories_v1(t);assert jsonb_array_length(p->'packing'->'items')=2 and jsonb_array_length(p->'categories')=1;
 result:=result||jsonb_build_array('deliberate_second_create_can_persist_another_sentinel_in_same_category');
 a:=p->'packing'->'items'->0;
 r:=public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','update',(a->>'id')::uuid,(a->>'revision')::bigint,null,jsonb_build_object('name','Tent'));
 assert r->'item'->>'id'=a->>'id';
 result:=result||jsonb_build_array('filling_placeholder_reuses_real_item_identity');

 t:=current_setting('c3.trip2')::uuid;p:=public.get_family_trip_packing_with_categories_v1(t);
 r:=public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','create',gen_random_uuid(),null,null,'{"name":"Last real item","category":"Keep","visibility":"common"}');a:=r->'item';
 p:=public.get_family_trip_packing_with_categories_v1(t);cat:=p->'categories'->0;
 perform public.execute_family_trip_packing_category_v1(t,gen_random_uuid(),p->'scope','category-assignees',(p->>'collection_revision')::bigint,cat,jsonb_build_object('person_ids',jsonb_build_array(__PERSON__)));
 p:=public.get_family_trip_packing_with_categories_v1(t);
 r:=public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','trash',(a->>'id')::uuid,(a->>'revision')::bigint,null,'{}');a:=r->'item';
 p:=public.get_family_trip_packing_with_categories_v1(t);assert jsonb_array_length(p->'categories')=0 and p->'packing'->'category_assignees'?'Keep';
 result:=result||jsonb_build_array('last_real_item_trash_hides_category_but_assignment_compatibility_fact_remains');
 r:=public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','restore',(a->>'id')::uuid,(a->>'revision')::bigint,null,'{}');a:=r->'item';
 p:=public.get_family_trip_packing_with_categories_v1(t);assert p->'categories'->0->>'id'=cat->>'id';
 result:=result||jsonb_build_array('item_restore_revives_same_category_identity');
 r:=public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','update',(a->>'id')::uuid,(a->>'revision')::bigint,null,'{"category":"Moved"}');
 p:=public.get_family_trip_packing_with_categories_v1(t);assert jsonb_array_length(p->'categories')=1 and p->'categories'->0->>'id'<>cat->>'id';
 result:=result||jsonb_build_array('single_item_move_changes_category_link_without_merging_category_identities');
 expected:=false;
 begin
  perform public.execute_family_trip_packing_category_v1(t,gen_random_uuid(),p->'scope','category-rename',(p->>'collection_revision')::bigint,p->'categories'->0,'{"name":"Keep"}');
 exception when sqlstate 'PT409' then expected:=true;end;
 assert expected;
 result:=result||jsonb_build_array('even_empty_historical_category_name_is_reserved_and_rename_does_not_merge');

 t:=current_setting('c3.trip3')::uuid;p:=public.get_family_trip_packing_with_categories_v1(t);
 a:=public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','create',gen_random_uuid(),null,null,'{"name":"A","category":"First","visibility":"common"}')->'item';
 b:=public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','create',gen_random_uuid(),null,null,'{"name":"B","category":"Second","visibility":"common"}')->'item';
 p:=public.get_family_trip_packing_with_categories_v1(t);
 r:=public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','reorder',null,null,(p->>'collection_revision')::bigint,jsonb_build_object('ids',jsonb_build_array(b->>'id',a->>'id')));
 p:=public.get_family_trip_packing_with_categories_v1(t);assert p->'packing'->'items'->0->>'category'='Second';
 result:=result||jsonb_build_array('nonempty_category_first_appearance_can_move_through_existing_atomic_item_order');
 expected:=false;
 begin
  perform public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','reorder',null,null,(p->>'collection_revision')::bigint,jsonb_build_object('ids',jsonb_build_array(a->>'id')));
 exception when sqlstate 'PT409' then expected:=true;end;
 assert expected;
 result:=result||jsonb_build_array('partial_filtered_item_reorder_is_refused');
 t:=current_setting('c3.trip4')::uuid;p:=public.get_family_trip_packing_with_categories_v1(t);
 assert jsonb_array_length(p->'packing'->'items')=3 and not exists(select 1 from jsonb_array_elements(p->'packing'->'items')x where x->>'name'='Hidden peer');
 a:=p->'packing'->'items'->0;b:=p->'packing'->'items'->1;cat:=p->'packing'->'items'->2;
 perform public.execute_family_trip_packing_v1(t,gen_random_uuid(),p->'scope','reorder',null,null,(p->>'collection_revision')::bigint,jsonb_build_object('ids',jsonb_build_array(b->>'id',a->>'id',cat->>'id')));
 p:=public.get_family_trip_packing_with_categories_v1(t);assert p->'packing'->'items'->0->>'name'='Visible B'and p->'packing'->'items'->2->>'name'='Own personal';
 result:=result||jsonb_build_array('complete_visible_reorder_includes_own_personal_view_without_exposing_hidden_peer');
 perform set_config('c3.results',result::text,true);
end $proof$;
reset role;
do $metadata$
declare result jsonb:=current_setting('c3.results')::jsonb; t uuid:=current_setting('c3.trip2')::uuid; expected boolean:=false;
begin
 assert exists(select 1 from public.packing_categories where trip_id=t and name='Keep');
 result:=result||jsonb_build_array('orphan_category_and_its_assignment_provenance_are_retained_in_storage');
 begin delete from public.packing_categories where trip_id=t and name='Keep';exception when sqlstate '0A000' then expected:=true;end;
 assert expected;result:=result||jsonb_build_array('category_physical_delete_is_refused');
 assert(select to_jsonb(i)::text from public.packing_items i where trip_id=current_setting('c3.trip4')::uuid and name='Hidden peer')=current_setting('c3.hidden_before');
 result:=result||jsonb_build_array('hidden_peer_row_and_logical_order_slot_are_byte_exact_after_visible_reorder');
 assert not exists(select 1 from information_schema.columns where table_schema='public'and table_name='packing_categories'and column_name in('sort_order','deleted_at','retained_when_empty'));
 result:=result||jsonb_build_array('category_rank_retention_and_lifecycle_columns_are_absent');
 perform set_config('c3.results',result::text,true);
end $metadata$;
select current_setting('c3.results');
rollback;
