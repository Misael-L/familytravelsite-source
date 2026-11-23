begin;
set local statement_timeout='20s';
create temporary table d1_model_bags(id uuid primary key,trip_id uuid not null,name text not null,color text,weight_limit_grams integer check(weight_limit_grams between 1 and 10000000),sort_order integer not null default 0 check(sort_order>=0),revision bigint not null default 1 check(revision>0),deleted_at timestamptz,deleted_by_person_id uuid,unique(trip_id,id),check((deleted_at is null)=(deleted_by_person_id is null)and(deleted_at is null or isfinite(deleted_at))));
create temporary table d1_model_items(id uuid primary key,trip_id uuid not null,bag_id uuid,deleted_at timestamptz,foreign key(trip_id,bag_id)references d1_model_bags(trip_id,id)on delete restrict);
create temporary table d1_model_members(trip_id uuid not null,bag_id uuid not null,person_id uuid not null,primary key(bag_id,person_id),foreign key(trip_id,bag_id)references d1_model_bags(trip_id,id)on delete restrict);
-- A real legacy oversized value is retained; the conditional new-value guard is installed afterward.
insert into d1_model_bags(id,trip_id,name)values('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000010',repeat('x',600));
create function pg_temp.d1_model_guard()returns trigger language plpgsql as $$begin
 if tg_op='DELETE'then raise exception 'No purge in this model'using errcode='0A000';end if;
 if tg_op='INSERT'or new.name is distinct from old.name then if length(btrim(new.name))not between 1 and 500 then raise exception 'New name outside bound'using errcode='23514';end if;end if;
 if tg_op='INSERT'or new.color is distinct from old.color then if new.color is not null and new.color!~'^#[a-fA-F0-9]{6}$'then raise exception 'New color outside bound'using errcode='23514';end if;end if;
 if tg_op='UPDATE'then
  if new.id<>old.id or new.trip_id<>old.trip_id or new.revision<>old.revision then raise exception 'Identity/revision immutable'using errcode='23514';end if;
  if old.deleted_at is not null and(to_jsonb(new)-array['deleted_at','deleted_by_person_id'])is distinct from(to_jsonb(old)-array['deleted_at','deleted_by_person_id'])then raise exception 'Restore first'using errcode='PT409';end if;
  new.revision:=old.revision+1;
 end if;
 return new;
end $$;
create trigger d1_model_guard before insert or update or delete on d1_model_bags for each row execute function pg_temp.d1_model_guard();
create function pg_temp.d1_model_trash(bag uuid,expected bigint,actor uuid)returns void language plpgsql as $$declare b d1_model_bags;begin
 select * into strict b from d1_model_bags where id=bag for update;
 if b.revision<>expected or b.deleted_at is not null then raise exception 'Stale'using errcode='PT409';end if;
 if exists(select 1 from d1_model_items where bag_id=bag and deleted_at is null)then raise exception 'Nonempty lifecycle remains separate'using errcode='PT409';end if;
 update d1_model_bags set deleted_at=clock_timestamp(),deleted_by_person_id=actor where id=bag;
end $$;
create function pg_temp.d1_model_restore_item(item uuid)returns void language plpgsql as $$begin
 if exists(select 1 from d1_model_items i join d1_model_bags b on(b.trip_id,b.id)=(i.trip_id,i.bag_id)where i.id=item and b.deleted_at is not null)then raise exception 'Restore the bag first'using errcode='PT409';end if;
 update d1_model_items set deleted_at=null where id=item;
end $$;
do $proof$
declare t uuid:=gen_random_uuid();other uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();i uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();results jsonb:='[]';ok boolean;rev bigint;
begin
 insert into d1_model_bags(id,trip_id,name)values(a,t,'Two bags same label'),(b,t,'Two bags same label');assert(select count(*)from d1_model_bags where trip_id=t)=2;
 results:=results||jsonb_build_array('duplicate_labels_do_not_replace_UUID_identity');
 ok:=false;begin update d1_model_bags set deleted_at=now()where id=a;exception when check_violation then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('Trash_timestamp_and_actor_must_be_paired');
 ok:=false;begin update d1_model_bags set deleted_at='infinity',deleted_by_person_id=actor where id=a;exception when check_violation then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('Trash_timestamp_must_be_finite');
 ok:=false;begin update d1_model_bags set weight_limit_grams=0 where id=a;exception when check_violation then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('weight_limit_is_null_or_in_exact_positive_integer_bound');
 ok:=false;begin insert into d1_model_items values(gen_random_uuid(),other,a,null);exception when foreign_key_violation then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('same_Trip_composite_bag_reference_required');
 insert into d1_model_items values(i,t,a,null);insert into d1_model_members values(t,a,actor);
 ok:=false;begin perform pg_temp.d1_model_trash(a,1,actor);exception when sqlstate 'PT409' then ok:=true;end;assert ok and(select deleted_at is null from d1_model_items where id=i);
 results:=results||jsonb_build_array('nonempty_Trash_cannot_silently_unassign_items');
 update d1_model_items set deleted_at=now()where id=i;assert(select bag_id=a from d1_model_items where id=i);
 results:=results||jsonb_build_array('independent_item_Trash_preserves_bag_reference');
 perform pg_temp.d1_model_trash(a,1,actor);assert(select bag_id=a from d1_model_items where id=i)and(select count(*)from d1_model_members where bag_id=a)=1;
 results:=results||jsonb_build_array('empty_of_live_items_bag_Trash_preserves_history_and_carriers');
 ok:=false;begin delete from d1_model_bags where id=a;exception when feature_not_supported then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('unimplemented_permanent_purge_is_blocked');
 ok:=false;begin perform pg_temp.d1_model_restore_item(i);exception when sqlstate 'PT409' then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('item_restore_requires_its_inactive_parent_to_be_restored_first');
 ok:=false;begin update d1_model_bags set name='No editing in Trash'where id=a;exception when sqlstate 'PT409' then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('trashed_bag_metadata_is_immutable');
 update d1_model_bags set deleted_at=null,deleted_by_person_id=null where id=a;assert(select count(*)from d1_model_members where bag_id=a)=1 and(select bag_id=a and deleted_at is not null from d1_model_items where id=i);
 results:=results||jsonb_build_array('bag_restore_preserves_carriers_and_does_not_revive_items');
 perform pg_temp.d1_model_restore_item(i);assert(select id=i and bag_id=a and deleted_at is null from d1_model_items where id=i);
 results:=results||jsonb_build_array('later_item_restore_keeps_original_item_and_bag_identities');
 ok:=false;begin perform pg_temp.d1_model_trash(a,1,actor);exception when sqlstate 'PT409' then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('stale_bag_revision_is_refused');
 ok:=false;begin insert into d1_model_bags(id,trip_id,name)values(gen_random_uuid(),t,repeat('x',501));exception when check_violation then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('new_names_are_bounded_without_truncation');
 update d1_model_bags set weight_limit_grams=7000 where id='d1000000-0000-4000-8000-000000000001';assert(select length(name)=600 from d1_model_bags where id='d1000000-0000-4000-8000-000000000001');
 results:=results||jsonb_build_array('unchanged_legacy_oversized_names_survive_other_field_changes');
 ok:=false;begin update d1_model_bags set color='not-a-color'where id=b;exception when check_violation then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('new_color_values_follow_the_native_hex_palette_contract');
 ok:=false;begin update d1_model_bags set sort_order=-1 where id=b;exception when check_violation then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('negative_sort_rank_is_refused');
 ok:=false;begin update d1_model_bags set revision=99 where id=b;exception when check_violation then ok:=true;end;assert ok;
 results:=results||jsonb_build_array('revision_is_server_managed');
 perform set_config('d1.model',results::text,true);
end $proof$;
select current_setting('d1.model')::jsonb;
rollback;
