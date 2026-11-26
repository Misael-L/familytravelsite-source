"""C3c aggregate packing contracts for the dedicated guarded125 rehearsal.

Subclass the unchanged CategoryBound helpers. The main-owned runner must install
its new target adapter before importing this file; no historical guard is relaxed
here. SQL fault injection is transactional. This module does not run itself.
"""
import base64
import concurrent.futures
import copy
import json
import time
import uuid

from packing_category_bound import CategoryBound, lit


class CategoryAggregate(CategoryBound):
    @classmethod
    def sql(cls, statement, user=None, role='authenticated', aal='aal2', fail=False):
        # Historical admin fixtures disable/re-enable the item version trigger.
        #125 adds deferred integrity events; validate them before ALTER TABLE.
        # Preserve the historical files and every actual RPC/authorization path.
        marker = ';alter table public.packing_items enable trigger ab_packing_v1_version;'
        if (user is None and marker in statement
                and 'disable trigger ab_packing_v1_version;' in statement):
            statement = statement.replace(marker, ';set constraints all immediate' + marker)
        return super().sql(statement, user, role, aal, fail)

    AGGREGATE_RPC = 'execute_family_trip_packing_category_aggregate_v3'
    ARG_NAMES = (
        'p_trip_id', 'p_operation_id', 'p_scope', 'p_action', 'p_target_id',
        'p_expected_collection_revision', 'p_observed', 'p_values',
    )

    def lane3(self, visibility='common', user=None):
        return self.rpc('get_family_trip_packing_category_lane_v3',
                        [self.trip, visibility], user)

    def observation3(self, category, deleted=False, user=None):
        key = category['id'] if isinstance(category, dict) else category
        statement = (
            'select public.get_family_trip_packing_category_aggregate_v3('
            + lit(self.trip) + ',' + lit(key) + ','
            + ('true' if deleted else 'false') + ')'
        )
        return json.loads(self.sql(statement, user or self.owner))

    def aggregate_args(self, category=None, action='category-trash-batch',
                       user=None, observed=None, ordered_ids=None, operation=None):
        if observed is None:
            observed = (self.lane3(user=user) if action == 'category-reorder'
                        else self.observation3(
                            category, action == 'category-restore-batch', user))
        return [
            self.trip, operation or str(uuid.uuid4()), copy.deepcopy(observed['scope']),
            action, None if action == 'category-reorder' else observed['category']['id'],
            observed['collection_revision'], copy.deepcopy(observed),
            {'ordered_ids': list(ordered_ids) if ordered_ids is not None
             else [c['id'] for c in observed['categories']]}
            if action == 'category-reorder' else {},
        ]

    def aggregate3(self, args, user=None):
        return self.rpc(self.AGGREGATE_RPC, args, user)

    def aggregate_receipt3(self, operation, user=None):
        return self.rpc('get_family_trip_packing_category_aggregate_receipt_v3',
                        [self.trip, operation], user)

    def batches3(self, limit=50, cursor=None, user=None):
        return self.rpc('list_family_trip_packing_category_batches_v3', [
            self.trip, limit, cursor['deleted_at'] if cursor else None,
            cursor['id'] if cursor else None,
        ], user)

    def aggregate_statement(self, args):
        def value(v):
            if v is None:
                return 'null'
            if isinstance(v, bool):
                return 'true' if v else 'false'
            if isinstance(v, int):
                return str(v)
            if isinstance(v, (dict, list)):
                return lit(json.dumps(v)) + '::jsonb'
            return lit(v)
        return 'select public.' + self.AGGREGATE_RPC + '(' + ','.join(map(value, args)) + ')'

    def aggregate_http(self, args, token=None):
        code, body = self.http('POST', '/rest/v1/rpc/' + self.AGGREGATE_RPC,
                               dict(zip(self.ARG_NAMES, args)), token=token)
        return code, json.loads(body)

    def aggregate_graph(self):
        tables = {}
        for table in ('packing_category_batches', 'packing_category_batch_items'):
            tables[table] = json.loads(self.sql(
                "select coalesce(jsonb_agg(to_jsonb(x)order by to_jsonb(x)::text),'[]')"
                + 'from family_auth.' + table + ' x where trip_id=' + lit(self.trip)))
        return {'foundation': self.foundation(), **tables}

    def aggregate_no_effect(self, args, pattern='PT409', user=None):
        before = self.aggregate_graph()
        with self.assertRaisesRegex(RuntimeError, pattern):
            self.aggregate3(args, user)
        self.assertEqual(self.aggregate_graph(), before)

    def sql_no_effect(self, statement, pattern='PT409|23514'):
        before = self.aggregate_graph()
        with self.assertRaisesRegex(RuntimeError, pattern):
            self.sql(statement)
        self.assertEqual(self.aggregate_graph(), before)

    def assert_deferred_refusal(self, mutation):
        # A failure in the mutation itself cannot masquerade as deferred proof.
        # Preserve the diagnostic marker rather than accepting any SQL error.
        before = self.aggregate_graph()
        statement = (
            "begin;set constraints all deferred;do $mutate$begin begin "
            + mutation + ";exception when others then "
            "raise exception 'C3c mutation failed before deferred validation: %',SQLERRM "
            "using errcode='P0001';end;end $mutate$;"
            "set constraints all immediate;rollback;"
        )
        with self.assertRaisesRegex(RuntimeError, 'PT409|23514') as caught:
            self.sql(statement)
        self.assertNotIn('C3c mutation failed before deferred validation', str(caught.exception))
        self.assertEqual(self.aggregate_graph(), before)

    def assert_immediate_refusal(self, mutation, code, message):
        # If mutation succeeds, stop with a different SQLSTATE before flushing
        # constraints. A deferred rejection therefore cannot pass this proof.
        before = self.aggregate_graph()
        statement = (
            'begin;set constraints all deferred;' + mutation
            + ";do $unexpected$begin raise exception "
            "'C3c mutation unexpectedly reached the post-mutation marker'"
            "using errcode='P0001';end $unexpected$;rollback;"
        )
        with self.assertRaisesRegex(RuntimeError, code) as caught:
            self.sql(statement)
        self.assertIn(message, str(caught.exception))
        self.assertNotIn('post-mutation marker', str(caught.exception))
        self.assertEqual(self.aggregate_graph(), before)

    def receipt_record3(self, operation, user=None):
        # Only this test's synthetic receipts; never fetch fixture credentials.
        return json.loads(self.sql(
            'select to_jsonb(r)from family_auth.packing_command_receipts r where trip_id='
            + lit(self.trip) + ' and actor_user_id=' + lit(user or self.owner)
            + ' and operation_id=' + lit(operation)))

    def receipt_insert_statement3(self, receipt):
        # Deliberately forged SQL fixture, not a command API or a valid retry.
        fields = (
            'trip_id', 'actor_user_id', 'actor_person_id', 'operation_id',
            'action', 'target_id', 'category_id', 'request_sha256',
            'before_state', 'after_state', 'result',
        )
        values = []
        for field in fields:
            value = receipt[field]
            if value is None:
                values.append('null')
            elif field in ('before_state', 'after_state', 'result'):
                values.append(lit(json.dumps(value)) + '::jsonb')
            elif field == 'request_sha256':
                values.append(lit(value) + '::bytea')
            else:
                values.append(lit(value))
        return ('insert into family_auth.packing_command_receipts('
                + ','.join(fields) + ')values(' + ','.join(values) + ')')

    def malformed_completed_history_statement3(self, trashed, restored, field, missing):
        # Clone a completed synthetic history onto fresh receipt/header keys.
        # Current live rows match the legitimate restored facts. The only
        # invalid content is the missing/null deleted fact in the Trash proof.
        trash = self.receipt_record3(trashed['operation_id'])
        restore = self.receipt_record3(restored['operation_id'])
        trash_operation, restore_operation = str(uuid.uuid4()), str(uuid.uuid4())
        batch = {**trashed['batch'], 'operation_id': trash_operation}
        item = sorted(trash['after_state']['items'])[0]
        row = trash['after_state']['items'][item]['row']
        if missing:
            row.pop(field)
        else:
            row[field] = None
        trash['operation_id'] = trash_operation
        trash['after_state']['batch'] = copy.deepcopy(batch)
        trash['result']['operation_id'] = trash_operation
        trash['result']['batch'] = copy.deepcopy(batch)
        public_item = next(r for r in trash['result']['items'] if r['id'] == item)
        if missing:
            public_item.pop(field)
        else:
            public_item[field] = None

        restore['operation_id'] = restore_operation
        restore['before_state']['items'] = copy.deepcopy(trash['after_state']['items'])
        restore['before_state']['batch'] = copy.deepcopy(batch)
        restore['after_state']['batch'] = copy.deepcopy(batch)
        restore['result']['operation_id'] = restore_operation
        restore['result']['batch'] = copy.deepcopy(batch)

        old_where = self.batch_where(trashed['batch'])
        new_where = self.batch_where(batch)
        statements = [
            self.receipt_insert_statement3(trash),
            self.receipt_insert_statement3(restore),
            'insert into family_auth.packing_category_batches('
            'trip_id,actor_user_id,operation_id,category_id,deleted_at,category_revision)'
            'select trip_id,actor_user_id,' + lit(trash_operation)
            + ',category_id,deleted_at,category_revision'
            ' from family_auth.packing_category_batches where ' + old_where,
            'insert into family_auth.packing_category_batch_items('
            'trip_id,actor_user_id,operation_id,item_id,deleted_revision)'
            'select trip_id,actor_user_id,' + lit(trash_operation)
            + ',item_id,deleted_revision from family_auth.packing_category_batch_items where '
            + old_where,
            'update family_auth.packing_category_batches set restored_at=clock_timestamp(),'
            'restored_by_user_id=' + lit(restore['actor_user_id'])
            + ',restored_operation_id=' + lit(restore_operation) + ' where ' + new_where,
        ]
        return ';'.join(statements)

    def forged_restore_statement3(self, trashed):
        # Fabricate internally consistent typed receipt facts without touching
        # any actual category/item row. Only the transition guard can reject
        # the divergence from these otherwise complete receipt bodies.
        original = self.receipt_record3(trashed['operation_id'])
        forged = copy.deepcopy(original)
        operation = str(uuid.uuid4())
        stamp = json.loads(self.sql('select to_jsonb(clock_timestamp())'))
        after = copy.deepcopy(original['after_state'])
        after['category'].update(
            deleted_at=None, deleted_by_person_id=None,
            revision=after['category']['revision'] + 1, updated_at=stamp)
        for state in after['items'].values():
            state['row'].update(
                deleted_at=None, deleted_by_person_id=None,
                revision=state['row']['revision'] + 1, updated_at=stamp)
        after['collection_revision'] += len(after['items']) + 1

        result = copy.deepcopy(trashed)
        result.update(
            operation_id=operation, action='category-restore-batch',
            category=copy.deepcopy(after['category']),
            collection_revision=after['collection_revision'])
        for item in result['items']:
            item.update(deleted_at=None, deleted_by_person_id=None,
                        revision=item['revision'] + 1, updated_at=stamp)
        forged.update(
            operation_id=operation, action='category-restore-batch',
            before_state=copy.deepcopy(original['after_state']),
            after_state=after, result=result)
        category = trashed['category']['id']
        members = len(after['items'])
        return (
            self.receipt_insert_statement3(forged)
            + ';update family_auth.packing_category_batches set restored_at=clock_timestamp(),'
            'restored_by_user_id=' + lit(self.owner) + ',restored_operation_id=' + lit(operation)
            + ' where ' + self.batch_where(trashed['batch'])
            + ';if not exists(select 1 from public.packing_categories where id=' + lit(category)
            + ' and deleted_at is not null)or(select count(*)from public.packing_items where trip_id='
            + lit(self.trip) + ' and category_id=' + lit(category)
            + ' and deleted_at is not null)<>' + str(members)
            + " then raise exception 'C3c forged proof unexpectedly changed actual rows'"
            " using errcode='P0001';end if"
        )

    def seed_category(self, name='Aggregate', count=2, visibility='common', user=None):
        c = self.empty(name, visibility, user)
        items = []
        for index in range(count):
            r = self.bound(self.bound_args(c, values={'name': 'Item ' + str(index)},
                                           user=user), user)
            c = r['category']
            items.append(r['item'])
        return c, items

    def trash_batch(self, category, user=None):
        args = self.aggregate_args(category, user=user)
        return args, self.aggregate3(args, user)

    def restore_batch(self, category, user=None):
        args = self.aggregate_args(category, 'category-restore-batch', user=user)
        return args, self.aggregate3(args, user)

    def batch_where(self, batch):
        return ('trip_id=' + lit(self.trip) + ' and actor_user_id='
                + lit(batch['actor_user_id']) + ' and operation_id=' + lit(batch['operation_id']))

    def header3(self, batch):
        return json.loads(self.sql(
            'select to_jsonb(b)from family_auth.packing_category_batches b where '
            + self.batch_where(batch)))

    def members3(self, batch):
        return json.loads(self.sql(
            "select coalesce(jsonb_agg(to_jsonb(m)order by item_id),'[]')"
            'from family_auth.packing_category_batch_items m where ' + self.batch_where(batch)))

    def assert_result3(self, result, args):
        common = {
            'version', 'kind', 'trip_id', 'operation_id', 'scope', 'action',
            'target_id', 'values', 'collection_revision', 'changed',
        }
        extras = ({'lane', 'categories'} if args[3] == 'category-reorder'
                  else {'category', 'items', 'batch'})
        self.assertEqual(set(result), common | extras)
        self.assertEqual((result['version'], result['kind']), (3, 'packing-category-aggregate'))
        for key, index in [('trip_id', 0), ('operation_id', 1), ('scope', 2),
                           ('action', 3), ('target_id', 4), ('values', 7)]:
            self.assertEqual(result[key], args[index], key)
        self.assertIsInstance(result['changed'], bool)
        self.assertGreaterEqual(result['collection_revision'], args[5])
        self.assertLessEqual(result['collection_revision'], 9007199254740991)

    def test_g01_lane_v3_shape_retained_empties_and_read_purity(self):
        a = self.empty('Empty A')
        b, _ = self.seed_category('Filled B', 1)
        before = self.aggregate_graph()
        lane = self.lane3()
        self.assertEqual(set(lane), {
            'version', 'kind', 'scope', 'collection_revision',
            'lane', 'owner_person_id', 'categories',
        })
        self.assertEqual((lane['version'], lane['kind'], lane['lane']),
                         (3, 'packing-category-lane', 'common'))
        self.assertIsNone(lane['owner_person_id'])
        self.assertEqual(lane['categories'], [self.category2(a['id']), self.category2(b['id'])])
        self.assertEqual(lane['scope'], self.packet2()['scope'])
        self.assertEqual(self.aggregate_graph(), before)

    def test_g02_personal_lane_excludes_read_shared_foreign_categories(self):
        self.policy('trip.packing.manage', 'trip_travelers')
        own = self.empty('Same', 'personal')
        peer, rows = self.seed_category('Same', 1, 'personal', self.editor)
        self.sql('insert into public.packing_item_recipients(trip_id,item_id,person_id)values('
                 + ','.join(map(lit, [self.trip, rows[0]['id'], self.person])) + ')')
        lane = self.lane3('personal')
        self.assertEqual(lane['owner_person_id'], self.person)
        self.assertEqual([c['id'] for c in lane['categories']], [own['id']])
        self.assertNotIn(peer['id'], json.dumps(lane))

    def test_g03_lane_keeps_raw_empty_other_and_unicode_identity_distinct(self):
        labels = ['', 'Other', ' Gear ', 'Gear', 'gear', 'é', 'e\u0301', '__proto__', '...']
        ids = []
        for name in labels:
            item = self.create(category=name)
            ids.append(self.category(item['id']))
        lane = self.lane3()
        self.assertEqual([c['name'] for c in lane['categories']], labels)
        self.assertEqual([c['id'] for c in lane['categories']], ids)
        self.assertEqual(len(set(ids)), len(labels))

    def test_g04_observation_shape_complete_uuid_sorted_items_and_no_batch(self):
        c, items = self.seed_category()
        before = self.aggregate_graph()
        observed = self.observation3(c)
        self.assertEqual(set(observed), {
            'version', 'kind', 'scope', 'collection_revision', 'category', 'items', 'batch',
        })
        self.assertEqual((observed['version'], observed['kind']),
                         (3, 'packing-category-observation'))
        self.assertEqual(observed['category'], self.category2(c['id']))
        self.assertEqual(observed['items'], sorted(items, key=lambda r: r['id']))
        self.assertIsNone(observed['batch'])
        self.assertEqual(self.aggregate_graph(), before)

    def test_g05_reorder_changes_only_complete_owner_lane_category_ranks(self):
        a, _ = self.seed_category('A', 1)
        b = self.empty('Empty B')
        c = self.empty('Empty C')
        private = self.empty('Own', 'personal')
        before = self.aggregate_graph()
        args = self.aggregate_args(action='category-reorder',
                                   ordered_ids=[c['id'], b['id'], a['id']])
        result = self.aggregate3(args)
        self.assert_result3(result, args)
        self.assertTrue(result['changed'])
        self.assertEqual(result['lane'], 'common')
        self.assertEqual(result['categories'], self.lane3()['categories'])
        self.assertEqual([r['id'] for r in result['categories']], args[7]['ordered_ids'])
        self.assertEqual(self.category2(private['id']), private)
        self.assertEqual(self.graph()['packing_items'],
                         before['foundation']['old']['packing']['packing_items'])
        self.assertEqual(self.aggregate_graph()['packing_category_batches'], [])

    def test_g06_identical_lane_order_is_receipt_only_without_revision_or_audit(self):
        self.empty('A')
        self.empty('Empty B')
        args = self.aggregate_args(action='category-reorder')
        before = self.aggregate_graph()
        result = self.aggregate3(args)
        self.assert_result3(result, args)
        self.assertFalse(result['changed'])
        self.assertEqual(result['collection_revision'], args[5])
        after = self.aggregate_graph()
        after['foundation']['old']['packing']['receipts'] = before['foundation']['old']['packing']['receipts']
        self.assertEqual(after, before)
        self.assertEqual(self.aggregate_receipt3(args[1])['result'], result)

    def test_g07_reorder_requires_unique_complete_uuid_permutation(self):
        a = self.empty('A')
        b = self.empty('B')
        args = self.aggregate_args(action='category-reorder')
        for ids in ([], [a['id']], [a['id'], a['id']], [a['id'], str(uuid.uuid4())],
                    [a['id'], b['id'], str(uuid.uuid4())]):
            with self.subTest(ids=ids):
                bad = copy.deepcopy(args)
                bad[7] = {'ordered_ids': ids}
                self.aggregate_no_effect(bad, '22023|PT409')

    def test_g08_reorder_refuses_filtered_lane_and_forged_owner_or_facts(self):
        self.empty('A')
        self.empty('B')
        args = self.aggregate_args(action='category-reorder')
        variants = []
        bad = copy.deepcopy(args)
        bad[6]['categories'] = bad[6]['categories'][:1]
        bad[7]['ordered_ids'] = [bad[6]['categories'][0]['id']]
        variants.append(bad)
        for key, value in [('owner_person_id', self.person), ('lane', 'personal')]:
            bad = copy.deepcopy(args)
            bad[6][key] = value
            variants.append(bad)
        bad = copy.deepcopy(args)
        bad[6]['categories'][0]['name'] = 'Tampered'
        variants.append(bad)
        for bad in variants:
            self.aggregate_no_effect(bad, '22023|PT409')

    def test_g09_reorder_cannot_include_another_owner_lane(self):
        common = self.empty('Common')
        own = self.empty('Own', 'personal')
        args = self.aggregate_args(action='category-reorder',
                                   ordered_ids=[own['id'], common['id']])
        self.aggregate_no_effect(args, '22023|PT409')
        personal = self.lane3('personal')
        args = self.aggregate_args(action='category-reorder', observed=personal,
                                   ordered_ids=[common['id']])
        self.aggregate_no_effect(args, '22023|PT409')

    def test_g10_lane_ties_use_uuid_and_reorder_does_not_rewrite_item_order(self):
        categories = [self.seed_category('Tie ' + str(n), 1)[0] for n in range(3)]
        self.metadata('update public.packing_categories set sort_order=7 where trip_id=' + lit(self.trip))
        lane = self.lane3()
        self.assertEqual([c['id'] for c in lane['categories']],
                         sorted(c['id'] for c in categories))
        rows = self.graph()['packing_items']
        ids = list(reversed([c['id'] for c in lane['categories']]))
        result = self.aggregate3(self.aggregate_args(action='category-reorder',
                                                      observed=lane, ordered_ids=ids))
        self.assertEqual([c['id'] for c in result['categories']], ids)
        self.assertEqual(self.graph()['packing_items'], rows)

    def test_g11_collection_and_outer_observation_coupling_cannot_be_rebased(self):
        c, _ = self.seed_category()
        args = self.aggregate_args(c)
        self.empty('Unrelated newer category')
        self.aggregate_no_effect(args)
        bad = copy.deepcopy(args)
        bad[5] = self.packet2()['collection_revision']
        self.aggregate_no_effect(bad, '22023|PT409')
        bad = self.aggregate_args(c)
        bad[6]['scope']['layer'] = 'myDraft'
        self.aggregate_no_effect(bad, '22023|PT409')

    def test_g12_trash_ack_and_relational_manifest_match_exact_deleted_revisions(self):
        c, items = self.seed_category()
        args, result = self.trash_batch(c)
        self.assert_result3(result, args)
        self.assertTrue(result['changed'])
        self.assertEqual([i['id'] for i in result['items']], sorted(i['id'] for i in items))
        batch = result['batch']
        self.assertEqual(batch, {'actor_user_id': self.owner,
                                 'operation_id': args[1], 'item_count': len(items)})
        header = self.header3(batch)
        self.assertEqual(header['category_id'], c['id'])
        self.assertEqual(header['deleted_at'], result['category']['deleted_at'])
        self.assertEqual(header['category_revision'], result['category']['revision'])
        self.assertIsNone(header['restored_at'])
        self.assertIsNone(header['restored_by_user_id'])
        self.assertIsNone(header['restored_operation_id'])
        self.assertEqual([m['item_id'] for m in self.members3(batch)], sorted(i['id'] for i in items))
        for member in self.members3(batch):
            self.assertEqual(member['deleted_revision'], self.row(member['item_id'])['revision'])
        self.assertEqual(self.state()['items'], [])
        self.assertEqual(self.lane3()['categories'], [])

    def test_g13_prior_individual_trash_is_never_a_batch_member_or_resurrected(self):
        c, items = self.seed_category(count=3)
        prior = items[0]['id']
        self.execute('trash', target=prior)
        old = self.row(prior)
        _, trashed = self.trash_batch(c)
        expected = sorted(i['id'] for i in items[1:])
        self.assertEqual([m['item_id'] for m in self.members3(trashed['batch'])], expected)
        _, restored = self.restore_batch(c)
        self.assertEqual([i['id'] for i in restored['items']], expected)
        self.assertEqual(self.row(prior), old)
        self.assertEqual(sorted(i['id'] for i in self.state()['items']), expected)

    def test_g14_same_label_common_and_two_personal_owners_are_not_touched_together(self):
        self.policy('trip.packing.manage', 'trip_travelers')
        common, _ = self.seed_category('Same', 1)
        own, own_rows = self.seed_category('Same', 1, 'personal')
        peer, peer_rows = self.seed_category('Same', 1, 'personal', self.editor)
        preserved = {i['id']: self.row(i['id']) for i in own_rows + peer_rows}
        self.trash_batch(common)
        self.assertEqual(self.category2(own['id']), own)
        self.assertEqual(self.category2(peer['id']), peer)
        for key, row in preserved.items():
            self.assertEqual(self.row(key), row)

    def test_g15_trash_restore_preserves_raw_rows_links_bags_and_assignment_provenance(self):
        c = self.empty(' Raw é ')
        bag = self.bag()
        item = self.bound(self.bound_args(c, values={
            'name': '...', 'quantity': 4, 'packed_quantity': 2,
            'weight_grams': 75, 'bag_id': bag,
        }))['item']['id']
        self.assign(c['id'], provenance=True)
        for table, person in [('packing_item_recipients', self.viewer_person),
                              ('packing_item_contributors', self.editor_person)]:
            self.sql('insert into public.' + table + '(trip_id,item_id,person_id)values('
                     + ','.join(map(lit, [self.trip, item, person])) + ')')
        before = self.foundation()
        self.trash_batch(c)
        self.restore_batch(c)
        after = self.foundation()
        for table in ('packing_item_recipients', 'packing_item_contributors', 'packing_bags'):
            self.assertEqual(after['old']['packing'][table], before['old']['packing'][table])
        self.assertEqual(after['assignments'], before['assignments'])
        original = before['old']['packing']['packing_items'][0]
        current = self.row(item)
        for key in original:
            if key not in ('revision', 'updated_at', 'deleted_at', 'deleted_by_person_id'):
                self.assertEqual(current[key], original[key], key)

    def test_g16_legacy_empty_dismiss_restore_without_batch_is_unchanged(self):
        c = self.empty('Legacy empty')
        trashed = self.dismiss(c)
        before = self.aggregate_graph()
        result = self.life(self.lifecycle_args('category-restore-empty', target=c['id']))
        self.assertIsNone(result['category']['deleted_at'])
        self.assertEqual(result['category']['id'], trashed['id'])
        self.assertEqual(self.aggregate_graph()['packing_category_batches'],
                         before['packing_category_batches'])
        self.assertEqual(self.aggregate_graph()['packing_category_batch_items'], [])

    def test_g17_strict_actions_values_observation_shape_and_bounds_refuse(self):
        c, _ = self.seed_category()
        args = self.aggregate_args(c)
        variants = []
        for index, value in [(3, 'category-trash'), (4, None), (5, -1),
                             (5, 9007199254740992), (6, {}), (7, {'name': 'Wrong'})]:
            bad = copy.deepcopy(args)
            bad[index] = value
            variants.append(bad)
        bad = copy.deepcopy(args)
        bad[6]['extra'] = True
        variants.append(bad)
        for bad in variants:
            self.aggregate_no_effect(bad, '22023|54000')
        # This remains structurally comparable, but no longer equals the
        # complete original observation; do not classify it as a shape error.
        bad = copy.deepcopy(args)
        del bad[6]['category']['updated_at']
        self.aggregate_no_effect(bad, 'PT409')
        for key, value in [('layer', 'myDraft'), ('person_id', self.editor_person),
                           ('user_id', self.editor), ('family_id', str(uuid.uuid4())),
                           ('trip_lifecycle_revision', args[2]['trip_lifecycle_revision'] + 1)]:
            bad = copy.deepcopy(args)
            bad[2][key] = value
            bad[6]['scope'] = copy.deepcopy(bad[2])
            self.aggregate_no_effect(bad, '22023|PT409')
        for visibility in ('foreign', '', None):
            with self.assertRaisesRegex(RuntimeError, '22023'):
                self.lane3(visibility)

    def test_g18_trash_refuses_missing_duplicate_foreign_or_unsorted_children(self):
        c, _ = self.seed_category(count=2)
        other, other_items = self.seed_category('Other', 1)
        args = self.aggregate_args(c)
        variants = [
            [], args[6]['items'][:1],
            [args[6]['items'][0], args[6]['items'][0]],
            list(reversed(args[6]['items'])),
            sorted(args[6]['items'] + other_items, key=lambda i: i['id']),
        ]
        for items in variants:
            bad = copy.deepcopy(args)
            bad[6]['items'] = copy.deepcopy(items)
            self.aggregate_no_effect(bad, '22023|PT409')
        self.assertIsNone(self.category2(other['id'])['deleted_at'])

    def test_g19_trash_requires_original_child_facts_and_assignment_observation(self):
        c, items = self.seed_category()
        args = self.aggregate_args(c)
        for field, value in [('name', 'Forged'), ('revision', items[0]['revision'] + 1),
                             ('checked', True)]:
            bad = copy.deepcopy(args)
            bad[6]['items'][0][field] = value
            self.aggregate_no_effect(bad, '22023|PT409')
        self.assign(c['id'], provenance=True)
        bad = copy.deepcopy(args)
        fresh = self.observation3(c)
        bad[5] = fresh['collection_revision']
        bad[6]['collection_revision'] = fresh['collection_revision']
        self.aggregate_no_effect(bad)

    def test_g20_rename_before_trash_never_falls_back_to_the_old_label(self):
        c, _ = self.seed_category('Original', 1)
        args = self.aggregate_args(c)
        self.cat(self.meta_for(c, values={'name': 'Current'}))
        self.aggregate_no_effect(args)
        self.assertIsNone(self.lookup2('Original')['category'])
        self.assertEqual(self.category2(c['id'])['name'], 'Current')
        self.assertEqual(self.aggregate_graph()['packing_category_batches'], [])

    def test_g21_restore_ack_restores_original_identity_and_preserves_rank_ties(self):
        c, items = self.seed_category()
        original = {i['id']: self.row(i['id']) for i in items}
        _, trashed = self.trash_batch(c)
        other = self.empty('Other')
        self.metadata('update public.packing_categories set sort_order=' + str(c['sort_order'])
                      + ' where id=' + lit(other['id']))
        args, result = self.restore_batch(c)
        self.assert_result3(result, args)
        self.assertTrue(result['changed'])
        self.assertEqual(result['category']['id'], c['id'])
        self.assertIsNone(result['category']['deleted_at'])
        self.assertEqual(result['category']['sort_order'], c['sort_order'])
        self.assertEqual(result['batch'], trashed['batch'])
        header = self.header3(trashed['batch'])
        self.assertIsNotNone(header['restored_at'])
        self.assertEqual((header['restored_by_user_id'], header['restored_operation_id']),
                         (self.owner, args[1]))
        for item in result['items']:
            self.assertIsNone(item['deleted_at'])
            self.assertEqual(item['sort_order'], original[item['id']]['sort_order'])

    def test_g22_another_current_authorized_actor_can_restore_common_batch(self):
        self.policy('trip.packing.manage', 'trip_travelers')
        c, _ = self.seed_category()
        _, trashed = self.trash_batch(c)
        observed = self.observation3(c, True, self.editor)
        self.assertEqual(observed['batch']['actor_user_id'], self.owner)
        args = self.aggregate_args(c, 'category-restore-batch',
                                   user=self.editor, observed=observed)
        result = self.aggregate3(args, self.editor)
        self.assertEqual(result['batch'], trashed['batch'])
        self.assertEqual(result['scope']['person_id'], self.editor_person)
        header = self.header3(trashed['batch'])
        self.assertEqual((header['actor_user_id'], header['restored_by_user_id']),
                         (self.owner, self.editor))
        self.assertEqual(self.aggregate_receipt3(args[1], self.editor)['result'], result)
        self.assertEqual(self.aggregate_receipt3(args[1])['status'], 'unknown')

    def test_g23_private_batch_remains_owner_only_even_with_prior_read_sharing(self):
        self.policy('trip.packing.manage', 'trip_travelers')
        c, items = self.seed_category('Private', 1, 'personal')
        self.sql('insert into public.packing_item_recipients(trip_id,item_id,person_id)values('
                 + ','.join(map(lit, [self.trip, items[0]['id'], self.editor_person])) + ')')
        _, trashed = self.trash_batch(c)
        with self.assertRaisesRegex(RuntimeError, '42501'):
            self.observation3(c, True, self.editor)
        self.assertNotIn(c['id'], json.dumps(self.batches3(user=self.editor)))
        args = self.aggregate_args(c, 'category-restore-batch')
        args[2] = self.packet2(self.editor)['scope']
        args[6]['scope'] = copy.deepcopy(args[2])
        self.aggregate_no_effect(args, '42501|22023', self.editor)
        self.assertIsNone(self.header3(trashed['batch'])['restored_at'])

    def test_g24_propose_deny_and_nonmember_have_no_aggregate_authority(self):
        self.policy('trip.packing.manage', 'trip_travelers')
        c, _ = self.seed_category()
        args = self.aggregate_args(c, user=self.editor)
        for direct, propose in [('patriarch', 'trip_travelers'), (None, None)]:
            self.policy('trip.packing.manage', direct, propose)
            self.aggregate_no_effect(args, '42501', self.editor)
            for call in (lambda: self.lane3(user=self.editor),
                         lambda: self.observation3(c, user=self.editor),
                         lambda: self.batches3(user=self.editor)):
                with self.assertRaisesRegex(RuntimeError, '42501'):
                    call()
        self.aggregate_no_effect(self.aggregate_args(c), '42501', self.stranger)

    def test_g25_common_restore_checks_current_direct_authority_not_trash_author(self):
        self.policy('trip.packing.manage', 'trip_travelers')
        c, _ = self.seed_category()
        self.trash_batch(c)
        args = self.aggregate_args(c, 'category-restore-batch', user=self.editor)
        self.policy('trip.packing.manage', 'patriarch', 'trip_travelers')
        self.aggregate_no_effect(args, '42501', self.editor)
        self.restore_batch(c)

    def test_g26_root_recovery_preserves_pending_batch_but_retires_original_scope(self):
        c, _ = self.seed_category()
        trash_args, trash_result = self.trash_batch(c)
        restore_args = self.aggregate_args(c, 'category-restore-batch')
        before = self.aggregate_graph()
        revision = before['foundation']['root']['revision']
        self.rpc('trash_family_trip', [self.trip, revision])
        with self.assertRaisesRegex(RuntimeError, '42501'):
            self.aggregate3(restore_args)
        revision = int(self.sql('select revision from public.trips where id=' + lit(self.trip)))
        self.rpc('restore_family_trip', [self.trip, revision])
        after = self.aggregate_graph()
        for key in ('packing_category_batches', 'packing_category_batch_items'):
            self.assertEqual(after[key], before[key])
        self.assertEqual(after['foundation']['categories'], before['foundation']['categories'])
        self.assertEqual(after['foundation']['old']['packing']['packing_items'],
                         before['foundation']['old']['packing']['packing_items'])
        self.aggregate_no_effect(restore_args)
        self.assertEqual(self.aggregate_receipt3(trash_args[1])['result'], trash_result)
        self.restore_batch(c)

    def test_g27_unrelated_collection_changes_do_not_freeze_pending_rows(self):
        c, _ = self.seed_category()
        _, trashed = self.trash_batch(c)
        pending = self.aggregate_graph()
        unrelated = self.create(category='Elsewhere', name='Editable')
        self.execute('update', {'name': 'Current elsewhere'}, target=unrelated['id'])
        after = self.aggregate_graph()
        for key in ('packing_category_batches', 'packing_category_batch_items'):
            self.assertEqual(after[key], pending[key])
        self.assertEqual(self.header3(trashed['batch'])['category_revision'],
                         trashed['category']['revision'])
        self.restore_batch(c)
        self.assertEqual(self.row(unrelated['id'])['name'], 'Current elsewhere')

    def test_g28_deleted_observation_is_explicit_and_active_observation_is_not_a_restore(self):
        c, _ = self.seed_category()
        active = self.observation3(c)
        _, trashed = self.trash_batch(c)
        with self.assertRaisesRegex(RuntimeError, '42501|PT409'):
            self.observation3(c)
        deleted = self.observation3(c, True)
        self.assertEqual(deleted['category'], trashed['category'])
        self.assertEqual(deleted['batch'], trashed['batch'])
        bad = self.aggregate_args(c, 'category-restore-batch', observed=active)
        self.aggregate_no_effect(bad, '22023|PT409')
        bad = self.aggregate_args(c, 'category-restore-batch')
        bad[6]['batch'] = None
        self.aggregate_no_effect(bad, '22023|PT409')
        for key, value in [('actor_user_id', self.editor),
                           ('operation_id', str(uuid.uuid4())),
                           ('item_count', deleted['batch']['item_count'] + 1)]:
            bad = self.aggregate_args(c, 'category-restore-batch')
            bad[6]['batch'][key] = value
            self.aggregate_no_effect(bad, '22023|PT409|42501')
        with self.assertRaisesRegex(RuntimeError, '42501'):
            self.observation3(str(uuid.uuid4()), True)

    def test_g29_batch_list_shape_scope_counts_and_hidden_private_batches(self):
        self.policy('trip.packing.manage', 'trip_travelers')
        common, _ = self.seed_category('Common', 2)
        own, _ = self.seed_category('Own', 1, 'personal')
        foreign, _ = self.seed_category('Foreign', 1, 'personal', self.editor)
        for c, user in [(common, None), (own, None), (foreign, self.editor)]:
            self.trash_batch(c, user)
        before = self.aggregate_graph()
        page = self.batches3()
        self.assertEqual(set(page), {
            'version', 'kind', 'scope', 'collection_revision', 'categories', 'next_cursor',
        })
        self.assertEqual((page['version'], page['kind']), (3, 'packing-category-trash'))
        entries = {entry['category']['id']: entry for entry in page['categories']}
        self.assertEqual(set(entries), {common['id'], own['id']})
        for key, expected in [(common['id'], 2), (own['id'], 1)]:
            self.assertEqual(set(entries[key]), {'category', 'batch', 'item_count'})
            self.assertEqual(entries[key]['item_count'], expected)
            self.assertEqual(entries[key]['batch']['item_count'], expected)
        self.assertNotIn(foreign['id'], json.dumps(page))
        self.assertEqual(self.aggregate_graph(), before)

    def test_g30_batch_paging_has_no_duplicates_and_rejects_unpaired_cursors(self):
        for index in range(3):
            c, _ = self.seed_category('Page ' + str(index), 1)
            self.trash_batch(c)
        all_ids = [e['category']['id'] for e in self.batches3()['categories']]
        seen, cursor = [], None
        for _ in range(3):
            page = self.batches3(1, cursor)
            seen.extend(e['category']['id'] for e in page['categories'])
            cursor = page['next_cursor']
        self.assertEqual(seen, all_ids)
        self.assertEqual(len(set(seen)), 3)
        self.assertIsNone(cursor)
        for args in ([self.trip, 0, None, None], [self.trip, 101, None, None],
                     [self.trip, 1, '2026-01-01T00:00:00Z', None],
                     [self.trip, 1, None, str(uuid.uuid4())],
                     [self.trip, 1, 'infinity', str(uuid.uuid4())]):
            with self.assertRaisesRegex(RuntimeError, '22023'):
                self.rpc('list_family_trip_packing_category_batches_v3', args)

    def test_g31_receipts_are_typed_original_actor_only_known_and_unknown(self):
        self.policy('trip.packing.manage', 'trip_travelers')
        c, _ = self.seed_category()
        args, result = self.trash_batch(c)
        before = self.aggregate_graph()
        receipt = self.aggregate_receipt3(args[1])
        self.assertEqual(set(receipt), {
            'version', 'kind', 'trip_id', 'operation_id', 'scope',
            'status', 'result_redacted', 'result',
        })
        self.assertEqual((receipt['version'], receipt['kind'], receipt['status']),
                         (3, 'packing-category-aggregate', 'committed'))
        self.assertFalse(receipt['result_redacted'])
        self.assertEqual(receipt['result'], result)
        for operation, user in [(str(uuid.uuid4()), None), (args[1], self.editor)]:
            unknown = self.aggregate_receipt3(operation, user)
            self.assertEqual(unknown['status'], 'unknown')
            self.assertIsNone(unknown['result'])
            self.assertFalse(unknown['result_redacted'])
        self.assertEqual(self.aggregate_graph(), before)

    def test_g32_known_redacted_commit_is_not_unknown_or_a_replay_authority(self):
        c, _ = self.seed_category()
        args, _ = self.trash_batch(c)
        before = self.aggregate_graph()
        claims = json.dumps({'sub': self.owner, 'role': 'authenticated', 'aal': 'aal2'})
        raw = self.sql(
            "begin;create or replace function family_auth.packing_result_visible(p_result jsonb)"
            "returns boolean language sql stable security definer set search_path=''as 'select false';"
            "do $auth$begin perform set_config('request.jwt.claims'," + lit(claims)
            + ",true);end $auth$;set local role authenticated;"
            "select public.get_family_trip_packing_category_aggregate_receipt_v3("
            + lit(self.trip) + ',' + lit(args[1]) + ');rollback;')
        receipt = json.loads(raw)
        self.assertEqual(receipt['status'], 'committed')
        self.assertTrue(receipt['result_redacted'])
        self.assertIsNone(receipt['result'])
        self.assertNotIn(c['name'], json.dumps(receipt))
        self.assertEqual(self.aggregate_graph(), before)

    def test_g33_identical_trash_and_restore_retries_return_history_after_later_edits(self):
        c, items = self.seed_category()
        trash_args, trashed = self.trash_batch(c)
        restore_args, restored = self.restore_batch(c)
        self.execute('update', {'name': 'Later edit'}, target=items[0]['id'])
        before = self.aggregate_graph()
        self.assertEqual(self.aggregate3(trash_args), trashed)
        self.assertEqual(self.aggregate3(restore_args), restored)
        self.assertEqual(self.aggregate_receipt3(trash_args[1])['result'], trashed)
        self.assertEqual(self.aggregate_receipt3(restore_args[1])['result'], restored)
        self.assertEqual(self.aggregate_graph(), before)

    def test_g34_changed_intent_and_cross_domain_operation_reuse_refuse(self):
        c, items = self.seed_category()
        args, _ = self.trash_batch(c)
        for index, value in [(5, args[5] + 1), (4, str(uuid.uuid4())),
                             (6, {**args[6], 'category': {**args[6]['category'], 'name': 'Changed'}})]:
            bad = copy.deepcopy(args)
            bad[index] = value
            self.aggregate_no_effect(bad, '22023|PT409')
        self.restore_batch(c)
        old_calls = [
            lambda: self.rpc('execute_family_trip_packing_v1',
                             self.args('update', {'name': 'Wrong'}, target=items[0]['id'],
                                       operation=args[1])),
            lambda: self.group(self.group_args(operation=args[1], categories=[c['name']])),
            lambda: self.cat(self.cat_args(category=c['id'], operation=args[1])),
        ]
        life = self.lifecycle_args('category-retain', target=c['id'])
        life[1] = args[1]
        bound = self.bound_args(c)
        bound[1] = args[1]
        old_calls.extend([lambda: self.life(life), lambda: self.bound(bound)])
        for call in old_calls:
            before = self.aggregate_graph()
            with self.assertRaisesRegex(RuntimeError, 'PT409'):
                call()
            self.assertEqual(self.aggregate_graph(), before)

    def test_g35_every_receipt_domain_refuses_other_domain_operations(self):
        c, items = self.seed_category()
        args, _ = self.trash_batch(c)
        old_receipts = [
            'get_family_trip_packing_receipt_v1',
            'get_family_trip_packing_group_receipt_v1',
            'get_family_trip_packing_category_receipt_v1',
            'get_family_trip_packing_category_lifecycle_receipt_v2',
            'get_family_trip_packing_category_item_receipt_v2',
        ]
        for name in old_receipts:
            with self.assertRaisesRegex(RuntimeError, '22023'):
                self.rpc(name, [self.trip, args[1]])
        self.restore_batch(c)
        operations = []
        old = self.args('update', {'name': 'Old item'}, target=items[0]['id'])
        self.rpc('execute_family_trip_packing_v1', old)
        operations.append(old[1])
        old = self.group_args(categories=[c['name']])
        self.group(old)
        operations.append(old[1])
        old = self.meta_for(c, values={'name': c['name']})
        self.cat(old)
        operations.append(old[1])
        other = self.lifecycle_args(values={'name': 'Other empty', 'visibility': 'common'})
        self.life(other)
        operations.append(other[1])
        old = self.bound_args(self.category2(c['id']))
        self.bound(old)
        operations.append(old[1])
        for operation in operations:
            with self.assertRaisesRegex(RuntimeError, '22023'):
                self.aggregate_receipt3(operation)
            bad = self.aggregate_args(c)
            bad[1] = operation
            self.aggregate_no_effect(bad, 'PT409')

    def test_g36_late_trash_receipt_failure_rolls_back_all_rows_audits_and_manifest(self):
        c, _ = self.seed_category()
        self.assign(c['id'], provenance=True)
        args = self.aggregate_args(c)
        claims = json.dumps({'sub': self.owner, 'role': 'authenticated', 'aal': 'aal2'})
        statement = (
            "begin;alter table family_auth.packing_command_receipts add constraint c3c_late_trash "
            "check(action<>'category-trash-batch')not valid;"
            "do $auth$begin perform set_config('request.jwt.claims'," + lit(claims)
            + ",true);end $auth$;set local role authenticated;"
            + self.aggregate_statement(args) + ';commit;')
        self.sql_no_effect(statement, '23514')

    def test_g37_late_restore_receipt_failure_keeps_pending_header_and_all_members(self):
        c, _ = self.seed_category()
        self.trash_batch(c)
        args = self.aggregate_args(c, 'category-restore-batch')
        claims = json.dumps({'sub': self.owner, 'role': 'authenticated', 'aal': 'aal2'})
        statement = (
            "begin;alter table family_auth.packing_command_receipts add constraint c3c_late_restore "
            "check(action<>'category-restore-batch')not valid;"
            "do $auth$begin perform set_config('request.jwt.claims'," + lit(claims)
            + ",true);end $auth$;set local role authenticated;"
            + self.aggregate_statement(args) + ';commit;')
        self.sql_no_effect(statement, '23514')

    def test_g38_pending_batch_blocks_old_v2_empty_restore_at_commit(self):
        c, _ = self.seed_category()
        self.trash_batch(c)
        args = self.lifecycle_args('category-restore-empty', target=c['id'])
        before = self.aggregate_graph()
        with self.assertRaisesRegex(RuntimeError, 'PT409|23514'):
            self.life(args)
        self.assertEqual(self.aggregate_graph(), before)
        self.assertEqual(self.life_receipt(args[1])['status'], 'unknown')

    def test_g39_old_parent_and_individual_restore_in_one_transaction_cannot_bypass_batch(self):
        c, items = self.seed_category()
        self.trash_batch(c)
        parent = self.lifecycle_args('category-restore-empty', target=c['id'])
        item = self.args('restore', target=items[0]['id'])
        claims = json.dumps({'sub': self.owner, 'role': 'authenticated', 'aal': 'aal2'})
        statement = (
            "begin;set constraints all deferred;"
            "do $auth$begin perform set_config('request.jwt.claims'," + lit(claims)
            + ",true);end $auth$;set local role authenticated;"
            + self.life_statement(parent) + ';' + self.command_statement(item)
            + ';set constraints all immediate;commit;')
        self.sql_no_effect(statement)
        self.sql_no_effect(
            'begin;update public.packing_items set deleted_at=null,deleted_by_person_id=null where id='
            + lit(items[0]['id']) + ';commit;')

    def test_g40_pending_category_rank_mutation_is_rejected_by_deferred_validation(self):
        c, _ = self.seed_category()
        self.trash_batch(c)
        self.assert_deferred_refusal(
            'update public.packing_categories set sort_order=sort_order+1 where id=' + lit(c['id']))

    def test_g41_pending_item_revision_only_mutation_is_rejected_at_deferred_boundary(self):
        c, items = self.seed_category()
        self.trash_batch(c)
        self.assert_deferred_refusal(
            'update public.packing_items set updated_at=clock_timestamp()where id=' + lit(items[0]['id']))

    def test_g42_pending_assignment_and_relationship_changes_have_no_partial_effects(self):
        c, items = self.seed_category()
        self.assign(c['id'], provenance=True)
        for table in ('packing_item_recipients', 'packing_item_contributors'):
            self.sql('insert into public.' + table + '(trip_id,item_id,person_id)values('
                     + ','.join(map(lit, [self.trip, items[0]['id'], self.viewer_person])) + ')')
        self.trash_batch(c)

        # Assignment deletion reaches the new deferred guard. An immediate
        # failure here must not be counted as aggregate deferred coverage.
        self.assert_deferred_refusal(
            'delete from public.packing_category_assignments where category_id=' + lit(c['id']))

        # The compatibility name bridge refuses assignment insertion earlier.
        self.assert_immediate_refusal(
            'insert into public.packing_category_assignments(trip_id,category_id,person_id)values('
            + ','.join(map(lit, [self.trip, c['id'], self.editor_person])) + ')',
            'PT409', 'Restore the original category')

        # Retained Trash relationships already have an inherited BEFORE guard;
        # prove its message while every deferred constraint remains deferred.
        for table in ('packing_item_recipients', 'packing_item_contributors'):
            for mutation in (
                'delete from public.' + table + ' where item_id=' + lit(items[0]['id']),
                'insert into public.' + table + '(trip_id,item_id,person_id)values('
                + ','.join(map(lit, [self.trip, items[0]['id'], self.editor_person])) + ')',
            ):
                with self.subTest(table=table, mutation=mutation.split(' ')[0]):
                    self.assert_immediate_refusal(
                        mutation, 'PT409', 'Packing Trash relationships are retained')

    def test_g43_batch_identity_and_member_history_are_immutable(self):
        c, _ = self.seed_category()
        _, trashed = self.trash_batch(c)
        where = self.batch_where(trashed['batch'])
        for statement in (
            'delete from family_auth.packing_category_batch_items where ' + where,
            'update family_auth.packing_category_batch_items set deleted_revision=deleted_revision+1 where ' + where,
            'update family_auth.packing_category_batches set deleted_at=deleted_at-interval \'1 second\'where ' + where,
            'delete from family_auth.packing_category_batches where ' + where,
        ):
            self.sql_no_effect('begin;' + statement + ';commit;', 'PT409|23514|23503|0A000')

    def test_g44_resolving_header_with_another_batches_valid_restore_receipt_refuses(self):
        a, _ = self.seed_category('Pending A')
        _, trashed_a = self.trash_batch(a)
        b, _ = self.seed_category('Resolved B')
        self.trash_batch(b)
        restored_b_args, _ = self.restore_batch(b)
        statement = (
            'begin;update family_auth.packing_category_batches set restored_at=clock_timestamp(),'
            'restored_by_user_id=' + lit(self.owner) + ',restored_operation_id='
            + lit(restored_b_args[1]) + 'where ' + self.batch_where(trashed_a['batch'])
            + ';set constraints all immediate;commit;')
        self.sql_no_effect(statement)

    def test_g45_batch_member_trip_and_item_foreign_keys_are_enforced(self):
        c, _ = self.seed_category()
        _, trashed = self.trash_batch(c)
        foreign_trip = self.new_trip('Foreign member Trip')
        foreign_item = self.sql(
            'insert into public.packing_items(trip_id,name)values('
            + lit(foreign_trip) + ",'Foreign item')returning id")
        batch = trashed['batch']
        for item in (foreign_item, str(uuid.uuid4())):
            statement = (
                'begin;insert into family_auth.packing_category_batch_items('
                'trip_id,actor_user_id,operation_id,item_id,deleted_revision)values('
                + ','.join(map(lit, [self.trip, batch['actor_user_id'], batch['operation_id'], item]))
                + ',1);set constraints all immediate;commit;')
            self.sql_no_effect(statement, '23503|23514|PT409')

    def test_g46_resolved_history_does_not_freeze_later_edits_or_second_batch(self):
        c, items = self.seed_category()
        _, first = self.trash_batch(c)
        self.restore_batch(c)
        header = self.header3(first['batch'])
        members = self.members3(first['batch'])
        self.execute('update', {'name': 'Later'}, target=items[0]['id'])
        self.cat(self.meta_for(c, values={'name': 'Later category'}))
        self.assign(c['id'], self.editor_person, provenance=True)
        self.sql('insert into public.packing_item_recipients(trip_id,item_id,person_id)values('
                 + ','.join(map(lit, [self.trip, items[0]['id'], self.editor_person])) + ')')
        _, second = self.trash_batch(c)
        self.assertNotEqual(first['batch']['operation_id'], second['batch']['operation_id'])
        self.assertEqual(self.header3(first['batch']), header)
        self.assertEqual(self.members3(first['batch']), members)
        self.assertIsNone(self.header3(second['batch'])['restored_at'])
        self.assertEqual(len(self.aggregate_graph()['packing_category_batches']), 2)

    def test_g47_new_wrappers_are_invokers_and_private_tables_have_no_raw_grants(self):
        signatures = [
            'public.get_family_trip_packing_category_lane_v3(uuid,text)',
            'public.get_family_trip_packing_category_aggregate_v3(uuid,uuid,boolean)',
            'public.execute_family_trip_packing_category_aggregate_v3(uuid,uuid,jsonb,text,uuid,bigint,jsonb,jsonb)',
            'public.get_family_trip_packing_category_aggregate_receipt_v3(uuid,uuid)',
            'public.list_family_trip_packing_category_batches_v3(uuid,integer,timestamp with time zone,uuid)',
        ]
        for signature in signatures:
            self.assertEqual(self.sql('select prosecdef from pg_proc where oid='
                                      + lit(signature) + '::regprocedure'), 'f')
            self.assertEqual(self.sql('select has_function_privilege(\'authenticated\','
                                      + lit(signature) + ",'EXECUTE')"), 't')
            for role in ('anon', 'service_role'):
                self.assertEqual(self.sql('select has_function_privilege(' + lit(role) + ','
                                          + lit(signature) + ",'EXECUTE')"), 'f')
        for table in ('packing_category_batches', 'packing_category_batch_items'):
            relation = 'family_auth.' + table
            self.assertEqual(self.sql('select relrowsecurity from pg_class where oid='
                                      + lit(relation) + '::regclass'), 't')
            for role in ('anon', 'authenticated', 'service_role'):
                self.assertEqual(self.sql('select has_table_privilege(' + lit(role) + ','
                                          + lit(relation) + ",'SELECT,INSERT,UPDATE,DELETE')"), 'f')

    def test_g48_real_http_aal1_and_service_roles_cannot_use_new_domain(self):
        c, _ = self.seed_category()
        args = self.aggregate_args(c)
        code, body = self.http('POST', '/auth/v1/token?grant_type=password', {
            'email': 'p01-' + self.owner + '@fixture.invalid', 'password': 'local-only',
        })
        self.assertEqual(code, 200)
        token = json.loads(body)['access_token']
        before = self.aggregate_graph()
        requests = [
            (self.AGGREGATE_RPC, dict(zip(self.ARG_NAMES, args))),
            ('get_family_trip_packing_category_lane_v3',
             {'p_trip_id': self.trip, 'p_visibility': 'common'}),
            ('get_family_trip_packing_category_aggregate_v3',
             {'p_trip_id': self.trip, 'p_category_id': c['id'], 'p_include_deleted': False}),
            ('get_family_trip_packing_category_aggregate_receipt_v3',
             {'p_trip_id': self.trip, 'p_operation_id': args[1]}),
            ('list_family_trip_packing_category_batches_v3', {'p_trip_id': self.trip}),
        ]
        for endpoint, payload in requests:
            code, _ = self.http('POST', '/rest/v1/rpc/' + endpoint, payload, token=token)
            self.assertEqual(code, 403, endpoint)
        for token in (self.anon, self.service):
            code, _ = self.aggregate_http(args, token)
            self.assertIn(code, (401, 403))
        self.assertEqual(self.aggregate_graph(), before)

    def test_g49_real_aal2_http_read_trash_receipt_and_restore(self):
        c, _ = self.seed_category()
        for endpoint, body in [
            ('get_family_trip_packing_category_lane_v3',
             {'p_trip_id': self.trip, 'p_visibility': 'common'}),
            ('get_family_trip_packing_category_aggregate_v3',
             {'p_trip_id': self.trip, 'p_category_id': c['id']}),
        ]:
            code, response = self.http('POST', '/rest/v1/rpc/' + endpoint, body)
            self.assertEqual(code, 200)
            self.assertEqual(json.loads(response)['version'], 3)
        args = self.aggregate_args(c)
        code, result = self.aggregate_http(args)
        self.assertEqual(code, 200, result)
        self.assert_result3(result, args)
        code, response = self.http(
            'POST', '/rest/v1/rpc/get_family_trip_packing_category_aggregate_receipt_v3',
            {'p_trip_id': self.trip, 'p_operation_id': args[1]})
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(response)['result'], result)
        code, response = self.http(
            'POST', '/rest/v1/rpc/list_family_trip_packing_category_batches_v3',
            {'p_trip_id': self.trip})
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(response)['categories'][0]['category']['id'], c['id'])
        code, result = self.aggregate_http(self.aggregate_args(c, 'category-restore-batch'))
        self.assertEqual(code, 200, result)
        self.assertIsNone(result['category']['deleted_at'])

    def test_g50_real_logout_refuses_new_reads_writes_and_receipts_with_old_jwt(self):
        fixture = type('AggregateLogoutFixture', (CategoryAggregate,), {})
        fixture.setUpClass()
        c = fixture()
        c.setUp()
        category, _ = c.seed_category()
        args = c.aggregate_args(category)
        before = c.aggregate_graph()
        token = c.token
        code, _ = c.http('POST', '/auth/v1/logout?scope=local', {}, token=token)
        self.assertEqual(code, 204)
        for endpoint, payload in [
            (c.AGGREGATE_RPC, dict(zip(c.ARG_NAMES, args))),
            ('get_family_trip_packing_category_lane_v3',
             {'p_trip_id': c.trip, 'p_visibility': 'common'}),
            ('get_family_trip_packing_category_aggregate_v3',
             {'p_trip_id': c.trip, 'p_category_id': category['id']}),
            ('get_family_trip_packing_category_aggregate_receipt_v3',
             {'p_trip_id': c.trip, 'p_operation_id': args[1]}),
            ('list_family_trip_packing_category_batches_v3', {'p_trip_id': c.trip}),
        ]:
            code, _ = c.http('POST', '/rest/v1/rpc/' + endpoint, payload, token=token)
            self.assertEqual(code, 403, endpoint)
        self.assertEqual(c.aggregate_graph(), before)

    def test_g51_real_session_expiry_during_http_mutex_wait_rolls_back(self):
        fixture = type('AggregateExpiryFixture', (CategoryAggregate,), {})
        fixture.setUpClass()
        c = fixture()
        c.setUp()
        category, _ = c.seed_category()
        args = c.aggregate_args(category)
        before = c.aggregate_graph()
        session = json.loads(base64.urlsafe_b64decode(c.token.split('.')[1] + '=='))['session_id']
        c.sql('update auth.sessions set not_after=clock_timestamp()+interval \'1 minute\'where id='
              + lit(session))
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            with c.held_authenticated_command(
                "select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"
                    + lit(c.trip) + '::text,0))') as pid:
                future = pool.submit(c.aggregate_http, args)
                deadline = time.monotonic() + 10
                waiting = False
                while time.monotonic() < deadline:
                    waiting = c.sql(
                        "select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid()"
                        "and position('execute_family_trip_packing_category_aggregate_v3'in query)>0 and "
                        + str(pid) + '=any(pg_blocking_pids(pid)))') == 't'
                    if waiting:
                        break
                    time.sleep(.05)
                self.assertTrue(waiting, 'HTTP aggregate never demonstrably waited on its mutex')
                c.sql('update auth.sessions set not_after=clock_timestamp()+interval '
                      "'200 milliseconds'where id=" + lit(session))
                time.sleep(.3)
            code, _ = future.result(timeout=15)
            self.assertEqual(code, 403)
        self.assertEqual(c.aggregate_graph(), before)

    def test_g52_concurrent_identical_trash_has_one_receipt_header_and_manifest(self):
        c, items = self.seed_category()
        args = self.aggregate_args(c)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.aggregate3(args), range(2)))
        self.assertEqual(results[0], results[1])
        graph = self.aggregate_graph()
        self.assertEqual(len(graph['packing_category_batches']), 1)
        self.assertEqual(len(graph['packing_category_batch_items']), len(items))
        self.assertEqual(self.sql('select count(*)from family_auth.packing_command_receipts where trip_id='
                                 + lit(self.trip) + 'and operation_id=' + lit(args[1])), '1')

    def test_g53_concurrent_distinct_trash_operations_have_one_original_winner(self):
        c, _ = self.seed_category()
        original = self.observation3(c)
        args = [self.aggregate_args(c, observed=original) for _ in range(2)]
        def submit(a):
            try:
                return self.aggregate3(a)
            except RuntimeError as error:
                return str(error)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(submit, args))
        self.assertEqual(sum(isinstance(r, dict) for r in results), 1)
        self.assertRegex(next(r for r in results if isinstance(r, str)), 'PT409')
        self.assertEqual(len(self.aggregate_graph()['packing_category_batches']), 1)

    def test_g54_concurrent_two_actor_common_restore_has_only_one_resolution(self):
        self.policy('trip.packing.manage', 'trip_travelers')
        c, _ = self.seed_category()
        _, trashed = self.trash_batch(c)
        commands = [
            (self.aggregate_args(c, 'category-restore-batch'), self.owner),
            (self.aggregate_args(c, 'category-restore-batch', user=self.editor), self.editor),
        ]
        def submit(pair):
            try:
                return self.aggregate3(pair[0], pair[1])
            except RuntimeError as error:
                return str(error)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(submit, commands))
        winners = [r for r in results if isinstance(r, dict)]
        self.assertEqual(len(winners), 1)
        self.assertRegex(next(r for r in results if isinstance(r, str)), 'PT409')
        header = self.header3(trashed['batch'])
        self.assertEqual(header['restored_operation_id'], winners[0]['operation_id'])
        self.assertEqual(header['restored_by_user_id'], winners[0]['scope']['user_id'])

    def test_g55_item_create_before_waiting_trash_invalidates_complete_original(self):
        c, _ = self.seed_category()
        args = self.aggregate_args(c)
        create = self.bound_args(c)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            with self.held_authenticated_command(self.bound_statement(create)) as pid:
                future = pool.submit(self.aggregate3, args)
                self.wait_for_lock(args[1], pid)
            with self.assertRaisesRegex(RuntimeError, 'PT409'):
                future.result(timeout=15)
        self.assertIsNone(self.category2(c['id'])['deleted_at'])
        self.assertEqual(len(self.state()['items']), 3)
        self.assertEqual(self.aggregate_graph()['packing_category_batches'], [])

    def test_g56_trash_before_waiting_bound_create_never_inserts_into_deleted_parent(self):
        c, _ = self.seed_category()
        args = self.aggregate_args(c)
        create = self.bound_args(c)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            with self.held_authenticated_command(self.aggregate_statement(args)) as pid:
                future = pool.submit(self.bound, create)
                self.wait_for_lock(create[1], pid)
            with self.assertRaisesRegex(RuntimeError, 'PT409'):
                future.result(timeout=15)
        self.assertEqual(self.state()['items'], [])
        self.assertEqual(self.sql('select count(*)from public.packing_items where id=' + lit(create[4])), '0')

    def test_g57_permission_and_membership_revoked_during_wait_are_rechecked(self):
        self.policy('trip.packing.manage', 'trip_travelers')
        c, _ = self.seed_category()
        args = self.aggregate_args(c, user=self.editor)
        for mode in ('permission', 'membership'):
            self.policy('trip.packing.manage', 'trip_travelers')
            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    with self.held_authenticated_command(
                        "select pg_advisory_xact_lock(hashtextextended('trip-recovery:'||"
                            + lit(self.trip) + '::text,0))') as pid:
                        future = pool.submit(self.aggregate3, args, self.editor)
                        self.wait_for_lock(args[1], pid)
                        if mode == 'permission':
                            self.policy('trip.packing.manage')
                        else:
                            self.sql("update public.family_members set status='suspended'where family_id="
                                     + lit(self.family) + 'and user_id=' + lit(self.editor))
                    with self.assertRaisesRegex(RuntimeError, '42501'):
                        future.result(timeout=15)
            finally:
                self.sql("update public.family_members set status='active'where family_id="
                         + lit(self.family) + 'and user_id=' + lit(self.editor))
            self.assertIsNone(self.category2(c['id'])['deleted_at'])
            self.assertEqual(self.aggregate_graph()['packing_category_batches'], [])

    def test_g58_item_and_collection_counter_overflow_roll_back_entire_aggregate(self):
        c, items = self.seed_category()
        original_revision = self.row(items[0]['id'])['revision']
        self.sql(
            'begin;alter table public.packing_items disable trigger ab_packing_v1_version;'
            'update public.packing_items set revision=9007199254740991 where id='
            + lit(items[0]['id'])
            + ';set constraints all immediate;alter table public.packing_items enable trigger ab_packing_v1_version;commit;')
        self.aggregate_no_effect(self.aggregate_args(c), '54000')
        self.sql(
            'begin;alter table public.packing_items disable trigger ab_packing_v1_version;'
            'update public.packing_items set revision=' + str(original_revision)
            + ' where id=' + lit(items[0]['id'])
            + ';set constraints all immediate;alter table public.packing_items enable trigger ab_packing_v1_version;commit;')
        self.sql(
            'begin;alter table public.packing_categories disable trigger a1_packing_category_identity;'
            'update public.packing_categories set revision=9007199254740991 where id=' + lit(c['id'])
            + ';set constraints all immediate;alter table public.packing_categories enable trigger a1_packing_category_identity;commit;')
        self.aggregate_no_effect(self.aggregate_args(c), '54000')
        self.sql(
            'begin;alter table public.packing_categories disable trigger a1_packing_category_identity;'
            'update public.packing_categories set revision=' + str(c['revision']) + ' where id=' + lit(c['id'])
            + ';set constraints all immediate;alter table public.packing_categories enable trigger a1_packing_category_identity;commit;')
        self.sql('update family_auth.trip_packing_state set collection_revision=9007199254740991 where trip_id='
                 + lit(self.trip))
        self.aggregate_no_effect(self.aggregate_args(c), '54000')

    def test_g59_restore_capacity_counts_hidden_items_and_failure_keeps_batch_pending(self):
        c, _ = self.seed_category(count=1)
        _, trashed = self.trash_batch(c)
        self.sql(
            'insert into public.packing_items(trip_id,name,category,is_private,owner_person_id)'
            'select ' + lit(self.trip) + ",'Hidden '||n,'Hidden private',true,"
            + lit(self.editor_person) + 'from generate_series(1,2000)n')
        self.assertEqual(self.state()['items'], [])
        self.aggregate_no_effect(self.aggregate_args(c, 'category-restore-batch'), '54000')
        self.assertIsNone(self.header3(trashed['batch'])['restored_at'])

    def test_g60_reserved_names_and_former_people_preserve_history_through_batch_restore(self):
        c, _ = self.seed_category('Reserved raw é')
        self.assign(c['id'], provenance=True)
        assignment = self.category2(c['id'])['assignments']
        _, trashed = self.trash_batch(c)
        self.life_no_effect(self.lifecycle_args(values={
            'name': c['name'], 'visibility': 'common',
        }), 'PT409')
        self.sql('update public.people set archived_at=now()where id=' + lit(self.viewer_person))
        try:
            _, result = self.restore_batch(c)
            self.assertEqual(result['category']['id'], c['id'])
            self.assertEqual(result['category']['assignments'], assignment)
            self.assertEqual(result['batch'], trashed['batch'])
            historical = next(p for p in self.packet2()['people'] if p['id'] == self.viewer_person)
            self.assertFalse(historical['eligible'])
        finally:
            self.sql('update public.people set archived_at=null where id=' + lit(self.viewer_person))

    def test_g61_restore_final_collection_overflow_is_atomic_after_member_updates(self):
        category, _ = self.seed_category(count=2)
        _, trashed = self.trash_batch(category)
        # Category restoration alone remains safe; the second item would cross
        # MAX_SAFE_INTEGER, after the category trigger's earlier bound check.
        self.sql('update family_auth.trip_packing_state set collection_revision=9007199254740989'
                 ' where trip_id=' + lit(self.trip))
        self.aggregate_no_effect(
            self.aggregate_args(category, 'category-restore-batch'), '54000')
        self.assertIsNone(self.header3(trashed['batch'])['restored_at'])

    def test_g62_receipt_recovery_requires_the_original_person_context(self):
        category, _ = self.seed_category()
        args, result = self.trash_batch(category)
        self.assertEqual(self.aggregate_receipt3(args[1])['result'], result)
        replacement = str(uuid.uuid4())
        claims = json.dumps({'sub': self.owner, 'role': 'authenticated', 'aal': 'aal2'})
        statement = (
            "begin;select set_config('family_auth.allow_identity_link','1',true);"
            'update public.people set archived_at=clock_timestamp() where id=' + lit(self.person)
            + ';insert into public.people(id,family_id,user_id,display_name)values('
            + ','.join(map(lit, [replacement, self.family, self.owner, 'New synthetic Person']))
            + ");do $auth$begin perform set_config('request.jwt.claims'," + lit(claims)
            + ",true);end $auth$;set local role authenticated;"
            'do $context$begin if(public.get_family_trip_packing_category_lane_v3('
            + lit(self.trip) + ",'common')->'scope'->>'person_id')is distinct from "
            + lit(replacement)
            + " then raise exception 'C3c replacement Person was not selected'"
            "using errcode='P0001';end if;end $context$;"
            'select public.get_family_trip_packing_category_aggregate_receipt_v3('
            + lit(self.trip) + ',' + lit(args[1]) + ');rollback;'
        )
        # A successful call also rolls back the identity fixture before the
        # failed expectation is reported; no alternate Person is left behind.
        self.sql_no_effect(statement, 'PT409')
        self.assertEqual(self.aggregate_receipt3(args[1])['result'], result)

    def test_g63_completed_history_requires_present_nonnull_deleted_member_facts(self):
        category, _ = self.seed_category(count=1)
        _, trashed = self.trash_batch(category)
        _, restored = self.restore_batch(category)
        for field in ('deleted_at', 'deleted_by_person_id'):
            for missing in (True, False):
                with self.subTest(field=field, missing=missing):
                    self.assert_deferred_refusal(
                        self.malformed_completed_history_statement3(
                            trashed, restored, field, missing))

    def test_g64_forged_resolution_requires_actual_rows_and_later_edits_remain_allowed(self):
        category, items = self.seed_category()
        _, trashed = self.trash_batch(category)
        self.assert_deferred_refusal(self.forged_restore_statement3(trashed))
        self.assertIsNone(self.header3(trashed['batch'])['restored_at'])
        self.assertTrue(all(self.row(item['id'])['deleted_at'] is not None for item in items))

        # The invariant applies to the resolution transition, not all future
        # writes to rows once retained as resolved historical members.
        _, restored = self.restore_batch(category)
        header = self.header3(trashed['batch'])
        self.execute('update', {'name': 'Edited after resolved transition'}, target=items[0]['id'])
        self.cat(self.meta_for(category, values={'name': 'Renamed after recovery'}))
        self.assertEqual(self.row(items[0]['id'])['name'], 'Edited after resolved transition')
        self.assertEqual(self.category2(category['id'])['name'], 'Renamed after recovery')
        self.assertEqual(self.header3(trashed['batch']), header)
        self.assertEqual(self.aggregate_receipt3(restored['operation_id'])['result'], restored)
