// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

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

  it('is empty before anything has been drawn', () => {
    const code = useQrCode()
    expect(summary(code)).toBe('')
  })
})
