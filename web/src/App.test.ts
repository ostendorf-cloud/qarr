// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('names qarr in the brand slot and the page heading', () => {
    render(App)

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
})
