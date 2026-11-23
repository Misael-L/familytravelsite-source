import type { TripJournalLinkMemberRequest, TripJournalLinkResponse } from '@trek/shared';
import { create } from 'zustand';
import { tripJournalLinkRepo } from '../repo/tripJournalLinkRepo';

/**
 * The journal each trip links, as this person may see it, remembered for the
 * session so the trip's Journal tab and its Settings dialog render the last
 * answer at once. Both read it from here, so the tab appears and goes the moment
 * the dialog links or unlinks, without a second request.
 */
interface TripJournalLinkState {
  /** Per trip id, the server's answer. Missing until asked. */
  byTrip: Record<string, TripJournalLinkResponse>;
  refresh: (tripId: number) => Promise<void>;
  link: (tripId: number, journeyId: number, members: TripJournalLinkMemberRequest[]) => Promise<void>;
  setMembers: (tripId: number, members: TripJournalLinkMemberRequest[]) => Promise<void>;
  unlink: (tripId: number) => Promise<void>;
  clear: () => void;
}

/** The answer for a trip someone cannot reach, or with the Journey addon off: no journal. */
const NONE: TripJournalLinkResponse = { link: null, can_link: false, can_unlink: false, can_edit_members: false };

export const useTripJournalLinkStore = create<TripJournalLinkState>((set) => {
  let generation = 0;
  const keep = (tripId: number, answer: TripJournalLinkResponse) =>
    set((s) => ({ byTrip: { ...s.byTrip, [String(tripId)]: answer } }));
  async function update(tripId: number, operation: Promise<TripJournalLinkResponse>) {
    const started = generation;
    const answer = await operation;
    if (started === generation) keep(tripId, answer);
  }

  return {
    byTrip: {},

    refresh: async (tripId) => {
      const started = generation;
      try {
        await update(tripId, tripJournalLinkRepo.get(tripId));
      } catch (err) {
        // 404 is the Journey addon switched off or a trip this person no longer
        // reaches: both a real "no journal". Anything else, offline included, is
        // no answer at all, and the last one stands.
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (started === generation && (status === 404 || status === 403)) keep(tripId, NONE);
      }
    },

    // The writes answer with the link as it now stands, so the tab and the
    // dialog move together; a failure is the caller's to report.
    link: (tripId, journeyId, members) => update(tripId, tripJournalLinkRepo.link(tripId, journeyId, members)),
    setMembers: (tripId, members) => update(tripId, tripJournalLinkRepo.setMembers(tripId, members)),
    unlink: (tripId) => update(tripId, tripJournalLinkRepo.unlink(tripId)),
    clear: () => {
      generation++;
      set({ byTrip: {} });
    },
  };
});
