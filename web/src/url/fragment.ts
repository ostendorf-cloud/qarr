// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * The whole configuration, carried in the fragment of the page URL and
 * nowhere else: a browser never sends a fragment to a server, so a shared
 * link carries a WiFi password or any other payload no further than the
 * recipient's own tab. See docs/adr/0002.
 *
 * A logo is left out, the same way the previous attempt at this app left it
 * out: its pixels would make the link too long to paste comfortably, and a
 * shared style does not have to carry a picture. Only the text and the
 * colours and shape of the code travel in the link; a restored style always
 * has no logo.
 *
 * The fragment carries a version, under the `v` field. Decoding is
 * forgiving on purpose: every field short of `v` itself has a default, so a
 * fragment written before that field existed still restores the rest of
 * the state rather than being refused outright. A change to the shape of
 * the configuration that cannot be read this way bumps CURRENT_VERSION and
 * gets its own branch inside decodeFragment; an already-released version's
 * branch is never edited once a later one exists, so a link already handed
 * out keeps opening.
 */

import { emptyFields, GUIDED_KINDS, SPECS, type Fields, type GuidedKind } from '../qr/guided'
import { defaultStyle, type Shape, type Style } from '../qr/style'

export const CURRENT_VERSION = 1

/**
 * The length past which a link stops being comfortable to paste into a chat
 * message or a ticket. Recorded with its reasoning in AGENTS.md; a page
 * warns once the encoded fragment grows past this, before anyone copies it
 * anywhere.
 */
export const COMFORTABLE_FRAGMENT_LENGTH = 600

/** A guided kind and the fields of its form, carried instead of free text. */
export interface Guided {
  kind: GuidedKind
  fields: Fields
}

interface FragmentV1 {
  v: 1
  text?: unknown
  /** Added after the first release: a link without it is free text. */
  kind?: unknown
  fields?: unknown
  style?: {
    shape?: unknown
    foreground?: unknown
    background?: unknown
  }
}

/** What a fragment restores: the text and the style, minus any logo. */
export interface RestoredConfiguration {
  text: string
  style: Style
  /** The guided kind and its fields, or null for free text. */
  guided: Guided | null
}

/** The length of the fragment this text and style would encode to. */
export function fragmentLength(text: string, style: Style, guided: Guided | null = null): number {
  return encodeFragment(text, style, guided).length
}

/** Whether a guided form still holds nothing but its starting values. */
function untouched(guided: Guided): boolean {
  const start = emptyFields()[guided.kind]
  return Object.entries(guided.fields).every(([key, value]) => value === (start[key] ?? ''))
}

/**
 * Builds the fragment for the page URL. Empty text encodes to an empty
 * string, so a page with nothing typed into it carries no fragment at all.
 */
export function encodeFragment(text: string, style: Style, guided: Guided | null = null): string {
  if (guided ? untouched(guided) : text === '') return ''
  const payload: FragmentV1 = {
    v: CURRENT_VERSION,
    ...(guided ? { kind: guided.kind, fields: carried(guided) } : { text }),
    style: {
      shape: style.shape,
      foreground: style.foreground,
      background: style.background,
    },
  }
  return encodeURIComponent(JSON.stringify(payload))
}

/**
 * The other half of encodeFragment. Refuses nothing by throwing: an empty
 * fragment, a corrupt one, or one written by a version this page does not
 * know, all come back as null, and a caller falls back to a usable default
 * rather than showing an error for a page that was only ever meant to be
 * opened fresh.
 *
 * Dispatches on the fragment's own `v` field instead of comparing it against
 * CURRENT_VERSION: version one's branch below is what a second version's
 * branch sits beside once it exists, so the one-branch-per-version
 * discipline AGENTS.md describes is this function's shape today, not a
 * restructuring owed to it later.
 */
export function decodeFragment(fragment: string): RestoredConfiguration | null {
  if (!fragment) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(fragment))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const candidate = parsed as { v?: unknown }

  switch (candidate.v) {
    case 1:
      return decodeV1(parsed as FragmentV1)
    default:
      return null
  }
}

/**
 * Version one's own branch. Stays exactly as released once a second version
 * exists: a later version gets a branch of its own beside this one, and this
 * one is never edited to fit it.
 */
function decodeV1(candidate: FragmentV1): RestoredConfiguration {
  const base = defaultStyle()
  const rawStyle: NonNullable<FragmentV1['style']> =
    typeof candidate.style === 'object' && candidate.style !== null ? candidate.style : {}
  return {
    text: typeof candidate.text === 'string' ? candidate.text : '',
    guided: decodeGuided(candidate.kind, candidate.fields),
    style: {
      ...base,
      shape: isShape(rawStyle.shape) ? rawStyle.shape : base.shape,
      foreground: typeof rawStyle.foreground === 'string' ? rawStyle.foreground : base.foreground,
      background: typeof rawStyle.background === 'string' ? rawStyle.background : base.background,
      logo: null,
    },
  }
}

function nonEmpty(fields: Fields): Fields {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ''))
}

/**
 * The fields that travel in the link. An open WiFi network sends no
 * password, even one typed before the network was set to open: the code
 * does not carry it, so the link must not either.
 */
function carried(guided: Guided): Fields {
  const fields = nonEmpty(guided.fields)
  if (guided.kind === 'wifi' && fields.security === 'nopass') delete fields.password
  return fields
}

/**
 * Only the keys a form of this kind has, and only strings: a link is input
 * from anywhere, and what it names is never trusted past that.
 */
function decodeGuided(kind: unknown, fields: unknown): Guided | null {
  if (!GUIDED_KINDS.includes(kind as GuidedKind)) return null
  const known = kind as GuidedKind
  const raw =
    typeof fields === 'object' && fields !== null ? (fields as Record<string, unknown>) : {}
  const restored: Fields = { ...emptyFields()[known] }
  for (const spec of SPECS[known]) {
    const value = raw[spec.key]
    if (typeof value === 'string') restored[spec.key] = value
  }
  return { kind: known, fields: restored }
}

function isShape(value: unknown): value is Shape {
  return value === 'square' || value === 'round'
}
