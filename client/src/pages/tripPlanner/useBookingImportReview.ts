import type { BookingImportPreviewItem } from '@trek/shared';
import { useEffect, useEffectEvent, useMemo, useRef } from 'react';
import type { ExpensePrefill } from '../../components/Budget/CostsPanel';
import { receiptToPrefill } from '../../components/Budget/CostsPanel.helpers';
import { canReviewBookingImport } from '../../components/Planner/bookingImportAvailability';
import { isTransportItem, isUnplaceableItem, parsedItemToDraft } from '../../components/Planner/parsedItemToDraft';
import { useStayActionScope, useStayState } from '../../components/Planner/stayActionScope';
import { getImportFiles } from '../../db/offlineDb';
import { useBackgroundTasksStore, type BackgroundImportTask } from '../../store/backgroundTasksStore';
import type { BookingEditsOptions } from './useBookingEdits';

type Options = Pick<
  BookingEditsOptions,
  | 'tripId'
  | 'trip'
  | 'canUploadFiles'
  | 'toast'
  | 't'
  | 'setEditingReservation'
  | 'setShowReservationModal'
  | 'setEditingTransport'
  | 'setShowTransportModal'
  | 'setTransportModalDayId'
> & { onFinished: () => void };
type Review = { items: BookingImportPreviewItem[]; files: File[]; kind: 'bookings' | 'transports'; token: number };
function isTransport(item: BookingImportPreviewItem, kind: Review['kind']) {
  return isTransportItem(item) || (isUnplaceableItem(item) && kind === 'transports');
}
function prefill(review: Review | null) {
  if (!review) return null;
  const item = review.items[0],
    draft = parsedItemToDraft(item);
  const source = review.files.find((file) => file.name === item.source?.fileName);
  if (source) draft._sourceFiles = [source];
  return draft;
}
function open(item: BookingImportPreviewItem, kind: Review['kind'], o: Options) {
  const transport = isTransport(item, kind);
  o.setEditingReservation(null);
  o.setEditingTransport(null);
  o.setTransportModalDayId(null);
  o.setShowReservationModal(!transport);
  o.setShowTransportModal(transport);
}

/** Review state is view-owned; originals remain persisted until explicit safe cleanup. */
export function useBookingImportReview(o: Options) {
  const { tripId, trip, canUploadFiles } = o;
  const capture = useStayActionScope(tripId);
  const [review, setReview] = useStayState<Review | null>(capture, null);
  const [receiptExpense, setReceiptExpense] = useStayState<ExpensePrefill | null>(capture, null);
  const revision = useRef(0);
  const startImportReview = (
    items: BookingImportPreviewItem[],
    files: File[] = [],
    kind: Review['kind'] = 'bookings'
  ) => {
    const action = capture();
    if (!action.current() || !canReviewBookingImport() || !items.length) return false;
    const token = ++revision.current;
    setReview({ items: [...items], files, kind, token });
    action.effect(() => open(items[0], kind, o));
    return action.current();
  };
  const advanceImportReview = () => {
    const action = capture(() => review !== null && revision.current === review.token);
    if (!action.current() || !canReviewBookingImport() || !review) return;
    const owner = capture();
    const token = ++revision.current,
      items = review.items.slice(1);
    if (items.length) {
      setReview({ ...review, items, token });
      owner.effect(() => open(items[0], review.kind, o));
      return;
    }
    setReview(null);
    // The token changed intentionally; the original view still owns closing and refreshing.
    owner.effect(() => {
      o.setShowReservationModal(false);
      o.setEditingReservation(null);
      o.setShowTransportModal(false);
      o.setEditingTransport(null);
      o.setTransportModalDayId(null);
      o.onFinished();
    });
  };
  const tasks = useBackgroundTasksStore((state) => state.tasks);
  const receive = useEffectEvent((task: BackgroundImportTask, files: File[]) => {
    const owner = capture(() => useBackgroundTasksStore.getState().tasks.includes(task));
    if (!owner.current() || !canReviewBookingImport()) return;
    if (task.kind === 'costs') {
      if (!task.receipt) return;
      setReceiptExpense(receiptToPrefill(task.receipt, canUploadFiles ? files : []));
    } else if (!startImportReview(task.items ?? [], files, task.kind === 'transports' ? 'transports' : 'bookings'))
      return;
    owner.effect(() => useBackgroundTasksStore.getState().dismiss(task.id));
  });
  const failed = useEffectEvent(() => o.toast.error(o.t('common.unknownError')));
  useEffect(() => {
    if (!canReviewBookingImport() || trip?.id !== tripId || review || receiptExpense) return;
    const task = tasks.find(
      (t) => t.tripId === String(tripId) && t.status === 'done' && t.reviewRequested && !t.consumed
    );
    if (!task) return;
    if (task.kind === 'costs' && !task.receipt) {
      useBackgroundTasksStore.getState().dismiss(task.id);
      return;
    }
    if (task.kind !== 'costs' && !task.items?.length) return;
    let live = true;
    const token = revision.current;
    const action = capture(
      () => live && token === revision.current && useBackgroundTasksStore.getState().tasks.includes(task)
    );
    void action
      .perform(() => (task.sourceFiles?.length ? task.sourceFiles : getImportFiles(task.id, true)))
      .then(
        (files) => action.effect(() => receive(task, files)),
        () => action.effect(failed)
      );
    return () => {
      live = false;
    };
  }, [tasks, tripId, trip?.id, canUploadFiles, capture, review, receiptExpense]);
  const draft = useMemo(() => prefill(review), [review]);
  const transport = review ? isTransport(review.items[0], review.kind) : false;
  return {
    startImportReview,
    advanceImportReview,
    reservationPrefill: transport ? null : draft,
    transportPrefill: transport ? draft : null,
    importReviewActive: review !== null,
    receiptExpense,
    setReceiptExpense,
  };
}
