// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { createGovueI18n } from '@ostendorf-cloud/govue'

import { messages } from '../i18n/messages'
import { defaultStyle, type Style } from '../qr/style'
import QrForm from './QrForm.vue'

function mounted(text = 'x', style: Style = defaultStyle()) {
  return render(QrForm, { props: { text, qrStyle: style } })
}

function latestStyle(view: RenderResult): Style {
  const calls = view.emitted<[Style]>('update:qrStyle')
  const latest = calls?.at(-1)?.[0]
  if (!latest) throw new Error('update:qrStyle was never emitted')
  return latest
}

describe('QrForm', () => {
  it('writes what was typed back into the text model', async () => {
    const view = mounted('')

    await fireEvent.update(
      screen.getByPlaceholderText('https://example.org'),
      'https://qarr.example',
    )

    expect(view.emitted('update:text')?.at(-1)).toEqual(['https://qarr.example'])
  })

  it('writes a chosen foreground colour back into the style model', async () => {
    const view = mounted()

    await fireEvent.update(screen.getByLabelText('Foreground'), '#336699')

    expect(latestStyle(view).foreground).toBe('#336699')
  })

  it('switches the module shape', async () => {
    const view = mounted()
    const trigger = screen.getByRole('combobox', { name: 'Module shape' })

    await fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const round = screen.getByRole('option', { name: 'Round modules' })
    round.focus()
    await fireEvent.keyDown(round, { key: 'Enter' })

    await waitFor(() => expect(view.emitted('update:qrStyle')).toBeTruthy())
    expect(latestStyle(view).shape).toBe('round')
  })

  it('offers a way to add a logo, naming the size limit', () => {
    mounted()

    expect(screen.getByRole('button', { name: 'Add a logo' })).toBeVisible()
    expect(screen.getByText(/Up to \d+ KB/)).toBeVisible()
  })

  it('offers to remove a logo once one is carried', () => {
    const style = defaultStyle()
    const side = 4
    style.logo = {
      pixels: new Uint8ClampedArray(side * side * 4),
      width: side,
      height: side,
      fraction: 0.2,
      plate: true,
    }
    mounted('x', style)

    expect(screen.getByRole('button', { name: 'Remove logo' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Replace logo' })).toBeVisible()
  })

  it('disables the logo upload for a SEPA code, and says why in German and English', () => {
    const view = render(QrForm, {
      props: { text: 'x', qrStyle: defaultStyle(), logoBlocked: true },
    })

    expect(screen.getByRole('button', { name: 'Add a logo' })).toBeDisabled()
    expect(screen.getByLabelText('Logo picture')).toBeDisabled()
    expect(screen.getByText(/A SEPA code takes no logo/)).toBeVisible()
    view.unmount()

    render(QrForm, {
      props: { text: 'x', qrStyle: defaultStyle(), logoBlocked: true },
      global: { plugins: [createGovueI18n({ locale: 'de', messages })] },
    })
    expect(screen.getByText(/Ein SEPA-Code nimmt kein Logo auf/)).toHaveAttribute('lang', 'de')
  })

  it('keeps the logo upload enabled for every other kind', () => {
    mounted()

    expect(screen.getByRole('button', { name: 'Add a logo' })).toBeEnabled()
    expect(screen.queryByText(/A SEPA code takes no logo/)).not.toBeInTheDocument()
  })

  it('removing a logo writes a style with no logo back into the model', async () => {
    const style = defaultStyle()
    const side = 4
    style.logo = {
      pixels: new Uint8ClampedArray(side * side * 4),
      width: side,
      height: side,
      fraction: 0.2,
      plate: true,
    }
    const view = mounted('x', style)

    await fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }))

    expect(latestStyle(view).logo).toBeNull()
  })
})
