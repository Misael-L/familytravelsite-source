begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- A terminal exact-request fence, not an invented prepared command or item.
-- Retained with the existing immutable operation receipts. Session IDs deliberately
-- do not reference auth.sessions: cancellation must survive logout/session cleanup.
create table family_auth.collection_request_cancellations (
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 operation_id uuid not null,
 collection_id uuid not null,
 family_id uuid not null,
 original_session_id uuid not null,
 original_person_id uuid,
 original_scope jsonb not null check (jsonb_typeof(original_scope) = 'object' and octet_length(original_scope::text) <= 2048),
 request_hash bytea not null check (octet_length(request_hash) = 32),
 action text not null check (action in ('create_reference','create_snapshot','create_manual','materialize','edit','status','reorder')),
 created_at timestamptz not null default clock_timestamp(),
 primary key (actor_user_id, operation_id),
 foreign key (collection_id, family_id) references public.lists(id, family_id) on delete restrict,
 foreign key (original_person_id, family_id) references public.people(id, family_id) on delete restrict
);
create index collection_request_cancellations_list_idx on family_auth.collection_request_cancellations(collection_id, family_id);
create index collection_request_cancellations_person_idx on family_auth.collection_request_cancellations(original_person_id, family_id) where original_person_id is not null;
alter table family_auth.collection_request_cancellations enable row level security;
revoke all on family_auth.collection_request_cancellations from public, anon, authenticated, service_role;
create trigger request_cancel_immutable_row before update or delete on family_auth.collection_request_cancellations for each row execute function family_auth.collection_immutable();
create trigger request_cancel_no_delete before delete on family_auth.collection_request_cancellations for each statement execute function family_auth.collection_immutable();
create trigger request_cancel_no_truncate before truncate on family_auth.collection_request_cancellations for each statement execute function family_auth.collection_immutable();

-- Structural validation only. Recovery must remain possible after a source,
-- revision or media availability changes; it never re-observes or reapplies it.
create function family_auth.collection_request_validate(p_request jsonb) returns bytea
language plpgsql immutable set search_path = '' as $$
declare s jsonb; o jsonb; b jsonb; intent jsonb; action text; k text; v jsonb; fields text[]; ids jsonb;
begin
 if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text) > 270000
 or not(p_request ?& array['scope','operation_id','intent','observation']) or p_request-array['scope','operation_id','intent','observation'] <> '{}'::jsonb then
  raise exception 'Exact bounded retained preparation required' using errcode='22023';
 end if;
 s:=p_request->'scope'; o:=p_request->'observation'; intent:=p_request->'intent'; b:=intent->'body'; action:=intent->>'action';
 fields:=array['version','family_id','collection_id','user_id','person_id','session_id','lifecycle_revision'];
 if jsonb_typeof(s) is distinct from 'object' or not(s ?& fields) or s-fields<>'{}'::jsonb or s->'version' is distinct from '1'::jsonb then
  raise exception 'Exact original scope required' using errcode='22023';
 end if;
 for k,v in select * from jsonb_each(s || jsonb_build_object('operation_id',p_request->'operation_id')) loop
  if k in ('family_id','collection_id','user_id','session_id','operation_id','person_id') then
   if k='person_id' and v='null'::jsonb then continue; end if;
   if jsonb_typeof(v) is distinct from 'string' or (v#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Canonical original UUID required' using errcode='22023';
   end if;
  end if;
 end loop;
 fields:=array['version','collection_revision','content_revision','lifecycle_revision','item_revision','item_digest','source_digest'];
 if jsonb_typeof(o) is distinct from 'object' or not(o ?& fields) or o-fields<>'{}'::jsonb or o->'version' is distinct from '1'::jsonb
 or s->'lifecycle_revision' is distinct from o->'lifecycle_revision' then
  raise exception 'Exact original observation required' using errcode='22023';
 end if;
 for k,v in select * from jsonb_each(o) where key in ('collection_revision','content_revision','lifecycle_revision','item_revision') loop
  if k='item_revision' and v='null'::jsonb then continue; end if;
  if jsonb_typeof(v) is distinct from 'number' or (v#>>'{}')::numeric <> trunc((v#>>'{}')::numeric)
  or (v#>>'{}')::numeric not between (case when k in ('collection_revision','item_revision') then 1 else 0 end) and 9007199254740991 then
   raise exception 'Safe original revision required' using errcode='22023';
  end if;
 end loop;
 for k,v in select * from jsonb_each(o) where key in ('item_digest','source_digest') loop
  if v<>'null'::jsonb and (jsonb_typeof(v) is distinct from 'string' or (v#>>'{}') !~ '^[0-9a-f]{64}$') then
   raise exception 'Original digest required' using errcode='22023';
  end if;
 end loop;
 if (o->'item_revision'='null'::jsonb)<>(o->'item_digest'='null'::jsonb) then raise exception 'Paired item observation required' using errcode='22023'; end if;
 if jsonb_typeof(intent) is distinct from 'object' or not(intent ?& array['action','body']) or intent-array['action','body']<>'{}'::jsonb or jsonb_typeof(b) is distinct from 'object' then
  raise exception 'Exact original intent required' using errcode='22023';
 end if;
 fields:=case action when 'create_reference' then array['source','notes','status'] when 'create_snapshot' then array['source','notes','status'] when 'create_manual' then array['content','notes','status'] when 'materialize' then array['item_id'] when 'edit' then array['item_id','changes'] when 'status' then array['item_id','status'] when 'reorder' then array['ordered_ids'] end;
 if fields is null or not(b ?& fields) or b-fields<>'{}'::jsonb then raise exception 'Exact action body required' using errcode='22023'; end if;
 if b?'source' then
  if jsonb_typeof(b->'source') is distinct from 'object' or not((b->'source') ?& array['kind','id']) or (b->'source')-array['kind','id']<>'{}'::jsonb
  or coalesce(b->'source'->>'kind','') not in ('country','place','food','hotel','experience','airport','airline','guide')
  or (action='create_snapshot' and b->'source'->>'kind' not in ('place','food','hotel','experience'))
  or jsonb_typeof(b->'source'->'id') is distinct from 'string' or (b->'source'->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   raise exception 'Exact typed source required' using errcode='22023';
  end if;
 end if;
 if b?'item_id' and (jsonb_typeof(b->'item_id') is distinct from 'string' or (b->>'item_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Canonical item UUID required' using errcode='22023'; end if;
 if b?'status' and coalesce(b->>'status','') not in ('idea','want','visited') then raise exception 'Supported status required' using errcode='22023'; end if;
 if action='create_manual' then perform family_auth.collection_authoring_validate(b->'content',true); end if;
 if action='edit' then
  v:=b->'changes';
  if jsonb_typeof(v) is distinct from 'object' or v='{}'::jsonb then raise exception 'Nonempty changes required' using errcode='22023'; end if;
  -- A reference name can explicitly clear its override; do not coerce NULL.
  perform family_auth.collection_authoring_validate(case when v->'name'='null'::jsonb then v-array['notes','name'] else v-'notes' end,false);
  b:=v;
 end if;
 if b?'notes' and b->'notes'<>'null'::jsonb and (jsonb_typeof(b->'notes') is distinct from 'string' or char_length(b->>'notes')>20000) then raise exception 'Bounded nullable notes required' using errcode='22023'; end if;
 if action='reorder' then
  ids:=b->'ordered_ids';
  if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids)>100 then raise exception 'Bounded order required' using errcode='22023'; end if;
  for v in select value from jsonb_array_elements(ids) loop
   if jsonb_typeof(v) is distinct from 'string' or (v#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Canonical ordered UUID required' using errcode='22023'; end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(ids))<>jsonb_array_length(ids) then raise exception 'Unique ordered IDs required' using errcode='22023'; end if;
 end if;
 -- Identical JSONB hash semantics to C4 preparation, excluding scope/op there.
 return sha256(convert_to(jsonb_build_object('action',intent->'action','body',intent->'body','observation',o)::text,'UTF8'));
end;$$;

create function family_auth.collection_request_entry(p_preparation jsonb,p_cancel boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare digest bytea; s jsonb; op uuid; l public.lists%rowtype; cmd family_auth.collection_authoring_commands%rowtype;
 tomb family_auth.collection_request_cancellations%rowtype; actual jsonb; status text; resolution text;
begin
 if p_cancel is null then raise exception 'Explicit request action required' using errcode='22023'; end if;
 if family_auth.collection_session_current() is distinct from true then raise exception 'Current Collection session required' using errcode='42501'; end if;
 digest:=family_auth.collection_request_validate(p_preparation); s:=p_preparation->'scope'; op:=(p_preparation->>'operation_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('collection-operation:'||auth.uid()::text||':'||op::text,0));
 l:=family_auth.collection_require((s->>'collection_id')::uuid,'recovery_item',true);
 if s-array['session_id','lifecycle_revision'] is distinct from family_auth.collection_scope(l)-array['session_id','lifecycle_revision'] then raise exception 'Retained preparation belongs to another actor or context' using errcode='PT409'; end if;
 if exists(select 1 from family_auth.collection_operation_receipts where actor_user_id=auth.uid() and operation_id=op) then raise exception 'Operation ID belongs to Collection lifecycle' using errcode='PT409'; end if;
 select * into cmd from family_auth.collection_authoring_commands where actor_user_id=auth.uid() and operation_id=op;
 select * into tomb from family_auth.collection_request_cancellations where actor_user_id=auth.uid() and operation_id=op;
 if cmd.operation_id is not null then
  if tomb.operation_id is not null or cmd.collection_id<>l.id or cmd.family_id<>l.family_id or cmd.request_hash<>digest or cmd.original->'scope' is distinct from s then raise exception 'Exact original preparation required' using errcode='PT409'; end if;
  actual:=family_auth.collection_authoring_entry(case when p_cancel then 'cancel' else 'outcome' end,
   jsonb_build_object('collection_id',l.id,'operation_id',op)||case when p_cancel then jsonb_build_object('original',cmd.original) else '{}'::jsonb end);
  status:=actual->>'status'; resolution:='prepared';
 elsif tomb.operation_id is not null then
  if tomb.collection_id<>l.id or tomb.family_id<>l.family_id or tomb.request_hash<>digest or tomb.original_scope is distinct from s then raise exception 'Cancelled preparation identity changed' using errcode='PT409'; end if;
  status:='cancelled'; resolution:='unprepared';
 elsif p_cancel then
  insert into family_auth.collection_request_cancellations(actor_user_id,operation_id,collection_id,family_id,original_session_id,original_person_id,original_scope,request_hash,action)
  values(auth.uid(),op,l.id,l.family_id,(s->>'session_id')::uuid,(s->>'person_id')::uuid,s,digest,p_preparation->'intent'->>'action');
  status:='cancelled'; resolution:='unprepared';
 else status:='unknown'; resolution:='none';
 end if;
 return jsonb_build_object('version',2,'operation_id',op,'collection_id',l.id,'action',p_preparation->'intent'->>'action','status',status,'resolution',resolution,'result',actual);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid retained preparation' using errcode='22023';
end;$$;

create function public.get_family_collection_preparation_outcome_v2(p_preparation jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$select family_auth.collection_request_entry(p_preparation,false)$$;
create function public.cancel_family_collection_preparation_v2(p_preparation jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$select family_auth.collection_request_entry(p_preparation,true)$$;
revoke all on function family_auth.collection_request_validate(jsonb) from public,anon,authenticated,service_role;
revoke all on function family_auth.collection_request_entry(jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function family_auth.collection_request_entry(jsonb,boolean) to authenticated;
revoke all on function public.get_family_collection_preparation_outcome_v2(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.cancel_family_collection_preparation_v2(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_family_collection_preparation_outcome_v2(jsonb),public.cancel_family_collection_preparation_v2(jsonb) to authenticated;

-- Preserve the two existing private function identities, owners and ACLs.
create or replace function family_auth.collection_authoring_entry(p_entry text,p_args jsonb)returns jsonb language plpgsql volatile security definer set search_path=''as $$
<<authoring>>
declare l public.lists%rowtype;cmd family_auth.collection_authoring_commands%rowtype;outcome family_auth.collection_authoring_outcomes%rowtype;
 collection_id uuid;op uuid;keys text[];request_hash bytea;original jsonb;fresh jsonb;result jsonb;cover uuid;pending integer;
begin
 keys:=case p_entry when'context'then array['collection_id','target']when'prepare'then array['collection_id','operation_id','action','body','observation']when'execute'then array['collection_id','operation_id','original']when'cancel'then array['collection_id','operation_id','original']when'outcome'then array['collection_id','operation_id']end;
 if keys is null or jsonb_typeof(p_args)is distinct from'object'or not(p_args?&keys)or p_args-keys<>'{}'::jsonb or octet_length(p_args::text)>270000 then raise exception 'Exact bounded authoring entry required'using errcode='22023';end if;
 if family_auth.collection_session_current()is distinct from true then raise exception 'Current Collection session required'using errcode='42501';end if;
 collection_id:=(p_args->>'collection_id')::uuid;op:=(p_args->>'operation_id')::uuid;
 if p_entry='context'then l:=family_auth.collection_require(collection_id,'items',true);return family_auth.collection_authoring_observe(l,p_args->'target');end if;
 if op is null then raise exception 'Original operation ID required'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('collection-operation:'||auth.uid()::text||':'||op::text,0));
 l:=family_auth.collection_require(collection_id,'recovery_item',true);
 -- V1 has no unprepared-cancellation dialect. Keep its honest unknown read,
 -- but refuse every writer and wrong-parent discovery after the durable fence.
 if exists(select 1 from family_auth.collection_request_cancellations where actor_user_id=auth.uid() and operation_id=op) then
  if p_entry='outcome' and exists(select 1 from family_auth.collection_request_cancellations t where t.actor_user_id=auth.uid() and t.operation_id=op and t.collection_id=l.id) then
   return jsonb_build_object('version',1,'operation_id',op,'status','unknown');
  end if;
  raise exception 'Original preparation was cancelled before registration' using errcode='PT409';
 end if;
 if exists(select 1 from family_auth.collection_operation_receipts where actor_user_id=auth.uid()and operation_id=op)then raise exception 'Operation ID belongs to Collection lifecycle'using errcode='PT409';end if;
 select *into cmd from family_auth.collection_authoring_commands x where x.actor_user_id=auth.uid()and x.operation_id=op;
 if cmd.operation_id is not null and cmd.collection_id<>l.id then raise exception 'Original operation belongs to another Collection'using errcode='PT409';end if;
 select *into outcome from family_auth.collection_authoring_outcomes x where x.actor_user_id=auth.uid()and x.operation_id=op;
 if p_entry='outcome'then
  if cmd.operation_id is null then return jsonb_build_object('version',1,'operation_id',op,'status','unknown');end if;
  if outcome.operation_id is not null then return outcome.result;end if;
  return jsonb_build_object('version',1,'operation_id',op,'status','prepared','original',cmd.original);
 elsif p_entry='prepare'then
  request_hash:=sha256(convert_to((p_args-array['collection_id','operation_id'])::text,'UTF8'));
  if cmd.operation_id is not null then
   if cmd.request_hash<>request_hash or cmd.original_session_id::text is distinct from auth.jwt()->>'session_id'then raise exception 'Original preparation request/session changed'using errcode='PT409';end if;
   return jsonb_build_object('version',1,'operation_id',op,'status',coalesce(outcome.status,'prepared'),'original',cmd.original);
  end if;
  if family_auth.collection_allowed(l.id,'items')is distinct from true then raise exception 'Active Collection editing authority required'using errcode='42501';end if;
  original:=family_auth.collection_authoring_build(l,p_args->>'action',p_args->'body',p_args->'observation');
  perform pg_advisory_xact_lock(hashtextextended('collection-authoring-pending:'||auth.uid()::text,0));
  select count(*)into pending from family_auth.collection_authoring_commands x where x.actor_user_id=auth.uid()and not exists(select 1 from family_auth.collection_authoring_outcomes o where(o.actor_user_id,o.operation_id)=(x.actor_user_id,x.operation_id));
  if pending>=200 then raise exception 'Pending authoring operation limit reached; resolve existing originals'using errcode='54000';end if;
  insert into family_auth.collection_authoring_commands(actor_user_id,operation_id,collection_id,family_id,original_session_id,original_person_id,request_hash,original)
   values(auth.uid(),op,l.id,l.family_id,(auth.jwt()->>'session_id')::uuid,public.viewer_person_id_for_family(l.family_id),request_hash,original);
  cover:=coalesce(original->'body'->'content'->>'cover_media_id',original->'body'->'changes'->>'cover_media_id')::uuid;
  if cover is not null then insert into family_auth.collection_authoring_media_holds values(auth.uid(),op,cover);end if;
  return jsonb_build_object('version',1,'operation_id',op,'status','prepared','original',original);
 end if;
 if cmd.operation_id is null then raise exception 'Registered original required; recover preparation first'using errcode='PT409';end if;
 if p_args->'original'is distinct from cmd.original then raise exception 'Exact immutable original required'using errcode='PT409';end if;
 if p_entry='execute'and cmd.original_session_id::text is distinct from auth.jwt()->>'session_id'then raise exception 'Original execution session changed'using errcode='PT409';end if;
 if outcome.operation_id is not null then return outcome.result;end if;
 if p_entry='cancel'then result:=jsonb_build_object('version',1,'operation_id',op,'status','cancelled','collection_id',l.id,'action',cmd.original->'action','item_id',cmd.original->'target_item_id');
 else
  if family_auth.collection_allowed(l.id,'items')is distinct from true then raise exception 'Active Collection editing authority required'using errcode='42501';end if;
  original:=cmd.original;
  -- Derived preparation fields are recomputed from canonical source facts.
  fresh:=family_auth.collection_authoring_build(l,original->>'action',case when original->>'action'='create_snapshot'then (original->'body')-'content'when original->>'action'='materialize'then (original->'body')-array['content','already_snapshot']else original->'body'end,original->'observed');
  if(original->>'action')in('create_reference','create_snapshot','create_manual')then
   if fresh-'target_item_id'is distinct from original-'target_item_id'then raise exception 'Frozen authoring source/body/context changed'using errcode='PT409';end if;
  elsif fresh is distinct from original then raise exception 'Frozen authoring source/body/context changed'using errcode='PT409';end if;
  result:=family_auth.collection_authoring_apply(l,op,original);
 end if;
 insert into family_auth.collection_authoring_outcomes(actor_user_id,operation_id,status,result)values(auth.uid(),op,result->>'status',result);
 delete from family_auth.collection_authoring_media_holds where actor_user_id=auth.uid()and operation_id=op;
 return result;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid canonical authoring input'using errcode='22023';
 when unique_violation then raise exception 'Authoring identity conflict; reload or recover the original'using errcode='PT409';
end;$$;
CREATE OR REPLACE FUNCTION family_auth.collection_execute(p_operation uuid, p_original jsonb, p_cancel boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.lists%rowtype;i public.list_items%rowtype;r family_auth.collection_operation_receipts%rowtype;
 s jsonb;kind text;action text;target uuid;item_id uuid;digest bytea;result jsonb;changed boolean;content bigint;
begin
 if p_operation is null or p_cancel is null or octet_length(p_original::text)>65536 then raise exception 'Bounded original operation required'using errcode='22023';end if;
 perform family_auth.collection_validate_original(p_original);
 if not family_auth.collection_session_current()then raise exception 'Current Collection session required'using errcode='42501';end if;
 s:=p_original->'scope';kind:=p_original->>'target_kind';action:=p_original->>'action';item_id:=(p_original->>'item_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('collection-operation:'||auth.uid()::text||':'||p_operation::text,0));
 if exists(select 1 from family_auth.collection_authoring_commands where actor_user_id=auth.uid()and operation_id=p_operation) or exists(select 1 from family_auth.collection_request_cancellations where actor_user_id=auth.uid()and operation_id=p_operation)then raise exception 'Operation ID belongs to Collection content'using errcode='PT409';end if;
 l:=family_auth.collection_require((p_original->>'collection_id')::uuid,case when kind='collection'then'recovery_root'else'recovery_item'end,true);
 if s-array['session_id','lifecycle_revision']is distinct from family_auth.collection_scope(l)-array['session_id','lifecycle_revision']then raise exception 'Collection original belongs to another actor or context'using errcode='PT409';end if;
 if not p_cancel and s->>'session_id'is distinct from auth.jwt()->>'session_id'then raise exception 'Original execution session changed'using errcode='PT409';end if;
 if item_id is not null then
  select *into i from public.list_items where id=item_id and list_id=l.id for update;
  if not found then raise exception 'Collection item unavailable'using errcode='42501';end if;
 end if;
 if not family_auth.collection_allowed(l.id,case when kind='collection'then'recovery_root'else'recovery_item'end)then raise exception 'Collection authority changed'using errcode='42501';end if;
 digest:=sha256(convert_to(p_original::text,'UTF8'));target:=case when kind='collection'then l.id else i.id end;
 select *into r from family_auth.collection_operation_receipts where actor_user_id=auth.uid()and operation_id=p_operation;
 if found then
  if r.request_sha256<>digest or r.collection_id<>l.id or r.family_id<>l.family_id then raise exception 'Collection original operation reused'using errcode='PT409';end if;
  return r.result;
 end if;
 if p_cancel then
  result:=jsonb_build_object('version',1,'operation_id',p_operation,'status','cancelled','action',action,'target_kind',kind,'target_id',target);
 else
  select coalesce((select content_revision from family_auth.collection_state where list_id=l.id),0)into content;
  if(s->>'lifecycle_revision')::bigint<>l.lifecycle_revision
   or(p_original->>'expected_revision')::bigint<>(case when kind='collection'then l.revision else i.revision end)
   or(kind='item'and(p_original->>'expected_collection_revision')::bigint<>content)then raise exception 'Collection observation is stale'using errcode='PT409';end if;
  if kind='item'and(l.deleted_at is not null or l.archived_at is not null)then raise exception 'Restore and unarchive parent Collection first'using errcode='PT409';end if;
  changed:=case when kind='collection'then(l.deleted_at is null)else(i.deleted_at is null)end=(action='trash');
  if changed then
   insert into family_auth.collection_lifecycle_permits values(pg_current_xact_id(),l.id,kind,target,auth.uid(),action);
   if kind='collection'then
    update public.lists set deleted_at=case when action='trash'then clock_timestamp()else null end,
     deleted_by_user_id=case when action='trash'then auth.uid()else null end where id=l.id returning *into l;
   else
    update public.list_items set deleted_at=case when action='trash'then clock_timestamp()else null end,
     deleted_by_user_id=case when action='trash'then auth.uid()else null end where id=i.id returning *into i;
   end if;
   delete from family_auth.collection_lifecycle_permits where transaction_id=pg_current_xact_id()and collection_id=l.id and target_kind=kind and target_id=target;
  end if;
  select coalesce((select content_revision from family_auth.collection_state where list_id=l.id),0)into content;
  result:=jsonb_build_object('version',1,'operation_id',p_operation,'status','committed','action',action,'target_kind',kind,'target_id',target,
   'revision',case when kind='collection'then l.revision else i.revision end,'collection_revision',l.revision,'content_revision',content,'changed',changed);
 end if;
 insert into family_auth.collection_operation_receipts(actor_user_id,operation_id,family_id,collection_id,item_id,original_session_id,original_person_id,action,request_sha256,status,result)
 values(auth.uid(),p_operation,l.family_id,l.id,item_id,(s->>'session_id')::uuid,(s->>'person_id')::uuid,action,digest,case when p_cancel then'cancelled'else'committed'end,result);
 -- Deferred history is part of this same transaction; a late failure aborts the
 -- mutation and receipt. PostgREST sends no successful response before COMMIT.
 return result;
end;$function$
;
commit;
