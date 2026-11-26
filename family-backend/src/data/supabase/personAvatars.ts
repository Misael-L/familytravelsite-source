import { captureFamilyOperation } from './operationContext'
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

export const SIGNED_URL_EXPIRES_SEC = 3600
export const FAMILY_AVATAR_BUCKET = 'family'
export const PERSON_AVATAR_MAX_BYTES = 8 * 1024 * 1024
const PERSON_AVATAR_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
] as const
export const AVATAR_OBJECT_PROBE_EXPIRES_SEC = 30
export const REGISTER_PERSON_AVATAR_FN = 'register_person_avatar'

export class PersonAvatarError extends Error {
  readonly code: 'too-large' | 'bad-type' | 'missing-ids' | 'not-authorized' | 'unavailable'
  constructor(code: PersonAvatarError['code']) {
    super(code)
    this.name = 'PersonAvatarError'
    this.code = code
  }
}

export function asPersonAvatarError(err: unknown): PersonAvatarError {
  if (err instanceof PersonAvatarError) return err
  const obj = err && typeof err === 'object' ? (err as { message?: unknown; code?: unknown }) : null
  const msg = [
    err instanceof Error ? err.message : '',
    typeof obj?.message === 'string' ? obj.message : '',
    typeof obj?.code === 'string' ? String(obj.code) : '',
    String(err ?? ''),
  ]
    .join(' ')
    .toLowerCase()
  if (
    msg.includes('42501') ||
    msg.includes('not authorized') ||
    msg.includes('not authenticated') ||
    msg.includes('unauthorized') ||
    msg.includes('owner mismatch')
  ) {
    return new PersonAvatarError('not-authorized')
  }
  if (msg.includes('too-large') || msg.includes('invalid avatar size')) {
    return new PersonAvatarError('too-large')
  }
  if (
    msg.includes('invalid avatar type') ||
    msg.includes('bad-type') ||
    msg.includes('size_or_mime') ||
    msg.includes('content_rejected')
  ) {
    return new PersonAvatarError('bad-type')
  }
  return new PersonAvatarError('unavailable')
}

export function personAvatarMessageKey(err: unknown): string {
  switch (asPersonAvatarError(err).code) {
    case 'too-large':
      return 'settings.avatarErrorTooLarge'
    case 'bad-type':
      return 'settings.avatarErrorType'
    case 'not-authorized':
      return 'settings.avatarUnauthorized'
    case 'missing-ids':
    case 'unavailable':
      return 'settings.avatarUnavailable'
  }
}

async function sha256Hex(bytes: BufferSource): Promise<string> {
  const operationContext = captureFamilyOperation()
  const src =
    bytes instanceof Uint8Array
      ? bytes
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const hash = await operationContext.perform(async () => crypto.subtle.digest('SHA-256', src))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
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
  const operationContext = captureFamilyOperation()
  const { data, error } = await operationContext.perform(async () =>
    getSupabaseBrowserClient()
      .from('people_avatar_refs')
      .select('person_id,family_id,display_name,color,avatar_media_id,bucket,storage_path')
      .eq('family_id', familyId)
  )
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
  personIds: string[]
): Promise<Record<string, string>> {
  const operationContext = captureFamilyOperation()
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
    const sign = async (entries: typeof items): Promise<SignedUrlRow[] | null> => {
      try {
        const { data, error } = await operationContext.perform(async () =>
          storage.from(bucket).createSignedUrls(entries.map((i) => i.path), SIGNED_URL_EXPIRES_SEC)
        )
        return error ? null : data
      } catch {
        operationContext.assertCurrent()
        return null
      }
    }
    const collect = (entries: typeof items, rows: SignedUrlRow[]) => {
      for (let i = 0; i < entries.length; i++) {
        const signed = rows[i]
        const url = signed?.signedUrl?.trim()
        if (url && !signed.error) out[entries[i].personId] = url
      }
    }
    const rows = await sign(items)
    if (rows) collect(items, rows)
    else if (items.length > 1) {
      // A stale reference can reject the entire batch at the host request fence.
      // Isolate each read once; every request still passes the same fence/RLS.
      for (const item of items) {
        const row = await sign([item])
        if (row) collect([item], row)
      }
    }
  }
  return out
}

/** Stamp TREK `hub_members.avatarUrl` only — do not change counts. */
export function attachHubMemberAvatars(
  trips: FamilyDashboardTrip[],
  urlByPersonId: Record<string, string>
): FamilyDashboardTrip[] {
  return trips.map((trip) => {
    if (!trip.hub_members?.length) return trip
    return {
      ...trip,
      hub_members: trip.hub_members.map((m) => {
        const url = urlByPersonId[m.personId]
        return url ? { ...m, avatarUrl: url } : m
      }),
    }
  })
}

/**
 * Short-lived existence probe. `createSignedUrl` is the Storage check;
 * discard the URL immediately. Never persist it or fetch the object.
 */
export async function familyAvatarObjectExists(
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number
      ) => Promise<{
        data: { signedUrl?: string | null } | null
        error: unknown
      }>
    }
  },
  path: string
): Promise<boolean> {
  const operationContext = captureFamilyOperation()
  try {
    const { data, error } = await operationContext.perform(async () =>
      storage.from(FAMILY_AVATAR_BUCKET).createSignedUrl(path, AVATAR_OBJECT_PROBE_EXPIRES_SEC)
    )
    return Boolean(!error && data?.signedUrl?.trim())
  } catch {
    operationContext.assertCurrent()
    return false
  }
}

/**
 * Mint a one-hour display URL for the current family person from `people_avatar_refs`.
 * Returns `null` when there is no pointer. Throws on list/sign failure so callers can
 * keep the in-memory URL instead of wiping it. Never persist the result.
 */
export async function resolveCurrentPersonAvatarUrl(opts: {
  familyId: string
  personId: string
}): Promise<string | null> {
  const operationContext = captureFamilyOperation()
  const familyId = opts.familyId.trim()
  const personId = opts.personId.trim()
  if (!familyId || !personId) return null

  const refs = await operationContext.perform(async () => listPeopleAvatarRefs(familyId))
  const ref = refs.find((r) => r.personId === personId)
  const bucket = ref?.bucket?.trim()
  const path = ref?.storagePath?.trim()
  if (!bucket || !path) return null

  const urls = await operationContext.perform(async () => signAvatarUrls(refs, [personId]))
  const url = urls[personId]
  if (url) return url
  throw new Error('avatar-sign-unavailable')
}

/** Family-bucket path `{familyId}/people/{personId}/{uuid}.ext`. Namespaced hash avoids global unique collisions. */
export async function uploadPersonAvatar(opts: {
  familyId: string
  personId: string
  file: File
}): Promise<string | null> {
  const operationContext = captureFamilyOperation()
  try {
    return await operationContext.perform(async () => uploadPersonAvatarInner(opts))
  } catch (err) {
    operationContext.assertCurrent()
    throw asPersonAvatarError(err)
  }
}

async function uploadPersonAvatarInner(opts: {
  familyId: string
  personId: string
  file: File
}): Promise<string | null> {
  const operationContext = captureFamilyOperation()
  const familyId = opts.familyId.trim()
  const personId = opts.personId.trim()
  if (!familyId || !personId) throw new PersonAvatarError('missing-ids')

  const file = await operationContext.perform(async () => normalizeImageFile(opts.file))
  const mime = (file.type || '').toLowerCase()
  if (!(PERSON_AVATAR_MIME as readonly string[]).includes(mime)) {
    throw new PersonAvatarError('bad-type')
  }
  if (file.size > PERSON_AVATAR_MAX_BYTES) {
    throw new PersonAvatarError('too-large')
  }

  const hash = await operationContext.perform(async () =>
    sha256Hex(new Uint8Array(await operationContext.perform(async () => file.arrayBuffer())))
  )
  const sb = getSupabaseBrowserClient()
  const storage = sb.storage

  const { data: existing, error: existingErr } = await operationContext.perform(async () =>
    sb
      .from('media_assets')
      .select('id,storage_path,filename')
      .eq('content_hash', `av:${personId}:${hash}`)
      .maybeSingle()
  )
  if (existingErr) throw existingErr
  const existingRow = existing as {
    id?: string
    storage_path?: string
    filename?: string
  } | null
  const existingPath = existingRow?.storage_path?.trim()
  const existingName = existingRow?.filename?.trim() || existingPath?.split('/').pop()

  if (
    !existingPath ||
    !existingName ||
    !(await operationContext.perform(async () => familyAvatarObjectExists(storage, existingPath)))
  ) {
    const filename = `${crypto.randomUUID()}.${avatarExt(mime)}`
    const path = `${familyId}/people/${personId}/${filename}`
    const { error: upErr } = await operationContext.perform(async () =>
      storage.from(FAMILY_AVATAR_BUCKET).upload(path, file, {
        contentType: mime,
        upsert: false,
      })
    )
    if (upErr) throw upErr
    // Finalization may have committed even when its acknowledgment is lost. Retain the source.
    const result = await operationContext.perform(async () =>
      finalizePrivateUpload({
        kind: 'person_avatar',
        path,
        personId,
        filename,
      })
    )
    if (!result.media_id) throw new Error('register_person_avatar returned no media_id')
  } else {
    const { data, error } = await operationContext.perform(async () =>
      sb.rpc(REGISTER_PERSON_AVATAR_FN, {
        p_person_id: personId,
        p_storage_path: existingPath,
        p_filename: existingName,
        p_content_hash: hash,
        p_mime_type: mime,
        p_size_bytes: file.size,
      })
    )
    if (error) throw error
    if (!(data as { media_id?: string } | null)?.media_id) {
      throw new Error('register_person_avatar returned no media_id')
    }
  }

  try {
    return await operationContext.perform(async () =>
      resolveCurrentPersonAvatarUrl({ familyId, personId })
    )
  } catch {
    operationContext.assertCurrent()
    return null
  }
}

export async function clearPersonAvatar(opts: { personId: string }): Promise<void> {
  const operationContext = captureFamilyOperation()
  const personId = opts.personId.trim()
  if (!personId) throw new PersonAvatarError('missing-ids')
  const { error } = await operationContext.perform(async () =>
    getSupabaseBrowserClient().from('people').update({ avatar_media_id: null }).eq('id', personId)
  )
  if (error) throw error
}
