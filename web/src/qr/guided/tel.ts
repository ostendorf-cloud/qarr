// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * A telephone number, as a tel: URI.
 *
 * Source: RFC 3966. A global number is "+" followed by digits, and visual
 * separators (space, hyphen, dot, parentheses, slash) may be typed but are
 * not part of the URI here: they are removed so the value is a plain
 * "tel:+4915112345678". E.164 (ITU-T) caps a number at 15 digits.
 *
 * A number without a leading "+" is a local number, which RFC 3966 only
 * allows with a phone-context parameter. Phones dial it as typed, so it is
 * accepted and written as typed digits.
 *
 * The German notation "+49 (0) 151 123" puts the trunk prefix 0 in
 * parentheses to say it is dropped when dialling from abroad. A "(0)"
 * directly after a country code of one to three digits ("+" or "00" first)
 * is therefore removed. A "(0)" anywhere else, or a longer group such as
 * "(0151)" in an international number, cannot be told apart from a digit
 * that belongs to the number, so the value is refused instead of guessed.
 */

import { finish, type Errors, type Fields, type Outcome } from './shared'

export const PHONE_MAX_DIGITS = 15
export const PHONE_MIN_DIGITS = 3

/**
 * A phone number as typed, reduced to its dialling digits with an optional
 * leading "+", or null when it has no such shape or is ambiguous. The vCard
 * telephone uses it too.
 */
export function normalisePhone(value: string): string | null {
  let compact = value.replace(/[\s.\-/]/g, '')
  const international = /^(\+|00)/.test(compact)
  if (/^(\+|00)\d{1,3}\(0\)/.test(compact)) compact = compact.replace('(0)', '')
  // What is left of a zero in parentheses is not decidable here.
  if (international ? /\(0/.test(compact) : /\(0\)/.test(compact)) return null
  compact = compact.replace(/[()]/g, '')
  return /^\+?\d+$/.test(compact) ? compact : null
}

export function encodeTel(fields: Fields): Outcome {
  const raw = (fields.number ?? '').trim()
  const errors: Errors = {}
  const compact = normalisePhone(raw) ?? ''

  if (raw === '') errors.number = { code: 'required' }
  else if (compact === '') errors.number = { code: 'format' }
  else {
    const digits = compact.replace('+', '').length
    if (digits < PHONE_MIN_DIGITS) errors.number = { code: 'tooShort', min: PHONE_MIN_DIGITS }
    else if (digits > PHONE_MAX_DIGITS) errors.number = { code: 'tooLong', max: PHONE_MAX_DIGITS }
  }

  return finish(errors, () => `tel:${compact}`)
}
