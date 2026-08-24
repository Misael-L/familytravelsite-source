import { getSupabaseBrowserClient } from './client'
import { isInvalidCredentials, PasswordChangeError, signInWithPassword } from './auth'

export type FamilyAccountSettings = {
  displayName: string
  email: string
  preferredTimeZone: string | null
  accentHex: string | null
  avatarUrl: string | null
}

const ACCENT_HEX_RE = /^#[0-9A-Fa-f]{6}$/

export function normalizeAccentHex(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let value = raw.trim()
  if (!value) return null
  if (!value.startsWith('#')) value = `#${value}`
  if (!ACCENT_HEX_RE.test(value)) return null
  return value.toUpperCase()
}

export async function loadFamilyAccountSettings(opts: {
  userId: string
  personId: string | null
}): Promise<FamilyAccountSettings> {
  const sb = getSupabaseBrowserClient()
  const userId = opts.userId.trim()
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('display_name,preferred_time_zone')
    .eq('id', userId)
    .maybeSingle()
  if (profileErr) throw profileErr

  let displayName = (profile as { display_name?: string | null } | null)?.display_name?.trim() || ''
  let accentHex: string | null = null
  let peopleEmail = ''
  if (opts.personId) {
    const { data: person, error: personErr } = await sb
      .from('people')
      .select('display_name,accent_hex,email')
      .eq('id', opts.personId)
      .maybeSingle()
    if (personErr) throw personErr
    const row = person as { display_name?: string | null; accent_hex?: string | null; email?: string | null } | null
    displayName = row?.display_name?.trim() || displayName
    accentHex = normalizeAccentHex(row?.accent_hex)
    peopleEmail = row?.email?.trim() || ''
  }

  const { data: sessionData, error: sessionErr } = await sb.auth.getUser()
  if (sessionErr) throw sessionErr
  const email = sessionData.user?.email?.trim() || peopleEmail

  return {
    displayName,
    email,
    preferredTimeZone: (profile as { preferred_time_zone?: string | null } | null)?.preferred_time_zone?.trim() || null,
    accentHex,
    avatarUrl: null,
  }
}

export async function updateFamilyDisplayName(opts: {
  userId: string
  personId: string | null
  displayName: string
}): Promise<void> {
  const name = opts.displayName.trim()
  if (name.length < 2) throw new Error('display name is required')
  const sb = getSupabaseBrowserClient()
  const { error: profileErr } = await sb.from('profiles').update({ display_name: name }).eq('id', opts.userId)
  if (profileErr) throw profileErr
  if (opts.personId) {
    const { error } = await sb.from('people').update({ display_name: name }).eq('id', opts.personId)
    if (error) throw error
  }
  const { error: metaErr } = await sb.auth.updateUser({ data: { full_name: name, username: name } })
  if (metaErr) throw metaErr
}

export async function updateFamilyEmail(opts: {
  email: string
  currentPassword: string
  personId: string | null
}): Promise<{ pendingConfirmation: boolean }> {
  const next = opts.email.trim().toLowerCase()
  if (!next) throw new Error('email is required')
  if (!opts.currentPassword) throw new PasswordChangeError('current_required')

  const sb = getSupabaseBrowserClient()
  const { data: sessionData, error: sessionErr } = await sb.auth.getUser()
  if (sessionErr) throw sessionErr
  const current = sessionData.user?.email?.trim() || ''
  if (!current) throw new PasswordChangeError('no_email')

  try {
    await signInWithPassword(current, opts.currentPassword)
  } catch (err) {
    if (isInvalidCredentials(err)) throw new PasswordChangeError('current_incorrect')
    throw err
  }

  const { data, error } = await sb.auth.updateUser({ email: next })
  if (error) throw error

  const applied = (data.user?.email || '').trim().toLowerCase() === next
  if (applied) {
    const { error: syncErr } = await sb.rpc('sync_my_linked_person_email')
    if (syncErr) throw syncErr
  }

  return { pendingConfirmation: !applied }
}

export async function updatePreferredTimeZone(opts: {
  userId: string
  timeZone: string | null
}): Promise<void> {
  const value = opts.timeZone?.trim() || null
  const { error } = await getSupabaseBrowserClient()
    .from('profiles')
    .update({ preferred_time_zone: value })
    .eq('id', opts.userId)
  if (error) throw error
}

export async function updatePersonAccentHex(opts: {
  personId: string
  hex: string | null
}): Promise<void> {
  const personId = opts.personId.trim()
  if (!personId) throw new Error('person_id is required')
  const accent = opts.hex == null ? null : normalizeAccentHex(opts.hex)
  if (opts.hex != null && !accent) throw new Error('accent must be #RRGGBB')
  const { error } = await getSupabaseBrowserClient()
    .from('people')
    .update({ accent_hex: accent })
    .eq('id', personId)
  if (error) throw error
}

export function listIanaTimeZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  if (typeof supported === 'function') {
    try {
      return supported('timeZone')
    } catch {
      // fall through
    }
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Mexico_City',
    'America/Bogota',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Madrid',
    'Asia/Tokyo',
  ]
}
