// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * Turning a picture someone chose on their own device into the pixels the
 * renderer draws from. A preset logo served from a bucket is a later issue;
 * this is upload only.
 *
 * A canvas is the only way a browser exposes the bytes of an image, so this
 * is the one place in the pipeline that needs a DOM. Everything downstream
 * works on the buffer, and nothing here uploads the picture anywhere: it
 * stays a local file read into memory.
 */

import type { Logo } from './style'

/** The largest picture accepted. Beyond this it is not a logo. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024

/**
 * The size the picture is reduced to before it is kept. A logo ends up a few
 * dozen pixels across in a code; holding more is memory for nothing.
 */
const WORKING_SIZE = 256

export class ImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageError'
  }
}

/**
 * Reads a picture from a data URL and hands back its pixels, scaled down to
 * a size a logo never needs more than.
 */
async function toLogo(source: string, fraction: number, plate: boolean): Promise<Logo> {
  const picture = await load(source)
  // An SVG without a width and a height on its root element loads happily
  // and measures zero, which would scale to a single pixel and look like
  // nothing happened. Saying so beats a logo that silently is not there.
  if (picture.width === 0 || picture.height === 0) {
    throw new ImageError(
      'this picture has no size of its own; an SVG needs a width and a height on its root element',
    )
  }
  const scale = Math.min(1, WORKING_SIZE / Math.max(picture.width, picture.height))
  const width = Math.max(1, Math.round(picture.width * scale))
  const height = Math.max(1, Math.round(picture.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new ImageError('this browser gave no 2d context')
  context.drawImage(picture, 0, 0, width, height)

  const data = context.getImageData(0, 0, width, height)
  return { pixels: data.data, width, height, fraction, plate }
}

function load(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new ImageError('that picture could not be loaded'))
    image.src = source
  })
}

/** Checks a chosen file before it is loaded at all, and reads it as a logo. */
export async function fromFile(file: File, fraction: number, plate: boolean): Promise<Logo> {
  if (file.size > MAX_LOGO_BYTES) {
    throw new ImageError(`the picture must be at most ${Math.round(MAX_LOGO_BYTES / 1024)} KB`)
  }
  // A data URL, not a blob URL: it needs no later revoking, and it is what
  // lets the picture be re-embedded into an exported SVG once the drawn code
  // is gone from the page.
  return toLogo(await asDataURL(file), fraction, plate)
}

function asDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new ImageError('that file could not be read'))
    }
    reader.onerror = () => reject(new ImageError('that file could not be read'))
    reader.readAsDataURL(file)
  })
}

/**
 * Re-encodes a logo for embedding in an SVG, which cannot reference a blob
 * that will be gone by the time the file is opened.
 */
export function dataURL(logo: Logo): string {
  const canvas = document.createElement('canvas')
  canvas.width = logo.width
  canvas.height = logo.height
  const context = canvas.getContext('2d')
  if (!context) throw new ImageError('this browser gave no 2d context')
  context.putImageData(new ImageData(logo.pixels, logo.width, logo.height), 0, 0)
  return canvas.toDataURL('image/png')
}
