import { getSupabaseBrowserClient } from './client'
import { normalizeImageFile } from '../../utils/convertHeic'
import { finalizePrivateUpload } from './privateUploads'

export const TRIP_FILE_MAX_BYTES = 50 * 1024 * 1024
export const TRIP_FILES_BUCKET = 'trip-files'

export const TRIP_FILE_ACCEPT = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'image/heic', 'image/heif',
  'video/mp4',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/markdown', 'text/csv',
  'application/vnd.apple.pkpass',
]

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  pkpass: 'application/vnd.apple.pkpass',
}

export function mimeFromFileName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] ?? null
}

/** Prefer a declared browser MIME; if empty/octet-stream, infer from the filename. */
export function resolvedTripFileMime(file: Pick<File, 'name' | 'type'>): string {
  const declared = (file.type || '').toLowerCase().trim()
  if (declared && declared !== 'application/octet-stream' && TRIP_FILE_ACCEPT.includes(declared)) {
    return declared
  }
  const inferred = mimeFromFileName(file.name)
  if (inferred && TRIP_FILE_ACCEPT.includes(inferred)) return inferred
  throw new Error('unsupported_file_type')
}

export type FamilyTripFileLink = {
  id: string
  fileId: string
  placeId: string | null
  reservationId: string | null
  tripDayId: string | null
}

export type FamilyTripFile = {
  id: string
  tripId: string
  storagePath: string
  originalName: string
  mimeType: string | null
  sizeBytes: number
  uploadedBy: string | null
  starred: boolean
  description: string | null
  deletedAt: string | null
  createdAt: string
  links: FamilyTripFileLink[]
  signedUrl?: string | null
}

type FileRow = {
  id: string
  trip_id: string
  storage_path: string
  original_name: string
  mime_type: string | null
  size_bytes: number
  uploaded_by: string | null
  starred: boolean
  description: string | null
  deleted_at: string | null
  created_at: string
}

type LinkRow = {
  id: string
  file_id: string
  place_id: string | null
  reservation_id: string | null
  trip_day_id: string | null
}

function mapFile(row: FileRow, links: FamilyTripFileLink[]): FamilyTripFile {
  return {
    id: row.id,
    tripId: row.trip_id,
    storagePath: row.storage_path,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes) || 0,
    uploadedBy: row.uploaded_by,
    starred: !!row.starred,
    description: row.description,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    links,
  }
}

function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'file'
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file'
}

export async function listTripFiles(tripId: string, opts?: { trash?: boolean }): Promise<FamilyTripFile[]> {
  const sb = getSupabaseBrowserClient()
  let q = sb.from('trip_files').select(
    'id,trip_id,storage_path,original_name,mime_type,size_bytes,uploaded_by,starred,description,deleted_at,created_at',
  ).eq('trip_id', tripId)
  q = opts?.trash ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
  const [filesRes, linksRes] = await Promise.all([
    q.order('created_at', { ascending: false }),
    sb.from('trip_file_links').select('id,file_id,place_id,reservation_id,trip_day_id').eq('trip_id', tripId),
  ])
  if (filesRes.error) throw filesRes.error
  if (linksRes.error) throw linksRes.error
  const byFile = new Map<string, FamilyTripFileLink[]>()
  for (const row of (linksRes.data ?? []) as LinkRow[]) {
    const list = byFile.get(row.file_id) ?? []
    list.push({
      id: row.id,
      fileId: row.file_id,
      placeId: row.place_id,
      reservationId: row.reservation_id,
      tripDayId: row.trip_day_id,
    })
    byFile.set(row.file_id, list)
  }
  return ((filesRes.data ?? []) as FileRow[]).map(row => mapFile(row, byFile.get(row.id) ?? []))
}

export async function signedTripFileUrl(storagePath: string, expiresIn = 120): Promise<string> {
  const { data, error } = await getSupabaseBrowserClient()
    .storage.from(TRIP_FILES_BUCKET)
    .createSignedUrl(storagePath, expiresIn)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('signed url missing')
  return data.signedUrl
}

export async function signedTripFileUrls(
  storagePaths: string[],
  expiresIn = 120,
): Promise<Map<string, string>> {
  const unique = [...new Set(storagePaths.filter(Boolean))]
  const out = new Map<string, string>()
  if (unique.length === 0) return out
  const { data, error } = await getSupabaseBrowserClient()
    .storage.from(TRIP_FILES_BUCKET)
    .createSignedUrls(unique, expiresIn)
  if (error) throw error
  for (let i = 0; i < unique.length; i++) {
    const signed = data?.[i]?.signedUrl
    if (signed && !data[i]?.error) out.set(unique[i], signed)
  }
  return out
}

export async function listTripFileLinks(fileId: string): Promise<FamilyTripFileLink[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_file_links')
    .select('id,file_id,place_id,reservation_id,trip_day_id')
    .eq('file_id', fileId)
  if (error) throw error
  return ((data ?? []) as LinkRow[]).map(row => ({
    id: row.id,
    fileId: row.file_id,
    placeId: row.place_id,
    reservationId: row.reservation_id,
    tripDayId: row.trip_day_id,
  }))
}

export async function uploadTripFile(input: {
  familyId: string
  tripId: string
  file: File
  uploadedBy: string | null
}): Promise<string> {
  const file = await normalizeImageFile(input.file)
  if (file.size > TRIP_FILE_MAX_BYTES) {
    throw new Error('File exceeds 50 MB')
  }
  const contentType = resolvedTripFileMime(file)
  const path = `${input.familyId}/${input.tripId}/${crypto.randomUUID()}_${safeFileName(file.name)}`
  const sb = getSupabaseBrowserClient()
  const { error: upErr } = await sb.storage.from(TRIP_FILES_BUCKET).upload(path, file, {
    contentType,
    upsert: false,
  })
  if (upErr) throw upErr
  try {
    const result = await finalizePrivateUpload({
      kind: 'trip_file',
      path,
      tripId: input.tripId,
      originalName: file.name,
    })
    const id = String(result.id ?? '')
    if (!id) throw new Error('register_trip_file returned no id')
    return id
  } catch (err) {
    await sb.storage.from(TRIP_FILES_BUCKET).remove([path]).catch(() => {})
    throw err
  }
}

export async function patchTripFile(
  fileId: string,
  patch: Partial<{ starred: boolean; description: string | null }>,
): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('patch_trip_file_metadata', {
    p_file_id: fileId,
    p_starred: patch.starred ?? null,
    p_description: patch.description === undefined ? null : patch.description,
  })
  if (error) throw error
}

export async function softDeleteTripFile(fileId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('trash_trip_file', { p_file_id: fileId })
  if (error) throw error
}

export async function restoreTripFile(fileId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('restore_trip_file', { p_file_id: fileId })
  if (error) throw error
}

export async function permanentlyDeleteTripFile(file: Pick<FamilyTripFile, 'id' | 'storagePath'>): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('purge_trip_file', { p_file_id: file.id })
  if (error) throw error
}

export async function emptyTripFileTrash(tripId: string): Promise<void> {
  const trash = await listTripFiles(tripId, { trash: true })
  for (const file of trash) {
    await permanentlyDeleteTripFile(file)
  }
}

export async function addTripFileLink(
  fileId: string,
  target: { placeId?: string | null; reservationId?: string | null; tripDayId?: string | null },
): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('link_trip_file', {
    p_file_id: fileId,
    p_place_id: target.placeId || null,
    p_reservation_id: target.reservationId || null,
    p_trip_day_id: target.tripDayId || null,
  })
  if (error) throw error
}

export async function removeTripFileLink(linkId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('unlink_trip_file', { p_link_id: linkId })
  if (error) throw error
}

export function filesForPlace(files: FamilyTripFile[], placeId: string): FamilyTripFile[] {
  return files.filter(f => f.links.some(l => l.placeId === placeId))
}

export function filesForReservation(files: FamilyTripFile[], reservationId: string): FamilyTripFile[] {
  return files.filter(f => f.links.some(l => l.reservationId === reservationId))
}
