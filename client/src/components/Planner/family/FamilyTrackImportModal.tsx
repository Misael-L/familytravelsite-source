import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Upload } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { useToast } from '../../shared/Toast'
import {
  TrackParseError,
  parseGpxKmlFile,
  type ParsedTrack,
} from '../../../lib/tracks/parseGpxKml'
import { insertTripTrack } from '../../../data/supabase/tripTracks'

type FamilyTrackImportModalProps = {
  isOpen: boolean
  onClose: () => void
  tripId: string
  personId: string | null
  onImported: () => void
}

export default function FamilyTrackImportModal({
  isOpen,
  onClose,
  tripId,
  personId,
  onImported,
}: FamilyTrackImportModalProps): React.ReactElement | null {
  const { t } = useTranslation()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [gpxOpts, setGpxOpts] = useState({ waypoints: true, routes: true, tracks: true })
  const [kmlOpts, setKmlOpts] = useState({ points: true, paths: true })

  useEffect(() => {
    if (!isOpen) {
      setFiles([])
      setError('')
      setLoading(false)
      setIsDragOver(false)
      setGpxOpts({ waypoints: true, routes: true, tracks: true })
      setKmlOpts({ points: true, paths: true })
    }
  }, [isOpen])

  const validateFile = (f: File): string | null => {
    const ext = f.name.toLowerCase().split('.').pop()
    if (ext !== 'gpx' && ext !== 'kml' && ext !== 'kmz') {
      return t('places.importFileUnsupported')
    }
    if (f.size > 10 * 1024 * 1024) {
      return t('places.importFileTooLarge', { maxMb: 10 })
    }
    return null
  }

  const takeFiles = (list: FileList | File[] | null) => {
    if (!list) return
    const next = Array.from(list)
    const firstErr = next.map(validateFile).find(Boolean)
    if (firstErr) {
      setError(firstErr)
      return
    }
    setError('')
    setFiles(next)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    takeFiles(e.dataTransfer.files)
  }

  const parseErrorMessage = (err: unknown): string => {
    if (err instanceof TrackParseError) {
      if (err.code === 'unsupported') return t('places.importFileUnsupported')
      if (err.code === 'too_large') return t('places.importFileTooLarge', { maxMb: 10 })
      if (err.code === 'empty') return t('places.importEmpty')
      if (err.code === 'kmz') return t('places.importKmzError')
    }
    return t('places.importFileError')
  }

  const handleImport = async () => {
    if (!files.length || loading) return
    setLoading(true)
    setError('')
    const opts = {
      includeTracks: gpxOpts.tracks,
      includeRoutes: gpxOpts.routes,
      includeWaypoints: gpxOpts.waypoints,
      includeKmlPaths: kmlOpts.paths,
      includeKmlPoints: kmlOpts.points,
    }
    const parsed: ParsedTrack[] = []
    try {
      for (const file of files) {
        const tracks = await parseGpxKmlFile(file, opts)
        parsed.push(...tracks)
      }
      for (const track of parsed) {
        await insertTripTrack(tripId, {
          name: track.name,
          kind: track.kind,
          source: track.source,
          sourceFilename: track.sourceFilename,
          geometry: track.geometry,
          startLat: track.startLat,
          startLng: track.startLng,
          createdByPersonId: personId,
          waypoints: track.waypoints,
        })
      }
      toast.success(t('places.tracksImported', { count: parsed.length }))
      onImported()
      onClose()
    } catch (err) {
      setError(parseErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const exts = files.map(f => f.name.toLowerCase().split('.').pop() ?? '')
  const isGpx = exts.includes('gpx')
  const isKml = exts.some(e => e === 'kml' || e === 'kmz')
  const gpxNoneSelected = isGpx && !gpxOpts.waypoints && !gpxOpts.routes && !gpxOpts.tracks
  const kmlNoneSelected = isKml && !kmlOpts.points && !kmlOpts.paths
  const canImport = files.length > 0 && !loading && !gpxNoneSelected && !kmlNoneSelected

  if (!isOpen) return null

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      className="bg-[rgba(0,0,0,0.4)]"
      style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-surface-card"
        style={{ borderRadius: 16, width: '100%', maxWidth: 520, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', fontFamily: 'var(--font-system)' }}
      >
        <div style={{ fontSize: 'calc(15px * var(--fs-scale-subtitle, 1))', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          {t('places.importFile')}
        </div>
        <div style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', color: 'var(--text-faint)', marginBottom: 14, lineHeight: 1.45 }}>
          {t('places.importFileHint')}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx,.kml,.kmz"
          multiple
          style={{ display: 'none' }}
          onChange={e => takeFiles(e.target.files)}
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={isDragOver ? 'bg-surface-tertiary' : 'bg-transparent'}
          style={{
            width: '100%',
            minHeight: 88,
            borderRadius: 12,
            border: `2px dashed ${isDragOver ? 'var(--accent)' : 'var(--border-primary)'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 'calc(13px * var(--fs-scale-body, 1))',
            fontWeight: 500,
            cursor: 'pointer',
            marginBottom: 12,
            fontFamily: 'inherit',
            transition: 'border-color 0.15s, background 0.15s',
            boxSizing: 'border-box',
            padding: 16,
          }}
        >
          <Upload size={18} strokeWidth={1.8} color={isDragOver ? 'var(--accent)' : 'var(--text-faint)'} style={{ pointerEvents: 'none' }} />
          {isDragOver ? (
            <span className="text-accent" style={{ pointerEvents: 'none' }}>{t('places.importFileDropActive')}</span>
          ) : files.length > 0 ? (
            <span style={{ color: 'var(--text-primary)', textAlign: 'center', wordBreak: 'break-all', pointerEvents: 'none' }}>{files.map(f => f.name).join(', ')}</span>
          ) : (
            <span style={{ color: 'var(--text-faint)', textAlign: 'center', pointerEvents: 'none' }}>{t('places.importFileDropHere')}</span>
          )}
        </div>

        {isGpx && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('places.gpxImportTypes')}
            </div>
            {(['waypoints', 'routes', 'tracks'] as const).map(key => (
              <label key={key} onClick={() => setGpxOpts(prev => ({ ...prev, [key]: !prev[key] }))} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <div className={gpxOpts[key] ? 'bg-accent' : 'bg-transparent'} style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: gpxOpts[key] ? 'none' : '1.5px solid var(--border-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {gpxOpts[key] && <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <span style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', color: 'var(--text-primary)', userSelect: 'none' }}>
                  {t(key === 'waypoints' ? 'places.gpxImportWaypoints' : key === 'routes' ? 'places.gpxImportRoutes' : 'places.gpxImportTracks')}
                </span>
              </label>
            ))}
            {gpxNoneSelected && (
              <div className="text-[#b45309]" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', marginTop: 4 }}>{t('places.gpxImportNoneSelected')}</div>
            )}
          </div>
        )}

        {isKml && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('places.kmlImportTypes')}
            </div>
            {(['points', 'paths'] as const).map(key => (
              <label key={key} onClick={() => setKmlOpts(prev => ({ ...prev, [key]: !prev[key] }))} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <div className={kmlOpts[key] ? 'bg-accent' : 'bg-transparent'} style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: kmlOpts[key] ? 'none' : '1.5px solid var(--border-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {kmlOpts[key] && <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <span style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', color: 'var(--text-primary)', userSelect: 'none' }}>
                  {t(key === 'points' ? 'places.kmlImportPoints' : 'places.kmlImportPaths')}
                </span>
              </label>
            ))}
            {kmlNoneSelected && (
              <div className="text-[#b45309]" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', marginTop: 4 }}>{t('places.kmlImportNoneSelected')}</div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-[rgba(239,68,68,0.08)] text-[#b91c1c]" style={{
            border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10,
            padding: '8px 10px',
            fontSize: 'calc(12px * var(--fs-scale-body, 1))', whiteSpace: 'pre-wrap', marginBottom: 10,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-primary)',
              background: 'none', color: 'var(--text-primary)', fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => { void handleImport() }}
            disabled={!canImport}
            className={canImport ? 'bg-accent text-accent-text' : 'bg-surface-tertiary text-content-faint'}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none',
              fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500, cursor: canImport ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}
          >
            {loading ? t('common.loading') : t('common.import')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
