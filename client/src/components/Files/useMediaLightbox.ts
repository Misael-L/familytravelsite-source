import { useEffect, useRef, type TouchEvent } from 'react';

import { useFilePreview } from '../../hooks/useFilePreview';
import type { TripFile } from '../../types';
import { isVideo } from './FileManager.helpers';

/** How far a horizontal swipe has to travel before it pages. */
const SWIPE_PX = 60;

export interface MediaLightboxOptions {
  files: TripFile[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * The media viewer behind the desktop file manager's lightbox and the phone's files tab
 * lightbox, which draw their own overlay over it: the signed address of the picture on
 * screen, paging by button, arrow keys and swipe, and Escape to close.
 */
export function useMediaLightbox({ files, index, onIndexChange, onClose }: MediaLightboxOptions) {
  const file = files[index] as TripFile | undefined;
  const touchStartRef = useRef<number | null>(null);
  const fileIsVideo = isVideo(file?.mime_type);
  const fileUrl = file?.url;

  const { src: mediaSrc } = useFilePreview(fileUrl, { observation: file, nativeRaw: fileIsVideo });

  const hasPrev = index > 0;
  const hasNext = index < files.length - 1;
  const goPrev = () => {
    if (hasPrev) onIndexChange(index - 1);
  };
  const goNext = () => {
    if (hasNext) onIndexChange(index + 1);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && index < files.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, files.length, onClose, onIndexChange]);

  const onTouchStart = (e: TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStartRef.current;
    if (start === null) return;
    const diff = e.changedTouches[0].clientX - start;
    if (diff > SWIPE_PX) goPrev();
    else if (diff < -SWIPE_PX) goNext();
    touchStartRef.current = null;
  };

  return {
    file,
    imgSrc: fileIsVideo ? '' : mediaSrc,
    mediaSrc,
    fileIsVideo,
    hasPrev,
    hasNext,
    goPrev,
    goNext,
    onTouchStart,
    onTouchEnd,
  };
}
