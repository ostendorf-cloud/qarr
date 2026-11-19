// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { EEA_COUNTRIES, encodeSepa, ibanChecksumOk, normaliseIban, parseAmount } from './sepa'

const IBAN = 'DE89 3704 0044 0532 0130 00'

function payload(fields: Record<string, string>): string {
  const outcome = encodeSepa(fields)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.errors)}`)
  return outcome.payload
}

describe('encodeSepa', () => {
  it('writes every line of the EPC code, UTF-8 and version 002', () => {
    expect(
      payload({
        name: 'Max Müller',
        iban: IBAN,
        bic: 'cobadeffxxx',
        amount: '12,5',
        remittance: 'Rechnung 42',
      }),
    ).toBe(
      'BCD\n002\n1\nSCT\nCOBADEFFXXX\nMax Müller\nDE89370400440532013000\nEUR12.50\n\n\nRechnung 42',
    )
  })

  it('leaves the empty trailing lines out, and needs no BIC', () => {
    expect(payload({ name: 'Max', iban: IBAN })).toBe(
      'BCD\n002\n1\nSCT\n\nMax\nDE89370400440532013000',
    )
  })

  it('keeps an empty amount line when a reference follows', () => {
    expect(payload({ name: 'Max', iban: IBAN, remittance: 'x' })).toBe(
      'BCD\n002\n1\nSCT\n\nMax\nDE89370400440532013000\n\n\n\nx',
    )
  })

  it('accepts an IBAN with spaces and in lower case', () => {
    expect(payload({ name: 'Max', iban: 'de89 3704 0044 0532 0130 00' })).toContain(
      '\nDE89370400440532013000',
    )
  })

  it('refuses an IBAN with a wrong checksum, at the IBAN field', () => {
    expect(encodeSepa({ name: 'Max', iban: 'DE89 3704 0044 0532 0130 01' })).toEqual({
      ok: false,
      errors: { iban: { code: 'ibanChecksum' } },
    })
  })

  it('refuses an IBAN of the wrong shape', () => {
    for (const iban of ['1234', 'DE89', 'DE89 3704 0044 0532 0130 00 99999999999999999']) {
      expect(encodeSepa({ name: 'Max', iban })).toEqual({
        ok: false,
        errors: { iban: { code: 'format' } },
      })
    }
  })

  it('refuses a missing name and a missing IBAN', () => {
    expect(encodeSepa({})).toEqual({
      ok: false,
      errors: { name: { code: 'required' }, iban: { code: 'required' } },
    })
  })

  it('requires the BIC outside the EEA and not inside it', () => {
    const CH = 'CH93 0076 2011 6238 5295 7'
    expect(encodeSepa({ name: 'Max', iban: CH })).toEqual({
      ok: false,
      errors: { bic: { code: 'required' } },
    })
    expect(encodeSepa({ name: 'Max', iban: CH, bic: 'UBSWCHZH80A' }).ok).toBe(true)
    expect(encodeSepa({ name: 'Max', iban: IBAN }).ok).toBe(true)
    expect(EEA_COUNTRIES).toHaveLength(30)
    for (const code of ['CH', 'GB', 'MC', 'SM', 'AD', 'VA']) {
      expect(EEA_COUNTRIES).not.toContain(code)
    }
  })

  it('checks the BIC shape when one is given', () => {
    expect(encodeSepa({ name: 'Max', iban: IBAN, bic: 'ABC' })).toEqual({
      ok: false,
      errors: { bic: { code: 'format' } },
    })
    expect(encodeSepa({ name: 'Max', iban: IBAN, bic: 'COBADEFF' }).ok).toBe(true)
  })

  it('takes an amount with a comma or a dot and refuses the rest', () => {
    expect(payload({ name: 'a', iban: IBAN, amount: '0,5' })).toContain('\nEUR0.50')
    expect(payload({ name: 'a', iban: IBAN, amount: '1234.5' })).toContain('\nEUR1234.50')
    expect(payload({ name: 'a', iban: IBAN, amount: '999999999.99' })).toContain('EUR999999999.99')
    for (const amount of ['1.234,56', '12,345', '12.', '-5', 'abc', '1000000000']) {
      expect(encodeSepa({ name: 'a', iban: IBAN, amount })).toEqual({
        ok: false,
        errors: { amount: { code: 'format' } },
      })
    }
    for (const amount of ['0', '0,00']) {
      expect(encodeSepa({ name: 'a', iban: IBAN, amount })).toEqual({
        ok: false,
        errors: { amount: { code: 'amountRange' } },
      })
    }
  })

  it('holds the name to 70 characters and the reference to 140', () => {
    expect(encodeSepa({ name: 'a'.repeat(71), iban: IBAN })).toEqual({
      ok: false,
      errors: { name: { code: 'tooLong', max: 70 } },
    })
    expect(encodeSepa({ name: 'a', iban: IBAN, remittance: 'b'.repeat(141) })).toEqual({
      ok: false,
      errors: { remittance: { code: 'tooLong', max: 140 } },
    })
    expect(encodeSepa({ name: 'a'.repeat(70), iban: IBAN, remittance: 'b'.repeat(140) }).ok).toBe(
      true,
    )
  })

  it('counts the 331 bytes of the whole text, so a long non-ASCII text is refused', () => {
    expect(
      encodeSepa({
        name: 'ü'.repeat(70),
        iban: IBAN,
        bic: 'COBADEFFXXX',
        amount: '999999999.99',
        remittance: 'b'.repeat(140),
      }),
    ).toEqual({ ok: false, errors: { remittance: { code: 'payloadTooBig', max: 331 } } })
  })

  it('refuses a line break, which would shift every following line', () => {
    expect(encodeSepa({ name: 'a\nb', iban: IBAN })).toEqual({
      ok: false,
      errors: { name: { code: 'control' } },
    })
  })

  it('carries non-ASCII names as they are', () => {
    expect(payload({ name: 'Zoë Łukasz 日本', iban: IBAN })).toContain('\nZoë Łukasz 日本\n')
  })
})

describe('ibanChecksumOk', () => {
  it('accepts published example IBANs of three countries', () => {
    for (const iban of [
      'DE89370400440532013000',
      'GB82WEST12345698765432',
      'FR1420041010050500013M02606',
    ]) {
      expect(ibanChecksumOk(iban)).toBe(true)
    }
  })

  it('rejects a changed digit and a swapped pair', () => {
    expect(ibanChecksumOk('DE89370400440532013001')).toBe(false)
    expect(ibanChecksumOk('DE89370400440532013000'.replace('0532', '5032'))).toBe(false)
  })
})

describe('helpers', () => {
  it('normalises an IBAN', () => {
    expect(normaliseIban(' de89 3704\t0044 ')).toBe('DE8937040044')
  })

  it('parses an amount on the text, without rounding', () => {
    expect(parseAmount('0007,1')).toBe('7.10')
    expect(parseAmount('19.99')).toBe('19.99')
    expect(parseAmount('1 234')).toBe('1234.00')
  })
})
