// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * A WiFi network, in the format phones read from a QR code.
 *
 * Source: the ZXing project's "Barcode Contents" page, section "Wi-Fi Network
 * config", which Android and iOS follow:
 * https://github.com/zxing/zxing/wiki/Barcode-Contents#wi-fi-network-config-android-ios-11
 *
 *   WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<password>;H:<true|false>;;
 *
 * The characters \ ; , : and " in a value are escaped with a backslash.
 * Length limits: IEEE 802.11 allows an SSID of up to 32 octets, and a WPA
 * passphrase of 8 to 63 ASCII characters (IEEE 802.11i, H.4.1).
 *
 * Not handled: the page's note that an SSID or password made of hex digits
 * only is ambiguous to some readers and can be wrapped in quotes. This was
 * not verified against a reader, so the value is written as typed.
 */

import { finish, hasControl, utf8Length, type Errors, type Fields, type Outcome } from './shared'

export const WIFI_SECURITY = ['WPA', 'WEP', 'nopass'] as const

export const SSID_MAX_BYTES = 32
export const WPA_MIN = 8
export const WPA_MAX = 63

export function escapeWifi(value: string): string {
  return value.replace(/[\\;,:"]/g, '\\$&')
}

export function encodeWifi(fields: Fields): Outcome {
  const ssid = fields.ssid ?? ''
  const password = fields.password ?? ''
  const security = (WIFI_SECURITY as readonly string[]).includes(fields.security ?? '')
    ? fields.security
    : 'WPA'
  const errors: Errors = {}

  if (ssid === '') errors.ssid = { code: 'required' }
  else if (hasControl(ssid)) errors.ssid = { code: 'control' }
  else if (utf8Length(ssid) > SSID_MAX_BYTES) {
    errors.ssid = { code: 'tooLong', max: SSID_MAX_BYTES }
  }

  if (security !== 'nopass') {
    if (password === '') errors.password = { code: 'required' }
    else if (hasControl(password)) errors.password = { code: 'control' }
    else if (security === 'WPA' && utf8Length(password) < WPA_MIN) {
      errors.password = { code: 'tooShort', min: WPA_MIN }
    } else if (security === 'WPA' && utf8Length(password) > WPA_MAX) {
      errors.password = { code: 'tooLong', max: WPA_MAX }
    }
  }

  return finish(errors, () => {
    let out = `WIFI:T:${security};S:${escapeWifi(ssid)};`
    if (security !== 'nopass') out += `P:${escapeWifi(password)};`
    if (fields.hidden === 'true') out += 'H:true;'
    return `${out};`
  })
}
