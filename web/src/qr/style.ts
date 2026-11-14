// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * What a drawn code looks like, apart from what it says: the user's own
 * colours, module shape and logo, plus the thresholds that keep a chosen
 * style readable by a scanner.
 */

import { ratio } from '../theme/contrast'
import type { Level } from './matrix'

/** How a single dark module is drawn. */
export type Shape = 'square' | 'round'

/** A picture for the middle, as raw pixels. */
export interface Logo {
  /** RGBA, four bytes per pixel, as a canvas hands them out. */
  pixels: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
  /**
   * The share of the code's edge the logo spans. A wish, not a promise: the
   * repair lowers it when the result stops decoding, and says so.
   */
  fraction: number
  /**
   * An opaque rectangle under the picture. Line art needs it or the strokes
   * disappear into the pattern; a filled shape does not.
   */
  plate: boolean
}

export interface Style {
  level: Level
  shape: Shape
  /** The colour of a dark module, as #rrggbb. */
  foreground: string
  /** The colour behind the code. '' is transparent. */
  background: string
  /** The empty margin in modules. The standard asks for four. */
  quietZone: number
  /** Pixels per module in a raster. */
  modulePixels: number
  logo: Logo | null
}

/** A code that scans everywhere: black on white, square, the standard margin. */
export function defaultStyle(): Style {
  return {
    level: 'M',
    shape: 'square',
    foreground: '#000000',
    background: '#ffffff',
    quietZone: 4,
    modulePixels: 8,
    logo: null,
  }
}

/**
 * The largest share of the code's edge a logo may cover at each level,
 * chosen together with that level rather than on its own: the error
 * correction a level carries is what the modules a logo covers are allowed
 * to cost. The render loop still verifies the result by decoding it, because
 * a number chosen ahead of drawing is a starting point, not a guarantee.
 */
export const MAX_FRACTION: Record<Level, number> = {
  L: 0.12,
  M: 0.2,
  Q: 0.25,
  H: 0.3,
}

/** Where shrinking stops. Smaller than this is not a logo any more. */
export const MIN_FRACTION = 0.08

/**
 * How far a module has to stand out from the ground behind it.
 *
 * This is not a scanner-specific number. It is WCAG 2.2's non-text minimum,
 * the same 3:1 as `theme/contrast.ts`'s `NON_TEXT_MINIMUM`, reused here as a
 * conservative stand-in because it is the nearest sourced floor available.
 * It says two colours are distinguishable to a person, not that a decoder's
 * binarisation clears some threshold of its own: ISO/IEC 18004 measures that
 * side with a print contrast signal, a reflectance difference rather than a
 * luminance ratio, so it is a different metric and not a number this ratio
 * can borrow. A style that passes this check can still fail on printed
 * paper; the decode check after drawing is what actually proves a result.
 */
export const MIN_CONTRAST = 3

export interface Rgb {
  r: number
  g: number
  b: number
}

/** What a transparent or unparsable ground falls back to. */
export const white: Rgb = { r: 0xff, g: 0xff, b: 0xff }

/**
 * Reads #rgb or #rrggbb. Returns null rather than throwing: a colour arrives
 * from an input field and is wrong while somebody is still typing it.
 */
export function parseHex(value: string): Rgb | null {
  if (!value.startsWith('#')) return null
  const text = value.slice(1)
  const expand =
    text.length === 3 ? text[0] + text[0] + text[1] + text[1] + text[2] + text[2] : text
  if (expand.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(expand)) return null
  return {
    r: Number.parseInt(expand.slice(0, 2), 16),
    g: Number.parseInt(expand.slice(2, 4), 16),
    b: Number.parseInt(expand.slice(4, 6), 16),
  }
}

/**
 * Validates a style and reports every problem as one message, or null. It
 * returns the reason rather than throwing, because a form shows it next to a
 * field.
 */
export function validate(style: Style): string | null {
  const problems: string[] = []
  if (!['L', 'M', 'Q', 'H'].includes(style.level)) {
    problems.push(`level must be L, M, Q or H, not ${JSON.stringify(style.level)}`)
  }
  if (style.shape !== 'square' && style.shape !== 'round') {
    problems.push(`shape must be square or round, not ${JSON.stringify(style.shape)}`)
  }
  if (!parseHex(style.foreground)) problems.push(`foreground ${style.foreground} is not a colour`)
  if (style.background && !parseHex(style.background)) {
    problems.push(`background ${style.background} is not a colour`)
  }
  if (style.quietZone < 4) problems.push(`quietZone must be at least 4, not ${style.quietZone}`)
  if (style.modulePixels < 1) {
    problems.push(`modulePixels must be at least 1, not ${style.modulePixels}`)
  }
  if (style.logo) {
    if (style.logo.fraction < MIN_FRACTION || style.logo.fraction > 0.5) {
      problems.push(`the logo must cover between 8 and 50 percent, not ${style.logo.fraction}`)
    }
  }
  return problems.length > 0 ? problems.join('; ') : null
}

/**
 * Refuses a style whose modules do not stand out from the ground behind
 * them, before anything is drawn: a colour that fails this cannot be
 * repaired by a higher error correction level or a smaller logo, and finding
 * that out only once the draw-and-decode loop gives up would turn a plain
 * reason into a guess.
 */
export function checkContrast(style: Style): string | null {
  const groundHex = style.background || '#ffffff' // what a transparent code is printed on
  if (!parseHex(groundHex)) return `background ${style.background} is not a colour`
  const groundName =
    style.background || 'a white ground, which is what a transparent code is printed on'

  if (!parseHex(style.foreground)) return `foreground ${style.foreground} is not a colour`
  const found = ratio(style.foreground, groundHex)
  if (found < MIN_CONTRAST) {
    return (
      `foreground ${style.foreground} has only ${round(found)}:1 contrast against ${groundName}, ` +
      `and a scanner needs ${MIN_CONTRAST}:1; darken it or lighten the ground`
    )
  }
  return null
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * The colour of the dark modules: plain foreground, read as bytes a canvas
 * can draw. It lives here rather than in each drawing so the canvas and the
 * SVG cannot drift into two different reads of the same hex string.
 */
export function moduleColour(style: Style): Rgb {
  return parseHex(style.foreground) ?? { r: 0, g: 0, b: 0 }
}

/**
 * The colour under a logo's plate: the background where there is one and it
 * parses, white otherwise. Lives here, not in the canvas or the SVG drawing,
 * so the two cannot resolve the same style into two different plate colours.
 */
export function plateColour(style: Style): Rgb {
  return style.background ? (parseHex(style.background) ?? white) : white
}

/** The reverse of `parseHex`, for a drawing that needs a colour as a string. */
export function toHex(colour: Rgb): string {
  const byte = (value: number) => value.toString(16).padStart(2, '0')
  return `#${byte(colour.r)}${byte(colour.g)}${byte(colour.b)}`
}
