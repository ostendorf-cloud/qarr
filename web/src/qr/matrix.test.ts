// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { encode, EncodeError, inFinder } from './matrix'

describe('encode', () => {
  it('produces a square matrix with an odd edge', () => {
    const matrix = encode('https://qarr.example/start', 'M')
    expect(matrix.size % 2).toBe(1)
  })

  it('is stable: the same input twice gives the same matrix', () => {
    const first = encode('https://qarr.example/start', 'M')
    const second = encode('https://qarr.example/start', 'M')
    for (let y = 0; y < first.size; y++) {
      for (let x = 0; x < first.size; x++) expect(first.dark(x, y)).toBe(second.dark(x, y))
    }
  })

  it('grows the matrix for a higher error correction level at the same content', () => {
    const low = encode('https://qarr.example/start', 'L')
    const high = encode('https://qarr.example/start', 'H')
    expect(high.size).toBeGreaterThanOrEqual(low.size)
  })

  it('puts the finder patterns where the standard does', () => {
    const matrix = encode('https://qarr.example/start', 'M')
    // The outer corner of every finder pattern is dark.
    expect(matrix.dark(0, 0)).toBe(true)
    expect(matrix.dark(matrix.size - 1, 0)).toBe(true)
    expect(matrix.dark(0, matrix.size - 1)).toBe(true)
  })

  it('treats anything outside the matrix as light', () => {
    const matrix = encode('x', 'M')
    expect(matrix.dark(-1, 0)).toBe(false)
    expect(matrix.dark(0, -1)).toBe(false)
    expect(matrix.dark(matrix.size, 0)).toBe(false)
    expect(matrix.dark(0, matrix.size)).toBe(false)
  })
})

describe('inFinder', () => {
  it('covers the three corners and not the fourth', () => {
    const size = 21
    expect(inFinder(size, 0, 0)).toBe(true)
    expect(inFinder(size, size - 1, 0)).toBe(true)
    expect(inFinder(size, 0, size - 1)).toBe(true)
    // The bottom right corner carries data, not a finder pattern.
    expect(inFinder(size, size - 1, size - 1)).toBe(false)
    expect(inFinder(size, 10, 10)).toBe(false)
  })
})

describe('refusals', () => {
  it('refuses an empty string', () => {
    expect(() => encode('', 'M')).toThrow(EncodeError)
  })

  it('refuses content no version can hold', () => {
    expect(() => encode('x'.repeat(10_000), 'H')).toThrow(EncodeError)
  })
})
