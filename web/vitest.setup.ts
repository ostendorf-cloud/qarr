// jest-dom's matchers, so an assertion reads as what a user would see:
// toBeVisible, toHaveAccessibleName, toBeDisabled.
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/vue'
import { afterEach } from 'vitest'

// Testing Library only registers this itself when Vitest runs with globals, and
// this package does not: without it one test finds the elements of the
// previous one.
afterEach(cleanup)

// jsdom draws no canvas at all, so it never defines the pixel buffer type a
// browser hands a 2d context. Tests that need one stub getContext anyway;
// this stub only keeps the constructor itself from being undefined.
if (typeof ImageData === 'undefined') {
  class ImageDataStub {
    data: Uint8ClampedArray
    width: number
    height: number

    constructor(data: Uint8ClampedArray, width: number, height?: number) {
      // A real constructor rejects a buffer whose length cannot be a whole
      // number of rows of this width; this stub rejects the same shapes,
      // rather than silently handing out a height that does not fit.
      if (data.length % 4 !== 0) {
        throw new RangeError('the input data length must be a multiple of 4')
      }
      if ((data.length / 4) % width !== 0) {
        throw new RangeError('the input data length is not a multiple of (4 * width)')
      }
      const rows = data.length / 4 / width
      if (height !== undefined && height !== rows) {
        throw new RangeError('the input data length does not match width and height')
      }
      this.data = data
      this.width = width
      this.height = height ?? rows
    }
  }

  globalThis.ImageData = ImageDataStub as unknown as typeof ImageData
}
