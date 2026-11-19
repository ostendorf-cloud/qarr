// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render as renderComponent, screen, within } from '@testing-library/vue'
import { createGovueI18n } from '@ostendorf-cloud/govue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { decodeFragment, encodeFragment } from './url/fragment'
import { defaultStyle } from './qr/style'

// The page needs the language layer, which main.ts installs from the address.
function renderApp(locale = 'en') {
  return renderComponent(App, { global: { plugins: [createGovueI18n({ locale })] } })
}

function render(component: typeof App) {
  void component
  return renderApp()
}

beforeEach(() => {
  // Every test starts from a page opened with no link of its own, since the
  // same jsdom window, and the history it carries, is reused across the
  // tests in this file.
  history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('App', () => {
  it('names qarr in the brand slot and the page heading', () => {
    renderApp()

    expect(screen.getByRole('heading', { level: 1, name: 'qarr' })).toBeVisible()
  })

  it('says what qarr does', () => {
    render(App)

    expect(
      screen.getByText(
        'QR codes with your own content, colours and logo, generated in your browser.',
      ),
    ).toBeVisible()
  })

  it('says that nothing typed into the page leaves the tab', () => {
    render(App)

    expect(screen.getByText(/nothing typed here leaves this tab/i)).toBeVisible()
  })

  it('points to the privacy statement instead of repeating it', () => {
    renderApp('en')

    // The statement lives on the privacy page alone, so the start page
    // cannot contradict it.
    expect(screen.queryByRole('heading', { name: 'Privacy' })).not.toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /privacy/i })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveAttribute('href', '/en/privacy')
  })

  it('links the imprint and the privacy page of its language in the footer', () => {
    renderApp('de')

    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'Impressum' })).toHaveAttribute(
      'href',
      '/de/imprint',
    )
    expect(within(footer).getByRole('link', { name: 'Datenschutz' })).toHaveAttribute(
      'href',
      '/de/privacy',
    )
  })

  it('goes to the start page of the other language when the language changes', async () => {
    const assign = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      assign,
    })
    renderApp('en')

    await fireEvent.update(screen.getByRole('combobox', { name: /language/i }), 'de')

    expect(assign).toHaveBeenCalledWith('/de/')
  })

  it('offers a skip link as the first focusable element', () => {
    render(App)

    expect(screen.getByText('Skip to content')).toBeInTheDocument()
  })

  it('draws a code from typed text without sending it anywhere', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(App)
    await fireEvent.update(
      screen.getByPlaceholderText('https://example.org'),
      'WIFI:S:guest network;T:WPA;P:a secret password;;',
    )

    expect(await screen.findByRole('img', { name: 'The drawn code' })).toBeVisible()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("says the page's own address carries the text, colours and shape, but never a logo", () => {
    render(App)

    expect(
      screen.getByText(/this page's own address carries the text, colours and shape/i),
    ).toBeVisible()
    expect(screen.getByText(/a logo you add stays in this browser/i)).toBeVisible()
  })

  it('restores the text and the style from the link it was opened with', () => {
    const style = defaultStyle()
    style.shape = 'round'
    style.foreground = '#336699'
    history.replaceState(null, '', `/#${encodeFragment('https://qarr.example/shared', style)}`)

    render(App)

    expect(screen.getByPlaceholderText('https://example.org')).toHaveValue(
      'https://qarr.example/shared',
    )
    expect(screen.getByLabelText('Foreground')).toHaveValue('#336699')
  })

  it('keeps the address bar current as the text changes, with no network call and no new history entry', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D)

      const leaves = () => {
        throw new Error('this call would have left the tab')
      }
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(leaves)
      const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(leaves)
      globalThis.Worker = vi.fn(leaves)
      const beacon = vi.fn(leaves)
      Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
      const lengthBefore = history.length

      render(App)
      await fireEvent.update(
        screen.getByPlaceholderText('https://example.org'),
        'https://qarr.example/typed',
      )
      await vi.advanceTimersByTimeAsync(400)

      expect(decodeFragment(window.location.hash.slice(1))?.text).toBe('https://qarr.example/typed')
      expect(history.length).toBe(lengthBefore)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(openSpy).not.toHaveBeenCalled()
      expect(globalThis.Worker).not.toHaveBeenCalled()
      expect(beacon).not.toHaveBeenCalled()
    } finally {
      delete (globalThis as { Worker?: unknown }).Worker
      delete (navigator as { sendBeacon?: unknown }).sendBeacon
    }
  })

  it('warns once the address grows past what is comfortable to paste', async () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    render(App)

    expect(screen.queryByText(/grown long enough/i)).not.toBeInTheDocument()

    await fireEvent.update(screen.getByPlaceholderText('https://example.org'), 'x'.repeat(650))
    await vi.advanceTimersByTimeAsync(400)

    expect(await screen.findByText(/grown long enough/i)).toBeVisible()
  })
})
