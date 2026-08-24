import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useToast } from '../shared/Toast'
import { useTranslation, translateApiError } from '../../i18n'
import { useCanDo } from '../../store/permissionsStore'
import { useTripStore } from '../../store/tripStore'
import { isImage, isMedia, isWalletPass, resolveManagedFileUrl, triggerDownload } from './FileManager.helpers'
import { openFile as openFileInTab } from '../../utils/fileDownload'
import {
  nestFileManagerOps,
  resolveFileActionUrl,
  type FileAssignPatch,
  type FileEntityId,
  type FileManagerAssignments,
  type FileManagerDay,
  type FileManagerFile,
  type FileManagerOps,
  type FileManagerPlace,
  type FileManagerReservation,
} from './fileManagerOps'

const HOF = 'trip.explore.add.hofOnly'
const FILE_WRITE_ACTIONS = new Set(['file_upload', 'file_edit', 'file_delete'])

export interface FileManagerProps {
  files?: FileManagerFile[]
  onUpload: (fd: FormData) => Promise<any>
  onDelete: (fileId: FileEntityId) => Promise<void>
  onUpdate?: (fileId: FileEntityId, data?: Partial<FileManagerFile>) => Promise<void>
  places: FileManagerPlace[]
  days?: FileManagerDay[]
  assignments?: FileManagerAssignments
  reservations?: FileManagerReservation[]
  tripId: FileEntityId
  allowedFileTypes?: string | null
  /** Default Nest filesApi. Family injects tripFiles.ts. */
  ops?: FileManagerOps
  /** When set, file_upload / file_edit / file_delete follow HOF 2A instead of Nest permissions. */
  canMutate?: boolean
  canUpload?: boolean
  canEditMetadata?: boolean
  canTrash?: boolean
  /** Nest plugins stay on dev:nest. Family Files does not fetch plugin contributions. */
  enablePlugins?: boolean
  /** Family trip_file_links may target a trip day. Nest assign modal does not. */
  enableDayLinks?: boolean
}

/**
 * File manager state: upload (dropzone + paste), star/trash/restore, the
 * filter tabs, lightbox + PDF preview and the assign-to-place/reservation
 * modal. Kept in one hook so FileManager renders as thin layout sections.
 */
export function useFileManager({
  files = [],
  onUpload,
  onDelete,
  onUpdate,
  places,
  days = [],
  assignments = {},
  reservations = [],
  tripId,
  allowedFileTypes,
  ops = nestFileManagerOps,
  canMutate,
  canUpload,
  canEditMetadata,
  canTrash,
  enablePlugins = true,
  enableDayLinks = false,
}: FileManagerProps) {
  const [uploading, setUploading] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [trashFiles, setTrashFiles] = useState<FileManagerFile[]>([])
  const [loadingTrash, setLoadingTrash] = useState(false)
  const toast = useToast()
  const nestCan = useCanDo()
  const trip = useTripStore((s) => s.trip)
  const { t, locale } = useTranslation()

  const can = useCallback((action: string, ctx?: Parameters<typeof nestCan>[1]) => {
    if (action === 'file_upload' && canUpload !== undefined) return canUpload
    if (action === 'file_edit' && canEditMetadata !== undefined) return canEditMetadata
    if (action === 'file_delete' && canTrash !== undefined) return canTrash
    if (canMutate !== undefined && FILE_WRITE_ACTIONS.has(action)) return canMutate
    return nestCan(action, ctx)
  }, [canEditMetadata, canMutate, canTrash, canUpload, nestCan])

  const guardWrite = useCallback((): boolean => {
    if (canMutate === false) {
      toast.error(t(HOF))
      return false
    }
    return true
  }, [canMutate, toast, t])

  const loadTrash = useCallback(async () => {
    setLoadingTrash(true)
    try {
      setTrashFiles(await ops.listTrash(tripId))
    } catch { /* empty trash is still a valid screen */ }
    setLoadingTrash(false)
  }, [ops, tripId])

  const toggleTrash = useCallback(() => {
    if (!showTrash) loadTrash()
    setShowTrash(v => !v)
  }, [showTrash, loadTrash])

  const refreshFiles = useCallback(async () => {
    if (onUpdate) await onUpdate(0 as FileEntityId, {})
  }, [onUpdate])

  const handleStar = async (fileId: FileEntityId) => {
    if (!guardWrite()) return
    try {
      await ops.toggleStar(tripId, fileId)
      await refreshFiles()
    } catch {
      toast.error(t('files.toast.assignError') || 'Could not update file')
    }
  }

  const handleRestore = async (fileId: FileEntityId) => {
    if (!guardWrite()) return
    try {
      await ops.restore(tripId, fileId)
      setTrashFiles(prev => prev.filter(f => f.id !== fileId))
      await refreshFiles()
      toast.success(t('files.toast.restored'))
    } catch {
      toast.error(t('files.toast.restoreError'))
    }
  }

  const handlePermanentDelete = async (fileId: FileEntityId) => {
    if (!guardWrite()) return
    if (!confirm(t('files.confirm.permanentDelete'))) return
    try {
      await ops.permanentDelete(tripId, fileId)
      setTrashFiles(prev => prev.filter(f => f.id !== fileId))
      toast.success(t('files.toast.deleted'))
    } catch {
      toast.error(t('files.toast.deleteError'))
    }
  }

  const handleEmptyTrash = async () => {
    if (!guardWrite()) return
    if (!confirm(t('files.confirm.emptyTrash'))) return
    try {
      await ops.emptyTrash(tripId)
      setTrashFiles([])
      toast.success(t('files.toast.trashEmptied') || 'Trash emptied')
    } catch {
      toast.error(t('files.toast.deleteError'))
    }
  }

  const [previewFile, setPreviewFile] = useState<FileManagerFile | null>(null)
  const [previewFileUrl, setPreviewFileUrl] = useState('')
  const [assignFileId, setAssignFileId] = useState<FileEntityId | null>(null)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    if (!guardWrite()) return
    setUploading(true)
    const uploadedIds: FileEntityId[] = []
    try {
      for (const file of acceptedFiles) {
        const formData = new FormData()
        formData.append('file', file)
        const result = await onUpload(formData)
        const fileObj = result?.file || result
        if (fileObj?.id) uploadedIds.push(fileObj.id)
      }
      toast.success(t('files.uploaded', { count: acceptedFiles.length }))
      const lastId = uploadedIds[uploadedIds.length - 1]
      if (lastId && (places.length > 0 || reservations.length > 0 || (enableDayLinks && days.length > 0))) {
        setAssignFileId(lastId)
      }
    } catch (err) {
      toast.error(translateApiError(t, err, 'files.uploadError'))
    } finally {
      setUploading(false)
    }
  }, [onUpload, toast, t, places, reservations, days, enableDayLinks, guardWrite])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 50 * 1024 * 1024,
    noClick: false,
    onDropRejected: (rejections) => {
      if (rejections.some(r => r.errors.some(e => e.code === 'file-too-large'))) {
        toast.error(t('files.toast.tooLarge') || 'File exceeds 50 MB')
      }
    },
  })

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!can('file_upload', trip)) return
    const items = e.clipboardData?.items
    if (!items) return
    const pastedFiles: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) pastedFiles.push(file)
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault()
      onDrop(pastedFiles)
    }
  }, [onDrop, can, trip])

  const filteredFiles = files.filter(f => {
    if (filterType === 'starred') return !!f.starred
    if (filterType === 'pdf') return f.mime_type === 'application/pdf'
    if (filterType === 'image') return isImage(f.mime_type)
    if (filterType === 'doc') return (f.mime_type || '').includes('word') || (f.mime_type || '').includes('excel') || (f.mime_type || '').includes('text')
    if (filterType === 'collab') return !!f.note_id
    return true
  })

  const handleDelete = async (id: FileEntityId) => {
    if (!guardWrite()) return
    try {
      await onDelete(id)
      toast.success(t('files.toast.trashed') || 'Moved to trash')
    } catch {
      toast.error(t('files.toast.deleteError'))
    }
  }

  useEffect(() => {
    if (!previewFile) {
      setPreviewFileUrl('')
      return
    }
    let cancelled = false
    resolveFileActionUrl(previewFile, ops.resolveActionUrl)
      .then((url) => resolveManagedFileUrl(url))
      .then((url) => { if (!cancelled) setPreviewFileUrl(url) })
      .catch(() => { if (!cancelled) setPreviewFileUrl('') })
    return () => { cancelled = true }
  }, [previewFile?.id, ops.resolveActionUrl])

  const handleAssign = async (fileId: FileEntityId, data: FileAssignPatch) => {
    if (!guardWrite()) return
    try {
      await ops.update(tripId, fileId, data)
      await refreshFiles()
    } catch {
      toast.error(t('files.toast.assignError'))
    }
  }

  const mediaFiles = filteredFiles.filter(f => isMedia(f.mime_type))

  const openInTab = async (file: FileManagerFile) => {
    try {
      const url = await resolveFileActionUrl(file, ops.resolveActionUrl)
      await openFileInTab(url, file.original_name)
    } catch {
      toast.error(t('files.openError') || t('files.toast.openError'))
    }
  }

  const downloadManagedFile = async (file: FileManagerFile) => {
    try {
      const url = await resolveFileActionUrl(file, ops.resolveActionUrl)
      triggerDownload(url, file.original_name)
    } catch {
      toast.error(t('files.toast.downloadError') || t('files.downloadError'))
    }
  }

  const openFile = (file: FileManagerFile) => {
    if (isMedia(file.mime_type)) {
      const idx = mediaFiles.findIndex(f => f.id === file.id)
      setLightboxIndex(idx >= 0 ? idx : 0)
    } else if (isWalletPass(file.mime_type, file.original_name)) {
      void openInTab(file)
    } else {
      setPreviewFile(file)
    }
  }

  return {
    files, places, days, assignments, reservations, tripId, allowedFileTypes,
    ops, canMutate, enablePlugins, enableDayLinks,
    uploading, filterType, setFilterType, lightboxIndex, setLightboxIndex,
    showTrash, trashFiles, loadingTrash, toast, can, trip, t, locale,
    toggleTrash, refreshFiles, handleStar, handleRestore, handlePermanentDelete, handleEmptyTrash,
    previewFile, setPreviewFile, previewFileUrl, assignFileId, setAssignFileId,
    getRootProps, getInputProps, isDragActive, handlePaste, filteredFiles, handleDelete,
    handleAssign, mediaFiles, openFile, openInTab, downloadManagedFile,
  }
}

export type FileManagerState = ReturnType<typeof useFileManager>
