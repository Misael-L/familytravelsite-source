import { DEFAULT_YEAR_SETTINGS } from '../../vacay/yearWindow';
import { canReviewFamilyAdmin } from './legacy/data/supabase/capabilities';
import * as holidayBackend from './legacy/data/supabase/nagerHolidays';
import * as calendarBackend from './legacy/data/supabase/vacay';
import { buildPtoStats } from './legacy/pages/vacay/vacayModel';
import { NOT_HANDLED } from './listHandler';
import type { FamilyFrontendRepository } from './repository';
import { FamilyApiError, familyAuthStore } from './repository';
import { familyRequestContext, scopeFamilyOperations } from './requestContext';
import type { FamilyRequest } from './transport';
const loads = new WeakMap<FamilyFrontendRepository, Map<string, Promise<calendarBackend.FamilyVacayYearLoad>>>();
function calendarViews(
  calendar: typeof calendarBackend,
  s: Awaited<ReturnType<FamilyFrontendRepository['session']>>,
  v: Awaited<ReturnType<FamilyFrontendRepository['views']>>,
  map: Map<string, Promise<calendarBackend.FamilyVacayYearLoad>>
) {
  const load = (y: number) => {
    const key = `${s.userId}:${s.familyId}:${y}`;
    let task = map.get(key);
    if (task === undefined) {
      task = calendar.loadVacayYear(s.familyId, y, s.personId);
      map.set(key, task);
      void task.catch(() => {
        if (map.get(key) === task) map.delete(key);
      });
    }
    return task;
  };
  const unavailable = (): never => {
    throw new FamilyApiError(
      422,
      'calendar_feature_unavailable',
      'Family calendars support their existing whole-day leave, school breaks and calendar-year settings.'
    );
  };
  const reviewer = canReviewFamilyAdmin(familyAuthStore.getState());
  const person = (value: unknown) =>
    value == null ? s.personId : v.ids.uuid('person', typeof value === 'number' ? value : String(value));
  const calendarView = (row: import('./legacy/types').VacayHolidayCalendar) => ({
    ...row,
    id: v.ids.register('holidayCalendar', String(row.id)),
  });
  const planView = (row: calendarBackend.FamilyVacayYearLoad) => ({
    ...row.plan,
    id: v.ids.register('calendarPlan', s.familyId),
    holiday_calendars: (row.plan.holiday_calendars ?? []).map(calendarView),
  });
  const rowsView = (row: calendarBackend.FamilyVacayYearLoad) =>
    row.entries.map((entry) => ({
      ...entry,
      user_id: v.ids.register('person', String(entry.user_id)),
      plan_id: v.ids.register('calendarPlan', s.familyId),
      kind: entry.kind === 'school_break' ? 'comp' : 'vacation',
      fraction: 1,
    }));
  const statsView = (row: calendarBackend.FamilyVacayYearLoad, y: number) =>
    buildPtoStats({
      users: row.users,
      entries: row.entries,
      ptoRows: row.ptoRows,
      year: y,
      carryOverEnabled: row.settings.carryOverEnabled,
    }).map((stat) => ({ ...stat, user_id: v.ids.register('person', String(stat.user_id)) }));
  return { load, unavailable, reviewer, person, calendarView, planView, rowsView, statsView };
}
function requireCalendarReviewer(reviewer: boolean) {
  if (!reviewer)
    throw new FamilyApiError(
      403,
      'calendar_manage_required',
      'Calendar administration is unavailable for this membership.'
    );
}

async function calendarYears(
  calendar: typeof calendarBackend,
  familyId: string,
  {
    method,
    value,
    reviewer,
    unavailable,
  }: { method: string; value: unknown; reviewer: boolean; unavailable: () => never },
  invalidate: () => void
) {
  const settings = await calendar.fetchCalendarSettings(familyId);
  if (method === 'GET') return { years: settings.visibleYears };
  requireCalendarReviewer(reviewer);
  const y = Number(value);
  if (!Number.isInteger(y) || y < 1900 || y > 2200)
    throw new FamilyApiError(422, 'invalid_calendar_year', 'Choose a valid calendar year.');
  const years =
    method === 'DELETE'
      ? settings.visibleYears.filter((year) => year !== y)
      : [...new Set([...settings.visibleYears, y])].sort();
  if (!years.length) unavailable();
  await calendar.upsertCalendarSettings(familyId, { visibleYears: years });
  invalidate();
  return { years };
}
function calendarRequestBody(request: FamilyRequest) {
  return (request.body ?? {}) as Record<string, unknown>;
}

function calendarRequestYear(p: string[], currentYear: number) {
  return Number(p[1]) || currentYear;
}

function calendarLoadMap(repo: FamilyFrontendRepository) {
  const map = loads.get(repo) ?? new Map<string, Promise<calendarBackend.FamilyVacayYearLoad>>();
  loads.set(repo, map);
  return map;
}

function calendarYearValue(p: string[], b: Record<string, unknown>) {
  return p[1] ?? b.year;
}

function calendarEntryDate(b: Record<string, unknown>, unavailable: () => never) {
  if (b.fraction != null && b.fraction !== 1) unavailable();
  const date = String(b.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new FamilyApiError(422, 'invalid_calendar_date', 'Choose a valid date.');
  return date;
}

function validateWholeCalendarDay(b: Record<string, unknown>, unavailable: () => never) {
  if (b.fraction != null && b.fraction !== 1) unavailable();
}

function calendarEntitledDays(b: Record<string, unknown>, unavailable: () => never) {
  const days = Number(b.vacation_days);
  if (!Number.isFinite(days) || days < 0) unavailable();
  return days;
}

function calendarCarriedOver(old: Awaited<ReturnType<typeof calendarBackend.listPtoYears>>[number] | undefined) {
  return old?.carriedOver ?? 0;
}

function calendarPersonColor(b: Record<string, unknown>, unavailable: () => never) {
  const color = String(b.color);
  if (!/^#[0-9a-f]{6}$/i.test(color)) unavailable();
  return color;
}

function calendarPlanPatch(b: Record<string, unknown>, unavailable: () => never) {
  const fields: Record<string, keyof Omit<calendarBackend.FamilyCalendarSettings, 'familyId'>> = {
    block_weekends: 'blockWeekends',
    weekend_days: 'weekendDays',
    week_start: 'weekStart',
    holidays_enabled: 'holidaysEnabled',
    company_holidays_enabled: 'familyDaysEnabled',
    carry_over_enabled: 'carryOverEnabled',
  };
  if (Object.keys(b).some((key) => !fields[key])) unavailable();
  const patch = Object.fromEntries(Object.entries(b).map(([key, value]) => [fields[key], value]));
  return patch;
}

function calendarReadRoute(p: string[], m: string) {
  if (p[0] === 'plan' && p.length === 1 && m === 'GET') return 'plan';
  if (p[0] === 'year-settings') return 'year-settings';
  if (p[0] === 'years') return 'years';
  if (p[0] === 'entries' && m === 'GET') return 'entries';
  if (p[0] === 'stats' && m === 'GET') return 'stats';
  return null;
}

function calendarWriteRoute(p: string[], m: string) {
  if (p[0] === 'entries' && p[1] === 'toggle' && m === 'POST') return 'entry';
  if (p[0] === 'entries' && p[1] === 'company-holiday' && m === 'POST') return 'company-holiday';
  if (p[0] === 'stats' && m === 'PUT') return 'stats';
  if (p[0] === 'color' && m === 'PUT') return 'color';
  if (p[0] === 'plan' && p.length === 1 && m === 'PUT') return 'plan';
  return null;
}

function calendarRemainingRoute(p: string[], m: string) {
  if (p[0] === 'plan' && p[1] === 'holiday-calendars') return 'calendars';
  if (p[0] === 'holidays' && m === 'GET') return 'holidays';
  return null;
}

export async function handleFamilyVacay(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const context = familyRequestContext(repo);
  const calendar = scopeFamilyOperations(repo, calendarBackend, context);
  const holidays = scopeFamilyOperations(repo, holidayBackend, context);
  if (!request.pathname.startsWith('/addons/vacay/')) return NOT_HANDLED;
  const s = await repo.session(),
    v = await repo.views(),
    m = request.method;
  const p = request.pathname.replace('/addons/vacay/', '').split('/'),
    b = calendarRequestBody(request);
  const currentYear = new Date().getFullYear(),
    year = calendarRequestYear(p, currentYear);
  const map = calendarLoadMap(repo);
  const { load, unavailable, reviewer, person, calendarView, planView, rowsView, statsView } = calendarViews(
    calendar,
    s,
    v,
    map
  );
  const readRoute = calendarReadRoute(p, m);
  if (readRoute === 'plan') {
    const row = await load(currentYear);
    return {
      plan: planView(row),
      users: row.users.map((user) => ({ ...user, id: v.ids.register('person', String(user.id)) })),
      pendingInvites: [],
      incomingInvites: [],
      isOwner: reviewer,
      isFused: row.users.length > 1,
    };
  }
  if (readRoute === 'year-settings') {
    if (m === 'GET') return { settings: DEFAULT_YEAR_SETTINGS };
    unavailable();
  }
  if (readRoute === 'years')
    return calendarYears(
      calendar,
      s.familyId,
      { method: m, value: calendarYearValue(p, b), reviewer, unavailable },
      () => map.clear()
    );
  if (readRoute === 'entries') return calendarEntries(await load(year), rowsView);
  if (readRoute === 'stats') return { stats: statsView(await load(year), year) };
  const writeRoute = calendarWriteRoute(p, m);
  if (writeRoute === 'entry') {
    const date = calendarEntryDate(b, unavailable);
    const action = await calendar.toggleCalendarEntry({
      familyId: s.familyId,
      personId: person(b.target_user_id),
      date,
      kind: b.kind === 'comp' ? 'school_break' : 'away',
    });
    map.clear();
    return { action };
  }
  if (writeRoute === 'company-holiday') {
    validateWholeCalendarDay(b, unavailable);
    const action = await calendar.toggleBlockedDate(s.familyId, String(b.date));
    map.clear();
    return { action };
  }
  if (writeRoute === 'stats') {
    const pid = person(b.target_user_id),
      rows = await calendar.listPtoYears(s.familyId, [year], [pid]),
      old = rows.find((row) => row.personId === pid),
      days = calendarEntitledDays(b, unavailable);

    await calendar.upsertPtoYear({
      familyId: s.familyId,
      personId: pid,
      year,
      entitledDays: days,
      carriedOver: calendarCarriedOver(old),
    });
    map.clear();
    return { stats: statsView(await load(year), year) };
  }
  if (writeRoute === 'color') {
    const color = calendarPersonColor(b, unavailable);
    await calendar.updatePersonColor(person(b.target_user_id), color);
    map.clear();
    return { success: true };
  }
  if (writeRoute === 'plan') {
    requireCalendarReviewer(reviewer);
    const patch = calendarPlanPatch(b, unavailable);
    await calendar.upsertCalendarSettings(s.familyId, patch);
    map.clear();
    return { plan: planView(await load(currentYear)) };
  }
  const remainingRoute = calendarRemainingRoute(p, m);
  if (remainingRoute === 'calendars') {
    requireCalendarReviewer(reviewer);
    if (b.type !== undefined && b.type !== 'public_holiday') unavailable();
    if (m === 'POST') {
      const row = await calendar.insertHolidayCalendar(
        s.familyId,
        b as { region: string; color?: string; label?: string }
      );
      map.clear();
      return { calendar: calendarView(row) };
    }
    const id = v.ids.uuid('holidayCalendar', p[2]);
    if (m === 'DELETE') await calendar.deleteHolidayCalendarRow(id);
    else if (m === 'PUT') await calendar.updateHolidayCalendarRow(id, b);
    else unavailable();
    map.clear();
    return { success: true };
  }
  if (remainingRoute === 'holidays') return holidayRequest(repo, request.signal, context, holidayLookup(holidays, p));
  unavailable();
}

function calendarEntries(
  row: calendarBackend.FamilyVacayYearLoad,
  rowsView: ReturnType<typeof calendarViews>['rowsView']
) {
  return { entries: rowsView(row), companyHolidays: row.blockedDates };
}

/** A public lookup still belongs to the initiating Family page/session. */
async function holidayRequest<T>(
  repo: FamilyFrontendRepository,
  caller: AbortSignal | undefined,
  context: ReturnType<FamilyFrontendRepository['captureContext']>,
  load: (signal: AbortSignal) => Promise<T>
) {
  const controller = new AbortController();
  const abort = () => controller.abort(caller?.reason ?? new DOMException('Aborted', 'AbortError'));
  caller?.addEventListener('abort', abort, { once: true });
  if (caller?.aborted) abort();
  const stop = repo.subscribeContext(() => {
    try {
      context.assertCurrent();
    } catch {
      controller.abort(new DOMException('Family holiday request retired.', 'AbortError'));
    }
  });
  try {
    return await context.perform(() => load(controller.signal));
  } finally {
    stop();
    caller?.removeEventListener('abort', abort);
  }
}

function holidayLookup(
  holidays: typeof holidayBackend,
  path: string[]
): (signal: AbortSignal) => Promise<holidayBackend.NagerCountry[] | holidayBackend.NagerPublicHoliday[]> {
  if (path.length === 2 && path[1] === 'countries')
    return (signal: AbortSignal) => holidays.fetchNagerCountries(signal);
  if (
    path.length === 3 &&
    /^\d{4}$/.test(path[1]) &&
    Number(path[1]) >= 1900 &&
    Number(path[1]) <= 2200 &&
    /^[A-Za-z]{2}$/.test(path[2])
  )
    return (signal: AbortSignal) => holidays.fetchNagerPublicHolidays(Number(path[1]), path[2], signal);
  throw new FamilyApiError(422, 'invalid_holiday_request', 'Choose a valid holiday country and calendar year.');
}
