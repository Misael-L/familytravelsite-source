import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { usePreviewChatSend } from './usePreviewChatSend'

const { post, multipart } = vi.hoisted(() => ({ post: vi.fn(), multipart: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { post }, postMultipart: multipart }))
vi.mock('../../sync/readSession', () => ({ captureReadSession: () => ({ contextCurrent: () => true }) }))

it('keeps the actual image file and operation ID when a caption-free draft is retried', async () => {
  const file = new File(['example'], 'photo.png', { type: 'image/png' })
  const saved = { message: { id: 20 } }
  multipart.mockRejectedValueOnce(new Error('The response ended')).mockResolvedValueOnce(saved)
  const { result } = renderHook(() => usePreviewChatSend(5))

  await expect(result.current.sendPreviewDraft('', 3, [file])).rejects.toThrow('The response ended')
  const [firstPath, first] = multipart.mock.calls[0] as [string, FormData]
  expect(first.get('file')).toBe(file)
  expect(first.get('text')).toBe('')
  expect(first.get('replyTo')).toBe('3')

  await expect(result.current.sendPreviewDraft('', 3, [file])).resolves.toBe(saved)
  const [secondPath, second] = multipart.mock.calls[1] as [string, FormData]
  expect(firstPath).toBe('/trips/5/family/collab/messages')
  expect(secondPath).toBe(firstPath)
  expect(second.get('operationId')).toBe(first.get('operationId'))
  expect(second.get('file')).toBe(file)
  expect(post).not.toHaveBeenCalled()
})
