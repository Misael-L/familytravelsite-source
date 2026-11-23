// FE-PLANNER-RESLISTFILTER-005 to -009: what one card of the phone's bookings
// and transports tabs does.
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildBudgetItem, buildReservation } from '../../../../tests/helpers/factories';
import { resetAllStores, seedStore } from '../../../../tests/helpers/store';
import { useTripStore } from '../../../store/tripStore';
import type { Reservation } from '../../../types';
import { openFile } from '../../../utils/fileDownload';
import { useReservationCard } from './useReservationCard';

vi.mock('../../../utils/fileDownload', () => ({ openFile: vi.fn(() => Promise.resolve()) }));

const traveler = (user_id: number) => ({ user_id, username: `u${user_id}` });
const ann = buildReservation({
  id: 10,
  status: 'confirmed',
  reservation_time: '2026-03-02T09:00',
  travelers: [traveler(1)],
} as Partial<Reservation>);
const bob = buildReservation({
  id: 11,
  status: 'pending',
  reservation_time: '2026-03-01T09:00',
  travelers: [traveler(2)],
} as Partial<Reservation>);

describe('useReservationCard', () => {
  const file = { url: '/uploads/f/1', original_name: 'voucher.pdf' };
  const host = (blur?: boolean) => ({
    settings: { blur_booking_codes: blur },
    toast: { error: vi.fn() },
    t: (key: string) => key,
  });
  const remove = () => undefined;

  beforeEach(() => vi.mocked(openFile).mockClear());

  it('FE-PLANNER-RESLISTFILTER-005: with the blur preference on the code is blurred until toggled', () => {
    const { result } = renderHook(() => useReservationCard(ann, host(true), remove));
    expect(result.current.codeBlurred).toBe(true);
    act(() => result.current.toggleCode?.());
    expect(result.current.codeBlurred).toBe(false);
    act(() => result.current.toggleCode?.());
    expect(result.current.codeBlurred).toBe(true);
  });

  it('FE-PLANNER-RESLISTFILTER-006: with the preference off the code is plain and has no toggle', () => {
    const { result } = renderHook(() => useReservationCard(ann, host(false), remove));
    expect(result.current.codeBlurred).toBe(false);
    expect(result.current.toggleCode).toBeUndefined();
  });

  it('FE-PLANNER-RESLISTFILTER-007: delete asks first, closes the question and toasts a failure', async () => {
    const opts = host(false);
    const rejectDelete = vi.fn(() => Promise.reject(new Error('boom')));
    const { result } = renderHook(() => useReservationCard(bob, opts, rejectDelete));
    expect(result.current.confirmingDelete).toBe(false);
    act(() => result.current.askDelete());
    expect(result.current.confirmingDelete).toBe(true);
    act(() => result.current.cancelDelete());
    expect(result.current.confirmingDelete).toBe(false);
    expect(rejectDelete).not.toHaveBeenCalled();

    act(() => result.current.askDelete());
    act(() => result.current.confirmDelete());
    expect(result.current.confirmingDelete).toBe(false);
    expect(rejectDelete).toHaveBeenCalledWith(11);
    await vi.waitFor(() => expect(opts.toast.error).toHaveBeenCalledWith('reservations.toast.deleteError'));
  });

  it('FE-PLANNER-RESLISTFILTER-008: a file chip opens its file on click, Enter or Space and stops there', () => {
    const { result } = renderHook(() => useReservationCard(ann, host(), remove));
    const chip = result.current.fileChip(file);
    const click = { stopPropagation: vi.fn() } as unknown as MouseEvent;
    chip.onClick(click);
    expect(click.stopPropagation).toHaveBeenCalled();
    const key = (k: string) =>
      ({ key: k, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as KeyboardEvent;
    const enter = key('Enter');
    chip.onKeyDown(enter);
    chip.onKeyDown(key(' '));
    const tab = key('Tab');
    chip.onKeyDown(tab);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(enter.stopPropagation).toHaveBeenCalled();
    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(tab.stopPropagation).not.toHaveBeenCalled();
    expect(openFile).toHaveBeenCalledTimes(3);
    expect(openFile).toHaveBeenCalledWith('/uploads/f/1', 'voucher.pdf');
  });

  it('reports an attachment-open failure from a phone card', async () => {
    const failure = Promise.reject(new Error('File unavailable'));
    // Observe the fixture rejection separately so the old behavior cannot fail the test runner itself.
    void failure.catch(vi.fn());
    vi.mocked(openFile).mockReturnValueOnce(failure);
    const opts = host();
    const { result } = renderHook(() => useReservationCard(ann, opts, remove));
    const chip = result.current.fileChip(file);

    chip.onClick({ stopPropagation: vi.fn() } as unknown as MouseEvent);

    expect(openFile).toHaveBeenCalledExactlyOnceWith(file.url, file.original_name);
    await vi.waitFor(() => expect(opts.toast.error).toHaveBeenCalledExactlyOnceWith('files.openError'));
  });

  it('FE-PLANNER-RESLISTFILTER-009: the card knows whether deleting it takes a linked expense along (#2604)', () => {
    resetAllStores();
    seedStore(useTripStore, { budgetItems: [buildBudgetItem({ id: 1, reservation_id: 10 } as never)] });
    expect(renderHook(() => useReservationCard(ann, host(), remove)).result.current.deleteTakesExpense).toBe(true);
    expect(renderHook(() => useReservationCard(bob, host(), remove)).result.current.deleteTakesExpense).toBe(false);
  });
});
