// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { checkContrast, defaultStyle, moduleColour, parseHex, validate, type Style } from './style'

function styled(apply?: (s: Style) => void): Style {
  const style = defaultStyle()
  apply?.(style)
  return style
}

describe('parseHex', () => {
  it('reads a six digit hex colour', () => {
    expect(parseHex('#336699')).toEqual({ r: 0x33, g: 0x66, b: 0x99 })
  })

  it('expands a three digit hex colour', () => {
    expect(parseHex('#369')).toEqual({ r: 0x33, g: 0x66, b: 0x99 })
  })

  it('refuses anything without a leading hash', () => {
    expect(parseHex('336699')).toBeNull()
  })

  it('refuses a value that is not hexadecimal', () => {
    expect(parseHex('#zzzzzz')).toBeNull()
  })

  it('refuses the empty string', () => {
    expect(parseHex('')).toBeNull()
  })
})

describe('validate', () => {
  it('accepts the defaults', () => {
    expect(validate(defaultStyle())).toBeNull()
  })

  it('refuses a foreground that is not a colour, naming the field', () => {
    expect(validate(styled((s) => (s.foreground = 'red')))).toMatch(/foreground/)
  })

  it('refuses a quiet zone narrower than the standard asks for', () => {
    expect(validate(styled((s) => (s.quietZone = 1)))).toMatch(/quietZone/)
  })

  it('refuses a logo fraction outside the range a logo can cover', () => {
    const side = 4
    const logo = {
      pixels: new Uint8ClampedArray(side * side * 4),
      width: side,
      height: side,
      fraction: 0.9,
      plate: true,
    }
    expect(validate(styled((s) => (s.logo = logo)))).toMatch(/logo must cover/)
  })
})

describe('checkContrast', () => {
  it('accepts black on white', () => {
    expect(checkContrast(defaultStyle())).toBeNull()
  })

  it('refuses a foreground a scanner cannot tell apart from the ground, with the ratio', () => {
    expect(checkContrast(styled((s) => (s.foreground = '#2dd4bf')))).toMatch(/contrast/)
  })

  it('judges a transparent background against white', () => {
    const problem = checkContrast(
      styled((s) => {
        s.background = ''
        s.foreground = '#cccccc'
      }),
    )
    expect(problem).toMatch(/white/)
  })

  it('refuses a background that is not a colour', () => {
    expect(checkContrast(styled((s) => (s.background = 'papayawhip')))).toMatch(/background/)
  })
})

describe('moduleColour', () => {
  it('reads the foreground as bytes', () => {
    expect(moduleColour(styled((s) => (s.foreground = '#112233')))).toEqual({
      r: 0x11,
      g: 0x22,
      b: 0x33,
    })
  })

  it('falls back to black for a foreground that cannot be parsed', () => {
    expect(moduleColour(styled((s) => (s.foreground = 'not-a-colour')))).toEqual({
      r: 0,
      g: 0,
      b: 0,
    })
  })
})
