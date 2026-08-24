import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { tripsApi, authApi, reservationsApi } from '../../api/client'
import { tripRepo } from '../../repo/tripRepo'
import { useAuthStore } from '../../store/authStore'
import { useTranslation } from '../../i18n'
import { useToast } from '../../components/shared/Toast'
import { getApiErrorMessage } from '../../types'
import type { TripCreateRequest } from '@trek/shared'
import { isSupabaseDataPlane } from '../../data/supabase/auth'
import {
  archiveTrip,
  isPermissionDenied,
  listFamilyTrips,
  unarchiveTrip,
} from '../../data/supabase/trips'
import { fetchFamilyTravelStats } from '../../data/supabase/travelStats'
import { canMutateTrips } from '../../data/supabase/capabilities'
import { canTripActionDirect } from '../../data/supabase/familyPermissions'
import {
  canDecideProposal,
  duplicateTrip,
  hubPencilAction,
  indexOpenProposalsByTripId,
  listOpenTripProposals,
  type OpenHubProposal,
  type OpenTripProposal,
} from '../../data/supabase/tripProposals'
import {
  type DashboardTrip,
  type TravelStats,
  type UpcomingReservation,
  type HeroBundle,
  familyTripToHeroBundle,
  getTripStatus,
  isFamilyDashboardTrip,
  sortTrips,
} from './dashboardModel'
import {
  keepHubEnrichment,
  type FamilyDashboardTrip,
} from './familyDashboardModel'

/**
 * Dashboard data hook — owns every bit of the page's state, data loading and
 * mutations (trip CRUD, archive/copy, travel stats, upcoming reservations,
 * the spotlight hero bundle) and exposes derived values + handlers. The
 * DashboardPage component is a pure wiring container that renders what this
 * returns.
 */
export function useDashboard() {
  const [trips, setTrips] = useState<DashboardTrip[]>([])
  const [archivedTrips, setArchivedTrips] = useState<DashboardTrip[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [showForm, setShowForm] = useState<boolean>(false)
  const [editingTrip, setEditingTrip] = useState<DashboardTrip | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => (localStorage.getItem('trek_dashboard_view') as 'grid' | 'list') || 'grid')
  const [deleteTrip, setDeleteTrip] = useState<DashboardTrip | null>(null)
  const [copyTrip, setCopyTrip] = useState<DashboardTrip | null>(null)
  const [tripFilter, setTripFilter] = useState<'planned' | 'archive' | 'completed'>('planned')
  const [allSubOpen, setAllSubOpen] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<boolean>(false)
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null)
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  const [openProposalsByTripId, setOpenProposalsByTripId] = useState<Record<string, OpenHubProposal>>({})
  const [openProposals, setOpenProposals] = useState<OpenTripProposal[]>([])
  const [canDecideProposalIds, setCanDecideProposalIds] = useState<string[]>([])
  const [votingProposalId, setVotingProposalId] = useState<string | null>(null)

  const [stats, setStats] = useState<TravelStats | null>(null)
  const [upcoming, setUpcoming] = useState<UpcomingReservation[]>([])
  const [nestHeroBundle, setNestHeroBundle] = useState<HeroBundle | null>(null)

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const { t, locale } = useTranslation()
  const { demoMode, authCheckFailed, loadUser, familyId, personId, isSuperAdmin, membershipRole } = useAuthStore()
  const supabasePlane = isSupabaseDataPlane()
  const canMutate = canMutateTrips({ isSuperAdmin, membershipRole: membershipRole ?? null })
  const showMutationControls = true

  const openCalendarSubscribe = () => {
    if (supabasePlane) {
      if (!familyId || !personId) {
        toast.error(t('dashboard.propose.missingPerson'))
        return
      }
      setAllSubOpen(true)
      return
    }
    setAllSubOpen(true)
  }

  const toggleViewMode = () => {
    setViewMode(prev => {
      const next = prev === 'grid' ? 'list' : 'grid'
      localStorage.setItem('trek_dashboard_view', next)
      return next
    })
  }

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setEditingProposalId(null)
      setEditingTripId(null)
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => { void loadTrips() }, [familyId, supabasePlane])

  useEffect(() => {
    if (supabasePlane) {
      setUpcoming([])
      if (!familyId) {
        setStats(null)
        return
      }
      let cancelled = false
      fetchFamilyTravelStats(familyId)
        .then((s) => { if (!cancelled) setStats(s) })
        .catch(() => {
          if (!cancelled) {
            setStats({ totalTrips: 0, totalDays: 0, totalPlaces: 0, totalDistanceKm: 0, countries: [] })
            toast.error(t('dashboard.toast.statsError'))
          }
        })
      return () => { cancelled = true }
    }
    authApi.travelStats().then(setStats).catch(() => {})
    reservationsApi.upcoming().then((r: { reservations: UpcomingReservation[] }) => setUpcoming(r.reservations || [])).catch(() => {})
  }, [supabasePlane, familyId])

  const loadTrips = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    try {
      if (supabasePlane) {
        if (!familyId) {
          setTrips([])
          setArchivedTrips([])
          setOpenProposalsByTripId({})
          setOpenProposals([])
          setCanDecideProposalIds([])
          setLoadError(false)
          return
        }
        const [{ trips: active, archivedTrips: archived }, openResult] = await Promise.all([
          listFamilyTrips(familyId),
          listOpenTripProposals(familyId).then(
            (rows) => ({ ok: true as const, rows }),
            () => ({ ok: false as const, rows: [] as OpenTripProposal[] }),
          ),
        ])
        setTrips(sortTrips(active))
        setArchivedTrips(sortTrips(archived))
        if (!openResult.ok) toast.error(t('dashboard.toast.proposalsError'))
        const open = openResult.rows
        setOpenProposals(open)
        setOpenProposalsByTripId(indexOpenProposalsByTripId(open))
        const decideFlags = await Promise.all(open.map(p => canDecideProposal(p.proposalId).then(v => v, () => false)))
        setCanDecideProposalIds(open.filter((_, i) => decideFlags[i]).map(p => p.proposalId))
        setLoadError(false)
        return
      }

      const { trips: active, archivedTrips: archived } = await tripRepo.list()
      setTrips(sortTrips(active))
      setArchivedTrips(sortTrips(archived))
      setOpenProposals([])
      setCanDecideProposalIds([])
      setOpenProposalsByTripId({})
      setLoadError(false)
    } catch {
      setLoadError(true)
      toast.error(t('dashboard.toast.loadError'))
    } finally {
      setIsLoading(false)
    }
  }

  const retryLoad = () => {
    loadUser({ silent: true })
    void loadTrips()
  }

  const today = new Date().toISOString().split('T')[0]
  const spotlight = trips.find(t => t.start_date && t.end_date && t.start_date <= today && t.end_date >= today)
    || trips.find(t => t.start_date && t.start_date >= today)
    || trips[0]
    || null
  const rest = spotlight ? trips.filter(t => t.id !== spotlight.id) : trips

  useEffect(() => {
    if (supabasePlane || !spotlight || typeof spotlight.id !== 'number') {
      setNestHeroBundle(null)
      return
    }
    let cancelled = false
    tripsApi.bundle(spotlight.id)
      .then((b: HeroBundle) => { if (!cancelled) setNestHeroBundle({ members: b.members || [], places: b.places || [] }) })
      .catch(() => { if (!cancelled) setNestHeroBundle(null) })
    return () => { cancelled = true }
  }, [spotlight?.id, supabasePlane])

  const heroBundle = supabasePlane && spotlight && isFamilyDashboardTrip(spotlight)
    ? familyTripToHeroBundle(spotlight)
    : nestHeroBundle

  const handleCreate = async (tripData: TripCreateRequest) => {
    if (supabasePlane) {
      toast.error(t('dashboard.toast.proposeError'))
      return
    }
    try {
      const data = await tripsApi.create(tripData)
      setTrips(prev => sortTrips([data.trip, ...prev]))
      toast.success(t('dashboard.toast.created'))
      return data
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, t('dashboard.toast.createError')))
    }
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingTrip(null)
    setEditingProposalId(null)
    setEditingTripId(null)
  }

  const handleProposed = async (edited = false) => {
    closeForm()
    toast.success(edited ? t('dashboard.toast.updated') : t('dashboard.toast.proposed'))
    await loadTrips({ silent: true })
  }

  const handleUpdate = async (tripData: TripCreateRequest) => {
    if (supabasePlane || !editingTrip || typeof editingTrip.id !== 'number') {
      toast.error(t('dashboard.toast.editLater'))
      return
    }
    try {
      const data = await tripsApi.update(editingTrip.id, tripData)
      setTrips(prev => sortTrips(prev.map(t => t.id === editingTrip.id ? data.trip : t)))
      toast.success(t('dashboard.toast.updated'))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, t('dashboard.toast.updateError')))
    }
  }

  const confirmDelete = async () => {
    if (!deleteTrip) return
    if (supabasePlane) {
      setDeleteTrip(null)
      return
    }
    if (typeof deleteTrip.id !== 'number') {
      setDeleteTrip(null)
      return
    }
    try {
      await tripsApi.delete(deleteTrip.id)
      setTrips(prev => prev.filter(t => t.id !== deleteTrip.id))
      setArchivedTrips(prev => prev.filter(t => t.id !== deleteTrip.id))
      toast.success(t('dashboard.toast.deleted'))
    } catch {
      toast.error(t('dashboard.toast.deleteError'))
    }
    setDeleteTrip(null)
  }

  const handleArchive = async (id: string | number) => {
    if (supabasePlane) {
      if (typeof id !== 'string') return
      try {
        const allowed = await canTripActionDirect(id, 'trip.archive')
        if (!allowed) {
          toast.error(t('dashboard.toast.reviewersOnly'))
          return
        }
        const prev = trips.find((t): t is FamilyDashboardTrip => isFamilyDashboardTrip(t) && t.id === id)
        const trip = keepHubEnrichment(await archiveTrip(id), prev)
        setTrips(prevTrips => prevTrips.filter(t => t.id !== id))
        setArchivedTrips(prevArchived => sortTrips([trip, ...prevArchived]))
        toast.success(t('dashboard.toast.archived'))
      } catch (err: unknown) {
        toast.error(isPermissionDenied(err) ? t('dashboard.toast.reviewersOnly') : t('dashboard.toast.archiveError'))
      }
      return
    }
    if (typeof id !== 'number') return
    try {
      const data = await tripsApi.archive(id)
      setTrips(prev => prev.filter(t => t.id !== id))
      setArchivedTrips(prev => sortTrips([data.trip, ...prev]))
      toast.success(t('dashboard.toast.archived'))
    } catch {
      toast.error(t('dashboard.toast.archiveError'))
    }
  }

  const handleUnarchive = async (id: string | number) => {
    if (supabasePlane) {
      if (typeof id !== 'string') return
      try {
        const allowed = await canTripActionDirect(id, 'trip.archive')
        if (!allowed) {
          toast.error(t('dashboard.toast.reviewersOnly'))
          return
        }
        const prev = archivedTrips.find((t): t is FamilyDashboardTrip => isFamilyDashboardTrip(t) && t.id === id)
        const trip = keepHubEnrichment(await unarchiveTrip(id), prev)
        setArchivedTrips(prevArchived => prevArchived.filter(t => t.id !== id))
        setTrips(prevTrips => sortTrips([trip, ...prevTrips]))
        toast.success(t('dashboard.toast.restored'))
      } catch (err: unknown) {
        toast.error(isPermissionDenied(err) ? t('dashboard.toast.reviewersOnly') : t('dashboard.toast.restoreError'))
      }
      return
    }
    if (typeof id !== 'number') return
    try {
      const data = await tripsApi.unarchive(id)
      setArchivedTrips(prev => prev.filter(t => t.id !== id))
      setTrips(prev => sortTrips([data.trip, ...prev]))
      toast.success(t('dashboard.toast.restored'))
    } catch {
      toast.error(t('dashboard.toast.restoreError'))
    }
  }

  const confirmCopy = async () => {
    if (supabasePlane) {
      if (!copyTrip) return
      try {
        await duplicateTrip(String(copyTrip.id))
        await loadTrips({ silent: true })
        toast.success(t('dashboard.toast.copied'))
      } catch {
        toast.error(t('dashboard.toast.copyError'))
      }
      setCopyTrip(null)
      return
    }
    if (!copyTrip || typeof copyTrip.id !== 'number') {
      toast.error(t('dashboard.toast.copyLater'))
      setCopyTrip(null)
      return
    }
    try {
      const data = await tripsApi.copy(copyTrip.id, { title: `${copyTrip.title} (${t('dashboard.copySuffix')})` })
      setTrips(prev => sortTrips([data.trip, ...prev]))
      toast.success(t('dashboard.toast.copied'))
    } catch {
      toast.error(t('dashboard.toast.copyError'))
    }
    setCopyTrip(null)
  }

  const openCreateTrip = () => {
    if (supabasePlane) {
      if (!familyId || !personId) {
        toast.error(t('dashboard.propose.missingPerson'))
        return
      }
      setEditingTrip(null)
      setEditingProposalId(null)
      setEditingTripId(null)
      setShowForm(true)
      return
    }
    setEditingTrip(null)
    setShowForm(true)
  }
  const openEditTrip = (trip: DashboardTrip) => {
    if (supabasePlane) {
      const action = hubPencilAction(String(trip.id), personId, openProposalsByTripId)
      if (action.kind === 'edit') {
        setEditingTrip(null)
        setEditingProposalId(action.proposalId)
        setEditingTripId(String(trip.id))
        setShowForm(true)
        return
      }
      if (action.kind === 'vote') {
        setVotingProposalId(action.proposalId)
        return
      }
      toast.error(t('dashboard.toast.editPublished'))
      return
    }
    setEditingTrip(trip)
    setShowForm(true)
  }
  const openVoteProposal = (proposalId: string) => {
    setVotingProposalId(proposalId)
  }

  const closeVote = () => {
    setVotingProposalId(null)
  }

  const handleProposalDecided = async (accepted: boolean) => {
    setVotingProposalId(null)
    toast.success(accepted ? t('dashboard.toast.proposalAccepted') : t('dashboard.toast.proposalRejected'))
    await loadTrips({ silent: true })
  }

  const requestCopyTrip = (trip: DashboardTrip) => {
    if (supabasePlane) {
      if (!familyId || !personId) {
        toast.error(t('dashboard.propose.missingPerson'))
        return
      }
      setCopyTrip(trip)
      return
    }
    setCopyTrip(trip)
  }
  const requestDeleteTrip = (trip: DashboardTrip) => {
    if (supabasePlane) return
    setDeleteTrip(trip)
  }

  const gridTrips = tripFilter === 'archive' ? archivedTrips
    : tripFilter === 'completed' ? rest.filter(t => getTripStatus(t) === 'past')
    : rest.filter(t => getTripStatus(t) !== 'past')

  // Nest outage banner only on nest plane; supabase uses loadError alone.
  const showLoadError = loadError || (!supabasePlane && authCheckFailed)

  return {
    demoMode, locale, t, navigate,
    spotlight, heroBundle, stats, upcoming, gridTrips, isLoading,
    loadError: showLoadError, retryLoad,
    tripFilter, setTripFilter, viewMode, toggleViewMode,
    showForm, setShowForm, editingTrip, setEditingTrip,
    editingProposalId, editingTripId, closeForm,
    votingProposalId, openVoteProposal, closeVote, handleProposalDecided,
    openProposals, canDecideProposalIds,
    deleteTrip, setDeleteTrip, copyTrip, setCopyTrip, setTrips,
    allSubOpen, setAllSubOpen, openCalendarSubscribe,
    handleCreate, handleUpdate, handleProposed, confirmDelete, handleArchive, handleUnarchive, confirmCopy,
    openCreateTrip, openEditTrip, requestCopyTrip, requestDeleteTrip,
    supabasePlane,
    familyId,
    personId,
    showMutationControls,
    canMutate,
  }
}
