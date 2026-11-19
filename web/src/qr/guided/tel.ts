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
 */

import { finish, type Errors, type Fields, type Outcome } from './shared'

export const PHONE_MAX_DIGITS = 15
export const PHONE_MIN_DIGITS = 3

export function encodeTel(fields: Fields): Outcome {
  const raw = (fields.number ?? '').trim()
  const errors: Errors = {}
  const compact = raw.replace(/[\s().\-/]/g, '')

  if (raw === '') errors.number = { code: 'required' }
  else if (!/^\+?\d+$/.test(compact)) errors.number = { code: 'format' }
  else {
    const digits = compact.replace('+', '').length
    if (digits < PHONE_MIN_DIGITS) errors.number = { code: 'tooShort', min: PHONE_MIN_DIGITS }
    else if (digits > PHONE_MAX_DIGITS) errors.number = { code: 'tooLong', max: PHONE_MAX_DIGITS }
  }

  return finish(errors, () => `tel:${compact}`)
}
