import { useToast } from '../shared/Toast'
import { packingCategoryValue } from './packingListModel'
import { packingSetArgs } from '../../repo/plannerPackingPort'
import { useState, useRef } from 'react'
import type { PackingState } from './usePackingListPanel'
import { KategorieGruppe } from './PackingListPanelCategoryGroup'
import EmptyState from '../shared/EmptyState'

export function PackingList(S: PackingState) {
  const toast = useToast()
  const {
    items, gruppiert, t, tripId, allCategories, handleRenameCategory, handleDeleteCategory, handleDeleteItem,
    handleBeginItem, handleCancelItem, handleAddItemToCategory, categoryAssignees, tripMembers, handleSetAssignees,
    bagTrackingEnabled, bags, handleCreateBagByName, canEdit, reorderPackingItems,
    currentUserId, handleSetSharing, handleCloneItem, handleJoinItem, handleLeaveItem, sort, groupActions, categoryActions,
  } = S
  // Which category is being dragged and which card it is over. Held here, above
  // the cards, because the drag starts in one card and ends in another.
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null)
  const [overCategory, setOverCategory] = useState<string | null>(null)
  const categoryMover = useRef<((from:string,to:string)=>void) | null>(null)
  const endCategoryDrag = () => { setDraggedCategory(null); setOverCategory(null) }
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0 16px' }}>
      {items.length === 0 && !S.categoryViews?.length ? (
        <EmptyState scene="packing" title={t('packing.emptyTitle')} />
      ) : Object.keys(gruppiert).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-faint)' }}>
          <p style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', margin: 0 }}>{t('packing.emptyFiltered')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(gruppiert).map(([kat, katItems]) => (
            <KategorieGruppe
              key={kat}
              kategorie={S.categoryLabel(kat)}
              categoryKey={kat}
              items={katItems}
              tripId={tripId}
              allCategories={allCategories}
              onRename={handleRenameCategory}
              onDeleteAll={handleDeleteCategory}
              onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItemToCategory}
              onBeginItem={handleBeginItem}
              onCancelItem={handleCancelItem}
              assignees={categoryActions.assignees(kat, packingCategoryValue(categoryAssignees, kat, []))}
              tripMembers={categoryActions.members(kat, tripMembers)}
              onSetAssignees={categoryActions.family ? (label, people) => categoryActions.assign(label, people).catch(error => toast.error(error instanceof Error ? error.message : String(error))) : handleSetAssignees}
              bagTrackingEnabled={bagTrackingEnabled}
              bags={bags}
              onCreateBag={handleCreateBagByName}
              canEdit={canEdit && (S.categoryViews?.find(c => c.key === kat)?.owned ?? true)}
              allItems={items}
              groupActions={groupActions}
              categoryActions={categoryActions}
              onReorder={(orderedIds, observed) => { void reorderPackingItems(tripId, orderedIds, ...packingSetArgs(observed ?? items)).catch((error: unknown) => toast.error(error instanceof Error ? error.message : t('packing.toast.saveError'))) }}
              reorderable={sort === 'manual'}
              categoryDrag={S.canReorderCategories ? {
                isDragging: draggedCategory === kat,
                isOver: overCategory === kat && draggedCategory !== null && draggedCategory !== kat,
                onStart: () => { categoryMover.current = S.beginCategoryMove(); if (!categoryMover.current) return; setDraggedCategory(kat); setOverCategory(null) },
                onOver: () => setOverCategory(kat),
                onEnd: endCategoryDrag,
                onDrop: (dragged) => { categoryMover.current?.(dragged, kat); endCategoryDrag() },
              } : undefined}
              currentUserId={currentUserId}
              onSetSharing={handleSetSharing}
              onClone={handleCloneItem}
              onJoin={handleJoinItem}
              onLeave={handleLeaveItem}
            />
          ))}
        </div>
      )}
    </div>
  )
}
