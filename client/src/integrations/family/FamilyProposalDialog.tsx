import { useEffect, useEffectEvent, useState } from 'react';
import { useToast } from '../../components/shared/Toast';
import type { Trip } from '../../types';
import FamilyProposalVoteModal from './legacy/components/Trips/FamilyProposalVoteModal';
import FamilyProposeTripModal from './legacy/components/Trips/FamilyProposeTripModal';
import {
  hubPencilAction,
  indexOpenProposalsByTripId,
  listOpenTripProposals,
} from './legacy/data/supabase/tripProposals';
import { TranslationProvider, useTranslation } from './legacy/i18n';
import { familyAuthStore, familyFrontend } from './repository';
export function FamilyProposalDialog(props: { open: boolean; trip?: Pick<Trip, 'id'> | null; onClose: () => void }) {
  return (
    <TranslationProvider>
      <ProposalDialog {...props} />
    </TranslationProvider>
  );
}
function ProposalDialog({
  open,
  trip,
  onClose,
}: {
  open: boolean;
  trip?: Pick<Trip, 'id'> | null;
  onClose: () => void;
}) {
  const familyId = familyAuthStore((s) => s.familyId),
    personId = familyAuthStore((s) => s.personId);
  const [action, setAction] = useState<{
    kind: 'create' | 'edit' | 'vote';
    proposalId?: string;
    tripId?: string;
  } | null>(null);
  const toast = useToast(),
    { t } = useTranslation();
  const tripId = trip?.id;
  const reportPublished = useEffectEvent(() => {
    toast.error(t('dashboard.toast.editPublished'));
    onClose();
  });
  const reportFailure = useEffectEvent((error: unknown) => {
    toast.error(error instanceof Error ? error.message : t('common.unknownError'));
    onClose();
  });
  useEffect(() => {
    let alive = true;
    setAction(null);
    if (!open || !familyId) return;
    if (tripId == null) {
      setAction({ kind: 'create' });
      return;
    }
    void familyFrontend
      .tripUuid(tripId)
      .then(async (tripId) => {
        if (!alive) return;
        const proposals = await listOpenTripProposals(familyId);
        const next = hubPencilAction(tripId, personId, indexOpenProposalsByTripId(proposals));
        if (!alive) return;
        if (next.kind === 'published') {
          reportPublished();
          return;
        }
        setAction({ ...next, tripId });
      })
      .catch((error) => {
        if (alive) reportFailure(error);
      });
    return () => {
      alive = false;
    };
  }, [open, tripId, familyId, personId]);
  const submitted = () => {
    window.dispatchEvent(new CustomEvent('family:trips-changed'));
    onClose();
  };
  if (!open || !action) return null;
  return action.kind === 'vote' ? (
    <FamilyProposalVoteModal
      isOpen
      proposalId={action.proposalId!}
      familyId={familyId}
      personId={personId}
      onClose={onClose}
      onDecided={submitted}
    />
  ) : (
    <FamilyProposeTripModal
      isOpen
      familyId={familyId}
      personId={personId}
      editingProposalId={action.proposalId}
      editingTripId={action.tripId}
      onClose={onClose}
      onSubmitted={submitted}
    />
  );
}
