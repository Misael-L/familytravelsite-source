import { cloneElement, type ReactElement, useState } from 'react'
import { ExternalLink, Link2, Pencil, Pin, Trash2 } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { Tooltip } from '../shared/Tooltip'
import type { CollabLink } from './useCollabLinkActions'

// The glyph holds the place until a favicon has really arrived: a host that never
// answers, or answers with a blank pixel, left the chip with an empty square.
function LinkIcon({ url, loadFavicon = true }: { url: string; loadFavicon?: boolean }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  let favicon = ''
  if (loadFavicon) {
    try { favicon = new URL('/favicon.ico', url).href } catch { /* fall through to the glyph */ }
  }
  const loaded = state === 'loaded'
  return (
    <span className="collab-link-chip__icon" aria-hidden="true">
      {!loaded && <Link2 size={13} />}
      {favicon && state !== 'failed' && (
        <img
          src={favicon}
          alt=""
          hidden={!loaded}
          onLoad={(e) => setState(e.currentTarget.naturalWidth > 2 ? 'loaded' : 'failed')}
          onError={() => setState('failed')}
        />
      )}
      <span className="collab-link-chip__go"><ExternalLink size={13} /></span>
    </span>
  )
}

/** The desktop names a chip's action in the shared tooltip; the phone keeps its plain title. */
function ChipTip({ label, phone, children }: { label: string; phone: boolean; children: ReactElement<{ title?: string }> }) {
  return phone ? cloneElement(children, { title: label }) : <Tooltip label={label}>{children}</Tooltip>
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

interface CollabLinkChipProps {
  link: CollabLink
  canEdit: boolean
  phone: boolean
  preview: boolean
  changing: boolean
  pinBusy: boolean
  onEdit: () => void
  onToggle: () => void
  onRemove: () => void
}

export function CollabLinkChip({ link, canEdit, phone, preview, changing, pinBusy, onEdit, onToggle, onRemove }: CollabLinkChipProps) {
  const { t } = useTranslation()
  const removalLabel = preview ? 'Move to Trash' : t('collab.links.delete')
  return (
    <div className={link.pinned ? 'collab-link-chip collab-link-chip--pinned' : 'collab-link-chip'}>
      <ChipTip label={t('collab.links.open')} phone={phone}>
        <a className="collab-link-chip__main" href={link.url} target="_blank" rel="noreferrer">
          {/* A corrected URL resets the icon even though the link keeps its ID. */}
          <LinkIcon key={link.url} url={link.url} loadFavicon={!preview} />
          <span className="collab-link-chip__text">
            <span className="collab-link-chip__title">{link.title}</span>
            <span className="collab-link-chip__host">{hostOf(link.url)}</span>
          </span>
        </a>
      </ChipTip>
      {canEdit && (
        <span className="collab-link-chip__actions">
          <ChipTip label={t('collab.links.edit')} phone={phone}>
            <button type="button" className="collab-link-chip__action" onClick={onEdit}
              disabled={changing} aria-label={t('collab.links.edit')}>
              <Pencil size={13} aria-hidden="true" />
            </button>
          </ChipTip>
          <ChipTip label={link.pinned ? t('collab.links.unpin') : t('collab.links.pin')} phone={phone}>
            <button type="button" className={link.pinned ? 'collab-link-chip__action collab-link-chip__action--on' : 'collab-link-chip__action'}
              onClick={onToggle}
              disabled={pinBusy} aria-label={link.pinned ? t('collab.links.unpin') : t('collab.links.pin')}>
              <Pin size={13} fill={link.pinned ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
          </ChipTip>
          <ChipTip label={removalLabel} phone={phone}>
            <button type="button" className="collab-link-chip__action"
              onClick={onRemove}
              disabled={changing} aria-label={removalLabel}>
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </ChipTip>
        </span>
      )}
    </div>
  )
}
