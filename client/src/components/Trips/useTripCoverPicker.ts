import { useMemo } from 'react';
import { useStayActionScope, useStayState } from '../Planner/stayActionScope';
import { createCoverPickerScope, useCoverPreview } from './coverPickerScope';
import { coverWriter, updateCoverUrl as update, uploadCoverFile as upload } from './coverPickerWrite';

import { useTranslation } from '../../i18n';
import { tripCoverRepo } from '../../repo/tripCoverRepo';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { getApiErrorMessage } from '../../types';
import { getApiErrorCode } from '../../utils/apiError';
import { normalizeImageFile } from '../../utils/convertHeic';
import { refusedOffline } from '../../utils/needsConnection';
import { useToast } from '../shared/Toast';

interface CoverSearchPhoto {
  id: string;
  url: string;
  thumb: string;
  description?: string | null;
  photographer?: string | null;
  link?: string | null;
}

interface TripCoverPickerOptions {
  /** The trip being edited, or null while creating one. */
  trip: { id: number } | null;
  /** Falls back as the Unsplash query when the search field is empty. */
  title: string;
  onCoverUpdate?: (tripId: number, coverUrl: string | null) => void;
  /**
   * Release a staged file's blob url as soon as the preview moves on (the phone
   * sheet). Otherwise it is released when another file replaces it, on reset and
   * on unmount (the desktop dialog).
   */
  releasePreviewOnChange: boolean;
  open?: boolean;
  canChange?: boolean;
}

/**
 * The cover of the create/edit trip form: device upload and Unsplash search. While
 * editing, a pick is saved on the trip straight away; while creating, it is staged
 * and `applyToCreatedTrip` saves it once the trip exists.
 */
const EMPTY_PHOTOS: CoverSearchPhoto[] = [];
export function useTripCoverPicker({
  trip,
  title,
  onCoverUpdate,
  releasePreviewOnChange,
  open = true,
  canChange = true,
}: TripCoverPickerOptions) {
  const { t } = useTranslation();
  const toast = useToast();
  const capture = useStayActionScope(trip?.id ?? 0, open && canChange ? 1 : 0);
  const scope = useMemo(() => createCoverPickerScope(capture, () => open && canChange), [capture, open, canChange]);
  const [coverPreview, setCoverPreview] = useStayState<string | null>(capture, null);
  const [pendingCoverFile, setPendingCoverFile] = useStayState<File | null>(capture, null);
  const [pendingUnsplashUrl, setPendingUnsplashUrl] = useStayState<string | null>(capture, null);
  const [uploadingCover, setUploadingCover] = useStayState(capture, false);
  const [searchQuery, setSearchQuery] = useStayState(capture, '');
  const [searchResults, setSearchResults] = useStayState(capture, EMPTY_PHOTOS);
  const [searchError, setSearchError] = useStayState(capture, '');
  const [searching, setSearching] = useStayState(capture, false);
  useCoverPreview(scope, coverPreview, releasePreviewOnChange);

  const resetCover = (preview: string | null) => {
    if (!capture().current()) return;
    scope.reset();
    setCoverPreview(preview);
    setSearchQuery('');
    setPendingCoverFile(null);
    setPendingUnsplashUrl(null);
    setSearchResults(EMPTY_PHOTOS);
    setSearchError('');
    setSearching(false);
    setUploadingCover(false);
  };

  const saveCover = coverWriter({
    scope,
    setUploading: setUploadingCover,
    setPreview: setCoverPreview,
    onCoverUpdate,
    toast,
    successMessage: t('dashboard.coverSaved'),
  });
  const selectFile = async (file: File | null | undefined) => {
    if (!file) return;
    const action = scope.start('pick');
    if (!action) return;
    try {
      const normalized = await action.perform(() => normalizeImageFile(file));
      setPendingUnsplashUrl(null);
      if (trip?.id) {
        if (refusedOffline(toast, t)) return;
        await saveCover(
          action,
          trip.id,
          () => upload(trip.id, normalized),
          () => t('dashboard.coverUploadError')
        );
      } else {
        setPendingCoverFile(normalized);
        setCoverPreview(scope.preview(normalized, action));
      }
    } catch {
      action.effect(() => toast.error(t('dashboard.coverUploadError')));
    }
  };
  const search = async () => {
    const action = scope.start('search');
    if (!action) return;
    setSearching(false);
    const query = searchQuery.trim() || title.trim();
    if (!query) {
      setSearchError(t('dashboard.unsplashQueryRequired'));
      return;
    }
    if (isEffectivelyOffline()) {
      setSearchError(t('common.needsConnection'));
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const data = await action.perform(() => tripCoverRepo.search(query));
      const photos: CoverSearchPhoto[] = data.photos || [];
      setSearchResults(photos);
      if (!photos.length) setSearchError(t('dashboard.unsplashNoResults'));
    } catch (error) {
      action.effect(() =>
        setSearchError(
          getApiErrorCode(error) === 'unsplash_key_needed'
            ? t('dashboard.unsplashKeyNeeded')
            : getApiErrorMessage(error, t('dashboard.coverSearchError'))
        )
      );
    } finally {
      action.effect(() => setSearching(false));
    }
  };
  const selectPhoto = async (photo: CoverSearchPhoto) => {
    if (!photo.url) return;
    const action = scope.start('pick');
    if (!action) return;
    setPendingCoverFile(null);
    if (trip?.id) {
      if (refusedOffline(toast, t)) return;
      await saveCover(
        action,
        trip.id,
        () => update(trip.id, photo.url),
        (error) => getApiErrorMessage(error, t('dashboard.coverSaveError'))
      );
    } else {
      setPendingUnsplashUrl(photo.url);
      setCoverPreview(photo.url);
    }
  };
  const removeCover = async () => {
    const action = scope.start('pick');
    if (!action) return;
    if (pendingCoverFile || pendingUnsplashUrl) {
      setPendingCoverFile(null);
      setPendingUnsplashUrl(null);
      setCoverPreview(null);
      return;
    }
    if (!trip?.id || refusedOffline(toast, t)) return;
    await saveCover(
      action,
      trip.id,
      () => update(trip.id, null),
      () => t('dashboard.coverRemoveError'),
      { notify: false }
    );
  };
  const applyToCreatedTrip = async (createdId: number | undefined) => {
    if (!createdId || (!pendingCoverFile && !pendingUnsplashUrl)) return;
    const action = scope.start('pick');
    if (!action) return;
    if (pendingCoverFile)
      await saveCover(
        action,
        createdId,
        () => upload(createdId, pendingCoverFile),
        () => t('dashboard.coverUploadError'),
        { preview: false, notify: false }
      );
    else
      await saveCover(
        action,
        createdId,
        () => update(createdId, pendingUnsplashUrl),
        () => t('dashboard.coverSaveError'),
        { preview: false, notify: false }
      );
  };
  return {
    coverPreview,
    uploadingCover,
    searchQuery,
    setSearchQuery,
    searchResults,
    searchError,
    searching,
    resetCover,
    selectFile,
    search,
    selectPhoto,
    removeCover,
    applyToCreatedTrip,
  };
}
