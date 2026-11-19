// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { encodeWifi } from './wifi'

function payload(fields: Record<string, string>): string {
  const outcome = encodeWifi(fields)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.errors)}`)
  return outcome.payload
}

describe('encodeWifi', () => {
  it('writes the plain form', () => {
    expect(payload({ ssid: 'Home', security: 'WPA', password: 'secret123' })).toBe(
      'WIFI:T:WPA;S:Home;P:secret123;;',
    )
  })

  it('escapes backslash, semicolon, comma, colon and quote in both values', () => {
    expect(payload({ ssid: 'Caf;e', security: 'WPA', password: 'pa;ss"wo:rd,\\' })).toBe(
      'WIFI:T:WPA;S:Caf\\;e;P:pa\\;ss\\"wo\\:rd\\,\\\\;;',
    )
  })

  it('marks a hidden network', () => {
    expect(payload({ ssid: 'Home', security: 'WPA', password: 'secret123', hidden: 'true' })).toBe(
      'WIFI:T:WPA;S:Home;P:secret123;H:true;;',
    )
  })

  it('leaves the password out of an open network, even if one was typed', () => {
    expect(payload({ ssid: 'Guest', security: 'nopass', password: 'ignored' })).toBe(
      'WIFI:T:nopass;S:Guest;;',
    )
  })

  it('takes a WEP key of any length and non-ASCII letters in the name', () => {
    expect(payload({ ssid: 'Büro', security: 'WEP', password: 'abc' })).toBe(
      'WIFI:T:WEP;S:Büro;P:abc;;',
    )
  })

  it('refuses a missing name and a missing password, each at its own field', () => {
    const outcome = encodeWifi({ security: 'WPA' })
    expect(outcome).toEqual({
      ok: false,
      errors: { ssid: { code: 'required' }, password: { code: 'required' } },
    })
  })

  it('does not ask an open network for a password', () => {
    expect(encodeWifi({ ssid: 'Guest', security: 'nopass' }).ok).toBe(true)
  })

  it('holds a WPA passphrase to 8 through 63 bytes', () => {
    expect(encodeWifi({ ssid: 'a', security: 'WPA', password: '1234567' })).toEqual({
      ok: false,
      errors: { password: { code: 'tooShort', min: 8 } },
    })
    expect(encodeWifi({ ssid: 'a', security: 'WPA', password: 'x'.repeat(64) })).toEqual({
      ok: false,
      errors: { password: { code: 'tooLong', max: 63 } },
    })
    expect(encodeWifi({ ssid: 'a', security: 'WPA', password: 'x'.repeat(63) }).ok).toBe(true)
  })

  it('counts a network name in bytes, not characters', () => {
    expect(encodeWifi({ ssid: 'a'.repeat(32), security: 'nopass' }).ok).toBe(true)
    // 17 two-byte letters are 34 bytes.
    expect(encodeWifi({ ssid: 'ü'.repeat(17), security: 'nopass' })).toEqual({
      ok: false,
      errors: { ssid: { code: 'tooLong', max: 32 } },
    })
  })

  it('refuses a line break in a value, which would end the field early', () => {
    expect(encodeWifi({ ssid: 'a\nb', security: 'nopass' })).toEqual({
      ok: false,
      errors: { ssid: { code: 'control' } },
    })
  })
})
