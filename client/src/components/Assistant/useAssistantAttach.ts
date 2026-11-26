import { ASSISTANT_TOUR_FILE_EXTENSIONS, LLM_PHOTO_EXTENSIONS } from '@trek/shared';
import { type DragEvent } from 'react';
import { useStayState } from '../Planner/stayActionScope';
import { useAssistantResourceScope } from './assistantResourceScope';

import { useTranslation } from '../../i18n';
import { assistantScopeOf } from '../../store/assistantChatKey';
import { chatOf, useAssistantStore } from '../../store/assistantStore';
import { useToast } from '../shared/Toast';

/** What the booking import reads and the route files taken in as tours (the server checks again), and how big one file may be. */
const ATTACH_EXTENSIONS: readonly string[] = [
  '.pdf',
  '.eml',
  '.pkpass',
  '.ics',
  '.html',
  '.htm',
  '.txt',
  ...LLM_PHOTO_EXTENSIONS,
  ...ASSISTANT_TOUR_FILE_EXTENSIONS,
];
const MAX_ATTACH_BYTES = 10 * 1024 * 1024;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

/**
 * Hands a booking file or a route file (GPX, KML, KMZ) to the chat, from the paperclip, a paste or a drop on
 * the window. One file at a time, refused here with a toast when it is not
 * one the import reads or too big, so a wrong file never costs a round trip.
 * The drop handlers go on the whole chat; `dragging` lights its drop zone.
 * A journey's chat imports no bookings: there `canAttach` is false, a file is
 * left to the browser and the drop zone never lights.
 */
export function useAssistantAttach(tripId: number) {
  const { t } = useTranslation();
  const toast = useToast();
  const attach = useAssistantStore((s) => s.attach);
  const busy = useAssistantStore((s) => {
    const c = chatOf(s, tripId);
    return c.isRunning || c.loading;
  });
  const scope = useAssistantResourceScope(tripId, 'attachment');
  const [dragging, setDragging] = useStayState(scope.capture, false);
  const canAttach = assistantScopeOf(tripId).kind === 'trip';

  const take = (files: FileList | File[] | null | undefined): boolean => {
    const file = files ? Array.from(files)[0] : undefined;
    if (!file || !canAttach || !scope.capture().current()) return false;
    const current = chatOf(useAssistantStore.getState(), tripId);
    if (current.isRunning || current.loading) return true;
    if (!ATTACH_EXTENSIONS.includes(extensionOf(file.name))) {
      toast.warning(t('assistant.attach.unsupported'));
      return true;
    }
    if (file.size > MAX_ATTACH_BYTES) {
      toast.warning(t('assistant.attach.tooLarge'));
      return true;
    }
    void attach(tripId, file);
    return true;
  };

  const dropZone = {
    onDragEnter: (e: DragEvent) => {
      if (!scope.capture().current() || !canAttach || !hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!scope.capture().current() || !canAttach || !hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!scope.capture().current()) return;
      // Leaving for a child is not leaving the zone.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!scope.capture().current() || !canAttach || !hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      take(e.dataTransfer.files);
    },
  };

  return { take, busy, canAttach, dragging, dropZone, accept: ATTACH_EXTENSIONS.join(','), scope };
}
