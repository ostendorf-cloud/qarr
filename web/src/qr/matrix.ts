// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * Encoding a string into the module matrix of a QR code, entirely in the
 * browser. Nothing here calls out: the string arrives as an argument and the
 * matrix comes back as a value, which is what keeps the payload inside the
 * tab. See docs/adr/0001.
 *
 * qrcode-generator implements the standard's own mask selection rather than
 * picking a mask of its own, which is why its output matches a conforming
 * decoder. It is the smallest widely used encoder that exposes the module
 * matrix directly, which this app needs to draw its own colours, shapes and
 * logo rather than handing out a picture the library already drew.
 */

import qrcode from 'qrcode-generator'

// The library's default turns every UTF-16 unit into one byte and drops the
// high half, which corrupts anything beyond ASCII. Readers, and the EPC
// SEPA format, expect UTF-8 in the byte mode.
const utf8 = new TextEncoder()
qrcode.stringToBytes = (s: string): number[] => Array.from(utf8.encode(s))

/** Error correction, by the standard's own letters. */
export type Level = 'L' | 'M' | 'Q' | 'H'

/** The order a repair raises the level in. */
export const LEVELS: readonly Level[] = ['L', 'M', 'Q', 'H'] as const

/**
 * The edge of a finder pattern in modules, as the standard fixes it: a 7 by 7
 * block in three of the four corners.
 */
export const FINDER_SIZE = 7

/** Which modules of a code are dark. */
export class Matrix {
  readonly size: number
  private readonly cells: boolean[]

  constructor(size: number, cells: boolean[]) {
    this.size = size
    this.cells = cells
  }

  /**
   * Whether the module at x, y is painted. Anything outside the matrix is
   * light, so a caller drawing a quiet zone needs no bounds check.
   */
  dark(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false
    return this.cells[y * this.size + x]
  }
}

/**
 * Whether a module belongs to one of the three finder patterns. The fourth
 * corner carries data and is not one.
 *
 * Every drawing asks this: a finder is drawn square whatever the module shape
 * is, because dots that do not touch make the pattern a decoder locates the
 * code by unfindable.
 */
export function inFinder(size: number, x: number, y: number): boolean {
  const f = FINDER_SIZE
  if (x >= f && y >= f && x < size - f && y < size - f) return false
  return (x < f && y < f) || (x >= size - f && y < f) || (x < f && y >= size - f)
}

/** Why a string could not be encoded. */
export class EncodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EncodeError'
  }
}

/**
 * Turns the string a scanner will read into a matrix at the given level.
 *
 * The type number is 0, which asks the encoder to pick the smallest version
 * that fits the content.
 */
export function encode(content: string, level: Level): Matrix {
  if (content === '') throw new EncodeError('nothing to encode')
  let code: ReturnType<typeof qrcode>
  try {
    code = qrcode(0, level)
    code.addData(content)
    code.make()
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : String(caught)
    throw new EncodeError(`the content does not fit in a code: ${reason}`)
  }
  const size = code.getModuleCount()
  const cells = new Array<boolean>(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // The library takes the row first and the column second, the other way
      // round from everything else here.
      cells[y * size + x] = code.isDark(y, x)
    }
  }
  return new Matrix(size, cells)
}
