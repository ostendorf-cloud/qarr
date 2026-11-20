// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * What the render loop does once every repair has been tried and the code
 * still does not read back: it reports the code rather than handing one
 * out that looks right and is not. jsQR is mocked here so the outcome does
 * not depend on exactly how large a logo a real decoder happens to tolerate
 * at level H; that boundary is already exercised, with a real decoder, in
 * render.test.ts.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('jsqr', () => ({ default: () => null }))

import { render, RenderError } from './render'
import { defaultStyle, type Logo } from './style'

const content = 'https://qarr.example/s/sommerfest'

describe('render, once nothing it draws reads back', () => {
  it('reports the code rather than returning one, with no logo involved', () => {
    expect(() => render(content, defaultStyle())).toThrow(RenderError)
    expect(() => render(content, defaultStyle())).toThrow(/does not read back/)
  })

  it('never raises a code past the level its kind fixes, and says so', () => {
    const attempt = () => render(content, defaultStyle(), 'M')

    expect(attempt).toThrow(RenderError)
    expect(attempt).toThrow(/does not read back at level M, which this kind of code requires/)
    expect(attempt).not.toThrow(/level [QH]/)
  })

  it('says the logo was already at its smallest when that repair runs out too', () => {
    const side = 64
    const logo: Logo = {
      pixels: new Uint8ClampedArray(side * side * 4),
      width: side,
      height: side,
      fraction: 0.2,
      plate: true,
    }
    const style = defaultStyle()
    style.logo = logo

    expect(() => render(content, style)).toThrow(/even with the logo at its smallest/)
  })
})
