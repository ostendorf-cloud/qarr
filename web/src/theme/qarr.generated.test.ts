// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// govue's package exports do not list its generator, so it is reached by path.
import { generateTheme } from '../../node_modules/@ostendorf-cloud/govue/src/theme/generate.ts'

import { SEEDS } from './seeds'

const themeFile = resolve(import.meta.dirname, 'qarr.css')

describe('qarr theme file', () => {
  it('is what govue generates from the seeds', () => {
    const result = generateTheme(SEEDS) as { ok: boolean; css?: string; errors?: string[] }
    expect(result.errors).toBeUndefined()
    expect(result.ok).toBe(true)
    if (process.env.THEME_WRITE === '1') {
      writeFileSync(themeFile, result.css as string)
    }
    expect(readFileSync(themeFile, 'utf8')).toBe(result.css)
  })
})
