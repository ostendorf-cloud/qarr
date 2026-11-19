// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { createGovueI18n } from '@ostendorf-cloud/govue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { messages } from './i18n/messages'

const { dataURL } = vi.hoisted(() => ({ dataURL: vi.fn() }))

vi.mock('./qr/logo', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('./qr/logo')),
  fromFile: (_file: File, fraction: number, plate: boolean) =>
    Promise.resolve({
      pixels: new Uint8ClampedArray(4 * 4 * 4).fill(90),
      width: 4,
      height: 4,
      fraction,
      plate,
    }),
  dataURL,
}))

async function chooseKind(name: string) {
  const trigger = screen.getByRole('combobox', { name: 'What the code says' })
  await fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  const option = await screen.findByRole('option', { name })
  option.focus()
  await fireEvent.keyDown(option, { key: 'Enter' })
  await waitFor(() => expect(trigger).toHaveTextContent(name))
}

let blobs: Blob[] = []

beforeEach(() => {
  history.replaceState(null, '', '/')
  blobs = []
  dataURL.mockReset()
  dataURL.mockReturnValue('data:image/png;base64,AA==')
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    blobs.push(blob as Blob)
    return 'blob:x'
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function downloadedSvg(): Promise<string> {
  await fireEvent.click(await screen.findByRole('button', { name: 'Download SVG' }))
  return blobs[blobs.length - 1].text()
}

describe('the SVG download of a SEPA code with a logo set', () => {
  it('carries no logo, and the logo comes back for another kind', async () => {
    render(App, { global: { plugins: [createGovueI18n({ locale: 'en', messages })] } })
    await fireEvent.update(screen.getByLabelText('Text'), 'https://qarr.example')
    await fireEvent.change(screen.getByLabelText('Logo picture'), {
      target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] },
    })
    await screen.findByRole('button', { name: 'Remove logo' })
    // With the logo and free text, the file does embed it: the check below has teeth.
    await waitFor(async () => expect(await downloadedSvg()).toContain('<image'))

    await chooseKind('SEPA transfer')
    await fireEvent.update(screen.getByLabelText(/Recipient name/), 'Example Association')
    await fireEvent.update(screen.getByLabelText(/IBAN/), 'DE89 3704 0044 0532 0130 00')

    // The preview gets the drawn style: no logo, so the logo is not even re-encoded.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download SVG' })).toBeEnabled())
    await waitFor(() => expect(screen.getAllByText(/level M,/).length).toBeGreaterThan(0))
    dataURL.mockClear()
    expect(await downloadedSvg()).not.toContain('<image')
    expect(dataURL).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove logo' })).toBeInTheDocument()

    await chooseKind('Free text')
    await waitFor(async () => expect(await downloadedSvg()).toContain('<image'))
  })
})
