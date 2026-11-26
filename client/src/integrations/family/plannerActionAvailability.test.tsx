import { installPlannerCalendarPort } from '../../repo/plannerCalendarPort';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlanner, buildTripActions } from '../../../tests/helpers/mobileTrip';
import { cleanup, fireEvent, render, screen } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import type { TripPlanner } from '../../mobile/screens/trip/MTripShell';
import MTaskSheet from '../../mobile/screens/trip/tabs/MTaskSheet';
import MTodoListTab from '../../mobile/screens/trip/tabs/MTodoListTab';
import type { TodoItem } from '../../types';
import { writeModeForCapability } from './legacy/pages/familyTripWorkspace/workspaceGovernanceModel';
import { plannerActionAvailable } from './plannerActionAvailability';
import {
  familyCanDo,
  familyReservationEditable,
  useFamilyUiPermissions,
  type FamilyPermissionController,
} from './uiPermissions';

const actions = [
  ['day_edit', 'trip.schedule.manage', true],
  ['place_edit', 'trip.places.manage', true],
  ['reservation_edit', 'trip.reservations.manage', true],
  ['packing_edit', 'trip.packing.manage', false],
  ['todo_edit', 'trip.todos.manage', false],
  ['budget_edit', 'trip.costs.manage', false],
  ['file_upload', 'trip.files.upload', false],
  ['file_edit', 'trip.files.metadata', false],
  ['file_delete', 'trip.files.trash', false],
  ['trip_edit', 'trip.metadata.edit', false],
  ['trip_title_edit', 'trip.metadata.edit', false],
  ['trip_dates_edit', 'trip.metadata.edit', false],
  ['trip_delete', 'trip.archive', false],
] as const;
function controller(
  layer: 'published' | 'myDraft',
  outcome: 'direct' | 'propose' | 'deny',
  owner: boolean
): FamilyPermissionController {
  const outcomes = Object.fromEntries(actions.map(([, key]) => [key, outcome]));
  const gov: FamilyPermissionController['gov'] = {
    layer,
    setLayer: vi.fn(),
    canMutate: owner,
    canDraft: true,
    canEditPublished: owner && layer === 'published',
    canStageDraft: layer === 'myDraft',
    writeMode: 'deny',
    writeModeFor: (key) => writeModeForCapability({ layer, outcome: outcomes[key], key, isHof: owner }),
    actionOutcomes: outcomes,
    canUseEditors: true,
    changeDraft: null,
    draftOps: [],
    openChangeRequests: [],
    mySubmittedRequests: [],
    isChangeBusy: false,
    governanceError: null,
    mutateGateError: false,
    reloadChangeGovernance: async () => {},
    addDraftOp: async () => false,
    deleteDraftOp: async () => false,
    proposeDraftChanges: async () => false,
    withdrawRequest: async () => false,
    resolveOp: async () => ({ ok: false }),
    resolveRequest: async () => ({ ok: false, errorCodes: [] }),
    loadRequestOps: async () => [],
    nextSortOrder: 0,
  };
  return { gov, isCurrent: () => true, supportsAction: plannerActionAvailable };
}
beforeEach(() => {
  resetAllStores();
});
afterEach(() => {
  cleanup();
  useFamilyUiPermissions.setState({ controller: null });
  vi.restoreAllMocks();
});
const cases = actions.flatMap(([action, capability, available]) =>
  (['published', 'myDraft'] as const).flatMap((layer) =>
    (['direct', 'propose', 'deny'] as const).flatMap((outcome) =>
      [false, true].map((owner) => ({ action, capability, available, layer, outcome, owner }))
    )
  )
);

describe('planner action availability intersects existing Family authorization', () => {
  it.each(cases)('$action $layer $outcome owner=$owner', ({ action, available, layer, outcome, owner }) => {
    const checked = controller(layer, outcome, owner),
      ordinary = { ...checked, supportsAction: undefined };
    const authorized = familyCanDo(action, ordinary);
    if (layer === 'published') expect(authorized).toBe(outcome === 'direct');
    expect(familyCanDo(action, checked)).toBe(available && authorized);
    expect(checked.gov.actionOutcomes).toEqual(ordinary.gov.actionOutcomes);
  });
  it.each(['future_writer', 'constructor', '__proto__'])('unknown action %s fails closed', (action) => {
    expect(plannerActionAvailable(action)).toBe(false);
    expect(familyCanDo(action, controller('published', 'direct', true))).toBe(false);
  });
  it('an availability grant cannot override denied or retired authority', () => {
    const denied = controller('published', 'deny', true);
    denied.supportsAction = () => true;
    expect(familyCanDo('place_edit', denied)).toBe(false);
    const retired = controller('published', 'direct', true);
    retired.isCurrent = () => false;
    expect(familyCanDo('place_edit', retired)).toBe(false);
  });
  it('the unchanged legacy controller remains authorized when it has no availability seam', () => {
    const legacy = controller('published', 'direct', true);
    delete legacy.supportsAction;
    expect(familyCanDo('packing_edit', legacy)).toBe(true);
    expect(familyCanDo('trip_edit', legacy)).toBe(true);
  });
  it('Family transport stays read-only, while ordinary booking edits follow their permission', () => {
    const c = controller('published', 'direct', true);
    useFamilyUiPermissions.setState({ controller: c });
    expect(familyReservationEditable({ type: 'flight' })).toBe(false);
    expect(familyReservationEditable({ type: 'transit' })).toBe(false);
    expect(familyReservationEditable({ type: 'hotel' })).toBe(true);
    c.supportsAction = () => false;
    expect(familyReservationEditable({ type: 'flight' })).toBe(false);
    expect(familyReservationEditable({ type: 'hotel' })).toBe(false);
  });
});

const item: TodoItem = {
  id: 42,
  trip_id: 1,
  name: 'Read-only task',
  category: 'Planning',
  checked: 0,
  sort_order: 0,
  description: 'Retain these task details',
  assigned_user_id: null,
  priority: 1,
  due_date: '2027-04-01',
};
function taskPlanner(allowed: () => boolean) {
  const actions = buildTripActions();
  return {
    actions,
    planner: buildPlanner({
      can: vi.fn(allowed),
      todoItems: [item],
      tripActions: actions as unknown as TripPlanner['tripActions'],
    }),
  };
}
describe('real native phone task permission consumers', () => {
  it('renders task data but prevents a denied task toggle before optimistic state or HTTP', () => {
    const { planner, actions } = taskPlanner(() => false);
    render(<MTodoListTab planner={planner} />);
    const toggle = screen.getByRole('button', { name: item.name });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(actions.toggleTodoItem).not.toHaveBeenCalled();
    expect(screen.getByText(item.name)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'todo.newItem' })).not.toBeInTheDocument();
  });
  it('the same native task toggle still works when available and authorized', () => {
    const { planner, actions } = taskPlanner(() => true);
    render(<MTodoListTab planner={planner} />);
    const toggle = screen.getByRole('button', { name: item.name });
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    expect(actions.toggleTodoItem).toHaveBeenCalledWith(planner.tripId, item.id, true);
  });
  it('a retained task toggle rechecks current permission before invoking its store action', () => {
    let allowed = true;
    const { planner, actions } = taskPlanner(() => allowed);
    render(<MTodoListTab planner={planner} />);
    allowed = false;
    fireEvent.click(screen.getByRole('button', { name: item.name }));
    expect(actions.toggleTodoItem).not.toHaveBeenCalled();
  });
  it('the actual task sheet preserves readable details with editing and deletion unavailable', () => {
    const { planner, actions } = taskPlanner(() => false);
    render(
      <MTaskSheet planner={planner} open itemId={item.id} categories={['Planning']} members={[]} onClose={vi.fn()} />
    );
    expect(screen.getByDisplayValue(item.name)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'todo.detail.save' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'todo.detail.delete' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'todo.noCategory' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'todo.addCategory' })).toBeDisabled();
    expect(screen.getByText('Retain these task details')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'todo.detail.save' }));
    expect(actions.updateTodoItem).not.toHaveBeenCalled();
    expect(actions.deleteTodoItem).not.toHaveBeenCalled();
  });
  it.each(['save', 'delete'] as const)('an already-open sheet rechecks revoked permission for %s', (intent) => {
    let allowed = true;
    const { planner, actions } = taskPlanner(() => allowed);
    render(<MTaskSheet planner={planner} open itemId={item.id} categories={[]} members={[]} onClose={vi.fn()} />);
    allowed = false;
    fireEvent.click(
      screen.getByRole('button', { name: intent === 'save' ? 'todo.detail.save' : 'todo.detail.delete' })
    );
    expect(actions.updateTodoItem).not.toHaveBeenCalled();
    expect(actions.deleteTodoItem).not.toHaveBeenCalled();
  });
});


describe('relative calendar assignment availability', () => {
  it('requires an installed calendar and direct published metadata and schedule authority', () => {
    expect(familyCanDo('trip_assign_dates', controller('published', 'direct', true))).toBe(false);
    const release = installPlannerCalendarPort({} as never);
    try {
      expect(familyCanDo('trip_assign_dates', controller('published', 'direct', true))).toBe(true);
      expect(familyCanDo('trip_assign_dates', controller('published', 'propose', true))).toBe(false);
      expect(familyCanDo('trip_assign_dates', controller('published', 'deny', true))).toBe(false);
      expect(familyCanDo('trip_assign_dates', controller('myDraft', 'direct', true))).toBe(false);
    } finally { release(); }
  });
});
