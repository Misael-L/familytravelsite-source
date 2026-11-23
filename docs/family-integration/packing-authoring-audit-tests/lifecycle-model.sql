begin;
set local statement_timeout='20s';
create temporary table c3_trips(id uuid primary key);
create temporary table c3_people(id uuid primary key);
create temporary table c3_categories(
 id uuid primary key,trip_id uuid not null references c3_trips(id)on delete restrict,
 owner_person_id uuid references c3_people(id)on delete restrict,
 name text collate "C" not null check(char_length(name)<=200),
 retained_when_empty boolean not null default true,
 sort_order bigint not null check(sort_order between 0 and 9007199254740991),
 deleted_at timestamptz,deleted_by_person_id uuid references c3_people(id)on delete restrict,
 check((deleted_at is null)=(deleted_by_person_id is null)),
 unique(trip_id,id),unique nulls not distinct(trip_id,owner_person_id,name)
);
create temporary table c3_items(id uuid primary key,trip_id uuid not null,category_id uuid not null,
 foreign key(trip_id,category_id)references c3_categories(trip_id,id)on delete restrict);
do $proof$
declare t uuid:=gen_random_uuid();other uuid:=gen_random_uuid();person uuid:=gen_random_uuid();peer uuid:=gen_random_uuid();category uuid:=gen_random_uuid();other_category uuid:=gen_random_uuid();ok boolean;cases jsonb:='[]';
begin
 insert into c3_trips values(t),(other);insert into c3_people values(person),(peer);
 insert into c3_categories(id,trip_id,name,sort_order)values(category,t,'Empty',0);
 assert(select count(*)from c3_items)=0;cases:=cases||jsonb_build_array('empty_category_exists_without_a_fake_item');
 ok:=false;begin insert into c3_categories(id,trip_id,name,sort_order)values(gen_random_uuid(),t,'Empty',1);exception when unique_violation then ok:=true;end;assert ok;cases:=cases||jsonb_build_array('common_null_owner_does_not_bypass_name_uniqueness');
 insert into c3_categories(id,trip_id,owner_person_id,name,sort_order)values(gen_random_uuid(),t,person,'Empty',0),(gen_random_uuid(),t,peer,'Empty',0);cases:=cases||jsonb_build_array('equal_names_remain_distinct_between_common_and_personal_owner_lanes');
 insert into c3_categories(id,trip_id,name,sort_order)values(other_category,other,'Other trip',0);
 ok:=false;begin insert into c3_items values(gen_random_uuid(),t,other_category);exception when foreign_key_violation then ok:=true;end;assert ok;cases:=cases||jsonb_build_array('composite_foreign_key_blocks_cross_trip_item_link');
 ok:=false;begin update c3_categories set deleted_at=now()where id=category;exception when check_violation then ok:=true;end;assert ok;cases:=cases||jsonb_build_array('deletion_time_requires_actor');
 ok:=false;begin update c3_categories set deleted_by_person_id=person where id=category;exception when check_violation then ok:=true;end;assert ok;cases:=cases||jsonb_build_array('deletion_actor_requires_time');
 update c3_categories set deleted_at=now(),deleted_by_person_id=person where id=category;
 ok:=false;begin insert into c3_categories(id,trip_id,name,sort_order)values(gen_random_uuid(),t,'Empty',1);exception when unique_violation then ok:=true;end;assert ok;cases:=cases||jsonb_build_array('trashed_name_stays_reserved_for_same_identity_restore');
 update c3_categories set deleted_at=null,deleted_by_person_id=null where id=category;
 assert exists(select 1 from c3_categories where id=category and name='Empty');cases:=cases||jsonb_build_array('restore_preserves_original_category_identity');
 ok:=false;begin update c3_categories set sort_order=-1 where id=category;exception when check_violation then ok:=true;end;assert ok;cases:=cases||jsonb_build_array('negative_position_is_refused');
 ok:=false;begin update c3_categories set sort_order=9007199254740992 where id=category;exception when check_violation then ok:=true;end;assert ok;cases:=cases||jsonb_build_array('unsafe_javascript_integer_position_is_refused');
 insert into c3_categories(id,trip_id,name,sort_order)values(gen_random_uuid(),t,'Tie allowed',0);cases:=cases||jsonb_build_array('positions_are_sort_keys_not_identifiers_and_uuid_breaks_ties');
 ok:=false;begin update c3_categories set name=repeat('x',201)where id=category;exception when check_violation then ok:=true;end;assert ok;cases:=cases||jsonb_build_array('overlong_labels_are_refused');
 insert into c3_categories(id,trip_id,name,sort_order)values(gen_random_uuid(),t,'é',1),(gen_random_uuid(),t,U&'e\0301',2);cases:=cases||jsonb_build_array('raw_unicode_labels_are_not_silently_normalized_or_merged');
 insert into c3_items values(gen_random_uuid(),t,category);
 ok:=false;begin delete from c3_categories where id=category;exception when foreign_key_violation then ok:=true;end;assert ok;cases:=cases||jsonb_build_array('historical_item_references_prevent_parent_physical_delete');
 perform set_config('c3.model_cases',cases::text,true);
end $proof$;
select current_setting('c3.model_cases');
rollback;
