begin;set local lock_timeout='5s';
do $refuse$begin
 if exists(select 1 from family_auth.packing_command_cancellations)then
 raise exception 'Terminal cancellation cannot be downgraded; forward recovery required'using errcode='0A000';end if;
end $refuse$;
drop trigger aa_packing_terminal_exclusion on family_auth.packing_command_receipts;
drop trigger aa_packing_cancel_exclusion on family_auth.packing_command_cancellations;
drop trigger packing_cancel_person_identity on public.people;
drop trigger packing_cancel_trip_identity on public.trips;
drop function cancel_family_trip_packing_restore_v1(uuid,uuid,text,jsonb);
drop function family_auth.packing_restore_cancel_entry(uuid,uuid,text,jsonb);
drop function family_auth.packing_restore_cancellation_context(uuid,jsonb);
drop function family_auth.packing_restore_cancellation_read_entry(uuid,uuid,text,jsonb);
drop function family_auth.packing_restore_original_request(uuid,uuid,text,jsonb);
drop function family_auth.tg_packing_cancel_person_identity();
drop function family_auth.tg_packing_cancel_trip_identity();
drop function family_auth.tg_packing_terminal_exclusion();
drop function get_family_trip_packing_restore_cancellation_v1(uuid,uuid,text,jsonb);
drop table family_auth.packing_command_cancellations;delete from supabase_migrations.schema_migrations where version='20261112132958';notify pgrst,'reload schema';commit;