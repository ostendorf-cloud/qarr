// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  failures,
  NON_TEXT_MINIMUM,
  NON_TEXT_PAIRS,
  TEXT_MINIMUM,
  TEXT_PAIRS,
  tokens,
} from './contrast'

const themeFile = resolve(import.meta.dirname, 'qarr.css')
const palettes = tokens(readFileSync(themeFile, 'utf8'))

describe('qarr theme', () => {
  it('defines every token the components use', () => {
    const required = new Set([...TEXT_PAIRS, ...NON_TEXT_PAIRS].flat())
    for (const mode of ['light', 'dark'] as const) {
      for (const token of required) {
        expect(palettes[mode], `--color-${token} in ${mode}`).toHaveProperty(token)
      }
    }
  })

  it.each(['light', 'dark'] as const)('reaches AA for text in %s mode', (mode) => {
    expect(failures(palettes[mode], TEXT_PAIRS, TEXT_MINIMUM)).toEqual([])
  })

  it.each(['light', 'dark'] as const)('reaches AA for boundaries in %s mode', (mode) => {
    expect(failures(palettes[mode], NON_TEXT_PAIRS, NON_TEXT_MINIMUM)).toEqual([])
  })
})
