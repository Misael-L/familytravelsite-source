import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { journeyApi } from '../../api/client';
import { isSupabaseDataPlane } from '../../data/supabase/auth';
import { linkFamilyJourneyTrip, listFamilyJourneyAvailableTrips } from '../../data/supabase/journeys';
import { useTranslation } from '../../i18n';
import { pickGradient } from '../../pages/journeyDetail/JourneyDetailPage.helpers';
import { useAuthStore } from '../../store/authStore';
import type { JourneyEntityId } from '../../store/journeyStore';
import { useToast } from '../shared/Toast';

type AvailableTrip = {
  id: JourneyEntityId;
  title: string;
  destination?: string;
  start_date?: string | null;
  end_date?: string | null;
};

function sameId(a: JourneyEntityId, b: JourneyEntityId): boolean {
  return String(a) === String(b);
}

export function AddTripDialog({
  journeyId,
  existingTripIds,
  onClose,
  onAdded,
}: {
  journeyId: JourneyEntityId;
  existingTripIds: JourneyEntityId[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [trips, setTrips] = useState<AvailableTrip[]>([]);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<JourneyEntityId | null>(null);
  const toast = useToast();
  const familyPlane = isSupabaseDataPlane();

  useEffect(() => {
    if (familyPlane) {
      const familyId = useAuthStore.getState().familyId;
      if (!familyId) {
        setTrips([]);
        return;
      }
      listFamilyJourneyAvailableTrips(familyId, String(journeyId))
        .then((rows) => setTrips(rows.filter((r) => !r.linked)))
        .catch(() => {});
      return;
    }
    journeyApi
      .availableTrips()
      .then((d) => setTrips(d.trips || []))
      .catch(() => {});
  }, [familyPlane, journeyId]);

  const filtered = trips.filter((trip) => {
    if (existingTripIds.some((id) => sameId(id, trip.id))) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return trip.title.toLowerCase().includes(q) || (trip.destination || '').toLowerCase().includes(q);
  });

  const handleAdd = async (tripId: JourneyEntityId) => {
    setAdding(tripId);
    try {
      if (familyPlane) {
        await linkFamilyJourneyTrip(String(journeyId), String(tripId));
      } else {
        await journeyApi.addTrip(journeyId as number, tripId as number);
      }
      toast.success(t('journey.trips.tripLinked'));
      onAdded();
    } catch {
      toast.error(t('journey.trips.linkFailed'));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(9,9,11,0.75)] p-5">
      <div className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(0,0,0,0.2)] dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-[16px] font-bold text-zinc-900 dark:text-white">{t('journey.trips.linkTrip')}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              {t('journey.trips.searchTrip')}
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('journey.trips.searchPlaceholder')}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-zinc-500"
            />
          </div>

          <div className="flex max-h-[280px] flex-col gap-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-[12px] text-zinc-400">{t('journey.trips.noTripsAvailable')}</p>
            )}
            {filtered.map((trip) => (
              <div
                key={String(trip.id)}
                className="flex items-center gap-2.5 rounded-lg border border-transparent p-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <div className="h-9 w-9 flex-shrink-0 rounded-md" style={{ background: pickGradient(trip.id) }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-zinc-900 dark:text-white">{trip.title}</div>
                  {(trip.destination || trip.start_date) && (
                    <div className="truncate text-[11px] text-zinc-500">
                      {trip.destination}
                      {trip.destination && trip.start_date ? ' · ' : ''}
                      {trip.start_date}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleAdd(trip.id)}
                  disabled={adding != null && sameId(adding, trip.id)}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {adding != null && sameId(adding, trip.id) ? '...' : t('journey.trips.link')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
