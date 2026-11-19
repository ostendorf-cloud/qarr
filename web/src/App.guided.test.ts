// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { createGovueI18n } from '@ostendorf-cloud/govue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { messages } from './i18n/messages'
import { decodeFragment, encodeFragment } from './url/fragment'
import { defaultStyle } from './qr/style'

function renderApp(locale = 'en') {
  return render(App, { global: { plugins: [createGovueI18n({ locale, messages })] } })
}

async function chooseKind(name: string, label = 'What the code says') {
  const trigger = screen.getByRole('combobox', { name: label })
  await fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  const option = await screen.findByRole('option', { name })
  option.focus()
  await fireEvent.keyDown(option, { key: 'Enter' })
  await waitFor(() => expect(trigger).toHaveTextContent(name))
}

beforeEach(() => {
  history.replaceState(null, '', '/')
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete (globalThis as { Worker?: unknown }).Worker
  delete (navigator as { sendBeacon?: unknown }).sendBeacon
})

describe('guided input', () => {
  it('offers free text and the five guided types', async () => {
    renderApp()
    await fireEvent.keyDown(screen.getByRole('combobox', { name: 'What the code says' }), {
      key: 'ArrowDown',
    })

    for (const name of [
      'Free text',
      'WiFi',
      'Contact (vCard)',
      'Appointment',
      'Telephone number',
      'SEPA transfer',
    ]) {
      expect(await screen.findByRole('option', { name })).toBeInTheDocument()
    }
  })

  it('draws a WiFi code from its form and keeps every entry inside the tab', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const leaves = () => {
      throw new Error('this call would have left the tab')
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(leaves)
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(leaves)
    globalThis.Worker = vi.fn(leaves)
    const beacon = vi.fn(leaves)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    const socket = vi.fn(leaves)
    vi.stubGlobal('WebSocket', socket)

    renderApp()
    await chooseKind('WiFi')
    await fireEvent.update(screen.getByLabelText(/Network name/), 'Caf;e')
    await fireEvent.update(screen.getByLabelText(/Password/), 'pa;ss"wo:rd,1')

    expect(await screen.findByRole('img', { name: 'The drawn code' })).toBeVisible()
    await vi.advanceTimersByTimeAsync(400)
    const restored = decodeFragment(window.location.hash.slice(1))
    expect(restored?.guided).toEqual({
      kind: 'wifi',
      fields: { security: 'WPA', ssid: 'Caf;e', password: 'pa;ss"wo:rd,1' },
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
    expect(globalThis.Worker).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    expect(socket).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('reports a missing required field at that field once it was left', async () => {
    renderApp()
    await chooseKind('SEPA transfer')

    // Nothing is reported before the person has been at the field.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const iban = screen.getByLabelText(/IBAN/)
    await fireEvent.update(iban, 'DE89 3704 0044 0532 0130 01')
    await fireEvent.focusOut(iban)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('check digits')
    expect(iban).toHaveAccessibleDescription(/check digits/)
    expect(iban).toBeInvalid()
    // The recipient was not visited, so it says nothing yet.
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    const name = screen.getByLabelText(/Recipient name/)
    await fireEvent.focusOut(name)
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
    expect(name).toHaveAccessibleDescription('This field is required.')
  })

  it('says what a switch of type left behind, and keeps it for the way back', async () => {
    renderApp()
    await chooseKind('WiFi')
    await fireEvent.update(screen.getByLabelText(/Network name/), 'Home')
    await chooseKind('Telephone number')

    expect(screen.getByRole('status')).toHaveTextContent(
      'Not carried over from WiFi: Network name (SSID)',
    )

    await chooseKind('WiFi')
    expect(screen.getByLabelText(/Network name/)).toHaveValue('Home')
  })

  it('carries a telephone number from a contact to the number form', async () => {
    renderApp()
    await chooseKind('Contact (vCard)')
    await fireEvent.update(screen.getByLabelText('Telephone'), '+49 151 1234567')
    await chooseKind('Telephone number')

    expect(screen.getByLabelText(/Telephone number/)).toHaveValue('+49 151 1234567')
  })

  it('opens a shared link of a guided type with its form filled in', () => {
    history.replaceState(
      null,
      '',
      `/#${encodeFragment('', defaultStyle(), {
        kind: 'tel',
        fields: { number: '+49 151 1234567' },
      })}`,
    )

    renderApp()

    expect(screen.getByRole('combobox', { name: 'What the code says' })).toHaveTextContent(
      'Telephone number',
    )
    expect(screen.getByLabelText(/Telephone number/)).toHaveValue('+49 151 1234567')
  })

  it('speaks German in the form when the address is German', async () => {
    renderApp('de')
    await chooseKind('SEPA-Überweisung', 'Was der Code enthält')

    expect(screen.getByLabelText(/Name des Empfängers/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Betrag in Euro/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Name des Empfängers/).closest('[lang]')).toHaveAttribute(
      'lang',
      'de',
    )
  })

  it('carries a guided entry to the other language', async () => {
    const assign = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign })
    renderApp('en')
    await chooseKind('Telephone number')
    await fireEvent.update(screen.getByLabelText(/Telephone number/), '+49 151 1')
    await fireEvent.update(screen.getByRole('combobox', { name: /language/i }), 'de')

    expect(assign).toHaveBeenCalledWith(
      `/de/#${encodeFragment('', defaultStyle(), { kind: 'tel', fields: { number: '+49 151 1' } })}`,
    )
  })

  it('warns when a guided payload makes the address long', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderApp()
    await chooseKind('Contact (vCard)')
    await fireEvent.update(screen.getByLabelText('Note'), 'long note '.repeat(80))
    await vi.advanceTimersByTimeAsync(400)

    expect(await screen.findByText(/has grown long enough/)).toBeVisible()
  })
})
