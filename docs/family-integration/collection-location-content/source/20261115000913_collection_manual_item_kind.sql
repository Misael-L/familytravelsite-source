-- Add the label in its own committed transaction, before the content migration.
begin;
alter type public.list_item_kind add value 'manual';
commit;
