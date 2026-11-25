import type { DayNoteCreateRequest, DayNoteUpdateRequest } from '@trek/shared';
import { dayNotesApi } from '../api/client';
import { generateUUID, mutationQueue, nextTempId } from '../sync/mutationQueue';
import { isEffectivelyOffline } from '../sync/networkMode';
import { captureWriteSession } from '../sync/writeSession';
import type { DayNote } from '../types';
import { cacheAfterWrite } from './dayRepo';
import { guardPlannerReadOnly } from './plannerReadPort';

type NoteSession = ReturnType<typeof captureWriteSession>;

/** An acknowledged write uses its original cache; a cache failure does not undo the save. */
function cacheNote(session: NoteSession, dayId: number, note: DayNote, replaceId: number = note.id): Promise<void> {
  return session.perform(() =>
    session.db.days
      .where('id')
      .equals(dayId)
      .modify((day) => {
        const notes = day.notes_items ?? [];
        day.notes_items = notes.some((n) => n.id === replaceId)
          ? notes.map((n) => (n.id === replaceId ? { ...n, ...note } : n))
          : [...notes, note];
      })
      .then(() => undefined)
  );
}

function uncacheNote(session: NoteSession, dayId: number, noteId: number): Promise<void> {
  return session.perform(() =>
    session.db.days
      .where('id')
      .equals(dayId)
      .modify((day) => {
        day.notes_items = (day.notes_items ?? []).filter((n) => n.id !== noteId);
      })
      .then(() => undefined)
  );
}

function noteUrl(tripId: number | string, dayId: number, id: number): string {
  return `/trips/${tripId}/days/${dayId}/notes/${id < 0 ? '{id}' : id}`;
}

/** Retain the original session while waiting behind an earlier write to this note. */
async function enqueueNoteWrite(
  session: NoteSession,
  tripId: number | string,
  dayId: number,
  id: number,
  { method, body }: { method: 'PUT' | 'DELETE'; body: unknown }
): Promise<void> {
  await session.perform(() =>
    mutationQueue.enqueue({
      id: generateUUID(),
      tripId: Number(tripId),
      method,
      url: noteUrl(tripId, dayId, id),
      body,
      resource: 'dayNotes',
      entityId: id,
      ...(id < 0 ? { tempEntityId: id } : {}),
    })
  );
}

/** Day notes keep their native routes, temporary IDs and FIFO queue behavior. */
export const dayNoteRepo = {
  async create(tripId: number | string, dayId: number, data: DayNoteCreateRequest): Promise<{ note: DayNote }> {
    const session = captureWriteSession(),
      db = session.db;
    guardPlannerReadOnly();
    if (!isEffectivelyOffline()) {
      const result: { note: DayNote } = await session.perform(() => dayNotesApi.create(tripId, dayId, data));
      cacheAfterWrite(cacheNote(session, dayId, result.note), 'adding a day note');
      return result;
    }
    const tempId = nextTempId();
    const note: DayNote = {
      id: tempId,
      day_id: dayId,
      trip_id: Number(tripId),
      text: data.text,
      time: data.time ?? null,
      icon: data.icon ?? null,
      color: data.color ?? null,
      ...(data.sort_order === undefined ? {} : { sort_order: data.sort_order }),
      created_at: new Date().toISOString(),
    };
    await session.perform(() =>
      db.transaction('rw', db.days, db.mutationQueue, async () => {
        await cacheNote(session, dayId, note);
        await session.perform(() =>
          mutationQueue.enqueue({
            id: generateUUID(),
            tripId: Number(tripId),
            method: 'POST',
            url: `/trips/${tripId}/days/${dayId}/notes`,
            body: data,
            resource: 'dayNotes',
            tempId,
          })
        );
      })
    );
    return { note };
  },

  /** `before` is the note as it stands, so an offline edit can show the whole note. */
  async update(
    tripId: number | string,
    dayId: number,
    before: DayNote,
    data: DayNoteUpdateRequest
  ): Promise<{ note: DayNote }> {
    const session = captureWriteSession(),
      db = session.db;
    guardPlannerReadOnly();
    if (!(await session.perform(() => mutationQueue.mustQueue('dayNotes', before.id)))) {
      const result: { note: DayNote } = await session.perform(() => dayNotesApi.update(tripId, dayId, before.id, data));
      cacheAfterWrite(cacheNote(session, dayId, result.note), 'editing a day note');
      return result;
    }
    const note = { ...before, ...data } as DayNote;
    await session.perform(() =>
      db.transaction('rw', db.days, db.mutationQueue, async () => {
        await cacheNote(session, dayId, note);
        await enqueueNoteWrite(session, tripId, dayId, before.id, { method: 'PUT', body: data });
      })
    );
    session.assertCurrent();
    mutationQueue.sendSoon();
    return { note };
  },

  async delete(tripId: number | string, dayId: number, id: number): Promise<void> {
    const session = captureWriteSession(),
      db = session.db;
    guardPlannerReadOnly();
    if (!(await session.perform(() => mutationQueue.mustQueue('dayNotes', id)))) {
      await session.perform(() => dayNotesApi.delete(tripId, dayId, id));
      cacheAfterWrite(uncacheNote(session, dayId, id), 'deleting a day note');
      return;
    }
    await session.perform(() =>
      db.transaction('rw', db.days, db.mutationQueue, async () => {
        await uncacheNote(session, dayId, id);
        await enqueueNoteWrite(session, tripId, dayId, id, { method: 'DELETE', body: undefined });
      })
    );
    session.assertCurrent();
    mutationQueue.sendSoon();
  },
};
