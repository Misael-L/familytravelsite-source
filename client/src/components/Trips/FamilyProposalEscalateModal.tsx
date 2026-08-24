import { useEffect, useState } from 'react'
import Modal from '../shared/Modal'
import { useTranslation } from '../../i18n'
import { listFamilyBranches, listFamilyPeople, type FamilyBranch, type FamilyPerson } from '../../data/supabase/familyRoster'
import { escalateTripProposal, fetchProposalAudience } from '../../data/supabase/tripProposals'

type FamilyProposalEscalateModalProps = {
  isOpen: boolean
  familyId: string
  proposalId: string
  onClose: () => void
  onEscalated: () => void
}

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent text-sm'

export default function FamilyProposalEscalateModal({
  isOpen,
  familyId,
  proposalId,
  onClose,
  onEscalated,
}: FamilyProposalEscalateModalProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [branches, setBranches] = useState<FamilyBranch[]>([])
  const [people, setPeople] = useState<FamilyPerson[]>([])
  const [audienceBranchIds, setAudienceBranchIds] = useState<string[]>([])
  const [audiencePersonIds, setAudiencePersonIds] = useState<string[]>([])
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([])
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([])
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    setError('')
    setSelectedBranchIds([])
    setSelectedPersonIds([])
    setNote('')
    Promise.all([
      listFamilyBranches(familyId),
      listFamilyPeople(familyId),
      fetchProposalAudience(proposalId),
    ]).then(([branchRows, peopleRows, audience]) => {
      if (cancelled) return
      setBranches(branchRows)
      setPeople(peopleRows)
      setAudienceBranchIds(audience.branchIds)
      setAudiencePersonIds(audience.personIds)
    }).catch((err: unknown) => {
      if (cancelled) return
      const message = err instanceof Error && err.message ? err.message : t('dashboard.proposal.escalateError')
      setError(message)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [isOpen, familyId, proposalId])

  const candidateBranches = branches.filter(b => !audienceBranchIds.includes(b.id))
  const candidatePeople = people.filter(p => !audiencePersonIds.includes(p.personId))
  const canSubmit = selectedBranchIds.length > 0 || selectedPersonIds.length > 0

  const toggle = (id: string, selected: string[], setSelected: (next: string[]) => void) => {
    setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      await escalateTripProposal({
        proposalId,
        branchIds: selectedBranchIds,
        personIds: selectedPersonIds,
        note,
      })
      onEscalated()
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : t('dashboard.proposal.escalateError')
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const rowCls = (on: boolean) =>
    `w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm text-left ${
      on ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
    }`

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dashboard.proposal.escalate')}
      size="md"
      footer={(
        <div className="flex justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || !canSubmit}
            className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-lg"
          >
            {busy ? t('common.saving') : t('dashboard.proposal.escalateSubmit')}
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{t('dashboard.proposal.escalateHint')}</p>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
        )}
        {loading && <p className="text-xs text-slate-400">{t('common.loading')}</p>}

        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">{t('dashboard.proposal.households')}</h4>
          {candidateBranches.length === 0 ? (
            <p className="text-xs text-slate-400">{t('dashboard.proposal.allHouseholdsIn')}</p>
          ) : (
            <ul className="space-y-1">
              {candidateBranches.map(branch => {
                const on = selectedBranchIds.includes(branch.id)
                return (
                  <li key={branch.id}>
                    <button type="button" disabled={busy} onClick={() => toggle(branch.id, selectedBranchIds, setSelectedBranchIds)} className={rowCls(on)}>
                      {branch.name}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">{t('dashboard.proposal.invitePeople')}</h4>
          {candidatePeople.length === 0 ? (
            <p className="text-xs text-slate-400">{t('dashboard.proposal.noPeopleToInvite')}</p>
          ) : (
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {candidatePeople.map(person => {
                const on = selectedPersonIds.includes(person.personId)
                return (
                  <li key={person.personId}>
                    <button type="button" disabled={busy} onClick={() => toggle(person.personId, selectedPersonIds, setSelectedPersonIds)} className={rowCls(on)}>
                      {person.displayName}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('dashboard.proposal.escalateNote')}</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('dashboard.proposal.escalateNotePlaceholder')}
            rows={3}
            className={`${inputCls} resize-none`}
            disabled={busy}
          />
        </div>
      </div>
    </Modal>
  )
}
