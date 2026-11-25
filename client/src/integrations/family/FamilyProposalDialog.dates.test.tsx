import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrip } from '../../../tests/helpers/factories';
import { act, fireEvent, render, screen, waitFor, within } from '../../../tests/helpers/render';
import TripFormModal from '../../components/Trips/TripFormModal';
import MNewTripSheet from '../../mobile/screens/dashboard/MNewTripSheet';
import { useSettingsStore } from '../../store/settingsStore';
import * as primaryProfile from './corePrimaryProfile';
import type { OpenTripProposal, TripProposalEditSource } from './legacy/data/supabase/tripProposals';
import { useAuthStore as useFamilyAuthStore } from './legacy/store/authStore';
import { useSettingsStore as useFamilySettingsStore } from './legacy/store/settingsStore';

const io = vi.hoisted(() => ({
  identity: { familyId: 'family-a', personId: 'person-a' },
  tripUuid: vi.fn<(id: number | string) => Promise<string>>(),
  proposals: vi.fn<(id: string) => Promise<OpenTripProposal[]>>(),
  editSource: vi.fn<(id: string) => Promise<TripProposalEditSource>>(),
  rpc: vi.fn(),
}));

vi.mock('./runtime', () => ({ isFamilyFrontendActive: () => true }));
vi.mock('./repository', () => ({
  familyAuthStore: (select: (state: typeof io.identity) => unknown) => select(io.identity),
  familyFrontend: { tripUuid: io.tripUuid },
}));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => ({ rpc: io.rpc }) }));
vi.mock('./legacy/data/supabase/tripProposals', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/tripProposals')>()),
  listOpenTripProposals: io.proposals,
  fetchTripProposalEditSource: io.editSource,
}));
vi.mock('./legacy/data/supabase/catalogCountries', () => {
  const mexico = { id: 'mx', name: 'Mexico', iso2: 'MX' };
  return { listCountriesByIds: async () => [mexico], searchCountries: async () => [mexico] };
});
vi.mock('./legacy/data/supabase/catalogPlaces', () => ({
  listPlacesByIds: async () => [],
  searchCatalogPlaces: async () => [],
}));
vi.mock('./legacy/data/supabase/catalogSaves', () => ({ listMyCatalogSavesInCountries: async () => [] }));
vi.mock('./legacy/data/supabase/familyRoster', () => ({
  listFamilyPeople: async () => [],
  listTravelerPresets: async () => [],
}));
vi.mock('./legacy/components/Trips/FamilyProposalVoteModal', () => ({
  default: ({ proposalId }: { proposalId: string }) => <div role="dialog" aria-label={'Vote on ' + proposalId} />,
}));

const original = useSettingsStore.getState().settings;
const familyOriginal = useFamilySettingsStore.getState().settings;
const trip = buildTrip({ id: 7, title: 'Mexico' });
const proposal: OpenTripProposal = {
  proposalId: 'proposal-a',
  tripId: 'trip-a',
  proposedByPersonId: 'person-a',
  status: 'submitted',
  title: trip.title,
};

beforeEach(() => {
  useSettingsStore.setState({
    settings: { ...original, language: 'en', date_format: 'DD.MM.YYYY', week_start: 'sunday' },
  });
  useFamilySettingsStore.setState({ settings: { ...familyOriginal, language: 'en' } });
  io.tripUuid.mockReset().mockResolvedValue('trip-a');
  io.proposals.mockReset().mockResolvedValue([]);
  io.editSource.mockReset().mockResolvedValue({
    tripId: 'trip-a',
    title: trip.title,
    notes: 'Keep these notes',
    startDate: '2026-03-05',
    endDate: '2026-03-07',
    coverUrl: null,
    occasion: 'trip',
    reminderDays: 3,
    primaryCountryId: 'mx',
    countryIds: ['mx'],
    placeIds: [],
    travelerPersonIds: ['person-a'],
  });
  io.rpc.mockReset().mockResolvedValue({ data: { proposal_id: 'proposal-a', trip_id: 'trip-a' }, error: null });
});

afterEach(() => {
  useSettingsStore.setState({ settings: original });
  useFamilySettingsStore.setState({ settings: familyOriginal });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function open(layout: 'desktop' | 'phone', editing = false) {
  const callbacks = { trip: editing ? trip : null, onClose: vi.fn(), onSave: vi.fn() };
  render(layout === 'desktop' ? <TripFormModal isOpen {...callbacks} /> : <MNewTripSheet open {...callbacks} />);
  return callbacks;
}

function typeDate(index: number, value: string) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Enter date manually' })[index]);
  const field = screen.getByRole('textbox', { name: 'Enter date manually' });
  expect(field).toHaveFocus();
  fireEvent.change(field, { target: { value } });
  fireEvent.keyDown(field, { key: 'Enter' });
}

async function review(selectCountry = true) {
  const advance = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  advance();
  if (selectCountry) fireEvent.click(await screen.findByRole('button', { name: 'Mexico (MX)' }));
  advance();
  advance();
  advance();
  await screen.findByRole('heading', { name: 'Review' });
}

describe('New Trip with a submission receipt', () => {
  const initialAuth = useFamilyAuthStore.getState();
  const receipt = { proposal_id: '12345678-1234-4abc-8def-1234567890ab', trip_id: '12345678-1234-4abc-8def-1234567890cd' };

  beforeEach(() => {
    useFamilyAuthStore.setState({
      ...io.identity,
      authUserId: 'auth-a',
      isAuthenticated: true,
      authGate: 'ok',
    });
    vi.spyOn(primaryProfile, 'primaryCoreMode').mockReturnValue('write');
    io.rpc.mockResolvedValue({ data: receipt, error: null });
  });

  afterEach(() => useFamilyAuthStore.setState(initialAuth));

  async function openReview(layout: 'desktop' | 'phone') {
    const callbacks = open(layout);
    await screen.findByRole('heading', { name: 'New Trip' });
    fireEvent.change(screen.getByPlaceholderText('e.g. Summer in Japan'), { target: { value: 'Mexico' } });
    if (layout === 'desktop') {
      expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Propose trip' })).toBeDisabled();
      fireEvent.click(await screen.findByRole('button', { name: 'Mexico (MX)' }));
    } else {
      await review();
    }
    return callbacks;
  }

  it.each(['desktop', 'phone'] as const)('recovers a lost reply from the %s form using the same submission', async (layout) => {
    vi.setSystemTime(new Date('2026-11-23T23:59:00Z'));
    io.rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Failed to fetch' } });
    const callbacks = await openReview(layout);
    fireEvent.click(screen.getByRole('button', { name: 'Propose trip' }));
    const retry = await screen.findByRole('button', { name: 'Retry submission' });
    expect(screen.getByText(/We couldn’t confirm your trip was saved/)).toBeVisible();
    if (layout === 'desktop') expect(screen.getByPlaceholderText('e.g. Summer in Japan')).toBeDisabled();
    else expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(io.rpc).toHaveBeenCalledExactlyOnceWith('create_family_trip_proposal_v1', expect.objectContaining({
      p_operation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      p_family_id: 'family-a',
      p_country_ids: ['mx'],
      p_start_at: '2026-11-23T00:00:00.000Z',
    }));

    vi.setSystemTime(new Date('2026-11-24T00:01:00Z'));
    fireEvent.click(retry);
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
    expect(io.rpc).toHaveBeenCalledTimes(2);
    expect(io.rpc.mock.calls[1]).toEqual(io.rpc.mock.calls[0]);
  });

  it('starts a fresh submission after the database definitively rejects the first attempt', async () => {
    io.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'Choose travelers from this Family' } });
    const callbacks = await openReview('desktop');
    fireEvent.click(screen.getByRole('button', { name: 'Propose trip' }));
    expect(await screen.findByText('Choose travelers from this Family')).toBeVisible();
    expect(screen.getByPlaceholderText('e.g. Summer in Japan')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Propose trip' }));
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
    expect(io.rpc).toHaveBeenCalledTimes(2);
    expect(io.rpc.mock.calls[1][1].p_operation_id).not.toBe(io.rpc.mock.calls[0][1].p_operation_id);
  });

  it('does not send a second request during submit and retries a missing receipt with the same ID', async () => {
    let finish: () => void = () => { throw new Error('Submission did not start'); };
    io.rpc.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ data: { trip_id: receipt.trip_id }, error: null });
    }));
    const callbacks = await openReview('desktop');
    const submit = screen.getByRole('button', { name: 'Propose trip' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(io.rpc).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
    finish();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry submission' }));
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
    expect(io.rpc.mock.calls[1]).toEqual(io.rpc.mock.calls[0]);
  });

  it('ignores a receipt after the account changes and refuses to resend it', async () => {
    let finish: () => void = () => { throw new Error('Submission did not start'); };
    io.rpc.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ data: receipt, error: null });
    }));
    const callbacks = await openReview('phone');
    fireEvent.click(screen.getByRole('button', { name: 'Propose trip' }));
    useFamilyAuthStore.setState({ authUserId: 'auth-b', personId: 'person-b' });
    finish();
    await screen.findByText(/The Family account or access context changed/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }));
    await screen.findByText(/The Family account or access context changed/);
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(io.rpc).toHaveBeenCalledOnce();
  });
});

describe('Family proposal dates through the dashboard forms', () => {
  it.each(['desktop', 'phone'] as const)(
    'uses the active format and week start in the %s create flow',
    async (layout) => {
      const callbacks = open(layout);
      const heading = await screen.findByRole('heading', { name: 'New Trip' });
      fireEvent.change(screen.getByPlaceholderText('e.g. Summer in Japan'), { target: { value: 'Mexico' } });

      typeDate(0, '05.03.2026');
      expect(screen.getByRole('button', { name: 'Start Date: 05.03.2026' })).toBeVisible();
      expect(callbacks.onClose).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'End Date: 05.03.2026' }));
      const calendar = screen.getByRole('dialog', { name: 'Date picker' });
      const dayOne = within(calendar).getByRole('button', { name: 'March 1, 2026' });
      expect(dayOne.parentElement?.firstElementChild).toBe(dayOne);
      fireEvent.click(within(calendar).getByRole('button', { name: 'March 7, 2026' }));
      expect(calendar).not.toBeInTheDocument();
      expect(heading).toBeVisible();

      if (layout === 'desktop') fireEvent.click(await screen.findByRole('button', { name: 'Mexico (MX)' }));
      else await review();
      fireEvent.click(screen.getByRole('button', { name: 'Propose trip' }));
      await waitFor(() =>
        expect(io.rpc).toHaveBeenCalledExactlyOnceWith(
          'create_trip_proposal',
          expect.objectContaining({
            p_family_id: 'family-a',
            p_start_at: '2026-03-05T00:00:00.000Z',
            p_end_at: '2026-03-07T00:00:00.000Z',
            p_country_ids: ['mx'],
          })
        )
      );
      expect(callbacks.onSave).not.toHaveBeenCalled();
    }
  );

  it('keeps duration-only proposals when the phone date fields are empty', async () => {
    vi.setSystemTime(new Date('2026-04-10T14:00:00Z'));
    open('phone');
    await screen.findByRole('heading', { name: 'New Trip' });
    fireEvent.change(screen.getByPlaceholderText('e.g. Summer in Japan'), { target: { value: 'Mexico' } });
    fireEvent.change(screen.getByDisplayValue('7'), { target: { value: '3' } });
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Propose trip' }));
    await waitFor(() =>
      expect(io.rpc).toHaveBeenCalledExactlyOnceWith(
        'create_trip_proposal',
        expect.objectContaining({
          p_start_at: '2026-04-10T00:00:00.000Z',
          p_end_at: '2026-04-12T00:00:00.000Z',
        })
      )
    );
  });

  it('sends only the owned proposal ID on an edit with new dates', async () => {
    io.proposals.mockResolvedValue([proposal]);
    open('desktop', true);
    await screen.findByRole('heading', { name: /Edit Trip/i });
    expect(await screen.findByDisplayValue('Keep these notes')).toBeVisible();
    typeDate(1, '11.03.2026');
    await review(false);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() =>
      expect(io.rpc).toHaveBeenCalledExactlyOnceWith(
        'update_trip_proposal',
        expect.objectContaining({
          p_proposal_id: 'proposal-a',
          p_start_at: '2026-03-05T00:00:00.000Z',
          p_end_at: '2026-03-11T00:00:00.000Z',
          p_notes: 'Keep these notes',
        })
      )
    );
    expect(io.rpc.mock.calls[0][1]).not.toHaveProperty('p_family_id');
    expect(io.editSource).toHaveBeenCalledExactlyOnceWith('trip-a');
  });

  it('routes another member’s proposal to voting without opening the editor', async () => {
    io.proposals.mockResolvedValue([{ ...proposal, proposedByPersonId: 'person-b' }]);
    open('phone', true);
    expect(await screen.findByRole('dialog', { name: 'Vote on proposal-a' })).toBeVisible();
    expect(io.editSource).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Start Date' })).not.toBeInTheDocument();
    expect(io.rpc).not.toHaveBeenCalled();
  });

  it('renders the translated native picker and keeps Escape on the proposal modal boundary', async () => {
    const callbacks = open('phone');
    await screen.findByRole('heading', { name: 'New Trip' });
    act(() => {
      useSettingsStore.setState({ settings: { ...original, language: 'de', date_format: 'auto' } });
      useFamilySettingsStore.setState({ settings: { ...familyOriginal, language: 'de' } });
    });
    await screen.findByRole('heading', { name: 'Neue Reise' });
    const [manual] = await screen.findAllByRole('button', { name: 'Datum manuell eingeben' });
    fireEvent.click(manual);
    const field = screen.getByRole('textbox', { name: 'Datum manuell eingeben' });
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: '04.11.2026' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByRole('button', { name: /^Startdatum: / })).toHaveTextContent(/4.*Nov.*2026/);
    expect(screen.queryByRole('textbox', { name: 'Datum manuell eingeben' })).not.toBeInTheDocument();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    expect(io.rpc).not.toHaveBeenCalled();
  });
});
