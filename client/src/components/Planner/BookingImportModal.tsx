import ReactDOM from 'react-dom'
import { useState, useRef, useEffect, useId } from 'react'
import { Upload, X } from 'lucide-react'
import type { BookingImportMode } from '@trek/shared'
import { useTranslation } from '../../i18n'
import { reservationsApi, healthApi } from '../../api/client'
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore'
import { saveImportFiles } from '../../db/offlineDb'
import type { FamilyImportItem, FamilyImportResult } from '../../data/bookingImport'

export type BookingImportStartParse = (
  files: File[],
  mode: BookingImportMode,
) => Promise<{ jobId: string }>

export type BookingImportExtract = (files: File[]) => Promise<FamilyImportResult>

interface BookingImportModalProps {
  isOpen: boolean
  onClose: () => void
  tripId: number | string
  /**
   * Nest TripPlanner omits this and POSTs the existing import-job API.
   * Family UUID trips pass `onExtract` instead so this modal never talks to Nest.
   */
  onStartParse?: BookingImportStartParse
  onExtract?: BookingImportExtract
  onConfirmPreview?: (items: FamilyImportItem[]) => void
}

const ACCEPTED_EXTS = ['.eml', '.pdf', '.pkpass', '.html', '.htm', '.txt']
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_FILES = 5

/**
 * TREK import drop-zone. Nest keeps the background job + widget.
 * Family `onExtract` stays in the modal (drop → preview → confirm).
 */
export default function BookingImportModal({
  isOpen,
  onClose,
  tripId,
  onStartParse,
  onExtract,
  onConfirmPreview,
}: BookingImportModalProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const addTask = useBackgroundTasksStore((s) => s.addTask)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const mouseDownTarget = useRef<EventTarget | null>(null)

  const [files, setFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [aiParsing, setAiParsing] = useState(false)
  const [step, setStep] = useState<'drop' | 'preview'>('drop')
  const [previewItems, setPreviewItems] = useState<FamilyImportItem[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  const reset = () => {
    setFiles([])
    setIsDragOver(false)
    setLoading(false)
    setError('')
    setStep('drop')
    setPreviewItems([])
    setWarnings([])
  }

  useEffect(() => {
    if (isOpen) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (onExtract) {
      setAiParsing(false)
      return
    }
    healthApi.features().then((f) => setAiParsing(!!f.aiParsing)).catch(() => setAiParsing(false))
  }, [isOpen, onExtract])

  useEffect(() => {
    if (!isOpen) return
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        reset()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleClose = () => { reset(); onClose() }

  const validateFile = (f: File): string | null => {
    const ext = ('.' + f.name.toLowerCase().split('.').pop()) as string
    if (!ACCEPTED_EXTS.includes(ext)) return t('reservations.import.unsupportedFormat')
    if (f.size > MAX_FILE_BYTES) return t('reservations.import.fileTooLarge', { name: f.name })
    return null
  }

  const selectFiles = (incoming: File[]) => {
    const valid: File[] = []
    let firstErr: string | null = null
    for (const f of incoming.slice(0, MAX_FILES)) {
      const err = validateFile(f)
      if (err) { firstErr = firstErr ?? err; continue }
      valid.push(f)
    }
    if (valid.length === 0) { setError(firstErr ?? ''); return }
    setFiles(valid)
    setError(firstErr ?? '')
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (list.length) selectFiles(list)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { if (e.target === e.currentTarget) setIsDragOver(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const list = Array.from(e.dataTransfer.files)
    if (list.length) selectFiles(list)
  }

  const parseErrorMessage = (err: unknown): string => {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const nested = (err as { response?: { data?: { error?: unknown } } }).response?.data?.error
      if (typeof nested === 'string' && nested.trim()) return nested
    }
    if (err instanceof Error && err.message.trim()) return err.message
    return t('reservations.import.error')
  }

  const handleParse = async () => {
    if (files.length === 0 || loading) return
    setLoading(true)
    setError('')
    try {
      if (onExtract) {
        const result = await onExtract(files)
        setPreviewItems(result.items)
        setWarnings(result.warnings)
        setStep('preview')
        setLoading(false)
        return
      }
      const mode: BookingImportMode = aiParsing ? 'fallback-on-empty' : 'no-ai'
      const start = onStartParse
        ?? ((f: File[], m: BookingImportMode) => reservationsApi.importBookingAsync(tripId, f, m))
      const { jobId } = await start(files, mode)
      await saveImportFiles(jobId, files)
      addTask({ id: jobId, tripId: String(tripId), label: files.map((f) => f.name).join(', '), total: files.length, files })
      handleClose()
    } catch (err: unknown) {
      setError(parseErrorMessage(err))
      setLoading(false)
    }
  }

  const handleConfirmPreview = () => {
    if (!onConfirmPreview || previewItems.length === 0) return
    onConfirmPreview(previewItems)
    handleClose()
  }

  const removePreview = (index: number) => {
    setPreviewItems(prev => prev.filter((_, i) => i !== index))
  }

  if (!isOpen) return null

  return ReactDOM.createPortal(
    <div
      className="bg-[rgba(0,0,0,0.4)]"
      style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { mouseDownTarget.current = e.target }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) handleClose()
        mouseDownTarget.current = null
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-card"
        style={{ borderRadius: 16, width: '100%', maxWidth: 540, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', fontFamily: 'var(--font-system)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', outline: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div id={titleId} style={{ flex: 1, fontSize: 'calc(15px * var(--fs-scale-subtitle, 1))', fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('reservations.import.title')}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.close')}
            className="bg-transparent text-content-faint"
            style={{ border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {step === 'drop' ? (
            <>
              <div style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', color: 'var(--text-faint)', marginBottom: 14, lineHeight: 1.45 }}>
                {t('reservations.import.acceptedFormats')}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTS.join(',')}
                multiple
                style={{ display: 'none' }}
                onChange={handleInputChange}
              />

              <div
                role="button"
                tabIndex={0}
                aria-label={t('reservations.import.dropHere')}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={isDragOver ? 'bg-surface-tertiary' : 'bg-transparent'}
                style={{
                  width: '100%', minHeight: 100, borderRadius: 12,
                  border: `2px dashed ${isDragOver ? 'var(--accent)' : 'var(--border-primary)'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 6, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500, cursor: 'pointer',
                  marginBottom: 12, padding: 16, boxSizing: 'border-box',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <Upload size={18} strokeWidth={1.8} color={isDragOver ? 'var(--accent)' : 'var(--text-faint)'} style={{ pointerEvents: 'none' }} />
                {isDragOver ? (
                  <span className="text-accent" style={{ pointerEvents: 'none' }}>{t('reservations.import.dropActive')}</span>
                ) : files.length > 0 ? (
                  <span style={{ color: 'var(--text-primary)', textAlign: 'center', wordBreak: 'break-all', pointerEvents: 'none' }}>{files.map((f) => f.name).join(', ')}</span>
                ) : (
                  <span style={{ color: 'var(--text-faint)', textAlign: 'center', pointerEvents: 'none' }}>{t('reservations.import.dropHere')}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                {previewItems.length === 0
                  ? t('reservations.import.previewEmpty')
                  : t('reservations.import.previewHeading', { count: previewItems.length })}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {previewItems.map((item, index) => (
                  <li
                    key={`${item.sourceFileName}-${index}`}
                    className="bg-surface-tertiary"
                    style={{ borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-content" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600 }}>
                        {item.title}
                      </div>
                      <div className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', marginTop: 2 }}>
                        {t(`reservations.type.${item.type}`)}
                        {item.confirmationCode ? ` · ${item.confirmationCode}` : ''}
                        {item.needsReview ? ` · ${t('reservations.import.needsReview')}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePreview(index)}
                      className="bg-transparent text-content-faint"
                      style={{ border: 'none', cursor: 'pointer', fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontFamily: 'inherit', padding: 4 }}
                    >
                      {t('reservations.import.removeItem')}
                    </button>
                  </li>
                ))}
              </ul>
              {warnings.length > 0 && (
                <div className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', marginTop: 10, whiteSpace: 'pre-wrap' }}>
                  {warnings.join('\n')}
                </div>
              )}
            </>
          )}

          {error && (
            <div role="alert" className="bg-[rgba(239,68,68,0.08)] text-[#b91c1c]" style={{ border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '8px 10px', fontSize: 'calc(12px * var(--fs-scale-body, 1))', whiteSpace: 'pre-wrap', marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-faint)' }}>
          {step === 'preview' ? (
            <>
              <button
                type="button"
                onClick={() => { setStep('drop'); setError('') }}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-primary)', background: 'none', color: 'var(--text-primary)', fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('reservations.import.back')}
              </button>
              <button
                type="button"
                onClick={handleConfirmPreview}
                disabled={previewItems.length === 0}
                className={previewItems.length > 0 ? 'bg-accent text-accent-text' : 'bg-surface-tertiary text-content-faint'}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500, cursor: previewItems.length > 0 ? 'pointer' : 'default', fontFamily: 'inherit' }}
              >
                {t('reservations.import.confirm', { count: previewItems.length })}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-primary)', background: 'none', color: 'var(--text-primary)', fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { void handleParse() }}
                disabled={files.length === 0 || loading}
                className={files.length > 0 && !loading ? 'bg-accent text-accent-text' : 'bg-surface-tertiary text-content-faint'}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500, cursor: files.length > 0 && !loading ? 'pointer' : 'default', fontFamily: 'inherit' }}
              >
                {loading ? t('reservations.import.parsing') : t('common.import')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
