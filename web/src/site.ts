// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * The route table of the site and the component of each page. The browser
 * entry and the prerender entry both read it, so the two cannot disagree on
 * which page lives at which path. It imports nothing from the server entry
 * of govue, so the browser bundle stays free of the server renderer.
 */

import type { Component } from 'vue'
import { legalRouteDefs, legalRoutes, type LegalPages, type RouteDef } from '@ostendorf-cloud/govue'

import App from './App.vue'
import ImprintPage from './pages/ImprintPage.vue'
import PrivacyPage from './pages/PrivacyPage.vue'

/** qarr sells nothing, so it has no terms page and leaves `terms` out. */
export const pages: LegalPages<Component> = {
  imprint: ImprintPage,
  privacy: PrivacyPage,
}

/** The start page and the legal pages. Every one is public. */
export const routes: RouteDef[] = [{ path: '/', public: true }, ...legalRouteDefs(pages)]

const records = legalRoutes(pages)

/**
 * The component for a localized path such as `/de/privacy`. Every path that
 * is not a legal page is the start page, which is also what the dev server
 * shows at `/`.
 */
export function pageFor(path: string): Component {
  return records.find((record) => record.path === path)?.component ?? App
}
