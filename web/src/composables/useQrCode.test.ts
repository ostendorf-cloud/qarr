// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { defaultStyle } from '../qr/style'
import { summary, useQrCode } from './useQrCode'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useQrCode', () => {
  it('starts empty rather than drawing a code nobody asked for', () => {
    const code = useQrCode()
    expect(code.status.value).toBe('empty')
    expect(code.result.value).toBeNull()
  })

  it('draws as soon as something is typed', async () => {
    const code = useQrCode()
    code.text.value = 'https://qarr.example/start'
    await nextTick()

    expect(code.status.value).toBe('ready')
    expect(code.result.value).not.toBeNull()
  })

  it('goes back to empty when the text is cleared, rather than reporting an error', async () => {
    const code = useQrCode()
    code.text.value = 'https://qarr.example/start'
    await nextTick()
    code.text.value = ''
    await nextTick()

    expect(code.status.value).toBe('empty')
    expect(code.result.value).toBeNull()
  })

  it('reports a style that cannot be drawn, with the reason', async () => {
    const code = useQrCode()
    code.text.value = 'https://qarr.example/start'
    code.style.value.foreground = '#2dd4bf'
    await nextTick()

    expect(code.status.value).toBe('failed')
    expect(code.problem.value).toMatch(/contrast/)
    expect(code.result.value).toBeNull()
  })

  it('carries what the repair changed when a logo has to be shrunk', async () => {
    const code = useQrCode()
    code.text.value = 'https://qarr.example/start'
    const side = 64
    const pixels = new Uint8ClampedArray(side * side * 4).fill(255)
    code.style.value.logo = { pixels, width: side, height: side, fraction: 0.45, plate: true }
    await nextTick()

    expect(code.status.value).toBe('ready')
    expect(code.adjusted.value.join('; ')).toMatch(/shrunk/)
  })

  it('never sends the typed content anywhere while drawing it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const code = useQrCode()
    code.text.value = 'WIFI:S:guest network;T:WPA;P:a secret password;;'
    await nextTick()

    expect(code.status.value).toBe('ready')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('summary', () => {
  it('names the level and the module count once a code is ready', async () => {
    const code = useQrCode()
    code.text.value = 'https://qarr.example/start'
    await nextTick()

    expect(summary(code)).toMatch(/^level [LMQH], \d+ modules$/)
  })

  it('draws a guided form only once it has no error, and says where each error is', async () => {
    const code = useQrCode()
    code.switchKind('tel')
    await nextTick()
    expect(code.status.value).toBe('empty')
    expect(code.errors.value).toEqual({ number: { code: 'required' } })

    code.fields.value.tel = { number: '+49 151 1234567' }
    await nextTick()

    expect(code.content.value).toBe('tel:+491511234567')
    expect(code.errors.value).toEqual({})
    expect(code.status.value).toBe('ready')
  })

  it('keeps what was typed in a form when the type is switched away and back', () => {
    const code = useQrCode()
    code.switchKind('wifi')
    code.fields.value.wifi.ssid = 'Home'
    code.switchKind('sepa')

    expect(code.notice.value).toEqual({ from: 'wifi', dropped: ['ssid'] })

    code.switchKind('wifi')
    expect(code.fields.value.wifi.ssid).toBe('Home')
    expect(code.notice.value).toBeNull()
  })

  it('says that free text is left behind on the way to a form', () => {
    const code = useQrCode()
    code.text.value = 'hello'
    code.switchKind('tel')
    expect(code.notice.value).toEqual({ from: 'text', dropped: ['text'] })
    code.switchKind('text')
    expect(code.text.value).toBe('hello')
  })

  it('is empty before anything has been drawn', () => {
    const code = useQrCode()
    expect(summary(code)).toBe('')
  })
})

describe('a SEPA code (EPC069-12)', () => {
  const logo = {
    pixels: new Uint8ClampedArray(4 * 4 * 4),
    width: 4,
    height: 4,
    fraction: 0.2,
    plate: true,
  }

  function sepa() {
    const code = useQrCode()
    code.style.value = { ...defaultStyle(), level: 'H', logo }
    code.switchKind('sepa')
    code.fields.value.sepa = {
      name: 'Example Association',
      iban: 'DE89 3704 0044 0532 0130 00',
    }
    return code
  }

  it('draws no logo and stays at level M when the kind is SEPA, with a logo set', async () => {
    const code = sepa()
    await nextTick()

    expect(code.status.value).toBe('ready')
    expect(code.result.value?.level).toBe('M')
    expect(code.result.value?.logoFraction).toBe(0)
    expect(code.drawStyle.value.logo).toBeNull()
    // The logo is not lost: it stays in the style that is stored.
    expect(code.style.value.logo).toEqual(logo)
  })

  it('draws the logo and the chosen level again when the kind changes back', async () => {
    const code = sepa()
    await nextTick()
    code.switchKind('text')
    code.text.value = 'https://qarr.example/start'
    await nextTick()

    expect(code.result.value?.level).toBe('H')
    expect(code.result.value?.logoFraction).toBe(0.2)
    expect(code.drawStyle.value.logo).toEqual(logo)
  })

  it('redraws when only the kind changes to SEPA', async () => {
    const code = useQrCode()
    code.style.value = { ...defaultStyle(), level: 'H', logo }
    code.fields.value.sepa = { name: 'A', iban: 'DE89 3704 0044 0532 0130 00' }
    code.fields.value.tel = { number: '+49 151 1234567' }
    code.switchKind('tel')
    await nextTick()
    expect(code.result.value?.logoFraction).toBe(0.2)

    code.switchKind('sepa')
    await nextTick()

    expect(code.result.value?.level).toBe('M')
    expect(code.result.value?.logoFraction).toBe(0)
  })

  it('keeps level M when a style with a logo is applied while the kind is SEPA', async () => {
    const code = sepa()
    await nextTick()

    code.style.value = { ...code.style.value, shape: 'round', logo: { ...logo, fraction: 0.3 } }
    await nextTick()

    expect(code.result.value?.level).toBe('M')
    expect(code.result.value?.logoFraction).toBe(0)
  })
})
