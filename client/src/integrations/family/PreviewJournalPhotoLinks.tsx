import { useEffect, useState } from 'react';
import api from '../../api/client';
import { DialogButton } from '../../components/shared/DialogShell';
import { photoUrl } from '../../pages/journeyDetail/JourneyDetailPage.helpers';
import { useJourneyStore } from '../../store/journeyStore';
import type { PreviewJournalPhotoChange, PreviewJournalPhotoState } from './previewJournalPhoto';

export function PreviewJournalPhotoLinks({ journeyId, entryId, disabled, onChange }: {
  journeyId: number;
  entryId: number;
  disabled: boolean;
  onChange: (changes: PreviewJournalPhotoChange) => void;
}) {
  const [state, setState] = useState<PreviewJournalPhotoState | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const gallery = useJourneyStore(s => s.current?.id === journeyId ? s.current.gallery : undefined);

  useEffect(() => {
    const abort = new AbortController();
    void api.get<PreviewJournalPhotoState>(`/journeys/${journeyId}/preview-photo`, {
      params: { entryId },
      signal: abort.signal,
    }).then(
      ({ data }) => { if (!abort.signal.aborted) setState(data); },
      () => { if (!abort.signal.aborted) setFailed(true); }
    );
    return () => abort.abort();
  }, [journeyId, entryId, reload]);

  if (failed) return (
    <div className="flex flex-wrap items-center gap-2">
      <span role="status">Could not load the entry’s photos.</span>
      <DialogButton disabled={disabled} onClick={() => { setFailed(false); setReload(value => value + 1); }}>
        Reload photos
      </DialogButton>
    </div>
  );
  if (!state) return <p role="status">Loading entry photos…</p>;
  if (!state.photos.length) return null;
  return (
    <section aria-label="Entry photos" className="space-y-2 border-t border-edge pt-3">
      <h3 className="font-semibold">Entry photos</h3>
      <ul className="space-y-2">
        {state.photos.map(({ id, attached }, index) => {
          const media = gallery?.find(item => item.id === id);
          const name = media?.caption || `Photo ${index + 1}`;
          const action = attached ? 'remove-photo' : 'restore-photo';
          const label = attached ? `Remove ${name} from entry` : `Restore ${name} to entry`;
          return (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {media && <img src={photoUrl(media)} alt="" className="h-12 w-12 rounded-md object-cover" />}
                <div className="min-w-0">
                  <span className="block truncate">{name}</span>
                  <span className="text-xs text-content-muted">
                    {attached ? 'Attached' : 'Removed from entry · in Gallery'}
                  </span>
                </div>
              </div>
              <DialogButton aria-label={label} disabled={disabled}
                onClick={() => onChange({ action, entryId, photoId: id, revision: state.revision })}>
                {attached ? 'Remove from entry' : 'Restore to entry'}
              </DialogButton>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
