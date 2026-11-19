// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * A contact, as a vCard 3.0.
 *
 * Source: RFC 2426 (vCard MIME Directory Profile), version 3.0. The issue
 * names no version; 3.0 is the one every phone's scanner reads. Escaping per
 * section 4: backslash, semicolon and comma are escaped with a backslash and
 * a line break becomes the two characters \n. Structured values (N, ADR)
 * escape each component on its own and join them with a bare semicolon.
 * Lines are CRLF separated and folded at 75 octets (RFC 2425 section 5.8.1).
 *
 * TEL and URL are not TEXT values and are not escaped; they are validated so
 * nothing in them can end the line or start a new property.
 */

import {
  fold,
  finish,
  hasControl,
  normaliseNewlines,
  type Errors,
  type Fields,
  type Outcome,
} from './shared'

export function escapeVcard(value: string): string {
  return normaliseNewlines(value)
    .replace(/[\\;,]/g, '\\$&')
    .replace(/\n/g, '\\n')
}

const PHONE = /^\+?[0-9 ()./-]{3,30}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_VALUE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i

export function encodeVcard(fields: Fields): Outcome {
  const v = (key: string): string => (fields[key] ?? '').trim()
  const given = v('given')
  const family = v('family')
  const errors: Errors = {}

  for (const key of ['given', 'family', 'org', 'title', 'email', 'phone', 'url']) {
    if (hasControl(v(key))) errors[key] = { code: 'control' }
  }
  for (const key of ['street', 'postal', 'city', 'country']) {
    if (hasControl(v(key))) errors[key] = { code: 'control' }
  }
  if (hasControl(fields.note ?? '', true)) errors.note = { code: 'control' }

  if (given === '' && family === '') {
    errors.given = { code: 'nameRequired' }
    errors.family = { code: 'nameRequired' }
  }
  if (v('phone') !== '' && !errors.phone && !PHONE.test(v('phone'))) {
    errors.phone = { code: 'format' }
  }
  if (v('email') !== '' && !errors.email && !EMAIL.test(v('email'))) {
    errors.email = { code: 'format' }
  }
  if (v('url') !== '' && !errors.url && !URL_VALUE.test(v('url'))) {
    errors.url = { code: 'format' }
  }

  return finish(errors, () => {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${escapeVcard(family)};${escapeVcard(given)};;;`,
      `FN:${escapeVcard([given, family].filter(Boolean).join(' '))}`,
    ]
    if (v('org')) lines.push(`ORG:${escapeVcard(v('org'))}`)
    if (v('title')) lines.push(`TITLE:${escapeVcard(v('title'))}`)
    if (v('phone')) lines.push(`TEL;TYPE=VOICE:${v('phone')}`)
    if (v('email')) lines.push(`EMAIL;TYPE=INTERNET:${escapeVcard(v('email'))}`)
    if (v('url')) lines.push(`URL:${v('url')}`)
    if (v('street') || v('postal') || v('city') || v('country')) {
      const parts = ['', '', v('street'), v('city'), '', v('postal'), v('country')]
      lines.push(`ADR;TYPE=WORK:${parts.map(escapeVcard).join(';')}`)
    }
    const note = (fields.note ?? '').trim()
    if (note) lines.push(`NOTE:${escapeVcard(note)}`)
    lines.push('END:VCARD')
    return `${lines.map(fold).join('\r\n')}\r\n`
  })
}
