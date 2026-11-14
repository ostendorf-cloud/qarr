// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { render as renderCode } from '../qr/render'
import { defaultStyle } from '../qr/style'
import QrPreview from './QrPreview.vue'

const content = 'https://qarr.example/start'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('QrPreview', () => {
  it('invites typing something when nothing has been drawn yet', () => {
    render(QrPreview, {
      props: { status: 'empty', result: null, problem: '', adjusted: [], qrStyle: defaultStyle() },
    })

    expect(screen.getByText(/Type something above/)).toBeVisible()
  })

  it('shows why drawing failed, as an alert', () => {
    render(QrPreview, {
      props: {
        status: 'failed',
        result: null,
        problem: 'foreground #fff has only 1.1:1 contrast',
        adjusted: [],
        qrStyle: defaultStyle(),
      },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/1\.1:1 contrast/)
  })

  it('shows the drawn code, confirms the decode check, and offers both file formats', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    const result = renderCode(content, defaultStyle())
    render(QrPreview, {
      props: { status: 'ready', result, problem: '', adjusted: [], qrStyle: defaultStyle() },
    })

    expect(screen.getByRole('img', { name: 'The drawn code' })).toBeVisible()
    expect(screen.getByText(/decoded back right after it was drawn/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download SVG' })).toBeVisible()
  })

  it('lists what the repair changed', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    const result = renderCode(content, defaultStyle())
    render(QrPreview, {
      props: {
        status: 'ready',
        result,
        problem: '',
        adjusted: ['the error correction was raised from L to M to carry a logo of 20%'],
        qrStyle: defaultStyle(),
      },
    })

    expect(screen.getByText(/error correction was raised/)).toBeVisible()
  })

  it('downloads a vector file entirely from what is already in memory', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    const created = vi.fn(() => 'blob:mock')
    const revoked = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: created, revokeObjectURL: revoked })

    // Every global a browser offers for sending something out of the tab,
    // stubbed to throw the moment it is touched rather than to silently
    // succeed: this fails loudly if the download path ever grows a call
    // through one of them, not only through fetch, which is all the three
    // "nothing leaves the tab" tests in this diff used to check.
    //
    // A dynamic import() and a runtime-injected stylesheet have no global
    // of their own to stub this way, so they stay unchecked here. Reading
    // the diff is the only coverage for those two: nothing under web/src
    // calls import() or appends a <link> element.
    const leaves = () => {
      throw new Error('this call would have left the tab')
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(leaves)
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(leaves)
    // jsdom defines neither Worker nor navigator.sendBeacon at all, so there
    // is nothing existing to spy on; a plain stub is the only way to give
    // either one something to call and fail on.
    globalThis.Worker = vi.fn(leaves)
    const beacon = vi.fn(leaves)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })

    try {
      const result = renderCode(content, defaultStyle())
      render(QrPreview, {
        props: { status: 'ready', result, problem: '', adjusted: [], qrStyle: defaultStyle() },
      })

      await fireEvent.click(screen.getByRole('button', { name: 'Download SVG' }))

      expect(created).toHaveBeenCalledOnce()
      expect(revoked).toHaveBeenCalledWith('blob:mock')
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(openSpy).not.toHaveBeenCalled()
      expect(globalThis.Worker).not.toHaveBeenCalled()
      expect(beacon).not.toHaveBeenCalled()
    } finally {
      delete (globalThis as { Worker?: unknown }).Worker
      delete (navigator as { sendBeacon?: unknown }).sendBeacon
    }
  })
})
