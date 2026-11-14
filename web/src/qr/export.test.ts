// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'

import { png, svg, toCanvas } from './export'
import type { Matrix } from './matrix'
import { render } from './render'
import { defaultStyle, type Style } from './style'

const content = 'https://qarr.example/s/sommerfest'

function drawn(apply?: (s: Style) => void) {
  const style = defaultStyle()
  apply?.(style)
  return { result: render(content, style), style }
}

/**
 * Reads back which modules the SVG itself drew dark, by walking the shapes
 * inside its one `<g>` group rather than trusting the generator's own
 * coordinates: the background rect and a logo's plate rect sit outside that
 * group, so only module shapes are counted.
 */
function darkModulesInSvg(svgOut: string, size: number, quietZone: number): boolean[][] {
  const grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const group = new DOMParser().parseFromString(svgOut, 'image/svg+xml').querySelector('g')
  if (!group) return grid
  for (const shape of Array.from(group.children)) {
    if (shape.tagName === 'rect') {
      const x = Number(shape.getAttribute('x')) - quietZone
      const y = Number(shape.getAttribute('y')) - quietZone
      grid[y][x] = true
    } else if (shape.tagName === 'circle') {
      const x = Number(shape.getAttribute('cx')) - 0.5 - quietZone
      const y = Number(shape.getAttribute('cy')) - 0.5 - quietZone
      grid[y][x] = true
    }
  }
  return grid
}

function expectSvgMatchesMatrix(svgOut: string, matrix: Matrix, quietZone: number) {
  const grid = darkModulesInSvg(svgOut, matrix.size, quietZone)
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      expect(grid[y][x]).toBe(matrix.dark(x, y))
    }
  }
}

describe('svg', () => {
  it('is well formed and covers every dark module exactly once', () => {
    const { result, style } = drawn()
    const out = svg(result, style, null)

    expect(out).toContain('<svg ')
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(out).toContain('</svg>')

    let dark = 0
    for (let y = 0; y < result.matrix.size; y++) {
      for (let x = 0; x < result.matrix.size; x++) if (result.matrix.dark(x, y)) dark++
    }
    // One shape per dark module, plus the one rect that is the ground.
    const shapes = (out.match(/<rect/g) ?? []).length + (out.match(/<circle/g) ?? []).length
    expect(shapes - 1).toBe(dark)
  })

  it('keeps the finder corners square when the modules are round', () => {
    const { result, style } = drawn((s) => (s.shape = 'round'))
    const out = svg(result, style, null)

    expect(out).toContain('<circle')
    // The ground plus the three finder patterns.
    expect((out.match(/<rect/g) ?? []).length).toBeGreaterThan(1)
  })

  it('agrees, cell by cell, with the matrix the decode check already ran on', () => {
    const { result, style } = drawn()
    const out = svg(result, style, null)

    expectSvgMatchesMatrix(out, result.matrix, style.quietZone)
  })

  it('agrees, cell by cell, with the matrix the decode check ran on when the modules are round', () => {
    const { result, style } = drawn((s) => (s.shape = 'round'))
    const out = svg(result, style, null)

    expectSvgMatchesMatrix(out, result.matrix, style.quietZone)
  })

  it('leaves the logo out when there is no picture to embed', () => {
    const { result, style } = drawn()
    expect(svg(result, style, null)).not.toContain('<image')
  })

  it('embeds the logo as the picture that was actually verified', () => {
    const side = 8
    const logo = {
      pixels: new Uint8ClampedArray(side * side * 4),
      width: side,
      height: side,
      fraction: 0.2,
      plate: true,
    }
    const { result, style } = drawn((s) => (s.logo = logo))
    const out = svg(result, style, 'data:image/png;base64,AA==')

    expect(out).toContain('<image')
    expect(out).toContain('data:image/png;base64,AA==')
  })

  it('omits the background rectangle for a transparent code', () => {
    const { result, style } = drawn((s) => (s.background = ''))
    expect(svg(result, style, null)).not.toMatch(/<rect width="\d+" height="\d+" fill=/)
  })
})

describe('toCanvas and png', () => {
  it('writes the drawn pixels onto a canvas of the same size', () => {
    const { result } = drawn()
    const putImageData = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData,
    } as unknown as CanvasRenderingContext2D)

    const canvas = toCanvas(result)

    expect(canvas.width).toBe(result.width)
    expect(canvas.height).toBe(result.height)
    expect(putImageData).toHaveBeenCalledOnce()

    vi.restoreAllMocks()
  })

  it('refuses to draw when the browser gives no 2d context', () => {
    const { result } = drawn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    expect(() => toCanvas(result)).toThrow(/2d context/)

    vi.restoreAllMocks()
  })

  it('encodes the canvas as a png blob', async () => {
    const { result } = drawn()
    const blob = new Blob(['x'], { type: 'image/png' })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(blob)
    })

    await expect(png(result)).resolves.toBe(blob)

    vi.restoreAllMocks()
  })

  it('rejects when the browser cannot encode a png', async () => {
    const { result } = drawn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(null)
    })

    await expect(png(result)).rejects.toThrow(/could not encode/)

    vi.restoreAllMocks()
  })
})
