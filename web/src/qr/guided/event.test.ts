// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'

import { encodeEvent } from './event'

const NOW = new Date('2026-11-19T10:00:00Z')

function payload(fields: Record<string, string>): string {
  const outcome = encodeEvent(fields, NOW)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.errors)}`)
  return outcome.payload
}

function uid(card: string): string {
  return /UID:(.+)\r\n/.exec(card)?.[1] ?? ''
}

describe('encodeEvent', () => {
  it('writes a timed event with floating local times and escaped text', () => {
    const card = payload({
      title: 'Meet, plan; go',
      start: '2026-12-01T14:30',
      end: '2026-12-01T15:30',
      location: 'Room 1',
      description: 'a\nb\\c',
    })

    expect(card).toBe(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//qarr//EN',
        'BEGIN:VEVENT',
        `UID:${uid(card)}`,
        'DTSTAMP:20261119T100000Z',
        'DTSTART:20261201T143000',
        'DTEND:20261201T153000',
        'SUMMARY:Meet\\, plan\\; go',
        'LOCATION:Room 1',
        'DESCRIPTION:a\\nb\\\\c',
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    )
    expect(uid(card)).toMatch(/^[0-9a-f]{8}@qarr$/)
  })

  it('leaves out DTEND, LOCATION and DESCRIPTION when empty', () => {
    const card = payload({ title: 'Call', start: '2026-12-01T09:00' })
    expect(card).not.toMatch(/DTEND|LOCATION|DESCRIPTION/)
  })

  it('writes a whole day with an exclusive end, across a month and a year', () => {
    const card = payload({
      title: 'Holiday',
      allDay: 'true',
      start: '2026-12-30',
      end: '2026-12-31',
    })
    expect(card).toContain('DTSTART;VALUE=DATE:20261230\r\nDTEND;VALUE=DATE:20270101\r\n')
  })

  it('handles the day after a leap day', () => {
    const card = payload({ title: 'x', allDay: 'true', start: '2028-02-28', end: '2028-02-29' })
    expect(card).toContain('DTEND;VALUE=DATE:20280301')
  })

  it('keeps the same UID for the same event and changes it for another', () => {
    const a = payload({ title: 'A', start: '2026-12-01T09:00' })
    expect(uid(payload({ title: 'A', start: '2026-12-01T09:00' }))).toBe(uid(a))
    expect(uid(payload({ title: 'B', start: '2026-12-01T09:00' }))).not.toBe(uid(a))
  })

  it('needs a title and a start, at their own fields', () => {
    expect(encodeEvent({}, NOW)).toEqual({
      ok: false,
      errors: { title: { code: 'required' }, start: { code: 'required' } },
    })
  })

  it('refuses an impossible date and the wrong shape for the mode', () => {
    expect(encodeEvent({ title: 'x', start: '2026-02-30T10:00' }, NOW)).toEqual({
      ok: false,
      errors: { start: { code: 'format' } },
    })
    expect(encodeEvent({ title: 'x', start: '2026-12-01T25:00' }, NOW).ok).toBe(false)
    expect(encodeEvent({ title: 'x', allDay: 'true', start: '2026-12-01T10:00' }, NOW).ok).toBe(
      false,
    )
  })

  it('refuses an end before the start, at the end field', () => {
    expect(
      encodeEvent({ title: 'x', start: '2026-12-01T10:00', end: '2026-12-01T09:59' }, NOW),
    ).toEqual({ ok: false, errors: { end: { code: 'endBeforeStart' } } })
  })

  it('refuses a line break in the title and folds a long one', () => {
    expect(encodeEvent({ title: 'a\nb', start: '2026-12-01T10:00' }, NOW).ok).toBe(false)
    const lines = payload({ title: 'x'.repeat(100), start: '2026-12-01T10:00' }).split('\r\n')
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(75)
  })

  it('carries non-ASCII text', () => {
    expect(payload({ title: 'Müller-Treffen 日本', start: '2026-12-01T10:00' })).toContain(
      'SUMMARY:Müller-Treffen 日本\r\n',
    )
  })
})
