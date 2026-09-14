import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TranslationProvider } from '../i18n'
import PwaLifecycle from './PwaLifecycle'
import { updateServiceWorker, useRegisterSW } from '../../tests/mocks/virtual-pwa-register-react'

describe('PwaLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    })
  })

  it('does not auto-reload when a waiting worker is ready', async () => {
    useRegisterSW.mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    })
    render(
      <TranslationProvider>
        <PwaLifecycle />
      </TranslationProvider>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(updateServiceWorker).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button'))
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('surfaces an offline-ready notice that can be dismissed', async () => {
    useRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [true, vi.fn()],
      updateServiceWorker,
    })
    render(
      <TranslationProvider>
        <PwaLifecycle />
      </TranslationProvider>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(updateServiceWorker).not.toHaveBeenCalled()
  })
})
