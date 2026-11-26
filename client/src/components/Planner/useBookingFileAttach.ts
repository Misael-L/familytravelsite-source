import type React from 'react';
import { type Dispatch, type SetStateAction, useState } from 'react';
import { assertBookingCompanionAllowed } from '../../repo/plannerBookingPort';

import type { TripFile } from '../../types';
import { attachedBookingFiles } from './bookingFormModel';

export interface BookingFileAttachOptions {
  /** The booking being edited; unset while it is being created. */
  reservation: { id: number } | null | undefined;
  /** The trip's files. */
  files: TripFile[];
  guard?: () => void;
  toast?: { error: (message: string) => void };
  t?: (key: string) => string;
  setPendingFiles: Dispatch<SetStateAction<File[]>>;
}

/**
 * The Files row of the desktop booking and transport dialogs. A picked file waits
 * in `pendingFiles` and goes up with the save, on a new booking and a saved one
 * alike, as on the phone (#2534): one that fails stays in the list to try again
 * instead of vanishing with its toast (#2883). The files linked or detached in the
 * dialog show on the booking right away.
 */
export function useBookingFileAttach({
  reservation,
  files,
  setPendingFiles,
  guard = assertBookingCompanionAllowed,
  toast,
  t,
}: BookingFileAttachOptions) {
  const [linkedFileIds, setLinkedFileIds] = useState<number[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      guard();
    } catch (error) {
      toast?.error(
        error instanceof Error ? error.message : (t?.('common.unknownError') ?? 'File attachment unavailable')
      );
      e.target.value = '';
      return;
    }
    setPendingFiles((prev) => [...prev, file]);
    e.target.value = '';
  };

  return {
    handleFileChange,
    attachedFiles: attachedBookingFiles(files, reservation?.id, linkedFileIds),
    removePending: (index: number) => setPendingFiles((prev) => prev.filter((_, j) => j !== index)),
    linkFile: (fileId: number) => setLinkedFileIds((prev) => [...prev, fileId]),
    detachFile: (fileId: number) => setLinkedFileIds((prev) => prev.filter((id) => id !== fileId)),
  };
}
