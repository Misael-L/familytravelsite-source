import { useEffect, useState } from 'react';
import {
  listFamilyBranches,
  listFamilyPeople,
  type FamilyBranch,
  type FamilyPerson,
} from '../../data/supabase/familyRoster';
import { escalateTripProposal, fetchProposalAudience } from '../../data/supabase/tripProposals';
import { useTranslation } from '../../i18n';
import Modal from '../shared/Modal';

type FamilyProposalEscalateModalProps = {
  isOpen: boolean;
  familyId: string;
  proposalId: string;
  onClose: () => void;
  onEscalated: () => void;
};

const inputCls =
  'w-full px-3 py-2.5 border border-edge rounded-lg text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-body';

export default function FamilyProposalEscalateModal({
  isOpen,
  familyId,
  proposalId,
  onClose,
  onEscalated,
}: FamilyProposalEscalateModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState<FamilyBranch[]>([]);
  const [people, setPeople] = useState<FamilyPerson[]>([]);
  const [audienceBranchIds, setAudienceBranchIds] = useState<string[]>([]);
  const [audiencePersonIds, setAudiencePersonIds] = useState<string[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSelectedBranchIds([]);
    setSelectedPersonIds([]);
    setNote('');
    Promise.all([listFamilyBranches(familyId), listFamilyPeople(familyId), fetchProposalAudience(proposalId)])
      .then(([branchRows, peopleRows, audience]) => {
        if (cancelled) return;
        setBranches(branchRows);
        setPeople(peopleRows);
        setAudienceBranchIds(audience.branchIds);
        setAudiencePersonIds(audience.personIds);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error && err.message ? err.message : t('dashboard.proposal.escalateError');
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, familyId, proposalId]);

  const candidateBranches = branches.filter((b) => !audienceBranchIds.includes(b.id));
  const candidatePeople = people.filter((p) => !audiencePersonIds.includes(p.personId));
  const canSubmit = selectedBranchIds.length > 0 || selectedPersonIds.length > 0;

  const toggle = (id: string, selected: string[], setSelected: (next: string[]) => void) => {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await escalateTripProposal({
        proposalId,
        branchIds: selectedBranchIds,
        personIds: selectedPersonIds,
        note,
      });
      onEscalated();
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : t('dashboard.proposal.escalateError');
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const rowCls = (on: boolean) =>
    `w-full flex items-center justify-between px-3 py-2 rounded-lg border text-body text-start ${
      on ? 'border-edge bg-surface-secondary' : 'border-edge hover:bg-surface-secondary'
    }`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dashboard.proposal.escalate')}
      size="md"
      footer={
        <div className="flex w-full justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-edge px-4 py-2 text-body text-content-muted hover:bg-surface-secondary hover:text-content"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || !canSubmit}
            className="rounded-lg bg-inverse px-4 py-2 text-body text-inverse-text hover:bg-inverse disabled:bg-surface-tertiary"
          >
            {busy ? t('common.saving') : t('dashboard.proposal.escalateSubmit')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-body text-content-muted">{t('dashboard.proposal.escalateHint')}</p>
        {error && <div className="rounded-lg border border-edge bg-danger-soft p-3 text-body text-danger">{error}</div>}
        {loading && <p className="text-caption text-content-muted">{t('common.loading')}</p>}

        <div>
          <h4 className="mb-2 text-body font-medium text-content">{t('dashboard.proposal.households')}</h4>
          {candidateBranches.length === 0 ? (
            <p className="text-caption text-content-muted">{t('dashboard.proposal.allHouseholdsIn')}</p>
          ) : (
            <ul className="space-y-1">
              {candidateBranches.map((branch) => {
                const on = selectedBranchIds.includes(branch.id);
                return (
                  <li key={branch.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggle(branch.id, selectedBranchIds, setSelectedBranchIds)}
                      className={rowCls(on)}
                    >
                      {branch.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-body font-medium text-content">{t('dashboard.proposal.invitePeople')}</h4>
          {candidatePeople.length === 0 ? (
            <p className="text-caption text-content-muted">{t('dashboard.proposal.noPeopleToInvite')}</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {candidatePeople.map((person) => {
                const on = selectedPersonIds.includes(person.personId);
                return (
                  <li key={person.personId}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggle(person.personId, selectedPersonIds, setSelectedPersonIds)}
                      className={rowCls(on)}
                    >
                      {person.displayName}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-body font-medium text-content">
            {t('dashboard.proposal.escalateNote')}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('dashboard.proposal.escalateNotePlaceholder')}
            rows={3}
            className={`${inputCls} resize-none`}
            disabled={busy}
          />
        </div>
      </div>
    </Modal>
  );
}
