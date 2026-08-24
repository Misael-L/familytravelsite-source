import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Send, Trash2 } from 'lucide-react'
import SlidingTabs from '../../shared/SlidingTabs'
import ConfirmDialog from '../../shared/ConfirmDialog'
import Modal from '../../shared/Modal'
import { useToast } from '../../shared/Toast'
import { useTranslation } from '../../../i18n'
import type { UseFamilyTripWorkspaceGovernanceResult } from '../../../pages/familyTripWorkspace/useFamilyTripWorkspaceGovernance'
import { draftOpLabel } from '../../../pages/familyTripWorkspace/workspaceGovernanceModel'
import WorkspaceChangeRequestInbox from './WorkspaceChangeRequestInbox'

type ChromeStyle = 'inset' | 'mapFloating'

export type WorkspaceGovernanceChromeProps = {
  style?: ChromeStyle
  gov: UseFamilyTripWorkspaceGovernanceResult
}

export default function WorkspaceGovernanceChrome({
  style = 'inset',
  gov,
}: WorkspaceGovernanceChromeProps): React.ReactElement {
  const { t } = useTranslation()
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  const [showInbox, setShowInbox] = useState(false)
  const [showPropose, setShowPropose] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [summary, setSummary] = useState('')

  const canExpand = gov.layer === 'myDraft'
    || !gov.canMutate
    || gov.draftOps.length > 0
    || (gov.canMutate && gov.openChangeRequests.length > 0)
    || gov.mySubmittedRequests.length > 0

  const inboxCount = gov.openChangeRequests.length
  const submitted = gov.mySubmittedRequests[0] ?? null

  const layerTabs = useMemo(() => ([
    { id: 'published' as const, label: t('trip.governance.published') },
    { id: 'myDraft' as const, label: t('trip.governance.myDraft'), count: gov.draftOps.length || undefined },
  ]), [gov.draftOps.length, t])

  const shell: React.CSSProperties = style === 'mapFloating'
    ? {
        width: '100%',
        maxWidth: 560,
        borderRadius: 14,
        padding: '8px 10px',
        background: 'var(--bg-elevated, var(--bg-primary))',
        boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
        border: '1px solid var(--border-primary)',
      }
    : {
        width: '100%',
        borderRadius: 14,
        padding: '10px 12px',
        background: 'var(--bg-secondary, var(--bg-elevated))',
        border: '1px solid var(--border-faint, var(--border-primary))',
      }

  return (
    <div style={shell}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div role="group" aria-label={t('trip.governance.layer')} style={{ minWidth: 0, flex: '1 1 auto' }}>
          <SlidingTabs
            size="sm"
            tabs={layerTabs}
            activeTab={gov.layer}
            onChange={gov.setLayer}
          />
        </div>
        {gov.canMutate && inboxCount > 0 && (
          <button
            type="button"
            onClick={() => setShowInbox(true)}
            aria-label={t('trip.governance.reviewCount', { count: inboxCount })}
            className="bg-accent text-accent-text"
            style={{
              border: 'none', borderRadius: 999, minWidth: 28, height: 28, padding: '0 8px',
              fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {inboxCount}
          </button>
        )}
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? t('trip.governance.collapse') : t('trip.governance.expand')}
            className="text-content-muted bg-transparent"
            style={{
              border: 'none', width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {gov.draftOps.length > 0 && (
              <button
                type="button"
                disabled={gov.isChangeBusy}
                onClick={() => setShowPropose(true)}
                className="bg-accent text-accent-text"
                style={{
                  border: 'none', borderRadius: 10, padding: '7px 12px', fontWeight: 650, fontSize: 13,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  cursor: gov.isChangeBusy ? 'wait' : 'pointer', fontFamily: 'inherit',
                }}
              >
                <Send size={14} />
                {t('trip.governance.proposeCount', { count: gov.draftOps.length })}
              </button>
            )}
            {submitted && (
              <button
                type="button"
                disabled={gov.isChangeBusy}
                onClick={() => setShowWithdraw(true)}
                className="bg-surface-card border border-edge text-content"
                style={{
                  borderRadius: 10, padding: '7px 12px', fontWeight: 650, fontSize: 13,
                  cursor: gov.isChangeBusy ? 'wait' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('trip.governance.withdraw')}
              </button>
            )}
            {gov.canMutate && inboxCount > 0 && (
              <button
                type="button"
                onClick={() => setShowInbox(true)}
                className="bg-surface-card border border-edge text-content"
                style={{
                  borderRadius: 10, padding: '7px 12px', fontWeight: 650, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('trip.governance.review', { count: inboxCount })}
              </button>
            )}
          </div>

          {gov.governanceError && (
            <p className="text-red-600" role="alert" style={{ fontSize: 12, margin: '0 0 8px' }}>{gov.governanceError}</p>
          )}

          {gov.layer === 'myDraft' ? (
            gov.draftOps.length === 0 ? (
              <p className="text-content-secondary" style={{ fontSize: 12, margin: 0 }}>{t('trip.governance.emptyDraft')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {gov.draftOps.map(op => {
                  const label = draftOpLabel(op, t)
                  return (
                    <li key={op.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 650 }}>{label.title}</div>
                        <div className="text-content-secondary" style={{ fontSize: 12 }}>{label.detail}</div>
                      </div>
                      <button
                        type="button"
                        disabled={gov.isChangeBusy}
                        onClick={() => { void gov.deleteDraftOp(op.id) }}
                        aria-label={t('trip.governance.removeOp')}
                        className="text-content-muted bg-transparent"
                        style={{ border: 'none', width: 28, height: 28, cursor: gov.isChangeBusy ? 'wait' : 'pointer' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          ) : !gov.canMutate ? (
            <p className="text-content-secondary" style={{ fontSize: 12, margin: 0 }}>{t('trip.governance.nudgeDraft')}</p>
          ) : submitted ? (
            <p className="text-content-secondary" style={{ fontSize: 12, margin: 0 }}>{t('trip.governance.submitted')}</p>
          ) : null}
        </div>
      )}

      <WorkspaceChangeRequestInbox
        open={showInbox}
        onClose={() => setShowInbox(false)}
        requests={gov.openChangeRequests}
        busy={gov.isChangeBusy}
        loadOps={gov.loadRequestOps}
        onResolveOp={gov.resolveOp}
        onResolveRequest={gov.resolveRequest}
      />

      <Modal
        isOpen={showPropose}
        onClose={() => setShowPropose(false)}
        title={t('trip.governance.proposeTitle')}
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowPropose(false)}
              className="text-content-secondary border border-edge-secondary"
              style={{ padding: '8px 16px', borderRadius: 10, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={gov.isChangeBusy}
              onClick={() => {
                void gov.proposeDraftChanges(summary).then(ok => {
                  if (ok) {
                    setSummary('')
                    setShowPropose(false)
                    toast.success(t('trip.governance.proposed'))
                  }
                })
              }}
              className="bg-accent text-accent-text"
              style={{ padding: '8px 16px', border: 'none', borderRadius: 10, fontWeight: 650, cursor: gov.isChangeBusy ? 'wait' : 'pointer', fontFamily: 'inherit' }}
            >
              {t('trip.governance.propose')}
            </button>
          </div>
        )}
      >
        <p className="text-content-secondary" style={{ marginTop: 0, fontSize: 14 }}>
          {t('trip.governance.proposeBody', { count: gov.draftOps.length })}
        </p>
        <label htmlFor="trip-change-summary" className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-content-faint mb-[6px]">
          {t('trip.governance.proposeSummary')}
        </label>
        <textarea
          id="trip-change-summary"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          rows={3}
          className="w-full bg-surface-input border border-edge text-content"
          style={{ borderRadius: 10, padding: 10, fontFamily: 'inherit' }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={showWithdraw}
        onClose={() => setShowWithdraw(false)}
        title={t('trip.governance.withdrawTitle')}
        message={t('trip.governance.withdrawBody')}
        confirmLabel={t('trip.governance.withdraw')}
        onConfirm={() => {
          if (submitted) {
            void gov.withdrawRequest(submitted.id).then(ok => {
              if (ok) toast.success(t('trip.governance.withdrawn'))
            })
          }
        }}
      />
    </div>
  )
}
