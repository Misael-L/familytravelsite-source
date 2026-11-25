import type { FamilyIdentityRegistry } from './identity';
import type { FamilyPackingBag, FamilyPackingItem } from './legacy/data/supabase/packing';
import type { FamilyTodoItem } from './legacy/data/supabase/todos';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { scopeFamilyOperations } from './requestContext';
import type { FamilyRequest } from './transport';
export const NOT_HANDLED = Symbol('not handled');
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const text = (x: unknown, f = '') => (typeof x === 'string' ? x : f);
const num = (x: unknown, f = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : f);
const list = (x: unknown) => (Array.isArray(x) ? x : []);
function familyTodoView(r: FamilyTodoItem, ids: FamilyIdentityRegistry, tripId: string) {
  return {
    id: ids.register('todo', r.id),
    trip_id: ids.register('trip', tripId),
    name: r.name,
    category: r.category,
    checked: r.checked ? 1 : 0,
    sort_order: r.sortOrder,
    due_date: r.dueDate,
    description: r.description,
    assigned_user_id: r.assignedPersonId ? ids.register('person', r.assignedPersonId) : null,
    priority: r.priority,
    // The Family task reader has no creation/reminder timestamp contract.
    created_at: null,
    reminded_at: null,
  };
}
function packingDraftWeightGrams(b: Record<string, unknown>, old: FamilyPackingItem | undefined) {
  return b.weight_grams === undefined ? old?.weightGrams : b.weight_grams === null ? null : num(b.weight_grams);
}

function packingDraftBagId(
  b: Record<string, unknown>,
  old: FamilyPackingItem | undefined,
  uuid: (kind: 'packingBag', value: unknown) => string
) {
  return b.bag_id === undefined ? old?.bagId : b.bag_id === null ? null : uuid('packingBag', b.bag_id);
}

/** The copied Lists UI speaks view IDs; existing adapters retain UUIDs, privacy and RLS. */
export async function handleFamilyList(
  repo: FamilyFrontendRepository,
  request: FamilyRequest,
  tripId: string,
  suffix: string
) {
  if (!/^(packing|todo)(\/|$)/.test(suffix)) return NOT_HANDLED;
  const packing = suffix.startsWith('packing');
  const root = packing ? 'packing' : 'todo';
  const path = suffix.slice(root.length).replace(/^\//, '').replace(/\/$/, '');
  const { method: m } = request;
  const b = obj(request.body);
  assertPackingFields(packing, request);
  const [v, s, roster] = await Promise.all([repo.views(), repo.session(), repo.readers.listTripTravelers(tripId)]);
  const viewContext = createListViewContext(repo, tripId, packing, v, roster);
  const { p, t, uuid, person, personView, packingView, bagView, todoView, rows, write } = viewContext;
  const route = new ListRoutes(packing, path, m);
  if (route.rootRead())
    return packing
      ? {
          items: (await p.listPackingItems(tripId)).map(packingView),
          bags: (await p.listPackingBags(tripId)).map(bagView),
        }
      : { items: (await t.listTodoItems(tripId)).map(todoView) };
  if (route.categoryRead()) {
    const values = await (packing ? p.listPackingCategoryAssignees(tripId) : t.listTodoCategoryAssignees(tripId));
    return categoryAssigneeResponse(packing, values, personView, v.ids);
  }
  if (route.categoryWrite()) {
    const category = decodeURIComponent(path.slice(19));
    const people = list(b.user_ids).map(person);
    await write(() =>
      packing
        ? p.setPackingCategoryAssignees(tripId, category, people)
        : t.setTodoCategoryAssignees(tripId, category, people)
    );
    return categoryAssigneeWriteResponse(packing, people, personView);
  }
  if (route.reorder()) {
    const current = await rows();
    const ids = list(b.orderedIds).map((x) => uuid(packing ? 'packing' : 'todo', x));
    assertListOrder(ids, current);
    await write(() => (packing ? p.reorderPackingItems(ids) : t.reorderTodoItems(ids)));
    return { success: true };
  }
  if (route.templates())
    return {
      templates: (await p.listPackingTemplates(s.familyId)).map((row) => packingTemplateView(row, v.ids)),
    };
  if (route.applyTemplate()) {
    const id = uuid('packingTemplate', path.slice(15));
    const templates = await p.listPackingTemplates(s.familyId);
    assertTemplateApplicable(id, templates, b);
    const count = await write(() => p.applyPackingTemplate(tripId, id));
    return { success: true, count };
  }
  if (route.saveTemplate()) {
    const id = await write(() => p.savePackingTemplateFromTrip(tripId, text(b.name)));
    return { template: { id: v.ids.register('packingTemplate', id), name: text(b.name) } };
  }
  return handleListItems({ path, m, packing, b, tripId, s }, viewContext, route);
}

function assertPackingFields(packing: boolean, request: FamilyRequest) {
  const body = obj(request.body);
  const records = [body, ...list(body.items).map(obj)];
  if (
    packing &&
    ['POST', 'PUT'].includes(request.method) &&
    records.some((row) => Object.prototype.hasOwnProperty.call(row, 'packed_quantity'))
  )
    throw new FamilyApiError(
      422,
      'packing_partial_count_unavailable',
      'Partial packed quantities are not connected to the Family database yet. Original values are unchanged.'
    );
}
type AssigneeView = (id: string) => { user_id: number; username: string };
function categoryAssigneeResponse(
  packing: boolean,
  values: Record<string, string[]>,
  view: AssigneeView,
  ids: FamilyIdentityRegistry
) {
  return {
    assignees: Object.fromEntries(
      Object.entries(values).map(([name, people]) => [
        name,
        people.map((id) => (packing ? view(id) : ids.register('person', id))),
      ])
    ),
  };
}
function categoryAssigneeWriteResponse(packing: boolean, people: string[], view: AssigneeView) {
  return packing ? { success: true, assignees: people.map(view) } : { success: true };
}

function createListViewContext(
  repo: FamilyFrontendRepository,
  tripId: string,
  packing: boolean,
  v: Awaited<ReturnType<FamilyFrontendRepository['views']>>,
  roster: Awaited<ReturnType<FamilyFrontendRepository['readers']['listTripTravelers']>>
) {
  const p = scopeFamilyOperations(repo, repo.readers.packing),
    t = scopeFamilyOperations(repo, repo.readers.todos);
  const uuid = (kind: import('./identity').IdentityKind, x: unknown) =>
    v.ids.uuid(kind, typeof x === 'number' ? x : text(x));
  const person = (x: unknown) => uuid('person', x);
  const personView = (id: string) => ({
    user_id: v.ids.register('person', id),
    username: roster.find((r) => r.personId === id)?.displayName ?? '',
  });
  const packingView = (r: FamilyPackingItem) => ({
    id: v.ids.register('packing', r.id),
    trip_id: v.ids.register('trip', tripId),
    name: r.name,
    category: r.category,
    checked: r.checked ? 1 : 0,
    quantity: r.quantity,
    weight_grams: r.weightGrams,
    sort_order: r.sortOrder,
    bag_id: r.bagId ? v.ids.register('packingBag', r.bagId) : null,
    is_private: r.isPrivate ? 1 : 0,
    owner_id: r.ownerPersonId ? v.ids.register('person', r.ownerPersonId) : null,
    owner_username: roster.find((p) => p.personId === r.ownerPersonId)?.displayName ?? null,
    recipients: r.recipientPersonIds.map(personView),
    contributors: r.contributorPersonIds.map((id) => ({ ...personView(id), status: 'active' })),
  });
  const bagView = (r: FamilyPackingBag) => ({
    id: v.ids.register('packingBag', r.id),
    trip_id: v.ids.register('trip', tripId),
    name: r.name,
    color: r.color,
    weight_limit_grams: r.weightLimitGrams,
    sort_order: r.sortOrder,
    members: r.memberPersonIds.map(personView),
  });
  const todoView = (r: FamilyTodoItem) => familyTodoView(r, v.ids, tripId);
  const rows = () => (packing ? p.listPackingItems(tripId) : t.listTodoItems(tripId));
  const write = <T>(fn: () => Promise<T>) =>
    repo.write(tripId, packing ? 'trip.packing.manage' : 'trip.todos.manage', fn);
  return { p, t, uuid, person, personView, packingView, bagView, todoView, rows, write };
}
type ListViewContext = ReturnType<typeof createListViewContext>;
function packingItemDraft(
  b: Record<string, unknown>,
  old: FamilyPackingItem | undefined,
  context: {
    id: string | null;
    s: Awaited<ReturnType<FamilyFrontendRepository['session']>>;
    current: Array<FamilyPackingItem | FamilyTodoItem>;
    uuid: ListViewContext['uuid'];
  }
) {
  return {
    id: context.id,
    name: text(b.name, old?.name),
    category: text(b.category, old?.category),
    checked: b.checked === undefined ? old?.checked : Boolean(b.checked),
    quantity: num(b.quantity, old?.quantity ?? 1),
    weightGrams: packingDraftWeightGrams(b, old),
    bagId: packingDraftBagId(b, old, context.uuid),
    isPrivate: old?.isPrivate ?? Boolean(b.is_private || b.visibility === 'personal' || b.visibility === 'shared'),
    ownerPersonId:
      old?.ownerPersonId ??
      (b.is_private || b.visibility === 'personal' || b.visibility === 'shared' ? context.s.personId : null),
    sortOrder: num(b.sort_order, old?.sortOrder ?? context.current.length),
  };
}
function todoItemDraft(
  b: Record<string, unknown>,
  old: FamilyTodoItem | undefined,
  id: string | null,
  person: ListViewContext['person'],
  current: Array<FamilyPackingItem | FamilyTodoItem>
) {
  return {
    id,
    name: text(b.name, old?.name),
    category: text(b.category, old?.category),
    checked: b.checked === undefined ? old?.checked : Boolean(b.checked),
    dueDate: b.due_date === undefined ? old?.dueDate : text(b.due_date) || null,
    description: b.description === undefined ? old?.description : text(b.description) || null,
    assignedPersonId:
      b.assigned_user_id === undefined
        ? old?.assignedPersonId
        : b.assigned_user_id === null
          ? null
          : person(b.assigned_user_id),
    priority: num(b.priority, old?.priority ?? 0),
    sortOrder: num(b.sort_order, old?.sortOrder ?? current.length),
  };
}
function packingBagDraft(
  b: Record<string, unknown>,
  existing: FamilyPackingBag | undefined,
  id: string | null,
  bags: FamilyPackingBag[]
) {
  return {
    id,
    name: text(b.name, existing?.name),
    color: b.color === undefined ? existing?.color : text(b.color) || null,
    weightLimitGrams:
      b.weight_limit_grams === undefined
        ? existing?.weightLimitGrams
        : b.weight_limit_grams === null
          ? null
          : num(b.weight_limit_grams),
    sortOrder: num(b.sort_order, existing?.sortOrder ?? bags.length),
  };
}
function packingCloneDraft(
  old: FamilyPackingItem,
  s: Awaited<ReturnType<FamilyFrontendRepository['session']>>,
  current: Array<FamilyPackingItem | FamilyTodoItem>
) {
  return {
    ...old,
    id: null,
    checked: false,
    ownerPersonId: old.isPrivate ? s.personId : null,
    sortOrder: current.length,
  };
}
function assertListOrder(ids: string[], current: Array<FamilyPackingItem | FamilyTodoItem>) {
  if (
    ids.length !== current.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !current.some((r) => r.id === id))
  )
    throw new FamilyApiError(409, 'list_changed', 'Reload this list before reordering.');
}
function assertTemplateApplicable(
  id: string,
  templates: Awaited<ReturnType<ListViewContext['p']['listPackingTemplates']>>,
  b: Record<string, unknown>
) {
  if (!templates.some((t) => t.id === id))
    throw new FamilyApiError(404, 'template_unavailable', 'Template unavailable.');
  if (b.visibility === 'personal')
    throw new FamilyApiError(
      422,
      'template_visibility_unavailable',
      'Personal template imports are unavailable in the Family backend.'
    );
}
function packingImportCommand(b: Record<string, unknown>, p: ListViewContext['p'], tripId: string, ids: string[]) {
  return async () => {
    for (const raw of list(b.items)) {
      const item = obj(raw);
      ids.push(
        await p.upsertPackingItem(tripId, {
          name: text(item.name),
          category: text(item.category),
          quantity: num(item.quantity, 1),
        })
      );
    }
  };
}
function packingTemplateView(
  row: Awaited<ReturnType<ListViewContext['p']['listPackingTemplates']>>[number],
  ids: FamilyIdentityRegistry
) {
  return {
    id: ids.register('packingTemplate', row.id),
    name: row.name,
    item_count: row.itemCount,
  };
}
class ListRoutes {
  constructor(
    private readonly packing: boolean,
    private readonly path: string,
    private readonly m: string
  ) {}
  rootRead() {
    return !this.path && this.m === 'GET';
  }
  categoryRead() {
    return this.path === 'category-assignees' && this.m === 'GET';
  }
  categoryWrite() {
    return this.path.startsWith('category-assignees/') && this.m === 'PUT';
  }
  reorder() {
    return this.path === 'reorder' && this.m === 'PUT';
  }
  templates() {
    return this.packing && this.path === 'templates' && this.m === 'GET';
  }
  applyTemplate() {
    return this.packing && this.path.startsWith('apply-template/') && this.m === 'POST';
  }
  saveTemplate() {
    return this.packing && this.path === 'save-as-template' && this.m === 'POST';
  }
  bags() {
    return this.packing && /^bags(\/|$)/.test(this.path);
  }
  importItems() {
    return this.packing && this.path === 'import' && this.m === 'POST';
  }
  bagMembers(parts: string[]) {
    return this.m === 'PUT' && parts.length === 3 && parts[2] === 'members';
  }
  itemDelete(parts: string[]) {
    return this.m === 'DELETE' && parts.length === 1;
  }
  sharing(parts: string[]) {
    return this.packing && this.m === 'PUT' && parts.length === 2 && parts[1] === 'sharing';
  }
  contributors(parts: string[]) {
    if (!this.packing || parts[1] !== 'contributors') return false;
    return (this.m === 'POST' && parts.length === 2) || (this.m === 'DELETE' && parts.length === 3 && !!parts[2]);
  }
  clone(parts: string[]) {
    return this.packing && this.m === 'POST' && parts.length === 2 && parts[1] === 'clone';
  }
  write() {
    return this.m === 'POST' || this.m === 'PUT';
  }
}
function assertBagAvailable(id: string | null, existing: FamilyPackingBag | undefined) {
  if (id && !existing) throw new FamilyApiError(404, 'bag_unavailable', 'Bag unavailable.');
}
function assertItemAvailable(id: string | null, existing: FamilyPackingItem | FamilyTodoItem | undefined) {
  if (id && !existing) throw new FamilyApiError(404, 'item_unavailable', 'List item unavailable.');
}
function packingSharingVisibility(b: Record<string, unknown>) {
  return b.visibility === 'shared' ? 'shared' : b.visibility === 'personal' ? 'personal' : 'common';
}
function unavailableListAction() {
  return new FamilyApiError(422, 'list_action_unavailable', 'This list action has no Family backend equivalent.');
}

async function handlePackingBags(
  { path, m, b, tripId }: Pick<ListItemRequest, 'path' | 'm' | 'b' | 'tripId'>,
  { p, uuid, person, bagView, write }: ListViewContext,
  route: ListRoutes
) {
  const parts = path.split('/');
  const id = parts[1] ? uuid('packingBag', parts[1]) : null;
  const bags = await p.listPackingBags(tripId);
  const existing = bags.find((r) => r.id === id);
  assertBagAvailable(id, existing);
  if (id && route.bagMembers(parts)) {
    await write(() => p.setPackingBagMembers(id, list(b.user_ids).map(person)));
    return { bag: bagView((await p.listPackingBags(tripId)).find((r) => r.id === id)!) };
  }
  if (parts.length > 2) throw unavailableListAction();
  if (m === 'GET') return { bags: bags.map(bagView) };
  if (id && m === 'DELETE') {
    await write(() => p.deletePackingBag(id));
    return { success: true };
  }
  if (route.write()) {
    const saved = await write(() => p.upsertPackingBag(tripId, packingBagDraft(b, existing, id, bags)));
    return { bag: bagView((await p.listPackingBags(tripId)).find((r) => r.id === saved)!) };
  }
  throw unavailableListAction();
}

type ListItemRequest = {
  path: string;
  m: string;
  packing: boolean;
  b: Record<string, unknown>;
  tripId: string;
  s: Awaited<ReturnType<FamilyFrontendRepository['session']>>;
};

async function handleListItems(values: ListItemRequest, context: ListViewContext, route: ListRoutes) {
  const { path, m, packing, b, tripId, s } = values;
  const { p, t, uuid, person, packingView, todoView, rows, write } = context;
  if (route.bags()) return handlePackingBags(values, context, route);
  if (route.importItems()) {
    const ids: string[] = [];
    await write(packingImportCommand(b, p, tripId, ids));
    return {
      items: (await p.listPackingItems(tripId)).filter((r) => ids.includes(r.id)).map(packingView),
    };
  }
  const parts = path.split('/');
  const id = parts[0] ? uuid(packing ? 'packing' : 'todo', parts[0]) : null;
  const current = await rows();
  const existing = current.find((r) => r.id === id);
  assertItemAvailable(id, existing);
  if (id && route.itemDelete(parts)) {
    await write(() => (packing ? p.deletePackingItem(id) : t.deleteTodoItem(id)));
    return { success: true };
  }
  if (id && route.sharing(parts)) {
    const visibility = packingSharingVisibility(b);
    await write(() =>
      p.setPackingItemSharing(id, visibility, s.personId, list(b.recipient_ids ?? b.user_ids).map(person))
    );
    return { item: packingView((await p.listPackingItems(tripId)).find((r) => r.id === id)!) };
  }
  if (id && route.contributors(parts)) {
    const target = parts[2] ? person(parts[2]) : s.personId;
    await write(() => p.setPackingItemContributor(id, target, m === 'POST'));
    return { item: packingView((await p.listPackingItems(tripId)).find((r) => r.id === id)!) };
  }
  if (id && route.clone(parts)) {
    const old = existing as FamilyPackingItem;
    const saved = await write(() => p.upsertPackingItem(tripId, packingCloneDraft(old, s, current)));
    return { item: packingView((await p.listPackingItems(tripId)).find((r) => r.id === saved)!) };
  }
  if (parts.length > 1) throw unavailableListAction();
  if (route.write()) {
    let saved: string;
    if (packing) {
      const old = existing as FamilyPackingItem | undefined;
      saved = await write(() => p.upsertPackingItem(tripId, packingItemDraft(b, old, { id, s, current, uuid })));
      if (b.visibility === 'shared')
        await write(() => p.setPackingItemSharing(saved, 'shared', s.personId, list(b.recipient_ids).map(person)));
      return { item: packingView((await p.listPackingItems(tripId)).find((r) => r.id === saved)!) };
    }
    const old = existing as FamilyTodoItem | undefined;
    saved = await write(() => t.upsertTodoItem(tripId, todoItemDraft(b, old, id, person, current)));
    return { item: todoView((await t.listTodoItems(tripId)).find((r) => r.id === saved)!) };
  }
  throw unavailableListAction();
}
