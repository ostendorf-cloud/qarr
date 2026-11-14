// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import App from './App.vue'

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
})
