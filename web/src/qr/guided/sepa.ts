// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * A SEPA credit transfer, as the EPC QR code.
 *
 * Source: European Payments Council, "Quick Response Code: Guidelines to
 * Enable the Data Capture for the Initiation of a SEPA Credit Transfer"
 * (EPC069-12), service tag BCD, version 002. Lines, separated by LF:
 *
 *   1 BCD            service tag
 *   2 002            version; BIC is optional from version 002 on,
 *                   but only for an account in the EEA (see EEA_COUNTRIES)
 *   3 1              character set, 1 is UTF-8
 *   4 SCT            identification
 *   5 BIC            optional, 8 or 11 characters
 *   6 name           beneficiary, at most 70 characters
 *   7 IBAN           at most 34 characters, no spaces
 *   8 EUR12.34       optional, 0.01 to 999999999.99, a dot as separator
 *   9 purpose code   not offered here
 *  10 structured reference, not offered here
 *  11 remittance information, unstructured, at most 140 characters
 *  12 beneficiary to originator information, not offered here
 *
 * The whole payload is at most 331 bytes. Trailing empty lines are left out.
 * The IBAN is checked by ISO 13616 / ISO 7064 MOD 97-10: the first four
 * characters move to the end, letters become 10 to 35, and the number must
 * leave remainder 1 modulo 97. Nothing here checks that the account exists.
 * Accepted risk: the length a given country fixes for its IBANs is not
 * checked either, only the shape and the MOD 97 check above.
 */

import { finish, hasControl, utf8Length, type Errors, type Fields, type Outcome } from './shared'

export const NAME_MAX = 70
export const REMITTANCE_MAX = 140
export const PAYLOAD_MAX_BYTES = 331

/** An IBAN as typed, without spaces and in capitals. */
export function normaliseIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/** Whether the IBAN has the right shape and passes the MOD 97 check. */
export function ibanChecksumOk(iban: string): boolean {
  const moved = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of moved) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

/**
 * The EEA, whose accounts may leave the BIC out. EPC069-12 v3.1 makes the
 * BIC mandatory for the SEPA countries outside the EEA (CH, GB, MC, SM, AD,
 * VA). The EEA is the EU member states plus IS, LI and NO (EEA Agreement).
 */
export const EEA_COUNTRIES: readonly string[] = [
  ...['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE'],
  ...['IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'],
  ...['IS', 'LI', 'NO'],
]

const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/
const BIC_SHAPE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/

/**
 * The amount as EUR and cents text, "12.50", or null when it is not a plain
 * number with a comma or dot and at most two decimals. Done on the text, not
 * on a float, so no amount is ever rounded.
 */
export function parseAmount(value: string): string | null {
  const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(value.replace(/\s+/g, ''))
  if (!m) return null
  return `${String(Number(m[1]))}.${(m[2] ?? '').padEnd(2, '0')}`
}

export function encodeSepa(fields: Fields): Outcome {
  const name = (fields.name ?? '').trim()
  const iban = normaliseIban(fields.iban ?? '')
  const bic = (fields.bic ?? '').replace(/\s+/g, '').toUpperCase()
  const amountText = (fields.amount ?? '').trim()
  const remittance = (fields.remittance ?? '').trim()
  const errors: Errors = {}

  if (name === '') errors.name = { code: 'required' }
  else if (hasControl(name)) errors.name = { code: 'control' }
  else if ([...name].length > NAME_MAX) errors.name = { code: 'tooLong', max: NAME_MAX }

  if (iban === '') errors.iban = { code: 'required' }
  else if (!IBAN_SHAPE.test(iban)) errors.iban = { code: 'format' }
  else if (!ibanChecksumOk(iban)) errors.iban = { code: 'ibanChecksum' }

  if (bic !== '' && !BIC_SHAPE.test(bic)) errors.bic = { code: 'format' }
  else if (bic === '' && IBAN_SHAPE.test(iban) && !EEA_COUNTRIES.includes(iban.slice(0, 2))) {
    errors.bic = { code: 'required' }
  }

  let amount = ''
  if (amountText !== '') {
    const parsed = parseAmount(amountText)
    if (parsed === null) errors.amount = { code: 'format' }
    else if (parsed === '0.00') errors.amount = { code: 'amountRange' }
    else amount = `EUR${parsed}`
  }

  if (hasControl(remittance)) errors.remittance = { code: 'control' }
  else if ([...remittance].length > REMITTANCE_MAX) {
    errors.remittance = { code: 'tooLong', max: REMITTANCE_MAX }
  }

  const build = (): string => {
    const lines = ['BCD', '002', '1', 'SCT', bic, name, iban, amount, '', '', remittance]
    while (lines.length > 7 && lines[lines.length - 1] === '') lines.pop()
    return lines.join('\n')
  }

  if (Object.keys(errors).length === 0 && utf8Length(build()) > PAYLOAD_MAX_BYTES) {
    errors.remittance = { code: 'payloadTooBig', max: PAYLOAD_MAX_BYTES }
  }

  return finish(errors, build)
}
