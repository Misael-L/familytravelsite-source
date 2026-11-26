import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ChatMessage } from './collabModel'
import { mergeChatUpdates, reconcileChatChanges, usePreviewChatUpdates } from './usePreviewChatUpdates'

const { get, sessionCurrent } = vi.hoisted(() => ({ get: vi.fn(), sessionCurrent: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get } }))
vi.mock('../../sync/readSession', () => ({ captureReadSession: () => ({ contextCurrent: sessionCurrent }) }))

const message = (id: number): ChatMessage => ({
  id, trip_id: 1, user_id: 2, text: 'Message ' + id, reply_to: null, username: 'Organizer',
  avatar: null, avatar_url: null, reactions: [], created_at: '2026-11-22T01:00:00Z',
})
const page = (ids: number[], hasMore = false) => ({
  data: { messages: ids.map(message), has_more: hasMore, can_send: false, changes: [], change_cursor: '0' },
})
const currentIds = (ids: number[]) => ids.map(message)
function setVisibility(state: 'visible' | 'hidden') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  document.dispatchEvent(new Event('visibilitychange'))
}

function start(enabled = true) {
  const head = { id: 2, change: '0' }
  const onPage = vi.fn()
  const onAccessLost = vi.fn()
  const onExpiredCursor = vi.fn()
  const hook = renderHook(({ active }) => usePreviewChatUpdates({
    tripId: 1, enabled: active, head, onPage, onAccessLost, onExpiredCursor,
  }), { initialProps: { active: enabled } })
  return { ...hook, onPage, onAccessLost, onExpiredCursor }
}

beforeEach(() => {
  vi.useFakeTimers()
  get.mockReset().mockResolvedValue(page([]))
  sessionCurrent.mockReset().mockReturnValue(true)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('merges by confirmed server order, preserving older history and a locally acknowledged send', () => {
  const merged = mergeChatUpdates(currentIds([1, 2, 5, 7]), 2, currentIds([3, 4, 5, 6]))
  expect(merged.map(row => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7])
  expect(mergeChatUpdates(currentIds([5]), null, currentIds([3, 4, 5])).map(row => row.id))
    .toEqual([3, 4, 5])
})

it('redacts a quote when an older parent is trashed and ignores a stale removal after restore', () => {
  const reply = { ...message(6), reply_to: 1, reply_text: 'Message 1', reply_username: 'Organizer', reply_revision: 1 }
  const trashed = { ...message(1), revision: 2, text: '', _deleted: true }
  const restored = { ...message(1), revision: 3, _deleted: false }
  const removedParent = reconcileChatChanges([reply], [trashed])
  expect(removedParent).toEqual([{ ...reply, reply_text: null, reply_username: null, reply_revision: 2 }])
  const recovered = reconcileChatChanges(removedParent, [restored])
  expect(recovered).toEqual([{ ...reply, reply_revision: 3 }])
  expect(reconcileChatChanges(recovered, [trashed])).toEqual(recovered)
})

it('keeps a newer quote redaction when a reaction response arrives with an older quote', () => {
  const reply = { ...message(6), revision: 1, reply_to: 1, reply_text: null, reply_username: null, reply_revision: 2 }
  const reactions = [{ emoji: '👍', count: 1, users: [{ user_id: 2, username: 'Organizer' }], selected: true }]
  const reacted = { ...reply, revision: 2, reply_text: 'Message 1', reply_username: 'Organizer', reply_revision: 1, reactions }
  const updated = reconcileChatChanges([reply], [reacted])
  expect(updated).toEqual([{ ...reply, revision: 2, reactions }])
  expect(reconcileChatChanges(updated, [reply])).toEqual(updated)
})

it('drains the next page from the confirmed cursor and keeps it when switching back to Chat', async () => {
  const updated = page([3, 4], true)
  updated.data.change_cursor = '12'
  const caughtUp = page([5])
  caughtUp.data.change_cursor = '12'
  get.mockResolvedValueOnce(updated).mockResolvedValueOnce(caughtUp)
  const { onPage, rerender } = start()
  await act(async () => {})
  expect(get.mock.calls[0][1].params).toEqual({ after: 2, change: '0' })
  await act(async () => { await vi.advanceTimersByTimeAsync(250) })
  expect(get.mock.calls[1][1].params).toEqual({ after: 4, change: '12' })
  expect(onPage).toHaveBeenNthCalledWith(2, 4, caughtUp.data)
  rerender({ active: false })
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(get).toHaveBeenCalledTimes(2)
  rerender({ active: true })
  await act(async () => {})
  expect(get.mock.calls[2][1].params).toEqual({ after: 5, change: '12' })
})

it('aborts the background request, ignores its late reply and resumes from the same cursor', async () => {
  let resolvePage: (value: ReturnType<typeof page>) => void = () => {}
  get.mockReturnValueOnce(new Promise(resolve => { resolvePage = resolve }))
  const { onPage } = start()
  const signal = get.mock.calls[0][1].signal as AbortSignal
  act(() => setVisibility('hidden'))
  expect(signal.aborted).toBe(true)
  await act(async () => { resolvePage(page([3])) })
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(get).toHaveBeenCalledTimes(1)
  expect(onPage).not.toHaveBeenCalled()
  await act(async () => setVisibility('visible'))
  expect(get.mock.calls[1][1].params).toEqual({ after: 2, change: '0' })
})

it('backs off after an interrupted read and stops after the server revokes access', async () => {
  get.mockRejectedValueOnce(new Error('connection reset'))
    .mockRejectedValueOnce({ response: { status: 403 } })
  const { onPage, onAccessLost } = start()
  await act(async () => { await vi.advanceTimersByTimeAsync(9_999) })
  expect(get).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(get.mock.calls[1][1].params).toEqual({ after: 2, change: '0' })
  expect(onAccessLost).toHaveBeenCalledOnce()
  expect(onPage).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(get).toHaveBeenCalledTimes(2)
})
