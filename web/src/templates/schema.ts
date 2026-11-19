// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * What a saved template is, and the one place that decides whether data
 * read back from the browser's storage or from an imported file is one.
 *
 * Both sources are untrusted: the storage can hold anything another script
 * on the origin, an older version or a hand edit left in it, and a file is
 * whatever the visitor picked. Nothing read from either is used before it
 * passes `parseTemplate`, which accepts only the exact shape below within
 * fixed caps and hands out values it built itself.
 */

import { WORKING_SIZE } from '../qr/logo'
import { MIN_FRACTION, type Shape, type Style } from '../qr/style'

/** How many templates are kept. Bounded by the storage quota, see AGENTS.md. */
export const MAX_TEMPLATES = 8
export const MAX_NAME_LENGTH = 40
/** The logo is held at most this many pixels on a side, as logo.ts reduces it. */
export const MAX_LOGO_SIDE = WORKING_SIZE
/** The most pixel data one stored logo can carry: 256 KB of RGBA. */
export const MAX_STORED_LOGO_BYTES = MAX_LOGO_SIDE * MAX_LOGO_SIDE * 4
/** The longest base64 text such a logo has. Checked before anything is decoded. */
export const MAX_LOGO_TEXT = Math.ceil(MAX_STORED_LOGO_BYTES / 3) * 4
/** The largest template file an import reads. */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024

export interface TemplateLogo {
  pixels: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
  fraction: number
  plate: boolean
}

export interface Template {
  /** Names the storage key of the logo. Letters and digits only. */
  id: string
  name: string
  foreground: string
  /** '' is transparent. */
  background: string
  shape: Shape
  logo: TemplateLogo | null
}

/** A template as plain JSON: the logo's pixels are one base64 text. */
export interface TemplateRecord {
  name: string
  foreground: string
  background: string
  shape: Shape
  logo: {
    width: number
    height: number
    fraction: number
    plate: boolean
    data: string
  } | null
}

const COLOUR = /^#[0-9a-fA-F]{6}$/
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/
const ID = /^[a-z0-9]{1,16}$/

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value)
}

export function newId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

/** A name as stored: trimmed, inner whitespace collapsed, within the cap. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // Control characters have no place in a name that is shown and exported.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  const name = value.replace(/\s+/g, ' ').trim()
  if (name === '' || [...name].length > MAX_NAME_LENGTH) return null
  return name
}

/** The name, or the name with a number, so that no two templates share one. */
export function uniqueName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const room = MAX_NAME_LENGTH - suffix.length
    const candidate = [...name].slice(0, room).join('').trimEnd() + suffix
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}

export function toBase64(pixels: Uint8ClampedArray): string {
  let binary = ''
  const chunk = 0x8000
  for (let at = 0; at < pixels.length; at += chunk) {
    binary += String.fromCharCode(...pixels.subarray(at, at + chunk))
  }
  return btoa(binary)
}

/** Decodes a logo's pixels, or null when the text is not exactly that many. */
export function fromBase64(
  text: string,
  byteLength: number,
): Uint8ClampedArray<ArrayBuffer> | null {
  if (text.length > MAX_LOGO_TEXT || !BASE64.test(text)) return null
  let binary: string
  try {
    binary = atob(text)
  } catch {
    return null
  }
  if (binary.length !== byteLength) return null
  const pixels = new Uint8ClampedArray(byteLength)
  for (let i = 0; i < byteLength; i++) pixels[i] = binary.charCodeAt(i)
  return pixels
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function side(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_LOGO_SIDE
}

/**
 * Checks one record and builds the template from it, or returns null. The
 * name is not made unique here: that depends on what else is kept.
 */
export function parseTemplate(raw: unknown, id: string): Template | null {
  if (!isObject(raw) || !isId(id)) return null
  const name = cleanName(raw.name)
  if (name === null) return null
  const { foreground, background, shape } = raw
  if (typeof foreground !== 'string' || !COLOUR.test(foreground)) return null
  if (typeof background !== 'string' || (background !== '' && !COLOUR.test(background))) return null
  if (shape !== 'square' && shape !== 'round') return null

  let logo: TemplateLogo | null = null
  if (raw.logo !== null) {
    const l = raw.logo
    if (!isObject(l)) return null
    if (!side(l.width) || !side(l.height)) return null
    if (typeof l.fraction !== 'number' || !Number.isFinite(l.fraction)) return null
    if (l.fraction < MIN_FRACTION || l.fraction > 0.5) return null
    if (typeof l.plate !== 'boolean' || typeof l.data !== 'string') return null
    const pixels = fromBase64(l.data, l.width * l.height * 4)
    if (!pixels) return null
    logo = { pixels, width: l.width, height: l.height, fraction: l.fraction, plate: l.plate }
  }

  return {
    id,
    name,
    foreground: foreground.toLowerCase(),
    background: background.toLowerCase(),
    shape,
    logo,
  }
}

export function toRecord(template: Template): TemplateRecord {
  const { logo } = template
  return {
    name: template.name,
    foreground: template.foreground,
    background: template.background,
    shape: template.shape,
    logo: logo
      ? {
          width: logo.width,
          height: logo.height,
          fraction: logo.fraction,
          plate: logo.plate,
          data: toBase64(logo.pixels),
        }
      : null,
  }
}

/** What a template carries out of a style: colours, shape and logo. */
export function fromStyle(style: Style, id: string, name: string): Template {
  const { logo } = style
  return {
    id,
    name,
    foreground: style.foreground,
    background: style.background,
    shape: style.shape,
    logo: logo
      ? {
          // A copy: the template must not change when the style's logo does.
          pixels: new Uint8ClampedArray(logo.pixels),
          width: logo.width,
          height: logo.height,
          fraction: logo.fraction,
          plate: logo.plate,
        }
      : null,
  }
}

/**
 * The style that results from applying a template to the current one. The
 * rest of the style (level, margin, resolution) stays as it is, so applying
 * a template and setting the same values by hand give the same style.
 */
export function applyTo(style: Style, template: Template, withLogo = true): Style {
  const { logo } = template
  return {
    ...style,
    foreground: template.foreground,
    background: template.background,
    shape: template.shape,
    logo:
      withLogo && logo
        ? {
            pixels: new Uint8ClampedArray(logo.pixels),
            width: logo.width,
            height: logo.height,
            fraction: logo.fraction,
            plate: logo.plate,
          }
        : null,
  }
}
