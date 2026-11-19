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
