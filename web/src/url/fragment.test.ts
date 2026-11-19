// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { defaultStyle } from '../qr/style'
import {
  COMFORTABLE_FRAGMENT_LENGTH,
  decodeFragment,
  encodeFragment,
  fragmentLength,
} from './fragment'

describe('encodeFragment', () => {
  it('encodes nothing for text nobody has typed yet', () => {
    expect(encodeFragment('', defaultStyle())).toBe('')
  })

  it('never carries a logo, even when the style has one', () => {
    const style = defaultStyle()
    style.logo = {
      pixels: new Uint8ClampedArray(16),
      width: 2,
      height: 2,
      fraction: 0.2,
      plate: true,
    }

    const fragment = encodeFragment('hello', style)

    expect(fragment).not.toContain('pixels')
    expect(decodeURIComponent(fragment)).not.toContain('logo')
  })

  it('round trips text, shape and colours', () => {
    const style = defaultStyle()
    style.shape = 'round'
    style.foreground = '#336699'
    style.background = ''

    const restored = decodeFragment(encodeFragment('https://qarr.example/start', style))

    expect(restored?.text).toBe('https://qarr.example/start')
    expect(restored?.style.shape).toBe('round')
    expect(restored?.style.foreground).toBe('#336699')
    expect(restored?.style.background).toBe('')
    expect(restored?.style.logo).toBeNull()
  })

  it('carries text with characters that need percent-encoding', () => {
    const payload = 'WIFI:S:Festzelt & Söhne;T:WPA;P:a "quoted" passphrase;;'

    const restored = decodeFragment(encodeFragment(payload, defaultStyle()))

    expect(restored?.text).toBe(payload)
  })
})

describe('decodeFragment', () => {
  it('opens a fixture from before the background field existed', () => {
    // Hand written, not produced by encodeFragment: it stands in for a link
    // made before this shape grew the background field, so it carries only
    // version, text and the two fields a fragment always had. Decoding it
    // must restore what it does carry and fall back to a default for what
    // it does not. That proves field forgiveness within version one, not
    // cross-version decoding: no second version exists yet to decode a
    // fragment written by one and opened by another.
    const olderShape =
      '{"v":1,"text":"https://example.org/older-link","style":{"shape":"round","foreground":"#112233"}}'

    const restored = decodeFragment(encodeURIComponent(olderShape))

    expect(restored?.text).toBe('https://example.org/older-link')
    expect(restored?.style.shape).toBe('round')
    expect(restored?.style.foreground).toBe('#112233')
    expect(restored?.style.background).toBe(defaultStyle().background)
  })

  it('ignores a field it does not recognise rather than refusing the link', () => {
    const withExtraField = '{"v":1,"text":"hello","style":{"shape":"square"},"kind":"wifi"}'

    const restored = decodeFragment(encodeURIComponent(withExtraField))

    expect(restored?.text).toBe('hello')
  })

  it('refuses a fragment written by a version it does not know', () => {
    expect(decodeFragment(encodeURIComponent('{"v":2,"text":"hello"}'))).toBeNull()
    expect(decodeFragment(encodeURIComponent('{"text":"hello"}'))).toBeNull()
  })

  it('refuses an empty fragment rather than throwing', () => {
    expect(decodeFragment('')).toBeNull()
  })

  it('refuses a fragment that is not valid JSON', () => {
    expect(decodeFragment(encodeURIComponent('not json'))).toBeNull()
  })

  it('refuses a fragment whose JSON is not an object', () => {
    expect(decodeFragment(encodeURIComponent('42'))).toBeNull()
    expect(decodeFragment(encodeURIComponent('"hello"'))).toBeNull()
    expect(decodeFragment(encodeURIComponent('null'))).toBeNull()
  })

  it('refuses a fragment whose percent-encoding is malformed', () => {
    expect(decodeFragment('%')).toBeNull()
  })
})

describe('a guided kind in the fragment', () => {
  it('round trips the kind and its fields, and carries no free text', () => {
    const guided = { kind: 'sepa' as const, fields: { name: 'Max Müller', iban: 'DE89', bic: '' } }

    const fragment = encodeFragment('ignored', defaultStyle(), guided)
    const restored = decodeFragment(fragment)

    expect(restored?.guided).toEqual({
      kind: 'sepa',
      fields: { name: 'Max Müller', iban: 'DE89' },
    })
    expect(restored?.text).toBe('')
    expect(decodeURIComponent(fragment)).not.toContain('ignored')
  })

  it('encodes nothing for a form nobody filled in, apart from its starting values', () => {
    expect(encodeFragment('', defaultStyle(), { kind: 'wifi', fields: { security: 'WPA' } })).toBe(
      '',
    )
    expect(encodeFragment('', defaultStyle(), { kind: 'tel', fields: { number: '' } })).toBe('')
  })

  it('opens a link written before guided kinds existed as free text', () => {
    const older = '{"v":1,"text":"hello","style":{"shape":"round"}}'

    const restored = decodeFragment(encodeURIComponent(older))

    expect(restored?.guided).toBeNull()
    expect(restored?.text).toBe('hello')
  })

  it('ignores a kind it does not know and keeps only strings of known fields', () => {
    const unknown = '{"v":1,"text":"hi","kind":"hologram","fields":{"x":"y"}}'
    expect(decodeFragment(encodeURIComponent(unknown))?.guided).toBeNull()

    const odd = '{"v":1,"kind":"tel","fields":{"number":5,"extra":"x"}}'
    expect(decodeFragment(encodeURIComponent(odd))?.guided).toEqual({ kind: 'tel', fields: {} })
  })

  it('measures its own length, for the warning about a long link', () => {
    const guided = { kind: 'vcard' as const, fields: { note: 'x'.repeat(700) } }
    expect(fragmentLength('', defaultStyle(), guided)).toBeGreaterThan(COMFORTABLE_FRAGMENT_LENGTH)
  })
})

describe('fragmentLength', () => {
  it('matches the length encodeFragment produces', () => {
    const style = defaultStyle()
    expect(fragmentLength('hello', style)).toBe(encodeFragment('hello', style).length)
  })

  it('stays comfortably under the warning threshold for an ordinary WiFi password', () => {
    const payload = 'WIFI:S:Festzelt;T:WPA;P:a reasonably long passphrase 2026;;'
    expect(fragmentLength(payload, defaultStyle())).toBeLessThan(COMFORTABLE_FRAGMENT_LENGTH)
  })
})
