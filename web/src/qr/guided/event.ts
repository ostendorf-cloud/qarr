// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * An appointment, as an iCalendar event.
 *
 * Source: RFC 5545 (iCalendar). TEXT escaping per section 3.3.11: backslash,
 * semicolon and comma are escaped with a backslash, a line break becomes \n.
 * Lines are CRLF separated and folded at 75 octets (section 3.1). The event
 * sits in a VCALENDAR with VERSION and PRODID, which section 3.6 requires.
 *
 * Times are written as floating local times (section 3.3.5, form 1): the
 * reader's calendar reads them in its own zone, which is what a person
 * typing "14:00" means. A whole day uses VALUE=DATE, and its DTEND is the day
 * after the last day, since section 3.6.1 makes DTEND exclusive.
 *
 * DTSTAMP is the moment of creation in UTC and is passed in so a test can fix
 * it. UID is a hash of the event's own fields, so the same event keeps the
 * same UID.
 */

import {
  finish,
  fnv1a,
  fold,
  hasControl,
  normaliseNewlines,
  type Errors,
  type Fields,
  type Outcome,
} from './shared'

const TIMED = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

export function escapeText(value: string): string {
  return normaliseNewlines(value)
    .replace(/[\\;,]/g, '\\$&')
    .replace(/\n/g, '\\n')
}

/** Whether year, month and day name a real day. */
function realDay(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** The moment as YYYYMMDD or YYYYMMDDTHHMMSS, or null when it is not valid. */
function parse(value: string, allDay: boolean): string | null {
  if (allDay) {
    const m = DAY.exec(value)
    if (!m || !realDay(+m[1], +m[2], +m[3])) return null
    return `${m[1]}${m[2]}${m[3]}`
  }
  const m = TIMED.exec(value)
  if (!m || !realDay(+m[1], +m[2], +m[3]) || +m[4] > 23 || +m[5] > 59) return null
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00`
}

function nextDay(compact: string): string {
  const date = new Date(
    Date.UTC(+compact.slice(0, 4), +compact.slice(4, 6) - 1, +compact.slice(6, 8)),
  )
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function stamp(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`
}

export function encodeEvent(fields: Fields, now: Date = new Date()): Outcome {
  const title = (fields.title ?? '').trim()
  const location = (fields.location ?? '').trim()
  const description = (fields.description ?? '').trim()
  const allDay = fields.allDay === 'true'
  const errors: Errors = {}

  if (title === '') errors.title = { code: 'required' }
  else if (hasControl(title)) errors.title = { code: 'control' }
  if (hasControl(location)) errors.location = { code: 'control' }
  if (hasControl(description, true)) errors.description = { code: 'control' }

  const start = parse(fields.start ?? '', allDay)
  if ((fields.start ?? '') === '') errors.start = { code: 'required' }
  else if (start === null) errors.start = { code: 'format' }

  let end: string | null = null
  if ((fields.end ?? '') !== '') {
    end = parse(fields.end ?? '', allDay)
    if (end === null) errors.end = { code: 'format' }
    else if (start !== null && end < start) errors.end = { code: 'endBeforeStart' }
  }

  return finish(errors, () => {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//qarr//EN',
      'BEGIN:VEVENT',
      `UID:${fnv1a([title, fields.start, fields.end, location, description].join('\n'))}@qarr`,
      `DTSTAMP:${stamp(now)}`,
    ]
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${start}`)
      if (end) lines.push(`DTEND;VALUE=DATE:${nextDay(end)}`)
    } else {
      lines.push(`DTSTART:${start}`)
      if (end) lines.push(`DTEND:${end}`)
    }
    lines.push(`SUMMARY:${escapeText(title)}`)
    if (location) lines.push(`LOCATION:${escapeText(location)}`)
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`)
    lines.push('END:VEVENT', 'END:VCALENDAR')
    return `${lines.map(fold).join('\r\n')}\r\n`
  })
}
