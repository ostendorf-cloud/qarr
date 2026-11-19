// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { encodeTel } from './tel'

describe('encodeTel', () => {
  it('writes a global number without its visual separators', () => {
    expect(encodeTel({ number: '+49 (151) 123-4567' })).toEqual({
      ok: true,
      payload: 'tel:+491511234567',
    })
  })

  it('drops a (0) that follows the country code, in every usual notation', () => {
    for (const number of [
      '+49 (0) 151 123456',
      '+49 (0)151 123456',
      '+49(0)151123456',
      '0049 (0) 151 123456',
      '+49 (0)151/123456',
    ]) {
      const outcome = encodeTel({ number })
      expect(outcome.ok && outcome.payload.replace(/^tel:(00|\+)/, '')).toBe('49151123456')
    }
    expect(encodeTel({ number: '+1 (0) 555 1234' })).toEqual({ ok: true, payload: 'tel:+15551234' })
  })

  it('refuses a zero in parentheses it cannot place', () => {
    for (const number of ['(0) 151 123456', '+49 (0151) 123456', '+49 151 (0) 123456']) {
      expect(encodeTel({ number })).toEqual({
        ok: false,
        errors: { number: { code: 'format' } },
      })
    }
  })

  it('keeps an area code in parentheses of a local number', () => {
    expect(encodeTel({ number: '(0151) 123456' })).toEqual({ ok: true, payload: 'tel:0151123456' })
    expect(encodeTel({ number: '+49 (151) 123456' })).toEqual({
      ok: true,
      payload: 'tel:+49151123456',
    })
  })

  it('keeps a local number as typed digits', () => {
    expect(encodeTel({ number: '0151/1234567' })).toEqual({ ok: true, payload: 'tel:01511234567' })
  })

  it('refuses an empty number', () => {
    expect(encodeTel({ number: '  ' })).toEqual({
      ok: false,
      errors: { number: { code: 'required' } },
    })
  })

  it('refuses letters and a plus in the middle', () => {
    expect(encodeTel({ number: '+49 151 abc' }).ok).toBe(false)
    expect(encodeTel({ number: '49+151123' }).ok).toBe(false)
    expect(encodeTel({ number: '+' }).ok).toBe(false)
  })

  it('holds the digits to 3 through 15', () => {
    expect(encodeTel({ number: '12' })).toEqual({
      ok: false,
      errors: { number: { code: 'tooShort', min: 3 } },
    })
    expect(encodeTel({ number: '+1234567890123456' })).toEqual({
      ok: false,
      errors: { number: { code: 'tooLong', max: 15 } },
    })
    expect(encodeTel({ number: '+123456789012345' }).ok).toBe(true)
  })
})
