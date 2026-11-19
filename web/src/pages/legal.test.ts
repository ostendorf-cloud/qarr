// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { createGovueI18n } from '@ostendorf-cloud/govue'
import { render, screen, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import ImprintPage from './ImprintPage.vue'
import PrivacyPage from './PrivacyPage.vue'

type Locale = 'de' | 'en'

function show(page: typeof ImprintPage, locale: Locale) {
  return render(page, { global: { plugins: [createGovueI18n({ locale })] } })
}

const locales: Locale[] = ['de', 'en']

// What no imprint of this site may carry.
const DISPUTE_RESOLUTION =
  /Verbraucherstreitbeilegung|Verbraucherschlichtung|dispute resolution|arbitration/i

describe.each(locales)('the imprint in %s', (locale) => {
  it('names the operator, the contact and the VAT ID', () => {
    show(ImprintPage, locale)
    const main = screen.getByRole('main')

    expect(main).toHaveTextContent('Simon Ostendorf')
    expect(main).toHaveTextContent('Frankenstr. 8')
    expect(main).toHaveTextContent('52070 Aachen')
    expect(main).toHaveTextContent('+49 1573 0971784')
    expect(within(main).getByRole('link', { name: 'info@qarr.de' })).toHaveAttribute(
      'href',
      'mailto:info@qarr.de',
    )
    expect(main).toHaveTextContent('DE362164357')
  })

  it('has one h1 and no dispute resolution section', () => {
    show(ImprintPage, locale)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(DISPUTE_RESOLUTION)
  })

  it('links the imprint and the privacy page of its language in the footer', () => {
    show(ImprintPage, locale)
    const footer = screen.getByRole('contentinfo')

    expect(footer.querySelector(`a[href="/${locale}/imprint"]`)).not.toBeNull()
    expect(footer.querySelector(`a[href="/${locale}/privacy"]`)).not.toBeNull()
    expect(footer.querySelector('a[href$="/terms"]')).toBeNull()
  })
})

describe.each(locales)('the privacy page in %s', (locale) => {
  it('names the controller', () => {
    show(PrivacyPage, locale)
    const main = screen.getByRole('main')

    expect(main).toHaveTextContent('Simon Ostendorf, Frankenstr. 8, 52070 Aachen')
    expect(within(main).getByRole('link', { name: 'info@qarr.de' })).toBeVisible()
  })

  it('says the content of a code stays in the browser and the fragment is never sent', () => {
    show(PrivacyPage, locale)
    const text = screen.getByRole('main').textContent ?? ''

    const fragment = locale === 'de' ? /nach dem #/ : /after\s+the #/
    expect(text).toMatch(fragment)
    const history = locale === 'de' ? /auch im\s+Verlauf/ : /including its\s+history/
    expect(text).toMatch(history)
  })

  it('says the guided forms stay in the browser too, naming a password and an IBAN', () => {
    show(PrivacyPage, locale)
    const text = (screen.getByRole('main').textContent ?? '').replace(/\s+/g, ' ')

    if (locale === 'de') {
      expect(text).toMatch(/geführten Formulare.*WLAN-Passwort.*IBAN.*nicht an den Server/)
    } else {
      expect(text).toMatch(/guided forms.*WiFi password.*IBAN.*not sent to the server/)
    }
  })

  it('says the guided entries are part of the address, kept by a copied link and the history', () => {
    show(PrivacyPage, locale)
    const text = (screen.getByRole('main').textContent ?? '').replace(/\s+/g, ' ')

    if (locale === 'de') {
      expect(text).toMatch(/Teil der Adresse.*Klartext.*kopierte Adresse.*Verlauf/)
      expect(text).not.toMatch(/solange das Formular ausgefüllt ist/)
    } else {
      expect(text).toMatch(/part of the address.*plain text.*copied address.*history/)
      expect(text).not.toMatch(/for as long as the form is filled in/)
    }
  })

  it('states the counting fields, the opt in and the signals it honours', () => {
    show(PrivacyPage, locale)
    const main = screen.getByRole('main')
    const text = main.textContent ?? ''

    expect(text).toMatch(/Umami/)
    expect(text).toMatch(/Do Not Track/)
    expect(text).toMatch(/Global Privacy Control/)
    expect(text).toMatch(/User-?[Aa]gent|user agent/)
    expect(main.querySelectorAll('li')).toHaveLength(4)
    expect(text).toMatch(/IPv4/)
    expect(text).toMatch(/IPv6/)
    expect(text).toMatch(locale === 'de' ? /nur, wenn sein Betreiber/ : /only if its operator/)
    expect(text).toMatch(locale === 'de' ? /kein Cookie/ : /no cookie/)
  })

  it('states no retention period, legal basis or hosting provider, none is known', () => {
    show(PrivacyPage, locale)
    const text = screen.getByRole('main').textContent ?? ''

    expect(text).not.toMatch(/Rechtsgrundlage|Art\. 6|legal basis|Article 6/i)
    expect(text).not.toMatch(/Speicherdauer|Aufbewahrung|retention|retained for/i)
    expect(text).not.toMatch(
      /Hetzner|AWS|Amazon|Google|Cloudflare|hosting provider|Hosting-Anbieter/i,
    )
    expect(text).not.toMatch(/\[|TODO|TBD|placeholder|Platzhalter/i)
  })

  it('has one h1, the rights of data subjects and no dispute resolution text', () => {
    show(PrivacyPage, locale)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('main').textContent).toMatch(
      locale === 'de' ? /Aufsichtsbehörde/ : /supervisory authority/,
    )
    expect(document.body.textContent).not.toMatch(DISPUTE_RESOLUTION)
  })

  it('links the imprint and the privacy page of its language in the footer', () => {
    show(PrivacyPage, locale)
    const footer = screen.getByRole('contentinfo')

    expect(footer.querySelector(`a[href="/${locale}/imprint"]`)).not.toBeNull()
    expect(footer.querySelector(`a[href="/${locale}/privacy"]`)).not.toBeNull()
  })
})

describe('the English pages', () => {
  it.each([
    ['imprint', ImprintPage],
    ['privacy', PrivacyPage],
  ] as const)('say the German %s is binding and link it', (page, component) => {
    show(component, 'en')

    expect(screen.getByRole('main')).toHaveTextContent(
      'The German version is the legally binding one',
    )
    expect(screen.getByRole('link', { name: 'View the German version' })).toHaveAttribute(
      'href',
      `/de/${page}`,
    )
  })
})
