import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { StrictMode, useState, type ReactElement } from 'react';
import { Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  buildBudgetItem,
  buildReservation,
  buildTrip,
  buildTripFile,
  buildUser,
} from '../../../tests/helpers/factories';
import { buildPlanner, buildShell } from '../../../tests/helpers/mobileTrip';
import { server } from '../../../tests/helpers/msw/server';
import { render, screen, waitFor, within } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import * as familyRuntime from '../../integrations/family/runtime';
import type { MTripShellApi } from '../../mobile/screens/trip/MTripShell';
import MReservationSheet from '../../mobile/screens/trip/sheets/MReservationSheet';
import MTransportFormSheet from '../../mobile/screens/trip/sheets/MTransportFormSheet';
import MTransportSheet from '../../mobile/screens/trip/sheets/MTransportSheet';
import MBookingsTab from '../../mobile/screens/trip/tabs/MBookingsTab';
import MTransportsTab from '../../mobile/screens/trip/tabs/MTransportsTab';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTripStore } from '../../store/tripStore';
import type { BudgetItem, Reservation, TripFile } from '../../types';
import { resetBodyScrollLock } from '../../utils/bodyScrollLock';
import { ExpenseModal } from '../Budget/CostsPanel';
import { ReservationModal } from './ReservationModal';
import ReservationsPanel from './ReservationsPanel';
import { TransportModal } from './TransportModal';

const booking = buildReservation({
  id: 401,
  trip_id: 1,
  type: 'restaurant',
  title: 'Family lunch',
  status: 'confirmed',
});
const transport = buildReservation({ id: 402, trip_id: 1, type: 'train', title: 'Family train', status: 'confirmed' });
const expense = buildBudgetItem({
  id: 403,
  reservation_id: booking.id,
  name: 'Lunch receipt',
  total_price: 25,
  currency: 'EUR',
});
const save = vi.fn(async () => undefined);
const remove = vi.fn(async () => undefined);

const cases = [
  { reservation: booking, kind: 'booking', desktopEditor: 'Edit Reservation', phoneEditor: 'reservations.editTitle' },
  {
    reservation: transport,
    kind: 'transport',
    desktopEditor: 'Edit transport',
    phoneEditor: 'transport.modalTitle.edit',
  },
] as const;

beforeEach(() => {
  resetAllStores();
  resetBodyScrollLock();
  save.mockClear();
  remove.mockClear();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1 }), budgetItems: [expense] });
  seedStore(useSettingsStore, { settings: { language: 'en', time_format: '24h' } });
  server.use(http.get('/api/view-contributions/:view/:tripId', () => HttpResponse.json({ contributions: [] })));
});

function DesktopEditors({ reservation, files = [] }: { reservation: Reservation; files?: TripFile[] }) {
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [editingExpense, setEditingExpense] = useState<BudgetItem | null>(null);
  const isTransport = reservation.type === 'train';
  const editorProps = {
    onSave: save,
    onClose: () => setEditing(null),
    reservation: editing,
    days: [],
    selectedDayId: null,
    isOpen: editing !== null,
  };
  const closeExpense = () => setEditingExpense(null);
  return (
    <>
      <ReservationsPanel
        tripId={1}
        reservations={[reservation]}
        days={[]}
        assignments={{}}
        files={files}
        contributionView={isTransport ? 'transports' : 'reservations'}
        onAdd={() => undefined}
        onEdit={setEditing}
        onEditExpense={setEditingExpense}
        onNavigateToFiles={() => undefined}
        onDelete={remove}
      />
      {isTransport ? (
        <TransportModal {...editorProps} />
      ) : (
        <ReservationModal {...editorProps} places={[]} assignments={{}} onFileDelete={remove} />
      )}
      {editingExpense && (
        <ExpenseModal
          tripId={1}
          base="EUR"
          people={[]}
          me={1}
          editing={editingExpense}
          onClose={closeExpense}
          onSaved={closeExpense}
        />
      )}
    </>
  );
}

function PhoneEditors({ reservation }: { reservation: Reservation }) {
  const [sheet, setSheet] = useState<MTripShellApi['sheet']>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [editingTransport, setEditingTransport] = useState<Reservation | null>(null);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const isTransport = reservation.type === 'train';
  const planner = buildPlanner({
    reservations: [reservation],
    editingReservation,
    setEditingReservation,
    editingTransport,
    setEditingTransport,
    showReservationModal,
    setShowReservationModal,
    showTransportModal,
    setShowTransportModal,
    handleSaveReservation: save,
    handleSaveTransport: save,
    handleDeleteReservation: remove,
  });
  const shell = buildShell({
    trTab: isTransport ? 'transports' : 'buchungen',
    sheet,
    openSheet: (id, payload) => setSheet({ id, payload }),
    closeSheet: () => setSheet(null),
  });
  return (
    <>
      {isTransport ? (
        <MTransportsTab planner={planner} shell={shell} />
      ) : (
        <MBookingsTab planner={planner} shell={shell} />
      )}
      <MTransportSheet planner={planner} shell={shell} />
      <MReservationSheet planner={planner} onOpenExpense={() => undefined} />
      <MTransportFormSheet planner={planner} onOpenExpense={() => undefined} />
    </>
  );
}

function mountEditors(view: ReactElement) {
  render(
    <StrictMode>
      <Routes>
        <Route path="/trips/:id" element={view} />
      </Routes>
    </StrictMode>,
    {
      initialEntries: ['/trips/1'],
    }
  );
}

async function openWithKeyboard(user: ReturnType<typeof userEvent.setup>, opener: HTMLElement, title: string) {
  opener.focus();
  await user.keyboard('{Enter}');
  const dialog = await screen.findByRole('dialog', { name: title });
  expect(dialog.contains(document.activeElement)).toBe(true);
  return dialog;
}

it.each(cases)(
  'desktop $kind Edit focuses the editor and Cancel restores the reservation row',
  async ({ reservation, desktopEditor }) => {
    const user = userEvent.setup();
    mountEditors(<DesktopEditors reservation={reservation} />);
    await user.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'List' }));
    const opener = screen.getByRole('button', { name: reservation.title });
    const detail = await openWithKeyboard(user, opener, reservation.title);
    await user.click(within(detail).getByRole('button', { name: 'Edit' }));

    const editor = await screen.findByRole('dialog', { name: desktopEditor });
    expect(editor.contains(document.activeElement)).toBe(true);
    await user.click(within(editor).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: desktopEditor })).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  }
);

it.each(cases)(
  'phone $kind Edit focuses the editor and Escape restores the card title',
  async ({ reservation, phoneEditor }) => {
    const user = userEvent.setup();
    mountEditors(<PhoneEditors reservation={reservation} />);
    const opener = screen.getByRole('button', { name: new RegExp(reservation.title) });
    const detail = await openWithKeyboard(user, opener, reservation.title);
    await user.click(within(detail).getByRole('button', { name: 'Edit' }));

    const editor = await screen.findByRole('dialog', { name: phoneEditor });
    expect(editor.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: phoneEditor })).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  }
);

it('desktop linked expenses close the detail and transfer focus to the Costs editor', async () => {
  const user = userEvent.setup();
  mountEditors(<DesktopEditors reservation={booking} />);
  const opener = screen.getByRole('article', { name: booking.title });
  const detail = await openWithKeyboard(user, opener, booking.title);
  await user.click(within(detail).getByRole('button', { name: /Lunch receipt/ }));

  const editor = await screen.findByRole('dialog', { name: 'Edit expense' });
  expect(detail).not.toBeInTheDocument();
  expect(editor.contains(document.activeElement)).toBe(true);
  expect(opener).not.toHaveFocus();
});

it('preserves a saved Family train’s attachment and moves focus to its linked expense without editing the train', async () => {
  const trainExpense = buildBudgetItem({ id: 404, reservation_id: transport.id, name: 'Train fare', total_price: 35 });
  useTripStore.setState({ budgetItems: [expense, trainExpense] });
  const files = [
    buildTripFile({ id: 405, original_name: 'train-ticket.pdf', linked_reservation_ids: [transport.id] }),
    buildTripFile({ id: 406, original_name: 'other-booking.pdf', reservation_id: booking.id }),
  ];

  await vi.spyOn(familyRuntime, 'isFamilyFrontendActive').withImplementation(
    () => true,
    async () => {
      const user = userEvent.setup();
      mountEditors(<DesktopEditors reservation={transport} files={files} />);
      await user.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'List' }));
      const opener = screen.getByRole('button', { name: transport.title });
      const detail = await openWithKeyboard(user, opener, transport.title);
      const dialog = within(detail);
      expect(dialog.getByRole('button', { name: 'train-ticket.pdf' })).toBeVisible();
      expect(dialog.queryByText('other-booking.pdf')).not.toBeInTheDocument();
      expect(dialog.queryByText(expense.name)).not.toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();

      dialog.getByRole('button', { name: /Train fare/ }).focus();
      await user.keyboard('{Enter}');

      const editor = await screen.findByRole('dialog', { name: 'Edit expense' });
      expect(within(editor).getByDisplayValue(trainExpense.name)).toBeInTheDocument();
      expect(detail).not.toBeInTheDocument();
      expect(editor.contains(document.activeElement)).toBe(true);
      expect(opener).not.toHaveFocus();
      expect(save).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    }
  );
});
