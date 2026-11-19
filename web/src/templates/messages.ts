// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * The texts of the template panel, German and English. The language comes
 * from govue's language layer; without one, as in a test that mounts the
 * panel alone, the texts are English, the way govue's own components answer.
 *
 * The limits in the texts are interpolated from schema.ts, so a text and the
 * code never name two numbers.
 */

import { inject } from 'vue'
import { languageKey } from '@ostendorf-cloud/govue'

type Tree = { [key: string]: string | Tree }

const en: Tree = {
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
  exported: 'Exported {count} templates.',
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
}

const de: Tree = {
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
  exported: '{count} Vorlagen exportiert.',
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
}

type Named = Record<string, string | number>

function lookup(tree: Tree, key: string): string | null {
  let node: string | Tree | undefined = tree
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined
  return typeof node === 'string' ? node : null
}

export function useTemplateText(): { t: (key: string, named?: Named) => string; locale: string } {
  const state = inject(languageKey, null)
  const locale = state?.locale.value === 'de' ? 'de' : 'en'
  return {
    locale,
    t(key, named) {
      const text = lookup(locale === 'de' ? de : en, key) ?? lookup(en, key) ?? key
      return text.replace(/\{(\w+)\}/g, (match, name: string) =>
        named && name in named ? String(named[name]) : match,
      )
    },
  }
}
