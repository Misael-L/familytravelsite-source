import { useTranslation } from '../../i18n';
import { useState } from 'react';
import { isCivilDate } from '@family/backend/lib/civilDate';
import { CustomDatePicker } from '../../components/shared/CustomDateTimePicker';
import Modal from '../../components/shared/Modal';
import { currentPlannerCalendarPort } from '../../repo/plannerCalendarPort';
import { useTripStore } from '../../store/tripStore';
import { useCanDo } from '../../store/permissionsStore';
import { isFamilyFrontendActive } from './runtime';

/** Assign dates to the existing relative itinerary; never rebuild its days. */
export function FamilyTripDatesControl() {
  const trip = useTripStore((s) => s.trip), days = useTripStore((s) => s.days);
  const { t } = useTranslation();
  const can = useCanDo();
  const allowed = can('trip_assign_dates', trip) && can('day_edit', trip);
  const [open, setOpen] = useState(false), [start, setStart] = useState('');
  const [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false);
  const [error, setError] = useState('');
  if (!isFamilyFrontendActive() || !trip || trip.start_date || trip.end_date || !days.length) return null;
  const candidate = isCivilDate(start)
    ? new Date(Date.parse(start + 'T00:00:00Z') + (days.length - 1) * 86400000).toISOString().slice(0, 10) : null;
  const end = candidate && isCivilDate(candidate) && candidate <= '9999-12-31' ? candidate : null;
  const save = async () => {
    if (!end || busy) return;
    setBusy(true); setAttempted(true); setError('');
    try {
      const calendar = currentPlannerCalendarPort();
      if (!calendar) throw new Error(t('planner.reloadDates'));
      await calendar.extendTrip(trip.id, { start_date: start, end_date: end });
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('planner.saveDatesError'));
    } finally { setBusy(false); }
  };
  return <>
    <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2 text-caption">
      <span>{t('planner.relativeDays', { count: days.length })}</span>
      {allowed && <button type="button" onClick={() => setOpen(true)} className="font-semibold text-content">{t('planner.chooseDates')}</button>}
    </div>
    <Modal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title={t('planner.chooseTripDates')} size="sm"
      footer={<button type="button" disabled={!end || busy} onClick={() => void save()} className="rounded-lg bg-inverse px-4 py-2 text-inverse-text disabled:opacity-50">{busy ? t('common.saving') : attempted && error ? t('planner.retryDateSave') : t('planner.saveDates')}</button>}>
      <p className="mb-4 text-body text-content-muted">{t('planner.relativeDatesHelp', { count: days.length })}</p>
      <CustomDatePicker value={start} onChange={setStart} disabled={busy || attempted} ariaLabel={t('planner.tripStartDate')} />
      {end && <p className="mt-3 text-caption">{t('planner.assignedEnd', { date: end })}</p>}
      {error && <p role="alert" className="mt-3 text-caption text-danger">{error}</p>}
    </Modal>
  </>;
}
