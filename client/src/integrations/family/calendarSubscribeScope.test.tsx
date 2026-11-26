import { act, fireEvent, render, screen } from '../../../tests/helpers/render';
import { FamilyCalendarSubscribeModal } from './legacy/components/Planner/family/FamilyCalendarSubscribeModal';
import { fetchCalendarFeedUrl, regenerateCalendarFeed } from './legacy/data/supabase/calendarFeed';

vi.mock('./legacy/data/supabase/calendarFeed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./legacy/data/supabase/calendarFeed')>()),
  fetchCalendarFeedUrl: vi.fn(),
  regenerateCalendarFeed: vi.fn(),
}));

const read = vi.mocked(fetchCalendarFeedUrl);
const rotate = vi.mocked(regenerateCalendarFeed);
const currentLink = 'https://calendar.example.invalid/current.ics';
const previousLink = 'https://calendar.example.invalid/previous.ics';
const onClose = vi.fn();

function pendingLink() {
  let finish = (_link: string) => {};
  const result = new Promise<string>((resolve) => {
    finish = resolve;
  });
  return { result, finish };
}

beforeEach(() => {
  read.mockReset();
  rotate.mockReset();
});

it('keeps the selected Family profile feed when an earlier profile read finishes later', async () => {
  const pending = pendingLink();
  read.mockReturnValueOnce(pending.result).mockResolvedValueOnce(currentLink);
  const view = render(<FamilyCalendarSubscribeModal familyId="family-a" personId="person-a" onClose={onClose} />);
  view.rerender(<FamilyCalendarSubscribeModal familyId="family-a" personId="person-b" onClose={onClose} />);
  await screen.findByText(currentLink);

  await act(async () => pending.finish(previousLink));
  expect(screen.queryByText(previousLink)).not.toBeInTheDocument();
  expect(screen.getByText(currentLink)).toBeInTheDocument();
  expect(read.mock.calls).toEqual([
    ['family-a', 'person-a'],
    ['family-a', 'person-b'],
  ]);
});

it('discards the previous Family profile rotation when the current profile has no feed', async () => {
  const pending = pendingLink();
  read.mockResolvedValueOnce(previousLink).mockResolvedValueOnce(null);
  rotate.mockReturnValueOnce(pending.result);
  const view = render(<FamilyCalendarSubscribeModal familyId="family-a" personId="person-a" onClose={onClose} />);
  fireEvent.click(await screen.findByRole('button', { name: /Regenerate/i }));
  expect(rotate).toHaveBeenCalledWith('family-a', 'person-a');

  view.rerender(<FamilyCalendarSubscribeModal familyId="family-b" personId="person-b" onClose={onClose} />);
  expect(screen.queryByText(previousLink)).not.toBeInTheDocument();
  await screen.findByRole('button', { name: /Enable calendar subscription/i });
  await act(async () => pending.finish('https://calendar.example.invalid/old-rotation.ics'));

  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Enable calendar subscription/i })).toBeEnabled();
});
