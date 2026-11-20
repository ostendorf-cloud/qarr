// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * qarr's own texts, merged into govue's language layer under the key `qarr`
 * (main.ts, entry-prerender.ts). The guided input and the template panel are
 * here: the rest of the start page is English only, see AGENTS.md.
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
    wifiPassword:
      'Not needed for an open network. Stays in the link in plain text. Anyone with the link can read it.',
    sepaIban: 'Stays in the link in plain text. Anyone with the link can read it.',
    sepaBic: 'Optional within the EEA, where the IBAN is enough. Required for other countries.',
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
    tooLongBytes: 'At most {max} bytes. Letters such as ü take two or more bytes.',
    tooShort: 'At least {min} characters.',
    format: 'This is not a valid value for this field.',
    ibanChecksum: 'The check digits of this IBAN are wrong. Check for a typing error.',
    amountRange: 'The amount must be at least 0.01.',
    endBeforeStart: 'The end is before the start.',
    payloadTooBig: 'The whole payment text may be at most {max} bytes. Shorten the text.',
  },
  logo: {
    sepaBlocked:
      'A SEPA code takes no logo. The EPC format fixes error correction level M, which a logo would raise. A logo you added is kept and drawn again for other types.',
  },
  templates: {
    title: 'Templates',
    intro:
      'Save the colours, the module shape and the logo under a name and use them again. Templates are stored in this browser only and are never sent anywhere.',
    unavailable:
      'This browser does not allow storing data for this page, so templates cannot be saved. The rest of the page works.',
    nameLabel: 'Template name',
    nameHint: 'Up to {max} characters. A name that is taken gets a number.',
    save: 'Save current look',
    empty: 'No templates saved yet.',
    list: 'Saved templates',
    apply: 'Apply',
    rename: 'Rename',
    renameLabel: 'New name for {name}',
    renameSave: 'Save name',
    cancel: 'Cancel',
    remove: 'Delete',
    hasLogo: 'with logo',
    export: 'Export templates',
    import: 'Import templates',
    importLabel: 'Template file',
    importHint: 'A file made by Export. Up to {size} MB.',
    stored:
      'A logo is kept as image data in this browser, at most {side} by {side} pixels. At most {max} templates are kept. Deleting a template removes its data at once.',
    saved: 'Saved as {name}.',
    applied: 'Applied {name}.',
    renamed: 'Renamed to {name}.',
    removed: 'Deleted {name}.',
    imported: 'Imported {added} templates, skipped {skipped}.',
    importedOne: 'Imported 1 template, skipped {skipped}.',
    exported: 'Exported {count} templates.',
    exportedOne: 'Exported 1 template.',
    logoSkipped: 'The logo was not applied: a SEPA code stays free of a logo.',
    error: {
      full: 'The browser has no room left for this. Delete a template and try again.',
      limit: 'At most {max} templates are kept. Delete one first.',
      name: 'Enter a name of 1 to {max} characters without line breaks.',
      format: 'This file is not a template export.',
      logo: 'This logo is too large to be stored with a template.',
      fileTooLarge: 'The file is larger than {size} MB.',
      missing: 'That template no longer exists.',
      unavailable: 'This browser does not allow storing data for this page.',
    },
  },
  page: {
    address:
      "This page's own address carries the text, colours and shape, and what you enter in a guided form, so copying it shares exactly that part of the style; it is only as private as wherever that address is pasted. A logo you add stays in this browser and never travels in the link.",
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
    wifiPassword:
      'Bei einem offenen Netzwerk nicht nötig. Bleibt im Link im Klartext. Jeder mit dem Link kann es lesen.',
    sepaIban: 'Bleibt im Link im Klartext. Jeder mit dem Link kann es lesen.',
    sepaBic: 'Im EWR optional, dort genügt die IBAN. Für andere Länder erforderlich.',
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
    tooLongBytes: 'Höchstens {max} Byte. Buchstaben wie ü belegen zwei oder mehr Byte.',
    tooShort: 'Mindestens {min} Zeichen.',
    format: 'Das ist kein gültiger Wert für dieses Feld.',
    ibanChecksum: 'Die Prüfziffern dieser IBAN stimmen nicht. Prüfen Sie auf Tippfehler.',
    amountRange: 'Der Betrag muss mindestens 0,01 betragen.',
    endBeforeStart: 'Das Ende liegt vor dem Beginn.',
    payloadTooBig:
      'Der gesamte Zahlungstext darf höchstens {max} Byte lang sein. Kürzen Sie den Text.',
  },
  logo: {
    sepaBlocked:
      'Ein SEPA-Code nimmt kein Logo auf. Das EPC-Format legt die Fehlerkorrektur auf Stufe M fest, die ein Logo anheben würde. Ein hinzugefügtes Logo bleibt erhalten und wird bei anderen Typen wieder gezeichnet.',
  },
  templates: {
    title: 'Vorlagen',
    intro:
      'Speichern Sie Farben, Modulform und Logo unter einem Namen und verwenden Sie sie wieder. Vorlagen liegen nur in diesem Browser und werden nirgendwohin gesendet.',
    unavailable:
      'Dieser Browser erlaubt für diese Seite kein Speichern von Daten, daher können keine Vorlagen gespeichert werden. Der Rest der Seite funktioniert.',
    nameLabel: 'Name der Vorlage',
    nameHint: 'Höchstens {max} Zeichen. Ein vergebener Name bekommt eine Nummer.',
    save: 'Aktuelles Aussehen speichern',
    empty: 'Noch keine Vorlagen gespeichert.',
    list: 'Gespeicherte Vorlagen',
    apply: 'Anwenden',
    rename: 'Umbenennen',
    renameLabel: 'Neuer Name für {name}',
    renameSave: 'Namen speichern',
    cancel: 'Abbrechen',
    remove: 'Löschen',
    hasLogo: 'mit Logo',
    export: 'Vorlagen exportieren',
    import: 'Vorlagen importieren',
    importLabel: 'Vorlagen-Datei',
    importHint: 'Eine Datei aus dem Export. Bis zu {size} MB.',
    stored:
      'Ein Logo wird als Bilddaten in diesem Browser gespeichert, höchstens {side} mal {side} Pixel. Es bleiben höchstens {max} Vorlagen. Das Löschen einer Vorlage entfernt ihre Daten sofort.',
    saved: 'Gespeichert als {name}.',
    applied: '{name} angewendet.',
    renamed: 'Umbenannt in {name}.',
    removed: '{name} gelöscht.',
    imported: '{added} Vorlagen importiert, {skipped} übersprungen.',
    importedOne: '1 Vorlage importiert, {skipped} übersprungen.',
    exported: '{count} Vorlagen exportiert.',
    exportedOne: '1 Vorlage exportiert.',
    logoSkipped: 'Das Logo wurde nicht angewendet: Ein SEPA-Code bleibt ohne Logo.',
    error: {
      full: 'Der Browser hat dafür keinen Platz mehr. Löschen Sie eine Vorlage und versuchen Sie es erneut.',
      limit: 'Es bleiben höchstens {max} Vorlagen. Löschen Sie zuerst eine.',
      name: 'Geben Sie einen Namen mit 1 bis {max} Zeichen ohne Zeilenumbruch ein.',
      format: 'Diese Datei ist kein Vorlagen-Export.',
      logo: 'Dieses Logo ist zu groß, um mit einer Vorlage gespeichert zu werden.',
      fileTooLarge: 'Die Datei ist größer als {size} MB.',
      missing: 'Diese Vorlage gibt es nicht mehr.',
      unavailable: 'Dieser Browser erlaubt für diese Seite kein Speichern von Daten.',
    },
  },
  page: {
    address:
      'Die Adresse dieser Seite trägt den Text, die Farben und die Form sowie Ihre Eingaben in einem geführten Formular. Wer die Adresse kopiert, teilt genau das. Sie ist nur so privat wie der Ort, an den Sie sie einfügen. Ein Logo, das Sie hinzufügen, bleibt in diesem Browser und steht nie in der Adresse.',
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
