import { z } from 'zod'
import { CHAT_IMAGE_TYPES, MAX_CHAT_IMAGE_BYTES, MAX_CHAT_IMAGES } from '../../components/Collab/useChatImages'
import { getSupabaseBrowserClient } from './legacy/data/supabase/client'
import { FamilyApiError, type FamilyFrontendRepository } from './repository'

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': bytes => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
  'image/png': bytes => [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte),
  'image/gif': bytes => /^GIF8[79]a$/.test(new TextDecoder().decode(bytes.slice(0, 6))),
  'image/webp': bytes => {
    const decoder = new TextDecoder()
    return decoder.decode(bytes.slice(0, 4)) === 'RIFF' && decoder.decode(bytes.slice(8, 12)) === 'WEBP'
  },
}

const imageDraft = z.object({
  operationId: z.uuidv4(),
  text: z.string().trim().max(5000),
  replyTo: z.number().int().positive().optional(),
})

function invalidImage() {
  return new FamilyApiError(422, 'collab_image_invalid', 'Choose up to four JPEG, PNG, GIF or WebP images under 10 MB each.')
}

export function readChatDraft(body: unknown) {
  if (!(body instanceof FormData)) {
    const draft = imageDraft.strict().safeParse(body)
    if (!draft.success || !draft.data.text) {
      throw new FamilyApiError(422, 'collab_chat_invalid', 'Enter a message or attach an image.')
    }
    return { draft: draft.data, files: [] as File[] }
  }

  const replyTo = body.get('replyTo')
  const draft = imageDraft.safeParse({
    operationId: body.get('operationId'), text: body.get('text'), replyTo: replyTo === null ? undefined : Number(replyTo),
  })
  if (!draft.success) throw new FamilyApiError(422, 'collab_chat_invalid', 'The chat draft is invalid.')
  const files = body.getAll('file')
  if (!files.length || files.length > MAX_CHAT_IMAGES || !files.every((file): file is File => file instanceof File
      && file.size > 0 && file.size <= MAX_CHAT_IMAGE_BYTES && CHAT_IMAGE_TYPES.includes(file.type))) throw invalidImage()
  return { draft: draft.data, files }
}

export async function stageChatImages(repo: FamilyFrontendRepository, tripId: string, operationId: string, files: File[]) {
  if (!files.length) return []
  const scope = repo.captureContext(tripId)
  const { familyId, userId } = await scope.perform(() => repo.session())
  const prepared = []
  for (const file of files) {
    const bytes = await scope.perform(() => file.arrayBuffer())
    if (!signatures[file.type]?.(new Uint8Array(bytes))) throw invalidImage()
    const hash = await scope.perform(() => crypto.subtle.digest('SHA-256', bytes))
    const digest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')
    const name = file.name.replace(/[\p{Cc}/\\]/gu, '_').trim().slice(0, 180) || 'Image'
    prepared.push({ bytes, digest, name, mime: file.type })
  }

  const storage = getSupabaseBrowserClient().storage.from('trip-files')
  for (const [index, image] of prepared.entries()) {
    const path = [familyId, tripId, 'chat', userId, operationId, `${index + 1}-${image.digest}`].join('/')
    const { error } = await scope.perform(() => storage.upload(path, image.bytes, {
      contentType: image.mime, cacheControl: '0', upsert: false,
    }))
    // A prior attempt may have uploaded this immutable object. Final registration checks its owner, type and size.
    if (error && !('statusCode' in error && String(error.statusCode) === '409'))
      throw new FamilyApiError(503, 'collab_image_upload_unavailable', 'The image upload could not be confirmed. Retry the same draft.')
  }
  return prepared.map(({ name, digest }) => ({ name, digest }))
}
