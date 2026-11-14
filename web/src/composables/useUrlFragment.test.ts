// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { decodeFragment, encodeFragment } from '../url/fragment'
import { defaultStyle, type Style } from '../qr/style'
import { useUrlFragment } from './useUrlFragment'

function mount(text: string, style: Style) {
  const textRef = ref(text)
  const styleRef = ref(style)
  const scope = effectScope()
  const state = scope.run(() => useUrlFragment(textRef, styleRef))
  if (!state) throw new Error('useUrlFragment produced nothing')
  return { text: textRef, style: styleRef, length: state.length, scope }
}

beforeEach(() => {
  history.replaceState(null, '', '/')
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useUrlFragment', () => {
  it('restores text and style from the fragment the page was opened with', () => {
    const style = defaultStyle()
    style.shape = 'round'
    history.replaceState(null, '', `/#${encodeFragment('https://qarr.example/shared', style)}`)

    const { text, style: restoredStyle } = mount('', defaultStyle())

    expect(text.value).toBe('https://qarr.example/shared')
    expect(restoredStyle.value.shape).toBe('round')
  })

  it('leaves a usable, default page when the fragment is corrupt', () => {
    history.replaceState(null, '', '/#not-json-at-all')

    const { text, style } = mount('', defaultStyle())

    expect(text.value).toBe('')
    expect(style.value).toEqual(defaultStyle())
  })

  it('keeps the address bar current after a change settles', async () => {
    const { text, scope } = mount('', defaultStyle())

    text.value = 'https://qarr.example/start'
    await nextTick()
    vi.advanceTimersByTime(400)

    expect(decodeFragment(window.location.hash.slice(1))?.text).toBe('https://qarr.example/start')
    scope.stop()
  })

  it('coalesces several quick changes into one address bar update, not one per keystroke', async () => {
    const { text, scope } = mount('', defaultStyle())
    const replaceSpy = vi.spyOn(history, 'replaceState')
    const pushSpy = vi.spyOn(history, 'pushState')
    const lengthBefore = history.length

    for (const typed of ['h', 'he', 'hel', 'hell', 'hello']) {
      text.value = typed
      await nextTick()
    }
    vi.advanceTimersByTime(400)

    expect(replaceSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).not.toHaveBeenCalled()
    expect(history.length).toBe(lengthBefore)
    expect(decodeFragment(window.location.hash.slice(1))?.text).toBe('hello')
    scope.stop()
  })

  it('never reaches the network while it restores or syncs the fragment', async () => {
    history.replaceState(
      null,
      '',
      `/#${encodeFragment('https://qarr.example/start', defaultStyle())}`,
    )

    const leaves = () => {
      throw new Error('this call would have left the tab')
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(leaves)
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(leaves)
    globalThis.Worker = vi.fn(leaves)
    globalThis.WebSocket = vi.fn(leaves) as unknown as typeof WebSocket
    globalThis.EventSource = vi.fn(leaves) as unknown as typeof EventSource
    const beacon = vi.fn(leaves)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })

    try {
      const { text, scope } = mount('', defaultStyle())
      text.value = 'https://qarr.example/changed'
      await nextTick()
      vi.advanceTimersByTime(400)
      scope.stop()

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(openSpy).not.toHaveBeenCalled()
      expect(globalThis.Worker).not.toHaveBeenCalled()
      expect(globalThis.WebSocket).not.toHaveBeenCalled()
      expect(globalThis.EventSource).not.toHaveBeenCalled()
      expect(beacon).not.toHaveBeenCalled()
    } finally {
      delete (globalThis as { Worker?: unknown }).Worker
      delete (globalThis as { WebSocket?: unknown }).WebSocket
      delete (globalThis as { EventSource?: unknown }).EventSource
      delete (navigator as { sendBeacon?: unknown }).sendBeacon
    }
  })

  it('reports the length of the fragment it is about to put in the address bar', async () => {
    const { text, length, scope } = mount('', defaultStyle())

    text.value = 'https://qarr.example/start'
    await nextTick()
    vi.advanceTimersByTime(400)

    expect(length.value).toBe(encodeFragment('https://qarr.example/start', defaultStyle()).length)
    scope.stop()
  })
})
