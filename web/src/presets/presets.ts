// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * The preset logos a deployment offers. They are the only pictures this page
 * ever asks the server for: the list at /logos.json and each picture under
 * /logos/. Both are answered by this origin and never redirected, so a picture
 * drawn on the canvas does not taint it and the drawing can still be read back.
 *
 * A logo a visitor chooses from their own device never comes through here: it
 * is read in the tab by qr/logo.ts and is not sent anywhere.
 */

/** Where the server lists its presets. */
export const LIST_URL = '/logos.json'

/** Every picture lives under this path, on this origin. */
const PICTURE_PREFIX = '/logos/'

/** The most presets shown, so a bucket full of files cannot swamp the page. */
export const MAX_PRESETS = 100

/** One preset: a file name, and the path of its picture on this origin. */
export interface Preset {
  name: string
  url: string
}

/** A picture that could not be fetched. */
export class PresetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PresetError'
  }
}

function isPreset(value: unknown): value is Preset {
  if (typeof value !== 'object' || value === null) return false
  const { name, url } = value as Record<string, unknown>
  // The path is checked rather than trusted: only a path under /logos/ of this
  // origin is ever fetched, never an absolute address or another route.
  return (
    typeof name === 'string' &&
    name !== '' &&
    typeof url === 'string' &&
    url.startsWith(PICTURE_PREFIX) &&
    !url.includes('..') &&
    !url.includes('?') &&
    !url.includes('#')
  )
}

/**
 * Fetches the list of presets. Any failure is an empty list: presets are an
 * extra, and the page works as an upload only page without them.
 */
export async function listPresets(signal?: AbortSignal): Promise<Preset[]> {
  try {
    const response = await fetch(LIST_URL, { signal, credentials: 'omit', redirect: 'error' })
    if (!response.ok) return []
    const body: unknown = await response.json()
    const logos = (body as { logos?: unknown } | null)?.logos
    if (!Array.isArray(logos)) return []
    return logos
      .filter(isPreset)
      .slice(0, MAX_PRESETS)
      .map(({ name, url }) => ({ name, url }))
  } catch {
    return []
  }
}

/**
 * Fetches one picture as a File, which qr/logo.ts then checks and reads the
 * same way as a file chosen on the device.
 */
export async function fetchPreset(preset: Preset, signal?: AbortSignal): Promise<File> {
  if (!isPreset(preset)) throw new PresetError('that preset is not valid')
  let response: Response
  try {
    response = await fetch(preset.url, { signal, credentials: 'omit', redirect: 'error' })
  } catch {
    throw new PresetError('that preset could not be loaded')
  }
  if (!response.ok) throw new PresetError('that preset could not be loaded')
  const blob = await response.blob()
  return new File([blob], preset.name, { type: blob.type })
}

/** The label of a preset: its file name without the extension. */
export function labelOf(preset: Preset): string {
  const dot = preset.name.lastIndexOf('.')
  return dot > 0 ? preset.name.slice(0, dot) : preset.name
}
