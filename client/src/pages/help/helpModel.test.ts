import { describe, expect, it } from 'vitest'
import { asHelpPage, asHelpSections } from './helpModel'

describe('helpModel', () => {
  it('ignores SPA HTML and missing sections so Help cannot crash the shell', () => {
    expect(asHelpSections(undefined)).toEqual([])
    expect(asHelpSections('<!DOCTYPE html>')).toEqual([])
    expect(asHelpSections({ sections: [] })).toEqual([])
    expect(asHelpPage('<!DOCTYPE html>')).toBeNull()
    expect(asHelpPage(undefined)).toBeNull()
    expect(asHelpPage({ slug: 'Home' })).toBeNull()
  })

  it('accepts a wiki page object', () => {
    expect(asHelpPage({ slug: 'Home', title: 'Home', markdown: '# Hi' })).toEqual({
      slug: 'Home',
      title: 'Home',
      markdown: '# Hi',
    })
  })
})
