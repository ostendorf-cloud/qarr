// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * Test helper: what a fetch spy saw, reduced to what matters for the privacy
 * claim. The page asks its own origin for the list of presets and for nothing
 * else, and a request carries no body, so nothing typed can travel in it.
 */

import { LIST_URL } from './presets'

/** The addresses a fetch spy was called with, in order. */
export function requested(spy: { mock: { calls: unknown[][] } }): unknown[] {
  return spy.mock.calls.map((call) => call[0])
}

/** True when no recorded call carried a body. */
export function carriedNoBody(spy: { mock: { calls: unknown[][] } }): boolean {
  return spy.mock.calls.every((call) => (call[1] as RequestInit | undefined)?.body == null)
}

/** The one request the start page makes on load. */
export const ONLY_THE_LIST = [LIST_URL]
