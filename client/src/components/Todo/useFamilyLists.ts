import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../shared/Toast'
import { listPackingItems } from '../../data/supabase/packing'
import { listTodoItems } from '../../data/supabase/todos'
import { listTripTravelers } from '../../data/supabase/tripTravelers'
import { createFamilyPackingOps, toPackingListItem } from '../Packing/familyPacking'
import type { PackingListItem, PackingListOps } from '../Packing/packingListOps'
import { createFamilyTodoOps, toTodoListItem } from './familyTodos'
import type { TodoListOps } from './todoListOps'
import type { TodoItem } from '../../types'
import type { ListsContainerProps } from './ListsContainer'

export type FamilyListsPanelProps = {
  tripId: string
  familyId: string
  canMutate: boolean
  canMutatePacking?: boolean
  canMutateTodos?: boolean
  mePersonId: string | null
}

/** Loads Family packing + todos and returns TREK ListsContainer props. No Nest APIs. */
export function useFamilyLists({
  tripId,
  familyId,
  canMutate,
  canMutatePacking,
  canMutateTodos,
  mePersonId,
}: FamilyListsPanelProps): ListsContainerProps {
  const toast = useToast()
  const [packingItems, setPackingItems] = useState<PackingListItem[]>([])
  const [todoItems, setTodoItems] = useState<TodoItem[]>([])
  const namesRef = useRef(new Map<string, string>())

  const reload = useCallback(async () => {
    const [packing, todos, travelers] = await Promise.all([
      listPackingItems(tripId),
      listTodoItems(tripId),
      listTripTravelers(tripId).catch(() => []),
    ])
    const names = new Map<string, string>()
    for (const tr of travelers) names.set(tr.personId, tr.displayName)
    namesRef.current = names
    setPackingItems(packing.map(item => toPackingListItem(item, names)))
    setTodoItems(todos.map(toTodoListItem))
  }, [tripId])

  useEffect(() => {
    void reload().catch(err => toast.error(err instanceof Error ? err.message : String(err)))
  }, [reload])

  const packingOps: PackingListOps = useMemo(() => createFamilyPackingOps({
    tripId,
    familyId,
    mePersonId,
    getNames: () => namesRef.current,
    reload,
  }), [tripId, familyId, mePersonId, reload])

  const todoOps: TodoListOps = useMemo(() => createFamilyTodoOps({
    tripId,
    mePersonId,
    getNames: () => namesRef.current,
    reload,
  }), [tripId, mePersonId, reload])

  return {
    tripId,
    packingItems,
    todoItems,
    packingOps,
    todoOps,
    canMutate,
    canMutatePacking: canMutatePacking ?? canMutate,
    canMutateTodos: canMutateTodos ?? canMutate,
    canSaveTemplate: canMutatePacking ?? canMutate,
    bagTrackingEnabled: true,
    currentUserId: mePersonId,
    enablePlugins: false,
  }
}
