import { ImagePlus, Pencil, Plus } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import api, { postMultipart } from '../../api/client';
import { hasReadOnlyBuild } from '../../db/readOnlySession';
import { DialogButton, DialogHeader, DialogShell, DialogTile, NEUTRAL_TINT } from '../../components/shared/DialogShell';
import { useToast } from '../../components/shared/Toast';
import { useNetworkMode } from '../../hooks/useNetworkMode';
import { useJourneyStore } from '../../store/journeyStore';
import { captureReadSession } from '../../sync/readSession';
import { localIsoDate } from '../../utils/localDate';
import { PreviewJournalPhotoLinks } from './PreviewJournalPhotoLinks';
import type { PreviewJournalPhotoChange } from './previewJournalPhoto';
import type { PreviewJournalCommand, PreviewJournalStory } from './previewJournalText';

type PhotoChoice = { file: File; uploadId: string };
type JournalDraft =
  | PreviewJournalStory
  | {
      operationId: string;
      entry_date: string;
      title: string;
      story: string;
    };

function entryChanged(draft: JournalDraft | null, stories: PreviewJournalStory[]) {
  if (!draft) return false;
  if ('operationId' in draft) return Boolean(draft.title || draft.story);
  const original = stories.find((story) => story.id === draft.id);
  return !!original && (draft.title !== original.title || draft.story !== original.story);
}

function journalError(failure: unknown) {
  const response = (failure as { response?: { data?: { error?: string } } })?.response;
  return response?.data?.error ?? 'The Journal did not respond. Try again.';
}

type JournalAction = PreviewJournalCommand | PreviewJournalPhotoChange | FormData;

async function journalAction(journeyId: number, path: string, command?: JournalAction) {
  const photos = `/journeys/${journeyId}/preview-photo`;
  if (command instanceof FormData)
    return { stories: await postMultipart<PreviewJournalStory[]>(photos, command), success: 'Photo attached.' };
  if (command?.action === 'remove-photo' || command?.action === 'restore-photo') {
    const { data } = await api.patch<PreviewJournalStory[]>(photos, command);
    return { stories: data, success: command.action === 'remove-photo' ? 'Photo removed from entry.' : 'Photo restored to entry.' };
  }
  const { data } = await (command ? api.post<PreviewJournalStory[]>(path, command) : api.get<PreviewJournalStory[]>(path));
  return { stories: data, success: undefined };
}

export function PreviewJournalEditor({ journeyId, className }: { journeyId: number; className: string }) {
  const [open, setOpen] = useState(false);
  const { offline } = useNetworkMode();
  if (hasReadOnlyBuild()) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label="Edit Journal entries"
        title="Edit Journal entries"
        disabled={offline}
        onClick={() => setOpen(true)}
      >
        <Pencil size={16} />
      </button>
      {open && <JournalTextForm journeyId={journeyId} offline={offline} onClose={() => setOpen(false)} />}
    </>
  );
}

function JournalTextForm({
  journeyId,
  offline,
  onClose,
}: {
  journeyId: number;
  offline: boolean;
  onClose: () => void;
}) {
  const [stories, setStories] = useState<PreviewJournalStory[]>([]);
  const [draft, setDraft] = useState<JournalDraft | null>(null);
  const [photo, setPhoto] = useState<PhotoChoice | null>(null);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [session] = useState(captureReadSession);
  const toast = useToast();
  const labelId = useId();
  const path = `/journeys/${journeyId}/preview-text`;

  useEffect(() => {
    const controller = new AbortController();
    void api
      .get<PreviewJournalStory[]>(path, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted || !session.contextCurrent()) return;
        setStories(result.data);
        setLoaded(true);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(journalError(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [path, session]);

  async function run(command?: JournalAction) {
    if (busy || offline || !session.contextCurrent()) return;
    setBusy(true);
    setError('');
    try {
      const { stories, success } = await journalAction(journeyId, path, command);
      if (!session.contextCurrent()) return;
      setStories(stories);
      setLoaded(true);
      setDraft(null);
      setPhoto(null);
      const store = useJourneyStore.getState();
      if (command && store.current?.id === journeyId) {
        await store.loadJourney(journeyId).then(
          () => { if (success && session.contextCurrent()) toast.success(success); },
          () => { if (session.contextCurrent()) toast.error('The change was saved. Reopen the Journal to refresh the timeline.'); }
        );
      }
    } catch (failure) {
      if (session.contextCurrent()) setError(journalError(failure));
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || offline;
  const textDirty = entryChanged(draft, stories);
  const dirty = textDirty || photo !== null;
  const saved = draft && 'id' in draft ? draft : null;
  return (
    <DialogShell
      labelledBy={labelId}
      onClose={onClose}
      blocked={busy && loaded}
      discardGuard={dirty}
      header={
        <DialogHeader
          labelId={labelId}
          onClose={() => {
            if (busy && loaded) return;
            if (!dirty || window.confirm('Discard your unsaved changes?')) onClose();
          }}
          title="Edit Journal entries"
          tint={NEUTRAL_TINT}
          tile={
            <DialogTile>
              <Pencil size={18} />
            </DialogTile>
          }
        />
      }
    >
      <div className="space-y-4 p-4" aria-busy={busy}>
        {offline && <p role="status">Connect to edit Journal entries.</p>}
        {!loaded && busy && <p role="status">Loading entries…</p>}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {draft ? (
          <>
            <JournalTextDraft
              draft={draft}
              setDraft={setDraft}
              busy={busy}
              disabled={disabled || photo !== null}
              dirty={dirty}
              onBack={() => {
                setDraft(null);
                setPhoto(null);
                setError('');
              }}
              onCommand={(command) => void run(command)}
            />
            {saved && (
              <PreviewJournalPhotoLinks key={saved.id}
                journeyId={journeyId} entryId={saved.id} disabled={disabled || textDirty || photo !== null}
                onChange={command => void run(command)} />
            )}
            {saved && (
              <JournalPhotoField
                photo={photo}
                disabled={disabled || textDirty}
                onChoose={(file) => {
                  setPhoto(file ? { file, uploadId: crypto.randomUUID() } : null);
                  setError('');
                }}
                onAttach={() => {
                  if (!photo) return;
                  const data = new FormData();
                  data.set('photo', photo.file);
                  data.set('entryId', String(saved.id));
                  data.set('revision', String(saved.revision));
                  data.set('uploadId', photo.uploadId);
                  void run(data);
                }}
              />
            )}
          </>
        ) : (
          loaded && (
            <div className="space-y-4">
              <DialogButton
                icon={<Plus size={16} />}
                disabled={disabled}
                onClick={() => {
                  const start = useJourneyStore.getState().current?.trips[0]?.start_date;
                  setDraft({
                    operationId: crypto.randomUUID(),
                    entry_date: start || localIsoDate(),
                    title: '',
                    story: '',
                  });
                  setError('');
                }}
              >
                New entry
              </DialogButton>
              <section aria-label="Saved entries" className="space-y-2">
                {stories
                  .filter((story) => !story.trashed)
                  .map((story) => (
                    <div key={story.id}>
                      <DialogButton
                        onClick={() => {
                          setDraft(story);
                          setError('');
                        }}
                        disabled={disabled}
                      >
                        {story.title || story.entry_date}
                      </DialogButton>
                    </div>
                  ))}
              </section>
              <section aria-label="Trash" className="space-y-2 border-t border-edge pt-3">
                <h3 className="font-semibold">Trash</h3>
                {stories.every((story) => !story.trashed) && <p>Trash is empty.</p>}
                {stories
                  .filter((story) => story.trashed)
                  .map((story) => (
                    <div key={story.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{story.title || story.entry_date}</span>
                      <DialogButton
                        disabled={disabled}
                        onClick={() => void run({ action: 'restore', entryId: story.id, revision: story.revision })}
                      >
                        Restore entry
                      </DialogButton>
                    </div>
                  ))}
              </section>
            </div>
          )
        )}
        {error && (
          <DialogButton onClick={() => void run()} disabled={disabled}>
            Reload entries
          </DialogButton>
        )}
      </div>
    </DialogShell>
  );
}

function JournalPhotoField({ photo, disabled, onChoose, onAttach }: {
  photo: PhotoChoice | null;
  disabled: boolean;
  onChoose: (file: File | null) => void;
  onAttach: () => void;
}) {
  return (
    <section aria-label="Entry photo" className="space-y-2 border-t border-edge pt-3">
      <label className="block space-y-1">
        <span className="block font-semibold">Add a photo</span>
        <input
          className="w-full text-sm text-content"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif,.heic,.heif"
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onChoose(file);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {photo && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="max-w-full truncate text-sm">{photo.file.name}</span>
          <DialogButton icon={<ImagePlus size={16} />} variant="primary" disabled={disabled} onClick={onAttach}>
            Attach photo
          </DialogButton>
          <DialogButton disabled={disabled} onClick={() => onChoose(null)}>Clear photo</DialogButton>
        </div>
      )}
    </section>
  );
}

function JournalTextDraft({
  draft,
  setDraft,
  busy,
  disabled,
  dirty,
  onBack,
  onCommand,
}: {
  draft: JournalDraft;
  setDraft: (draft: JournalDraft) => void;
  busy: boolean;
  disabled: boolean;
  dirty: boolean;
  onBack: () => void;
  onCommand: (command: PreviewJournalCommand) => void;
}) {
  const [confirmTrash, setConfirmTrash] = useState(false);
  const titleId = useId();
  const storyId = useId();
  const dateId = useId();
  const fieldClass = 'w-full rounded-lg border border-edge bg-surface-card px-3 py-2 text-content';
  const dateMissing = 'operationId' in draft && !draft.entry_date;
  const canSave = !disabled && !confirmTrash && !dateMissing && !!(draft.title?.trim() || draft.story?.trim());
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        const text = { title: draft.title ?? '', story: draft.story ?? '' };
        onCommand(
          'operationId' in draft
            ? { action: 'create', operationId: draft.operationId, entryDate: draft.entry_date, ...text }
            : { action: 'edit', entryId: draft.id, revision: draft.revision, ...text }
        );
      }}
    >
      {'operationId' in draft && (
        <div className="space-y-1">
          <label htmlFor={dateId} className="block">
            Date
          </label>
          <input
            id={dateId}
            className={fieldClass}
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            required
            disabled={disabled}
            value={draft.entry_date}
            onChange={(event) => setDraft({ ...draft, entry_date: event.target.value })}
          />
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor={titleId} className="block">
          Title
        </label>
        <input
          className={fieldClass}
          id={titleId}
          maxLength={200}
          value={draft.title ?? ''}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={storyId} className="block">
          Story
        </label>
        <textarea
          className={fieldClass}
          id={storyId}
          maxLength={20000}
          rows={6}
          value={draft.story ?? ''}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, story: event.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <DialogButton type="submit" variant="primary" disabled={!canSave}>
          Save
        </DialogButton>
        <DialogButton
          onClick={() => {
            onBack();
          }}
          disabled={busy}
        >
          {dirty ? 'Discard changes' : 'Back'}
        </DialogButton>
        {'id' in draft && (
          <DialogButton onClick={() => setConfirmTrash(true)} disabled={disabled || confirmTrash}>
            Move to Trash
          </DialogButton>
        )}
      </div>
      {confirmTrash && 'id' in draft && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm Trash">
          <span>This entry can be restored from Trash.</span>
          <DialogButton
            disabled={disabled}
            onClick={() => onCommand({ action: 'trash', entryId: draft.id, revision: draft.revision })}
          >
            Confirm
          </DialogButton>
          <DialogButton disabled={busy} onClick={() => setConfirmTrash(false)}>
            Cancel
          </DialogButton>
        </div>
      )}
    </form>
  );
}
