import { CSSProperties, FormEvent, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link2, Plus, Trash2, X } from 'lucide-react'
import CollabPanelHead, { HEAD_ACTION } from './CollabPanelHead'
import { DialogButton, DialogFooter, DialogHeader, DialogShell, DialogTile, FooterSpacer, NEUTRAL_TINT } from '../shared/DialogShell'
import { EditorField, INPUT } from '../shared/dialogParts'
import { useIsPhone } from '../../mobile/useIsPhone'
import api, { collabApi } from '../../api/client'
import { addListener, removeListener } from '../../api/websocket'
import { useTranslation } from '../../i18n'
import { useCanDo } from '../../store/permissionsStore'
import { useTripStore } from '../../store/tripStore'
import ConfirmDialog from '../shared/ConfirmDialog'
import EmptyState from '../shared/EmptyState'
import { Tooltip } from '../shared/Tooltip'
import { useToast } from '../shared/Toast'
import { offlineOr } from '../../utils/needsConnection'
import { captureReadSession } from '../../sync/readSession'
import { CollabRecovery, type CollabRecoveryView } from './CollabRecovery'
import { useCollabLinkActions, type CollabLink } from './useCollabLinkActions'
import { CollabLinkChip } from './CollabLinkChip'

const FONT = "var(--font-system)"

type LinkDetails = Pick<CollabLink, 'title' | 'url'>

/**
 * The add and edit form as a modal, like the poll and note panels next to it.
 * Inline it pushed the list down and gave the panel a second header, which is
 * what made this tab read as a different app from its four siblings. With a
 * link handed in it edits that link (#2414): a link used to be delete-and-add
 * once its title or address needed a correction.
 */
function LinkModal({ link, onClose, onSave, preview }: {
  link?: CollabLink
  onClose: () => void
  onSave: (link: LinkDetails, operationId?: string) => Promise<void>
  preview: boolean
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(link?.title ?? '')
  const [url, setUrl] = useState(link?.url ?? '')
  const [busy, setBusy] = useState(false)
  const isPhone = useIsPhone()
  const labelId = useId()
  const operation = useRef<string | null>(null)
  const canSave = !busy && title.trim().length > 0 && url.trim().length > 0
  const heading = t(link ? 'collab.links.edit' : 'collab.links.add')
  const submitLabel = busy ? '...' : t('collab.links.save')
  const titleLimit = preview ? 160 : undefined
  const urlLimit = preview ? 2048 : undefined
  const savingPreview = preview && busy
  const dismiss = () => { if (!savingPreview) onClose() }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSave) return
    setBusy(true)
    try {
      const details = { title: title.trim(), url: url.trim() }
      if (preview) {
        operation.current ??= crypto.randomUUID()
        await onSave(details, operation.current)
      } else await onSave(details)
      onClose()
    } catch {
      // The caller already said what went wrong; the form stays open with the input in it.
    } finally {
      setBusy(false)
    }
  }

  const field: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 10, fontFamily: 'inherit',
    fontSize: 'calc(13px * var(--fs-scale-body, 1))', outline: 'none',
    border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)',
  }
  const label: CSSProperties = {
    fontSize: 'calc(9px * var(--fs-scale-caption, 1))', fontWeight: 600,
    color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
  }

  // The desktop names the link in the head band like every planner dialog.
  if (!isPhone) return (
    <DialogShell
      onClose={dismiss}
      blocked={savingPreview}
      labelledBy={labelId}
      width="narrow"
      onSubmit={event => void submit(event)}
      header={(
        <DialogHeader
          tile={<DialogTile><Link2 size={20} strokeWidth={1.9} className="text-content-muted" /></DialogTile>}
          tint={NEUTRAL_TINT}
          labelId={labelId}
          onClose={dismiss}
          eyebrow={heading}
          titleInput={{
            value: title,
            onChange: setTitle,
            label: t('collab.links.titlePlaceholder'),
            placeholder: t('collab.links.titlePlaceholder'),
            autoFocus: true,
            readOnly: savingPreview,
            maxLength: titleLimit,
            onKeyDown: e => { if (e.key === 'Enter') void submit() },
          }}
        />
      )}
      footer={(
        <DialogFooter>
          <FooterSpacer />
          <DialogButton onClick={dismiss} disabled={savingPreview}>{t('collab.links.cancel')}</DialogButton>
          <DialogButton variant="primary" onClick={() => void submit()} disabled={!canSave}>{submitLabel}</DialogButton>
        </DialogFooter>
      )}
    >
      <EditorField label={t('reservations.urlLabel')} htmlFor="collab-link-url">
        <input id="collab-link-url" type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder={t('collab.links.urlPlaceholder')} readOnly={savingPreview} maxLength={urlLimit} className={INPUT} />
      </EditorField>
    </DialogShell>
  )

  return createPortal(
    <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'var(--overlay-bg, rgba(0,0,0,0.35))', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16, fontFamily: FONT }} onClick={e => { if (e.target === e.currentTarget) dismiss() }}>
      <form aria-labelledby={labelId} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 400, maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--border-faint)' }} onSubmit={event => void submit(event)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid var(--border-faint)' }}>
          <h3 id={labelId} style={{ fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{heading}</h3>
          <button type="button" onClick={dismiss} disabled={savingPreview} aria-label={t('collab.links.cancel')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 2, display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label htmlFor="collab-link-title" style={{ ...label, display: 'block' }}>{t('collab.links.titlePlaceholder')}</label>
            <input id="collab-link-title" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('collab.links.titlePlaceholder')} readOnly={savingPreview} maxLength={titleLimit} autoFocus style={field} />
          </div>
          <div>
            <label htmlFor="collab-link-url" style={{ ...label, display: 'block' }}>{t('collab.links.urlPlaceholder')}</label>
            <input id="collab-link-url" type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder={t('collab.links.urlPlaceholder')} readOnly={savingPreview} maxLength={urlLimit} style={field} />
          </div>
          <button type="submit" disabled={!canSave} style={{
            width: '100%', borderRadius: 99, padding: '9px 14px', background: canSave ? 'var(--accent)' : 'var(--border-primary)',
            color: canSave ? 'var(--accent-text)' : 'var(--text-faint)', fontSize: 'calc(13px * var(--fs-scale-body, 1))',
            fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'default', fontFamily: FONT,
          }}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function LinksLoadStatus({ status, reload }: { status: 'loading' | 'failed'; reload: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2 p-2 text-sm">
      {status === 'loading' ? <p role="status">{t('common.loading')}</p> : (
        <>
          <p role="alert">Shared links could not be loaded.</p>
          <DialogButton onClick={reload}>{t('trip.load.retry')}</DialogButton>
        </>
      )}
    </div>
  )
}

export default function CollabLinks({ tripId, previewLinks = false }: { tripId: number; previewLinks?: boolean }) {
  const { t } = useTranslation()
  const isPhone = useIsPhone()
  const trip = useTripStore(s => s.trip)
  const canEditLegacy = useCanDo()('collab_edit', trip)
  const toast = useToast()
  const [linkRows, setLinks] = useState<CollabLink[]>([])
  const [previewCanEdit, setPreviewCanEdit] = useState(false)
  const [previewStatus, setPreviewStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const canEdit = previewLinks ? previewStatus === 'ready' && previewCanEdit : canEditLegacy
  const canManageLinks = previewLinks && canEdit
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CollabLink | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [recovery, setRecovery] = useState<CollabRecoveryView>(null)
  const links = previewLinks ? linkRows.filter(link => !link.trashed_at) : linkRows
  const trashedLinks = canManageLinks ? linkRows.filter(link => link.trashed_at)
    .sort((a, b) => (b.trashed_at ?? '').localeCompare(a.trashed_at ?? '')) : []

  const reload = () => {
    setPreviewStatus('loading')
    setLoadAttempt(count => count + 1)
  }

  const receivePreviewLink = (saved: CollabLink) => {
    setLinks(previous => {
      const current = previous.find(link => link.id === saved.id)
      if (current && (current.revision ?? 0) > (saved.revision ?? 0)) return previous
      return [saved, ...previous.filter(link => link.id !== saved.id)].sort((a, b) =>
        Number(b.pinned) - Number(a.pinned) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    })
  }
  const linkActions = useCollabLinkActions({ tripId, canEdit, toast, onSaved: receivePreviewLink, onConflict: reload })

  // Both are new objects on every render, so depending on them would reload the
  // list after each keystroke and drop a link that was just added back out of it.
  const toastRef = useRef(toast)
  const tRef = useRef(t)
  useEffect(() => {
    toastRef.current = toast
    tRef.current = t
  }, [toast, t])

  useEffect(() => {
    let cancelled = false
    const scope = previewLinks ? captureReadSession() : null
    const current = () => !cancelled && (scope?.contextCurrent() ?? true)
    collabApi.getLinks(tripId)
      .then(d => {
        if (!current()) return
        const active = d.links ?? []
        setLinks(previewLinks && d.can_edit === true ? [...active, ...(d.trashed_links ?? [])] : active)
        if (previewLinks) {
          setPreviewCanEdit(d.can_edit === true)
          setPreviewStatus('ready')
        }
      })
      .catch(err => {
        if (!current()) return
        if (previewLinks) {
          setLinks([])
          setPreviewCanEdit(false)
          setPreviewStatus('failed')
          return
        }
        console.error('Failed to load collab links:', err)
        toastRef.current.error(tRef.current('common.error'))
      })
    return () => { cancelled = true }
  }, [tripId, previewLinks, loadAttempt])

  // Live sync, the same shape the notes panel uses. Without it the three
  // collab:link events the server broadcasts would arrive nowhere and a link
  // somebody else added would only appear on the next reload.
  useEffect(() => {
    if (!tripId || previewLinks) return
    const handler = (msg: { type?: string; tripId?: number | string; link?: CollabLink; linkId?: number }) => {
      // The panel is not remounted on a trip change, so an event still in
      // flight from the trip we just left must not land in this list.
      if (String(msg?.tripId) !== String(tripId)) return
      if (msg.type === 'collab:link:created' && msg.link) {
        setLinks(prev => prev.some(l => l.id === msg.link!.id) ? prev : [msg.link!, ...prev])
      }
      if (msg.type === 'collab:link:updated' && msg.link) {
        setLinks(prev => prev
          .map(l => l.id === msg.link!.id ? { ...l, ...msg.link! } : l)
          .sort((a, b) => Number(b.pinned) - Number(a.pinned)))
      }
      if (msg.type === 'collab:link:deleted' && msg.linkId) {
        setLinks(prev => prev.filter(l => l.id !== msg.linkId))
      }
    }
    addListener(handler)
    return () => removeListener(handler)
  }, [tripId, previewLinks])

  const savePreview = async (data: LinkDetails, operationId?: string, existing?: CollabLink) => {
    const scope = captureReadSession()
    try {
      if (!canEdit || !operationId || (existing && !existing.revision)) throw new Error('Missing save scope')
      const path = `/trips/${tripId}/family/collab/links`
      const reply = existing
        ? await api.put<{ link: CollabLink }>(`${path}/${existing.id}`, { ...data, operationId, expectedRevision: existing.revision })
        : await api.post<{ link: CollabLink }>(path, { ...data, operationId })
      if (!scope.contextCurrent()) throw new Error('Original session ended')
      receivePreviewLink(reply.data.link)
    } catch (error) {
      if (scope.contextCurrent()) {
        const detail = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        toast.error(detail ?? 'The link was not confirmed. Try saving again.')
      }
      throw error
    }
  }

  // Every write says something when it fails. Silence left the pin looking
  // unchanged and the delete looking ignored, with an unhandled rejection in
  // the console as the only trace.
  const add = async (data: { title: string; url: string }) => {
    try {
      const d = await collabApi.createLink(tripId, data)
      setLinks(v => [d.link, ...v])
    } catch (err) {
      console.error('Failed to add collab link:', err)
      toast.error(offlineOr(t, t('common.error')))
      throw err
    }
  }

  const toggle = async (link: CollabLink) => {
    try {
      const d = await collabApi.updateLink(tripId, link.id, { pinned: !link.pinned })
      setLinks(v => v.map(x => x.id === link.id ? d.link : x).sort((a, b) => Number(b.pinned) - Number(a.pinned)))
    } catch (err) {
      console.error('Failed to pin collab link:', err)
      toast.error(offlineOr(t, t('common.error')))
    }
  }

  const edit = async (link: CollabLink, data: { title: string; url: string }) => {
    try {
      const d = await collabApi.updateLink(tripId, link.id, data)
      setLinks(v => v.map(x => x.id === link.id ? d.link : x))
    } catch (err) {
      console.error('Failed to edit collab link:', err)
      toast.error(offlineOr(t, t('common.error')))
      throw err
    }
  }

  const remove = async (id: number) => {
    try {
      await collabApi.deleteLink(tripId, id)
      setLinks(v => v.filter(x => x.id !== id))
    } catch (err) {
      console.error('Failed to delete collab link:', err)
      toast.error(offlineOr(t, t('common.error')))
    }
  }

  const openTrash = previewLinks && (
    <Tooltip label="Links Trash">
      <button type="button" onClick={() => setRecovery('trash')} aria-label="Links Trash"
        className="grid size-7 flex-none place-items-center rounded-full bg-surface-card text-content-muted shadow-sm hover:text-content">
        <Trash2 size={13} />
      </button>
    </Tooltip>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
      {/* Header: the desktop's head band; the phone keeps its own */}
      {!isPhone ? (
        <CollabPanelHead
          icon={Link2}
          title={t('collab.tabs.links')}
          count={links.length}
          actions={canEdit && (
            <>
              {openTrash}
              <button type="button" onClick={() => setShowForm(true)} className={HEAD_ACTION}>
                <Plus size={12} /> {t('collab.links.add')}
              </button>
            </>
          )}
        />
      ) : (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', flexShrink: 0 }}>
        <h3 style={{ margin: 0, fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 7, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          <Link2 size={14} color="var(--text-faint)" />
          {t('collab.tabs.links')}
        </h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            {openTrash}
            <button type="button" onClick={() => setShowForm(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 99, padding: '6px 12px',
              background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600,
              fontFamily: FONT, border: 'none', cursor: 'pointer',
            }}>
              <Plus size={12} /> {t('collab.links.add')}
            </button>
          </div>
        )}
      </div>
      )}

      {/* Content: one chip per link, two to a row (see .collab-link-chip). The chip is
          the link, with the host beside the title; the actions sit in its tail. */}
      <div className={isPhone ? 'chat-scroll collab-link-grid' : 'chat-scroll collab-link-grid collab-link-grid--desk'} style={{ flex: 1, overflowY: 'auto', padding: isPhone ? '2px 12px 12px' : 12 }}>
        {previewLinks && previewStatus !== 'ready' ? (
          <LinksLoadStatus status={previewStatus} reload={reload} />
        ) : links.length === 0 ? (
          <EmptyState scene="links" title={t('collab.links.empty')} />
        ) : (
          <div className="collab-link-grid__cells">
            {links.map(link => (
              <CollabLinkChip key={link.id} link={link} canEdit={canEdit} phone={isPhone} preview={previewLinks}
                changing={linkActions.pinPending === link.id} pinBusy={linkActions.pinPending !== null}
                onEdit={() => setEditing(link)}
                onToggle={() => void (previewLinks ? linkActions.togglePin(link) : toggle(link))}
                onRemove={() => previewLinks ? setRecovery(link) : setPendingDeleteId(link.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Create and edit modals */}
      {showForm && <LinkModal preview={previewLinks} onClose={() => setShowForm(false)} onSave={previewLinks ? savePreview : add} />}
      {editing && <LinkModal preview={previewLinks} key={editing.id} link={editing} onClose={() => setEditing(null)}
        onSave={(data, operationId) => previewLinks ? savePreview(data, operationId, editing) : edit(editing, data)} />}

      {/* The delete is shared: the link goes for every member, and on the phone the
          button is a thumb's width from pin. Same guard as the notes panel. */}
      <ConfirmDialog
        isOpen={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => (pendingDeleteId !== null ? remove(pendingDeleteId) : undefined)}
        title={t('collab.links.confirmDeleteTitle')}
        message={t('collab.links.confirmDeleteBody')}
      />
      {canManageLinks && <CollabRecovery board="links" view={recovery} items={trashedLinks}
        onClose={() => setRecovery(null)} onMove={linkActions.apply} onRefresh={reload} />}
    </div>
  )
}
