// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { encodeVcard } from './vcard'

function payload(fields: Record<string, string>): string {
  const outcome = encodeVcard(fields)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.errors)}`)
  return outcome.payload
}

describe('encodeVcard', () => {
  it('writes a full card, escaping separators and line breaks', () => {
    const card = payload({
      given: 'Anna',
      family: 'Schmidt',
      org: 'ACME; Inc',
      title: 'Head, Sales',
      phone: '+49 151 1234567',
      email: 'anna@example.org',
      url: 'https://example.org/a',
      note: 'Line one\nLine, two\\',
    })

    expect(card).toBe(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:Schmidt;Anna;;;',
        'FN:Anna Schmidt',
        'ORG:ACME\\; Inc',
        'TITLE:Head\\, Sales',
        'TEL;TYPE=VOICE:+49 151 1234567',
        'EMAIL;TYPE=INTERNET:anna@example.org',
        'URL:https://example.org/a',
        'NOTE:Line one\\nLine\\, two\\\\',
        'END:VCARD',
        '',
      ].join('\r\n'),
    )
  })

  it('leaves out every empty optional field', () => {
    expect(payload({ given: 'Anna' })).toBe(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nN:;Anna;;;\r\nFN:Anna\r\nEND:VCARD\r\n',
    )
  })

  it('writes the address as one structured value, each part escaped on its own', () => {
    expect(
      payload({
        family: 'X',
        street: 'Main St; 1',
        postal: '52070',
        city: 'Aachen',
        country: 'DE',
      }),
    ).toContain('\r\nADR;TYPE=WORK:;;Main St\\; 1;Aachen;;52070;DE\r\n')
  })

  it('treats a Windows line break in the note as one line break', () => {
    expect(payload({ given: 'A', note: 'a\r\nb' })).toContain('NOTE:a\\nb\r\n')
  })

  it('folds a long line at 75 octets with a CRLF and a space', () => {
    const lines = payload({ given: 'A', note: 'a'.repeat(100) }).split('\r\n')
    const at = lines.findIndex((l) => l.startsWith('NOTE:'))
    expect(lines[at]).toBe(`NOTE:${'a'.repeat(70)}`)
    expect(lines[at + 1]).toBe(` ${'a'.repeat(30)}`)
  })

  it('never folds inside a multi-byte character', () => {
    const card = payload({ given: 'A', note: 'ä'.repeat(50) })
    const bytes = new TextEncoder()
    for (const line of card.split('\r\n')) expect(bytes.encode(line).length).toBeLessThanOrEqual(75)
    expect(card.replace(/\r\n /g, '')).toContain(`NOTE:${'ä'.repeat(50)}\r\n`)
  })

  it('carries non-ASCII names', () => {
    expect(payload({ given: 'Zoë', family: 'Łukasz' })).toContain(
      'N:Łukasz;Zoë;;;\r\nFN:Zoë Łukasz',
    )
  })

  it('needs a first or a last name, and says so at both fields', () => {
    expect(encodeVcard({ org: 'ACME' })).toEqual({
      ok: false,
      errors: { given: { code: 'nameRequired' }, family: { code: 'nameRequired' } },
    })
  })

  it('checks telephone, email and website shapes', () => {
    expect(encodeVcard({ given: 'A', phone: 'call me', email: 'a', url: 'example.org' })).toEqual({
      ok: false,
      errors: { phone: { code: 'format' }, email: { code: 'format' }, url: { code: 'format' } },
    })
  })

  it('refuses a line break in a single line field, which would start a new property', () => {
    expect(encodeVcard({ given: 'A\nEND:VCARD' })).toEqual({
      ok: false,
      errors: { given: { code: 'control' } },
    })
  })
})
