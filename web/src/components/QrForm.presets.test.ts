// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createGovueI18n } from '@ostendorf-cloud/govue'

import { messages } from '../i18n/messages'
import { fromFile } from '../qr/logo'
import type * as LogoModule from '../qr/logo'
import { defaultStyle, type Logo, type Style } from '../qr/style'
import QrForm from './QrForm.vue'

// The picture itself is read by qr/logo.ts, which needs a canvas that jsdom
// does not have. Its own tests cover that: here it only has to be handed the
// File a preset became, or the one chosen from the device.
vi.mock('../qr/logo', async (importOriginal) => ({
  ...(await importOriginal<typeof LogoModule>()),
  fromFile: vi.fn(),
}))

const side = 4
const drawn: Logo = {
  pixels: new Uint8ClampedArray(side * side * 4),
  width: side,
  height: side,
  fraction: 0.2,
  plate: true,
}

function respond(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn((target: string) => {
    const route = routes[target]
    return route
      ? Promise.resolve(route())
      : Promise.resolve(new Response('not found', { status: 404 }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function listing(...names: string[]): () => Response {
  return () =>
    new Response(
      JSON.stringify({ logos: names.map((name) => ({ name, url: `/logos/${name}` })) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
}

function latestStyle(view: RenderResult): Style {
  const latest = view.emitted<[Style]>('update:qrStyle')?.at(-1)?.[0]
  if (!latest) throw new Error('update:qrStyle was never emitted')
  return latest
}

beforeEach(() => {
  vi.mocked(fromFile).mockResolvedValue(drawn)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(fromFile).mockReset()
})

describe('QrForm preset logos', () => {
  it('offers the presets the server lists, next to the upload', async () => {
    respond({ '/logos.json': listing('acme.svg', 'globex.png') })
    render(QrForm, { props: { text: 'x', qrStyle: defaultStyle() } })

    expect(await screen.findByRole('button', { name: 'acme' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'globex' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add a logo' })).toBeVisible()
  })

  it.each([
    ['an empty list', { '/logos.json': listing() }],
    ['a server error', { '/logos.json': () => new Response('x', { status: 502 }) }],
    [
      'a network failure',
      {
        '/logos.json': () => {
          throw new TypeError('failed to fetch')
        },
      },
    ],
  ])('offers upload only after %s', async (_name, routes) => {
    const fetchMock = respond(routes)
    render(QrForm, { props: { text: 'x', qrStyle: defaultStyle() } })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/logos.json', expect.anything()))
    await Promise.resolve()

    expect(
      screen.queryByRole('heading', { name: /logos this site offers/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a logo' })).toBeEnabled()
  })

  it('loads a chosen preset through the same reader as an upload, and sets it as the logo', async () => {
    const fetchMock = respond({
      '/logos.json': listing('acme.svg'),
      '/logos/acme.svg': () =>
        new Response('<svg/>', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }),
    })
    const view = render(QrForm, { props: { text: 'x', qrStyle: defaultStyle() } })

    await fireEvent.click(await screen.findByRole('button', { name: 'acme' }))

    await waitFor(() => expect(latestStyle(view).logo).toEqual(drawn))
    expect(fetchMock).toHaveBeenCalledWith('/logos/acme.svg', expect.anything())
    const file = vi.mocked(fromFile).mock.calls[0]?.[0]
    expect(file?.name).toBe('acme.svg')
    expect(file?.type).toBe('image/svg+xml')
  })

  it('says so when a preset cannot be loaded, and keeps the logo it had', async () => {
    respond({ '/logos.json': listing('acme.svg') })
    const view = render(QrForm, { props: { text: 'x', qrStyle: defaultStyle() } })

    await fireEvent.click(await screen.findByRole('button', { name: 'acme' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/)
    expect(view.emitted('update:qrStyle')).toBeUndefined()
    expect(fromFile).not.toHaveBeenCalled()
  })

  it('disables the presets for a SEPA code', async () => {
    respond({ '/logos.json': listing('acme.svg') })
    render(QrForm, { props: { text: 'x', qrStyle: defaultStyle(), logoBlocked: true } })

    expect(await screen.findByRole('button', { name: 'acme' })).toBeDisabled()
  })

  it('names the presets in German for a German address', async () => {
    respond({ '/logos.json': listing('acme.svg') })
    render(QrForm, {
      props: { text: 'x', qrStyle: defaultStyle() },
      global: { plugins: [createGovueI18n({ locale: 'de', messages })] },
    })

    const heading = await screen.findByText(/Oder wählen Sie eines der Logos/)
    expect(heading.closest('[lang]')).toHaveAttribute('lang', 'de')
  })

  it('requests nothing for a logo chosen on the device beyond the list on load', async () => {
    const fetchMock = respond({ '/logos.json': listing('acme.svg') })
    const view = render(QrForm, { props: { text: 'x', qrStyle: defaultStyle() } })
    await screen.findByRole('button', { name: 'acme' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const file = new File(['png'], 'mine.png', { type: 'image/png' })
    await fireEvent.change(screen.getByLabelText('Logo picture'), { target: { files: [file] } })

    await waitFor(() => expect(latestStyle(view).logo).toEqual(drawn))
    expect(vi.mocked(fromFile).mock.calls[0]?.[0]).toBe(file)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
