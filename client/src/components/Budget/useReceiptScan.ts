import { useStayActionScope, useStayState } from '../Planner/stayActionScope'
import { captureWriteSession } from '../../sync/writeSession'
import { useEffect } from 'react'
import { useTranslation } from '../../i18n'
import { llmRepo } from '../../repo/llmRepo'
import { saveImportFiles } from '../../db/offlineDb'
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore'
import { LLM_PHOTO_EXTENSIONS } from '@trek/shared'

/** The picker's filter: the extensions, and the MIME types a phone's camera roll matches on. */
export const RECEIPT_PHOTO_ACCEPT = [...LLM_PHOTO_EXTENSIONS, 'image/jpeg', 'image/png', 'image/webp'].join(',')
const MAX_PHOTO_BYTES = 10 * 1024 * 1024

/**
 * "Scan a receipt" in Costs, for both shells. The button is only offered when
 * the person may add expenses and their AI model reads images. It opens a
 * dialog like the booking import's; the picked photo is read in the background
 * like a booking import too: the background tasks widget follows it, and its
 * review opens the expense editor pre-filled, with the photo waiting to be
 * attached on save. The photo is kept in IndexedDB so a reload mid-read still
 * has it for that review.
 */
export function useReceiptScan(tripId: number, canEdit: boolean) {
  const { t } = useTranslation()
  const capture = useStayActionScope(tripId)
  const addTask = useBackgroundTasksStore((s) => s.addTask)
  const [readsPhotos, setReadsPhotos] = useStayState(capture, false)
  const [isOpen, setIsOpen] = useStayState(capture, false)
  const [photo, setPhoto] = useStayState<File | null>(capture, null)
  const [error, setError] = useStayState(capture, '')
  const [starting, setStarting] = useStayState(capture, false)

  useEffect(() => {
    if (!canEdit) return
    let live = true
    const action = capture(() => live)
    void action.perform(() => llmRepo.readsPhotos()).then(v => action.effect(() => setReadsPhotos(v)), () => action.effect(() => setReadsPhotos(false)))
    return () => { live = false }
  }, [canEdit, capture, setReadsPhotos])

  const open = () => { setPhoto(null); setError(''); setIsOpen(true) }
  const close = () => { if (!starting) setIsOpen(false) }

  /** Take the first of the picked or dropped files, if it is a photo the model can read. */
  const choose = (files: File[]) => {
    const picked = files[0]
    if (!picked) return
    const ext = '.' + (picked.name.toLowerCase().split('.').pop() ?? '')
    if (!(LLM_PHOTO_EXTENSIONS as readonly string[]).includes(ext)) { setError(t('costs.scan.unsupported')); return }
    if (picked.size > MAX_PHOTO_BYTES) { setError(t('reservations.import.fileTooLarge', { name: picked.name })); return }
    setPhoto(picked)
    setError('')
  }

  const start = async () => {
    const ui = capture(), work = captureWriteSession()
    if (!ui.current()) return
    if (!photo || starting) return
    setStarting(true)
    setError('')
    try {
      const jobId = await work.perform(() => llmRepo.scanReceipt(tripId, photo))
      await work.perform(() => saveImportFiles(jobId, [photo]))
      addTask({ id: jobId, tripId: String(tripId), label: photo.name, total: 1, files: [photo], kind: 'costs' })
      ui.effect(() => setIsOpen(false))
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      ui.effect(() => setError(message ?? t('costs.scan.failed')))
    } finally {
      ui.effect(() => setStarting(false))
    }
  }

  return { offered: canEdit && readsPhotos, isOpen, open, close, photo, choose, error, starting, start }
}

export type ReceiptScan = ReturnType<typeof useReceiptScan>
