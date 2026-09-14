import { afterEach, describe, expect, it } from 'vitest'
import { clearChunkReloadMarker, isChunkLoadError, reloadOnceForChunk } from './chunkReload'

afterEach(() => {
  sessionStorage.clear()
})

describe('chunkReload', () => {
  it('recognises Vite and browser chunk-load wording', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
  })

  it('reloads once per session then refuses a loop', () => {
    expect(reloadOnceForChunk()).toBe(true)
    expect(sessionStorage.getItem('trek:chunk-reload')).toBeTruthy()
    expect(reloadOnceForChunk()).toBe(false)

    clearChunkReloadMarker()
    expect(sessionStorage.getItem('trek:chunk-reload')).toBeNull()
    expect(reloadOnceForChunk()).toBe(true)
  })
})
