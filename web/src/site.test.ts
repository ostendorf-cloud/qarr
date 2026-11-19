// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { files, ORIGIN } from './entry-prerender'

// The shape of web/index.html after the client build: the head holds the head
// placeholder and the mount element holds the page placeholder.
const template = `<!doctype html>
<html lang="en">
  <head><title>qarr</title><!--app-head--></head>
  <body><div id="app"><!--app-html--></div></body>
</html>`

describe('the prerendered site', () => {
  it('has the start page, the imprint and the privacy page in both languages and no terms', async () => {
    const out = await files(template)
    const paths = out.map((file) => file.path).sort()

    expect(paths).toEqual([
      'de/imprint/index.html',
      'de/index.html',
      'de/privacy/index.html',
      'en/imprint/index.html',
      'en/index.html',
      'en/privacy/index.html',
      'sitemap.xml',
    ])
  })

  it('lists exactly those pages in the sitemap, under the site origin', async () => {
    const out = await files(template)
    const sitemap = out.find((file) => file.path === 'sitemap.xml')?.content ?? ''
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

    expect(locs.sort()).toEqual(
      ['de/', 'en/', 'de/imprint', 'en/imprint', 'de/privacy', 'en/privacy']
        .map((p) => `${ORIGIN}/${p}`)
        .sort(),
    )
  })

  it.each(['de', 'en'])(
    'links the imprint and the privacy page of its own language on every %s page',
    async (code) => {
      const out = await files(template)
      const pages = out.filter((file) => file.path.startsWith(`${code}/`))

      expect(pages).toHaveLength(3)
      for (const page of pages) {
        expect(page.content, page.path).toContain(`<html lang="${code}"`)
        expect(page.content, page.path).toContain(`href="/${code}/imprint"`)
        expect(page.content, page.path).toContain(`href="/${code}/privacy"`)
        expect(page.content, page.path).not.toContain('/terms"')
      }
    },
  )
})
