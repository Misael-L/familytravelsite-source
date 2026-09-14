import { useState, useMemo, useRef, useEffect } from 'react'
import type { ChangeEvent } from 'react'
import { useTripStore } from '../../store/tripStore'
import { useCanDo } from '../../store/permissionsStore'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import { useAddonStore } from '../../store/addonStore'
import { BAG_COLORS, PACKING_PLACEHOLDER_NAME } from './packingListPanel.constants'
import { parseImportLines } from './packingListPanel.helpers'
import {
  nestPackingListOps,
  type PackingEntityId,
  type PackingListAssignee,
  type PackingListBag,
  type PackingListItem,
  type PackingListMember,
  type PackingListOps,
  type PackingListTemplate,
} from './packingListOps'

export type TripMember = PackingListMember
export type CategoryAssignee = PackingListAssignee

export interface PackingListPanelProps {
  tripId: PackingEntityId
  items: PackingListItem[]
  openImportSignal?: number
  clearCheckedSignal?: number
  saveTemplateSignal?: number
  inlineHeader?: boolean
  view?: 'common' | 'personal'
  onViewChange?: (view: 'common' | 'personal') => void
  /** Default Nest tripStore + packingApi. Family injects packing.ts. */
  ops?: PackingListOps
  /** When set, packing writes follow HOF 2A instead of Nest packing_edit. */
  canMutate?: boolean
  /** Family HOF may save family-scoped templates. Nest uses instance admin. */
  canSaveTemplate?: boolean
  /** Family bags/weight are always on. Nest follows the addon flag. */
  bagTrackingEnabled?: boolean
  currentUserId?: PackingEntityId
  /** Nest plugins stay on dev:nest. */
  enablePlugins?: boolean
}

/**
 * Packing list state: trip members + per-category assignees, category grouping
 * and progress, item/category CRUD, bag tracking (weights + members) and the
 * template apply/save + bulk CSV import flows (driven by signal props). The
 * sections below render header, filters, the grouped list, the bag sidebar/
 * modal and the import dialog.
 */
export function usePackingList({
  tripId,
  items,
  openImportSignal = 0,
  clearCheckedSignal = 0,
  saveTemplateSignal = 0,
  inlineHeader = true,
  view: viewProp,
  onViewChange,
  ops = nestPackingListOps,
  canMutate,
  canSaveTemplate,
  bagTrackingEnabled: bagTrackingProp,
  currentUserId: currentUserIdProp,
  enablePlugins = true,
}: PackingListPanelProps) {
  const [filter, setFilter] = useState('alle')
  const [ownView, setOwnView] = useState<'common' | 'personal'>('common')
  const view = viewProp ?? ownView
  const setView = onViewChange ?? setOwnView
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const nestCan = useCanDo()
  const trip = useTripStore((s) => s.trip)
  const canEdit = canMutate !== undefined ? canMutate : nestCan('packing_edit', trip)
  const nestIsAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const isAdmin = canSaveTemplate !== undefined ? canSaveTemplate : nestIsAdmin
  const nestUserId = useAuthStore((s) => s.user?.id)
  const currentUserId = currentUserIdProp ?? nestUserId
  const toast = useToast()
  const { t } = useTranslation()

  const [tripMembers, setTripMembers] = useState<PackingListMember[]>([])
  const [categoryAssignees, setCategoryAssignees] = useState<Record<string, PackingListAssignee[]>>({})

  useEffect(() => {
    ops.loadMembers(tripId).then(setTripMembers).catch(() => {})
    ops.loadCategoryAssignees(tripId).then(setCategoryAssignees).catch(() => {})
  }, [tripId, ops])

  const handleSetAssignees = async (category: string, userIds: PackingEntityId[]) => {
    try {
      const assignees = await ops.setCategoryAssignees(tripId, category, userIds)
      setCategoryAssignees(prev => ({ ...prev, [category]: assignees }))
    } catch {
      toast.error(t('packing.toast.saveError'))
    }
  }

  const viewItems = useMemo(
    () => items.filter(i => {
      if (view === 'common') return !i.is_private
      if (!i.is_private) return false
      if (canMutate === undefined || currentUserId == null) return true
      return i.owner_id == null
        || i.owner_id === currentUserId
        || (i.recipients || []).some(r => r.user_id === currentUserId)
    }),
    [items, view, currentUserId, canMutate],
  )

  const allCategories = useMemo(() => {
    const seen: string[] = []
    for (const item of viewItems) {
      const cat = item.category || t('packing.defaultCategory')
      if (!seen.includes(cat)) seen.push(cat)
    }
    return seen
  }, [viewItems, t])

  const gruppiert = useMemo(() => {
    const filtered = viewItems.filter(i => {
      if (filter === 'offen') return !i.checked
      if (filter === 'erledigt') return i.checked
      return true
    })
    const groups: Record<string, PackingListItem[]> = {}
    for (const item of filtered) {
      const kat = item.category || t('packing.defaultCategory')
      if (!groups[kat]) groups[kat] = []
      groups[kat].push(item)
    }
    return groups
  }, [viewItems, filter, t])

  const abgehakt = viewItems.filter(i => i.checked).length
  const fortschritt = viewItems.length > 0 ? Math.round((abgehakt / viewItems.length) * 100) : 0

  const handleAddItemToCategory = async (category: string, name: string) => {
    try {
      const placeholder = items.find(
        i => i.category === category && i.name === PACKING_PLACEHOLDER_NAME,
      )
      if (placeholder) {
        await ops.updateItem(tripId, placeholder.id, { name })
      } else {
        await ops.addItem(tripId, { name, category, visibility: view === 'personal' ? 'personal' : 'common' })
      }
    } catch { toast.error(t('packing.toast.addError')) }
  }

  const handleDeleteItem = async (item: PackingListItem) => {
    const category = item.category
    const isLastInCategory = !!category
      && item.name !== PACKING_PLACEHOLDER_NAME
      && !items.some(i => i.id !== item.id && i.category === category)
    try {
      if (isLastInCategory) {
        if (item.checked) await ops.toggleItem(tripId, item.id, false)
        await ops.updateItem(tripId, item.id, {
          name: PACKING_PLACEHOLDER_NAME, weight_grams: null, bag_id: null, quantity: 1,
        })
      } else {
        await ops.deleteItem(tripId, item.id)
      }
    } catch {
      toast.error(t('packing.toast.deleteError'))
    }
  }

  const handleAddNewCategory = async () => {
    if (!newCatName.trim()) return
    let catName = newCatName.trim()
    while (allCategories.includes(catName)) {
      catName += '​'
    }
    try {
      await ops.addItem(tripId, { name: '...', category: catName, visibility: view === 'personal' ? 'personal' : 'common' })
      setNewCatName('')
      setAddingCategory(false)
    } catch { toast.error(t('packing.toast.addError')) }
  }

  const handleRenameCategory = async (oldName: string, newName: string) => {
    const toUpdate = items.filter(i => (i.category || t('packing.defaultCategory')) === oldName)
    await ops.renameCategory(tripId, oldName, newName, toUpdate.map(i => i.id))
  }

  const handleDeleteCategory = async (catItems: PackingListItem[]) => {
    let failed = false
    for (const item of catItems) {
      try { await ops.deleteItem(tripId, item.id) } catch { failed = true }
    }
    if (failed) toast.error(t('packing.toast.deleteError'))
  }

  const handleClearChecked = async () => {
    if (!confirm(t('packing.confirm.clearChecked', { count: abgehakt }))) return
    let failed = false
    for (const item of items.filter(i => i.checked)) {
      try { await ops.deleteItem(tripId, item.id) } catch { failed = true }
    }
    if (failed) toast.error(t('packing.toast.deleteError'))
  }

  const nestBagTracking = useAddonStore(s => s.bagTracking)
  const addonsLoaded = useAddonStore(s => s.loaded)
  const loadAddons = useAddonStore(s => s.loadAddons)
  const bagTrackingEnabled = bagTrackingProp ?? nestBagTracking
  const [bags, setBags] = useState<PackingListBag[]>([])
  const [newBagName, setNewBagName] = useState('')
  const [showAddBag, setShowAddBag] = useState(false)
  const [showBagModal, setShowBagModal] = useState(false)

  useEffect(() => {
    if (bagTrackingProp !== undefined) return
    if (!addonsLoaded) loadAddons()
  }, [addonsLoaded, loadAddons, bagTrackingProp])

  useEffect(() => {
    if (bagTrackingEnabled) ops.listBags(tripId).then(setBags).catch(() => {})
  }, [tripId, bagTrackingEnabled, ops])

  const handleCreateBag = async () => {
    if (!newBagName.trim()) return
    try {
      const bag = await ops.createBag(tripId, { name: newBagName.trim(), color: BAG_COLORS[bags.length % BAG_COLORS.length] })
      setBags(prev => [...prev, bag])
      setNewBagName(''); setShowAddBag(false)
    } catch { toast.error(t('packing.toast.saveError')) }
  }

  const handleCreateBagByName = async (name: string): Promise<PackingListBag | undefined> => {
    try {
      const bag = await ops.createBag(tripId, { name, color: BAG_COLORS[bags.length % BAG_COLORS.length] })
      setBags(prev => [...prev, bag])
      return bag
    } catch { toast.error(t('packing.toast.saveError')); return undefined }
  }

  const handleDeleteBag = async (bagId: PackingEntityId) => {
    try {
      await ops.deleteBag(tripId, bagId)
      setBags(prev => prev.filter(b => b.id !== bagId))
    } catch { toast.error(t('packing.toast.deleteError')) }
  }

  const handleUpdateBag = async (bagId: PackingEntityId, data: Record<string, unknown>) => {
    try {
      const bag = await ops.updateBag(tripId, bagId, data)
      setBags(prev => prev.map(b => b.id === bagId ? { ...b, ...bag } : b))
    } catch { toast.error(t('common.error')) }
  }

  const handleSetBagMembers = async (bagId: PackingEntityId, userIds: PackingEntityId[]) => {
    try {
      const members = await ops.setBagMembers(tripId, bagId, userIds)
      setBags(prev => prev.map(b => b.id === bagId ? { ...b, members } : b))
    } catch { toast.error(t('common.error')) }
  }

  const [availableTemplates, setAvailableTemplates] = useState<PackingListTemplate[]>([])
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState('')
  const lastHandledImportSignal = useRef(openImportSignal)
  const lastHandledClearSignal = useRef(clearCheckedSignal)
  const lastHandledSaveSignal = useRef(saveTemplateSignal)

  useEffect(() => {
    if (openImportSignal !== lastHandledImportSignal.current && openImportSignal > 0) {
      setShowImportModal(true)
    }
    lastHandledImportSignal.current = openImportSignal
  }, [openImportSignal])

  useEffect(() => {
    if (clearCheckedSignal !== lastHandledClearSignal.current && clearCheckedSignal > 0) {
      handleClearChecked()
    }
    lastHandledClearSignal.current = clearCheckedSignal
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearCheckedSignal])

  useEffect(() => {
    if (saveTemplateSignal !== lastHandledSaveSignal.current && saveTemplateSignal > 0) {
      setShowSaveTemplate(true)
    }
    lastHandledSaveSignal.current = saveTemplateSignal
  }, [saveTemplateSignal])
  const csvInputRef = useRef<HTMLInputElement>(null)
  const templateDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ops.listTemplates(tripId).then(setAvailableTemplates).catch(() => {})
  }, [tripId, ops])

  useEffect(() => {
    if (!showTemplateDropdown) return
    const handler = (e: MouseEvent) => {
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as Node)) setShowTemplateDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTemplateDropdown])

  const handleApplyTemplate = async (templateId: PackingEntityId) => {
    setApplyingTemplate(true)
    try {
      const data = await ops.applyTemplate(tripId, templateId, view)
      toast.success(t('packing.templateApplied', { count: data.count }))
      setShowTemplateDropdown(false)
    } catch {
      toast.error(t('packing.templateError'))
    } finally {
      setApplyingTemplate(false)
    }
  }

  const handleSaveAsTemplate = async () => {
    if (!saveTemplateName.trim()) return
    try {
      await ops.saveAsTemplate(tripId, saveTemplateName.trim())
      toast.success(t('packing.templateSaved'))
      setShowSaveTemplate(false)
      setSaveTemplateName('')
      ops.listTemplates(tripId).then(setAvailableTemplates).catch(() => {})
    } catch {
      toast.error(t('common.error'))
    }
  }

  const handleBulkImport = async () => {
    const parsed = parseImportLines(importText)
    if (parsed.length === 0) { toast.error(t('packing.importEmpty')); return }
    try {
      const result = await ops.bulkImport(tripId, parsed)
      if (bagTrackingEnabled) ops.listBags(tripId).then(setBags).catch(() => {})
      toast.success(t('packing.importSuccess', { count: result.count }))
      setImportText('')
      setShowImportModal(false)
    } catch { toast.error(t('packing.importError')) }
  }

  const handleCsvFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') setImportText(reader.result) }
    reader.readAsText(file)
  }

  const font = { fontFamily: "var(--font-system)" }

  const handleSetSharing = (id: PackingEntityId, visibility: 'common' | 'personal' | 'shared', recipientIds: PackingEntityId[]) =>
    ops.setSharing(tripId, id, visibility, recipientIds)
  const handleCloneItem = (id: PackingEntityId) => ops.cloneItem(tripId, id)
  const handleJoinItem = (id: PackingEntityId) => ops.addContributor(tripId, id)
  const handleLeaveItem = (id: PackingEntityId, userId: PackingEntityId) => ops.removeContributor(tripId, id, userId)

  const reorderPackingItems = (tid: PackingEntityId, orderedIds: PackingEntityId[]) =>
    ops.reorderItems(tid, orderedIds)

  return {
    view, setView, currentUserId,
    handleSetSharing, handleCloneItem, handleJoinItem, handleLeaveItem,
    tripId, items, inlineHeader, t, canEdit, isAdmin, font, reorderPackingItems,
    filter, setFilter, addingCategory, setAddingCategory, newCatName, setNewCatName,
    tripMembers, categoryAssignees, handleSetAssignees, allCategories, gruppiert, abgehakt, fortschritt,
    handleAddItemToCategory, handleAddNewCategory, handleRenameCategory, handleDeleteCategory, handleDeleteItem, handleClearChecked,
    bagTrackingEnabled, bags, newBagName, setNewBagName, showAddBag, setShowAddBag, showBagModal, setShowBagModal,
    handleCreateBag, handleCreateBagByName, handleDeleteBag, handleUpdateBag, handleSetBagMembers,
    availableTemplates, showTemplateDropdown, setShowTemplateDropdown, applyingTemplate,
    showSaveTemplate, setShowSaveTemplate, saveTemplateName, setSaveTemplateName,
    showImportModal, setShowImportModal, importText, setImportText,
    csvInputRef, templateDropdownRef, handleApplyTemplate, handleSaveAsTemplate, parseImportLines, handleBulkImport, handleCsvFile,
    enablePlugins, canMutate, ops,
  }
}

export type PackingState = ReturnType<typeof usePackingList>
