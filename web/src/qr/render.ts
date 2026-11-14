// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * Drawing a code in the browser and reading it back before it is shown.
 *
 * This is the whole reason the page needs no server: the content is
 * encoded, drawn and checked in the tab it was typed into, and nothing here
 * sends a byte of it anywhere. See docs/adr/0001.
 *
 * Everything works on a plain RGBA buffer rather than on a canvas. That is
 * what jsQR takes, so the decode check needs no DOM, and the whole pipeline
 * is testable without a canvas implementation. jsQR is the pure JavaScript
 * decoder this app settled on for exactly that reason: no WebAssembly build
 * to load, no worker to set up, a module small enough that the budget is the
 * draw-time check alone rather than a whole scanning UI. The measured cost
 * of both libraries together is recorded in AGENTS.md.
 */

import jsQR from 'jsqr'

import { encode, inFinder, LEVELS, type Level, type Matrix } from './matrix'
import {
  checkContrast,
  MAX_FRACTION,
  MIN_FRACTION,
  moduleColour,
  parseHex,
  plateColour,
  validate,
  type Rgb,
  type Style,
} from './style'

/** A drawn code as raw pixels, with what the repair had to change. */
export interface Result {
  pixels: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
  matrix: Matrix
  /** The level it was finally encoded at, which may be above the wish. */
  level: Level
  /** The share of the edge the logo finally covers. Zero without one. */
  logoFraction: number
  /**
   * What the repair changed, in plain words. Empty when the wish was met.
   * The page shows it rather than hiding it: somebody who asked for a big
   * logo should learn that it was shrunk.
   */
  adjusted: string[]
}

export class RenderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RenderError'
  }
}

/** A bare RGBA buffer with the two numbers that give it a shape. */
interface Canvas {
  pixels: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

function blank(width: number, height: number): Canvas {
  // A zeroed buffer is fully transparent, which is what an empty ground is.
  return { pixels: new Uint8ClampedArray(width * height * 4), width, height }
}

function fill(canvas: Canvas, x0: number, y0: number, w: number, h: number, c: Rgb, alpha = 255) {
  for (let y = y0; y < y0 + h; y++) {
    if (y < 0 || y >= canvas.height) continue
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || x >= canvas.width) continue
      const at = (y * canvas.width + x) * 4
      canvas.pixels[at] = c.r
      canvas.pixels[at + 1] = c.g
      canvas.pixels[at + 2] = c.b
      canvas.pixels[at + 3] = alpha
    }
  }
}

/** A circle inscribed in one module's square. */
function disc(canvas: Canvas, x0: number, y0: number, size: number, c: Rgb) {
  const radius = size / 2
  const centre = radius - 0.5
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = dx - centre
      const y = dy - centre
      if (x * x + y * y <= radius * radius) fill(canvas, x0 + dx, y0 + dy, 1, 1, c)
    }
  }
}

/**
 * Scales a logo into the square and draws it over what is there, keeping the
 * aspect ratio so a wide picture is letterboxed rather than stretched.
 *
 * Nearest neighbour: the logo is already small on screen, the difference
 * from a smooth filter is invisible at this size, and a filter would cost a
 * dependency or a lot of code for nothing.
 */
function drawLogo(canvas: Canvas, style: Style, matrix: Matrix, fraction: number) {
  const logo = style.logo
  if (!logo || fraction <= 0) return

  const codePixels = matrix.size * style.modulePixels
  let modules = Math.floor((codePixels * fraction) / style.modulePixels)
  if (modules < 1) return
  // An odd count centres exactly on a matrix whose size is always odd.
  if (modules % 2 !== matrix.size % 2) modules++

  const side = modules * style.modulePixels
  const offset = style.quietZone * style.modulePixels
  const start = offset + Math.floor((codePixels - side) / 2)

  if (logo.plate) {
    // The plate is the background where there is one, and white where the
    // code is transparent: line art needs something opaque under it either way.
    // plateColour lives in style.ts so the SVG export resolves the same
    // fallback the same way.
    fill(canvas, start, start, side, side, plateColour(style))
  }

  // The target rectangle inside the square, after the aspect ratio is kept.
  let targetW = side
  let targetH = side
  if (logo.width > logo.height) targetH = Math.round((side * logo.height) / logo.width)
  else if (logo.height > logo.width) targetW = Math.round((side * logo.width) / logo.height)
  const padX = Math.floor((side - targetW) / 2)
  const padY = Math.floor((side - targetH) / 2)

  for (let y = 0; y < targetH; y++) {
    const sourceY = Math.min(logo.height - 1, Math.floor((y * logo.height) / targetH))
    for (let x = 0; x < targetW; x++) {
      const sourceX = Math.min(logo.width - 1, Math.floor((x * logo.width) / targetW))
      const from = (sourceY * logo.width + sourceX) * 4
      const alpha = logo.pixels[from + 3]
      if (alpha === 0) continue
      fill(
        canvas,
        start + padX + x,
        start + padY + y,
        1,
        1,
        { r: logo.pixels[from], g: logo.pixels[from + 1], b: logo.pixels[from + 2] },
        alpha,
      )
    }
  }
}

/**
 * Draws a matrix at the given style, asking no questions about whether the
 * result still scans. That is what render is for.
 */
function paint(matrix: Matrix, style: Style, fraction: number): Canvas {
  const side = (matrix.size + 2 * style.quietZone) * style.modulePixels
  const canvas = blank(side, side)

  if (style.background) {
    const bg = parseHex(style.background)
    if (bg) fill(canvas, 0, 0, side, side, bg)
  }

  const offset = style.quietZone * style.modulePixels
  const colour = moduleColour(style)
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.dark(x, y)) continue
      const px = offset + x * style.modulePixels
      const py = offset + y * style.modulePixels
      // Round modules do not touch their neighbours, which is the whole
      // look, and in the three finder patterns that is fatal: they are the
      // squares a decoder locates the code by. So the corners stay solid.
      if (style.shape === 'round' && !inFinder(matrix.size, x, y)) {
        disc(canvas, px, py, style.modulePixels, colour)
      } else {
        fill(canvas, px, py, style.modulePixels, style.modulePixels, colour)
      }
    }
  }

  drawLogo(canvas, style, matrix, fraction)
  return canvas
}

/**
 * Reports whether a buffer reads back as exactly the string it was made
 * from. A decode that succeeds but returns something else counts as a
 * failure: handing out a code that says the wrong thing is worse than one
 * that says nothing.
 */
export function decodes(canvas: Canvas, content: string): boolean {
  const flat = flatten(canvas)
  const found = jsQR(flat.pixels, flat.width, flat.height)
  return found !== null && found.data === content
}

/**
 * Puts the picture on white before it is decoded. A transparent background
 * is a real option, and a decoder reading raw alpha sees a dark module and a
 * transparent one as equally dark, which would pass a code that is in fact
 * invisible on paper.
 */
function flatten(canvas: Canvas): Canvas {
  const out = blank(canvas.width, canvas.height)
  for (let i = 0; i < canvas.pixels.length; i += 4) {
    const alpha = canvas.pixels[i + 3] / 255
    out.pixels[i] = Math.round(canvas.pixels[i] * alpha + 255 * (1 - alpha))
    out.pixels[i + 1] = Math.round(canvas.pixels[i + 1] * alpha + 255 * (1 - alpha))
    out.pixels[i + 2] = Math.round(canvas.pixels[i + 2] * alpha + 255 * (1 - alpha))
    out.pixels[i + 3] = 255
  }
  return out
}

function nextLevel(level: Level): Level | null {
  const at = LEVELS.indexOf(level)
  return at >= 0 && at + 1 < LEVELS.length ? LEVELS[at + 1] : null
}

/**
 * Encodes content, draws it and checks it reads back. When it does not, the
 * error correction is raised first, which costs nothing a reader can see,
 * and the logo shrunk second, which does. When neither repair is left to try
 * and the code still does not scan, this throws rather than handing out a
 * code that looks right and is not: that is the decode check this issue
 * exists for, and what makes "it was chosen and verified" true rather than
 * assumed.
 */
export function render(content: string, style: Style): Result {
  if (content === '') throw new RenderError('nothing to encode')

  const invalid = validate(style)
  if (invalid) throw new RenderError(invalid)

  // Before anything is drawn: colours that do not stand out cannot be
  // repaired by a higher level or a smaller logo, and finding that out by
  // exhausting the loop produces a guess instead of a reason.
  const unreadable = checkContrast(style)
  if (unreadable) throw new RenderError(unreadable)

  let level = style.level
  let fraction = style.logo ? style.logo.fraction : 0
  const adjusted: string[] = []

  if (fraction > 0) {
    while (fraction > MAX_FRACTION[level]) {
      const up = nextLevel(level)
      if (!up) break
      level = up
    }
    if (fraction > MAX_FRACTION[level]) {
      adjusted.push(
        `the logo was shrunk from ${pct(fraction)} to ${pct(MAX_FRACTION[level])} of the code, ` +
          `which is what level ${level} carries`,
      )
      fraction = MAX_FRACTION[level]
    } else if (level !== style.level) {
      adjusted.push(
        `the error correction was raised from ${style.level} to ${level} ` +
          `to carry a logo of ${pct(fraction)}`,
      )
    }
  }

  for (;;) {
    const matrix = encode(content, level)
    const canvas = paint(matrix, style, fraction)

    if (decodes(canvas, content)) {
      return { ...canvas, matrix, level, logoFraction: fraction, adjusted }
    }

    const up = nextLevel(level)
    if (up) {
      level = up
      adjusted.push(
        `the error correction was raised to ${level} because the code did not read back`,
      )
      continue
    }
    if (fraction > MIN_FRACTION) {
      fraction = Math.max(MIN_FRACTION, fraction - 0.02)
      adjusted.push(`the logo was shrunk to ${pct(fraction)} because the code did not read back`)
      continue
    }
    throw new RenderError(
      fraction > 0
        ? `the code does not read back at level ${level} even with the logo at its smallest`
        : `the code does not read back at level ${level}`,
    )
  }
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}
