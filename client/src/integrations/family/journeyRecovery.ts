import { getSupabaseBrowserClient } from './legacy/data/supabase/client';

export interface RecoveryEntry<Id extends string | number = string> {
  id: Id;
  title: string | null;
  entry_date: string;
  deleted_at: string;
  revision: number;
}
export interface EntryVersion {
  revision: number;
  recorded_at: string;
  title: string | null;
  story: string | null;
  deleted_at: string | null;
}
export interface TrashPage<Id extends string | number = string> {
  entries: RecoveryEntry<Id>[];
  has_more: boolean;
  next_cursor: { id: Id; deleted_at: string } | null;
}
export interface EntryHistory<Id extends string | number = string> {
  entry_id: Id;
  current_revision: number;
  versions: EntryVersion[];
  has_more: boolean;
  next_revision: number | null;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  if (data == null) throw new Error('The recovery operation returned no saved result.');
  return data as T;
}

export function entryTrash(journeyId: string, before?: { id: string; deleted_at: string }) {
  return rpc<TrashPage>('list_family_journey_entry_trash', {
    p_journey_id: journeyId,
    ...(before ? { p_before_deleted_at: before.deleted_at, p_before_entry_id: before.id } : {}),
  });
}
export function entryHistory(entryId: string, before?: number) {
  return rpc<EntryHistory>('list_family_journey_entry_versions', {
    p_entry_id: entryId,
    ...(before ? { p_before_revision: before } : {}),
  });
}
export function restoreEntry(entryId: string, revision: number) {
  return rpc('restore_family_journey_entry', {
    p_entry_id: entryId,
    p_expected_revision: revision,
  });
}
export function restoreEntryVersion(entryId: string, revision: number, expected: number) {
  return rpc('restore_family_journey_entry_version', {
    p_entry_id: entryId,
    p_revision: revision,
    p_expected_revision: expected,
  });
}

export interface TrashedJourney<Id extends string | number = string> {
  id: Id;
  title: string;
  subtitle: string | null;
  revision: number;
  deleted_at: string;
}
export interface JourneyTrashPage<Id extends string | number = string> {
  aggregate_recovery_version: number;
  available?: boolean;
  journeys: TrashedJourney<Id>[];
  has_more: boolean;
  next_cursor: { id: Id; deleted_at: string } | null;
}
export async function journeyTrash(familyId: string, before?: { id: string; deleted_at: string }) {
  try {
    return await rpc<JourneyTrashPage>('list_family_journey_trash', {
      p_family_id: familyId,
      ...(before ? { p_before_deleted_at: before.deleted_at, p_before_journey_id: before.id } : {}),
    });
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    if (['PGRST202', '42883'].includes(failure.code ?? '') && failure.message?.includes('list_family_journey_trash')) {
      return { aggregate_recovery_version: 0, available: false, journeys: [], has_more: false, next_cursor: null };
    }
    throw error;
  }
}
export function restoreJourney(journeyId: string, revision: number) {
  return rpc('restore_family_journey', { p_journey_id: journeyId, p_expected_revision: revision });
}
