// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { defaultStyle } from '../style'
import { render } from '../render'
import { carry, emptyFields, serialize, SPECS, type GuidedKind } from '.'

describe('carry', () => {
  it('moves a telephone number between a contact and a number', () => {
    const moved = carry('vcard', 'tel', { given: 'Anna', phone: '+49 151 1' }, {})
    expect(moved.fields).toEqual({ number: '+49 151 1' })
    expect(moved.dropped).toEqual(['given'])
  })

  it('does not overwrite what the target already holds', () => {
    const moved = carry('vcard', 'tel', { phone: '111' }, { number: '222' })
    expect(moved.fields.number).toBe('222')
    expect(moved.dropped).toEqual(['phone'])
  })

  it('reports nothing for empty fields, a default select or an unchecked box', () => {
    const moved = carry('wifi', 'sepa', { ssid: '', security: 'WPA', password: '', hidden: '' }, {})
    expect(moved.dropped).toEqual([])
  })

  it('reports a ticked box and every filled field that finds no place', () => {
    const moved = carry('wifi', 'sepa', { ssid: 'Home', password: 'x', hidden: 'true' }, {})
    expect(moved.dropped).toEqual(['ssid', 'password', 'hidden'])
  })

  it('moves a long text between a contact note and an appointment description', () => {
    expect(carry('vcard', 'event', { note: 'n' }, {}).fields).toEqual({ description: 'n' })
  })
})

describe('every field of a kind has a spec and the errors name one of them', () => {
  it('serialises an empty form into errors on known keys only', () => {
    for (const kind of Object.keys(SPECS) as GuidedKind[]) {
      const outcome = serialize(kind, emptyFields()[kind])
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) {
        const keys = SPECS[kind].map((s) => s.key)
        for (const key of Object.keys(outcome.errors)) expect(keys).toContain(key)
      }
    }
  })
})

describe('what is serialised is what a scanner reads back', () => {
  const cases: [GuidedKind, Record<string, string>][] = [
    ['wifi', { ssid: 'Caf;e', security: 'WPA', password: 'pa;ss"wo:rd,\\' }],
    ['vcard', { given: 'Zoë', family: 'Łukasz', phone: '+49 151 1234567', note: 'a\nb, c' }],
    ['event', { title: 'Müller; Treffen', start: '2026-12-01T10:00', description: 'x\ny' }],
    ['tel', { number: '+49 151 1234567' }],
    ['sepa', { name: 'Max Müller', iban: 'DE89 3704 0044 0532 0130 00', amount: '12,5' }],
  ]

  it.each(cases)('decodes a %s code to the exact string', (kind, fields) => {
    const outcome = serialize(kind, fields, new Date('2026-11-19T10:00:00Z'))
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.errors))
    // render() decodes its own drawing and throws unless the same string comes back.
    expect(() => render(outcome.payload, defaultStyle())).not.toThrow()
  })
})
