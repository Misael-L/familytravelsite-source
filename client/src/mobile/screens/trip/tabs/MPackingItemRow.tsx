import { packingBagActionsAvailable } from '../../../../repo/plannerPackingBagPort';

import { packingItemControlsDisabled, packingOriginArgs, packingRowArgs } from '../../../../repo/plannerPackingPort';

import { usePackingDraft } from '../../../../components/Packing/usePackingDraft';

import { useState } from 'react';

import { selectionHaptic } from '../../../../native/haptics';

import { Check, HandHelping, Minus, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, UserRound } from 'lucide-react';

import MSwipeRow, { type SwipeAction } from '../../../components/MSwipeRow';

import { useAuthStore } from '../../../../store/authStore';

import type { PackingBag, PackingItem } from '../../../../types';

import type { TripPlanner } from '../MTripShell';

import { FIELD_CLS } from '../sheets/PlSheetChrome';

import { packedOf } from '../../../../components/Packing/packingListPanel.helpers';

import { formatWeight, isPackingPlaceholder } from '../../../../components/Packing/packingListModel';

import { packingBringerNames } from '../../../../components/Packing/packingBringers';

// ── Item row ────────────────────────────────────────────────────────────

export function PackingItemRow({
  item,
  planner,
  currentUserId,
  editMode,
  canEdit,
  bagTrackingEnabled,
  bags,
  onCreateBag,
  onEdit,
  onDelete,
}: {
  item: PackingItem;
  planner: TripPlanner;
  currentUserId: number | null;
  editMode: boolean;
  canEdit: boolean;
  bagTrackingEnabled: boolean;
  bags: PackingBag[];
  onCreateBag: (name: string) => Promise<PackingBag | undefined>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, tripId, tripActions } = planner;
  const selection = usePackingDraft(tripId);
  const [bagPickerOpen, setBagPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [creatingBag, setCreatingBag] = useState(false);
  const [newBagName, setNewBagName] = useState('');

  const isPlaceholder = isPackingPlaceholder(item);
  const bag = item.bag_id != null ? bags.find((b) => b.id === item.bag_id) : undefined;

  // Sharing badges (#858) mirror ArtikelZeile: is_private + ownership split the
  // three states, so exactly one (or none) ever applies.
  const recipients = item.recipients || [];
  const contributors = item.contributors || [];
  const badgeSharedToMe = !!item.is_private && item.owner_id != null && item.owner_id !== currentUserId;
  const badgeSharedByMe = !!item.is_private && item.owner_id === currentUserId && recipients.length > 0;
  const badgeBroughtBy = !item.is_private && item.owner_username ? item.owner_username : null;
  // Owner is shown as a compact avatar instead of the full username (saves space
  // on the row). Resolve the picture from the trip members, falling back to the
  // signed-in user for their own items, then to initials.
  const me = useAuthStore((s) => s.user);
  const ownerMember = planner.tripMembers.find((m) => m.id === item.owner_id);
  const ownerAvatarUrl = ownerMember?.avatar_url ?? (item.owner_id === me?.id ? (me?.avatar_url ?? null) : null);

  const toggle = () => {
    selectionHaptic();
    return tripActions
      .togglePackingItem(tripId, item.id, !item.checked, ...packingRowArgs(item))
      .catch((err: unknown) => planner.toast.error(err instanceof Error ? err.message : t('packing.toast.saveError')));
  };
  // Multi-piece items count their pieces into the bag (#2296).
  const quantity = item.quantity || 1;
  const packed = packedOf(item);
  const partlyPacked = !item.checked && packed > 0;

  const assignBag = async (bagId: number | null) => {
    setBagPickerOpen(false);
    try {
      await selection.save({ bag_id: bagId }, (data, origin) =>
        tripActions.updatePackingItem(tripId, item.id, data, ...packingOriginArgs(origin))
      );
    } catch {
      planner.toast.error(t('packing.toast.saveError'));
    }
  };

  const submitNewBag = async () => {
    if (!newBagName.trim()) return;
    const created = await onCreateBag(newBagName.trim());
    if (created) await assignBag(created.id);
    setNewBagName('');
    setCreatingBag(false);
  };

  // A swipe does what the row's own controls do: tick it off, or edit and delete it.
  const swipeTrailing: SwipeAction[] =
    canEdit && !isPlaceholder
      ? [
          { label: t('common.delete'), icon: Trash2, tone: 'danger', onAction: onDelete },
          { label: t('common.edit'), icon: Pencil, tone: 'neutral', onAction: onEdit },
        ]
      : [];
  const swipeLeading: SwipeAction | undefined = isPlaceholder
    ? undefined
    : item.checked
      ? { label: t('packing.filterOpen'), icon: RotateCcw, tone: 'neutral', onAction: () => void toggle() }
      : { label: t('packing.filterDone'), icon: Check, tone: 'accent', onAction: () => void toggle() };

  return (
    <>
      <MSwipeRow
        leading={swipeLeading}
        trailing={swipeTrailing}
        surface="bg-m-sheetop"
        inset={4}
        className="border-t border-[color:var(--m-rowbr)] first:border-t-0"
      >
        <div className="flex items-center gap-[9px] py-2">
          <button
            type="button"
            onClick={toggle}
            disabled={packingItemControlsDisabled(canEdit)}
            aria-label={item.name}
            aria-pressed={!!item.checked}
            className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] border-[1.5px] ${
              item.checked
                ? 'border-m-act bg-m-act text-m-actfg'
                : partlyPacked
                  ? 'border-m-act text-transparent'
                  : 'border-[color:var(--m-checkbr)] text-transparent'
            }`}
          >
            <Check size={12} strokeWidth={3} />
          </button>

          <span
            className={`min-w-0 flex-1 truncate text-[0.8125rem] font-medium ${item.checked ? 'text-m-faint line-through opacity-45' : 'text-m-ink'}`}
          >
            {isPlaceholder ? t('packing.addItemPlaceholder') : item.name}
          </span>

          {/* Sharing state is an icon, not a sentence (#1525): "Taken care of by
            Alexander" spelled out took a third of the row away from the item
            name. The full wording lives on the pill as its label. */}
          {badgeSharedToMe && (
            <span
              className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[color:var(--m-ic)] text-m-muted"
              title={t('packing.takenCareOf', { name: item.owner_username || '' })}
              aria-label={t('packing.takenCareOf', { name: item.owner_username || '' })}
            >
              <HandHelping size={11} strokeWidth={2.2} />
            </span>
          )}
          {!badgeSharedToMe && badgeSharedByMe && (
            <span
              className="flex flex-none items-center gap-[2px] rounded-full bg-[color:var(--m-ic)] px-[5px] py-[3px] font-geist text-[0.59375rem] font-bold text-m-muted"
              title={t('packing.sharedWithCount', { count: recipients.length })}
              aria-label={t('packing.sharedWithCount', { count: recipients.length })}
            >
              <UserRound size={10} strokeWidth={2.2} />
              {recipients.length}
            </span>
          )}
          {!badgeSharedToMe && !badgeSharedByMe && badgeBroughtBy && (
            <span
              className="flex flex-none items-center gap-[3px]"
              title={t('packing.broughtBy', { name: packingBringerNames(item) })}
              aria-label={t('packing.broughtBy', { name: packingBringerNames(item) })}
            >
              {ownerAvatarUrl ? (
                <img
                  src={ownerAvatarUrl}
                  alt={item.owner_username || ''}
                  className="h-5 w-5 flex-none rounded-full object-cover"
                />
              ) : (
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[color:var(--m-ic)] font-geist text-[0.5625rem] font-bold text-m-muted">
                  {(item.owner_username || '?')[0]?.toUpperCase()}
                </span>
              )}
              {contributors.length > 0 && (
                <span className="font-geist text-[0.59375rem] font-bold text-m-faint">+{contributors.length}</span>
              )}
            </span>
          )}

          {quantity > 1 &&
            (canEdit && !isPlaceholder ? (
              <span
                role="group"
                aria-label={t('packing.packedCount', { packed, total: quantity })}
                className={`flex flex-none items-center rounded-full font-geist text-[0.625rem] font-bold tabular-nums ${partlyPacked ? 'bg-[color:color-mix(in_srgb,var(--m-act)_14%,transparent)] text-m-ink' : 'bg-[color:var(--m-ic)] text-m-muted'}`}
              >
                <button
                  type="button"
                  aria-label={t('packing.packedLess')}
                  disabled={packed <= 0}
                  onClick={() =>
                    tripActions
                      .setPackedCount(tripId, item.id, packed - 1, ...packingRowArgs(item))
                      .catch((error: unknown) =>
                        planner.toast.error(error instanceof Error ? error.message : t('packing.toast.saveError'))
                      )
                  }
                  className="flex h-[22px] w-[22px] items-center justify-center disabled:opacity-30"
                >
                  <Minus size={11} strokeWidth={2.6} />
                </button>
                <span className="min-w-[26px] text-center">
                  {packed}/{quantity}
                </span>
                <button
                  type="button"
                  aria-label={t('packing.packedMore')}
                  disabled={packed >= quantity}
                  onClick={() =>
                    tripActions
                      .setPackedCount(tripId, item.id, packed + 1, ...packingRowArgs(item))
                      .catch((error: unknown) =>
                        planner.toast.error(error instanceof Error ? error.message : t('packing.toast.saveError'))
                      )
                  }
                  className="flex h-[22px] w-[22px] items-center justify-center disabled:opacity-30"
                >
                  <Plus size={11} strokeWidth={2.6} />
                </button>
              </span>
            ) : (
              <span className="flex-none rounded-full bg-[color:var(--m-ic)] px-2 py-[2px] font-geist text-[0.625rem] font-bold tabular-nums text-m-muted">
                {partlyPacked ? `${packed}/${quantity}` : `${quantity}×`}
              </span>
            ))}

          {/* A weight nobody entered is not worth a column: "— g" on every row
            cost as much width as a real value (#1525). */}
          {editMode && bagTrackingEnabled && item.weight_grams != null && (
            <span className="flex-none font-geist text-[0.625rem] font-semibold tabular-nums text-m-faint">
              {formatWeight(item.weight_grams)}
            </span>
          )}

          {bagTrackingEnabled && (
            <button
              type="button"
              onClick={() => {
                selection.begin(item);
                setMenuOpen(false);
                setBagPickerOpen((v) => !v);
              }}
              aria-label={t('packing.bags')}
              className="h-[18px] w-[18px] flex-none rounded-full"
              style={
                bag
                  ? { border: `2.5px solid ${bag.color}`, background: 'transparent' }
                  : { border: '2px dashed var(--m-faint)', opacity: 0.55 }
              }
            />
          )}

          {/* Edit and delete moved behind one button (#1525): two round targets
            plus their gaps were the widest thing on an edit-mode row, and
            neither is used often enough to earn a permanent seat. */}
          {editMode && canEdit && (
            <button
              type="button"
              onClick={() => {
                setBagPickerOpen(false);
                setMenuOpen((v) => !v);
              }}
              aria-label={t('mobileTrip.more')}
              aria-expanded={menuOpen}
              className={`flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[color:var(--m-ic)] ${menuOpen ? 'text-m-ink' : 'text-m-muted'}`}
            >
              <MoreHorizontal size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      </MSwipeRow>

      {menuOpen && editMode && canEdit && (
        <div className="mb-[6px] ms-[28px] overflow-hidden rounded-[13px] border border-[color:var(--m-rowbr)] bg-[color:var(--m-glass)] backdrop-blur-[24px]">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-[9px] border-b border-[color:var(--m-rowbr)] px-3 py-2 text-start text-[0.75rem] font-medium text-m-ink"
          >
            <Pencil size={12} strokeWidth={2} />
            {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-[9px] px-3 py-2 text-start text-[0.75rem] font-medium text-[color:var(--m-st-danger)]"
          >
            <Trash2 size={12} strokeWidth={2} />
            {t('common.delete')}
          </button>
        </div>
      )}

      {bagPickerOpen &&
        bagTrackingEnabled &&
        renderPackingBagPicker({
          bags,
          assignBag,
          tripId,
          canEdit,
          creatingBag,
          newBagName,
          setNewBagName,
          submitNewBag,
          setCreatingBag,
          t,
        })}
    </>
  );
}

function renderPackingBagPicker({
  bags,
  assignBag,
  tripId,
  canEdit,
  creatingBag,
  newBagName,
  setNewBagName,
  submitNewBag,
  setCreatingBag,
  t,
}: {
  bags: PackingBag[];
  assignBag: (bagId: number | null) => Promise<void>;
  tripId: TripPlanner['tripId'];
  canEdit: boolean;
  creatingBag: boolean;
  newBagName: string;
  setNewBagName: import('react').Dispatch<import('react').SetStateAction<string>>;
  submitNewBag: () => Promise<void>;
  setCreatingBag: import('react').Dispatch<import('react').SetStateAction<boolean>>;
  t: TripPlanner['t'];
}) {
  return (
    <div className="mb-[6px] ms-[28px] overflow-hidden rounded-[13px] border border-[color:var(--m-rowbr)] bg-[color:var(--m-glass)] backdrop-blur-[24px]">
      <button
        type="button"
        onClick={() => assignBag(null)}
        className="flex w-full items-center gap-[9px] border-b border-[color:var(--m-rowbr)] px-3 py-2 text-start text-[0.75rem] font-medium text-m-muted"
      >
        <span className="h-[9px] w-[9px] flex-none rounded-full border border-dashed border-[color:var(--m-faint)]" />
        {t('packing.noBag')}
      </button>
      {bags.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => assignBag(b.id)}
          className="flex w-full items-center gap-[9px] border-b border-[color:var(--m-rowbr)] px-3 py-2 text-start text-[0.75rem] font-medium text-m-ink"
        >
          <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: b.color }} />
          {b.name}
        </button>
      ))}
      {packingBagActionsAvailable(tripId, canEdit) &&
        (creatingBag ? (
          <div className="flex items-center gap-[6px] p-[8px]">
            <input
              type="text"
              autoFocus
              value={newBagName}
              onChange={(e) => setNewBagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNewBag();
                if (e.key === 'Escape') {
                  setCreatingBag(false);
                  setNewBagName('');
                }
              }}
              placeholder={t('packing.bagName')}
              className={`${FIELD_CLS} flex-1 py-[6px] text-[0.75rem]`}
            />
            <button
              type="button"
              onClick={submitNewBag}
              disabled={!newBagName.trim()}
              aria-label={t('common.add')}
              className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] bg-m-act text-m-actfg disabled:opacity-40"
            >
              <Plus size={12} strokeWidth={2.4} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingBag(true)}
            className="flex w-full items-center gap-[7px] px-3 py-2 text-start font-geist text-[0.6875rem] font-semibold text-m-muted"
          >
            <Plus size={11} strokeWidth={2.2} />
            {t('packing.addBag')}
          </button>
        ))}
    </div>
  );
}
