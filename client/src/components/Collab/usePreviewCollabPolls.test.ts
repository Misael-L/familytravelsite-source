import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CollabPollData } from './collabModel'
import { usePreviewCollabPolls } from './usePreviewCollabPolls'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get, post } }))
vi.mock('../../sync/readSession', () => ({ captureReadSession: () => ({ contextCurrent: () => true }) }))

function poll(revision: number, selected = false): CollabPollData {
  return {
    id: 8, trip_id: 3, user_id: 5, question: 'First stop?', deadline: null, username: 'Organizer',
    avatar: null, avatar_url: null, created_at: '2026-11-22T10:02:00.000Z',
    multiple_choice: false, is_closed: false, revision,
    total_votes: selected ? 1 : 0,
    options: [{ text: 'Museum', label: 'Museum', voters: [], selected }],
  }
}
const board = (completed: CollabPollData) => ({ data: { polls: [completed], canEdit: true, trash: [] } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  get.mockReset().mockResolvedValue(board(poll(1)))
  post.mockReset().mockResolvedValue({ data: { poll: poll(2, true) } })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('keeps a confirmed vote when an older board response arrives after it', async () => {
  let respond: (data: ReturnType<typeof board>) => void = () => {}
  get.mockResolvedValueOnce(board(poll(1)))
    .mockReturnValueOnce(new Promise(resolve => { respond = resolve }))
  const report = vi.fn()
  const { result } = renderHook(() => usePreviewCollabPolls(3, true, report))
  await act(async () => {})
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(get).toHaveBeenCalledTimes(2)
  await act(async () => { await result.current.votePoll(8, 0) })
  await act(async () => { respond(board(poll(1))) })
  expect(result.current.polls).toEqual([poll(2, true)])
  expect(report).not.toHaveBeenCalled()
})

it('retries an uncertain vote with its original revision after a refresh observes its result', async () => {
  post.mockRejectedValueOnce(new Error('Connection ended'))
  const report = vi.fn()
  const { result } = renderHook(() => usePreviewCollabPolls(3, true, report))
  await act(async () => {})
  await act(async () => { await result.current.votePoll(8, 0) })
  expect(report).toHaveBeenCalledOnce()
  get.mockResolvedValueOnce(board(poll(2, true)))
  await act(async () => { result.current.refresh() })
  expect(result.current.polls).toEqual([poll(2, true)])
  await act(async () => { await result.current.votePoll(8, 0) })
  expect(post.mock.calls[1]).toEqual(post.mock.calls[0])
  expect(result.current.polls).toEqual([poll(2, true)])
})
