import { useEffect, useState } from 'react';
import { listCountriesByIds } from '../../data/supabase/catalogCountries';
import { listPlacesByIds } from '../../data/supabase/catalogPlaces';
import { listMyCatalogSavesInCountries, type CatalogSaveHint } from '../../data/supabase/catalogSaves';
import { listFamilyPeople, type FamilyPerson } from '../../data/supabase/familyRoster';
import {
  VOTE_CHOICES,
  canDecideProposal,
  canEscalateProposal,
  castProposalVote,
  decideTripProposal,
  fetchEligibleVoters,
  fetchProposalVotes,
  fetchTripProposal,
  fetchTripProposalEditSource,
  isAdvisoryAllNoConfirmRequired,
  tallyProposalVotes,
  type EligibleVoter,
  type OpenTripProposal,
  type ProposalTally,
  type ProposalVote,
  type TripProposalEditSource,
  type VoteChoice,
} from '../../data/supabase/tripProposals';
import { useTranslation } from '../../i18n';
import ConfirmDialog from '../shared/ConfirmDialog';
import Modal from '../shared/Modal';
import FamilyProposalEscalateModal from './FamilyProposalEscalateModal';
import FamilyProposalHintChips from './FamilyProposalHintChips';

type FamilyProposalVoteModalProps = {
  isOpen: boolean;
  proposalId: string | null;
  familyId: string | null;
  personId: string | null;
  onClose: () => void;
  onDecided: (accepted: boolean) => void;
};

const chipCls = (on: boolean) =>
  `flex-1 px-3 py-2 text-body font-medium rounded-lg border transition-colors ${
    on ? 'bg-inverse text-inverse-text border-edge' : 'bg-surface-card text-content-muted border-edge hover:border-edge'
  }`;

export default function FamilyProposalVoteModal({
  isOpen,
  proposalId,
  familyId,
  personId,
  onClose,
  onDecided,
}: FamilyProposalVoteModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<OpenTripProposal | null>(null);
  const [source, setSource] = useState<TripProposalEditSource | null>(null);
  const [countryNames, setCountryNames] = useState<string[]>([]);
  const [placeNames, setPlaceNames] = useState<string[]>([]);
  const [votes, setVotes] = useState<ProposalVote[]>([]);
  const [eligible, setEligible] = useState<EligibleVoter[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [canEscalate, setCanEscalate] = useState(false);
  const [roster, setRoster] = useState<FamilyPerson[]>([]);
  const [showEscalate, setShowEscalate] = useState(false);
  const [showAdvisoryConfirm, setShowAdvisoryConfirm] = useState(false);
  const [savedHints, setSavedHints] = useState<CatalogSaveHint[]>([]);

  const load = async (id: string) => {
    const [row, voteRows, voters, decide, escalate] = await Promise.all([
      fetchTripProposal(id),
      fetchProposalVotes(id),
      fetchEligibleVoters(id),
      canDecideProposal(id),
      canEscalateProposal(id),
    ]);
    setProposal(row);
    setVotes(voteRows);
    setEligible(voters);
    setCanDecide(decide);
    setCanEscalate(escalate);
    if (!row?.tripId) {
      setSource(null);
      setCountryNames([]);
      setPlaceNames([]);
      setSavedHints([]);
      return;
    }
    const trip = await fetchTripProposalEditSource(row.tripId);
    setSource(trip);
    if (!trip) {
      setCountryNames([]);
      setPlaceNames([]);
      setSavedHints([]);
      return;
    }
    const [countries, places, hints] = await Promise.all([
      listCountriesByIds(trip.countryIds),
      listPlacesByIds(trip.placeIds),
      familyId && personId && trip.countryIds.length > 0
        ? listMyCatalogSavesInCountries({ familyId, countryIds: trip.countryIds }).catch(() => [] as CatalogSaveHint[])
        : Promise.resolve([] as CatalogSaveHint[]),
    ]);
    setCountryNames(countries.map((c) => c.name));
    setPlaceNames(places.map((p) => p.name));
    setSavedHints(hints);
  };

  useEffect(() => {
    if (!isOpen || !proposalId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setShowEscalate(false);
    setShowAdvisoryConfirm(false);
    Promise.all([
      load(proposalId),
      familyId ? listFamilyPeople(familyId).catch(() => [] as FamilyPerson[]) : Promise.resolve([] as FamilyPerson[]),
    ])
      .then(([, people]) => {
        if (cancelled) return;
        setRoster(people);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error && err.message ? err.message : t('dashboard.proposal.unavailable');
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, proposalId, familyId, personId]);

  const isOpenStatus = proposal?.status === 'submitted' || proposal?.status === 'in_review';
  const tally: ProposalTally = tallyProposalVotes(votes, eligible);
  const myVote = personId ? (votes.find((v) => v.voterPersonId === personId)?.vote ?? null) : null;
  const proposerName =
    roster.find((p) => p.personId === proposal?.proposedByPersonId)?.displayName ??
    (proposal?.proposedByPersonId === personId ? t('dashboard.propose.you') : '');

  const handleCast = async (vote: VoteChoice) => {
    if (!proposalId || !personId) return;
    setBusy(true);
    setError('');
    try {
      await castProposalVote(proposalId, vote);
      await load(proposalId);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : t('dashboard.proposal.voteError');
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleDecide = async (accept: boolean, confirmAdvisoryAllNo = false) => {
    if (!proposalId) return;
    setBusy(true);
    setError('');
    try {
      await decideTripProposal({ proposalId, accept, confirmAdvisoryAllNo });
      setShowAdvisoryConfirm(false);
      onDecided(accept);
    } catch (err: unknown) {
      if (accept && !confirmAdvisoryAllNo && isAdvisoryAllNoConfirmRequired(err)) {
        setShowAdvisoryConfirm(true);
        setError('');
      } else {
        const message = err instanceof Error && err.message ? err.message : t('dashboard.proposal.decideError');
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const statusKey =
    proposal?.status === 'in_review' ? 'dashboard.proposal.status.in_review' : 'dashboard.proposal.status.submitted';

  const tallyCopy =
    tally.decidingEligible === 0
      ? t('dashboard.proposal.tallyEmpty')
      : tally.majorityYes
        ? t('dashboard.proposal.tallyMajority', { yes: tally.decidingYes, eligible: tally.decidingEligible })
        : t('dashboard.proposal.tallyNeed', {
            need: tally.decidingNeed,
            eligible: tally.decidingEligible,
            decided: tally.decided,
          });

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t('dashboard.proposal.title')} size="lg">
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-edge bg-danger-soft p-3 text-body text-danger">{error}</div>
          )}
          {loading && <p className="text-caption text-content-muted">{t('common.loading')}</p>}
          {!loading && !proposal && (
            <p className="text-body text-content-muted">{t('dashboard.proposal.unavailable')}</p>
          )}
          {proposal && (
            <>
              <div>
                <h3 className="text-subtitle font-semibold text-content">{proposal.title}</h3>
                {proposerName && (
                  <p className="mt-1 text-caption text-content-muted">
                    {t('dashboard.proposal.proposedBy', { name: proposerName })}
                  </p>
                )}
                <span className="mt-2 inline-block rounded-full bg-surface-secondary px-2.5 py-0.5 text-caption font-semibold text-content">
                  {t(statusKey)}
                </span>
              </div>

              {(source?.startDate || countryNames.length > 0) && (
                <dl className="grid grid-cols-1 gap-2 text-body">
                  {source?.startDate && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-content-muted">{t('dashboard.startDate')}</dt>
                      <dd className="text-content">
                        {source.startDate}
                        {source.endDate ? ` – ${source.endDate}` : ''}
                      </dd>
                    </div>
                  )}
                  {countryNames.length > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-content-muted">{t('dashboard.propose.step.countries')}</dt>
                      <dd className="text-end text-content">{countryNames.join(', ')}</dd>
                    </div>
                  )}
                </dl>
              )}
              <FamilyProposalHintChips hints={savedHints} />
              {(placeNames.length > 0 || source?.notes) && (
                <dl className="grid grid-cols-1 gap-2 text-body">
                  {placeNames.length > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-content-muted">{t('dashboard.propose.step.cities')}</dt>
                      <dd className="text-end text-content">{placeNames.join(', ')}</dd>
                    </div>
                  )}
                  {source?.notes && <p className="text-body text-content-muted">{source.notes}</p>}
                </dl>
              )}

              <div>
                <h4 className="mb-2 text-body font-medium text-content">{t('dashboard.proposal.votes')}</h4>
                <div className="mb-2 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-title font-semibold text-success">{tally.decidingYes}</p>
                    <p className="text-caption text-content-muted">{t('dashboard.proposal.yes')}</p>
                  </div>
                  <div>
                    <p className="text-title font-semibold text-danger">{tally.decidingNo}</p>
                    <p className="text-caption text-content-muted">{t('dashboard.proposal.no')}</p>
                  </div>
                  <div>
                    <p className="text-title font-semibold text-content-muted">{tally.decidingAbstain}</p>
                    <p className="text-caption text-content-muted">{t('dashboard.proposal.abstain')}</p>
                  </div>
                </div>
                <p className="text-caption text-content-muted">{tallyCopy}</p>
                {tally.advisoryYes + tally.advisoryNo + tally.advisoryAbstain > 0 && (
                  <p className="mt-1 text-caption text-content-muted">
                    {t('dashboard.proposal.advisorySummary', {
                      yes: tally.advisoryYes,
                      no: tally.advisoryNo,
                      abstain: tally.advisoryAbstain,
                    })}
                  </p>
                )}
                {votes.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {votes.map((vote) => (
                      <li key={vote.id} className="flex items-center gap-2 text-body">
                        <span className="text-content">
                          {vote.voterPersonId === personId ? t('dashboard.propose.you') : vote.voterName}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-caption font-semibold ${
                            vote.voteRole === 'deciding'
                              ? 'bg-surface-secondary text-content'
                              : 'bg-surface-secondary text-content-muted'
                          }`}
                        >
                          {t(
                            vote.voteRole === 'deciding' ? 'dashboard.proposal.deciding' : 'dashboard.proposal.advisory'
                          )}
                        </span>
                        <span className="ms-auto text-content-muted">
                          {vote.vote === 'yes'
                            ? t('dashboard.proposal.yes')
                            : vote.vote === 'no'
                              ? t('dashboard.proposal.no')
                              : t('dashboard.proposal.abstain')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {isOpenStatus && (
                <div>
                  <h4 className="mb-2 text-body font-medium text-content">{t('dashboard.proposal.yourVote')}</h4>
                  <div className="flex gap-2">
                    {VOTE_CHOICES.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        disabled={busy || !personId}
                        onClick={() => void handleCast(choice)}
                        className={chipCls(myVote === choice)}
                      >
                        {choice === 'yes'
                          ? t('dashboard.proposal.yes')
                          : choice === 'no'
                            ? t('dashboard.proposal.no')
                            : t('dashboard.proposal.abstain')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isOpenStatus && canEscalate && familyId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowEscalate(true)}
                  className="w-full rounded-lg border border-edge px-4 py-2 text-body text-content hover:bg-surface-secondary disabled:opacity-40"
                >
                  {t('dashboard.proposal.escalate')}
                </button>
              )}

              {isOpenStatus && canDecide && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDecide(true)}
                    className="flex-1 rounded-lg bg-success px-4 py-2 text-body text-inverse-text hover:bg-success disabled:bg-surface-tertiary"
                  >
                    {t('dashboard.proposal.approve')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDecide(false)}
                    className="flex-1 rounded-lg bg-danger px-4 py-2 text-body text-inverse-text hover:bg-danger disabled:bg-surface-tertiary"
                  >
                    {t('dashboard.proposal.reject')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {showEscalate && familyId && proposalId && (
        <FamilyProposalEscalateModal
          isOpen={showEscalate}
          familyId={familyId}
          proposalId={proposalId}
          onClose={() => setShowEscalate(false)}
          onEscalated={() => {
            setShowEscalate(false);
            if (proposalId) void load(proposalId);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={showAdvisoryConfirm}
        onClose={() => setShowAdvisoryConfirm(false)}
        onConfirm={() => {
          void handleDecide(true, true);
        }}
        title={t('dashboard.proposal.advisoryConfirmTitle')}
        message={t('dashboard.proposal.advisoryConfirmBody')}
        confirmLabel={t('dashboard.proposal.advisoryConfirm')}
        danger={false}
      />
    </>
  );
}
