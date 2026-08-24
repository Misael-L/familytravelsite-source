import { describe, expect, it } from 'vitest'
import { toPackingListItem, toPackingListBag } from '../Packing/familyPacking'
import { toTodoListItem } from './familyTodos'
import type { FamilyPackingBag, FamilyPackingItem } from '../../data/supabase/packing'
import type { FamilyTodoItem } from '../../data/supabase/todos'

const names = new Map([
  ['person-ada', 'Ada'],
  ['person-lin', 'Lin'],
])

const packing: FamilyPackingItem = {
  id: 'item-1',
  tripId: 'trip-1',
  name: 'Passport',
  checked: true,
  category: 'Docs',
  sortOrder: 2,
  quantity: 1,
  weightGrams: 80,
  bagId: 'bag-1',
  isPrivate: true,
  ownerPersonId: 'person-ada',
  recipientPersonIds: ['person-lin'],
  contributorPersonIds: ['person-lin'],
}

describe('toPackingListItem', () => {
  it('maps Family packing onto TREK view fields without coercing UUIDs', () => {
    const view = toPackingListItem(packing, names)
    expect(view.id).toBe('item-1')
    expect(view.trip_id).toBe('trip-1')
    expect(view.checked).toBe(1)
    expect(view.is_private).toBe(1)
    expect(view.bag_id).toBe('bag-1')
    expect(view.owner_id).toBe('person-ada')
    expect(view.owner_username).toBe('Ada')
    expect(view.recipients).toEqual([{ user_id: 'person-lin', username: 'Lin' }])
    expect(view.contributors).toEqual([{ user_id: 'person-lin', username: 'Lin' }])
  })
})

describe('toPackingListBag', () => {
  it('keeps bag member person ids as strings', () => {
    const bag: FamilyPackingBag = {
      id: 'bag-1',
      tripId: 'trip-1',
      name: 'Carry-on',
      color: null,
      weightLimitGrams: 7000,
      sortOrder: 0,
      memberPersonIds: ['person-ada'],
    }
    const view = toPackingListBag(bag, names)
    expect(view.id).toBe('bag-1')
    expect(view.color).toBe('#94a3b8')
    expect(view.members).toEqual([{ user_id: 'person-ada', username: 'Ada' }])
  })
})

describe('toTodoListItem', () => {
  it('maps assigned person UUID onto assigned_user_id without Number()', () => {
    const item: FamilyTodoItem = {
      id: 'todo-1',
      tripId: 'trip-1',
      name: 'Buy tickets',
      checked: false,
      category: 'Prep',
      sortOrder: 0,
      dueDate: '2026-08-20',
      description: 'Evening train',
      assignedPersonId: 'person-ada',
      priority: 1,
    }
    const view = toTodoListItem(item)
    expect(view.id).toBe('todo-1')
    expect(view.trip_id).toBe('trip-1')
    expect(view.checked).toBe(0)
    expect(view.assigned_user_id).toBe('person-ada')
    expect(view.due_date).toBe('2026-08-20')
  })
})
