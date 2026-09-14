import React, { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import ConfirmDialog from '../../shared/ConfirmDialog'
import Modal from '../../shared/Modal'
import { useTranslation } from '../../../i18n'
import type { TripChangeRequestOpRow, TripChangeRequestRow } from '../../../data/supabase/tripChangeRequests'
import { draftOpLabel, requestStatusKey } from '../../../pages/familyTripWorkspace/workspaceGovernanceModel'

export type WorkspaceChangeRequestInboxProps = {
  open: boolean
  onClose: () => void
  requests: TripChangeRequestRow[]
  busy: boolean
  loadOps: (requestId: string) => Promise<TripChangeRequestOpRow[]>
  onResolveOp: (opId: string, accept: boolean) => Promise<{ ok: boolean; errorCode?: string | null }>
  onResolveRequest: (requestId: string, acceptAll: boolean) => Promise<{ ok: boolean; errorCodes: string[] }>
}

export default function WorkspaceChangeRequestInbox({
  open,
  onClose,
  requests,
  busy,
  loadOps,
  onResolveOp,
  onResolveRequest,
}: WorkspaceChangeRequestInboxProps): React.ReactElement | null {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ops, setOps] = useState<TripChangeRequestOpRow[]>([])
  const [opsError, setOpsError] = useState<string | null>(null)
  const [bulk, setBulk] = useState<'apply' | 'reject' | null>(null)
  const [opMessage, setOpMessage] = useState<string | null>(null)

  const selected = requests.find(r => r.id === selectedId) ?? null

  useEffect(() => {
    if (!open) {
      setSelectedId(null)
      setOps([])
      setOpsError(null)
      setOpMessage(null)
    }
  }, [open])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setOpsError(null)
    void loadOps(selectedId)
      .then(rows => { if (!cancelled) setOps(rows) })
      .catch(err => {
        if (!cancelled) setOpsError(err instanceof Error ? err.message : t('trip.governance.error'))
      })
    return () => { cancelled = true }
  }, [loadOps, selectedId, t])

  return (
    <>
      <Modal
        isOpen={open}
        onClose={onClose}
        title={t('trip.governance.inbox')}
        size="lg"
      >
        {requests.length === 0 ? (
          <p className="text-content-secondary" style={{ margin: 0, fontSize: 13 }}>{t('trip.governance.emptyInbox')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {requests.map(req => (
                <li key={req.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(req.id)}
                    aria-label={req.summary?.trim() || t('trip.governance.requestFallback')}
                    aria-current={selectedId === req.id ? 'true' : undefined}
                    className="bg-surface-secondary border border-edge text-content"
                    style={{
                      width: '100%', textAlign: 'left', borderRadius: 12, padding: '10px 12px',
                      cursor: 'pointer', fontFamily: 'inherit',
                      outline: selectedId === req.id ? '2px solid var(--accent)' : undefined,
                    }}
                  >
                    <div style={{ fontWeight: 650, fontSize: 14 }}>
                      {req.summary?.trim() || t('trip.governance.requestFallback')}
                    </div>
                    <div className="text-content-secondary" style={{ fontSize: 12, marginTop: 2 }}>
                      {t(requestStatusKey(req.status))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {selected && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setBulk('apply')}
                    className="bg-accent text-accent-text"
                    style={{ border: 'none', borderRadius: 10, padding: '8px 12px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                  >
                    {t('trip.governance.applyAll')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setBulk('reject')}
                    className="bg-surface-card border border-edge text-content"
                    style={{ borderRadius: 10, padding: '8px 12px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                  >
                    {t('trip.governance.rejectAll')}
                  </button>
                </div>
                {opsError && <p className="text-red-600" style={{ fontSize: 13 }}>{opsError}</p>}
                {opMessage && <p className="text-content-secondary" role="status" style={{ fontSize: 13 }}>{opMessage}</p>}
                {ops.length === 0 && !opsError ? (
                  <p className="text-content-secondary" style={{ fontSize: 13 }}>{t('trip.governance.emptyOps')}</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                    {ops.map(op => {
                      const label = draftOpLabel(op, t)
                      const pending = op.status === 'pending'
                      return (
                        <li key={op.id} className="border border-edge bg-surface-card" style={{ borderRadius: 12, padding: 10 }}>
                          <div style={{ fontWeight: 650, fontSize: 13 }}>{label.title}</div>
                          <div className="text-content-secondary" style={{ fontSize: 12 }}>{label.detail}</div>
                          <div className="text-content-faint" style={{ fontSize: 11, marginTop: 4 }}>{t(`trip.governance.status.${op.status}`)}</div>
                          {op.errorCode && (
                            <div className="text-red-600" style={{ fontSize: 12, marginTop: 4 }}>
                              {t('trip.governance.applyFailed', { code: op.errorCode })}
                            </div>
                          )}
                          {op.hofNote && (
                            <div className="text-content-secondary" style={{ fontSize: 12 }}>{t('trip.governance.hofNote', { note: op.hofNote })}</div>
                          )}
                          {pending && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  void onResolveOp(op.id, true).then(result => {
                                    setOpMessage(result.errorCode
                                      ? t('trip.governance.applyFailed', { code: result.errorCode })
                                      : null)
                                    void loadOps(selected.id).then(setOps)
                                  })
                                }}
                                className="bg-accent text-accent-text"
                                style={{ border: 'none', borderRadius: 8, padding: '6px 10px', display: 'inline-flex', gap: 6, alignItems: 'center', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                              >
                                <Check size={14} /> {t('trip.governance.apply')}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  void onResolveOp(op.id, false).then(() => {
                                    setOpMessage(null)
                                    void loadOps(selected.id).then(setOps)
                                  })
                                }}
                                className="bg-surface-secondary border border-edge text-content"
                                style={{ borderRadius: 8, padding: '6px 10px', display: 'inline-flex', gap: 6, alignItems: 'center', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                              >
                                <X size={14} /> {t('trip.governance.reject')}
                              </button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={bulk != null}
        onClose={() => setBulk(null)}
        danger={bulk === 'reject'}
        title={bulk === 'reject' ? t('trip.governance.rejectAllTitle') : t('trip.governance.applyAllTitle')}
        message={bulk === 'reject' ? t('trip.governance.rejectAllBody') : t('trip.governance.applyAllBody')}
        confirmLabel={bulk === 'reject' ? t('trip.governance.rejectAll') : t('trip.governance.applyAll')}
        onConfirm={() => {
          if (!selected || !bulk) return
          void onResolveRequest(selected.id, bulk === 'apply').then(result => {
            if (!result.ok && result.errorCodes[0]) {
              setOpMessage(t('trip.governance.applyFailed', { code: result.errorCodes[0] }))
            } else {
              setOpMessage(null)
            }
            void loadOps(selected.id).then(setOps)
          })
        }}
      />
    </>
  )
}
