import { describe, expect, it } from 'vitest'
import en from '@trek/shared/i18n/en'
import es from '@trek/shared/i18n/es'
import { eventLabelKey } from './familyNotificationsModel'

describe('familyNotificationsModel', () => {
  it('maps event keys to Admin i18n and has EN/ES copy', () => {
    const key = eventLabelKey('proposal.created')
    expect(en[key]).toMatch(/proposal/i)
    expect(es[key]).toBeTruthy()
    expect(en['notifications.event.access.request.submitted.title']).toBeTruthy()
    expect(es['notifications.event.access.request.submitted.title']).toBeTruthy()
  })
})
