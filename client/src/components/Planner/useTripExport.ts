import { useCallback, useEffect, useRef, useState } from 'react';
import { bindPdfPreview } from '../PDF/pdfPreviewScope';
import { saveBlob } from './exportDownloads';
import { captureStayAction } from './stayActionScope';
import { useExportJobs, type ExportJob } from './useExportJobs';
export { saveBlob } from './exportDownloads';
export type { ExportJob } from './useExportJobs';

import { useRoadtripSettings } from '../../hooks/useRoadtripSettings';
import { buildFamilyPlanIcs, familyPlanIcsFilename } from '../../integrations/family/legacy/lib/plan/familyPlanIcs';
import { openFamilyPlanPdfOverlay } from '../../integrations/family/legacy/lib/plan/familyPlanPdf';
import { loadFamilyPlanExport } from '../../integrations/family/planExport';
import { isFamilyFrontendActive } from '../../integrations/family/runtime';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { AssignmentsMap, Category, Day, DayNote, Place, Reservation, Trip } from '../../types';
import { importChunk } from '../../utils/chunkReload';
import type { ViasByDay } from '../../utils/dayRouteVias';
import type { TourStageStops } from '../Map/dayTourProjection';
import { hasPersonalPlan } from '../PDF/pdfScope';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** What a trip export prints, as both shells hold it. */
export interface TripExportData {
  trip: Trip | null;
  days: Day[];
  places: Place[];
  assignments: AssignmentsMap;
  categories: Category[];
  reservations: Reservation[];
  dayNotes: Record<string, DayNote[]>;
  /** The road trip's vias and the multi-day tour stages, so the PDF map routes what the planner map does. */
  viasByDay?: ViasByDay;
  tourStageStops?: TourStageStops;
}

/** How far the PDF's route map has got: legs answered or given up on, out of all of them. */
interface PdfRouting {
  done: number;
  total: number;
}

export interface TripExportOptions {
  tripId: number;
  /**
   * Whether the dialog or sheet is shown. Closing it, or leaving the trip, gives up a
   * PDF still routing: its legs stop going out and the document never opens.
   */
  open: boolean;
  data: TripExportData;
  t: Translate;
  locale: string;
  toast: { error: (message: string) => void; info: (message: string) => void };
  /**
   * The desktop runs one export at a time, so any running one holds every row; the
   * phone holds back only another PDF, calendar file or GPX file while the same kind
   * still runs.
   */
  exclusive: boolean;
  /** Runs once a calendar or GPX file is saved, and once the PDF is out when closeAfterPdf is set. */
  onExported: () => void;
  /** The phone prints no PDF until the trip has loaded; the desktop hands the PDF builder what it has. */
  requireTrip: boolean;
  /** The desktop closes after the PDF as well; the phone sheet stays open. */
  closeAfterPdf: boolean;
  /** The desktop also logs a failed PDF to the console. */
  logPdfErrors: boolean;
}

/** The day notes as one list, each carrying the day it belongs to. */
export function flatDayNotes(dayNotes: Record<string, DayNote[]>) {
  return Object.entries(dayNotes).flatMap(([dayId, notes]) => notes.map((n) => ({ ...n, day_id: Number(dayId) })));
}

const familyPdfCopy = (t: Translate) => ({
  travelPlan: t('pdf.travelPlan'),
  saveAsPdf: t('pdf.saveAsPdf'),
  emptyDay: t('dayplan.emptyDay'),
  dayN: (n: number) => t('dayplan.dayN', { n }),
});

/**
 * The PDF's routing round as the export rows show it. A cold month-long trip routes for
 * minutes, one leg a second against the shared router, so the row counts the legs and
 * offers to print without the ones still to come; those are marked in the document (#2876).
 */
function usePdfRouting(open: boolean) {
  const [progress, setProgress] = useState<PdfRouting | null>(null);
  const controller = useRef<{ routing: AbortController; job: AbortController } | null>(null);

  const start = () => {
    const routing = new AbortController();
    const running = { routing, job: new AbortController() };
    controller.current = running;
    // A leg already on its way still reports after a skip; the row stays quiet about it.
    const onProgress = (done: number, total: number) =>
      setProgress(!routing.signal.aborted && done < total ? { done, total } : null);
    return { signal: routing.signal, onProgress, givenUp: running.job.signal };
  };
  const finish = () => {
    controller.current = null;
    setProgress(null);
  };
  const skip = () => {
    controller.current?.routing.abort();
    setProgress(null);
  };
  // Unlike a skip, nobody is left to print for: the export ends without a document.
  const giveUp = useCallback(() => {
    controller.current?.routing.abort();
    controller.current?.job.abort();
  }, []);
  useEffect(() => {
    if (!open) giveUp();
  }, [open, giveUp]);
  useEffect(() => giveUp, [giveUp]);

  return { progress, start, finish, skip };
}

/**
 * Every way a trip leaves TREK, behind the desktop export dialog and the phone's
 * export sheet: the day plan as a PDF (the whole plan, or my plan once somebody
 * has been given a part of the trip, #2168), the bookings as an .ics file and the
 * map data as GPX.
 */
export function useTripExport({
  tripId,
  open,
  data,
  t,
  locale,
  toast,
  exclusive,
  onExported,
  requireTrip,
  closeAfterPdf,
  logPdfErrors,
}: TripExportOptions) {
  // Which export is working, per lane, so a row can say so instead of looking inert
  // while a 226 kB PDF builder is fetched and a document is rendered.
  const jobs = useExportJobs(tripId, exclusive);
  const pdfRouting = usePdfRouting(open);
  // The PDF is built outside React, so it cannot read these itself (#2066).
  const timeFormat = useSettingsStore((s) => s.settings.time_format) || '24h';
  const distanceUnit = useSettingsStore((s) => s.settings.distance_unit);
  // The export gets the store's assignments and applies the day plan's own filter to
  // them, so it needs the same switch the plan reads.
  const showServiceStops = useRoadtripSettings((s) => s.roadtrip_service_stops_in_days !== false, tripId);
  const myId = useAuthStore((s) => s.user?.id);
  const offerMine = myId != null && hasPersonalPlan(data.assignments, data.reservations);
  const fileBase = data.trip?.title || 'trip';

  const pdfRoutingLabel = (job: ExportJob) =>
    jobs.isRunning(job) && pdfRouting.progress ? t('dayplan.pdfRouting', { ...pdfRouting.progress }) : null;
  const exportPdf = async (mine = false) => {
    const job: ExportJob = mine ? 'pdf:mine' : 'pdf';
    const claimed = jobs.claim(job);
    if (!claimed) return;
    const { action, finish } = claimed;
    const preview = captureStayAction();
    if (isFamilyFrontendActive()) {
      try {
        if (mine || (requireTrip && !data.trip)) {
          action.effect(() => toast.error(t(mine ? 'settings.toast.nestOnly' : 'dayplan.pdfError')));
          return;
        }
        const input = await action.perform(() => loadFamilyPlanExport(tripId));
        action.effect(() => openFamilyPlanPdfOverlay(input, familyPdfCopy(t), locale));
        const overlay = document.getElementById('family-pdf-preview-overlay');
        if (overlay) bindPdfPreview(overlay, preview);
        if (closeAfterPdf) action.effect(() => onExported());
      } catch (e) {
        if (logPdfErrors && action.current()) console.error('PDF error:', e);
        action.effect(() => toast.error(`${t('dayplan.pdfError')}: ${e instanceof Error ? e.message : String(e)}`));
      } finally {
        finish();
      }
      return;
    }
    if (requireTrip && !data.trip) {
      finish();
      return;
    }
    const flatNotes = flatDayNotes(data.dayNotes);
    const { givenUp, ...routing } = pdfRouting.start();
    try {
      // Loaded on click: the PDF builder is ~226 kB, so every trip used to pay for it
      // whether or not anyone exported. A missing chunk lands in the catch and shows
      // the same error the export already had.
      const { downloadTripPDF } = await action.perform(() => importChunk(() => import('../PDF/TripPDF')));
      await action.perform(() =>
        downloadTripPDF({
          trip: data.trip,
          days: data.days,
          places: data.places,
          assignments: data.assignments,
          categories: data.categories,
          dayNotes: flatNotes,
          reservations: data.reservations,
          t,
          locale,
          timeFormat,
          distanceUnit,
          showServiceStops,
          onlyUserId: mine ? myId : undefined,
          route: { viasByDay: data.viasByDay, tourStageStops: data.tourStageStops, ...routing },
          signal: givenUp,
        })
      );
      if (closeAfterPdf && !givenUp.aborted) action.effect(() => onExported());
    } catch (e) {
      if (logPdfErrors && action.current()) console.error('PDF error:', e);
      action.effect(() => toast.error(`${t('dayplan.pdfError')}: ${e instanceof Error ? e.message : String(e)}`));
    } finally {
      pdfRouting.finish();
      finish();
    }
  };

  const downloadIcs = async () => {
    const claimed = jobs.claim('ics');
    if (!claimed) return;
    const { action, finish } = claimed;
    try {
      if (isFamilyFrontendActive()) {
        const input = await action.perform(() => loadFamilyPlanExport(tripId));
        const blob = new Blob([buildFamilyPlanIcs(input)], { type: 'text/calendar;charset=utf-8' });
        saveBlob(blob, familyPlanIcsFilename(input.tripTitle), action.assertCurrent);
      } else {
        const res = await action.perform(() => fetch(`/api/trips/${tripId}/export.ics`, { credentials: 'include' }));
        if (!res.ok) throw new Error();
        const blob = await action.perform(() => res.blob());
        saveBlob(blob, `${fileBase}.ics`, action.assertCurrent);
      }
      action.effect(onExported);
    } catch {
      action.effect(() => toast.error(t('planner.icsExportFailed')));
    } finally {
      finish();
    }
  };

  /** One GPX scope; `query` narrows what the file carries, empty for everything. */
  const downloadGpx = async (key: string, query: string) => {
    const claimed = jobs.claim(`gpx:${key}`);
    if (!claimed) return;
    const { action, finish } = claimed;
    try {
      if (isFamilyFrontendActive()) {
        action.effect(() => toast.error(t('settings.toast.nestOnly')));
        return;
      }
      const res = await action.perform(() =>
        fetch(`/api/trips/${tripId}/places/export.gpx${query}`, { credentials: 'include' })
      );
      // 404 means the selection is empty; preserve the native distinction.
      if (res.status === 404) {
        action.effect(() => toast.info(t('dayplan.gpxEmpty')));
        return;
      }
      if (!res.ok) throw new Error();
      const blob = await action.perform(() => res.blob());
      saveBlob(blob, `${fileBase}.gpx`, action.assertCurrent);
      action.effect(onExported);
    } catch {
      action.effect(() => toast.error(t('dayplan.gpxFailed')));
    } finally {
      finish();
    }
  };

  return {
    fileBase,
    offerMine,
    isRunning: jobs.isRunning,
    anyRunning: jobs.anyRunning,
    exportPdf,
    pdfRouting: pdfRouting.progress,
    pdfRoutingLabel,
    skipPdfRouting: pdfRouting.skip,
    downloadIcs,
    downloadGpx,
  };
}
