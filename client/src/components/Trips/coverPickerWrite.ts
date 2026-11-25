import type { Dispatch, SetStateAction } from 'react';
import { tripCoverRepo } from '../../repo/tripCoverRepo';
import type { StayActionScope } from '../Planner/stayActionScope';
import type { createCoverPickerScope } from './coverPickerScope';
export const uploadCoverFile = tripCoverRepo.upload;
export const updateCoverUrl = tripCoverRepo.update;
interface CoverWrite {
  scope: ReturnType<typeof createCoverPickerScope>;
  action: StayActionScope;
  id: number;
  request: () => Promise<string | null>;
  failure: (error: unknown) => string;
  setUploading: Dispatch<SetStateAction<boolean>>;
  setPreview: Dispatch<SetStateAction<string | null>>;
  onCoverUpdate?: (id: number, url: string | null) => void;
  toast: { success: (message: string) => void; error: (message: string) => void };
  successMessage: string;
  preview?: boolean;
  notify?: boolean;
}
export async function writeCover({
  scope,
  action,
  id,
  request,
  failure,
  setUploading,
  setPreview,
  onCoverUpdate,
  toast,
  successMessage,
  preview = true,
  notify = true,
}: CoverWrite) {
  const finish = scope.acquire(action);
  if (!finish) return;
  setUploading(true);
  try {
    const url = await action.perform(request);
    action.effect(() => {
      if (preview) setPreview(url);
      onCoverUpdate?.(id, url);
      if (notify) toast.success(successMessage);
    });
  } catch (error) {
    action.effect(() => toast.error(failure(error)));
  } finally {
    finish();
    action.effect(() => setUploading(false));
  }
}

/** Bind presentation callbacks once per render; individual requests keep their own action. */
export function coverWriter(shared: Omit<CoverWrite, 'action' | 'id' | 'request' | 'failure' | 'preview' | 'notify'>) {
  return (
    action: StayActionScope,
    id: number,
    request: () => Promise<string | null>,
    failure: (error: unknown) => string,
    options: Pick<CoverWrite, 'preview' | 'notify'> = {}
  ) => writeCover({ ...shared, action, id, request, failure, ...options });
}
