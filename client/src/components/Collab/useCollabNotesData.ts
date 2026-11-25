import { useCallback, useEffect, useMemo, useState } from 'react';

import api, { collabApi } from '../../api/client';
import { addListener, removeListener } from '../../api/websocket';
import type { useTranslation } from '../../i18n';
import { captureReadSession } from '../../sync/readSession';
import { offlineOr } from '../../utils/needsConnection';
import type { useToast } from '../shared/Toast';
import type { CollabNoteData } from './collabModel';

export interface CollabNotesDataOptions {
  tripId: number;
  t: ReturnType<typeof useTranslation>['t'];
  toast: ReturnType<typeof useToast>;
  /** The desktop panel outlives a trip change, so a failed load there empties the list. */
  resetOnLoadError?: boolean;
  /** The desktop panel loads and listens only once it has a trip id; the phone tab always does. */
  waitForTripId?: boolean;
  previewRead?: boolean;
}

type NoteText = { title: string; content?: string | null; category?: string | null; color?: string | null };
type NoteVersion = Pick<CollabNoteData, 'id' | 'revision' | 'trashed_at'>;
type NotesBoard<N> = { notes?: N[]; trashed_notes?: N[]; can_edit?: boolean };
export type MoveNote = (note: NoteVersion, action: 'trash' | 'restore', operationId: string) => Promise<void>;

/**
 * Tells the trip's Files tab that note attachments changed. The server leaves the writer's
 * own socket out of its broadcast, so the tab that made the change has to say it itself;
 * useTripWebSocket listens and reloads the files.
 */
export function announceNoteFilesChanged(): void {
  window.dispatchEvent(new Event('collab-files-changed'));
}

/**
 * The trip notes behind the desktop Collab panel and the phone's notes tab, each reading
 * the rows through its own note type: the list as the server has it, kept current by the
 * WebSocket note events, and the attachment upload both run after a note is saved. Writing
 * a note, its colours and its categories stays with each shell, which differ there. Collab
 * has no store slice, so the notes live here.
 */
export function useCollabNotesData<N extends NoteVersion = CollabNoteData>({
  tripId,
  t,
  toast,
  resetOnLoadError = false,
  waitForTripId = false,
  previewRead = false,
}: CollabNotesDataOptions) {
  const [storedNotes, setNotes] = useState<N[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [previewCanEdit, setPreviewCanEdit] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt(count => count + 1), []);
  const notes = useMemo(() => previewRead ? storedNotes.filter(note => !note.trashed_at) : storedNotes, [previewRead, storedNotes]);
  const trashedNotes = useMemo(() => previewCanEdit ? storedNotes.filter(note => note.trashed_at) : [], [previewCanEdit, storedNotes]);

  useEffect(() => {
    if (waitForTripId && !tripId) return;
    let cancelled = false;
    const scope = previewRead ? captureReadSession() : null;
    const current = () => !cancelled && (scope?.contextCurrent() ?? true);
    setLoading(true);
    setLoadFailed(false);
    collabApi
      .getNotes(tripId)
      .then((data: N[] | NotesBoard<N> | null) => {
        if (!current()) return;
        const active = Array.isArray(data) ? data : data?.notes ?? [];
        const canEdit = previewRead && !Array.isArray(data) && data?.can_edit === true;
        setNotes(canEdit ? [...active, ...(data.trashed_notes ?? [])] : active);
        if (previewRead) setPreviewCanEdit(canEdit);
      })
      .catch(() => {
        if (!current()) return;
        if (resetOnLoadError || previewRead) setNotes([]);
        if (previewRead) setPreviewCanEdit(false);
        setLoadFailed(true);
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, resetOnLoadError, waitForTripId, previewRead, attempt]);

  useEffect(() => {
    if (previewRead || (waitForTripId && !tripId)) return;
    const handler = (msg: Record<string, unknown>) => {
      // An event still in flight from a trip just left must not land in this list.
      if (String(msg?.tripId) !== String(tripId)) return;
      const note = msg.note as N | undefined;
      if (msg.type === 'collab:note:created' && note) {
        setNotes((prev) => (prev.some((n) => n.id === note.id) ? prev : [note, ...prev]));
      }
      if (msg.type === 'collab:note:updated' && note) {
        setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, ...note } : n)));
      }
      if (msg.type === 'collab:note:deleted') {
        const deletedId = (msg.noteId || msg.id) as number | undefined;
        if (deletedId) setNotes((prev) => prev.filter((n) => n.id !== deletedId));
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [tripId, waitForTripId, previewRead]);

  const receiveNote = useCallback((saved: N) => {
    setNotes(previous => {
      const observed = previous.find(note => note.id === saved.id);
      if (!observed) return [saved, ...previous];
      if ((observed.revision ?? 0) > (saved.revision ?? 0)) return previous;
      return previous.map(note => note.id === saved.id ? saved : note);
    });
  }, []);

  const savePreviewText = useCallback(async (text: NoteText, operationId: string | undefined, existing?: Pick<CollabNoteData, 'id' | 'revision'>) => {
    const scope = captureReadSession();
    try {
      if (!previewCanEdit || !operationId || (existing && !existing.revision)) throw new Error('Missing save scope');
      const payload = {
        operationId, title: text.title, content: text.content ?? '', category: text.category ?? '', color: text.color ?? null,
        ...(existing ? { expectedRevision: existing.revision } : {}),
      };
      const path = `/trips/${tripId}/family/collab/notes`;
      const { data: res } = existing ? await api.put<{ note: N }>(`${path}/${existing.id}`, payload)
        : await api.post<{ note: N }>(path, payload);
      if (!scope.contextCurrent()) throw new Error('Original session ended');
      receiveNote(res.note);
    } catch (error) {
      if (scope.contextCurrent()) {
        const detail = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast.error(detail ?? 'The note was not confirmed. Try saving again.');
      }
      throw error;
    }
  }, [previewCanEdit, receiveNote, toast, tripId]);

  const movePreviewNote = useCallback<MoveNote>(async (note, action, operationId) => {
    const scope = captureReadSession();
    if (!previewCanEdit || !note.revision) throw new Error('Open the note again before moving it.');
    const { data } = await api.post<{ note: N }>(
      `/trips/${tripId}/family/collab/notes/${note.id}/${action}`,
      { operationId, expectedRevision: note.revision }
    );
    if (!scope.contextCurrent()) throw new Error('Original session ended');
    receiveNote(data.note);
  }, [previewCanEdit, receiveNote, tripId]);

  /**
   * Uploads a saved note's attachments one by one; a file the server refuses is toasted
   * and the rest still go. `onFileError` sees each refusal before the toast. Once the
   * batch is through, the Files tab is told to reload.
   */
  const uploadNoteFiles = useCallback(
    async (noteId: number, files: File[], onFileError?: (err: unknown) => void) => {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        try {
          await collabApi.uploadNoteFile(tripId, noteId, fd);
        } catch (err) {
          onFileError?.(err);
          toast.error(offlineOr(t, t('common.error')));
        }
      }
      if (files.length > 0) announceNoteFilesChanged();
    },
    [tripId, toast, t]
  );

  return { notes, setNotes, loading, loadFailed, reload, uploadNoteFiles, previewCanEdit, savePreviewText, trashedNotes, movePreviewNote };
}
