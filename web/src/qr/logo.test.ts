// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

import { dataURL, fromFile, ImageError, MAX_LOGO_BYTES } from './logo'

afterEach(() => {
  vi.restoreAllMocks()
})

/** A tiny file whose declared size is what fromFile checks, not its bytes. */
function fileOfSize(bytes: number, type = 'image/png'): File {
  return { size: bytes, name: 'logo.png', type } as unknown as File
}

describe('fromFile', () => {
  it.each(['image/gif', 'image/webp', 'text/html', 'application/pdf', ''])(
    'refuses the type %j before reading anything',
    async (type) => {
      const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')

      await expect(fromFile(fileOfSize(10, type), 0.2, true)).rejects.toThrow(/PNG, JPEG or SVG/)
      expect(read).not.toHaveBeenCalled()
    },
  )

  it('refuses a picture larger than the limit, with the limit', async () => {
    await expect(fromFile(fileOfSize(MAX_LOGO_BYTES + 1), 0.2, true)).rejects.toThrow(ImageError)
    await expect(fromFile(fileOfSize(MAX_LOGO_BYTES + 1), 0.2, true)).rejects.toThrow(/KB/)
  })

  it('accepts a picture exactly at the limit', async () => {
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: 'data:image/png;base64,AA==', writable: true })
      this.onload?.(new Event('load') as ProgressEvent<FileReader>)
    })
    vi.stubGlobal(
      'Image',
      class {
        width = 4
        height = 4
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_value: string) {
          this.onload?.()
        }
      },
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(4 * 4 * 4) }),
    } as unknown as CanvasRenderingContext2D)

    const logo = await fromFile(fileOfSize(MAX_LOGO_BYTES), 0.25, true)

    expect(logo.fraction).toBe(0.25)
    expect(logo.plate).toBe(true)
    expect(logo.width).toBe(4)
    expect(logo.height).toBe(4)
  })

  it('refuses a picture with no width or height of its own, such as a sizeless SVG', async () => {
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', {
        value: 'data:image/svg+xml;base64,AA==',
        writable: true,
      })
      this.onload?.(new Event('load') as ProgressEvent<FileReader>)
    })
    vi.stubGlobal(
      'Image',
      class {
        width = 0
        height = 0
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_value: string) {
          this.onload?.()
        }
      },
    )

    await expect(fromFile(fileOfSize(10), 0.2, true)).rejects.toThrow(/no size of its own/)
  })

  it('reports a picture that fails to load', async () => {
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: 'data:image/png;base64,AA==', writable: true })
      this.onload?.(new Event('load') as ProgressEvent<FileReader>)
    })
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_value: string) {
          this.onerror?.()
        }
      },
    )

    await expect(fromFile(fileOfSize(10), 0.2, true)).rejects.toThrow(/could not be loaded/)
  })
})

describe('dataURL', () => {
  it('re-encodes a logo as a png data URL', () => {
    const toDataURL = vi.fn(() => 'data:image/png;base64,BB==')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toDataURL)

    const side = 4
    const url = dataURL({
      pixels: new Uint8ClampedArray(side * side * 4),
      width: side,
      height: side,
      fraction: 0.2,
      plate: true,
    })

    expect(url).toBe('data:image/png;base64,BB==')
    expect(toDataURL).toHaveBeenCalledWith('image/png')
  })

  it('refuses when the browser gives no 2d context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const side = 2
    expect(() =>
      dataURL({
        pixels: new Uint8ClampedArray(side * side * 4),
        width: side,
        height: side,
        fraction: 0.2,
        plate: true,
      }),
    ).toThrow(/2d context/)
  })
})
