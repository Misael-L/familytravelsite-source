import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { getPublicJourney } = vi.hoisted(() => ({
  getPublicJourney: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  journeyApi: { getPublicJourney },
}))

vi.mock('../../data/supabase/auth', () => ({
  isSupabaseDataPlane: () => true,
}))

vi.mock('../../store/settingsStore', () => ({
  useSettingsStore: (sel: (s: { settings: { language: string } }) => unknown) =>
    sel({ settings: { language: 'en' } }),
}))

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
  useJourneyCompactLayout: () => false,
  JOURNEY_COMPACT_MAX_PX: 767,
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: 'family-share-token' }),
}))

import { useJourneyPublic } from './useJourneyPublic'

function Probe() {
  const { error, loading } = useJourneyPublic()
  if (loading) return <div>loading</div>
  return <div>{error ? 'unavailable' : 'ok'}</div>
}

describe('useJourneyPublic Family plane', () => {
  it('fail-closes public share without calling Nest', async () => {
    render(<Probe />)
    expect(await screen.findByText('unavailable')).toBeInTheDocument()
    expect(getPublicJourney).not.toHaveBeenCalled()
  })
})
