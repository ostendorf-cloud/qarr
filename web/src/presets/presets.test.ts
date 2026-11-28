// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchPreset, labelOf, listPresets, MAX_PRESETS, PresetError } from './presets'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('listPresets', () => {
  it('returns the presets the server lists, asking this origin only', async () => {
    const fetchMock = stubFetch(
      json({ logos: [{ name: 'acme.svg', url: '/logos/acme.svg', size: 12 }] }),
    )

    const got = await listPresets()

    expect(got).toEqual([{ name: 'acme.svg', url: '/logos/acme.svg' }])
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(target).toBe('/logos.json')
    expect(init.credentials).toBe('omit')
    expect(init.redirect).toBe('error')
  })

  it.each([
    ['an empty list', json({ logos: [] })],
    ['a server error', json({ logos: [{ name: 'a.png', url: '/logos/a.png' }] }, 502)],
    ['a body that is not an object', json('nope')],
    ['a body with no list', json({})],
    ['a list that is not an array', json({ logos: 'a.png' })],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
    ['a network failure', new TypeError('failed to fetch')],
  ])('returns no presets for %s', async (_name, response) => {
    stubFetch(response)

    await expect(listPresets()).resolves.toEqual([])
  })

  it.each([
    ['an absolute address', 'https://evil.example/logos/a.png'],
    ['another route', '/admin/a.png'],
    ['a path that climbs out', '/logos/../secret.png'],
    ['a query', '/logos/a.png?x=1'],
    ['a fragment', '/logos/a.png#x'],
    ['a scheme relative address', '//evil.example/logos/a.png'],
  ])('drops an entry with %s', async (_name, url) => {
    stubFetch(
      json({
        logos: [
          { name: 'a.png', url },
          { name: 'ok.png', url: '/logos/ok.png' },
        ],
      }),
    )

    const got = await listPresets()

    expect(got.map((p) => p.url)).toEqual(['/logos/ok.png'])
  })

  it('drops an entry without a name or with a name that is not text', async () => {
    stubFetch(
      json({
        logos: [{ name: '', url: '/logos/a.png' }, { name: 7, url: '/logos/b.png' }, null, 'c.png'],
      }),
    )

    await expect(listPresets()).resolves.toEqual([])
  })

  it('shows at most MAX_PRESETS entries', async () => {
    const logos = Array.from({ length: MAX_PRESETS + 20 }, (_, i) => ({
      name: `l${i}.png`,
      url: `/logos/l${i}.png`,
    }))
    stubFetch(json({ logos }))

    await expect(listPresets()).resolves.toHaveLength(MAX_PRESETS)
  })
})

describe('fetchPreset', () => {
  it('returns the picture as a File named after the preset, never following a redirect', async () => {
    const fetchMock = stubFetch(
      new Response('<svg/>', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }),
    )

    const file = await fetchPreset({ name: 'acme.svg', url: '/logos/acme.svg' })

    expect(file.name).toBe('acme.svg')
    expect(file.type).toBe('image/svg+xml')
    expect(file.size).toBe(6)
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(target).toBe('/logos/acme.svg')
    expect(init.redirect).toBe('error')
    expect(init.credentials).toBe('omit')
  })

  it.each([
    ['an error status', new Response('no', { status: 404 })],
    ['a network failure', new TypeError('failed to fetch')],
  ])('throws a PresetError for %s', async (_name, response) => {
    stubFetch(response)

    await expect(fetchPreset({ name: 'a.png', url: '/logos/a.png' })).rejects.toThrow(PresetError)
  })

  it('refuses an address outside the logo path without requesting it', async () => {
    const fetchMock = stubFetch(new Response('x'))

    await expect(fetchPreset({ name: 'a.png', url: 'https://evil.example/a.png' })).rejects.toThrow(
      PresetError,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('labelOf', () => {
  it.each([
    ['acme.svg', 'acme'],
    ['my.brand.png', 'my.brand'],
    ['noext', 'noext'],
    ['.hidden', '.hidden'],
  ])('labels %s as %s', (name, want) => {
    expect(labelOf({ name, url: `/logos/${name}` })).toBe(want)
  })
})
