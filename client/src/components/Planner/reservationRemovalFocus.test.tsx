import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { StrictMode, useState } from 'react';
import { Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { buildReservation, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { buildPlanner, buildShell } from '../../../tests/helpers/mobileTrip';
import { server } from '../../../tests/helpers/msw/server';
import { act, render, screen, within } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import type { MTripShellApi } from '../../mobile/screens/trip/MTripShell';
import MTransportSheet from '../../mobile/screens/trip/sheets/MTransportSheet';
import MBookingsTab from '../../mobile/screens/trip/tabs/MBookingsTab';
import MTransportsTab from '../../mobile/screens/trip/tabs/MTransportsTab';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTripStore } from '../../store/tripStore';
import type { Reservation } from '../../types';
import { resetBodyScrollLock } from '../../utils/bodyScrollLock';
import ReservationsPanel from './ReservationsPanel';

type Surface = 'desktop' | 'phone bookings' | 'phone transports';
const record = (id: number, options: Partial<Reservation> = {}) =>
  buildReservation({
    id,
    trip_id: 1,
    title: 'Reservation ' + id,
    type: 'restaurant',
    status: 'confirmed',
    reservation_time: '2027-04-01T1' + id + ':00',
    ...options,
  });
const first = record(1);
const second = record(2);
const third = record(3);
const remove = vi.fn<(id: number) => Promise<boolean>>();

beforeEach(() => {
  resetAllStores();
  resetBodyScrollLock();
  remove.mockReset();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1 }), budgetItems: [] });
  seedStore(useSettingsStore, { settings: { language: 'en', time_format: '24h' } });
  server.use(http.get('/api/view-contributions/:view/:tripId', () => HttpResponse.json({ contributions: [] })));
});

function PhoneList({
  reservations,
  onDelete,
  isTransport,
}: {
  reservations: Reservation[];
  onDelete: (id: number) => Promise<void>;
  isTransport: boolean;
}) {
  const [tab, setTab] = useState<MTripShellApi['trTab']>(isTransport ? 'transports' : 'buchungen');
  const [sheet, setSheet] = useState<MTripShellApi['sheet']>(null);
  const planner = buildPlanner({ reservations, handleDeleteReservation: onDelete });
  const shell = buildShell({
    trTab: tab,
    openSheet: (id, payload) => setSheet({ id, payload }),
    closeSheet: () => setSheet(null),
    sheet,
  });
  return (
    <>
      <button type="button" onClick={() => setTab('plan')}>
        Switch tab
      </button>
      {tab === 'buchungen' && <MBookingsTab planner={planner} shell={shell} />}
      {tab === 'transports' && <MTransportsTab planner={planner} shell={shell} />}
      <MTransportSheet planner={planner} shell={shell} />
    </>
  );
}

function Harness({ surface, initial }: { surface: Surface; initial: Reservation[] }) {
  const [rows, setRows] = useState(initial);
  const onDelete = async (id: number) => {
    if (await remove(id)) setRows((current) => current.filter((row) => row.id !== id));
  };
  return (
    <>
      <button type="button">Outside list</button>
      {surface === 'desktop' ? (
        <ReservationsPanel
          tripId={1}
          reservations={rows}
          days={[]}
          assignments={{}}
          onAdd={() => undefined}
          onEdit={() => undefined}
          onDelete={onDelete}
          onNavigateToFiles={() => undefined}
        />
      ) : (
        <PhoneList reservations={rows} onDelete={onDelete} isTransport={surface === 'phone transports'} />
      )}
    </>
  );
}

function holdRemoval() {
  let finish!: (removed: boolean) => void;
  const write = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  remove.mockReturnValue(write);
  return async (removed: boolean) => {
    await act(async () => {
      finish(removed);
      await write;
    });
  };
}

function mountReservations(surface: Surface, initial: Reservation[]) {
  const user = userEvent.setup();
  const rows = surface === 'phone transports' ? initial.map((row) => ({ ...row, type: 'train' })) : initial;
  render(
    <StrictMode>
      <Routes>
        <Route path="/trips/:id" element={<Harness surface={surface} initial={rows} />} />
      </Routes>
    </StrictMode>,
    {
      initialEntries: ['/trips/1'],
    }
  );
  return user;
}

async function begin(surface: Surface, initial: Reservation[], selected: Reservation, view = 'List') {
  const settle = holdRemoval();
  const user = mountReservations(surface, initial);
  const isDesktop = surface === 'desktop';
  if (isDesktop) {
    const views = screen.getByRole('group', { name: 'View' });
    await user.click(within(views).getByRole('button', { name: view }));
  }
  const row = (value: Reservation) =>
    screen.getByRole(view === 'Cards' ? 'article' : 'button', {
      name: new RegExp(value.title),
    });
  const selectedRow = row(selected);
  selectedRow.focus();
  await user.keyboard('{Enter}');
  const detail = await screen.findByRole('dialog', { name: selected.title });
  await user.click(within(detail).getByRole('button', { name: 'Delete' }));
  if (isDesktop) {
    const question = screen.getByRole('alertdialog', { name: 'Delete booking?' });
    await user.click(within(question).getByRole('button', { name: 'Delete' }));
  }
  expect(remove).toHaveBeenCalledExactlyOnceWith(selected.id);
  return { row, selectedRow, settle, user };
}

it.each([
  ['desktop', 'List'],
  ['desktop', 'Cards'],
  ['desktop', 'Timeline'],
  ['phone bookings', 'List'],
  ['phone transports', 'List'],
] as const)('%s %s focuses the next remaining reservation after a confirmed removal', async (surface, view) => {
  const { row, selectedRow, settle } = await begin(surface, [first, second, third], second, view);
  await settle(true);
  expect(selectedRow).not.toBeInTheDocument();
  expect(row(third)).toHaveFocus();
});

it('focuses the previous reservation when deleting the last visible transport', async () => {
  const { row, settle } = await begin('phone transports', [first, second], second);
  await settle(true);
  expect(row(first)).toHaveFocus();
});

it('focuses the existing Add action after deleting the only desktop booking', async () => {
  const { settle } = await begin('desktop', [first], first);
  await settle(true);
  expect(
    screen.getAllByRole('button', { name: 'Manual Booking' }).find((button) => button === document.activeElement)
  ).toBeDefined();
});

it('focuses the phone booking list when its final row is removed', async () => {
  const { settle } = await begin('phone bookings', [first], first);
  await settle(true);
  expect(screen.getByRole('region', { name: 'reservations.title' })).toHaveFocus();
});

it.each(['desktop', 'phone transports'] as const)(
  '%s keeps focus on the original row after a refused removal',
  async (surface) => {
    const { selectedRow, settle } = await begin(surface, [first, second], first);
    await settle(false);
    expect(selectedRow).toHaveFocus();
  }
);

it('does not take focus back when the user moves away and blurs before Delete settles', async () => {
  const { settle } = await begin('desktop', [first, second], first);
  const elsewhere = screen.getByRole('button', { name: 'Outside list' });
  elsewhere.focus();
  elsewhere.blur();
  await settle(true);
  expect(document.body).toHaveFocus();
});

it('does not move focus into another phone tab after Delete settles', async () => {
  const { user, settle } = await begin('phone transports', [first, second], first);
  const tab = screen.getByRole('button', { name: 'Switch tab' });
  await user.click(tab);
  await settle(true);
  expect(tab).toHaveFocus();
});

const phoneLists = [
  { surface: 'phone bookings', label: 'reservations.title' },
  { surface: 'phone transports', label: 'transport.title' },
] as const;

const phoneTitle = (value: Reservation) => screen.getByRole('button', { name: new RegExp(value.title) });

async function openCardQuestion(user: ReturnType<typeof userEvent.setup>, selected: Reservation) {
  const row = phoneTitle(selected).closest<HTMLElement>('[data-reservation-row-id]');
  if (!row) throw new Error('Expected a phone reservation card');
  const trigger = within(row).getByRole('button', { name: 'common.delete' });
  trigger.focus();
  await user.keyboard('{Enter}');
  const question = within(screen.getByRole('dialog', { name: 'reservations.confirm.deleteTitle' }));
  const press = async (label: string) => {
    question.getByRole('button', { name: label }).focus();
    await user.keyboard('{Enter}');
  };
  return { trigger, confirm: () => press('common.delete'), cancel: () => press('common.cancel') };
}

it.each(phoneLists)(
  '$surface focuses the next visible row when a direct card delete removes its opener',
  async ({ surface }) => {
    remove.mockResolvedValue(true);
    const user = mountReservations(surface, [first, second, third]);
    const opener = phoneTitle(second);
    const { confirm } = await openCardQuestion(user, second);
    expect(remove).not.toHaveBeenCalled();
    await confirm();
    expect(remove).toHaveBeenCalledExactlyOnceWith(second.id);
    expect(opener).not.toBeInTheDocument();
    expect(phoneTitle(third)).toHaveFocus();
  }
);

it.each(phoneLists)('$surface focuses its named list after deleting its final card', async ({ surface, label }) => {
  const settle = holdRemoval();
  const user = mountReservations(surface, [first]);
  const { confirm } = await openCardQuestion(user, first);
  await confirm();
  await settle(true);
  expect(remove).toHaveBeenCalledExactlyOnceWith(first.id);
  expect(screen.getByRole('region', { name: label })).toHaveFocus();
});

it.each(phoneLists)('$surface restores the Delete button on cancellation or refusal', async ({ surface }) => {
  const settle = holdRemoval();
  const user = mountReservations(surface, [first, second]);
  const { trigger, cancel } = await openCardQuestion(user, first);
  await cancel();
  expect(remove).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();

  const { confirm } = await openCardQuestion(user, first);
  await confirm();
  await settle(false);
  expect(remove).toHaveBeenCalledExactlyOnceWith(first.id);
  expect(trigger).toHaveFocus();
});

it('returns to the previous phone card when a slow delete removes the last visible row', async () => {
  const settle = holdRemoval();
  const user = mountReservations('phone transports', [first, second]);
  const { confirm } = await openCardQuestion(user, second);
  await confirm();
  await settle(true);
  expect(remove).toHaveBeenCalledExactlyOnceWith(second.id);
  expect(phoneTitle(first)).toHaveFocus();
});

it('leaves focus alone if the user leaves the card while the delete is pending', async () => {
  const settle = holdRemoval();
  const user = mountReservations('phone bookings', [first, second]);
  const { confirm } = await openCardQuestion(user, first);
  await confirm();
  const elsewhere = screen.getByRole('button', { name: 'Outside list' });
  elsewhere.focus();
  elsewhere.blur();
  await settle(true);
  expect(remove).toHaveBeenCalledExactlyOnceWith(first.id);
  expect(document.body).toHaveFocus();
});

it('leaves focus outside the phone reservation tab when the list unmounts mid-delete', async () => {
  const settle = holdRemoval();
  const user = mountReservations('phone transports', [first, second]);
  const { confirm } = await openCardQuestion(user, first);
  await confirm();
  const tab = screen.getByRole('button', { name: 'Switch tab' });
  await user.click(tab);
  await settle(true);
  expect(remove).toHaveBeenCalledExactlyOnceWith(first.id);
  expect(tab).toHaveFocus();
});
