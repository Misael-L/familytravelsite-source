// organize-imports-ignore
// sort-imports-ignore
// Preserve original test SDK mock and runtime module evaluation order.
import type { visitRecord } from './core';
import '@family/backend/supabase/catalogDiscovery';

import '@trek/shared';

import type axios from 'axios';

import 'axios';

import 'fake-indexeddb/auto';

import 'msw';

import 'react';

import 'react-router';

import { vi } from 'vitest';

import 'zustand/react/shallow';

import '../familyPacking';

import '../familyTasks';

import '../msw/server';

import '../offlineDb';

import '../placeFormSetup';

import '../render';

import '../store';

import api from '../../../src/api/client';

import '../../../src/components/Planner/bookings/BookingDetailHost';

import '../../../src/components/Planner/PlaceFormModal';

import '../../../src/components/Planner/PlaceFormModal.helpers';

import '../../../src/components/Planner/ReservationModal';

import '../../../src/components/Settings/useOfflineSettings';

import '../../../src/components/Todo/useTaskForm';

import '../../../src/db/offlineDb';

import '../../../src/hooks/usePlannerHistory';

import '../../../src/pages/tripPlanner/placeFormContext';

import '../../../src/pages/tripPlanner/useDayAdd';

import '../../../src/pages/tripPlanner/useDayClear';

import '../../../src/pages/tripPlanner/useDayDelete';

import '../../../src/pages/tripPlanner/useDayPlanEdits';

import '../../../src/pages/tripPlanner/usePlaceEdits';

import '../../../src/pages/tripPlanner/usePlaceFormOpeners';

import '../../../src/pages/tripPlanner/usePlannerDialogs';

import '../../../src/repo/assignmentRepo';

import '../../../src/repo/dayNoteRepo';

import '../plannerStartupRead';

import '../../../src/repo/plannerAssignmentPort';

import '../../../src/repo/plannerBookingPort';

import '../../../src/repo/plannerCalendarPort';

import '../../../src/repo/plannerCreationPort';

import '../../../src/repo/plannerEditorPort';

import type { useTripStore } from '../../../src/store/tripStore';

import '../../../src/store/tripStore';

import '../../../src/sync/authGate';

import '../../../src/sync/mutationQueue';

import '../../../src/sync/networkMode';

import '../../../src/sync/tripSyncManager';

import '../../../src/sync/writeSession';

import '../../../src/integrations/family/applicationHandler';

import '../../../src/integrations/family/FamilyPlannerReadProblem';

import type { FamilyTripFile } from '../../../src/integrations/family/legacy/data/supabase/tripFiles';

import type { FamilyTripFileLink } from '../../../src/integrations/family/legacy/data/supabase/tripFiles';

import '../../../src/integrations/family/packingIntentQueue';

import type { PlanLocation } from '../../../src/integrations/family/planLocationContract';

import type { ArrangementPlan } from '../../../src/integrations/family/plannerArrangementContract';

import '../../../src/integrations/family/plannerBookings';

import '../../../src/integrations/family/plannerBoundaryOwner';

import '../../../src/integrations/family/plannerCache';

import type { CalendarObservation } from '../../../src/integrations/family/plannerCalendarContract';

import type { createFamilyPlannerCohort } from '../../../src/integrations/family/plannerCohort';

import '../../../src/integrations/family/plannerCohort';

import '../../../src/integrations/family/plannerView';

import type { FamilyFrontendRepository } from '../../../src/integrations/family/repository';

import type { FamilySession } from '../../../src/integrations/family/repository';

import '../../../src/integrations/family/repository';

import type { TaskRow } from '../../../src/integrations/family/taskContract';

import '../../../src/integrations/family/transport';

import type { VisitFormReceipt } from '../../../src/integrations/family/visitFormContract';

import type { VisitFormValues } from '../../../src/integrations/family/visitFormContract';

let tripBeforeLoad: ReturnType<typeof useTripStore.getState>['trip'];

let bookingRows: import('../../../src/integrations/family/plannerBookingContract').PlannerBookingRow[] = [];

const db = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../../src/integrations/family/legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => db }));

vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => db }));

vi.mock('../../../src/integrations/family/legacy/data/supabase/env', () => ({
  getSupabaseUrl: () => 'https://fixture.supabase.invalid',
}));

export const uuid = (n: number) => `d0400000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const trip = uuid(1),
  family = uuid(2),
  location = uuid(3),
  visit = uuid(7),
  day = uuid(8),
  at = '2026-11-05T00:00:00Z';

let repo: FamilyFrontendRepository, session: FamilySession, published: PlanLocation;

let publishedVisit: ReturnType<typeof visitRecord>, privateValues: VisitFormValues | null;

let draftIndex: number, loseAck: boolean, switchScope: boolean, deny: { code: string } | null;

export const receipts = new Map<string, { hash: string; result: VisitFormReceipt }>(),
  original = api.defaults.adapter;

let repeatVisit: ReturnType<typeof visitRecord>;

let extras: Record<string, unknown[]> = {};

let taskRows: TaskRow[] = [];

let malformed = false;

let cohort: ReturnType<typeof createFamilyPlannerCohort>,
  release: () => void,
  client: ReturnType<typeof axios.create>,
  readonlyFailure: boolean,
  source: string,
  privateKind: 'location' | 'visit';

export const errors = vi.fn(),
  toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

export type CreatedRow = {
  location: PlanLocation;
  visit: ReturnType<typeof visitRecord> | null;
  private: boolean;
  op: string;
};

let creationRows: CreatedRow[] = [],
  creationOps: Record<string, unknown>[] = [];

export const creationReceipts = new Map<string, { hash: string; result: Record<string, unknown> }>();

export const query = new URLSearchParams();

export type ArrangementRow = ReturnType<typeof visitRecord>;

let arrangementExtraDays: {
  id: string;
  trip_id: string;
  civil_day: string;
  day_index: number;
  title: string | null;
  updated_at: string;
}[] = [];

let arrangementPrivate: { rows: ArrangementRow[]; removed: Set<string>; op: string; plan: ArrangementPlan } | null =
  null;

export const arrangementRemoved = new Set<string>(),
  arrangementReceipts = new Map<string, { hash: string; result: Record<string, unknown> }>();

let calendarData: CalendarObservation | null = null;

export const calendarResults = new Map<string, { hash: string; result: unknown }>();

export const dayOrderHistory = new Map<string, { before: CalendarObservation; after: CalendarObservation }>();

export const insertionHistory = new Map<
  string,
  { before: CalendarObservation; after: CalendarObservation; id: string; undone: boolean }
>();

export const removalHistory = new Map<
  string,
  { before: CalendarObservation; after: CalendarObservation; id: string; restored: boolean }
>();

export type ContentNote = {
  id: string;
  trip_id: string;
  civil_day: string;
  body: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const bookingHistory = new Map<
  string,
  import('../../../src/integrations/family/plannerBookingContract').PlannerBookingRow[]
>();

export const contentNotes: ContentNote[] = [],
  contentHistory = new Map<
    string,
    { visits: { id: string; hidden: boolean }[]; notes: ContentNote[]; otherDates: Map<string, string> }
  >();

let contentGuard: 'armed-file' | 'file-permission' | 'booking-permission' | 'pending' | null = null;

export const attachedFiles: FamilyTripFile[] = [];

export const attachmentHistory = new Map<string, FamilyTripFileLink[]>();
export const cohortState = {
  get tripBeforeLoad() {
    return tripBeforeLoad;
  },
  set tripBeforeLoad(value: typeof tripBeforeLoad) {
    tripBeforeLoad = value;
  },
  get bookingRows() {
    return bookingRows;
  },
  set bookingRows(value: typeof bookingRows) {
    bookingRows = value;
  },
  get repo() {
    return repo;
  },
  set repo(value: typeof repo) {
    repo = value;
  },
  get session() {
    return session;
  },
  set session(value: typeof session) {
    session = value;
  },
  get published() {
    return published;
  },
  set published(value: typeof published) {
    published = value;
  },
  get publishedVisit() {
    return publishedVisit;
  },
  set publishedVisit(value: typeof publishedVisit) {
    publishedVisit = value;
  },
  get privateValues() {
    return privateValues;
  },
  set privateValues(value: typeof privateValues) {
    privateValues = value;
  },
  get draftIndex() {
    return draftIndex;
  },
  set draftIndex(value: typeof draftIndex) {
    draftIndex = value;
  },
  get loseAck() {
    return loseAck;
  },
  set loseAck(value: typeof loseAck) {
    loseAck = value;
  },
  get switchScope() {
    return switchScope;
  },
  set switchScope(value: typeof switchScope) {
    switchScope = value;
  },
  get deny() {
    return deny;
  },
  set deny(value: typeof deny) {
    deny = value;
  },
  get repeatVisit() {
    return repeatVisit;
  },
  set repeatVisit(value: typeof repeatVisit) {
    repeatVisit = value;
  },
  get extras() {
    return extras;
  },
  set extras(value: typeof extras) {
    extras = value;
  },
  get taskRows() {
    return taskRows;
  },
  set taskRows(value: typeof taskRows) {
    taskRows = value;
  },
  get malformed() {
    return malformed;
  },
  set malformed(value: typeof malformed) {
    malformed = value;
  },
  get cohort() {
    return cohort;
  },
  set cohort(value: typeof cohort) {
    cohort = value;
  },
  get release() {
    return release;
  },
  set release(value: typeof release) {
    release = value;
  },
  get client() {
    return client;
  },
  set client(value: typeof client) {
    client = value;
  },
  get readonlyFailure() {
    return readonlyFailure;
  },
  set readonlyFailure(value: typeof readonlyFailure) {
    readonlyFailure = value;
  },
  get source() {
    return source;
  },
  set source(value: typeof source) {
    source = value;
  },
  get privateKind() {
    return privateKind;
  },
  set privateKind(value: typeof privateKind) {
    privateKind = value;
  },
  get creationRows() {
    return creationRows;
  },
  set creationRows(value: typeof creationRows) {
    creationRows = value;
  },
  get creationOps() {
    return creationOps;
  },
  set creationOps(value: typeof creationOps) {
    creationOps = value;
  },
  get arrangementExtraDays() {
    return arrangementExtraDays;
  },
  set arrangementExtraDays(value: typeof arrangementExtraDays) {
    arrangementExtraDays = value;
  },
  get arrangementPrivate() {
    return arrangementPrivate;
  },
  set arrangementPrivate(value: typeof arrangementPrivate) {
    arrangementPrivate = value;
  },
  get calendarData() {
    return calendarData;
  },
  set calendarData(value: typeof calendarData) {
    calendarData = value;
  },
  get contentGuard() {
    return contentGuard;
  },
  set contentGuard(value: typeof contentGuard) {
    contentGuard = value;
  },
};
export { db };
