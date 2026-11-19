// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * qarr's own texts, merged into govue's language layer under the key `qarr`
 * (main.ts, entry-prerender.ts). Only the guided input is here so far: the
 * rest of the start page is English only, see AGENTS.md.
 *
 * vue-i18n gives "@", "|", "{" and "}" a meaning inside a message, so none of
 * them appears in a text below except as a {name} placeholder.
 */

import { inject } from 'vue'
import { languageKey, type MessageTree } from '@ostendorf-cloud/govue'

const en: MessageTree = {
  kind: {
    label: 'What the code says',
    hint: 'A guided form builds the text for you, in the format scanners expect.',
    text: 'Free text',
    wifi: 'WiFi',
    vcard: 'Contact (vCard)',
    event: 'Appointment',
    tel: 'Telephone number',
    sepa: 'SEPA transfer',
  },
  field: {
    wifi: {
      ssid: 'Network name (SSID)',
      security: 'Security',
      password: 'Password',
      hidden: 'Hidden network',
    },
    vcard: {
      given: 'First name',
      family: 'Last name',
      org: 'Organisation',
      title: 'Job title',
      phone: 'Telephone',
      email: 'Email address',
      url: 'Website',
      street: 'Street and number',
      postal: 'Postal code',
      city: 'City',
      country: 'Country',
      note: 'Note',
    },
    event: {
      title: 'Title',
      allDay: 'All day',
      start: 'Start',
      end: 'End',
      location: 'Location',
      description: 'Description',
    },
    tel: { number: 'Telephone number' },
    sepa: {
      name: 'Recipient name',
      iban: 'IBAN',
      bic: 'BIC',
      amount: 'Amount in euro',
      remittance: 'Reference',
    },
  },
  hint: {
    wifiPassword: 'Not needed for an open network.',
    sepaBic: 'Optional. Within the euro area the IBAN is enough.',
    sepaAmount: 'Optional. A comma or a dot, at most two decimals.',
    telNumber: 'With country code, for example +49 151 1234567.',
    eventEnd: 'Optional.',
  },
  option: {
    WPA: 'WPA or WPA2 or WPA3',
    WEP: 'WEP',
    nopass: 'None (open network)',
  },
  error: {
    required: 'This field is required.',
    nameRequired: 'Enter a first or a last name.',
    control: 'Remove the line break or control character.',
    tooLong: 'At most {max} characters.',
    tooShort: 'At least {min} characters.',
    format: 'This is not a valid value for this field.',
    ibanChecksum: 'The check digits of this IBAN are wrong. Check for a typing error.',
    amountRange: 'The amount must be at least 0.01.',
    endBeforeStart: 'The end is before the start.',
    payloadTooBig: 'The whole payment text may be at most {max} bytes. Shorten the text.',
  },
  switched: {
    dropped: 'Not carried over from {from}: {fields}. It returns if you switch back.',
  },
}

const de: MessageTree = {
  kind: {
    label: 'Was der Code enthält',
    hint: 'Ein geführtes Formular baut den Text im Format, das Scanner erwarten.',
    text: 'Freier Text',
    wifi: 'WLAN',
    vcard: 'Kontakt (vCard)',
    event: 'Termin',
    tel: 'Telefonnummer',
    sepa: 'SEPA-Überweisung',
  },
  field: {
    wifi: {
      ssid: 'Netzwerkname (SSID)',
      security: 'Verschlüsselung',
      password: 'Passwort',
      hidden: 'Verstecktes Netzwerk',
    },
    vcard: {
      given: 'Vorname',
      family: 'Nachname',
      org: 'Organisation',
      title: 'Position',
      phone: 'Telefon',
      email: 'E-Mail-Adresse',
      url: 'Website',
      street: 'Straße und Hausnummer',
      postal: 'Postleitzahl',
      city: 'Ort',
      country: 'Land',
      note: 'Notiz',
    },
    event: {
      title: 'Titel',
      allDay: 'Ganztägig',
      start: 'Beginn',
      end: 'Ende',
      location: 'Ort',
      description: 'Beschreibung',
    },
    tel: { number: 'Telefonnummer' },
    sepa: {
      name: 'Name des Empfängers',
      iban: 'IBAN',
      bic: 'BIC',
      amount: 'Betrag in Euro',
      remittance: 'Verwendungszweck',
    },
  },
  hint: {
    wifiPassword: 'Bei einem offenen Netzwerk nicht nötig.',
    sepaBic: 'Optional. Im Euroraum genügt die IBAN.',
    sepaAmount: 'Optional. Komma oder Punkt, höchstens zwei Nachkommastellen.',
    telNumber: 'Mit Ländervorwahl, zum Beispiel +49 151 1234567.',
    eventEnd: 'Optional.',
  },
  option: {
    WPA: 'WPA, WPA2 oder WPA3',
    WEP: 'WEP',
    nopass: 'Keine (offenes Netzwerk)',
  },
  error: {
    required: 'Dieses Feld ist erforderlich.',
    nameRequired: 'Geben Sie einen Vor- oder Nachnamen ein.',
    control: 'Entfernen Sie den Zeilenumbruch oder das Steuerzeichen.',
    tooLong: 'Höchstens {max} Zeichen.',
    tooShort: 'Mindestens {min} Zeichen.',
    format: 'Das ist kein gültiger Wert für dieses Feld.',
    ibanChecksum: 'Die Prüfziffern dieser IBAN stimmen nicht. Prüfen Sie auf Tippfehler.',
    amountRange: 'Der Betrag muss mindestens 0,01 betragen.',
    endBeforeStart: 'Das Ende liegt vor dem Beginn.',
    payloadTooBig:
      'Der gesamte Zahlungstext darf höchstens {max} Byte lang sein. Kürzen Sie den Text.',
  },
  switched: {
    dropped: 'Nicht übernommen aus {from}: {fields}. Es kehrt zurück, wenn Sie zurückwechseln.',
  },
}

export const messages: Record<string, MessageTree> = {
  en: { qarr: en },
  de: { qarr: de },
}

type Named = Record<string, string | number>

function english(key: string, named?: Named): string {
  let node: string | MessageTree | undefined = en
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined
  }
  if (typeof node !== 'string') return key
  return node.replace(/\{(\w+)\}/g, (match, name: string) =>
    named && name in named ? String(named[name]) : match,
  )
}

/**
 * The page's own texts. With the language layer installed they follow its
 * language; without one, as in a test that mounts a single component, they
 * are English, the way govue's own components answer.
 */
export function useQarrText(): { t: (key: string, named?: Named) => string; locale: () => string } {
  const state = inject(languageKey, null)
  return {
    t: (key, named) => (state ? state.t(`qarr.${key}`, named) : english(key, named)),
    locale: () => state?.locale.value ?? 'en',
  }
}
