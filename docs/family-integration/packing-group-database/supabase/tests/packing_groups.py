"""Actual SQL roles, Auth/TOTP/PostgREST and concurrent group commands; local guard only."""
import concurrent.futures
import copy
import json
import unittest
import uuid
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import packing_commands as packing_base
lit=packing_base.lit


class PackingGroups(packing_base.PackingCommands):
    @classmethod
    def setUpClass(cls):
        from packing_group_guard import validate, old_hashes, sql
        validate(); old_hashes()
        assert sql("select to_regprocedure('public.execute_family_trip_packing_group_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb,jsonb)') is not null") == 't'
        super().setUpClass()

    def group_item(self, **values):
        return self.row(self.create(**values)['id'])

    def group_args(self, action='group-packed-state', checked=True, view='common', status='all', categories=None, snapshot=None, operation=None, user=None):
        packet = snapshot if snapshot is not None else self.state(user)
        selector = {'view':view, 'status':status, 'categories':categories if categories is not None else (None if action=='clear-completed' else ['Gear'])}
        selected = [r for r in packet['items'] if r['is_private']==(view=='personal')
                    and (status=='all' or r['checked']==(status=='done'))
                    and (selector['categories'] is None or r['category'] in selector['categories'])]
        observed = [{k:r[k] for k in ['id','revision','checked']} for r in sorted(selected,key=lambda r:r['id'])]
        return [self.trip,operation or str(uuid.uuid4()),packet['scope'],action,packet['collection_revision'],selector,observed,{'checked':checked} if action=='group-packed-state' else {}]

    def statement(self,args):
        return 'select public.execute_family_trip_packing_group_v1('+','.join(
            'null' if v is None else str(v) if isinstance(v,int) else lit(json.dumps(v))+'::jsonb' if isinstance(v,(dict,list)) else lit(v) for v in args)+')'

    def group(self,args,user=None):
        return json.loads(self.sql(self.statement(args),user or self.owner))

    def receipt(self,operation,user=None):
        return self.rpc('get_family_trip_packing_group_receipt_v1',[self.trip,operation],user)

    def full_graph(self):
        return {'packing':self.graph(),'audit':json.loads(self.sql("select coalesce(jsonb_agg(to_jsonb(a)order by id),'[]') from public.family_audit_events a where trip_id="+lit(self.trip)))}

    def test_g01_complete_category_checks_only_changed_rows_and_clears_partial_counts(self):
        a=self.group_item(name='A',category='Gear',quantity=5,packed_quantity=2)
        b=self.group_item(name='B',category='Gear',checked=True)
        other=self.group_item(name='Other',category='Clothes')
        result=self.group(self.group_args())
        self.assertEqual(result['changed_ids'],[a['id']])
        self.assertEqual(result['kind'],'packing-group')
        self.assertEqual([x['id'] for x in result['items']],sorted([a['id'],b['id']]))
        self.assertTrue(all(x['checked'] and x['packed_quantity'] is None for x in result['items']))
        self.assertGreater(self.row(a['id'])['revision'],a['revision'])
        self.assertEqual(self.row(b['id']),b)
        self.assertEqual(self.row(other['id']),other)

    def test_g02_uncheck_clears_partial_counts_without_changing_other_facts(self):
        rows=[self.group_item(name='Partial',category='Gear',quantity=4,packed_quantity=2),self.group_item(name='Checked',category='Gear',checked=True)]
        result=self.group(self.group_args(checked=False))
        self.assertEqual(set(result['changed_ids']),{r['id']for r in rows})
        for before in rows:
            after=self.row(before['id'])
            self.assertFalse(after['checked']);self.assertIsNone(after['packed_quantity'])
            self.assertEqual({k:v for k,v in after.items()if k not in ['revision','updated_at','checked','packed_quantity']},{k:v for k,v in before.items()if k not in ['revision','updated_at','checked','packed_quantity']})

    def test_g03_filter_and_default_label_pair_are_explicit_raw_data(self):
        a=self.group_item(category='',name='Empty raw category')
        b=self.group_item(category='Other',name='Named Other',checked=True)
        c=self.group_item(category='Else',name='Other group')
        result=self.group(self.group_args(categories=['','Other'],status='open'))
        self.assertEqual([r['id']for r in result['items']],[a['id']])
        self.assertEqual(self.row(b['id']),b);self.assertEqual(self.row(c['id']),c)

    def test_g04_current_view_privacy_excludes_hidden_peer_and_other_visibility(self):
        hidden=self.group_item(category='Gear',name='Hidden medicine',visibility='personal',checked=True)
        common=self.group_item(category='Gear',name='Common raincoat')
        self.policy('trip.packing.manage','trip_travelers')
        result=self.group(self.group_args(user=self.editor),self.editor)
        self.assertEqual([r['id']for r in result['items']],[common['id']])
        self.assertNotIn(hidden['id'],json.dumps(result));self.assertNotIn('Hidden medicine',json.dumps(result))
        self.assertEqual(self.row(hidden['id']),hidden)
        # A guessed peer-private identity cannot turn group authority into visibility.
        bad=self.group_args(view='personal',user=self.editor)
        bad[6]=[{k:hidden[k] for k in ['id','revision','checked']}]
        before=self.full_graph()
        with self.assertRaisesRegex(RuntimeError,'PT409'):self.group(bad,self.editor)
        self.assertEqual(self.full_graph(),before)

    def test_g05_personal_includes_only_owned_or_actually_shared_visible_rows(self):
        owned=self.group_item(category='Gear',visibility='personal')
        shared=self.group_item(category='Gear',visibility='personal')
        self.sql('insert into public.packing_item_recipients(trip_id,item_id,person_id)values('+','.join(map(lit,[self.trip,shared['id'],self.editor_person]))+')')
        self.policy('trip.packing.manage','trip_travelers')
        out=self.group(self.group_args(view='personal',user=self.editor),self.editor)
        self.assertEqual([r['id']for r in out['items']],[shared['id']])
        self.assertEqual(self.row(owned['id']),owned)

    def test_g06_clear_completed_uses_whole_view_and_preserves_partial_and_other_view(self):
        done=self.group_item(category='A',checked=True)
        partial=self.group_item(category='B',quantity=3,packed_quantity=1)
        personal=self.group_item(category='A',checked=True,visibility='personal')
        args=self.group_args('clear-completed')
        out=self.group(args)
        self.assertEqual(out['changed_ids'],[done['id']])
        self.assertIsNotNone(self.row(done['id'])['deleted_at'])
        self.assertEqual(self.row(partial['id']),partial);self.assertEqual(self.row(personal['id']),personal)
        self.assertEqual(self.receipt(args[1])['result'],out)

    def test_g07_category_trash_retains_ids_relationships_and_existing_individual_restore(self):
        a=self.group_item(category='Gear',name='...')
        b=self.group_item(category='Gear',name='Retain relationships',visibility='personal')
        self.sql('insert into public.packing_item_recipients(trip_id,item_id,person_id)values('+','.join(map(lit,[self.trip,b['id'],self.editor_person]))+')')
        related=self.graph()['packing_item_recipients']
        out=self.group(self.group_args('group-trash',view='personal'))
        self.assertEqual(out['changed_ids'],[b['id']]);self.assertEqual(self.row(a['id']),a)
        self.assertEqual(self.graph()['packing_item_recipients'],related)
        self.execute('restore',target=b['id'])
        self.assertIsNone(self.row(b['id'])['deleted_at']);self.assertEqual(self.graph()['packing_item_recipients'],related)
        self.group(self.group_args('group-trash'))
        self.assertIsNotNone(self.row(a['id'])['deleted_at'])
        self.assertEqual(self.sql('select count(*)from public.packing_items where id='+lit(a['id'])),'1')

    def test_g08_empty_and_already_checked_groups_are_genuine_noops_with_receipts(self):
        a=self.group_item(category='Gear',checked=True)
        before=self.state();audits=self.full_graph()['audit'];args=self.group_args()
        out=self.group(args)
        self.assertEqual(out['changed_ids'],[]);self.assertEqual(self.row(a['id']),a)
        self.assertEqual(out['collection_revision'],before['collection_revision']);self.assertEqual(self.full_graph()['audit'],audits)
        empty=self.group(self.group_args(categories=['Not present']))
        self.assertEqual(empty['items'],[]);self.assertEqual(empty['changed_ids'],[])
        self.assertEqual(empty['collection_revision'],before['collection_revision'])
        self.assertEqual(self.receipt(args[1])['status'],'committed')

    def test_g09_unknown_receipt_is_not_success_and_other_actor_cannot_read_it(self):
        self.group_item(category='Gear')
        args=self.group_args();self.group(args)
        self.policy('trip.packing.manage','trip_travelers')
        out=self.receipt(args[1],self.editor)
        self.assertEqual(out['status'],'unknown');self.assertIsNone(out['result']);self.assertFalse(out['result_redacted'])

    def test_g10_exact_retry_after_later_edits_returns_original_without_overwrite(self):
        row=self.group_item(category='Gear');args=self.group_args();out=self.group(args)
        self.execute('update',{'name':'Later edit'},target=row['id'])
        before=self.full_graph();self.assertEqual(self.group(args),out);self.assertEqual(self.full_graph(),before)
        self.assertEqual(self.row(row['id'])['name'],'Later edit')
        changed=copy.deepcopy(args);changed[7]['checked']=False
        with self.assertRaisesRegex(RuntimeError,'PT409'):self.group(changed)
        self.assertEqual(self.full_graph(),before)

    def test_g11_stale_collection_row_fact_or_incomplete_set_has_zero_effect(self):
        a=self.group_item(category='Gear');self.group_item(category='Gear');args=self.group_args();before=self.full_graph()
        cases=[]
        for index in range(3):
            bad=copy.deepcopy(args)
            if index==0:bad[6]=bad[6][:-1]
            if index==1:bad[6][0]['revision']+=1
            if index==2:bad[6][0]['checked']=not bad[6][0]['checked']
            cases.append(bad)
        for bad in cases:
            with self.subTest(bad=bad[6]),self.assertRaisesRegex(RuntimeError,'PT409'):self.group(bad)
            self.assertEqual(self.full_graph(),before)
        self.execute('update',{'name':'A newer observation'},target=a['id']);before=self.full_graph()
        with self.assertRaisesRegex(RuntimeError,'PT409'):self.group(args)
        self.assertEqual(self.full_graph(),before)

    def test_g12_scope_cross_trip_and_parent_recovery_retire_original_but_receipt_proves_commit(self):
        self.group_item(category='Gear');args=self.group_args();out=self.group(args)
        root=json.loads(self.sql('select to_jsonb(t)from public.trips t where id='+lit(self.trip)))
        self.rpc('trash_family_trip',[self.trip,root['revision']])
        with self.assertRaisesRegex(RuntimeError,'42501'):self.group(args)
        root=json.loads(self.sql('select to_jsonb(t)from public.trips t where id='+lit(self.trip)))
        self.rpc('restore_family_trip',[self.trip,root['revision']])
        with self.assertRaisesRegex(RuntimeError,'PT409'):self.group(args)
        self.assertEqual(self.receipt(args[1])['result'],out)
        fresh=self.group_args()
        for field in ['trip_id','family_id','user_id','person_id']:
            bad=copy.deepcopy(fresh);bad[2][field]=str(uuid.uuid4())
            with self.subTest(field=field),self.assertRaisesRegex(RuntimeError,'PT409'):self.group(bad)
        bad=copy.deepcopy(fresh);bad[0]=self.new_trip('Foreign Trip')
        with self.assertRaisesRegex(RuntimeError,'PT409'):self.group(bad)

    def test_g13_current_direct_permission_membership_and_aal_are_mandatory(self):
        self.group_item(category='Gear');self.policy('trip.packing.manage','patriarch','trip_travelers')
        args=self.group_args(user=self.editor)
        with self.assertRaisesRegex(RuntimeError,'42501'):self.group(args,self.editor)
        self.policy('trip.packing.manage','trip_travelers');out=self.group(args,self.editor)
        self.policy('trip.packing.manage')
        with self.assertRaisesRegex(RuntimeError,'42501'):self.group(args,self.editor)
        with self.assertRaisesRegex(RuntimeError,'42501'):self.receipt(args[1],self.editor)
        self.policy('trip.packing.manage','trip_travelers')
        self.sql("update public.family_members set status='suspended'where family_id="+lit(self.family)+'and user_id='+lit(self.editor))
        try:
            with self.assertRaisesRegex(RuntimeError,'42501'):self.group(args,self.editor)
        finally:self.sql("update public.family_members set status='active'where family_id="+lit(self.family)+'and user_id='+lit(self.editor))
        with self.assertRaisesRegex(RuntimeError,'42501'):self.sql(self.statement(self.group_args()),self.owner,aal='aal1')
        self.assertEqual(self.receipt(args[1],self.editor)['result'],out)

    def test_g14_concurrent_exact_retry_has_one_result_and_different_originals_one_winner(self):
        self.group_item(category='Gear');args=self.group_args()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:out=list(pool.map(lambda _:self.group(args),range(2)))
        self.assertEqual(out[0],out[1])
        args=self.group_args(checked=False)
        def attempt(_):
            other=copy.deepcopy(args);other[1]=str(uuid.uuid4())
            try:return self.group(other)
            except RuntimeError as error:return str(error)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(attempt,range(2)))
        self.assertEqual(sum(isinstance(x,dict)for x in results),1)
        self.assertIn('PT409',next(x for x in results if isinstance(x,str)))

    def test_g15_item_and_group_share_one_operation_namespace_and_typed_receipt_boundaries(self):
        item=self.group_item(category='Gear');args=self.group_args();out=self.group(args)
        with self.assertRaisesRegex(RuntimeError,'22023'):self.rpc('get_family_trip_packing_receipt_v1',[self.trip,args[1]])
        with self.assertRaisesRegex(RuntimeError,'PT409'):self.execute('update',{'name':'Collision'},target=item['id'],operation=args[1])
        item_args=self.args('update',{'name':'New item'},target=item['id']);self.rpc('execute_family_trip_packing_v1',item_args)
        with self.assertRaisesRegex(RuntimeError,'22023'):self.receipt(item_args[1])
        bad=self.group_args();bad[1]=item_args[1]
        with self.assertRaisesRegex(RuntimeError,'PT409'):self.group(bad)
        self.assertEqual(self.receipt(args[1])['result'],out)

    def test_g16_redacted_commit_proves_history_without_revealing_no_longer_visible_rows(self):
        item=self.group_item(category='Gear',name='Previously visible')
        args=self.group_args();self.group(args)
        self.sql('update public.packing_items set is_private=true,owner_person_id='+lit(self.viewer_person)+'where id='+lit(item['id']))
        receipt=self.receipt(args[1]);self.assertEqual(receipt['status'],'committed');self.assertTrue(receipt['result_redacted']);self.assertIsNone(receipt['result'])
        self.assertNotIn(item['id'],json.dumps(receipt));self.assertNotIn('Previously visible',json.dumps(receipt))
        with self.assertRaisesRegex(RuntimeError,'42501'):self.group(args)

    def test_g17_late_second_row_failure_rolls_back_items_audits_state_and_receipt(self):
        self.group_item(category='Gear');self.group_item(category='Gear')
        before=self.full_graph();args=self.group_args();suffix=uuid.uuid4().hex
        function='family_auth.u04c1_fail_'+suffix;trigger='u04c1_fail_'+suffix
        self.sql('create function '+function+"()returns trigger language plpgsql set search_path=''as $$declare n integer;begin if new.trip_id="+lit(self.trip)+"::uuid then n:=coalesce(nullif(current_setting('u04c1.rows',true),''),'0')::integer+1;perform set_config('u04c1.rows',n::text,true);if n=2 then raise exception 'Fixture second-row failure'using errcode='23514';end if;end if;return new;end;$$;create trigger "+trigger+' before update on public.packing_items for each row execute function '+function+'()')
        try:
            with self.assertRaisesRegex(RuntimeError,'Fixture second-row failure'):self.group(args)
        finally:self.sql('drop trigger '+trigger+' on public.packing_items;drop function '+function+'()')
        self.assertEqual(self.full_graph(),before)
        self.assertEqual(self.receipt(args[1])['status'],'unknown')

    def test_g18_malformed_inputs_are_bounded_and_never_mutate(self):
        self.group_item(category='Gear');self.group_item(category='Gear');args=self.group_args();before=self.full_graph()
        cases=[]
        for selector in [{}, {**args[5],'unknown':True}, {**args[5],'categories':[]}, {**args[5],'categories':['Gear','Gear']}, {**args[5],'categories':['a','b','c']}, {**args[5],'view':'all'}, {**args[5],'status':'completed'}, {**args[5],'categories':None}]:
            bad=copy.deepcopy(args);bad[5]=selector;cases.append(bad)
        for values in [{},{'checked':None},{'checked':'true'},{'checked':True,'other':True}]:
            bad=copy.deepcopy(args);bad[7]=values;cases.append(bad)
        for observed in [args[6][::-1],args[6]+[args[6][-1]],[{**args[6][0],'extra':True}],[{**args[6][0],'revision':0}],[{**args[6][0],'id':'bad'}],{}]:
            bad=copy.deepcopy(args);bad[6]=observed;cases.append(bad)
        bad=copy.deepcopy(args);bad[4]=None;cases.append(bad)
        for bad in cases:
            with self.subTest(selector=bad[5],values=bad[7]),self.assertRaisesRegex(RuntimeError,'22023'):self.group(bad)
            self.assertEqual(self.full_graph(),before)

    def test_g19_real_auth_mfa_postgrest_request_and_raw_bypass_refusal(self):
        self.group_item(category='Gear');args=self.group_args()
        keys=['p_trip_id','p_operation_id','p_scope','p_action','p_expected_collection_revision','p_selector','p_observed_items','p_values']
        payload=dict(zip(keys,args));code,body=self.http('POST','/rest/v1/rpc/execute_family_trip_packing_group_v1',payload)
        self.assertEqual(code,200,body[:500]);result=json.loads(body);self.assertTrue(result['items'][0]['checked'])
        code,body=self.http('POST','/rest/v1/rpc/get_family_trip_packing_group_receipt_v1',{'p_trip_id':self.trip,'p_operation_id':args[1]})
        self.assertEqual(code,200,body[:500]);self.assertEqual(json.loads(body)['result'],result)
        code,body=self.http('POST','/auth/v1/token?grant_type=password',{'email':'p01-'+self.owner+'@fixture.invalid','password':'local-only'})
        self.assertEqual(code,200)
        aal1=json.loads(body)['access_token']
        code,_=self.http('POST','/rest/v1/rpc/execute_family_trip_packing_group_v1',payload,token=aal1)
        self.assertEqual(code,403)
        for token in [self.anon,self.service]:
            code,_=self.http('POST','/rest/v1/rpc/execute_family_trip_packing_group_v1',payload,token=token)
            self.assertNotEqual(code,200)
        self.assertEqual(self.sql("select has_function_privilege('authenticated','family_auth.packing_group_selected(public.packing_items,jsonb)','execute')"),'f')
        self.assertEqual(self.sql("select bool_and(not prosecdef)from pg_proc where oid in('public.execute_family_trip_packing_group_v1(uuid,uuid,jsonb,text,bigint,jsonb,jsonb,jsonb)'::regprocedure,'public.get_family_trip_packing_group_receipt_v1(uuid,uuid)'::regprocedure)"),'t')

    def test_g20_permission_revocation_is_rechecked_after_a_demonstrated_lock_wait(self):
        self.group_item(category='Gear');self.policy('trip.packing.manage','trip_travelers')
        first=self.group_args();waiting=self.group_args(checked=False,user=self.editor)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
            with self.held_authenticated_command(self.statement(first))as blocker:
                future=pool.submit(self.group,waiting,self.editor)
                self.wait_for_lock(waiting[1],blocker)
                self.policy('trip.packing.manage')
            with self.assertRaisesRegex(RuntimeError,'42501'):future.result(timeout=15)

    def test_g21_two_thousand_items_fit_the_real_bounded_group_and_oversize_observations_refuse(self):
        self.sql("insert into public.packing_items(trip_id,name,category,sort_order) select "+lit(self.trip)+",'Bulk item '||x,'Gear',x from generate_series(1,2000)x")
        args=self.group_args();self.assertEqual(len(args[6]),2000)
        out=self.group(args)
        self.assertEqual(len(out['items']),2000);self.assertEqual(len(out['changed_ids']),2000)
        self.assertTrue(all(r['checked']for r in out['items']))
        bad=self.group_args(checked=False);bad[6].append(bad[6][-1]);before=self.full_graph()
        with self.assertRaisesRegex(RuntimeError,'22023'):self.group(bad)
        self.assertEqual(self.full_graph(),before)

    def test_g22_parent_trash_serializes_before_a_waiting_group(self):
        self.group_item(category='Gear');args=self.group_args()
        root=json.loads(self.sql('select to_jsonb(t)from public.trips t where id='+lit(self.trip)))
        parent='select public.trash_family_trip('+lit(self.trip)+','+str(root['revision'])+')'
        with concurrent.futures.ThreadPoolExecutor(max_workers=1)as pool:
            with self.held_authenticated_command(parent)as blocker:
                future=pool.submit(self.group,args)
                self.wait_for_lock(args[1],blocker)
            with self.assertRaisesRegex(RuntimeError,'42501'):future.result(timeout=15)
        self.assertEqual(self.sql('select count(*)from family_auth.packing_command_receipts where operation_id='+lit(args[1])),'0')

    def test_g23_a_version_at_the_safe_protocol_limit_cannot_commit_an_unreadable_result(self):
        self.group_item(category='Gear')
        self.sql('update family_auth.trip_packing_state set collection_revision=9007199254740991 where trip_id='+lit(self.trip))
        args=self.group_args();before=self.full_graph()
        with self.assertRaisesRegex(RuntimeError,'54000'):self.group(args)
        self.assertEqual(self.full_graph(),before)
        self.assertEqual(self.receipt(args[1])['status'],'unknown')


if __name__=='__main__':
    unittest.main(verbosity=2)
