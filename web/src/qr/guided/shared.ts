// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * What every guided encoder shares: the shape of a validation result, the
 * helpers for UTF-8 lengths and line folding, and a few checks.
 */

/** The values of one form, by field key. Every value is a string. */
export type Fields = Record<string, string>

/**
 * Why a field was refused. The code picks the message in the language of the
 * page, `min` and `max` fill its numbers; this module never writes prose.
 */
export type ErrorCode =
  | 'required'
  | 'nameRequired'
  | 'control'
  | 'tooLong'
  | 'tooLongBytes'
  | 'tooShort'
  | 'format'
  | 'ibanChecksum'
  | 'amountRange'
  | 'endBeforeStart'
  | 'payloadTooBig'

export interface FieldError {
  code: ErrorCode
  min?: number
  max?: number
}

export type Errors = Record<string, FieldError>

/** Either the string the code carries, or an error per field that blocks it. */
export type Outcome = { ok: true; payload: string } | { ok: false; errors: Errors }

export function finish(errors: Errors, payload: () => string): Outcome {
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, payload: payload() }
}

/** The number of bytes a string takes in UTF-8. */
export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length
}

/** Any control character, including a line break. */
const CONTROL = /[\u0000-\u001f\u007f]/
/** A control character other than a tab or a line break, for multi line text. */
const CONTROL_MULTILINE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export function hasControl(value: string, multiline = false): boolean {
  return (multiline ? CONTROL_MULTILINE : CONTROL).test(value)
}

/** Line breaks as a single LF, so a form on any platform gives one result. */
export function normaliseNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

/**
 * Folds a content line at 75 octets, a break being CRLF and one space, never
 * inside a UTF-8 sequence. RFC 5545 section 3.1 and RFC 2425 section 5.8.1
 * both name 75 octets as the limit a line should stay within.
 */
export function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let size = 0
  // The continuation lines start with a space, which counts against the 75.
  let limit = 75
  for (const char of line) {
    const width = encoder.encode(char).length
    if (size + width > limit) {
      parts.push(current)
      current = ''
      size = 0
      limit = 74
    }
    current += char
    size += width
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/** FNV-1a, 32 bit, as eight hex digits: a stable id from a value, not a secret. */
export function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
