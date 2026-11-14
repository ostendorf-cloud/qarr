// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * Turning a drawn code into a file the visitor can keep: a raster for a
 * screen and a vector for anything printed at a size nobody chose yet.
 *
 * Everything happens in the tab. Nothing here uploads, and nothing here
 * asks a server to draw: that is the whole point of rendering in the
 * browser.
 */

import { inFinder, type Matrix } from './matrix'
import type { Result } from './render'
import { plateColour, toHex, type Style } from './style'

/**
 * Draws the matrix as vectors, so the code scales to a banner without
 * softening. One module is one user unit.
 *
 * This is a second drawing of the grid, not a trace of the raster the decode
 * check ran on: a vector shape and a pixel buffer have no code to share.
 * `export.test.ts` is what keeps the two from drifting apart: it walks this
 * function's own shapes and compares every cell against the same matrix,
 * module by module, so a divergence fails a test instead of shipping.
 * Rasterising this SVG and decoding it with jsQR would verify the actual
 * file rather than the grid it was built from, which is the stronger check,
 * but there is no tool to rasterise an SVG in this project's test
 * environment, so that check is not attempted here.
 *
 * The logo is embedded as a raster even here: the picture that was verified
 * is the raster one, and inlining a different drawing would hand out a code
 * nobody decoded.
 */
export function svg(result: Result, style: Style, logoDataUrl: string | null): string {
  const size = result.matrix.size
  const side = size + 2 * style.quietZone
  const lines: string[] = []

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" ` +
      `width="${side}" height="${side}" shape-rendering="crispEdges" role="img">`,
  )
  if (style.background) {
    lines.push(`  <rect width="${side}" height="${side}" fill="${style.background}"/>`)
  }

  lines.push(`  <g fill="${style.foreground}">`)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!result.matrix.dark(x, y)) continue
      const px = x + style.quietZone
      const py = y + style.quietZone
      // The finder corners stay square whatever the shape is, for the same
      // reason the raster draws them that way.
      if (style.shape === 'round' && !inFinder(size, x, y)) {
        lines.push(`    <circle cx="${px + 0.5}" cy="${py + 0.5}" r="0.5"/>`)
      } else {
        lines.push(`    <rect x="${px}" y="${py}" width="1" height="1"/>`)
      }
    }
  }
  lines.push('  </g>')

  if (style.logo && logoDataUrl && result.logoFraction > 0) {
    lines.push(logoElement(result.matrix, style, result.logoFraction, logoDataUrl))
  }

  lines.push('</svg>')
  return lines.join('\n') + '\n'
}

function logoElement(matrix: Matrix, style: Style, fraction: number, dataUrl: string): string {
  const size = matrix.size
  let modules = Math.floor(size * fraction)
  if (modules < 1) return ''
  if (modules % 2 !== size % 2) modules++
  const start = style.quietZone + (size - modules) / 2

  const parts: string[] = []
  if (style.logo?.plate) {
    // plateColour lives in style.ts so the canvas draw resolves the same
    // background-or-white fallback the same way.
    const plate = toHex(plateColour(style))
    parts.push(
      `  <rect x="${start}" y="${start}" width="${modules}" height="${modules}" fill="${plate}"/>`,
    )
  }
  parts.push(
    `  <image x="${start}" y="${start}" width="${modules}" height="${modules}" ` +
      `preserveAspectRatio="xMidYMid meet" href="${dataUrl}"/>`,
  )
  return parts.join('\n')
}

/**
 * Puts the drawn pixels on a canvas, which is the only way a browser turns
 * a buffer into a PNG. It is the one function here that needs a DOM.
 */
export function toCanvas(result: Result): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = result.width
  canvas.height = result.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('this browser gave no 2d context')
  context.putImageData(new ImageData(result.pixels, result.width, result.height), 0, 0)
  return canvas
}

/** The drawn code as a PNG file, encoded by the browser. */
export async function png(result: Result): Promise<Blob> {
  const canvas = toCanvas(result)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('this browser could not encode a png'))
    }, 'image/png')
  })
}
