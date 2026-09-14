import { filesApi } from '../../api/client'
import type { TripFile } from '../../types'

/** Nest numeric ids or Family UUIDs. Never hash one into the other. */
export type FileEntityId = string | number

export type FileManagerPlace = { id: FileEntityId; name: string }

export type FileManagerDay = {
  id: FileEntityId
  title?: string | null
  date?: string | null
  day_number?: number
}

export type FileManagerReservation = {
  id: FileEntityId
  title?: string | null
  type: string
}

export type FileManagerAssignment = {
  place_id?: FileEntityId | null
  place?: { id: FileEntityId; name?: string | null } | null
}

export type FileManagerAssignments = Record<string, FileManagerAssignment[]>

export type FileManagerFile = {
  id: FileEntityId
  trip_id: FileEntityId
  place_id?: FileEntityId | null
  reservation_id?: FileEntityId | null
  note_id?: FileEntityId | null
  uploaded_by?: FileEntityId | null
  uploaded_by_name?: string | null
  uploaded_by_avatar?: string | null
  filename: string
  original_name: string
  file_size?: number | null
  mime_type: string | null
  description?: string | null
  starred?: number | boolean
  deleted_at?: string | null
  created_at: string
  linked_reservation_ids?: (FileEntityId | null)[]
  linked_place_ids?: (FileEntityId | null)[]
  linked_day_ids?: (FileEntityId | null)[]
  url: string
}

export type FileAssignPatch = {
  place_id?: FileEntityId | null
  reservation_id?: FileEntityId | null
  trip_day_id?: FileEntityId | null
  description?: string | null
}

export type FileManagerLink = {
  id: FileEntityId
  place_id?: FileEntityId | null
  reservation_id?: FileEntityId | null
  trip_day_id?: FileEntityId | null
}

/**
 * Persistence port for FileManager. Nest default = filesApi.
 * Family injects tripFiles.ts. Pixels stay in FileManager.tsx.
 */
export type FileManagerOps = {
  listTrash: (tripId: FileEntityId) => Promise<FileManagerFile[]>
  toggleStar: (tripId: FileEntityId, fileId: FileEntityId) => Promise<void>
  restore: (tripId: FileEntityId, fileId: FileEntityId) => Promise<void>
  permanentDelete: (tripId: FileEntityId, fileId: FileEntityId) => Promise<void>
  emptyTrash: (tripId: FileEntityId) => Promise<void>
  update: (tripId: FileEntityId, fileId: FileEntityId, data: FileAssignPatch) => Promise<void>
  getLinks: (tripId: FileEntityId, fileId: FileEntityId) => Promise<{ links: FileManagerLink[] }>
  addLink: (tripId: FileEntityId, fileId: FileEntityId, data: FileAssignPatch) => Promise<void>
  removeLink: (tripId: FileEntityId, fileId: FileEntityId, linkId: FileEntityId) => Promise<void>
  /** Family: mint a fresh ~120s signed URL. Nest omits this and keeps `file.url`. */
  resolveActionUrl?: (file: FileManagerFile) => Promise<string>
}

export async function resolveFileActionUrl(
  file: FileManagerFile,
  resolve?: (file: FileManagerFile) => Promise<string>,
): Promise<string> {
  if (resolve) return resolve(file)
  return file.url
}

function nestFileId(id: FileEntityId): number {
  return typeof id === 'number' ? id : Number(id)
}

export const nestFileManagerOps: FileManagerOps = {
  listTrash: async (tripId) => {
    const data = await filesApi.list(tripId, true)
    return (data.files || []) as TripFile[]
  },
  toggleStar: (tripId, fileId) => filesApi.toggleStar(tripId, nestFileId(fileId)).then(() => undefined),
  restore: (tripId, fileId) => filesApi.restore(tripId, nestFileId(fileId)).then(() => undefined),
  permanentDelete: (tripId, fileId) => filesApi.permanentDelete(tripId, nestFileId(fileId)).then(() => undefined),
  emptyTrash: (tripId) => filesApi.emptyTrash(tripId).then(() => undefined),
  update: (tripId, fileId, data) => filesApi.update(tripId, nestFileId(fileId), data).then(() => undefined),
  getLinks: async (tripId, fileId) => {
    const data = await filesApi.getLinks(tripId, nestFileId(fileId))
    return { links: data.links || [] }
  },
  addLink: (tripId, fileId, data) => filesApi.addLink(tripId, nestFileId(fileId), data).then(() => undefined),
  removeLink: (tripId, fileId, linkId) =>
    filesApi.removeLink(tripId, nestFileId(fileId), nestFileId(linkId)).then(() => undefined),
}
