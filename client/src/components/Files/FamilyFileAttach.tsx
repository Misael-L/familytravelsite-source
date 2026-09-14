/**
 * Attach / list trip files for a place or reservation (L4 chrome).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Paperclip, Upload } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useToast } from '../shared/Toast'
import {
  addTripFileLink,
  filesForPlace,
  filesForReservation,
  listTripFiles,
  signedTripFileUrl,
  uploadTripFile,
  type FamilyTripFile,
} from '../../data/supabase/tripFiles'

const HOF = 'trip.explore.add.hofOnly'

export default function FamilyFileAttach({
  tripId,
  familyId,
  canMutate,
  mePersonId,
  placeId,
  reservationId,
}: {
  tripId: string
  familyId: string
  canMutate: boolean
  mePersonId: string | null
  placeId?: string | null
  reservationId?: string | null
}): React.ReactElement {
  const { t } = useTranslation()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FamilyTripFile[]>([])

  const reload = useCallback(async () => {
    const all = await listTripFiles(tripId)
    if (placeId) setFiles(filesForPlace(all, placeId))
    else if (reservationId) setFiles(filesForReservation(all, reservationId))
    else setFiles([])
  }, [tripId, placeId, reservationId])

  useEffect(() => { void reload().catch(() => {}) }, [reload])

  const upload = async (list: FileList | null) => {
    if (!canMutate) { toast.error(t(HOF)); return }
    if (!placeId && !reservationId) {
      toast.error(t('files.emptyHint'))
      return
    }
    const picked = list ? Array.from(list) : []
    try {
      for (const file of picked) {
        const id = await uploadTripFile({ familyId, tripId, file, uploadedBy: mePersonId })
        if (placeId) await addTripFileLink(id, { placeId })
        else if (reservationId) await addTripFileLink(id, { reservationId })
      }
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <label className="block text-[11px] font-semibold text-content-faint mb-[5px] uppercase tracking-[0.03em]">{t('files.title')}</label>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {files.map(f => (
            <button key={f.id} type="button" onClick={() => { void signedTripFileUrl(f.storagePath).then(url => window.open(url, '_blank')) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, textAlign: 'left' }}>
              <FileText size={11} className="text-content-faint" />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.originalName}</span>
            </button>
          ))}
        </div>
      )}
      {files.length === 0 && (
        <p className="text-content-faint" style={{ fontSize: 12, margin: '0 0 8px' }}>{t('files.empty')}</p>
      )}
      <input ref={inputRef} type="file" multiple hidden onChange={e => { void upload(e.target.files); e.target.value = '' }} />
      <button
        type="button"
        onClick={() => {
          if (!canMutate) { toast.error(t(HOF)); return }
          inputRef.current?.click()
        }}
        className="text-content-faint"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
          border: '1px dashed var(--border-primary)', borderRadius: 8, background: 'none',
          fontSize: 'calc(11px * var(--fs-scale-caption, 1))', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {canMutate ? <Upload size={11} /> : <Paperclip size={11} />}
        {t('reservations.attachFile')}
      </button>
    </div>
  )
}
