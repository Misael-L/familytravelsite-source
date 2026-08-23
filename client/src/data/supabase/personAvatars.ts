import { getSupabaseBrowserClient } from './client'
import { normalizeImageFile } from '../../utils/convertHeic'
import { finalizePrivateUpload } from './privateUploads'
import type { FamilyDashboardTrip } from '../../pages/dashboard/familyDashboardModel'

/** iOS `people_avatar_refs` row — storage path is private family-bucket. */
export type PersonAvatarRef = {
  personId: string
  familyId: string
  displayName: string | null
  color: string | null
  avatarMediaId: string | null
  bucket: string | null
  storagePath: string | null
}

type AvatarRefRow = {
  person_id: string | null
  family_id: string | null
  display_name: string | null
  color: string | null
  avatar_media_id: string | null
  bucket: string | null
  storage_path: string | null
}

const SIGNED_URL_EXPIRES_SEC = 3600
export const FAMILY_AVATAR_BUCKET = 'family'
export const PERSON_AVATAR_MAX_BYTES = 8 * 1024 * 1024
const PERSON_AVATAR_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'] as const

export class PersonAvatarError extends Error {
  readonly code: 'too-large' | 'bad-type' | 'missing-ids'
  constructor(code: PersonAvatarError['code']) {
    super(code)
    this.name = 'PersonAvatarError'
    this.code = code
  }
}

async function sha256Hex(bytes: BufferSource): Promise<string> {
  const src = bytes instanceof Uint8Array
    ? bytes
    : bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const hash = await crypto.subtle.digest('SHA-256', src)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function avatarExt(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/avif') return 'avif'
  return 'jpg'
}

/** Family roster avatar refs — throw on `{ error }` (caller may soft-fail). */
export async function listPeopleAvatarRefs(familyId: string): Promise<PersonAvatarRef[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('people_avatar_refs')
    .select('person_id,family_id,display_name,color,avatar_media_id,bucket,storage_path')
    .eq('family_id', familyId)
  if (error) throw error
  const out: PersonAvatarRef[] = []
  for (const row of (data ?? []) as AvatarRefRow[]) {
    if (!row.person_id || !row.family_id) continue
    out.push({
      personId: row.person_id,
      familyId: row.family_id,
      displayName: row.display_name,
      color: row.color,
      avatarMediaId: row.avatar_media_id,
      bucket: row.bucket,
      storagePath: row.storage_path,
    })
  }
  return out
}

type SignedUrlRow = {
  signedUrl?: string | null
  error?: string | null
  path?: string | null
}

/**
 * Batch signed URLs for hub faces. Soft-fail per bucket/path — omit URL (initials).
 * `createSignedUrls` is the supabase-js StorageFileApi batch helper.
 */
export async function signAvatarUrls(
  refs: PersonAvatarRef[],
  personIds: string[],
): Promise<Record<string, string>> {
  const wanted = new Set(personIds)
  const byBucket = new Map<string, { personId: string; path: string }[]>()
  for (const ref of refs) {
    if (!wanted.has(ref.personId)) continue
    const bucket = ref.bucket?.trim()
    const path = ref.storagePath?.trim()
    if (!bucket || !path) continue
    const list = byBucket.get(bucket) ?? []
    list.push({ personId: ref.personId, path })
    byBucket.set(bucket, list)
  }

  const out: Record<string, string> = {}
  const storage = getSupabaseBrowserClient().storage
  for (const [bucket, items] of byBucket) {
    const { data, error } = await storage.from(bucket).createSignedUrls(
      items.map(i => i.path),
      SIGNED_URL_EXPIRES_SEC,
    )
    if (error || !data) continue
    const rows = data as SignedUrlRow[]
    for (let i = 0; i < items.length; i++) {
      const signed = rows[i]
      const url = signed?.signedUrl?.trim()
      if (url && !signed.error) out[items[i].personId] = url
    }
  }
  return out
}

/** Stamp TREK `hub_members.avatarUrl` only — do not change counts. */
export function attachHubMemberAvatars(
  trips: FamilyDashboardTrip[],
  urlByPersonId: Record<string, string>,
): FamilyDashboardTrip[] {
  return trips.map(trip => {
    if (!trip.hub_members?.length) return trip
    return {
      ...trip,
      hub_members: trip.hub_members.map(m => {
        const url = urlByPersonId[m.personId]
        return url ? { ...m, avatarUrl: url } : m
      }),
    }
  })
}

export const REGISTER_PERSON_AVATAR_FN = 'register_person_avatar'

/** Family-bucket path `{familyId}/people/{personId}/{uuid}.ext`. Namespaced hash avoids global unique collisions. */
export async function uploadPersonAvatar(opts: {
  familyId: string
  personId: string
  file: File
}): Promise<string | null> {
  const familyId = opts.familyId.trim()
  const personId = opts.personId.trim()
  if (!familyId || !personId) throw new PersonAvatarError('missing-ids')

  const file = await normalizeImageFile(opts.file)
  const mime = (file.type || '').toLowerCase()
  if (!(PERSON_AVATAR_MIME as readonly string[]).includes(mime)) {
    throw new PersonAvatarError('bad-type')
  }
  if (file.size > PERSON_AVATAR_MAX_BYTES) {
    throw new PersonAvatarError('too-large')
  }

  const hash = await sha256Hex(new Uint8Array(await file.arrayBuffer()))
  const sb = getSupabaseBrowserClient()

  const { data: existing, error: existingErr } = await sb
    .from('media_assets')
    .select('id,storage_path,filename')
    .eq('content_hash', `av:${personId}:${hash}`)
    .maybeSingle()
  if (existingErr) throw existingErr
  const existingRow = existing as { id?: string; storage_path?: string; filename?: string } | null
  const existingPath = existingRow?.storage_path?.trim()
  const existingName = existingRow?.filename?.trim() || existingPath?.split('/').pop()

  let path = existingPath
  let filename = existingName
  if (!path || !filename) {
    filename = `${crypto.randomUUID()}.${avatarExt(mime)}`
    path = `${familyId}/people/${personId}/${filename}`
    const { error: upErr } = await sb.storage.from(FAMILY_AVATAR_BUCKET).upload(path, file, {
      contentType: mime,
      upsert: false,
    })
    if (upErr) throw upErr
    const result = await finalizePrivateUpload({
      kind: 'person_avatar',
      path,
      personId,
      filename,
    }).catch(async err => {
      await sb.storage.from(FAMILY_AVATAR_BUCKET).remove([path]).catch(() => {})
      throw err
    })
    if (!result.media_id) throw new Error('register_person_avatar returned no media_id')
  } else {
    const { data, error } = await sb.rpc(REGISTER_PERSON_AVATAR_FN, {
      p_person_id: personId,
      p_storage_path: path,
      p_filename: filename,
      p_content_hash: hash,
      p_mime_type: mime,
      p_size_bytes: file.size,
    })
    if (error) throw error
    if (!(data as { media_id?: string } | null)?.media_id) {
      throw new Error('register_person_avatar returned no media_id')
    }
  }

  const refs = await listPeopleAvatarRefs(familyId)
  const urls = await signAvatarUrls(refs, [personId])
  return urls[personId] ?? null
}

export async function clearPersonAvatar(opts: { personId: string }): Promise<void> {
  const personId = opts.personId.trim()
  if (!personId) throw new PersonAvatarError('missing-ids')
  const { error } = await getSupabaseBrowserClient()
    .from('people')
    .update({ avatar_media_id: null })
    .eq('id', personId)
  if (error) throw error
}

