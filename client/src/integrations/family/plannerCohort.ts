import api from '../../api/client';
import { installPlannerAssignmentPort } from '../../repo/plannerAssignmentPort';
import { installPlannerBookingPort } from '../../repo/plannerBookingPort';
import { installPlannerCalendarPort } from '../../repo/plannerCalendarPort';
import { installPlannerCreationPort } from '../../repo/plannerCreationPort';
import { installPlannerEditorPort, type PlannerEditorRequest } from '../../repo/plannerEditorPort';
import { installPlannerGovernancePort } from '../../repo/plannerGovernancePort';
import { installPlannerPackingPort } from '../../repo/plannerPackingPort';
import { installPlannerReadPort } from '../../repo/plannerReadPort';
import { installPlannerStayWritePort } from '../../repo/plannerStayPort';
import { installPlannerTaskPort } from '../../repo/plannerTaskPort';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { createFamilyApplicationHandler } from './applicationHandler';
import {
  coherentStayQualificationEnabled,
  nativeStayControlsQualificationEnabled,
  nativeStayWriteQualificationEnabled,
} from './coherentStayQualification';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { createNativeStayControls } from './nativeStayControls';
import { createNativeStayWriter } from './nativeStayWriter';
import { withOfflineTripReads } from './offlineTripReadPort';
import { PackingBagCohort } from './packingBagCohort';
import { createPackingBagCommandHandler } from './packingBagCommandHandler';
import { PackingCategoryAggregateCohort } from './packingCategoryAggregateCohort';
import { createPackingCategoryAggregateCommandHandler } from './packingCategoryAggregateCommandHandler';
import { createPackingCategoryCommandHandler } from './packingCategoryCommandHandler';
import { createPackingCategoryTransport } from './packingCategoryTransport';
import { PackingCategoryV2Cohort } from './packingCategoryV2Cohort';
import { createPackingCategoryV2CommandHandler } from './packingCategoryV2CommandHandler';
import { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import { createPackingCommandHandler } from './packingCommandHandler';
import { createPackingGroupCommandHandler } from './packingGroupCommandHandler';
import { createPlannerApplicationReads } from './plannerApplicationReads';
import { createPlannerBookingHandler, createPlannerBookingReader } from './plannerBookings';
import { PlannerBoundaryOwner, installPlannerBoundaryOwner } from './plannerBoundaryOwner';
import { PlannerCohortAssignments } from './plannerCohortAssignments';
import { PlannerCohortBookings } from './plannerCohortBookings';
import { createPlannerBundle } from './plannerCohortBundle';
import { PlannerCohortCalendar } from './plannerCohortCalendar';
import { PlannerCohortCreation } from './plannerCohortCreation';
import { PlannerCohortEditor } from './plannerCohortEditor';
import { PlannerCohortGovernance } from './plannerCohortGovernance';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { PlannerCohortReads } from './plannerCohortReads';
import { PlannerCohortTasks } from './plannerCohortTasks';
import { createPlannerPackingHandler, createPlannerPackingReader } from './plannerPacking';
import { createPlannerTaskHandler, createPlannerTaskReader } from './plannerTasks';
import { createPlannerViewReader } from './plannerView';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { createTaskCommandHandler } from './taskCommandHandler';
import type { FamilyHandler } from './transport';
import { familyCanDo, useFamilyUiPermissions } from './uiPermissions';

type Options = Parameters<typeof createPlannerViewReader>[1] & {
  application?: FamilyHandler;
  reportError: (error: unknown) => void;
  /** SDK qualification only; native category controls remain gated. */
  categoryMetadata?: boolean;
  categoryIdentity?: boolean;
  categoryAggregates?: boolean;
  bagManagement?: boolean;
  bagRecovery?: boolean;
};
/** Native planner composition: the same ports and handler serve explicit fixtures and normal bootstrap. */
export function createFamilyPlannerCohort(repo: FamilyFrontendRepository, options: Options) {
  let installed = false,
    disposed = false;
  const source = options.source ?? getSupabaseUrl;
  const coherentStays = coherentStayQualificationEnabled();
  const reader = createPlannerViewReader(repo, options),
    app = cohortApplication(repo, options.application, () => disposed, source);
  const editor = new PlannerCohortEditor(repo, reader, refreshPlanner, () => disposed, source);
  const creation = new PlannerCohortCreation(repo, reader, editor, refreshPlanner, source);
  const assignments = new PlannerCohortAssignments(repo, refreshPlanner, source, () => disposed);
  const calendar = new PlannerCohortCalendar(repo, hydrateTrip, source, () => disposed);
  const bookings = new PlannerCohortBookings(repo, hydrateTrip, () => disposed, source);
  const governance = cohortGovernance(repo, source, () => disposed, hydrateTrip, loadTrip);
  const boundary = new PlannerBoundaryOwner(repo, governance);
  const taskWrites = new PlannerCohortTasks(repo, {
    source: source,
    disposed: () => disposed,
    allowed: () => familyCanDo('todo_edit', useFamilyUiPermissions.getState().controller),
  });
  const packingBags = new PackingBagCohort(repo, { source, disposed: () => disposed });
  const packingCategoryAggregates = new PackingCategoryAggregateCohort(repo, { source, disposed: () => disposed });
  const packingCategoriesV2 = new PackingCategoryV2Cohort(repo, { source, disposed: () => disposed });
  const packingWrites = new PlannerCohortPacking(repo, {
    aggregates: options.categoryAggregates === true,
    bags: options.bagManagement === true,
    bagRecovery: options.bagRecovery === true,
    source,
    disposed: () => disposed,
    allowed: () => familyCanDo('packing_edit', useFamilyUiPermissions.getState().controller),
    revalidate: (trip) => (boundary.get() ? Promise.resolve() : refreshPlanner(trip)),
  });
  const bundle = createPlannerBundle(repo, reader, app, () => disposed, {
    source,
    categoryMetadata: options.categoryMetadata,
    categoryIdentity: options.categoryIdentity,
    bagManagement: options.bagManagement,
  });
  const reads = new PlannerCohortReads(repo, reader, bundle, {
    boundary,
    coherentStays,
    disposed: () => disposed,
    source: source,
    tasks: (packet) => taskWrites.publish(packet),
    packing: (packet, projection, categories) => packingWrites.publish(packet, projection, true, categories),
    reset: (keepPackingDrafts = false) => {
      taskWrites.reset();
      packingCategoriesV2.reset();
      packingCategoryAggregates.reset();
      packingBags.reset();
      if (!keepPackingDrafts) packingWrites.reset();
      governance.reset();
      bookings.reset();
      editor.cancelEditor();
      creation.dispose();
      assignments.reset();
      calendar.reset();
    },
  });
  function loadTrip(value: number | string) {
    return reads.load(value);
  }
  function hydrateTrip(value: number | string) {
    return reads.hydrate(value);
  }
  function refreshPlanner(value: number | string) {
    return reads.refresh(value);
  }
  const { packing, handlers } = createResourceHandlers(repo, reader, source, () => disposed, options);
  const handle = cohortHandler(() => disposed, bundle, reader, app, handlers);
  function install() {
    if (installed || disposed) throw new Error('Planner cohort cannot be installed twice');
    const release = installCohortPorts({
      repo,
      reader,
      reads,
      taskWrites,
      packingWrites,
      governance,
      boundary,
      writers: { editor, creation, assignments, calendar, bookings, reportError: options.reportError },
      readPort: cohortReadPort(reads, coherentStays, { loadTrip, refreshPlanner, hydrateTrip }),
    });
    const finish = withStayWriter(repo, source, reads, () => disposed, release);
    installed = true;
    return () => {
      if (!installed) return;
      installed = false;
      disposed = true;
      finish();
    };
  }
  return {
    dispose: () => {
      if (installed) throw new Error('Release the installed planner before disposing it');
      disposed = true;
      reads.cancel();
      reader.dispose();
    },
    packing,
    tasks: taskWrites,
    packingWrites,
    packingCategoriesV2,
    packingCategoryAggregates,
    packingBags,
    governance,
    bookings,
    creation,
    assignments,
    calendar,
    handle,
    install,
    loadTrip,
    refreshPlanner,
    hydrateNativeStay: reads.hydrateNativeStay.bind(reads),
    openEditor: (r: PlannerEditorRequest) => editor.openEditor(r),
    saveForm: (r: PlannerEditorRequest, d: Parameters<PlannerCohortEditor['saveForm']>[1]) => editor.saveForm(r, d),
    prepare: (r: PlannerEditorRequest, d: Parameters<PlannerCohortEditor['packet']>[1]) => editor.packet(r, d),
  };
}

function createResourceHandlers(
  repo: FamilyFrontendRepository,
  reader: ReturnType<typeof createPlannerViewReader>,
  source: () => string,
  disposed: () => boolean,
  options: { categoryMetadata?: boolean; categoryIdentity?: boolean; bagManagement?: boolean } = {}
) {
  const bookingReader = createPlannerBookingReader(repo, disposed, source),
    bookingHandler = createPlannerBookingHandler(repo, reader, bookingReader);
  const tasks = createPlannerTaskReader(repo, disposed, source);
  const taskReads = createPlannerTaskHandler(tasks),
    taskCommands = createTaskCommandHandler(repo, source, disposed);
  const taskHandler: FamilyHandler = async (request) => {
    const result = await taskCommands(request);
    return result === NOT_HANDLED ? taskReads(request) : result;
  };
  const packing = createPlannerPackingReader(
    repo,
    disposed,
    source,
    undefined,
    options.categoryIdentity
      ? createPackingCategoryV2Transport()
      : options.categoryMetadata
        ? createPackingCategoryTransport()
        : undefined,
    options.bagManagement
  );
  const packingReads = createPlannerPackingHandler(packing),
    packingCommands = createPackingCommandHandler(repo, source, disposed),
    packingGroups = createPackingGroupCommandHandler(repo, source, disposed),
    packingCategories = createPackingCategoryCommandHandler(repo, source, disposed),
    packingCategoriesV2 = createPackingCategoryV2CommandHandler(repo, source, disposed),
    aggregates = createPackingCategoryAggregateCommandHandler(repo, source, disposed),
    bags = createPackingBagCommandHandler(repo, source, disposed);
  const packingHandler: FamilyHandler = async (request) => {
    const bag = await bags(request);
    if (bag !== NOT_HANDLED) return bag;
    const aggregate = await aggregates(request);
    if (aggregate !== NOT_HANDLED) return aggregate;
    const v2 = await packingCategoriesV2(request);
    if (v2 !== NOT_HANDLED) return v2;
    const category = await packingCategories(request);
    if (category !== NOT_HANDLED) return category;
    const group = await packingGroups(request);
    if (group !== NOT_HANDLED) return group;
    const result = await packingCommands(request);
    return result === NOT_HANDLED ? packingReads(request) : result;
  };
  return { packing, handlers: { bookings: bookingHandler, tasks: taskHandler, packing: packingHandler } };
}

function installCohortPorts({
  repo,
  reader,
  reads,
  taskWrites,
  packingWrites,
  governance,
  boundary,
  writers,
  readPort,
}: {
  repo: FamilyFrontendRepository;
  reader: ReturnType<typeof createPlannerViewReader>;
  reads: PlannerCohortReads;
  taskWrites: PlannerCohortTasks;
  packingWrites: PlannerCohortPacking;
  governance: PlannerCohortGovernance;
  boundary: PlannerBoundaryOwner;
  writers: Parameters<typeof installCohortWrites>[0];
  readPort: Parameters<typeof installCohortReads>[0];
}) {
  const { editor, creation, assignments, calendar, bookings } = writers;
  const undoRead = installCohortReads(readPort);
  let undoWrites: () => void;
  try {
    undoWrites = installCohortWrites(writers);
  } catch (error) {
    undoRead();
    throw error;
  }
  let undoGovernance: () => void;
  try {
    undoGovernance = installPlannerGovernancePort(governance);
  } catch (error) {
    undoWrites();
    undoRead();
    throw error;
  }
  let undoTasks: () => void;
  try {
    undoTasks = installPlannerTaskPort(taskWrites);
  } catch (error) {
    undoGovernance();
    undoWrites();
    undoRead();
    throw error;
  }
  let undoPacking: () => void;
  try {
    undoPacking = installPlannerPackingPort(packingWrites);
  } catch (error) {
    undoTasks();
    undoGovernance();
    undoWrites();
    undoRead();
    throw error;
  }
  const undoController = repo.claimPlannerController();
  const undoRetention = installFamilyCommandRetention();
  let undoBoundary: () => void;
  try {
    undoBoundary = installPlannerBoundaryOwner(boundary);
  } catch (error) {
    undoRetention();
    undoController();
    undoPacking();
    undoTasks();
    undoGovernance();
    undoWrites();
    undoRead();
    throw error;
  }
  return () => {
    undoBoundary();
    taskWrites.reset();
    packingWrites.reset();
    undoPacking();
    undoTasks();
    bookings.reset();
    editor.cancelEditor();
    reads.cancel();
    creation.dispose();
    assignments.reset();
    calendar.reset();
    governance.reset();
    undoGovernance();
    undoController();
    undoRetention();
    undoWrites();
    undoRead();
    reader.dispose();
  };
}

function installCohortReads(
  reads: Pick<
    Parameters<typeof installPlannerReadPort>[0],
    'loadTrip' | 'refreshPlanner' | 'hydrateTrip' | 'stays' | 'currentStays' | 'reservations'
  >
) {
  return installPlannerReadPort(
    withOfflineTripReads({
      ...reads,
      budget: async (trip) => (await api.get(`/trips/${trip}/budget`)).data,
      members: async (trip) => (await api.get(`/trips/${trip}/members`)).data,
      packing: async (trip) => (await api.get(`/trips/${trip}/packing`)).data,
      reloadBudget: reads.hydrateTrip,
      reloadFiles: reads.hydrateTrip,
      reloadReservations: reads.hydrateTrip,
      reservations: reads.reservations ?? (async (trip) => (await api.get(`/trips/${trip}/reservations`)).data),
      places: async (trip, params) => (await api.get(`/trips/${trip}/places`, { params })).data,
      days: async (trip) => (await api.get(`/trips/${trip}/days`)).data,
      todos: async (trip) => (await api.get(`/trips/${trip}/todo`)).data,
    })
  );
}

function cohortHandler(
  isDisposed: () => boolean,
  bundle: ReturnType<typeof createPlannerBundle>,
  reader: ReturnType<typeof createPlannerViewReader>,
  app: FamilyHandler,
  resources: { bookings: FamilyHandler; tasks: FamilyHandler; packing: FamilyHandler }
): FamilyHandler {
  return async (request) => {
    if (isDisposed()) throw new FamilyApiError(409, 'planner_cohort_disposed', 'This planner session ended.');
    const m = request.pathname.match(/^\/trips\/([^/]+)\/bundle$/);
    if (m) {
      if (request.method !== 'GET' || request.query.size)
        throw new FamilyApiError(409, 'planner_bundle_read_only', 'Only a complete planner bundle read is supported.');
      return bundle(m[1], request.signal);
    }
    const paired = request.pathname.match(/^\/trips\/([^/]+)\/(reservations|accommodations)$/);
    if (paired && coherentStayQualificationEnabled() && request.method === 'GET') {
      if (request.query.size)
        throw new FamilyApiError(400, 'coherent_full_read', 'Only complete paired reads are supported.');
      const result = await bundle(paired[1], request.signal);
      if (!result.familyStayProjection)
        throw new FamilyApiError(503, 'coherent_stays_unavailable', 'The qualified stay projection is unavailable.');
      return paired[2] === 'reservations'
        ? { reservations: result.reservations }
        : { accommodations: result.familyStayProjection?.accommodations };
    }
    if (
      request.method !== 'GET' &&
      /^\/trips\/[^/]+(?:\/|$)/.test(request.pathname) &&
      !/^\/trips\/[^/]+\/family\//.test(request.pathname)
    )
      throw new FamilyApiError(
        409,
        'planner_writer_not_cut_over',
        'This native writer is not connected to the planner cohort. Original work is retained.'
      );
    const packingResult = await resources.packing(request);
    if (packingResult !== NOT_HANDLED) return packingResult;
    const taskResult = await resources.tasks(request);
    if (taskResult !== NOT_HANDLED) return taskResult;
    const bookingResult = await resources.bookings(request);
    if (bookingResult !== NOT_HANDLED) return bookingResult;
    const result = await reader.native(request);
    return result === NOT_HANDLED ? app(request) : result;
  };
}

function installCohortWrites({
  editor,
  creation,
  assignments,
  calendar,
  bookings,
  reportError,
}: {
  editor: PlannerCohortEditor;
  creation: PlannerCohortCreation;
  assignments: PlannerCohortAssignments;
  calendar: PlannerCohortCalendar;
  bookings: PlannerCohortBookings;
  reportError: Options['reportError'];
}) {
  const undoEdit = installPlannerEditorPort({
    openEditor: (r) => editor.openEditor(r),
    saveForm: (r, d) => editor.saveForm(r, d),
    cancelEditor: () => editor.cancelEditor(),
    reportError: reportError,
    confirmEditor: (r) => editor.confirmEditor(r),
    selectedAssignment: (id) => editor.selectedAssignment(id),
  });
  let undoCreate: () => void;
  try {
    undoCreate = installPlannerCreationPort({
      beginForm: (c) => creation.beginForm(c),
      cancelForm: () => creation.cancelForm(),
      createForm: (c, d) => creation.createForm(c, d),
      assign: (t, d, p, i, s) => creation.assign(t, d, p, i, s),
      reportError: reportError,
    });
  } catch (error) {
    undoEdit();
    throw error;
  }
  let undoAssignment: () => void;
  try {
    undoAssignment = installPlannerAssignmentPort({
      execute: (r) => assignments.execute(r),
      bindUndo: (undo, days) => assignments.bindUndo(undo, days),
    });
  } catch (error) {
    undoCreate();
    undoEdit();
    throw error;
  }
  let undoCalendar: () => void;
  try {
    undoCalendar = installPlannerCalendarPort({
      prepareTrash: (t, d) => calendar.prepareTrash(t, d),
      prepareRemove: (t, d) => calendar.prepareRemove(t, d),
      remove: (t, d) => calendar.remove(t, d),
      insert: (t, p) => calendar.insert(t, p),
      reorder: (t, d) => calendar.reorder(t, d),
      rename: (t, d, v) => calendar.rename(t, d, v),
      append: (t, p) => calendar.append(t, p),
      extendTrip: (t, d) => calendar.extendTrip(t, d),
    });
  } catch (error) {
    undoAssignment();
    undoCreate();
    undoEdit();
    throw error;
  }
  let undoBooking: () => void;
  try {
    undoBooking = installPlannerBookingPort({ open: (request) => bookings.open(request) });
  } catch (error) {
    undoCalendar();
    undoAssignment();
    undoCreate();
    undoEdit();
    throw error;
  }
  return () => {
    undoBooking();
    undoCalendar();
    undoAssignment();
    undoCreate();
    undoEdit();
  };
}

function cohortReadPort(
  reads: PlannerCohortReads,
  coherent: boolean,
  base: Pick<import('../../repo/plannerReadPort').PlannerReadPort, 'loadTrip' | 'refreshPlanner' | 'hydrateTrip'>
) {
  return {
    ...base,
    ...(coherent
      ? {
          stays: (trip: number | string) => reads.stays(trip),
          currentStays: (trip: number | string) => reads.currentStays(trip),
          reservations: async (trip: number | string) => ({ reservations: (await reads.stays(trip)).reservations }),
        }
      : {}),
  };
}

function cohortApplication(
  repo: FamilyFrontendRepository,
  app: FamilyHandler | undefined,
  disposed: () => boolean,
  source: () => string
) {
  return createPlannerApplicationReads(repo, app ?? createFamilyApplicationHandler(repo), disposed, source);
}
function cohortGovernance(
  repo: FamilyFrontendRepository,
  source: () => string,
  disposed: () => boolean,
  hydrate: (trip: number | string) => Promise<void>,
  changeLayer: (trip: number | string) => Promise<void>
) {
  return new PlannerCohortGovernance(repo, { source, disposed, hydrate, changeLayer });
}

function withStayWriter(
  repo: FamilyFrontendRepository,
  source: () => string,
  reads: PlannerCohortReads,
  disposed: () => boolean,
  release: () => void
) {
  let releaseStay = () => {};
  try {
    if (nativeStayControlsQualificationEnabled())
      releaseStay = installPlannerStayWritePort(
        createNativeStayControls(repo, {
          source,
          disposed,
          confirmCurrent: (current, guard) => reads.hydrateNativeStay(current, guard),
        })
      );
    else if (nativeStayWriteQualificationEnabled())
      releaseStay = installPlannerStayWritePort(
        createNativeStayWriter(repo, {
          source,
          disposed,
          hydrate: (trip) => reads.hydrate(trip),
        })
      );
  } catch (error) {
    release();
    throw error;
  }
  return () => {
    releaseStay();
    release();
  };
}
