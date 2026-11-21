import { beforeEach, describe, expect, it } from 'vitest'
import { builtinEffectiveMapSettings, type EffectiveMapSettings } from './familyMaps'
import {
  clearFamilyMapSnapshot,
  familyMapSnapshotKey,
  readFamilyMapSnapshot,
  writeFamilyMapSnapshot,
} from './familyMapSnapshot'

describe('family map snapshot', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips a versioned family/person snapshot', () => {
    const settings: EffectiveMapSettings = {
      ...builtinEffectiveMapSettings('fam-1', 'p-1'),
      enabledOptionIds: ['osm', 'osm-de'],
      defaultOptionId: 'osm',
      selectedOptionId: 'osm-de',
      effectiveOptionId: 'osm-de',
      source: 'member',
    }
    writeFamilyMapSnapshot(settings)
    expect(readFamilyMapSnapshot('fam-1', 'p-1')?.effectiveOptionId).toBe('osm-de')
    expect(readFamilyMapSnapshot('fam-2', 'p-1')).toBeNull()
    expect(readFamilyMapSnapshot('fam-1', 'p-2')).toBeNull()
  })

  it('ignores a corrupt or version-mismatched cache', () => {
    localStorage.setItem(familyMapSnapshotKey('fam-1', 'p-1'), '{not-json')
    expect(readFamilyMapSnapshot('fam-1', 'p-1')).toBeNull()
    localStorage.setItem(familyMapSnapshotKey('fam-1', 'p-1'), JSON.stringify({
      v: 99,
      familyId: 'fam-1',
      personId: 'p-1',
      payload: { effective_option_id: 'osm' },
    }))
    expect(readFamilyMapSnapshot('fam-1', 'p-1')).toBeNull()
    clearFamilyMapSnapshot('fam-1', 'p-1')
    expect(readFamilyMapSnapshot('fam-1', 'p-1')).toBeNull()
  })
})
