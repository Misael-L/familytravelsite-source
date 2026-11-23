import { DEFAULT_PERMS, type SharePerm } from './tripLinkContract'
export type { SharePerm } from './tripLinkContract'
import { usePublicTripLink, useInviteTripLink } from './useTripLinks'
import { useStayState } from '../Planner/stayActionScope'
import { useMemberRoster, memberActions } from './useMemberRoster'
import { useRef } from 'react'
import type { TripMember } from '@trek/shared'
import { tripMembersRepo } from '../../repo/tripMembersRepo'
import { useToast } from '../shared/Toast'
import { useAuthStore } from '../../store/authStore'
import { useCanDo } from '../../store/permissionsStore'
import { useTripStore } from '../../store/tripStore'
import { useTranslation } from '../../i18n'
import { getApiErrorMessage } from '../../types'
import { refusedOffline } from '../../utils/needsConnection'

// The state behind the share dialog, shared by the desktop dialog and the one the
// phone opens from its More sheet. The questions ("Remove this member?") are the
// caller's: the desktop asks in a dialog of its own, the phone with the browser's.

/** What the link shows, one tab each. */
export const SHARE_SECTIONS: { key: SharePerm; label: string; always?: boolean }[] = [
  { key: 'share_map', label: 'share.permMap', always: true },
  { key: 'share_bookings', label: 'share.permBookings' },
  { key: 'share_packing', label: 'share.permPacking' },
  { key: 'share_budget', label: 'share.permBudget' },
  { key: 'share_collab', label: 'share.permCollab' },
]

/** How the plan it shows is narrowed (#1712). */
export const SHARE_OPTIONS: { key: SharePerm; label: string }[] = [
  { key: 'share_travel_only', label: 'share.optTravelOnly' },
  { key: 'share_hide_images', label: 'share.optHideImages' },
]

/** Native public link and invitation hooks retain their existing external contract. */
export function useShareLink(tripId: number) { return usePublicTripLink(tripId, DEFAULT_PERMS) }
export function useTripInviteLink(tripId: number) { return useInviteTripLink(tripId) }

export type ListedMember = TripMember & { role?: string }

/** The roster: members with an account, the guests without one, and the users who could still be invited. */
export function useTripMembers({ isOpen, tripId, onClose, onMembersChanged }: {
  isOpen: boolean
  tripId: number
  onClose: () => void
  /** After a change to the roster, so the planner can refresh Costs participants, Collab and the rest. */
  onMembersChanged?: () => void
}) {
  const { capture, data, allUsers, loading, loadMembers } = useMemberRoster(tripId, isOpen, onMembersChanged)
  const own = memberActions(capture, isOpen)
  const [selectedUserId, setSelectedUserId] = useStayState(capture, '')
  const [adding, setAdding] = useStayState(capture, false)
  const [removingId, setRemovingId] = useStayState<number | null>(capture, null)
  const [transferringId, setTransferringId] = useStayState<number | null>(capture, null)
  const [newGuestName, setNewGuestName] = useStayState(capture, '')
  const [addingGuest, setAddingGuest] = useStayState(capture, false)
  const [renamingGuestId, setRenamingGuestId] = useStayState<number | null>(capture, null)
  const [renameValue, setRenameValue] = useStayState(capture, '')
  const toast = useToast()
  const { user } = useAuthStore()
  const { t } = useTranslation()
  const can = useCanDo()
  const trip = useTripStore(s => s.trip)
  const loadBudgetItems = useTripStore(s => s.loadBudgetItems)

  const add = own(async (action) => {
    const target = allUsers.find(u => String(u.id) === String(selectedUserId))
    if (!target || refusedOffline(toast, t)) return
    setAdding(true)
    try {
      await action.perform(() => tripMembersRepo.add(tripId, target.username))
      setSelectedUserId('')
      await action.perform(() => loadMembers(true))
      action.effect(() => toast.success(`${target.username} ${t('members.added')}`))
    } catch (err: unknown) {
      action.effect(() => toast.error(getApiErrorMessage(err, t('members.addError'))))
    } finally {
      setAdding(false)
    }
  })

  const transfer = own(async (action, newOwnerId: number) => {
    if (refusedOffline(toast, t)) return
    setTransferringId(newOwnerId)
    try {
      await action.perform(() => tripMembersRepo.transfer(tripId, newOwnerId))
      // The current user just dropped from owner to member: reload so the trip
      // and the permissions everywhere reflect the new ownership.
      action.effect(() => { onClose(); window.location.reload() })
    } catch (err: unknown) {
      action.effect(() => toast.error(getApiErrorMessage(err, t('members.transferError'))))
      action.effect(() => setTransferringId(null))
    }
  })

  const remove = own(async (action, userId: number, isSelf: boolean) => {
    if (refusedOffline(toast, t)) return
    setRemovingId(userId)
    try {
      await action.perform(() => tripMembersRepo.remove(tripId, userId))
      if (isSelf) { action.effect(() => { onClose(); window.location.reload() }) }
      else { await action.perform(() => loadMembers(true)); action.effect(() => toast.success(t('members.removed'))) }
    } catch {
      action.effect(() => toast.error(t('members.removeError')))
    } finally {
      setRemovingId(null)
    }
  })

  const addGuest = own(async (action) => {
    const name = newGuestName.trim()
    if (!name || refusedOffline(toast, t)) return
    setAddingGuest(true)
    try {
      await action.perform(() => tripMembersRepo.createGuest(tripId, name))
      setNewGuestName('')
      await action.perform(() => loadMembers(true))
      action.effect(() => toast.success(t('members.guestAdded')))
    } catch (err: unknown) {
      action.effect(() => toast.error(getApiErrorMessage(err, t('members.guestAddError'))))
    } finally {
      setAddingGuest(false)
    }
  })

  // Enter commits, and the blur that follows would send the same rename a second
  // time. Only the first commit per editing session goes through; a failed one
  // reopens the gate so the user can retry from the still-open input.
  const renameCommitted = useRef(false)

  const startRename = (guest: TripMember) => {
    if (!capture(() => isOpen).current()) return
    renameCommitted.current = false
    setRenamingGuestId(guest.id)
    setRenameValue(guest.username)
  }

  const cancelRename = () => {
    if (!capture(() => isOpen).current()) return
    renameCommitted.current = true
    setRenamingGuestId(null)
  }

  const commitRename = own(async (action, userId: number) => {
    if (renameCommitted.current) return
    renameCommitted.current = true
    const name = renameValue.trim()
    if (!name) { setRenamingGuestId(null); return }
    if (refusedOffline(toast, t)) { renameCommitted.current = false; return }
    try {
      await action.perform(() => tripMembersRepo.renameGuest(tripId, userId, name))
      setRenamingGuestId(null)
      await action.perform(() => loadMembers(true))
    } catch (err: unknown) {
      action.effect(() => { renameCommitted.current = false })
      action.effect(() => toast.error(getApiErrorMessage(err, t('members.guestRenameError'))))
    }
  })

  const removeGuest = own(async (action, userId: number) => {
    if (refusedOffline(toast, t)) return
    setRemovingId(userId)
    try {
      await action.perform(() => tripMembersRepo.deleteGuest(tripId, userId))
      await action.perform(() => loadMembers(true))
      await action.perform(() => loadBudgetItems(tripId))
      action.effect(() => toast.success(t('members.guestRemoved')))
    } catch (err: unknown) {
      // A guest who paid for something or is part of a recorded payment stays (#2604):
      // deleting them would take that money off the books.
      const refused = (err as { response?: { status?: number } } | null)?.response?.status === 409
      action.effect(() => toast.error(t(refused ? 'members.guestHasPayments' : 'members.removeError')))
    } finally {
      setRemovingId(null)
    }
  })

  // Guests are accountless and never live in the directory.
  const existingIds = new Set([data?.owner?.id, ...(data?.members?.map(m => m.id) || [])])
  const availableUsers = allUsers.filter(u => !existingIds.has(u.id) && !u.is_guest)
  // Real members (owner and accounts) and guests (#1362) are listed apart.
  const realMembers: ListedMember[] = data ? [...(data.owner ? [{ ...data.owner, role: 'owner' }] : []), ...data.members.filter(m => !m.is_guest)] : []
  const guests = data ? data.members.filter(m => m.is_guest) : []

  return {
    user, loading, realMembers, guests, allUsers, availableUsers,
    isCurrentOwner: !!data?.owner && data.owner.id === user?.id,
    canManageMembers: can('member_manage', trip),
    canManageShare: can('share_manage', trip),
    selectedUserId, setSelectedUserId, adding, add,
    transferringId, transfer, removingId, remove,
    newGuestName, setNewGuestName, addingGuest, addGuest,
    renamingGuestId, renameValue, setRenameValue, startRename, cancelRename, commitRename, removeGuest,
  }
}

export type TripMembersState = ReturnType<typeof useTripMembers>
export type ShareLinkState = ReturnType<typeof useShareLink>
export type InviteLinkState = ReturnType<typeof useTripInviteLink>
