// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * The SSR entry `govue-prerender --out-dir` loads. It writes one page per
 * route and language, and the sitemap. `task web:build` runs it after the
 * client build, then runs `govue-check-legal` on the result.
 */

import { createGovueI18n } from '@ostendorf-cloud/govue'
import { localizedFiles, render, type PrerenderFile } from '@ostendorf-cloud/govue/server'

import { pageFor, routes } from './site'

/**
 * The origin baked into the canonical links, the hreflang links and the
 * sitemap. The Go server replaces it by SITE_URL when it loads the pages, so
 * it must equal config.DefaultSiteURL.
 */
export const ORIGIN = 'https://qarr.de'

export function files(template: string): Promise<PrerenderFile[]> {
  return localizedFiles(routes, {
    origin: ORIGIN,
    template,
    render: (variant) =>
      render(pageFor(variant.path), {
        setup: (app) => {
          app.use(createGovueI18n({ locale: variant.locale }))
        },
      }),
  })
}
