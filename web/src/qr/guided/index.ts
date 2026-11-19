// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * The kinds of content a code can carry, the fields of each guided kind, and
 * the one function that turns a kind and its fields into the string a
 * scanner reads. Everything is pure and runs in the tab.
 */

import { encodeEvent } from './event'
import { encodeSepa } from './sepa'
import type { Fields, Outcome } from './shared'
import { encodeTel } from './tel'
import { encodeVcard } from './vcard'
import { encodeWifi } from './wifi'

export type { Errors, FieldError, Fields } from './shared'

export const GUIDED_KINDS = ['wifi', 'vcard', 'event', 'tel', 'sepa'] as const
export type GuidedKind = (typeof GUIDED_KINDS)[number]
export type Kind = 'text' | GuidedKind
export const KINDS: readonly Kind[] = ['text', ...GUIDED_KINDS]

export function isKind(value: unknown): value is Kind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
}

export type Control =
  'text' | 'password' | 'tel' | 'email' | 'url' | 'textarea' | 'select' | 'check' | 'datetime'

export interface FieldSpec {
  key: string
  control: Control
  /** True, or a test on the current entries of the form. */
  required?: boolean | ((fields: Fields) => boolean)
  /** Values of a select. Their labels are in the catalogue. */
  options?: readonly string[]
  /** A value of the same concept in another kind carries over under this name. */
  carry?: string
  /** Example text that is the same in every language. */
  placeholder?: string
  autocomplete?: string
}

export const SPECS: Record<GuidedKind, readonly FieldSpec[]> = {
  wifi: [
    { key: 'ssid', control: 'text', required: true },
    { key: 'security', control: 'select', options: ['WPA', 'WEP', 'nopass'] },
    {
      key: 'password',
      control: 'password',
      required: (fields) => fields.security !== 'nopass',
      autocomplete: 'off',
    },
    { key: 'hidden', control: 'check' },
  ],
  vcard: [
    { key: 'given', control: 'text' },
    { key: 'family', control: 'text' },
    { key: 'org', control: 'text' },
    { key: 'title', control: 'text' },
    { key: 'phone', control: 'tel', carry: 'phone', placeholder: '+49 151 1234567' },
    { key: 'email', control: 'email', placeholder: 'name@example.org' },
    { key: 'url', control: 'url', placeholder: 'https://example.org' },
    { key: 'street', control: 'text' },
    { key: 'postal', control: 'text' },
    { key: 'city', control: 'text' },
    { key: 'country', control: 'text' },
    { key: 'note', control: 'textarea', carry: 'longtext' },
  ],
  event: [
    { key: 'title', control: 'text', required: true },
    { key: 'allDay', control: 'check' },
    { key: 'start', control: 'datetime', required: true },
    { key: 'end', control: 'datetime' },
    { key: 'location', control: 'text' },
    { key: 'description', control: 'textarea', carry: 'longtext' },
  ],
  tel: [
    {
      key: 'number',
      control: 'tel',
      required: true,
      carry: 'phone',
      placeholder: '+49 151 1234567',
    },
  ],
  sepa: [
    { key: 'name', control: 'text', required: true },
    { key: 'iban', control: 'text', required: true, placeholder: 'DE89 3704 0044 0532 0130 00' },
    { key: 'bic', control: 'text' },
    { key: 'amount', control: 'text', placeholder: '12,50' },
    { key: 'remittance', control: 'text' },
  ],
}

/** Whether a field is required given the current entries of its form. */
export function isRequired(spec: FieldSpec, fields: Fields): boolean {
  return typeof spec.required === 'function' ? spec.required(fields) : (spec.required ?? false)
}

export type AllFields = Record<GuidedKind, Fields>

/** Starting values: empty, except what a select needs to offer something. */
export function emptyFields(): AllFields {
  return {
    wifi: { security: 'WPA' },
    vcard: {},
    event: {},
    tel: {},
    sepa: {},
  }
}

/** The string for a guided kind, or the errors that block it. */
export function serialize(kind: GuidedKind, fields: Fields, now: Date = new Date()): Outcome {
  switch (kind) {
    case 'wifi':
      return encodeWifi(fields)
    case 'vcard':
      return encodeVcard(fields)
    case 'event':
      return encodeEvent(fields, now)
    case 'tel':
      return encodeTel(fields)
    case 'sepa':
      return encodeSepa(fields)
  }
}

export interface Carried {
  fields: Fields
  /** Keys of the old kind whose filled value found no place in the new one. */
  dropped: string[]
}

/**
 * What a switch from one guided kind to another keeps. A field of the new
 * kind that is still empty takes the value of a field of the old kind with
 * the same `carry` name. Whatever else was filled in is reported as dropped.
 */
export function carry(from: GuidedKind, to: GuidedKind, source: Fields, target: Fields): Carried {
  const fields = { ...target }
  const used = new Set<string>()
  for (const spec of SPECS[to]) {
    if (!spec.carry || (fields[spec.key] ?? '') !== '') continue
    const origin = SPECS[from].find((s) => s.carry === spec.carry && (source[s.key] ?? '') !== '')
    if (origin) {
      fields[spec.key] = source[origin.key]
      used.add(origin.key)
    }
  }
  const dropped = SPECS[from]
    .filter(
      (s) =>
        (source[s.key] ?? '') !== '' &&
        s.control !== 'select' &&
        !(s.control === 'check' && source[s.key] !== 'true') &&
        !used.has(s.key),
    )
    .map((s) => s.key)
  return { fields, dropped }
}
