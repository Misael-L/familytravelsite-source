import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import type { CalendarChange } from '../../../src/integrations/family/plannerCalendarContract';
import { server } from '../msw/server';
import { fakeDayRemoval, removalSetup } from './calendar';
import { load, required } from './core';
import { arrangementRows } from './planning';
import {
  arrangementRemoved,
  at,
  attachedFiles,
  attachmentHistory,
  bookingHistory,
  calendarResults,
  cohortState,
  contentHistory,
  contentNotes,
  db,
  family,
  trip,
  uuid,
} from './state';

export function fakeDayContents(args: Record<string, unknown>) {
  const p = args.p_change as CalendarChange,
    key = String(args.p_operation_id),
    seen = calendarResults.has(key),
    before = structuredClone(required(cohortState.calendarData));
  if (cohortState.contentGuard && !seen)
    return {
      data: null,
      error: {
        code: ['file-permission', 'booking-permission'].includes(cohortState.contentGuard)
          ? '42501'
          : cohortState.contentGuard === 'armed-file'
            ? 'PT409'
            : '0A000',
        message: 'Protected ' + cohortState.contentGuard + ' recovery is not available',
      },
    };
  const children = arrangementRows()
    .filter((v) => (p.action === 'trash_day' || p.action === 'restore_day') && v.trip_day_id === p.day_id)
    .map((v) => ({ id: v.id, hidden: arrangementRemoved.has(v.id) }));
  const selected = p.action === 'trash_day' ? before.days.find((d) => d.id === p.day_id) : undefined;
  const held = selected ? contentNotes.filter((n) => n.civil_day === selected.civil_day) : [];
  const answer = fakeDayRemoval(args, true);
  if (!seen && calendarResults.has(key)) {
    if (p.action === 'trash_day') {
      bookingHistory.set(key, structuredClone(cohortState.bookingRows));
      cohortState.bookingRows = cohortState.bookingRows.map((row) => {
        const next = structuredClone(row),
          days = required(cohortState.calendarData).days;
        for (const end of ['start', 'end'] as const) {
          const beforeId = row.dates[`${end}_day_id`];
          const id = beforeId ? (days.find((d) => d.civil_day === row.dates[`${end}_date`])?.id ?? null) : null;
          next.dates[`${end}_day_id`] = id;
          next.record[`${end}_trip_day_id`] = id;
        }
        return next;
      });
      contentHistory.set(key, {
        visits: children,
        notes: structuredClone(held),
        otherDates: new Map(contentNotes.filter((n) => !held.includes(n)).map((n) => [n.id, n.civil_day])),
      });
      attachmentHistory.set(
        key,
        structuredClone(attachedFiles.flatMap((f) => f.links.filter((l) => l.tripDayId === p.day_id)))
      );
      for (const f of attachedFiles) f.links = f.links.filter((l) => l.tripDayId !== p.day_id);
      for (const v of children) arrangementRemoved.add(v.id);
      const remaining = contentNotes
        .filter((n) => !held.includes(n))
        .map((n) => {
          const id = before.days.find((d) => d.civil_day === n.civil_day)?.id,
            date = required(cohortState.calendarData).days.find((d) => d.id === id)?.civil_day;
          return { ...n, civil_day: date ?? n.civil_day };
        });
      contentNotes.splice(0, contentNotes.length, ...remaining);
    } else if (p.action === 'restore_day') {
      const h = required(contentHistory.get(p.operation_id));
      cohortState.bookingRows = structuredClone(bookingHistory.get(p.operation_id) ?? []);
      const links = attachmentHistory.get(p.operation_id) ?? [];
      for (const f of attachedFiles) f.links.push(...structuredClone(links.filter((l) => l.fileId === f.id)));
      for (const v of h.visits) if (!v.hidden) arrangementRemoved.delete(v.id);
      const next = contentNotes.map((n) => ({ ...n, civil_day: h.otherDates.get(n.id) ?? n.civil_day }));
      contentNotes.splice(0, contentNotes.length, ...next, ...structuredClone(h.notes));
    }
  }
  return answer;
}

export async function contentSetup() {
  const v = await removalSetup();
  contentNotes.push(
    {
      id: uuid(9100),
      trip_id: trip,
      civil_day: '2027-04-01',
      body: 'Original **family** note\nSecond line',
      icon: 'heart',
      sort_order: 7,
      created_at: at,
      updated_at: at,
    },
    {
      id: uuid(9101),
      trip_id: trip,
      civil_day: '2027-04-02',
      body: 'Other day note',
      icon: null,
      sort_order: 1,
      created_at: at,
      updated_at: at,
    }
  );
  await load();
  return v;
}

export async function fileSetup() {
  const v = await contentSetup();
  const path = family + '/' + trip + '/' + uuid(9400) + '_original.txt';
  attachedFiles.push({
    id: uuid(9400),
    tripId: trip,
    storagePath: path,
    originalName: 'Original document.txt',
    mimeType: 'text/plain',
    sizeBytes: 14,
    uploadedBy: cohortState.session.personId,
    starred: true,
    description: 'Independent document',
    deletedAt: null,
    createdAt: at,
    links: [
      { id: uuid(9401), fileId: uuid(9400), placeId: null, reservationId: null, tripDayId: v.order[0] },
      { id: uuid(9402), fileId: uuid(9400), placeId: null, reservationId: null, tripDayId: v.order[1] },
    ],
  });
  vi.spyOn(cohortState.repo.readers.files, 'listTripFiles').mockImplementation(async (id, opts) =>
    structuredClone(attachedFiles.filter((f) => f.tripId === id && Boolean(f.deletedAt) === Boolean(opts?.trash)))
  );
  const signed = vi
    .spyOn(cohortState.repo.readers.files, 'signedTripFileUrl')
    .mockResolvedValue('https://fixture.invalid/original-day-file');
  server.use(http.get('https://fixture.invalid/original-day-file', () => new HttpResponse('original bytes')));
  await load();
  const nativeFile = (await cohortState.repo.views()).ids.register('file', uuid(9400));
  return { ...v, nativeFile, signed, path };
}

export async function fileLinks(file: number) {
  return (await cohortState.client.get('/trips/' + trip + '/files/' + file + '/links')).data.links as {
    id: number;
    day_id: number;
  }[];
}

export function bookingFixture(
  fields: Partial<import('../../../src/integrations/family/plannerBookingContract').PlannerBookingRow['record']> = {}
): import('../../../src/integrations/family/plannerBookingContract').PlannerBookingRow {
  const record = {
    id: uuid(9700),
    trip_id: trip,
    type: 'restaurant',
    status: 'confirmed' as const,
    title: 'Retained booking',
    start_trip_day_id: null,
    end_trip_day_id: null,
    starts_at: null,
    ends_at: null,
    confirmation_code: 'KEEP-123',
    notes: 'Independent booking notes',
    url: null,
    place_id: null,
    hotel_id: null,
    schedule_item_id: null,
    metadata: {},
    sort_order: 0,
    created_at: at,
    ...fields,
  };
  return {
    record,
    dates: {
      reservation_id: record.id,
      trip_id: record.trip_id,
      revision: 1,
      start_date: record.start_trip_day_id
        ? (cohortState.calendarData?.days.find((d) => d.id === record.start_trip_day_id)?.civil_day ?? null)
        : null,
      end_date: record.end_trip_day_id
        ? (cohortState.calendarData?.days.find((d) => d.id === record.end_trip_day_id)?.civil_day ?? null)
        : null,
      start_day_id: record.start_trip_day_id,
      end_day_id: record.end_trip_day_id,
    },
    visit_state: record.schedule_item_id ? 'active' : 'none',
    endpoints: [],
    legs: [],
  };
}

export function installBookingDetailBoundary() {
  const previous = required(db.rpc.getMockImplementation()),
    saved = new Map<string, unknown>();
  db.rpc.mockImplementation(async (name, args) => {
    if (!['get_family_booking_details_v1', 'save_family_booking_details_v1'].includes(name))
      return previous(name, args);
    const row = required(cohortState.bookingRows.find((r) => r.record.id === args.p_reservation_id));
    if (name === 'get_family_booking_details_v1')
      return {
        data: {
          version: 1,
          trip_id: trip,
          family_id: family,
          user_id: cohortState.session.userId,
          person_id: cohortState.session.personId,
          observation: structuredClone({ record: row.record, dates: row.dates }),
        },
        error: null,
      };
    if (name === 'save_family_booking_details_v1') {
      if (!saved.has(args.p_operation_id)) {
        const changes =
          args.p_changes as import('../../../src/integrations/family/bookingDetailsContract').BookingDetailPacket['changes'];
        Object.assign(row.record, Object.fromEntries(Object.entries(changes).filter(([k]) => k !== 'dates')));
        if (changes.dates) row.dates = { ...row.dates, ...changes.dates, revision: row.dates.revision + 1 };
        if (cohortState.calendarData) cohortState.calendarData.trip_revision++;
        saved.set(args.p_operation_id, {
          version: 1,
          state: 'published',
          operation_id: args.p_operation_id,
          trip_id: trip,
          reservation_id: row.record.id,
          changed: true,
          dates: structuredClone(row.dates),
        });
      }
      return { data: saved.get(args.p_operation_id), error: null };
    }
    return previous(name, args);
  });
  return saved;
}
