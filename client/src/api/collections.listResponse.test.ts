import { describe, expect, it } from 'vitest'
import { collectionsFromListResponse } from './collections'

describe('collectionsFromListResponse', () => {
  it('returns [] for SPA HTML, missing, or non-array collections', () => {
    expect(collectionsFromListResponse('<!DOCTYPE html>')).toEqual([])
    expect(collectionsFromListResponse(undefined)).toEqual([])
    expect(collectionsFromListResponse({})).toEqual([])
    expect(collectionsFromListResponse({ collections: null })).toEqual([])
  })

  it('passes through a collections array', () => {
    const lists = [{ id: 1, owner_id: 1, name: 'Saved' }]
    expect(collectionsFromListResponse({ collections: lists })).toEqual(lists)
  })
})
