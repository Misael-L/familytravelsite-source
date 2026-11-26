import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FamilyProposalDialog } from './FamilyProposalDialog';
import type { OpenTripProposal } from './legacy/data/supabase/tripProposals';

const mocks = vi.hoisted(() => ({
  auth: { familyId: 'family-a', personId: 'person-a' } as { familyId: string | null; personId: string | null },
  t: (key: string) => 'en:' + key,
  error: vi.fn<(message: string) => void>(),
  tripUuid: vi.fn<(id: number | string) => Promise<string>>(),
  list: vi.fn<(family: string) => Promise<OpenTripProposal[]>>(),
}));
vi.mock('./repository', () => ({
  familyAuthStore: (select: (state: typeof mocks.auth) => unknown) => select(mocks.auth),
  familyFrontend: { tripUuid: mocks.tripUuid },
}));
vi.mock('./legacy/i18n', () => ({
  TranslationProvider: ({ children }: PropsWithChildren) => children,
  useTranslation: () => ({ t: mocks.t }),
}));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => ({ error: mocks.error }) }));
vi.mock('./legacy/data/supabase/tripProposals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./legacy/data/supabase/tripProposals')>()),
  listOpenTripProposals: mocks.list,
}));
vi.mock('./legacy/components/Trips/FamilyProposeTripModal', () => ({
  default: function ProposalEditor({
    editingTripId,
    editingProposalId,
  }: {
    editingTripId?: string;
    editingProposalId?: string;
  }) {
    const [notes, setNotes] = useState('');
    return (
      <input
        aria-label="proposal notes"
        data-trip={editingTripId}
        data-proposal={editingProposalId}
        value={notes}
        onChange={(e) => setNotes(e.currentTarget.value)}
      />
    );
  },
}));
vi.mock('./legacy/components/Trips/FamilyProposalVoteModal', () => ({
  default: ({ proposalId }: { proposalId: string }) => (
    <div role="dialog" data-proposal={proposalId}>
      Vote
    </div>
  ),
}));

const tripA = '10000000-0000-4000-8000-000000000011';
const tripB = '10000000-0000-4000-8000-000000000022';
const proposal = (tripId = tripA): OpenTripProposal => ({
  proposalId: 'proposal-' + tripId,
  tripId,
  proposedByPersonId: 'person-a',
  status: 'submitted',
  title: 'Fixture Trip',
});
function deferred<T>() {
  const task: { resolve?: (value: T) => void; reject?: (error: unknown) => void } = {};
  const promise = new Promise<T>((resolve, reject) => {
    task.resolve = resolve;
    task.reject = reject;
  });
  return {
    promise,
    resolve: (value: T) => {
      if (!task.resolve) throw Error('Deferred not initialized');
      task.resolve(value);
    },
    reject: (error: unknown) => {
      if (!task.reject) throw Error('Deferred not initialized');
      task.reject(error);
    },
  };
}
const retireModes = ['close', 'unmount', 'trip', 'family', 'person'] as const;
type RetireMode = (typeof retireModes)[number];
function retire(view: ReturnType<typeof render>, mode: RetireMode, onClose: () => void) {
  if (mode === 'unmount') {
    view.unmount();
    return;
  }
  if (mode === 'family') mocks.auth.familyId = 'family-b';
  if (mode === 'person') mocks.auth.personId = 'person-b';
  view.rerender(
    <FamilyProposalDialog open={mode !== 'close'} trip={{ id: mode === 'trip' ? 22 : 11 }} onClose={onClose} />
  );
}
beforeEach(() => {
  mocks.auth = { familyId: 'family-a', personId: 'person-a' };
  mocks.t = (key) => 'en:' + key;
  mocks.error.mockReset();
  mocks.tripUuid.mockReset().mockImplementation(async (id) => (Number(id) === 22 ? tripB : tripA));
  mocks.list.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe('proposal opening read lifecycle', () => {
  it.each(['published', 'failure'] as const)(
    'uses the latest close callback for a pending %s completion without restarting the read',
    async (kind) => {
      const pending = deferred<OpenTripProposal[]>();
      mocks.list.mockReturnValueOnce(pending.promise);
      const oldClose = vi.fn(),
        latestClose = vi.fn();
      const view = render(<FamilyProposalDialog open trip={{ id: 11 }} onClose={oldClose} />);
      await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
      view.rerender(<FamilyProposalDialog open trip={{ id: 11 }} onClose={latestClose} />);
      await act(async () => {
        if (kind === 'published') pending.resolve([]);
        else pending.reject(new Error('Read unavailable'));
      });
      expect(latestClose).toHaveBeenCalledTimes(1);
      expect(oldClose).not.toHaveBeenCalled();
      expect(mocks.list).toHaveBeenCalledTimes(1);
      expect(mocks.tripUuid).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['published', 'unknown-error'] as const)(
    'uses the current translation for a pending %s completion without restarting the read',
    async (kind) => {
      const pending = deferred<OpenTripProposal[]>();
      mocks.list.mockReturnValueOnce(pending.promise);
      const onClose = vi.fn();
      const view = render(<FamilyProposalDialog open trip={{ id: 11 }} onClose={onClose} />);
      await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
      mocks.t = (key) => 'fr:' + key;
      view.rerender(<FamilyProposalDialog open trip={{ id: 11 }} onClose={onClose} />);
      await act(async () => {
        if (kind === 'published') pending.resolve([]);
        else pending.reject({});
      });
      expect(mocks.error).toHaveBeenCalledWith(
        'fr:' + (kind === 'published' ? 'dashboard.toast.editPublished' : 'common.unknownError')
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(mocks.list).toHaveBeenCalledTimes(1);
    }
  );
  it.each(retireModes)('does not start a proposal query after the UUID read retires through %s', async (mode) => {
    const first = deferred<string>(),
      replacement = deferred<string>();
    mocks.tripUuid.mockReturnValueOnce(first.promise).mockReturnValueOnce(replacement.promise);
    const onClose = vi.fn();
    const view = render(<FamilyProposalDialog open trip={{ id: 11 }} onClose={onClose} />);
    expect(mocks.tripUuid).toHaveBeenCalledTimes(1);
    retire(view, mode, onClose);
    await act(async () => {
      first.resolve(tripA);
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
  it.each(retireModes)('ignores a proposal result after its opening retires through %s', async (mode) => {
    const pending = deferred<OpenTripProposal[]>(),
      replacement = deferred<string>();
    mocks.list.mockReturnValueOnce(pending.promise);
    mocks.tripUuid.mockResolvedValueOnce(tripA).mockReturnValueOnce(replacement.promise);
    const onClose = vi.fn();
    const view = render(<FamilyProposalDialog open trip={{ id: 11 }} onClose={onClose} />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    retire(view, mode, onClose);
    await act(async () => {
      pending.resolve([]);
    });
    expect(mocks.error).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps already typed edit fields and original proposal identity when only UI callbacks change', async () => {
    mocks.list.mockResolvedValue([proposal()]);
    const view = render(<FamilyProposalDialog open trip={{ id: 11 }} onClose={vi.fn()} />);
    const input = await screen.findByLabelText('proposal notes');
    fireEvent.change(input, { target: { value: 'Keep my existing notes' } });
    mocks.t = (key) => 'fr:' + key;
    view.rerender(<FamilyProposalDialog open trip={{ id: 11 }} onClose={vi.fn()} />);
    expect(screen.getByLabelText('proposal notes')).toBe(input);
    expect(input).toHaveValue('Keep my existing notes');
    expect(input).toHaveAttribute('data-trip', tripA);
    expect(input).toHaveAttribute('data-proposal', proposal().proposalId);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
  it('still opens a new-trip proposal without querying trip identity or proposals', async () => {
    render(<FamilyProposalDialog open trip={null} onClose={vi.fn()} />);
    expect(await screen.findByLabelText('proposal notes')).toHaveValue('');
    expect(mocks.tripUuid).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('still chooses the vote view for another person’s open proposal', async () => {
    mocks.list.mockResolvedValue([{ ...proposal(), proposedByPersonId: 'another-person' }]);
    render(<FamilyProposalDialog open trip={{ id: 11 }} onClose={vi.fn()} />);
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-proposal', proposal().proposalId);
    expect(screen.queryByLabelText('proposal notes')).not.toBeInTheDocument();
  });
});
