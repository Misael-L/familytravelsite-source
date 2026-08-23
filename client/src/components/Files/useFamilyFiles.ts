import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import type { FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'
import { listTripBookings, listTripTransports } from '../../data/supabase/tripReservations'
import {
  listTripFiles,
  signedTripFileUrls,
  softDeleteTripFile,
  uploadTripFile,
  type FamilyTripFile,
} from '../../data/supabase/tripFiles'
import { listTripTravelers } from '../../data/supabase/tripTravelers'
import {
  createFamilyFileManagerOps,
  toFileManagerAssignments,
  toFileManagerDays,
  toFileManagerFile,
  toFileManagerPlaces,
} from './familyFileManager'
import type { FileManagerFile, FileManagerReservation } from './fileManagerOps'
import type { FileManagerProps } from './useFileManager'

const ALLOWED = 'jpg,jpeg,png,gif,webp,heic,pdf,doc,docx,xls,xlsx,txt,csv,md,mp4,pkpass'

export type FamilyFilesPanelProps = {
  tripId: string
  familyId: string
  canMutate: boolean
  canUpload?: boolean
  canEditMetadata?: boolean
  canTrash?: boolean
  mePersonId: string | null
  places: FamilyTripPlace[]
  days: FamilyTripDay[]
  scheduleItems: FamilyScheduleItem[]
}

/** Loads Family trip_files and returns TREK FileManager props. No Nest filesApi. */
export function useFamilyFiles({
  tripId,
  familyId,
  canMutate,
  canUpload,
  canEditMetadata,
  canTrash,
  mePersonId,
  places,
  days,
  scheduleItems,
}: FamilyFilesPanelProps): FileManagerProps {
  const toast = useToast()
  const { t } = useTranslation()
  const [nativeFiles, setNativeFiles] = useState<FamilyTripFile[]>([])
  const [trash, setTrash] = useState<FamilyTripFile[]>([])
  const [files, setFiles] = useState<FileManagerFile[]>([])
  const [reservations, setReservations] = useState<FileManagerReservation[]>([])
  const snapshotRef = useRef({ files: nativeFiles, trash })
  snapshotRef.current = { files: nativeFiles, trash }
  const namesRef = useRef(new Map<string, string>())

  const ops = useMemo(() => createFamilyFileManagerOps({
    tripId,
    getSnapshot: () => snapshotRef.current,
    getUploader: (personId) => personId ? { name: namesRef.current.get(personId) ?? null } : undefined,
  }), [tripId])

  const reload = useCallback(async () => {
    const [active, dumped, bookings, transports, travelers] = await Promise.all([
      listTripFiles(tripId),
      listTripFiles(tripId, { trash: true }),
      listTripBookings(tripId),
      listTripTransports(tripId),
      listTripTravelers(tripId).catch(() => []),
    ])
    const urls = await signedTripFileUrls(active.map(f => f.storagePath))
    const names = new Map<string, string>()
    for (const tr of travelers) names.set(tr.personId, tr.displayName)
    namesRef.current = names
    setNativeFiles(active)
    setTrash(dumped)
    setFiles(active.map(f => toFileManagerFile(
      f,
      urls.get(f.storagePath) || '',
      { name: f.uploadedBy ? names.get(f.uploadedBy) ?? null : null },
    )))
    setReservations([
      ...bookings.map(r => ({ id: r.id, title: r.title || r.type, type: r.type })),
      ...transports.map(r => ({ id: r.id, title: r.title || r.type, type: r.type })),
    ])
  }, [tripId])

  useEffect(() => {
    void reload().catch(err => toast.error(err instanceof Error ? err.message : String(err)))
  }, [reload])

  const onUpload = useCallback(async (fd: FormData) => {
    const file = fd.get('file')
    if (!(file instanceof File)) throw new Error(t('files.uploadError') || 'missing file')
    const id = await uploadTripFile({ familyId, tripId, file, uploadedBy: mePersonId })
    await reload()
    return { file: { id } }
  }, [familyId, tripId, mePersonId, reload, t])

  const onDelete = useCallback(async (fileId: string | number) => {
    await softDeleteTripFile(String(fileId))
    await reload()
  }, [reload])

  return {
    files,
    onUpload,
    onDelete,
    onUpdate: reload,
    places: toFileManagerPlaces(places),
    days: toFileManagerDays(days),
    assignments: toFileManagerAssignments(days, scheduleItems, places),
    reservations,
    tripId,
    allowedFileTypes: ALLOWED,
    ops,
    canMutate,
    canUpload: canUpload ?? canMutate,
    canEditMetadata: canEditMetadata ?? canMutate,
    canTrash: canTrash ?? canMutate,
    enablePlugins: false,
    enableDayLinks: true,
  }
}
