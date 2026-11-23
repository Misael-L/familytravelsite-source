import { packingBagActionsAvailable } from '../../../../repo/plannerPackingBagPort'
import { showPackingCategoryMenu } from '../../../../components/Packing/packingCategoryActions'
import { hasReadOnlySession } from '../../../../db/readOnlySession';
import { usePackingBagTracking, usePackingCategoryViews } from '../../../../components/Packing/usePackingSnapshot'
import { FamilyPackingTrash } from '../../../../integrations/family/FamilyPackingTrash'
import { currentPlannerPackingPort, guardPackingGroupAction, packingGroupActionsAvailable, packingCategoryCreateAvailable } from '../../../../repo/plannerPackingPort';
import { usePackingGroupActions } from '../../../../components/Packing/usePackingGroupActions'
import { usePackingCategoryActions, type NativePackingCategoryActions } from '../../../../components/Packing/usePackingCategoryActions'
import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Briefcase, Check, CheckCheck, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText, LayoutTemplate, MoreHorizontal, Package, Pencil, Plus, Printer, RotateCcw, Save as SaveIcon, Trash2, UserPlus } from 'lucide-react';
import MDancingTrek from '../../../components/MDancingTrek'
import { useAuthStore } from '../../../../store/authStore'
import type { PackingBag, PackingItem, TripMember } from '../../../../types'
import type { TripPlanner } from '../MTripShell'
import MConfirmSheet from '../../settings/MConfirmSheet'
import { FIELD_CLS } from '../sheets/PlSheetChrome'
import { TabScroller } from './tabChrome'
import { katColor } from '../../../../components/Packing/packingListPanel.helpers';
import { groupPackingItems, packingGroupKey, packingCategoryOrder, packingCategoryValue, packingProgress, packingViewItems, type PackingCategoryGroup, type PackingStatusFilter, type PackingView } from '../../../../components/Packing/packingListModel';
import { usePackingBags } from '../../../../components/Packing/usePackingBags'
import { usePackingTemplates } from '../../../../components/Packing/usePackingTemplates'
import { usePackingCategoryAssignees, type CategoryAssignee } from '../../../../components/Packing/usePackingCategoryAssignees'
import { usePackingItemActions } from '../../../../components/Packing/usePackingItemActions'
import MBagsSheet from './MBagsSheet'
import MPackItemSheet from './MPackItemSheet'
import MPackingImportSheet from './MPackingImportSheet'
import PackingPrintPreview from '../../../../components/Packing/PackingPrintPreview'
import { usePackingExport } from '../../../../components/Packing/usePackingExport'
import { PackingItemRow } from './MPackingItemRow';

type ActionView = 'menu' | 'apply' | 'save'

/**
 * Packing sub-tab (spec 03 §4.1-4.4): progress card, action menu (remove
 * checked / apply+save template / import), Shared|My-list + All|Open|Done
 * filters, and the category cards. Category-level state (rename/menu/assign/
 * add-item, bag picker) lives inside the row components below, mirroring how
 * the desktop `KategorieGruppe`/`ArtikelZeile` keep it local too.
 */
export default function MPackingListTab({ planner }: { planner: TripPlanner }) {
  const { t, toast, tripId, packingItems: items, tripActions } = planner
  const canEdit = !hasReadOnlySession() && planner.can('packing_edit', planner.trip)
  const canEditGroups = packingGroupActionsAvailable(canEdit)
  const isAdmin = useAuthStore(s => s.user?.role === 'admin')
  const currentUserId = useAuthStore(s => s.user?.id) ?? null
  // Bag-tracking is a global addon flag, NOT part of planner.enabledAddons (§6.4).
  const bagTrackingEnabled = usePackingBagTracking(tripId)
  const tripMembers = planner.tripMembers

  const [view, setView] = useState<PackingView>('common')
  const packingExport = usePackingExport(tripId, view)
  // Exporting changes nothing, so the menu is there for anyone with a list to take along.
  const hasActions = canEdit || packingExport.hasItems
  const [statusFilter, setStatusFilter] = useState<PackingStatusFilter>('all')
  const groupActions = usePackingGroupActions(tripId, view, statusFilter)
  const canPackGroup = groupActions.available('packed-state', canEdit)
  const canClearCompleted = groupActions.available('clear-completed', canEdit)
  const reportGroupError = (error: unknown) => toast.error(error instanceof Error ? error.message : t('packing.toast.saveError'))
  const [editMode, setEditMode] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionView, setActionView] = useState<ActionView>('menu')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [showBagsSheet, setShowBagsSheet] = useState(false)
  const [showImportSheet, setShowImportSheet] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{ name: string; label: string; items: PackingItem[] } | null>(null)

  const closeActions = () => {
    setActionsOpen(false)
    setActionView('menu')
  }
  const { people: bagPeople, beginCreate, cancelCreate, bags, unassignedWeightGrams, serverWeightsFresh, createBag, updateBag, deleteBag, setBagMembers } =
    usePackingBags({ tripId, bagTrackingEnabled, t, toast })
  const { templates, applyTemplate, saveTemplateName, setSaveTemplateName, saveAsTemplate } =
    usePackingTemplates({ tripId, view, t, toast, onApplied: closeActions, onSaved: closeActions })
  const { categoryAssignees, setAssignees: setCategoryAssigneesFor } = usePackingCategoryAssignees({ tripId, t, toast })

  const defaultCategory = t('packing.defaultCategory')
  const categoryActions = usePackingCategoryActions({ trip: tripId, view, items, defaultCategory, authorized: canEdit, report: reportGroupError })
  const viewItems = useMemo(() => packingViewItems(items, view), [items, view])
  const categoryViews = usePackingCategoryViews(tripId, view, items)
  const categoryOrder = useMemo(() => packingCategoryOrder(viewItems, defaultCategory, categoryViews), [viewItems, defaultCategory, categoryViews])
  const groups = useMemo(() => groupPackingItems(viewItems, statusFilter, defaultCategory, categoryViews), [viewItems, statusFilter, defaultCategory, categoryViews])
  const progress = packingProgress(viewItems)
  const checkedCount = viewItems.filter(i => i.checked).length

  const {
    beginItem, cancelItem, addingCategory, setAddingCategory, newCategoryName, setNewCategoryName, addItemToCategory, deleteItem,
    renameCategoryReporting: legacyRenameCategory, deleteCategoryItems, clearChecked, addNewCategory,
  } = usePackingItemActions({
    tripId, items, view, currentUserId, categories: categoryOrder, defaultCategory,
    actions: tripActions, t, toast, placeholderFrom: 'items',
  })

  const renameCategory = (label: string, name: string) => { if (categoryActions.family) return categoryActions.rename(label, name).catch(reportGroupError); return legacyRenameCategory(label, name) }

  const toggleCategory = (cat: string) => setCollapsed(c => ({ ...c, [cat]: !packingCategoryValue<boolean>(c, cat, false) }))

  const checkAllInCategory = async (category: string, catItems: PackingItem[]) => {
    try {
      if (!canPackGroup) return
      if (groupActions.family) { await groupActions.packed(category, true); return }
      guardPackingGroupAction(items)
      for (const item of catItems) if (!item.checked) await tripActions.togglePackingItem(tripId, item.id, true)
    } catch {
      toast.error(t('packing.toast.saveError'))
    }
  }
  const uncheckAllInCategory = async (category: string, catItems: PackingItem[]) => {
    try {
      if (!canPackGroup) return
      if (groupActions.family) { await groupActions.packed(category, false); return }
      guardPackingGroupAction(items)
      for (const item of catItems) if (item.checked) await tripActions.togglePackingItem(tripId, item.id, false)
    } catch {
      toast.error(t('packing.toast.saveError'))
    }
  }

  // Two switches, each a segmented control of its own on its own track: whose
  // list, and which items. As five loose pills in one row with two of them lit,
  // they read as one control with two answers.
  const filterTrackCls = 'flex min-w-0 gap-[2px] rounded-full bg-[color:var(--m-ic)] p-[3px] wide:flex-none'
  const filterPillCls = (active: boolean) =>
    `flex-1 whitespace-nowrap rounded-full px-2 py-[5px] text-center text-[0.71875rem] font-semibold wide:flex-none wide:px-[14px] ${
      active ? 'bg-m-act text-m-actfg' : 'text-m-ink'
    }`

  const trueEmpty = items.length === 0 && !categoryViews?.length
  const viewEmpty = viewItems.length === 0 && !categoryViews?.length

  return (
    <TabScroller wide="full">
      {/* ── Progress card (spec §4.1) ── */}
      <div className="rounded-2xl border border-[color:var(--m-rowbr)] bg-m-sheetop px-[14px] py-[13px]">
        <div className="flex items-baseline gap-[7px]">
          <span className="font-geist text-[1rem] font-extrabold tabular-nums text-m-ink">{progress.checked}/{progress.total}</span>
          <span className="font-geist text-[0.625rem] font-bold text-m-faint">{progress.pct}%</span>
          <div className="ms-auto flex items-center gap-[6px]">
            {bagTrackingEnabled && (
              <button
                type="button"
                onClick={() => setShowBagsSheet(true)}
                className="flex items-center gap-[5px] rounded-full border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] px-[11px] py-[6px] text-[0.71875rem] font-semibold text-m-ink"
              >
                <Briefcase size={11} strokeWidth={2} />
                {t('packing.bags')}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditMode(v => !v)}
                aria-pressed={editMode}
                className={`flex items-center gap-[5px] rounded-full px-[11px] py-[6px] text-[0.71875rem] font-semibold ${
                  editMode ? 'bg-m-act text-m-actfg' : 'bg-[color:var(--m-ic)] text-m-muted'
                }`}
              >
                <Pencil size={12} strokeWidth={2} />
                {editMode ? t('packing.editDone') : t('common.edit')}
              </button>
            )}
            {hasActions && (
              <button
                type="button"
                onClick={() => setActionsOpen(v => !v)}
                aria-label={t('packing.actions')}
                aria-expanded={actionsOpen}
                className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[color:var(--m-ic)] text-m-muted"
              >
                <MoreHorizontal size={13} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-[9px] h-[5px] overflow-hidden rounded-full bg-[color:var(--m-ic)]">
          <div className="h-full rounded-full bg-m-act" style={{ width: `${progress.pct}%` }} />
        </div>
      </div>

      {/* ── Action menu (spec §4.2) ── */}
      {actionsOpen && hasActions && (
        // On a wide window the menu drops from the button that opened it, at the
        // width of a popover, instead of running across the whole page.
        <div className="mt-[6px] overflow-hidden rounded-2xl border border-[color:var(--m-rowbr)] bg-[color:var(--m-glass)] backdrop-blur-[24px] wide:ms-auto wide:max-w-[380px]">
          {actionView === 'menu' && (
            <>
              {canClearCompleted && checkedCount > 0 && (
                <ActionRow
                  icon={Trash2}
                  label={t('packing.clearChecked', { count: checkedCount })}
                  danger
                  onClick={() => {
                    try { if (groupActions.family) groupActions.beginClear(items); setActionsOpen(false); setConfirmClear(true) }
                    catch (error) { reportGroupError(error) }
                  }}
                />
              )}
              {canEditGroups && templates.length > 0 && (
                <ActionRow icon={LayoutTemplate} label={t('packing.applyTemplate')} onClick={() => setActionView('apply')} />
              )}
              {canEditGroups && isAdmin && items.length > 0 && (
                <ActionRow icon={SaveIcon} label={t('packing.saveAsTemplate')} onClick={() => setActionView('save')} />
              )}
              {canEditGroups && (
                <ActionRow icon={Download} label={t('packing.import')} onClick={() => { setActionsOpen(false); setShowImportSheet(true) }} />
              )}
              {packingExport.hasItems && (
                <>
                  <ActionRow icon={Printer} label={t('packing.exportPrint')} onClick={() => { setActionsOpen(false); void packingExport.openPrint() }} />
                  <ActionRow icon={FileText} label={t('packing.exportMarkdown')} onClick={() => { setActionsOpen(false); packingExport.exportMarkdown() }} />
                  <ActionRow icon={FileSpreadsheet} label={t('packing.exportCsv')} onClick={() => { setActionsOpen(false); void packingExport.exportCsv() }} />
                </>
              )}
            </>
          )}
          {actionView === 'apply' && (
            <div className="p-[6px]">
              {templates.map(tmpl => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => applyTemplate(tmpl.id)}
                  className="flex w-full items-center gap-[9px] rounded-[10px] px-[10px] py-[9px] text-start"
                >
                  <Package size={14} strokeWidth={2} className="flex-none text-m-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.78125rem] font-semibold text-m-ink">{tmpl.name}</span>
                    <span className="block font-geist text-[0.625rem] text-m-faint">{tmpl.item_count} {t('admin.packingTemplates.items', { count: tmpl.item_count })}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {actionView === 'save' && (
            <div className="flex items-center gap-2 p-[10px]">
              <input
                type="text"
                autoFocus
                value={saveTemplateName}
                onChange={e => setSaveTemplateName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void saveAsTemplate() }}
                placeholder={t('packing.templateName')}
                className={`${FIELD_CLS} flex-1`}
              />
              <button
                type="button"
                onClick={saveAsTemplate}
                disabled={!saveTemplateName.trim()}
                aria-label={t('common.save')}
                className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-m-act text-m-actfg disabled:opacity-40"
              >
                <Check size={15} strokeWidth={2.4} />
              </button>
            </div>
          )}
        </div>
      )}

      <FamilyPackingTrash />

      {/* ── Add list — sits directly under the progress card (instead of at the
           very bottom) so it's reachable without scrolling past every category.
           Same dashed-pill style as before, just relocated. ── */}
      {packingCategoryCreateAvailable(canEdit) && (editMode || trueEmpty) && (
        addingCategory ? (
          <div className="mt-[10px] flex gap-2">
            <input
              type="text"
              autoFocus
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void addNewCategory()
                if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryName('') }
              }}
              placeholder={t('packing.newCategoryPlaceholder')}
              className={`${FIELD_CLS} flex-1`}
            />
            <button
              type="button"
              onClick={addNewCategory}
              disabled={!newCategoryName.trim()}
              aria-label={t('common.add')}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-m-act text-m-actfg disabled:opacity-40"
            >
              <Check size={15} strokeWidth={2.4} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            className="mt-[10px] flex w-full items-center justify-center gap-[5px] rounded-full border-[1.5px] border-dashed border-[color:var(--m-trackoff)] py-[10px] font-geist text-[0.6875rem] font-semibold text-m-muted"
          >
            <Plus size={12} strokeWidth={2.2} />
            {t('packing.addCategory')}
          </button>
        )
      )}

      {/* ── Filters (spec §4.3) ── */}
      {!trueEmpty && (
        <div className="mt-[10px] flex items-center gap-[10px]">
          <div className={`${filterTrackCls} flex-[2]`}>
            <button type="button" aria-pressed={view === 'common'} onClick={() => setView('common')} className={filterPillCls(view === 'common')}>{t('packing.viewCommon')}</button>
            <button type="button" aria-pressed={view === 'personal'} onClick={() => setView('personal')} className={filterPillCls(view === 'personal')}>{t('packing.viewPersonal')}</button>
          </div>
          <div className={`${filterTrackCls} flex-[3]`}>
            <button type="button" aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')} className={filterPillCls(statusFilter === 'all')}>{t('packing.filterAll')}</button>
            <button type="button" aria-pressed={statusFilter === 'open'} onClick={() => setStatusFilter('open')} className={filterPillCls(statusFilter === 'open')}>{t('packing.filterOpen')}</button>
            <button type="button" aria-pressed={statusFilter === 'done'} onClick={() => setStatusFilter('done')} className={filterPillCls(statusFilter === 'done')}>{t('packing.filterDone')}</button>
          </div>
        </div>
      )}

      {/* ── Categories + items (spec §4.4) ── */}
      {trueEmpty ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 py-10 text-center">
          <MDancingTrek scene="packing" className="mb-2" />
          <p className="font-geist text-[0.8125rem] font-medium text-m-muted">{t('packing.emptyTitle')}</p>
        </div>
      ) : viewEmpty ? (
        <div className="px-[30px] py-[26px] text-center font-geist text-[0.6875rem] leading-relaxed text-m-faint">
          {t('packing.personalEmptyHint')}
        </div>
      ) : groups.length === 0 ? (
        <div className="px-[30px] py-[26px] text-center font-geist text-[0.6875rem] leading-relaxed text-m-faint">
          {t('packing.emptyFiltered')}
        </div>
      ) : (
        // Categories stand in columns on a wide window, as many as the page
        // holds, each card whole in its column like a masonry board.
        <div className="wide:mt-[10px] wide:columns-[300px] wide:gap-3">
        {groups.map(group => (
          <PackingCategoryCard
            key={packingGroupKey(group)}
            group={group}
            categoryOrder={categoryOrder}
            open={!packingCategoryValue<boolean>(collapsed, packingGroupKey(group), false)}
            onToggle={() => toggleCategory(packingGroupKey(group))}
            editMode={editMode}
            canEdit={canEdit && !group.readOnly}
            planner={planner}
            currentUserId={currentUserId}
            assignees={categoryActions.assignees(packingGroupKey(group), packingCategoryValue(categoryAssignees, group.category, []))}
            tripMembers={categoryActions.members(packingGroupKey(group), tripMembers)}
            categoryActions={categoryActions}
            onSetAssignees={userIds => { if (categoryActions.family) void categoryActions.assign(packingGroupKey(group), userIds).catch(reportGroupError); else void setCategoryAssigneesFor(group.category, userIds) }}
            onRename={newName => renameCategory(packingGroupKey(group), newName)}
            canPackGroup={groupActions.available('packed-state', canEdit && !group.readOnly, packingGroupKey(group))}
            canTrashGroup={groupActions.available('trash', canEdit && !group.readOnly, packingGroupKey(group))}
            onBeginGroup={() => {
              try { if (groupActions.family && (groupActions.available('packed-state', canEdit && !group.readOnly, packingGroupKey(group)) || groupActions.available('trash', canEdit && !group.readOnly, packingGroupKey(group)))) groupActions.beginCategory(packingGroupKey(group), group.items, items, defaultCategory); return true }
              catch (error) { reportGroupError(error); return false }
            }}
            onCancelGroup={() => groupActions.cancelCategory(packingGroupKey(group))}
            onCheckAll={() => checkAllInCategory(packingGroupKey(group), group.items)}
            onUncheckAll={() => uncheckAllInCategory(packingGroupKey(group), group.items)}
            onDeleteCategory={() => setDeleteCategoryTarget({ name: packingGroupKey(group), label: group.category, items: groupActions.family ? group.items : items.filter(i => (i.category || defaultCategory) === group.category) })}
            onAddItem={name => addItemToCategory(packingGroupKey(group), name)}
            onBeginItem={() => beginItem(packingGroupKey(group))}
            onCancelItem={() => cancelItem(packingGroupKey(group))}
            onEditItem={id => setEditingItemId(id)}
            onDeleteItem={deleteItem}
            bagTrackingEnabled={bagTrackingEnabled}
            bags={bags}
            onCreateBag={createBag}
          />
        ))}
        </div>
      )}

      <MBagsSheet
        planner={planner}
        open={showBagsSheet}
        onClose={() => {cancelCreate();setShowBagsSheet(false)}}
        bags={bags}
        items={items}
        unassignedWeightGrams={unassignedWeightGrams}
        serverWeightsFresh={serverWeightsFresh}
        tripMembers={bagPeople?.filter(p=>p.eligible) ?? tripMembers}
        onBeginCreate={beginCreate}
        canEdit={packingBagActionsAvailable(tripId,canEdit)}
        currentUserId={currentUserId}
        onCreateBag={createBag}
        onUpdateBag={updateBag}
        onDeleteBag={deleteBag}
        onSetBagMembers={setBagMembers}
      />

      <MPackItemSheet
        planner={planner}
        open={editingItemId != null}
        itemId={editingItemId}
        bagTrackingEnabled={bagTrackingEnabled}
        tripMembers={tripMembers}
        currentUserId={currentUserId}
        onClose={() => setEditingItemId(null)}
      />

      <MPackingImportSheet planner={planner} open={showImportSheet} onClose={() => setShowImportSheet(false)} />
      <PackingPrintPreview html={packingExport.printHtml} title={packingExport.printTitle} onClose={packingExport.closePrint} />

      <MConfirmSheet
        open={confirmClear}
        onClose={() => { setConfirmClear(false); groupActions.cancelClear() }}
        title={t('packing.clearChecked', { count: checkedCount })}
        message={t('packing.confirm.clearChecked', { count: checkedCount })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={() => {
          setConfirmClear(false)
          if (!canClearCompleted) return
          if (groupActions.family) void groupActions.clear().catch(reportGroupError)
          else void clearChecked()
        }}
      />

      <MConfirmSheet
        open={deleteCategoryTarget != null}
        onClose={() => { if (deleteCategoryTarget) groupActions.cancelCategory(deleteCategoryTarget.name); setDeleteCategoryTarget(null) }}
        title={t('packing.menuDeleteCat')}
        message={deleteCategoryTarget
          ? t('packing.confirm.deleteCat', { name: deleteCategoryTarget.label, count: deleteCategoryTarget.items.length })
          : ''}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={() => {
          const target = deleteCategoryTarget
          setDeleteCategoryTarget(null)
          if (target && groupActions.available('trash', canEdit, target.name)) {
            if (groupActions.family) void groupActions.trash(target.name).catch(reportGroupError)
            else void deleteCategoryItems(target.items)
          }
        }}
      />
    </TabScroller>
  )
}

function ActionRow({ icon: Icon, label, onClick, danger = false }: {
  icon: LucideIcon
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-[9px] border-b border-[color:var(--m-rowbr)] px-[13px] py-[11px] text-start text-[0.78125rem] font-semibold last:border-b-0 ${
        danger ? 'text-[color:var(--m-st-danger)]' : 'text-m-ink'
      }`}
    >
      <Icon size={14} strokeWidth={2} />
      {label}
    </button>
  )
}

// ── Category card ───────────────────────────────────────────────────────

function PackingCategoryMenu({ canRename, canPack, canTrash, t, rename, pack, unpack, trash }: {
  canRename: boolean; canPack: boolean; canTrash: boolean; t: TripPlanner['t'];
  rename: () => void; pack: () => void; unpack: () => void; trash: () => void
}) {
  return (
    <div className="border-b border-[color:var(--m-rowbr)]">
      {canRename && <ActionRow icon={Pencil} label={t('packing.menuRename')} onClick={rename} />}
      {canPack && <ActionRow icon={CheckCheck} label={t('packing.menuCheckAll')} onClick={pack} />}
      {canPack && <ActionRow icon={RotateCcw} label={t('packing.menuUncheckAll')} onClick={unpack} />}
      {canTrash && <ActionRow icon={Trash2} label={t('packing.menuDeleteCat')} danger onClick={trash} />}
    </div>
  )
}

function PackingCategoryCard({
  group, categoryOrder, open, onToggle, editMode, canEdit, planner, currentUserId, assignees, tripMembers,
  onSetAssignees, onRename, onCheckAll, onUncheckAll, onDeleteCategory, onAddItem, onBeginItem, onCancelItem, onEditItem, onDeleteItem,
  bagTrackingEnabled, bags, onCreateBag, canPackGroup, canTrashGroup, onBeginGroup, onCancelGroup, categoryActions,
}: {
  categoryActions: NativePackingCategoryActions
  canPackGroup: boolean
  canTrashGroup: boolean
  onBeginGroup: () => boolean
  onCancelGroup: () => void
  group: PackingCategoryGroup
  categoryOrder: string[]
  open: boolean
  onToggle: () => void
  editMode: boolean
  canEdit: boolean
  planner: TripPlanner
  currentUserId: number | null
  assignees: CategoryAssignee[]
  tripMembers: (TripMember & { eligible?: boolean })[]
  onSetAssignees: (userIds: number[]) => void
  onRename: (newName: string) => void
  onCheckAll: () => void
  onUncheckAll: () => void
  onDeleteCategory: () => void
  onAddItem: (name: string) => Promise<boolean | void> | void
  onBeginItem?: () => void
  onCancelItem?: () => void
  onEditItem: (itemId: number) => void
  onDeleteItem: (item: PackingItem) => Promise<void>
  bagTrackingEnabled: boolean
  bags: PackingBag[]
  onCreateBag: (name: string) => Promise<PackingBag | undefined>
}) {
  const { t } = planner
  const canRename = categoryActions.available(packingGroupKey(group), 'rename')
  const canAssign = categoryActions.available(packingGroupKey(group), 'assign')
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState(group.category)
  const [menuOpen, setMenuOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')

  const dot = katColor(packingGroupKey(group), categoryOrder)
  const checkedCount = group.items.filter(i => i.checked).length
  const canShowMenu = showPackingCategoryMenu(canPackGroup, canTrashGroup, canRename)

  const commitRename = () => {
    const trimmed = categoryActions.family ? renameDraft : renameDraft.trim()
    if ((categoryActions.family || trimmed) && trimmed !== (categoryActions.access(packingGroupKey(group))?.name ?? group.category)) onRename(trimmed)
    else setRenameDraft(group.category)
    setRenaming(false)
  }

  const submitAddItem = () => {
    const trimmed = newItemName.trim()
    if (!canEdit || !trimmed) return
    const result = onAddItem(trimmed)
    if (currentPlannerPackingPort()) { void Promise.resolve(result).then(ok => { if (ok !== false) setNewItemName('') }); return }
    setNewItemName('')
  }

  return (
    <div className="mt-[10px] overflow-hidden rounded-2xl border border-[color:var(--m-rowbr)] bg-m-sheetop wide:mb-[10px] wide:mt-0 wide:inline-block wide:w-full wide:break-inside-avoid wide:align-top">
      {/* A <div role="button"> rather than a real <button type="button"> — the rename input and
          the assign/menu triggers below are interactive elements a <button type="button"> may
          not contain (invalid HTML); this stays keyboard-operable via onKeyDown. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        aria-expanded={open}
        className="flex w-full items-center gap-[8px] bg-[color:var(--m-ic)] px-[13px] py-[9px] text-start"
      >
        <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: dot }} />
        {renaming ? (
          <input
            type="text"
            autoFocus
            value={renameDraft}
            disabled={categoryActions.busy(packingGroupKey(group))}
            onClick={e => e.stopPropagation()}
            onChange={e => setRenameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { categoryActions.cancel(packingGroupKey(group)); setRenaming(false); setRenameDraft(group.category) }
            }}
            className="min-w-0 flex-1 border-b border-[color:var(--m-rowbr)] bg-transparent text-[0.875rem] font-bold text-m-ink outline-none"
          />
        ) : (
          <span dir="auto" className="min-w-0 flex-1 truncate text-[0.875rem] font-bold text-m-ink">{group.category}</span>
        )}
        {editMode && canAssign && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); if (!assignOpen && !categoryActions.openAssignments(packingGroupKey(group))) return; if (assignOpen) categoryActions.cancel(packingGroupKey(group)); setAssignOpen(v => !v) }}
            aria-label={t('packing.assignMembers')}
            disabled={categoryActions.busy(packingGroupKey(group))}
            className="flex-none text-m-faint"
          >
            <UserPlus size={13} strokeWidth={2} />
          </button>
        )}
        <span className="flex-none whitespace-nowrap rounded-full bg-[color:var(--m-ic)] px-2 py-[2px] font-geist text-[0.59375rem] font-bold text-m-muted">
          {checkedCount}/{group.items.length}
        </span>
        {editMode && canShowMenu && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); if (menuOpen) { onCancelGroup(); setMenuOpen(false) } else if (onBeginGroup()) setMenuOpen(true) }}
            aria-label={t('packing.categoryOptions')}
            disabled={categoryActions.busy(packingGroupKey(group))}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[color:var(--m-ic)] text-m-muted"
          >
            <MoreHorizontal size={12} strokeWidth={2} />
          </button>
        )}
        {open ? <ChevronUp size={13} strokeWidth={2} className="flex-none text-m-faint" /> : <ChevronDown size={13} strokeWidth={2} className="flex-none text-m-faint" />}
      </div>

      {assignOpen && editMode && canAssign && (
        <div className="border-b border-[color:var(--m-rowbr)] bg-m-sheetop px-[13px] py-[10px]">
          <div className="mb-[6px] font-geist text-[0.625rem] font-bold uppercase tracking-[.06em] text-m-faint">{t('packing.assignMembers')}</div>
          {tripMembers.length === 0 ? (
            <div className="font-geist text-[0.6875rem] text-m-faint">{t('packing.noMembers')}</div>
          ) : (
            <div className="flex flex-wrap gap-[6px]">
              {tripMembers.map(m => {
                const assigned = assignees.some(a => a.user_id === m.id)
                return (
                  <button
                    key={m.id}
                    disabled={categoryActions.busy(packingGroupKey(group)) || (!assigned && m.eligible === false)}
                    type="button"
                    onClick={() => onSetAssignees(assigned ? assignees.filter(a => a.user_id !== m.id).map(a => a.user_id) : [...assignees.map(a => a.user_id), m.id])}
                    className={`flex items-center gap-[5px] rounded-full px-[10px] py-[5px] text-[0.71875rem] font-semibold ${
                      assigned ? 'bg-m-act text-m-actfg' : 'bg-[color:var(--m-ic)] text-m-muted'
                    }`}
                  >
                    {m.username}
                    {assigned && <Check size={11} strokeWidth={2.4} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {menuOpen && editMode && canShowMenu && (
        <PackingCategoryMenu canRename={canRename} canPack={canPackGroup} canTrash={canTrashGroup} t={t}
          rename={() => { setMenuOpen(false); onCancelGroup(); if (!categoryActions.begin(packingGroupKey(group), 'rename')) return; setRenameDraft(categoryActions.access(packingGroupKey(group))?.name ?? group.category); setRenaming(true) }}
          pack={() => { setMenuOpen(false); onCheckAll(); onCancelGroup() }}
          unpack={() => { setMenuOpen(false); onUncheckAll(); onCancelGroup() }}
          trash={() => { setMenuOpen(false); onDeleteCategory() }} />
      )}

      {open && (
        <div className="px-[13px] pb-[8px]">
          {group.items.map(item => (
            <PackingItemRow
              key={item.id}
              item={item}
              planner={planner}
              currentUserId={currentUserId}
              editMode={editMode}
              canEdit={canEdit}
              bagTrackingEnabled={bagTrackingEnabled}
              bags={bags}
              onCreateBag={onCreateBag}
              onEdit={() => onEditItem(item.id)}
              onDelete={() => onDeleteItem(item)}
            />
          ))}

          {editMode && (canEdit || addingItem) && (
            addingItem ? (
              <div className="flex items-center gap-[6px] py-[8px]">
                <input
                  type="text"
                  autoFocus
                  value={newItemName}
                  readOnly={!canEdit}
                  onChange={e => { onBeginItem?.(); setNewItemName(e.target.value) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitAddItem()
                    if (e.key === 'Escape') { onCancelItem?.(); setAddingItem(false); setNewItemName('') }
                  }}
                  placeholder={t('packing.addItemPlaceholder')}
                  className={`${FIELD_CLS} flex-1 py-[7px]`}
                />
                <button
                  type="button"
                  onClick={submitAddItem}
                  disabled={!canEdit || !newItemName.trim()}
                  aria-label={t('common.add')}
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-m-act text-m-actfg disabled:opacity-40"
                >
                  <Plus size={14} strokeWidth={2.4} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { onBeginItem?.(); setAddingItem(true) }}
                className="flex items-center gap-[6px] py-[8px] font-geist text-[0.6875rem] font-semibold text-m-muted"
              >
                <Plus size={12} strokeWidth={2.2} />
                {t('packing.addItem')}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
