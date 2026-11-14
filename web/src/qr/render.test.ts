// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { decodes, render, RenderError } from './render'
import { defaultStyle, type Logo, type Style } from './style'

const content = 'https://qarr.example/s/sommerfest?tisch=14'

/** An opaque block, which is the worst case any real picture can be. */
function block(side: number, fraction: number): Logo {
  const pixels = new Uint8ClampedArray(side * side * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 0x4b
    pixels[i + 1] = 0x28
    pixels[i + 2] = 0xc8
    pixels[i + 3] = 255
  }
  return { pixels, width: side, height: side, fraction, plate: true }
}

function styled(apply?: (s: Style) => void): Style {
  const style = defaultStyle()
  apply?.(style)
  return style
}

describe('render', () => {
  it.each(['L', 'M', 'Q', 'H'] as const)('draws a code at level %s that reads back', (level) => {
    const result = render(
      content,
      styled((s) => (s.level = level)),
    )
    expect(result.level).toBe(level)
    expect(result.adjusted).toEqual([])
    // The claim this module rests on, verified rather than assumed.
    expect(decodes(result, content)).toBe(true)
  })

  it.each([
    ['round modules', (s: Style) => (s.shape = 'round')],
    ['a transparent ground', (s: Style) => (s.background = '')],
    ['a coloured foreground', (s: Style) => (s.foreground = '#0f766e')],
    ['a wider quiet zone', (s: Style) => (s.quietZone = 8)],
    ['fewer pixels per module', (s: Style) => (s.modulePixels = 4)],
  ])('still reads back with %s', (_name, apply) => {
    const result = render(content, styled(apply))
    expect(decodes(result, content)).toBe(true)
  })

  it('carries a logo and the result still scans', () => {
    const result = render(
      content,
      styled((s) => (s.logo = block(256, 0.18))),
    )
    expect(result.logoFraction).toBeGreaterThan(0)
    expect(decodes(result, content)).toBe(true)
  })

  it('raises the error correction level for a logo the wished level cannot carry, and says so', () => {
    const result = render(
      content,
      styled((s) => {
        s.level = 'L'
        s.logo = block(256, 0.28)
      }),
    )
    expect(result.level).not.toBe('L')
    expect(result.adjusted.join('; ')).toContain('error correction')
    expect(decodes(result, content)).toBe(true)
  })

  it('shrinks a logo large enough that no level can carry it, and says so', () => {
    const result = render(
      content,
      styled((s) => (s.logo = block(256, 0.45))),
    )
    expect(result.logoFraction).toBeLessThan(0.45)
    expect(result.adjusted.join('; ')).toContain('shrunk')
    // What makes the shrink correct rather than a guess: the smaller logo
    // was itself drawn and decoded before it was handed back.
    expect(decodes(result, content)).toBe(true)
  })

  // Round modules do not touch, and in a finder pattern that stops a
  // decoder finding the code at all. This keeps someone from rounding them
  // in a later change.
  it('keeps the finder corners solid when the modules are round', () => {
    const style = styled((s) => (s.shape = 'round'))
    const result = render(content, style)

    const offset = style.quietZone * style.modulePixels
    const at = (offset * result.width + offset) * 4
    expect([result.pixels[at], result.pixels[at + 1], result.pixels[at + 2]]).toEqual([0, 0, 0])
  })

  it('reports a code that would not scan as not decoding, rather than passing it', () => {
    const result = render(content, defaultStyle())
    expect(decodes(result, content + 'x')).toBe(false)
  })
})

describe('refusals', () => {
  it('refuses empty content', () => {
    expect(() => render('', defaultStyle())).toThrow(RenderError)
  })

  it('refuses colours a scanner cannot tell apart, with the ratio', () => {
    expect(() =>
      render(
        content,
        styled((s) => (s.foreground = '#2dd4bf')),
      ),
    ).toThrow(/contrast/)
  })

  it('refuses a quiet zone below what the standard asks for', () => {
    expect(() =>
      render(
        content,
        styled((s) => (s.quietZone = 1)),
      ),
    ).toThrow(/quietZone/)
  })
})
