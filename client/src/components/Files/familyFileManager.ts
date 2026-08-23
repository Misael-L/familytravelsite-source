import { groupScheduleByCivilDay, type FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'
import {
  addTripFileLink,
  emptyTripFileTrash,
  listTripFileLinks,
  listTripFiles,
  patchTripFile,
  permanentlyDeleteTripFile,
  removeTripFileLink,
  restoreTripFile,
  signedTripFileUrls,
  type FamilyTripFile,
} from '../../data/supabase/tripFiles'
import type {
  FileAssignPatch,
  FileEntityId,
  FileManagerAssignments,
  FileManagerDay,
  FileManagerFile,
  FileManagerLink,
  FileManagerOps,
  FileManagerPlace,
  FileManagerReservation,
} from './fileManagerOps'

export function toFileManagerFile(
  file: FamilyTripFile,
  signedUrl: string,
  uploader?: { name?: string | null; avatarUrl?: string | null },
): FileManagerFile {
  const placeLinks = file.links.filter(l => l.placeId)
  const resLinks = file.links.filter(l => l.reservationId)
  const dayLinks = file.links.filter(l => l.tripDayId)
  return {
    id: file.id,
    trip_id: file.tripId,
    filename: file.originalName,
    original_name: file.originalName,
    mime_type: file.mimeType || '',
    file_size: file.sizeBytes,
    created_at: file.createdAt,
    url: signedUrl,
    starred: file.starred ? 1 : 0,
    deleted_at: file.deletedAt,
    description: file.description,
    uploaded_by: file.uploadedBy,
    uploaded_by_name: uploader?.name ?? null,
    uploaded_by_avatar: uploader?.avatarUrl ?? null,
    place_id: placeLinks[0]?.placeId ?? null,
    reservation_id: resLinks[0]?.reservationId ?? null,
    linked_place_ids: placeLinks.slice(1).map(l => l.placeId),
    linked_reservation_ids: resLinks.slice(1).map(l => l.reservationId),
    linked_day_ids: dayLinks.map(l => l.tripDayId),
    note_id: null,
  }
}

export function toFileManagerPlaces(places: FamilyTripPlace[]): FileManagerPlace[] {
  return places.map(p => ({ id: p.id, name: p.name }))
}

export function toFileManagerDays(days: FamilyTripDay[]): FileManagerDay[] {
  return days.map(d => ({
    id: d.id,
    title: d.title,
    date: d.civilDay,
    day_number: d.dayIndex + 1,
  }))
}

export function toFileManagerAssignments(
  days: FamilyTripDay[],
  scheduleItems: FamilyScheduleItem[],
  places: FamilyTripPlace[],
): FileManagerAssignments {
  const grouped = groupScheduleByCivilDay(scheduleItems, days)
  const out: FileManagerAssignments = {}
  for (const day of days) {
    const rows: FileManagerAssignments[string] = []
    for (const item of grouped.get(day.id) ?? []) {
      if (!item.placeId) continue
      const place = places.find(p => p.id === item.placeId)
      rows.push({
        place_id: item.placeId,
        place: { id: item.placeId, name: place?.name ?? item.activity },
      })
    }
    if (rows.length) out[day.id] = rows
  }
  return out
}

function asId(id: FileEntityId): string {
  return String(id)
}

function toLinkDto(l: { id: string; placeId: string | null; reservationId: string | null; tripDayId: string | null }): FileManagerLink {
  return {
    id: l.id,
    place_id: l.placeId,
    reservation_id: l.reservationId,
    trip_day_id: l.tripDayId,
  }
}

async function unlinkFirst(
  fileId: string,
  match: (l: Awaited<ReturnType<typeof listTripFileLinks>>[number]) => boolean,
): Promise<void> {
  const links = await listTripFileLinks(fileId)
  const hit = links.find(match)
  if (hit) await removeTripFileLink(hit.id)
}

async function applyAssignPatch(fileId: string, data: FileAssignPatch): Promise<void> {
  if (data.description !== undefined) {
    await patchTripFile(fileId, { description: data.description })
  }
  if (data.place_id !== undefined) {
    if (data.place_id == null) await unlinkFirst(fileId, l => !!l.placeId)
    else await addTripFileLink(fileId, { placeId: asId(data.place_id) })
  }
  if (data.reservation_id !== undefined) {
    if (data.reservation_id == null) await unlinkFirst(fileId, l => !!l.reservationId)
    else await addTripFileLink(fileId, { reservationId: asId(data.reservation_id) })
  }
  if (data.trip_day_id !== undefined) {
    if (data.trip_day_id == null) await unlinkFirst(fileId, l => !!l.tripDayId)
    else await addTripFileLink(fileId, { tripDayId: asId(data.trip_day_id) })
  }
}

export function createFamilyFileManagerOps(ctx: {
  tripId: string
  getSnapshot: () => { files: FamilyTripFile[]; trash: FamilyTripFile[] }
  getUploader?: (personId: string | null) => { name?: string | null; avatarUrl?: string | null }
}): FileManagerOps {
  const find = (fileId: FileEntityId): FamilyTripFile | undefined => {
    const id = asId(fileId)
    const { files, trash } = ctx.getSnapshot()
    return files.find(f => f.id === id) || trash.find(f => f.id === id)
  }

  const requireFile = async (fileId: FileEntityId): Promise<FamilyTripFile> => {
    const local = find(fileId)
    if (local) return local
    const [active, trash] = await Promise.all([
      listTripFiles(ctx.tripId),
      listTripFiles(ctx.tripId, { trash: true }),
    ])
    const hit = [...active, ...trash].find(f => f.id === asId(fileId))
    if (!hit) throw new Error('file not found')
    return hit
  }

  const mapFiles = async (rows: FamilyTripFile[]): Promise<FileManagerFile[]> => {
    const urls = await signedTripFileUrls(rows.map(f => f.storagePath))
    return rows.map(f => toFileManagerFile(f, urls.get(f.storagePath) || '', ctx.getUploader?.(f.uploadedBy)))
  }

  return {
    listTrash: async () => mapFiles(await listTripFiles(ctx.tripId, { trash: true })),
    toggleStar: async (_tripId, fileId) => {
      const file = await requireFile(fileId)
      await patchTripFile(file.id, { starred: !file.starred })
    },
    restore: async (_tripId, fileId) => {
      await restoreTripFile(asId(fileId))
    },
    permanentDelete: async (_tripId, fileId) => {
      await permanentlyDeleteTripFile(await requireFile(fileId))
    },
    emptyTrash: async () => {
      await emptyTripFileTrash(ctx.tripId)
    },
    update: async (_tripId, fileId, data) => {
      await applyAssignPatch(asId(fileId), data)
    },
    getLinks: async (_tripId, fileId) => {
      const links = await listTripFileLinks(asId(fileId))
      return { links: links.map(toLinkDto) }
    },
    addLink: async (_tripId, fileId, data) => {
      await addTripFileLink(asId(fileId), {
        placeId: data.place_id != null ? asId(data.place_id) : null,
        reservationId: data.reservation_id != null ? asId(data.reservation_id) : null,
        tripDayId: data.trip_day_id != null ? asId(data.trip_day_id) : null,
      })
    },
    removeLink: async (_tripId, _fileId, linkId) => {
      await removeTripFileLink(asId(linkId))
    },
  }
}

